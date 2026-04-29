"use server";

import { getSessionContext } from "@/lib/auth-context";
import { writeAuditLog } from "@/lib/audit-log";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type FeedbackStatus = "success" | "error";

function buildPathWithQuery(
  pathname: string,
  query: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function redirectWithFeedback(
  pathname: string,
  status: FeedbackStatus,
  message: string,
  query: Record<string, string | undefined> = {},
): never {
  redirect(
    buildPathWithQuery(pathname, {
      ...query,
      feedback: status,
      message,
    }),
  );
}

export async function createExportJobAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return redirectWithFeedback("/bba/export-center", "error", "access_denied");
  }

  const exportType = formData.get("exportType")?.toString()?.trim();
  const format = formData.get("format")?.toString() ?? "csv";
  const allowedTypes = ["tasks", "candidates", "payroll"];
  const allowedFormats = ["csv", "pdf"];
  if (!exportType || !allowedTypes.includes(exportType)) {
    return redirectWithFeedback(
      "/bba/export-center",
      "error",
      "invalid_export_type",
    );
  }
  if (!allowedFormats.includes(format)) {
    return redirectWithFeedback("/bba/export-center", "error", "invalid_format");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirectWithFeedback("/bba/export-center", "error", "user_not_found");
  }

  const { data, error } = await supabase
    .from("export_jobs")
    .insert({
      tenant_apotek_id: active.tenantId,
      requested_by_user_id: user.id,
      export_type: exportType,
      format,
      status: "queued",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return redirectWithFeedback("/bba/export-center", "error", "create_failed");
  }

  await writeAuditLog(supabase, {
    tenantApotekId: active.tenantId,
    actorUserId: user.id,
    entityType: "export_jobs",
    entityId: data.id,
    action: "export_requested",
    newValue: { exportType, format },
  });

  revalidatePath("/bba/export-center");
  revalidatePath("/bba/audit-log");
  return redirectWithFeedback("/bba/export-center", "success", "export_queued");
}

export async function lockPayrollPeriodAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return redirectWithFeedback("/bba/payroll", "error", "access_denied");
  }

  const periodId = formData.get("periodId")?.toString();
  if (!periodId) {
    return redirectWithFeedback("/bba/payroll", "error", "period_required");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirectWithFeedback("/bba/payroll", "error", "user_not_found");
  }

  const { data: currentPeriod, error: currentError } = await supabase
    .from("payroll_periods")
    .select("status")
    .eq("id", periodId)
    .eq("tenant_apotek_id", active.tenantId)
    .maybeSingle();

  if (currentError || !currentPeriod?.status) {
    return redirectWithFeedback("/bba/payroll", "error", "period_not_found");
  }
  if (currentPeriod.status === "locked") {
    return redirectWithFeedback("/bba/payroll", "error", "already_locked");
  }

  const { data: updatedPeriod, error: updateError } = await supabase
    .from("payroll_periods")
    .update({ status: "locked" })
    .eq("id", periodId)
    .eq("tenant_apotek_id", active.tenantId)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedPeriod?.id) {
    return redirectWithFeedback("/bba/payroll", "error", "lock_failed");
  }

  await writeAuditLog(supabase, {
    tenantApotekId: active.tenantId,
    actorUserId: user.id,
    entityType: "payroll_periods",
    entityId: periodId,
    action: "payroll_locked",
  });

  revalidatePath("/bba/payroll");
  revalidatePath("/bba/audit-log");
  return redirectWithFeedback("/bba/payroll", "success", "period_locked");
}

export async function unlockPayrollPeriodAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return redirectWithFeedback("/bba/payroll", "error", "access_denied");
  }

  const periodId = formData.get("periodId")?.toString();
  const reason = formData.get("reason")?.toString()?.trim();
  if (!periodId || !reason) {
    return redirectWithFeedback("/bba/payroll", "error", "unlock_reason_required");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirectWithFeedback("/bba/payroll", "error", "user_not_found");
  }

  const { data: currentPeriod, error: currentError } = await supabase
    .from("payroll_periods")
    .select("status")
    .eq("id", periodId)
    .eq("tenant_apotek_id", active.tenantId)
    .maybeSingle();

  if (currentError || !currentPeriod?.status) {
    return redirectWithFeedback("/bba/payroll", "error", "period_not_found");
  }
  if (currentPeriod.status !== "locked") {
    return redirectWithFeedback("/bba/payroll", "error", "not_locked");
  }

  const { data: updatedPeriod, error: updateError } = await supabase
    .from("payroll_periods")
    .update({ status: "unlocked_by_bba_admin", notes: reason })
    .eq("id", periodId)
    .eq("tenant_apotek_id", active.tenantId)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedPeriod?.id) {
    return redirectWithFeedback("/bba/payroll", "error", "unlock_failed");
  }

  await writeAuditLog(supabase, {
    tenantApotekId: active.tenantId,
    actorUserId: user.id,
    entityType: "payroll_periods",
    entityId: periodId,
    action: "payroll_unlocked",
    newValue: { reason },
  });

  revalidatePath("/bba/payroll");
  revalidatePath("/bba/audit-log");
  return redirectWithFeedback("/bba/payroll", "success", "period_unlocked");
}

