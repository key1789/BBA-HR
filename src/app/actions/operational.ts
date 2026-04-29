"use server";

import { getSessionContext } from "@/lib/auth-context";
import { writeAuditLog } from "@/lib/audit-log";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
