"use server";

import { getSessionContext } from "@/lib/auth-context";
import { writeAuditLog } from "@/lib/audit-log";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createExportJobAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return;
  }

  const exportType = formData.get("exportType")?.toString();
  const format = formData.get("format")?.toString() ?? "csv";
  if (!exportType) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return;
  }

  const { data } = await supabase
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

  if (data?.id) {
    await writeAuditLog(supabase, {
      tenantApotekId: active.tenantId,
      actorUserId: user.id,
      entityType: "export_jobs",
      entityId: data.id,
      action: "export_requested",
      newValue: { exportType, format },
    });
  }

  revalidatePath("/bba/export-center");
  revalidatePath("/bba/audit-log");
}

export async function lockPayrollPeriodAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return;
  }

  const periodId = formData.get("periodId")?.toString();
  if (!periodId) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return;
  }

  const { data: currentPeriod, error: currentError } = await supabase
    .from("payroll_periods")
    .select("status")
    .eq("id", periodId)
    .eq("tenant_apotek_id", active.tenantId)
    .maybeSingle();

  if (currentError || !currentPeriod?.status || currentPeriod.status === "locked") {
    return;
  }

  const { data: updatedPeriod, error: updateError } = await supabase
    .from("payroll_periods")
    .update({ status: "locked" })
    .eq("id", periodId)
    .eq("tenant_apotek_id", active.tenantId)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedPeriod?.id) {
    return;
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
}

export async function unlockPayrollPeriodAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return;
  }

  const periodId = formData.get("periodId")?.toString();
  const reason = formData.get("reason")?.toString();
  if (!periodId || !reason) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return;
  }

  const { data: currentPeriod, error: currentError } = await supabase
    .from("payroll_periods")
    .select("status")
    .eq("id", periodId)
    .eq("tenant_apotek_id", active.tenantId)
    .maybeSingle();

  if (currentError || currentPeriod?.status !== "locked") {
    return;
  }

  const { data: updatedPeriod, error: updateError } = await supabase
    .from("payroll_periods")
    .update({ status: "unlocked_by_bba_admin", notes: reason })
    .eq("id", periodId)
    .eq("tenant_apotek_id", active.tenantId)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedPeriod?.id) {
    return;
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
}

export async function updateTenantInfoAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return;
  }

  const tenantId = formData.get("tenantId")?.toString();
  const name = formData.get("name")?.toString();
  const status = formData.get("status")?.toString();
  if (!tenantId || !name || (status !== "active" && status !== "inactive")) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return;
  }

  const { data: updated, error } = await supabase
    .from("tenant_apotek")
    .update({ name, status })
    .eq("id", tenantId)
    .select("id")
    .maybeSingle();

  if (error || !updated?.id) {
    return;
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
}

export async function upsertKpiConfigAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return;
  }

  const tenantId = formData.get("tenantId")?.toString();
  const periodMonth = Number(formData.get("periodMonth")?.toString() ?? "");
  const periodYear = Number(formData.get("periodYear")?.toString() ?? "");
  const targetOmzet = Number(formData.get("targetOmzet")?.toString() ?? 0);
  const targetAtv = Number(formData.get("targetAtv")?.toString() ?? 0);
  const targetAtu = Number(formData.get("targetAtu")?.toString() ?? 0);
  const bonusMode = formData.get("bonusMode")?.toString();
  const allowedModes = ["fixed_only", "progressive_only", "fixed_plus_progressive"];

  if (
    !tenantId ||
    !periodMonth ||
    !periodYear ||
    Number.isNaN(periodMonth) ||
    Number.isNaN(periodYear) ||
    !bonusMode ||
    !allowedModes.includes(bonusMode)
  ) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return;
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
    return;
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
}

export async function toggleAddonSettingAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return;
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
  if (!tenantId || !addonKey || !allowedKeys.includes(addonKey)) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return;
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
    return;
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
}
