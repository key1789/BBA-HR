"use server";

import { getSessionContext } from "@/lib/auth-context";
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

export async function createDailySubmissionAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || (active.role !== "crew" && active.role !== "admin_apotek")) {
    return;
  }

  const submissionDate = formData.get("submissionDate")?.toString();
  const shiftLabel = formData.get("shiftLabel")?.toString() ?? "general";
  const omzetTotal = Number(formData.get("omzetTotal")?.toString() ?? 0);
  const transactionTotal = Number(formData.get("transactionTotal")?.toString() ?? 0);
  const productTotal = Number(formData.get("productTotal")?.toString() ?? 0);
  const rejectedCustomerTotal = Number(formData.get("rejectedCustomerTotal")?.toString() ?? 0);
  const submitNow = formData.get("submitNow")?.toString() === "true";

  if (!submissionDate || Number.isNaN(omzetTotal)) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return;
  }

  await supabase.from("daily_submissions").upsert(
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
    },
    {
      onConflict: "tenant_apotek_id,user_id,submission_date,shift_label",
    },
  );

  await writeAuditLog(supabase, {
    tenantApotekId: active.tenantId,
    actorUserId: user.id,
    entityType: "daily_submissions",
    entityId: `${active.tenantId}:${user.id}:${submissionDate}:${shiftLabel}`,
    action: submitNow ? "submission_submitted" : "submission_draft_saved",
    newValue: {
      submissionDate,
      shiftLabel,
      omzetTotal,
      transactionTotal,
      productTotal,
      rejectedCustomerTotal,
      status: submitNow ? "submitted" : "draft",
    },
  });

  revalidatePath("/crew/input-harian");
  revalidatePath("/admin/input-harian");
}

export async function verifySubmissionAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || (active.role !== "admin_apotek" && active.role !== "super_admin_bba")) {
    return;
  }

  const submissionId = formData.get("submissionId")?.toString();
  const action = formData.get("action")?.toString();
  const errorCode = formData.get("errorCode")?.toString() || null;
  const note = formData.get("note")?.toString() || null;

  if (!submissionId || !action) {
    return;
  }

  const allowedActions = ["approve", "reject", "edit_directly"];
  if (!allowedActions.includes(action)) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return;
  }

  await supabase.from("submission_verifications").insert({
    submission_id: submissionId,
    action,
    error_code: errorCode,
    note,
    acted_by_user_id: user.id,
  });

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

  if (!active || (active.role !== "admin_apotek" && active.role !== "super_admin_bba")) {
    return redirect(
      verificationPath({ ...baseParams, feedback: "error", message: "access_denied" }),
    );
  }

  if (!["approve", "reject"].includes(bulkAction)) {
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
          note: isReject ? "bulk_reject" : "bulk_approve",
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
      message: isReject ? "bulk_rejected" : "bulk_approved",
      count: String(eligibleIds.length),
    }),
  );
}