export async function updateTenantInfoAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return redirectWithFeedback("/bba/master-apotek", "error", "access_denied");
  }

  const tenantId = formData.get("tenantId")?.toString();
  const name = formData.get("name")?.toString()?.trim();
  const status = formData.get("status")?.toString();
  const basePath = buildPathWithQuery("/bba/master-apotek", { tenant: tenantId });
  if (!tenantId || !name || (status !== "active" && status !== "inactive")) {
    return redirectWithFeedback(basePath, "error", "invalid_tenant_payload", {
      scope: "tenant_info",
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirectWithFeedback(basePath, "error", "user_not_found", {
      scope: "tenant_info",
    });
  }

  const { data: updated, error } = await supabase
    .from("tenant_apotek")
    .update({ name, status })
    .eq("id", tenantId)
    .select("id")
    .maybeSingle();

  if (error || !updated?.id) {
    return redirectWithFeedback(basePath, "error", "update_failed", {
      scope: "tenant_info",
    });
  }

  await writeAuditLog(supabase, {
    tenantApotekId: tenantId,
    actorUserId: user.id,
    entityType: "tenant_apotek",
    entityId: tenantId,
    action: "tenant_updated",
    newValue: { name, status },
  });

  revalidatePath("/bba/master-apotek");
  revalidatePath("/bba/audit-log");
  return redirectWithFeedback(basePath, "success", "tenant_saved", {
    scope: "tenant_info",
  });
}

export async function upsertKpiConfigAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return redirectWithFeedback("/bba/master-apotek", "error", "access_denied");
  }

  const tenantId = formData.get("tenantId")?.toString();
  const periodMonth = Number(formData.get("periodMonth")?.toString() ?? "");
  const periodYear = Number(formData.get("periodYear")?.toString() ?? "");
  const targetOmzet = Number(formData.get("targetOmzet")?.toString() ?? 0);
  const targetAtv = Number(formData.get("targetAtv")?.toString() ?? 0);
  const targetAtu = Number(formData.get("targetAtu")?.toString() ?? 0);
  const bonusMode = formData.get("bonusMode")?.toString();
  const allowedModes = ["fixed_only", "progressive_only", "fixed_plus_progressive"];
  const basePath = buildPathWithQuery("/bba/master-apotek", { tenant: tenantId });

  if (
    !tenantId ||
    Number.isNaN(periodMonth) ||
    Number.isNaN(periodYear) ||
    periodMonth < 1 ||
    periodMonth > 12 ||
    periodYear < 2000 ||
    targetOmzet < 0 ||
    targetAtv < 0 ||
    targetAtu < 0 ||
    !bonusMode ||
    !allowedModes.includes(bonusMode)
  ) {
    return redirectWithFeedback(basePath, "error", "invalid_kpi_payload", {
      scope: "kpi",
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirectWithFeedback(basePath, "error", "user_not_found", {
      scope: "kpi",
    });
  }

  const { data: upserted, error } = await supabase
    .from("kpi_configs")
    .upsert(
      {
        tenant_apotek_id: tenantId,
        period_month: periodMonth,
        period_year: periodYear,
        target_omzet: targetOmzet,
        target_atv: targetAtv,
        target_atu: targetAtu,
        bonus_mode: bonusMode,
        bonus_config: {},
        created_by_user_id: user.id,
      },
      {
        onConflict: "tenant_apotek_id,period_month,period_year",
      },
    )
    .select("id")
    .maybeSingle();

  if (error || !upserted?.id) {
    return redirectWithFeedback(basePath, "error", "upsert_failed", {
      scope: "kpi",
    });
  }

  await writeAuditLog(supabase, {
    tenantApotekId: tenantId,
    actorUserId: user.id,
    entityType: "kpi_configs",
    entityId: upserted.id,
    action: "kpi_config_upserted",
    newValue: {
      periodMonth,
      periodYear,
      targetOmzet,
      targetAtv,
      targetAtu,
      bonusMode,
    },
  });

  revalidatePath("/bba/master-apotek");
  revalidatePath("/bba/audit-log");
  return redirectWithFeedback(basePath, "success", "kpi_saved", { scope: "kpi" });
}

export async function toggleAddonSettingAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return redirectWithFeedback("/bba/master-apotek", "error", "access_denied");
  }

  const tenantId = formData.get("tenantId")?.toString();
  const addonKey = formData.get("addonKey")?.toString();
  const isEnabled = formData.get("isEnabled")?.toString() === "true";
  const allowedKeys = [
    "produk_fokus",
    "absensi_shift",
    "review_internal",
    "review_pelanggan",
    "payroll",
  ];
  const basePath = buildPathWithQuery("/bba/master-apotek", { tenant: tenantId });
  if (!tenantId || !addonKey || !allowedKeys.includes(addonKey)) {
    return redirectWithFeedback(basePath, "error", "invalid_addon_payload", {
      scope: "addon",
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirectWithFeedback(basePath, "error", "user_not_found", {
      scope: "addon",
    });
  }

  const { data: upserted, error } = await supabase
    .from("addon_settings")
    .upsert(
      {
        tenant_apotek_id: tenantId,
        addon_key: addonKey,
        is_enabled: isEnabled,
        updated_by_user_id: user.id,
      },
      {
        onConflict: "tenant_apotek_id,addon_key",
      },
    )
    .select("id")
    .maybeSingle();

  if (error || !upserted?.id) {
    return redirectWithFeedback(basePath, "error", "toggle_failed", {
      scope: "addon",
    });
  }

  await writeAuditLog(supabase, {
    tenantApotekId: tenantId,
    actorUserId: user.id,
    entityType: "addon_settings",
    entityId: upserted.id,
    action: "addon_toggled",
    newValue: { addonKey, isEnabled },
  });

  revalidatePath("/bba/master-apotek");
  revalidatePath("/bba/audit-log");
  return redirectWithFeedback(basePath, "success", "addon_saved", {
    scope: "addon",
  });
}
