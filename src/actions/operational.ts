"use server";

import { getSessionContext } from "@/lib/auth-context";
import { getDefaultPortalPath } from "@/lib/portal";
import { writeAuditLog } from "@/lib/audit-log";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function toQueryString(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }
  return query.toString();
}

function verificationPath(params: Record<string, string | undefined>) {
  const qs = toQueryString(params);
  return qs ? `/admin/verifikasi?${qs}` : "/admin/verifikasi";
}

function inputHarianPath(role: "crew" | "admin_apotek", params: Record<string, string | undefined>) {
  const base = role === "admin_apotek" ? "/admin/input-harian" : "/crew/input-harian";
  const qs = toQueryString(params);
  return qs ? `${base}?${qs}` : base;
}

function getSubmissionPeriod(submissionDate: string): { periodMonth: number; periodYear: number } | null {
  const d = new Date(`${submissionDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return {
    periodMonth: d.getMonth() + 1,
    periodYear: d.getFullYear(),
  };
}

export async function createDailySubmissionAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || (active.role !== "crew" && active.role !== "admin_apotek")) {
    return;
  }

  const toNum = (v: FormDataEntryValue | null): number => {
    const raw = (v?.toString() ?? "").trim();
    if (!raw) return 0;
    // Allow "1.000" or "1,000" formatting from UI
    const normalized = raw.replace(/[^\d-]/g, "");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : NaN;
  };

  const submissionDate = formData.get("submissionDate")?.toString();
  const shiftLabel = formData.get("shiftLabel")?.toString() ?? "general";
  const omzetTotal = toNum(formData.get("omzetTotal"));
  const transactionTotal = toNum(formData.get("transactionTotal"));
  const productTotal = toNum(formData.get("productTotal"));
  const rejectedCustomerTotal = toNum(formData.get("rejectedCustomerTotal"));
  const submitNow = formData.get("submitNow")?.toString() === "true";
  const lateReason = formData.get("lateReason")?.toString() || null;
  const editSubmissionId = formData.get("editSubmissionId")?.toString() || null;
  const currentRole = active.role;

  // Extract focus products
  const focusProductIdsStr = formData.get("focusProductIds")?.toString();
  const focusProductIds = focusProductIdsStr ? focusProductIdsStr.split(',').filter(Boolean) : [];

  const numbersAreValid = [omzetTotal, transactionTotal, productTotal, rejectedCustomerTotal].every(
    (n) => Number.isFinite(n) && n >= 0,
  );
  if (!submissionDate || !numbersAreValid) {
    return redirect(
      inputHarianPath(currentRole, {
        feedback: "error",
        message: "invalid_input",
      }),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirect(
      inputHarianPath(currentRole, {
        feedback: "error",
        message: "user_not_found",
      }),
    );
  }

  const submissionPeriod = getSubmissionPeriod(submissionDate);
  if (!submissionPeriod) {
    return redirect(
      inputHarianPath(currentRole, {
        feedback: "error",
        message: "invalid_input",
      }),
    );
  }

  // Whitelist product fokus IDs dari konfigurasi tenant + periode submission.
  const { data: allowedFocusConfigs } = await supabase
    .from("product_fokus_configs")
    .select("product_id")
    .eq("tenant_apotek_id", active.tenantId)
    .eq("period_month", submissionPeriod.periodMonth)
    .eq("period_year", submissionPeriod.periodYear);

  const allowedFocusProductIds = new Set(
    (allowedFocusConfigs ?? []).map((x) => x.product_id),
  );
  const focusProductsData = focusProductIds
    .filter((id) => allowedFocusProductIds.has(id))
    .map((id) => ({
      product_id: id,
      quantity_sold: Math.max(0, Number(formData.get(`focusProduct_${id}`)?.toString() ?? 0)),
    }))
    .filter((row) => Number.isFinite(row.quantity_sold));

  const { data: existingSubmission } = await supabase
    .from("daily_submissions")
    .select("id, status")
    .eq("tenant_apotek_id", active.tenantId)
    .eq("user_id", user.id)
    .eq("submission_date", submissionDate)
    .eq("shift_label", shiftLabel)
    .maybeSingle();

  if (existingSubmission?.status === "approved") {
    return redirect(
      inputHarianPath(currentRole, {
        feedback: "error",
        message: "approved_locked",
      }),
    );
  }

  // Prevent accidental overwrite: duplicate date+shift must use explicit edit mode.
  if (existingSubmission && (!editSubmissionId || editSubmissionId !== existingSubmission.id)) {
    return redirect(
      inputHarianPath(currentRole, {
        feedback: "error",
        message: "duplicate_exists",
      }),
    );
  }

  const { data: submission, error: submissionError } = await supabase.from("daily_submissions").upsert(
    {
      tenant_apotek_id: active.tenantId,
      user_id: user.id,
      submission_date: submissionDate,
      shift_label: shiftLabel,
      omzet_total: omzetTotal,
      transaction_total: transactionTotal,
      product_total: productTotal,
      rejected_customer_total: rejectedCustomerTotal,
      status: submitNow ? "submitted" : "draft",
      submitted_at: submitNow ? new Date().toISOString() : null,
      late_reason: lateReason,
    },
    {
      onConflict: "tenant_apotek_id,user_id,submission_date,shift_label",
    },
  ).select('id').single();

  if (submissionError || !submission) {
    return redirect(
      inputHarianPath(currentRole, {
        feedback: "error",
        message: "save_failed",
      }),
    );
  }

  if (focusProductsData.length > 0) {
    const productsToUpsert = focusProductsData.map(fp => ({
      tenant_apotek_id: active.tenantId,
      submission_id: submission.id,
      product_id: fp.product_id,
      quantity_sold: fp.quantity_sold
    }));

    const { error: focusUpsertError } = await supabase.from("daily_submission_products").upsert(
      productsToUpsert,
      { onConflict: "submission_id,product_id" }
    );
    if (focusUpsertError) {
      return redirect(
        inputHarianPath(currentRole, {
          feedback: "error",
          message: "focus_save_failed",
        }),
      );
    }
  }

  await writeAuditLog(supabase, {
    tenantApotekId: active.tenantId,
    actorUserId: user.id,
    entityType: "daily_submissions",
    entityId: submission?.id ?? `${active.tenantId}:${user.id}:${submissionDate}:${shiftLabel}`,
    action: submitNow ? "submission_submitted" : "submission_draft_saved",
    newValue: {
      submissionDate,
      shiftLabel,
      omzetTotal,
      transactionTotal,
      productTotal,
      rejectedCustomerTotal,
      status: submitNow ? "submitted" : "draft",
      lateReason,
      focusProductsData
    },
  });

  revalidatePath("/crew/input-harian");
  revalidatePath("/admin/input-harian");
  revalidatePath(getDefaultPortalPath(currentRole));
  return redirect(
    inputHarianPath(currentRole, {
      feedback: "success",
      message:
        existingSubmission ? "submission_updated" : submitNow ? "submission_submitted" : "draft_saved",
    }),
  );
}

export async function verifySubmissionAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  const currentPage = formData.get("page")?.toString() ?? "1";
  const selectedStatus = formData.get("status")?.toString() ?? "";
  const from = formData.get("from")?.toString() ?? "";
  const to = formData.get("to")?.toString() ?? "";
  const baseParams = {
    page: currentPage,
    status: selectedStatus || undefined,
    from: from || undefined,
    to: to || undefined,
  };
  if (!active || active.role !== "admin_apotek") {
    return redirect(
      verificationPath({ ...baseParams, feedback: "error", message: "access_denied" }),
    );
  }

  const encoded = formData.get("verification")?.toString() ?? "";
  const [encodedSubmissionId, encodedAction] = encoded.split(":");
  const submissionId = encodedSubmissionId || formData.get("submissionId")?.toString();
  const action = encodedAction || formData.get("action")?.toString();
  const errorCode =
    formData.get("errorCode")?.toString() || (action === "approve" ? null : "verification_issue");
  const note = formData.get("note")?.toString() || null;

  if (!submissionId || !action) {
    return redirect(
      verificationPath({ ...baseParams, feedback: "error", message: "single_invalid_payload" }),
    );
  }

  const allowedActions = ["approve", "reject", "edit_directly"];
  if (!allowedActions.includes(action)) {
    return redirect(
      verificationPath({ ...baseParams, feedback: "error", message: "single_action_invalid" }),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirect(
      verificationPath({ ...baseParams, feedback: "error", message: "user_not_found" }),
    );
  }

  const { data: eligibleSubmission } = await supabase
    .from("daily_submissions")
    .select("id")
    .eq("id", submissionId)
    .eq("tenant_apotek_id", active.tenantId)
    .in("status", ["submitted", "edited_by_admin", "reject"])
    .maybeSingle();
  if (!eligibleSubmission) {
    return redirect(
      verificationPath({ ...baseParams, feedback: "error", message: "single_not_eligible" }),
    );
  }

  const { error: insertError } = await supabase.from("submission_verifications").insert({
    submission_id: submissionId,
    action,
    error_code: errorCode,
    note,
    acted_by_user_id: user.id,
  });
  if (insertError) {
    return redirect(
      verificationPath({ ...baseParams, feedback: "error", message: "single_insert_failed" }),
    );
  }

  await writeAuditLog(supabase, {
    tenantApotekId: active.tenantId,
    actorUserId: user.id,
    entityType: "submission_verifications",
    entityId: submissionId,
    action: `submission_${action}`,
    newValue: {
      action,
      errorCode,
      note,
    },
  });

  revalidatePath("/admin/verifikasi");
  revalidatePath("/crew/riwayat-input");
  revalidatePath("/owner/laporan");
  return redirect(
    verificationPath({
      ...baseParams,
      feedback: "success",
      message: "single_verified",
      action,
    }),
  );
}

export async function bulkVerifySubmissionsAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  const currentPage = formData.get("page")?.toString() ?? "1";
  const selectedStatus = formData.get("status")?.toString() ?? "";
  const from = formData.get("from")?.toString() ?? "";
  const to = formData.get("to")?.toString() ?? "";
  const bulkAction = formData.get("bulkAction")?.toString() ?? "approve";
  const baseParams = {
    page: currentPage,
    status: selectedStatus || undefined,
    from: from || undefined,
    to: to || undefined,
  };

  if (!active || active.role !== "admin_apotek") {
    return redirect(
      verificationPath({ ...baseParams, feedback: "error", message: "access_denied" }),
    );
  }

  if (!["approve", "reject", "edit_directly"].includes(bulkAction)) {
    return redirect(
      verificationPath({ ...baseParams, feedback: "error", message: "bulk_action_invalid" }),
    );
  }

  const selectedIds = Array.from(
    new Set(
      formData
        .getAll("submissionIds")
        .map((item) => item.toString().trim())
        .filter(Boolean),
    ),
  );

  if (selectedIds.length === 0) {
    return redirect(verificationPath({ ...baseParams, feedback: "error", message: "bulk_empty" }));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirect(
      verificationPath({ ...baseParams, feedback: "error", message: "user_not_found" }),
    );
  }

  const { data: eligibleRows, error: fetchError } = await supabase
    .from("daily_submissions")
    .select("id")
    .eq("tenant_apotek_id", active.tenantId)
    .in("id", selectedIds)
    .in("status", ["submitted", "edited_by_admin", "reject"]);

  if (fetchError) {
    return redirect(
      verificationPath({ ...baseParams, feedback: "error", message: "bulk_fetch_failed" }),
    );
  }

  const eligibleIds = (eligibleRows ?? []).map((row) => row.id);
  if (eligibleIds.length === 0) {
    return redirect(
      verificationPath({ ...baseParams, feedback: "error", message: "bulk_none_eligible" }),
    );
  }

  const isReject = bulkAction === "reject";
  const isEditDirectly = bulkAction === "edit_directly";
  const { error: insertError } = await supabase.from("submission_verifications").insert(
    eligibleIds.map((submissionId) => ({
      submission_id: submissionId,
      action: bulkAction,
      error_code: isReject ? "verification_issue" : null,
      note: isReject ? "bulk_reject" : isEditDirectly ? "bulk_edit_directly" : "bulk_approve",
      acted_by_user_id: user.id,
    })),
  );

  if (insertError) {
    return redirect(
      verificationPath({ ...baseParams, feedback: "error", message: "bulk_insert_failed" }),
    );
  }

  await Promise.all(
    eligibleIds.map((submissionId) =>
      writeAuditLog(supabase, {
        tenantApotekId: active.tenantId,
        actorUserId: user.id,
        entityType: "submission_verifications",
        entityId: submissionId,
        action: `submission_${bulkAction}`,
        newValue: {
          action: bulkAction,
          note: isReject ? "bulk_reject" : isEditDirectly ? "bulk_edit_directly" : "bulk_approve",
        },
      }),
    ),
  );

  revalidatePath("/admin/verifikasi");
  revalidatePath("/crew/riwayat-input");
  revalidatePath("/owner/laporan");
  return redirect(
    verificationPath({
      ...baseParams,
      feedback: "success",
      message: isReject ? "bulk_rejected" : isEditDirectly ? "bulk_edited_directly" : "bulk_approved",
      count: String(eligibleIds.length),
    }),
  );
}

export async function bulkAssignSubmissionsAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  const currentPage = formData.get("page")?.toString() ?? "1";
  const selectedStatus = formData.get("status")?.toString() ?? "";
  const from = formData.get("from")?.toString() ?? "";
  const to = formData.get("to")?.toString() ?? "";
  const assignMode = formData.get("assignMode")?.toString() ?? "assign_unassigned";
  const baseParams = {
    page: currentPage,
    status: selectedStatus || undefined,
    from: from || undefined,
    to: to || undefined,
  };

  if (!active || active.role !== "admin_apotek") {
    return redirect(
      verificationPath({ ...baseParams, feedback: "error", message: "access_denied" }),
    );
  }

  if (!["assign_unassigned", "take_over"].includes(assignMode)) {
    return redirect(
      verificationPath({ ...baseParams, feedback: "error", message: "assign_mode_invalid" }),
    );
  }

  const selectedIds = Array.from(
    new Set(
      formData
        .getAll("submissionIds")
        .map((item) => item.toString().trim())
        .filter(Boolean),
    ),
  );

  if (selectedIds.length === 0) {
    return redirect(
      verificationPath({ ...baseParams, feedback: "error", message: "assign_selection_empty" }),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirect(
      verificationPath({ ...baseParams, feedback: "error", message: "user_not_found" }),
    );
  }

  const { data: eligibleRows, error: eligibleError } = await supabase
    .from("daily_submissions")
    .select("id")
    .eq("tenant_apotek_id", active.tenantId)
    .in("id", selectedIds)
    .in("status", ["submitted", "edited_by_admin", "reject"]);

  if (eligibleError) {
    return redirect(
      verificationPath({ ...baseParams, feedback: "error", message: "assign_fetch_failed" }),
    );
  }

  const eligibleIds = (eligibleRows ?? []).map((row) => row.id);
  if (eligibleIds.length === 0) {
    return redirect(
      verificationPath({ ...baseParams, feedback: "error", message: "assign_none_eligible" }),
    );
  }

  const { data: existingAssignments } = await supabase
    .from("submission_assignments")
    .select("submission_id, assigned_to_user_id")
    .eq("tenant_apotek_id", active.tenantId)
    .in("submission_id", eligibleIds);
  const existingMap = new Map((existingAssignments ?? []).map((row) => [row.submission_id, row]));

  const targetIds =
    assignMode === "assign_unassigned"
      ? eligibleIds.filter((id) => !existingMap.has(id))
      : eligibleIds;

  if (targetIds.length === 0) {
    return redirect(
      verificationPath({
        ...baseParams,
        feedback: "error",
        message: assignMode === "assign_unassigned" ? "assign_all_assigned" : "assign_none_eligible",
      }),
    );
  }

  const { error: upsertError } = await supabase.from("submission_assignments").upsert(
    targetIds.map((submissionId) => ({
      submission_id: submissionId,
      tenant_apotek_id: active.tenantId,
      assigned_to_user_id: user.id,
      assigned_by_user_id: user.id,
      assigned_at: new Date().toISOString(),
    })),
    { onConflict: "submission_id" },
  );
  if (upsertError) {
    return redirect(
      verificationPath({ ...baseParams, feedback: "error", message: "assign_upsert_failed" }),
    );
  }

  await Promise.all(
    targetIds.map((submissionId) =>
      writeAuditLog(supabase, {
        tenantApotekId: active.tenantId,
        actorUserId: user.id,
        entityType: "submission_assignments",
        entityId: submissionId,
        action: assignMode === "assign_unassigned" ? "submission_auto_assigned" : "submission_take_over",
        newValue: {
          submissionId,
          assignMode,
          assignedToUserId: user.id,
        },
      }),
    ),
  );

  revalidatePath("/admin/verifikasi");
  return redirect(
    verificationPath({
      ...baseParams,
      feedback: "success",
      message:
        assignMode === "assign_unassigned" ? "assign_unassigned_success" : "assign_take_over_success",
      count: String(targetIds.length),
    }),
  );
}
