"use server";

import { getSessionContext } from "@/lib/auth-context";
import { getDefaultPortalPath } from "@/lib/portal";
import { writeAuditLog } from "@/lib/audit-log";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { notifyAdmins } from "@/lib/notifications";
import { setFlashMessage } from "@/lib/flash-message";
import { getFeedbackMessage } from "@/lib/feedback-messages";

export type InputFormState = { status: "error"; message: string } | null;

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

/**
 * After a verification action, compute the page to redirect to.
 * Re-counts items using the same filters as the page query so the result is
 * consistent with the pagination the user was looking at.  If the current page
 * no longer exists (count shrank), returns "1" so the user sees the next batch
 * instead of an empty page.
 */
async function safeRedirectPage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tenantId: string,
  currentPage: string,
  selectedStatus: string,
  from: string,
  to: string,
): Promise<string> {
  const PAGE_SIZE = 15;
  let countQuery = supabase
    .from("daily_submissions")
    .select("id", { count: "exact", head: true })
    .eq("tenant_apotek_id", tenantId);
  if (selectedStatus && selectedStatus !== "all") {
    countQuery = countQuery.eq("status", selectedStatus);
  }
  if (from) countQuery = countQuery.gte("submission_date", from);
  if (to) countQuery = countQuery.lte("submission_date", to);

  const { count } = await countQuery;
  const total = count ?? 0;
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageNum = Math.max(1, Number(currentPage) || 1);
  return pageNum > maxPage ? "1" : String(pageNum);
}

function inputHarianPath(role: "crew" | "admin_apotek", params: Record<string, string | undefined>) {
  const base = role === "admin_apotek" ? "/admin/input-harian" : "/crew/input-harian";
  const qs = toQueryString(params);
  return qs ? `${base}?${qs}` : base;
}

function getSubmissionPeriod(submissionDate: string): { periodMonth: number; periodYear: number } | null {
  const parts = (submissionDate ?? "").split("-");
  const y = parseInt(parts[0] ?? "", 10);
  const m = parseInt(parts[1] ?? "", 10);
  if (!y || !m || m < 1 || m > 12) return null;
  return { periodMonth: m, periodYear: y };
}

export async function createDailySubmissionAction(
  _prevState: InputFormState,
  formData: FormData,
): Promise<InputFormState> {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "crew") {
    return null;
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
    return { status: "error", message: getFeedbackMessage("invalid_input") };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: getFeedbackMessage("user_not_found") };
  }

  const submissionPeriod = getSubmissionPeriod(submissionDate);
  if (!submissionPeriod) {
    return { status: "error", message: getFeedbackMessage("invalid_input") };
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
    return { status: "error", message: getFeedbackMessage("approved_locked") };
  }

  // Prevent accidental overwrite: duplicate date+shift must use explicit edit mode.
  if (existingSubmission && (!editSubmissionId || editSubmissionId !== existingSubmission.id)) {
    return { status: "error", message: getFeedbackMessage("duplicate_exists") };
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
    return { status: "error", message: getFeedbackMessage("save_failed") };
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
      return { status: "error", message: getFeedbackMessage("focus_save_failed") };
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

  if (submitNow) {
    const submitterName = session?.userFullName ?? user.email ?? "Crew";
    await notifyAdmins(active.tenantId, {
      type: "new_submission",
      title: "Laporan baru masuk",
      body: `${submitterName} mengirim laporan harian ${submissionDate}`,
      payload: { submissionId: submission.id, submissionDate, shiftLabel },
    });
  }

  await setFlashMessage({
    status: "success",
    message: submitNow
      ? "Laporan berhasil dikirim ke admin untuk verifikasi."
      : "Draft laporan berhasil disimpan.",
  });

  revalidatePath("/crew/input-harian");
  revalidatePath("/admin/input-harian");
  revalidatePath(getDefaultPortalPath(currentRole));
  redirect(inputHarianPath(currentRole, {}));
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
    await setFlashMessage({ status: "error", message: getFeedbackMessage("access_denied") });
    return redirect(verificationPath(baseParams));
  }

  const encoded = formData.get("verification")?.toString() ?? "";
  const [encodedSubmissionId, encodedAction] = encoded.split(":");
  const submissionId = encodedSubmissionId || formData.get("submissionId")?.toString();
  const action = encodedAction || formData.get("action")?.toString();
  const errorCode =
    formData.get("errorCode")?.toString() || (action === "approve" ? null : "verification_issue");
  const note = formData.get("note")?.toString() || null;

  if (!submissionId || !action) {
    await setFlashMessage({ status: "error", message: getFeedbackMessage("single_invalid_payload") });
    return redirect(verificationPath(baseParams));
  }

  const allowedActions = ["approve", "reject", "edit_directly"];
  if (!allowedActions.includes(action)) {
    await setFlashMessage({ status: "error", message: getFeedbackMessage("single_action_invalid") });
    return redirect(verificationPath(baseParams));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    await setFlashMessage({ status: "error", message: getFeedbackMessage("user_not_found") });
    return redirect(verificationPath(baseParams));
  }

  const { data: eligibleSubmission } = await supabase
    .from("daily_submissions")
    .select("id")
    .eq("id", submissionId)
    .eq("tenant_apotek_id", active.tenantId)
    .in("status", ["submitted", "edited_by_admin", "reject"])
    .maybeSingle();
  if (!eligibleSubmission) {
    await setFlashMessage({ status: "error", message: getFeedbackMessage("single_not_eligible") });
    return redirect(verificationPath(baseParams));
  }

  const { error: insertError } = await supabase.from("submission_verifications").insert({
    submission_id: submissionId,
    action,
    error_code: errorCode,
    note,
    acted_by_user_id: user.id,
  });
  if (insertError) {
    await setFlashMessage({ status: "error", message: getFeedbackMessage("single_insert_failed") });
    return redirect(verificationPath(baseParams));
  }

  await writeAuditLog(supabase, {
    tenantApotekId: active.tenantId,
    actorUserId: user.id,
    entityType: "submission_verifications",
    entityId: submissionId,
    action: `submission_${action}`,
    newValue: { action, errorCode, note },
  });

  revalidatePath("/admin/verifikasi");
  revalidatePath("/crew/riwayat-input");
  revalidatePath("/owner/laporan");
  await setFlashMessage({
    status: "success",
    message: `Verifikasi "${action === "approve" ? "Setujui" : "Tolak"}" berhasil diproses.`,
  });
  const redirectPage = await safeRedirectPage(supabase, active.tenantId, currentPage, selectedStatus, from, to);
  redirect(verificationPath({ ...baseParams, page: redirectPage }));
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
    await setFlashMessage({ status: "error", message: getFeedbackMessage("access_denied") });
    return redirect(verificationPath(baseParams));
  }

  if (!["approve", "reject"].includes(bulkAction)) {
    await setFlashMessage({ status: "error", message: getFeedbackMessage("bulk_action_invalid") });
    return redirect(verificationPath(baseParams));
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
    await setFlashMessage({ status: "error", message: getFeedbackMessage("bulk_empty") });
    return redirect(verificationPath(baseParams));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    await setFlashMessage({ status: "error", message: getFeedbackMessage("user_not_found") });
    return redirect(verificationPath(baseParams));
  }

  const { data: eligibleRows, error: fetchError } = await supabase
    .from("daily_submissions")
    .select("id")
    .eq("tenant_apotek_id", active.tenantId)
    .in("id", selectedIds)
    .in("status", ["submitted", "edited_by_admin", "reject"]);

  if (fetchError) {
    await setFlashMessage({ status: "error", message: getFeedbackMessage("bulk_fetch_failed") });
    return redirect(verificationPath(baseParams));
  }

  const eligibleIds = (eligibleRows ?? []).map((row) => row.id);
  if (eligibleIds.length === 0) {
    await setFlashMessage({ status: "error", message: getFeedbackMessage("bulk_none_eligible") });
    return redirect(verificationPath(baseParams));
  }

  const isReject = bulkAction === "reject";
  const { error: insertError } = await supabase.from("submission_verifications").insert(
    eligibleIds.map((submissionId) => ({
      submission_id: submissionId,
      action: bulkAction,
      error_code: isReject ? "verification_issue" : null,
      note: isReject ? "bulk_reject" : "bulk_approve",
      acted_by_user_id: user.id,
    })),
  );

  if (insertError) {
    await setFlashMessage({ status: "error", message: getFeedbackMessage("bulk_insert_failed") });
    return redirect(verificationPath(baseParams));
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
          note: isReject ? "bulk_reject" : "bulk_approve",
        },
      }),
    ),
  );

  revalidatePath("/admin/verifikasi");
  revalidatePath("/crew/riwayat-input");
  revalidatePath("/owner/laporan");
  await setFlashMessage({
    status: "success",
    message: getFeedbackMessage(isReject ? "bulk_rejected" : "bulk_approved"),
    count: eligibleIds.length,
  });
  // Bulk action processes all items on the current page — always go to page 1
  // so the user immediately sees the next batch to process.
  redirect(verificationPath({ ...baseParams, page: "1" }));
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
    await setFlashMessage({ status: "error", message: getFeedbackMessage("access_denied") });
    return redirect(verificationPath(baseParams));
  }

  if (!["assign_unassigned", "take_over"].includes(assignMode)) {
    await setFlashMessage({ status: "error", message: getFeedbackMessage("assign_mode_invalid") });
    return redirect(verificationPath(baseParams));
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
    await setFlashMessage({ status: "error", message: getFeedbackMessage("assign_selection_empty") });
    return redirect(verificationPath(baseParams));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    await setFlashMessage({ status: "error", message: getFeedbackMessage("user_not_found") });
    return redirect(verificationPath(baseParams));
  }

  const { data: eligibleRows, error: eligibleError } = await supabase
    .from("daily_submissions")
    .select("id")
    .eq("tenant_apotek_id", active.tenantId)
    .in("id", selectedIds)
    .in("status", ["submitted", "edited_by_admin", "reject"]);

  if (eligibleError) {
    await setFlashMessage({ status: "error", message: getFeedbackMessage("assign_fetch_failed") });
    return redirect(verificationPath(baseParams));
  }

  const eligibleIds = (eligibleRows ?? []).map((row) => row.id);
  if (eligibleIds.length === 0) {
    await setFlashMessage({ status: "error", message: getFeedbackMessage("assign_none_eligible") });
    return redirect(verificationPath(baseParams));
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
    await setFlashMessage({
      status: "error",
      message: getFeedbackMessage(
        assignMode === "assign_unassigned" ? "assign_all_assigned" : "assign_none_eligible",
      ),
    });
    return redirect(verificationPath(baseParams));
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
    await setFlashMessage({ status: "error", message: getFeedbackMessage("assign_upsert_failed") });
    return redirect(verificationPath(baseParams));
  }

  await Promise.all(
    targetIds.map((submissionId) =>
      writeAuditLog(supabase, {
        tenantApotekId: active.tenantId,
        actorUserId: user.id,
        entityType: "submission_assignments",
        entityId: submissionId,
        action: assignMode === "assign_unassigned" ? "submission_auto_assigned" : "submission_take_over",
        newValue: { submissionId, assignMode, assignedToUserId: user.id },
      }),
    ),
  );

  revalidatePath("/admin/verifikasi");
  await setFlashMessage({
    status: "success",
    message: getFeedbackMessage(
      assignMode === "assign_unassigned" ? "assign_unassigned_success" : "assign_take_over_success",
    ),
    count: targetIds.length,
  });
  redirect(verificationPath(baseParams));
}

/**
 * Admin mengedit nilai submission secara langsung, lalu langsung menyetujuinya.
 * Perubahan dicatat di submission_verifications (action: approve + note berisi diff),
 * dan di activity_logs untuk audit trail.
 */
export async function adminDirectEditSubmissionAction(formData: FormData) {
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
    await setFlashMessage({ status: "error", message: getFeedbackMessage("access_denied") });
    return redirect(verificationPath(baseParams));
  }

  const submissionId = formData.get("submissionId")?.toString()?.trim();
  if (!submissionId) {
    await setFlashMessage({ status: "error", message: "ID submission tidak valid." });
    return redirect(verificationPath(baseParams));
  }

  const omzetTotal = Number(formData.get("omzet_total"));
  const transactionTotal = Number(formData.get("transaction_total"));
  const productTotal = Number(formData.get("product_total"));
  const rejectedCustomerTotal = Number(formData.get("rejected_customer_total"));
  const lateReason = (formData.get("late_reason") as string | null)?.trim() || null;

  if (
    isNaN(omzetTotal) || omzetTotal < 0 ||
    isNaN(transactionTotal) || transactionTotal < 0 ||
    isNaN(productTotal) || productTotal < 0 ||
    isNaN(rejectedCustomerTotal) || rejectedCustomerTotal < 0
  ) {
    await setFlashMessage({ status: "error", message: "Nilai tidak valid. Semua angka harus non-negatif." });
    return redirect(verificationPath(baseParams));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    await setFlashMessage({ status: "error", message: getFeedbackMessage("user_not_found") });
    return redirect(verificationPath(baseParams));
  }

  // Fetch existing values + eligibility check
  const { data: existing } = await supabase
    .from("daily_submissions")
    .select("id, omzet_total, transaction_total, product_total, rejected_customer_total, late_reason")
    .eq("id", submissionId)
    .eq("tenant_apotek_id", active.tenantId)
    .in("status", ["submitted", "edited_by_admin", "reject"])
    .maybeSingle();

  if (!existing) {
    await setFlashMessage({ status: "error", message: getFeedbackMessage("single_not_eligible") });
    return redirect(verificationPath(baseParams));
  }

  // Build change summary for the note
  const fmt = new Intl.NumberFormat("id-ID");
  const changes: string[] = [];
  if (Number(existing.omzet_total) !== omzetTotal)
    changes.push(`omzet: ${fmt.format(Number(existing.omzet_total))}→${fmt.format(omzetTotal)}`);
  if (Number(existing.transaction_total) !== transactionTotal)
    changes.push(`transaksi: ${existing.transaction_total}→${transactionTotal}`);
  if (Number(existing.product_total) !== productTotal)
    changes.push(`produk: ${existing.product_total}→${productTotal}`);
  if (Number(existing.rejected_customer_total) !== rejectedCustomerTotal)
    changes.push(`ditolak: ${existing.rejected_customer_total}→${rejectedCustomerTotal}`);
  if ((existing.late_reason ?? "") !== (lateReason ?? ""))
    changes.push("alasan terlambat diperbarui");
  const changeNote = changes.length > 0
    ? `Edit admin: ${changes.join(", ")}`
    : "Diedit admin (tanpa perubahan nilai)";

  // INSERT approval DULU — jika gagal di sini, tidak ada data yang berubah sama sekali.
  // DB trigger akan set status → "approved". Urutan ini mencegah race condition:
  // nilai berubah tapi status tidak ter-update.
  const { error: verifyError } = await supabase.from("submission_verifications").insert({
    submission_id: submissionId,
    action: "approve",
    note: changeNote,
    acted_by_user_id: user.id,
  });

  if (verifyError) {
    await setFlashMessage({ status: "error", message: `Approval gagal dicatat: ${verifyError.message}` });
    return redirect(verificationPath(baseParams));
  }

  // Baru setelah approval tercatat, update nilai submission
  const { error: updateError } = await supabase
    .from("daily_submissions")
    .update({
      omzet_total: omzetTotal,
      transaction_total: transactionTotal,
      product_total: productTotal,
      rejected_customer_total: rejectedCustomerTotal,
      late_reason: lateReason,
    })
    .eq("id", submissionId)
    .eq("tenant_apotek_id", active.tenantId);

  if (updateError) {
    // Approval sudah tercatat, status sudah approved, tapi nilai gagal diperbarui.
    // Lebih baik dari sebaliknya (nilai berubah tapi tidak approved).
    await setFlashMessage({
      status: "error",
      message: "Status disetujui, tetapi nilai gagal diperbarui. Silakan edit ulang jika diperlukan.",
    });
    return redirect(verificationPath(baseParams));
  }

  await writeAuditLog(supabase, {
    tenantApotekId: active.tenantId,
    actorUserId: user.id,
    entityType: "daily_submissions",
    entityId: submissionId,
    action: "UPDATE",
    oldValue: {
      omzet_total: existing.omzet_total,
      transaction_total: existing.transaction_total,
      product_total: existing.product_total,
      rejected_customer_total: existing.rejected_customer_total,
      late_reason: existing.late_reason,
    },
    newValue: { omzet_total: omzetTotal, transaction_total: transactionTotal, product_total: productTotal, rejected_customer_total: rejectedCustomerTotal, late_reason: lateReason },
  });

  revalidatePath("/admin/verifikasi");
  revalidatePath("/crew/riwayat-input");
  revalidatePath("/owner/laporan");
  await setFlashMessage({ status: "success", message: `Data diperbarui dan disetujui. ${changeNote}` });
  const redirectPage = await safeRedirectPage(supabase, active.tenantId, currentPage, selectedStatus, from, to);
  redirect(verificationPath({ ...baseParams, page: redirectPage }));
}
