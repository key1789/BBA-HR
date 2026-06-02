"use server";

import { getSessionContext, type SessionContext } from "@/lib/auth-context";
import type { BbaPortalMenuKey } from "@/lib/bba-portal-menus";
import { writeAuditLog } from "@/lib/audit-log";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { syncMonthlyAppraisalsForPeriod } from "@/lib/kpi-v2/sync-monthly-appraisals";
import { syncLeaderboardSnapshotsForPeriod } from "@/lib/kpi-v2/sync-leaderboard-snapshots";
import { createDefaultKpiV2Config, mergeKpiConfigs } from "@/lib/kpi-v2/utils";
import type { KpiConfigV2 } from "@/lib/types/kpi-v2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isValidEmail } from "@/lib/validation";

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

function assertAnalystPortalMenu(
  session: SessionContext | null,
  menuKey: BbaPortalMenuKey,
  redirectPath: string,
): void {
  if (!session?.bbaPortalStaffRole || session.bbaPortalStaffRole !== "analyst") return;
  if (session.isGlobalSuperAdmin) return;
  if (session.bbaPortalMenuKeys?.includes(menuKey)) return;
  redirectWithFeedback(redirectPath, "error", "access_denied");
}

function resolvePayrollTenantId(
  formData: FormData,
  active: NonNullable<SessionContext["activeMembership"]>,
): string | null {
  const fromForm = formData.get("tenantId")?.toString()?.trim();
  if (fromForm) return fromForm;
  if (active.tenantId) return active.tenantId;
  return null;
}

function payrollRedirect(
  formData: FormData,
  active: NonNullable<SessionContext["activeMembership"]>,
  status: FeedbackStatus,
  message: string,
  extra: Record<string, string | undefined> = {},
): never {
  const tenantId = resolvePayrollTenantId(formData, active);
  return redirectWithFeedback("/bba/payroll", status, message, {
    tenant: tenantId ?? undefined,
    ...extra,
  });
}

export async function createExportJobAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return redirectWithFeedback("/bba/export-center", "error", "access_denied");
  }
  assertAnalystPortalMenu(session, "export", "/bba/export-center");

  const exportType = formData.get("exportType")?.toString()?.trim();
  const format = formData.get("format")?.toString() ?? "csv";
  const allowedTypes = ["payroll"];
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
  assertAnalystPortalMenu(session, "audit", "/bba/audit");

  const tenantId = resolvePayrollTenantId(formData, active);
  if (!tenantId) {
    return redirectWithFeedback("/bba/payroll", "error", "tenant_required");
  }

  const periodId = formData.get("periodId")?.toString();
  const reason = formData.get("reason")?.toString()?.trim();
  if (!periodId) {
    return redirectWithFeedback("/bba/payroll", "error", "period_required");
  }
  if (!reason || reason.length < 3) {
    return redirectWithFeedback("/bba/payroll", "error", "lock_reason_required");
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
    .eq("tenant_apotek_id", tenantId)
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
    .eq("tenant_apotek_id", tenantId)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedPeriod?.id) {
    return redirectWithFeedback("/bba/payroll", "error", "lock_failed");
  }

  const { error: lockEventError } = await supabase
    .from("payroll_unlock_events")
    .insert({
      tenant_apotek_id: tenantId,
      payroll_period_id: periodId,
      event_type: "lock",
      actor_user_id: user.id,
      reason,
    });
  if (lockEventError) {
    return redirectWithFeedback("/bba/payroll", "error", "lock_failed");
  }

  await writeAuditLog(supabase, {
    tenantApotekId: tenantId,
    actorUserId: user.id,
    entityType: "payroll_periods",
    entityId: periodId,
    action: "payroll_locked",
    newValue: { reason },
  });

  revalidatePath("/bba/payroll");
  revalidatePath("/bba/audit-log");
  return payrollRedirect(formData, active, "success", "period_locked");
}

export async function unlockPayrollPeriodAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return redirectWithFeedback("/bba/payroll", "error", "access_denied");
  }
  assertAnalystPortalMenu(session, "audit", "/bba/audit");

  const tenantId = resolvePayrollTenantId(formData, active);
  if (!tenantId) {
    return redirectWithFeedback("/bba/payroll", "error", "tenant_required");
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
    .eq("tenant_apotek_id", tenantId)
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
    .eq("tenant_apotek_id", tenantId)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedPeriod?.id) {
    return redirectWithFeedback("/bba/payroll", "error", "unlock_failed");
  }

  const { error: unlockEventError } = await supabase
    .from("payroll_unlock_events")
    .insert({
      tenant_apotek_id: tenantId,
      payroll_period_id: periodId,
      event_type: "unlock",
      actor_user_id: user.id,
      reason,
    });
  if (unlockEventError) {
    return redirectWithFeedback("/bba/payroll", "error", "unlock_failed");
  }

  await writeAuditLog(supabase, {
    tenantApotekId: tenantId,
    actorUserId: user.id,
    entityType: "payroll_periods",
    entityId: periodId,
    action: "payroll_unlocked",
    newValue: { reason },
  });

  revalidatePath("/bba/payroll");
  revalidatePath("/bba/audit-log");
  return payrollRedirect(formData, active, "success", "period_unlocked");
}

export async function recalculateMonthlyAppraisalDraftAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return redirectWithFeedback("/bba/payroll", "error", "access_denied");
  }
  assertAnalystPortalMenu(session, "audit", "/bba/audit");

  const tenantId = resolvePayrollTenantId(formData, active);
  if (!tenantId) {
    return redirectWithFeedback("/bba/payroll", "error", "tenant_required");
  }

  const periodMonth = Number(formData.get("periodMonth")?.toString() ?? "");
  const periodYear = Number(formData.get("periodYear")?.toString() ?? "");
  const mode = formData.get("mode")?.toString() === "rolling" ? "rolling" : "single";
  const monthsBackRaw = Number(formData.get("monthsBack")?.toString() ?? "1");
  const monthsBack = Number.isNaN(monthsBackRaw) ? 1 : Math.min(6, Math.max(1, monthsBackRaw));
  const reason = formData.get("reason")?.toString()?.trim() ?? "";
  if (
    Number.isNaN(periodMonth) ||
    Number.isNaN(periodYear) ||
    periodMonth < 1 ||
    periodMonth > 12 ||
    periodYear < 2000
  ) {
    return redirectWithFeedback("/bba/payroll", "error", "invalid_appraisal_period");
  }
  if (reason.length < 3) {
    return redirectWithFeedback("/bba/payroll", "error", "appraisal_reason_required");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirectWithFeedback("/bba/payroll", "error", "user_not_found");
  }

  const periods =
    mode === "rolling"
      ? Array.from({ length: monthsBack }, (_, index) => {
          const date = new Date(periodYear, periodMonth - 1 - index, 1);
          return { periodMonth: date.getMonth() + 1, periodYear: date.getFullYear() };
        })
      : [{ periodMonth, periodYear }];

  const periodResult: {
    periodMonth: number;
    periodYear: number;
    affectedUserCount: number;
    upsertedRowCount: number;
  }[] = [];

  let lastCalcVersion = "kpi";

  for (const targetPeriod of periods) {
    const { data: existingAppraisalData, error: existingAppraisalError } = await supabase
      .from("monthly_appraisals")
      .select("is_published")
      .eq("tenant_apotek_id", tenantId)
      .eq("period_month", targetPeriod.periodMonth)
      .eq("period_year", targetPeriod.periodYear);
    if (existingAppraisalError) {
      if (existingAppraisalError.code === "42P01") {
        return redirectWithFeedback("/bba/payroll", "error", "appraisal_schema_missing");
      }
      return redirectWithFeedback("/bba/payroll", "error", "appraisal_recalc_failed");
    }
    if ((existingAppraisalData ?? []).some((row) => row.is_published)) {
      if (mode === "rolling") {
        continue;
      }
      return redirectWithFeedback("/bba/payroll", "error", "appraisal_already_published");
    }

    const syncResult = await syncMonthlyAppraisalsForPeriod(supabase, {
      tenantApotekId: tenantId,
      periodMonth: targetPeriod.periodMonth,
      periodYear: targetPeriod.periodYear,
      actorUserId: user.id,
      reason,
      source: mode === "rolling" ? "payroll_recalc_rolling" : "payroll_recalc",
      preservePublishState: true,
      preserveExistingAdjustments: true,
    });

    if (syncResult.error) {
      if (syncResult.error.includes("membership crew") && syncResult.affectedUserCount === 0) {
        return redirectWithFeedback("/bba/payroll", "error", "no_crew_members");
      }
      return redirectWithFeedback("/bba/payroll", "error", "appraisal_recalc_failed");
    }
    if (syncResult.affectedUserCount === 0) {
      return redirectWithFeedback("/bba/payroll", "error", "no_crew_members");
    }

    // Non-fatal: snapshot failure should not block bonus recalculation
    const snapshotResult = await syncLeaderboardSnapshotsForPeriod(supabase, {
      tenantApotekId: tenantId,
      periodMonth: targetPeriod.periodMonth,
      periodYear: targetPeriod.periodYear,
    });
    if (snapshotResult.error) {
      console.error("syncLeaderboardSnapshotsForPeriod (recalc) failed:", snapshotResult.error);
    }

    lastCalcVersion = syncResult.calcVersion;
    periodResult.push({
      periodMonth: targetPeriod.periodMonth,
      periodYear: targetPeriod.periodYear,
      affectedUserCount: syncResult.affectedUserCount,
      upsertedRowCount: syncResult.upsertedCount,
    });
  }

  if (periodResult.length === 0) {
    return redirectWithFeedback("/bba/payroll", "error", "appraisal_recalc_skipped_all");
  }

  await writeAuditLog(supabase, {
    tenantApotekId: tenantId,
    actorUserId: user.id,
    entityType: "monthly_appraisals",
    entityId: tenantId,
    action: mode === "rolling" ? "monthly_appraisal_recalculated_bulk" : "monthly_appraisal_recalculated",
    newValue: {
      mode,
      reason,
      periods: periodResult.map((item) => `${item.periodYear}-${String(item.periodMonth).padStart(2, "0")}`),
      affectedUserCount: periodResult.reduce((sum, item) => sum + item.affectedUserCount, 0),
      upsertedRowCount: periodResult.reduce((sum, item) => sum + item.upsertedRowCount, 0),
      formula: lastCalcVersion,
    },
  });

  revalidatePath("/bba/payroll");
  revalidatePath("/bba/audit-log");
  revalidatePath("/admin/leaderboard");
  return payrollRedirect(formData, active, "success", mode === "rolling" ? "appraisal_recalculated_bulk" : "appraisal_recalculated", {
    month: String(periodMonth),
    year: String(periodYear),
  });
}

/** Alias for payroll UI / docs */
export const recalculateMonthlyAppraisalsAction = recalculateMonthlyAppraisalDraftAction;

export async function publishMonthlyAppraisalPeriodAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return redirectWithFeedback("/bba/payroll", "error", "access_denied");
  }
  assertAnalystPortalMenu(session, "audit", "/bba/audit");

  const tenantId = resolvePayrollTenantId(formData, active);
  if (!tenantId) {
    return redirectWithFeedback("/bba/payroll", "error", "tenant_required");
  }

  const periodMonth = Number(formData.get("periodMonth")?.toString() ?? "");
  const periodYear = Number(formData.get("periodYear")?.toString() ?? "");
  const reason = formData.get("reason")?.toString()?.trim() ?? "";
  if (
    Number.isNaN(periodMonth) ||
    Number.isNaN(periodYear) ||
    periodMonth < 1 ||
    periodMonth > 12 ||
    periodYear < 2000
  ) {
    return redirectWithFeedback("/bba/payroll", "error", "invalid_appraisal_period");
  }
  if (reason.length < 3) {
    return redirectWithFeedback("/bba/payroll", "error", "appraisal_reason_required");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirectWithFeedback("/bba/payroll", "error", "user_not_found");
  }

  const { data: appraisalRows, error: appraisalRowsError } = await supabase
    .from("monthly_appraisals")
    .select("id, is_published")
    .eq("tenant_apotek_id", tenantId)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear);
  if (appraisalRowsError) {
    if (appraisalRowsError.code === "42P01") {
      return redirectWithFeedback("/bba/payroll", "error", "appraisal_schema_missing");
    }
    return redirectWithFeedback("/bba/payroll", "error", "appraisal_publish_failed");
  }
  if (!appraisalRows || appraisalRows.length === 0) {
    return redirectWithFeedback("/bba/payroll", "error", "appraisal_not_found");
  }
  if (appraisalRows.every((row) => row.is_published)) {
    return redirectWithFeedback("/bba/payroll", "error", "appraisal_already_published");
  }

  const nowIso = new Date().toISOString();
  const { error: publishError } = await supabase
    .from("monthly_appraisals")
    .update({
      is_published: true,
      published_at: nowIso,
      published_by_user_id: user.id,
    })
    .eq("tenant_apotek_id", tenantId)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear)
    .eq("is_published", false);
  if (publishError) {
    return redirectWithFeedback("/bba/payroll", "error", "appraisal_publish_failed");
  }

  const { error: lockAddonError } = await supabase
    .from("monthly_addon_appraisals")
    .update({ is_locked: true })
    .eq("tenant_apotek_id", tenantId)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear);
  if (lockAddonError && lockAddonError.code !== "PGRST116") {
    return redirectWithFeedback("/bba/payroll", "error", "appraisal_publish_failed");
  }

  const { error: publishTrailError } = await supabase
    .from("monthly_appraisal_publish_events")
    .insert({
      tenant_apotek_id: tenantId,
      period_month: periodMonth,
      period_year: periodYear,
      action: "publish",
      actor_user_id: user.id,
      reason: reason || null,
    });
  if (publishTrailError) {
    return redirectWithFeedback("/bba/payroll", "error", "appraisal_publish_failed");
  }

  // Generate final leaderboard snapshot on publish — non-fatal
  const snapshotResult = await syncLeaderboardSnapshotsForPeriod(supabase, {
    tenantApotekId: tenantId,
    periodMonth,
    periodYear,
  });
  if (snapshotResult.error) {
    console.error("syncLeaderboardSnapshotsForPeriod (publish) failed:", snapshotResult.error);
  }

  await writeAuditLog(supabase, {
    tenantApotekId: tenantId,
    actorUserId: user.id,
    entityType: "monthly_appraisals",
    entityId: appraisalRows[0].id,
    action: "monthly_appraisal_published",
    newValue: { periodMonth, periodYear, reason },
  });

  revalidatePath("/bba/payroll");
  revalidatePath("/bba/audit-log");
  revalidatePath("/admin/leaderboard");
  return payrollRedirect(formData, active, "success", "appraisal_published", {
    month: String(periodMonth),
    year: String(periodYear),
  });
}

export async function unpublishMonthlyAppraisalPeriodAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return redirectWithFeedback("/bba/payroll", "error", "access_denied");
  }
  assertAnalystPortalMenu(session, "audit", "/bba/audit");

  const tenantId = resolvePayrollTenantId(formData, active);
  if (!tenantId) {
    return redirectWithFeedback("/bba/payroll", "error", "tenant_required");
  }

  const periodMonth = Number(formData.get("periodMonth")?.toString() ?? "");
  const periodYear = Number(formData.get("periodYear")?.toString() ?? "");
  const reason = formData.get("reason")?.toString()?.trim() ?? "";
  if (
    Number.isNaN(periodMonth) ||
    Number.isNaN(periodYear) ||
    periodMonth < 1 ||
    periodMonth > 12 ||
    periodYear < 2000
  ) {
    return redirectWithFeedback("/bba/payroll", "error", "invalid_appraisal_period");
  }
  if (reason.length < 3) {
    return redirectWithFeedback("/bba/payroll", "error", "appraisal_reason_required");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirectWithFeedback("/bba/payroll", "error", "user_not_found");
  }

  const { data: appraisalRows, error: appraisalRowsError } = await supabase
    .from("monthly_appraisals")
    .select("id, is_published")
    .eq("tenant_apotek_id", tenantId)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear);
  if (appraisalRowsError) {
    if (appraisalRowsError.code === "42P01") {
      return redirectWithFeedback("/bba/payroll", "error", "appraisal_schema_missing");
    }
    return redirectWithFeedback("/bba/payroll", "error", "appraisal_unpublish_failed");
  }
  if (!appraisalRows || appraisalRows.length === 0) {
    return redirectWithFeedback("/bba/payroll", "error", "appraisal_not_found");
  }
  if (appraisalRows.every((row) => !row.is_published)) {
    return redirectWithFeedback("/bba/payroll", "error", "appraisal_not_published");
  }

  const { error: unpublishError } = await supabase
    .from("monthly_appraisals")
    .update({
      is_published: false,
      published_at: null,
      published_by_user_id: null,
    })
    .eq("tenant_apotek_id", tenantId)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear)
    .eq("is_published", true);
  if (unpublishError) {
    return redirectWithFeedback("/bba/payroll", "error", "appraisal_unpublish_failed");
  }

  const { error: unlockAddonError } = await supabase
    .from("monthly_addon_appraisals")
    .update({ is_locked: false })
    .eq("tenant_apotek_id", tenantId)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear);
  if (unlockAddonError && unlockAddonError.code !== "PGRST116") {
    return redirectWithFeedback("/bba/payroll", "error", "appraisal_unpublish_failed");
  }

  const { error: unpublishTrailError } = await supabase
    .from("monthly_appraisal_publish_events")
    .insert({
      tenant_apotek_id: tenantId,
      period_month: periodMonth,
      period_year: periodYear,
      action: "unpublish",
      actor_user_id: user.id,
      reason: reason || null,
    });
  if (unpublishTrailError) {
    return redirectWithFeedback("/bba/payroll", "error", "appraisal_unpublish_failed");
  }

  await writeAuditLog(supabase, {
    tenantApotekId: tenantId,
    actorUserId: user.id,
    entityType: "monthly_appraisals",
    entityId: appraisalRows[0].id,
    action: "monthly_appraisal_unpublished",
    newValue: { periodMonth, periodYear, reason },
  });

  revalidatePath("/bba/payroll");
  revalidatePath("/bba/audit-log");
  return payrollRedirect(formData, active, "success", "appraisal_unpublished", {
    month: String(periodMonth),
    year: String(periodYear),
  });
}

export async function updateTenantInfoAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return redirectWithFeedback("/bba/master-apotek", "error", "access_denied");
  }
  assertAnalystPortalMenu(session, "branches", "/bba/branches");

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

export async function createTenantWithOwnerAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return redirectWithFeedback("/bba/master-apotek", "error", "access_denied");
  }
  assertAnalystPortalMenu(session, "branches", "/bba/branches");

  const name = formData.get("name")?.toString()?.trim();
  const code = formData.get("code")?.toString()?.trim().toUpperCase();
  const status = formData.get("status")?.toString();
  const ownerEmail = formData.get("ownerEmail")?.toString()?.trim().toLowerCase();
  const ownerFullName = formData.get("ownerFullName")?.toString()?.trim();
  const ownerPassword = formData.get("ownerPassword")?.toString() ?? "";
  if (
    !name ||
    !code ||
    (status !== "active" && status !== "inactive") ||
    !ownerEmail ||
    !isValidEmail(ownerEmail)
  ) {
    return redirectWithFeedback("/bba/master-apotek", "error", "invalid_new_tenant_payload", {
      scope: "tenant_create",
    });
  }

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) {
    return redirectWithFeedback("/bba/master-apotek", "error", "user_not_found", {
      scope: "tenant_create",
    });
  }

  const { data: createdTenant, error: createTenantError } = await supabase
    .from("tenant_apotek")
    .insert({ name, code, status })
    .select("id, code, name")
    .maybeSingle();
  if (createTenantError || !createdTenant?.id) {
    return redirectWithFeedback("/bba/master-apotek", "error", "tenant_create_failed", {
      scope: "tenant_create",
    });
  }

  await writeAuditLog(supabase, {
    tenantApotekId: createdTenant.id,
    actorUserId: actor.id,
    entityType: "tenant_apotek",
    entityId: createdTenant.id,
    action: "tenant_created",
    newValue: { name, code, status },
  });

  let adminClient;
  try {
    adminClient = createAdminClient();
  } catch {
    await supabase.from("tenant_apotek").delete().eq("id", createdTenant.id);
    return redirectWithFeedback("/bba/master-apotek", "error", "owner_setup_config_missing", {
      scope: "owner",
    });
  }

  const { data: existingOwnerUser, error: ownerUserError } = await adminClient
    .from("app_users")
    .select("id, full_name, email")
    .eq("email", ownerEmail)
    .maybeSingle();
  if (ownerUserError) {
    await supabase.from("tenant_apotek").delete().eq("id", createdTenant.id);
    return redirectWithFeedback("/bba/master-apotek", "error", "tenant_create_failed", {
      scope: "tenant_create",
    });
  }

  let ownerUserId = existingOwnerUser?.id ?? null;
  let ownerName = existingOwnerUser?.full_name ?? ownerFullName ?? "-";
  // Track whether we created a brand-new user so the rollback knows what to undo.
  let createdNewOwnerUser = false;

  if (!ownerUserId) {
    if (!ownerFullName || ownerPassword.length < 8) {
      await supabase.from("tenant_apotek").delete().eq("id", createdTenant.id);
      return redirectWithFeedback("/bba/master-apotek", "error", "owner_autocreate_payload_required", {
        scope: "tenant_create",
      });
    }

    const { data: createdAuthUser, error: createAuthError } = await adminClient.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true,
      user_metadata: {
        full_name: ownerFullName,
      },
    });
    if (createAuthError || !createdAuthUser.user?.id) {
      await supabase.from("tenant_apotek").delete().eq("id", createdTenant.id);
      return redirectWithFeedback("/bba/master-apotek", "error", "owner_create_failed", {
        scope: "owner",
      });
    }

    ownerUserId = createdAuthUser.user.id;
    ownerName = ownerFullName;
    createdNewOwnerUser = true;
    const { error: insertAppUserError } = await adminClient.from("app_users").insert({
      id: ownerUserId,
      full_name: ownerFullName,
      email: ownerEmail,
      is_active: true,
    });
    if (insertAppUserError) {
      await adminClient.auth.admin.deleteUser(ownerUserId);
      await supabase.from("tenant_apotek").delete().eq("id", createdTenant.id);
      return redirectWithFeedback("/bba/master-apotek", "error", "owner_create_failed", {
        scope: "owner",
      });
    }
  }

  const { data: existingMembership } = await adminClient
    .from("tenant_memberships")
    .select("id, is_active")
    .eq("tenant_apotek_id", createdTenant.id)
    .eq("user_id", ownerUserId)
    .eq("role", "owner")
    .maybeSingle();

  let ownerMembershipId = existingMembership?.id ?? null;
  if (existingMembership?.id && !existingMembership.is_active) {
    await adminClient
      .from("tenant_memberships")
      .update({ is_active: true })
      .eq("id", existingMembership.id);
  } else if (!existingMembership?.id) {
    const { data: insertedMembership, error: insertMembershipError } = await adminClient
      .from("tenant_memberships")
      .insert({
        tenant_apotek_id: createdTenant.id,
        user_id: ownerUserId,
        role: "owner",
        is_active: true,
      })
      .select("id")
      .maybeSingle();
    if (insertMembershipError || !insertedMembership?.id) {
      // Roll back in reverse creation order: tenant first, then newly created user records.
      await supabase.from("tenant_apotek").delete().eq("id", createdTenant.id);
      if (createdNewOwnerUser && ownerUserId) {
        // User was created in this request — clean up auth + app_users to avoid orphaned records.
        await adminClient.from("app_users").delete().eq("id", ownerUserId);
        await adminClient.auth.admin.deleteUser(ownerUserId);
      }
      return redirectWithFeedback("/bba/master-apotek", "error", "tenant_create_failed", {
        scope: "tenant_create",
      });
    }
    ownerMembershipId = insertedMembership.id;
  }

  await writeAuditLog(supabase, {
    tenantApotekId: createdTenant.id,
    actorUserId: actor.id,
    entityType: "tenant_memberships",
    entityId: ownerMembershipId ?? ownerUserId,
    action: "owner_membership_assigned",
    newValue: { ownerEmail, ownerName },
  });

  revalidatePath("/bba/master-apotek");
  revalidatePath("/bba/kelola-owner");
  revalidatePath("/bba/audit-log");
  return redirectWithFeedback(
    buildPathWithQuery("/bba/master-apotek", { tenant: createdTenant.id }),
    "success",
    "tenant_created_with_owner",
    { scope: "tenant_create" },
  );
}

export async function upsertKpiConfigAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return redirectWithFeedback("/bba/master-apotek", "error", "access_denied");
  }
  assertAnalystPortalMenu(session, "audit", "/bba/audit");

  const tenantId = formData.get("tenantId")?.toString();
  const periodMonth = Number(formData.get("periodMonth")?.toString() ?? "");
  const periodYear = Number(formData.get("periodYear")?.toString() ?? "");
  const targetOmzet = Number(formData.get("targetOmzet")?.toString() ?? 0);
  const targetAtv = Number(formData.get("targetAtv")?.toString() ?? 0);
  const targetAtu = Number(formData.get("targetAtu")?.toString() ?? 0);
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
    targetAtu < 0
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

  // Fetch existing V2 config so we don't wipe scheme/bonus settings already configured.
  const supabaseAdmin = createAdminClient();
  const { data: existingKpiRow } = await supabaseAdmin
    .from("kpi_configs")
    .select("bonus_config_v2")
    .eq("tenant_apotek_id", tenantId)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear)
    .maybeSingle();

  const existingV2 = existingKpiRow?.bonus_config_v2;
  const baseConfig =
    existingV2 && typeof existingV2 === "object" && (existingV2 as KpiConfigV2).version === "2.0"
      ? (existingV2 as KpiConfigV2)
      : createDefaultKpiV2Config();

  const bonus_config_v2 = mergeKpiConfigs(baseConfig, {
    global: {
      target_omzet: targetOmzet,
      target_atv: targetAtv,
      target_atu: targetAtu,
    },
  } as Partial<KpiConfigV2>);

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
        bonus_config: {},
        bonus_config_v2,
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
    },
  });

  revalidatePath("/bba/master-apotek");
  revalidatePath("/bba/audit-log");
  return redirectWithFeedback(basePath, "success", "kpi_saved", { scope: "kpi" });
}

export async function createOwnerAccountAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return redirectWithFeedback("/bba/kelola-owner", "error", "access_denied");
  }
  assertAnalystPortalMenu(session, "owners", "/bba/owners");

  const tenantId = formData.get("tenantId")?.toString() || undefined;
  const redirectPath =
    formData.get("redirectPath")?.toString() ||
    (tenantId ? buildPathWithQuery("/bba/master-apotek", { tenant: tenantId }) : "/bba/kelola-owner");
  const fullName = formData.get("fullName")?.toString()?.trim();
  const email = formData.get("email")?.toString()?.trim().toLowerCase();
  const password = formData.get("password")?.toString() ?? "";

  if (!fullName || !email || password.length < 8 || !isValidEmail(email)) {
    return redirectWithFeedback(redirectPath, "error", "invalid_owner_payload", {
      scope: "owner",
    });
  }

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) {
    return redirectWithFeedback(redirectPath, "error", "user_not_found", {
      scope: "owner",
    });
  }

  let adminClient;
  try {
    adminClient = createAdminClient();
  } catch {
    return redirectWithFeedback(redirectPath, "error", "owner_setup_config_missing", {
      scope: "owner",
    });
  }

  const { data: existingAppUser } = await adminClient
    .from("app_users")
    .select("id, full_name")
    .eq("email", email)
    .maybeSingle();

  let ownerUserId = existingAppUser?.id ?? null;
  let createdNewAuthUser = false;

  if (!ownerUserId) {
    const { data: createdAuthUser, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    });
    if (authError || !createdAuthUser.user?.id) {
      return redirectWithFeedback(redirectPath, "error", "owner_create_failed", {
        scope: "owner",
      });
    }
    ownerUserId = createdAuthUser.user.id;
    createdNewAuthUser = true;

    const { error: appUserInsertError } = await adminClient.from("app_users").insert({
      id: ownerUserId,
      full_name: fullName,
      email,
      is_active: true,
    });
    if (appUserInsertError) {
      await adminClient.auth.admin.deleteUser(ownerUserId);
      return redirectWithFeedback(redirectPath, "error", "owner_create_failed", {
        scope: "owner",
      });
    }
  } else if (existingAppUser && existingAppUser.full_name !== fullName) {
    await adminClient
      .from("app_users")
      .update({ full_name: fullName, is_active: true })
      .eq("id", ownerUserId);
  }

  await writeAuditLog(supabase, {
    tenantApotekId: tenantId ?? null,
    actorUserId: actor.id,
    entityType: "app_users",
    entityId: ownerUserId,
    action: createdNewAuthUser ? "owner_account_created" : "owner_account_updated",
    newValue: { email, fullName },
  });

  if (!tenantId) {
    revalidatePath("/bba/kelola-owner");
    revalidatePath("/bba/audit-log");
    return redirectWithFeedback(redirectPath, "success", "owner_created_global", { scope: "owner" });
  }

  const { data: existingMembership } = await adminClient
    .from("tenant_memberships")
    .select("id, is_active")
    .eq("tenant_apotek_id", tenantId)
    .eq("user_id", ownerUserId)
    .eq("role", "owner")
    .maybeSingle();

  if (existingMembership?.id) {
    if (!existingMembership.is_active) {
      await adminClient
        .from("tenant_memberships")
        .update({ is_active: true })
        .eq("id", existingMembership.id);
      await writeAuditLog(supabase, {
        tenantApotekId: tenantId,
        actorUserId: actor.id,
        entityType: "tenant_memberships",
        entityId: existingMembership.id,
        action: "owner_membership_reactivated",
        newValue: { email, fullName, role: "owner" },
      });
      revalidatePath("/bba/master-apotek");
      revalidatePath("/bba/kelola-owner");
      revalidatePath("/bba/audit-log");
      return redirectWithFeedback(redirectPath, "success", "owner_reactivated", { scope: "owner" });
    }
    return redirectWithFeedback(redirectPath, "error", "owner_already_exists", {
      scope: "owner",
    });
  }

  const { data: membershipInserted, error: membershipInsertError } = await adminClient
    .from("tenant_memberships")
    .insert({
      tenant_apotek_id: tenantId,
      user_id: ownerUserId,
      role: "owner",
      is_active: true,
    })
    .select("id")
    .maybeSingle();
  if (membershipInsertError || !membershipInserted?.id) {
    if (createdNewAuthUser) {
      await adminClient.from("app_users").delete().eq("id", ownerUserId);
      await adminClient.auth.admin.deleteUser(ownerUserId);
    }
    return redirectWithFeedback(redirectPath, "error", "owner_create_failed", {
      scope: "owner",
    });
  }
  await writeAuditLog(supabase, {
    tenantApotekId: tenantId,
    actorUserId: actor.id,
    entityType: "tenant_memberships",
    entityId: membershipInserted.id,
    action: "owner_membership_assigned",
    newValue: { email, fullName, role: "owner" },
  });

  revalidatePath("/bba/master-apotek");
  revalidatePath("/bba/kelola-owner");
  revalidatePath("/bba/audit-log");
  return redirectWithFeedback(redirectPath, "success", "owner_created", { scope: "owner" });
}

export async function assignOwnerToTenantAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return redirectWithFeedback("/bba/kelola-owner", "error", "access_denied");
  }
  assertAnalystPortalMenu(session, "owners", "/bba/owners");

  const email = formData.get("email")?.toString()?.trim().toLowerCase();
  const tenantId = formData.get("tenantId")?.toString();
  const redirectPath =
    formData.get("redirectPath")?.toString() || "/bba/kelola-owner";
  if (!tenantId || !email || !isValidEmail(email)) {
    return redirectWithFeedback(redirectPath, "error", "invalid_owner_payload", {
      scope: "owner",
    });
  }

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) {
    return redirectWithFeedback(redirectPath, "error", "user_not_found", {
      scope: "owner",
    });
  }

  let adminClient;
  try {
    adminClient = createAdminClient();
  } catch {
    return redirectWithFeedback(redirectPath, "error", "owner_setup_config_missing", {
      scope: "owner",
    });
  }

  const { data: ownerUser, error: ownerUserError } = await adminClient
    .from("app_users")
    .select("id, full_name, email")
    .eq("email", email)
    .maybeSingle();
  if (ownerUserError || !ownerUser?.id) {
    return redirectWithFeedback(redirectPath, "error", "owner_user_not_found", {
      scope: "owner",
    });
  }

  const { data: membership } = await adminClient
    .from("tenant_memberships")
    .select("id, is_active")
    .eq("tenant_apotek_id", tenantId)
    .eq("user_id", ownerUser.id)
    .eq("role", "owner")
    .maybeSingle();

  if (membership?.id && membership.is_active) {
    return redirectWithFeedback(redirectPath, "error", "owner_already_assigned", {
      scope: "owner",
    });
  }

  let membershipId = membership?.id;
  if (membership?.id && !membership.is_active) {
    const { error: activateError } = await adminClient
      .from("tenant_memberships")
      .update({ is_active: true })
      .eq("id", membership.id);
    if (activateError) {
      return redirectWithFeedback(redirectPath, "error", "owner_status_update_failed", {
        scope: "owner",
      });
    }
  } else if (!membership?.id) {
    const { data: insertedMembership, error: insertError } = await adminClient
      .from("tenant_memberships")
      .insert({
        tenant_apotek_id: tenantId,
        user_id: ownerUser.id,
        role: "owner",
        is_active: true,
      })
      .select("id")
      .maybeSingle();
    if (insertError || !insertedMembership?.id) {
      return redirectWithFeedback(redirectPath, "error", "owner_create_failed", {
        scope: "owner",
      });
    }
    membershipId = insertedMembership.id;
  }

  await writeAuditLog(supabase, {
    tenantApotekId: tenantId,
    actorUserId: actor.id,
    entityType: "tenant_memberships",
    entityId: membershipId ?? ownerUser.id,
    action: "owner_membership_assigned",
    newValue: { ownerEmail: ownerUser.email, ownerName: ownerUser.full_name },
  });

  revalidatePath("/bba/kelola-owner");
  revalidatePath("/bba/master-apotek");
  revalidatePath("/bba/audit-log");
  return redirectWithFeedback(redirectPath, "success", "owner_assigned", { scope: "owner" });
}

export async function toggleOwnerMembershipStatusAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return redirectWithFeedback("/bba/kelola-owner", "error", "access_denied");
  }
  assertAnalystPortalMenu(session, "owners", "/bba/owners");

  const tenantId = formData.get("tenantId")?.toString();
  const membershipId = formData.get("membershipId")?.toString();
  const nextActive = formData.get("nextActive")?.toString() === "true";
  const redirectPath =
    formData.get("redirectPath")?.toString() ||
    buildPathWithQuery("/bba/master-apotek", { tenant: tenantId });
  if (!tenantId || !membershipId) {
    return redirectWithFeedback(redirectPath, "error", "invalid_owner_payload", {
      scope: "owner",
    });
  }

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) {
    return redirectWithFeedback(redirectPath, "error", "user_not_found", {
      scope: "owner",
    });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("tenant_memberships")
    .select("id, role, is_active, user_id")
    .eq("id", membershipId)
    .eq("tenant_apotek_id", tenantId)
    .maybeSingle();

  if (membershipError || !membership?.id || membership.role !== "owner") {
    return redirectWithFeedback(redirectPath, "error", "owner_membership_not_found", {
      scope: "owner",
    });
  }

  const { error: updateError } = await supabase
    .from("tenant_memberships")
    .update({ is_active: nextActive })
    .eq("id", membershipId);
  if (updateError) {
    return redirectWithFeedback(redirectPath, "error", "owner_status_update_failed", {
      scope: "owner",
    });
  }

  await writeAuditLog(supabase, {
    tenantApotekId: tenantId,
    actorUserId: actor.id,
    entityType: "tenant_memberships",
    entityId: membershipId,
    action: "owner_membership_status_updated",
    oldValue: { isActive: membership.is_active },
    newValue: { isActive: nextActive, userId: membership.user_id },
  });

  revalidatePath("/bba/kelola-owner");
  revalidatePath("/bba/master-apotek");
  revalidatePath("/bba/audit-log");
  return redirectWithFeedback(
    redirectPath,
    "success",
    nextActive ? "owner_enabled" : "owner_disabled",
    { scope: "owner" },
  );
}

export async function resetOwnerPasswordAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return redirectWithFeedback("/bba/kelola-owner", "error", "access_denied");
  }
  assertAnalystPortalMenu(session, "owners", "/bba/owners");

  const tenantId = formData.get("tenantId")?.toString() || undefined;
  const userId = formData.get("userId")?.toString();
  const password = formData.get("password")?.toString() ?? "";
  const redirectPath =
    formData.get("redirectPath")?.toString() ||
    (tenantId ? buildPathWithQuery("/bba/master-apotek", { tenant: tenantId }) : "/bba/kelola-owner");

  if (!userId || password.length < 8) {
    return redirectWithFeedback(redirectPath, "error", "invalid_owner_payload", {
      scope: "owner",
    });
  }

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) {
    return redirectWithFeedback(redirectPath, "error", "user_not_found", {
      scope: "owner",
    });
  }

  const membershipQuery = supabase
    .from("tenant_memberships")
    .select("id, role, tenant_apotek_id")
    .eq("user_id", userId)
    .eq("role", "owner");
  const { data: membership, error: membershipError } = tenantId
    ? await membershipQuery.eq("tenant_apotek_id", tenantId).maybeSingle()
    : await membershipQuery.limit(1).maybeSingle();
  if (membershipError || !membership?.id) {
    return redirectWithFeedback(redirectPath, "error", "owner_membership_not_found", {
      scope: "owner",
    });
  }

  let adminClient;
  try {
    adminClient = createAdminClient();
  } catch {
    return redirectWithFeedback(redirectPath, "error", "owner_setup_config_missing", {
      scope: "owner",
    });
  }

  const { error: resetError } = await adminClient.auth.admin.updateUserById(userId, {
    password,
  });
  if (resetError) {
    return redirectWithFeedback(redirectPath, "error", "owner_password_reset_failed", {
      scope: "owner",
    });
  }

  await writeAuditLog(supabase, {
    tenantApotekId: membership.tenant_apotek_id,
    actorUserId: actor.id,
    entityType: "app_users",
    entityId: userId,
    action: "owner_password_reset",
    newValue: { tenantId: membership.tenant_apotek_id },
  });

  revalidatePath("/bba/kelola-owner");
  revalidatePath("/bba/master-apotek");
  revalidatePath("/bba/audit-log");
  return redirectWithFeedback(redirectPath, "success", "owner_password_reset", {
    scope: "owner",
  });
}

export async function toggleAddonSettingAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return redirectWithFeedback("/bba/master-apotek", "error", "access_denied");
  }
  assertAnalystPortalMenu(session, "branches", "/bba/branches");

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

// ─────────────────────────────────────────────────────────────────────────────
// OWNER PAYROLL WORKFLOW
// ─────────────────────────────────────────────────────────────────────────────

export async function ownerApprovePayrollAction(
  _prev: { success?: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ success?: boolean; error?: string; message?: string }> {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!session || !active || active.role !== "owner") {
    return { error: "Akses ditolak." };
  }

  const periodId = (formData.get("periodId") as string)?.trim();
  if (!periodId) return { error: "Data tidak lengkap." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Tidak terautentikasi." };

  const supabaseAdmin = createAdminClient();

  // Verify period belongs to owner's tenant
  const { data: period } = await supabaseAdmin
    .from("payroll_periods")
    .select("id, status, tenant_apotek_id")
    .eq("id", periodId)
    .maybeSingle();

  if (!period) return { error: "Data payroll tidak ditemukan." };
  if (period.tenant_apotek_id !== active.tenantId) return { error: "Akses ditolak." };
  if (period.status !== "sent_to_owner") {
    return { error: "Payroll ini tidak dalam status menunggu review." };
  }

  const now = new Date().toISOString();

  // Auto-lock: approve sekaligus lock
  const { error: updateError } = await supabaseAdmin
    .from("payroll_periods")
    .update({
      status: "locked",
      approved_by_user_id: user.id,
      approved_at: now,
      updated_at: now,
    })
    .eq("id", periodId);

  if (updateError) return { error: `Gagal menyetujui: ${updateError.message}` };

  // Log ke payroll_unlock_events sebagai audit trail
  await supabaseAdmin
    .from("payroll_unlock_events")
    .insert({
      tenant_apotek_id: active.tenantId,
      payroll_period_id: periodId,
      event_type: "lock",
      reason: "Disetujui dan dikunci oleh owner.",
      actor_user_id: user.id,
    })
    .then(() => {/* fire and forget */});

  await writeAuditLog(supabase, {
    tenantApotekId: active.tenantId,
    actorUserId: user.id,
    entityType: "payroll_periods",
    entityId: periodId,
    action: "payroll_approved_and_locked",
    newValue: { status: "locked", approved_by: user.id },
  });

  revalidatePath("/owner/payroll");
  return { success: true, message: "Payroll disetujui dan terkunci." };
}

export async function ownerRequestRevisionAction(
  _prev: { success?: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ success?: boolean; error?: string; message?: string }> {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!session || !active || active.role !== "owner") {
    return { error: "Akses ditolak." };
  }

  const periodId = (formData.get("periodId") as string)?.trim();
  const reason = (formData.get("reason") as string)?.trim();

  if (!periodId) return { error: "Data tidak lengkap." };
  if (!reason || reason.length < 5) return { error: "Alasan revisi minimal 5 karakter." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Tidak terautentikasi." };

  const supabaseAdmin = createAdminClient();

  const { data: period } = await supabaseAdmin
    .from("payroll_periods")
    .select("id, status, tenant_apotek_id")
    .eq("id", periodId)
    .maybeSingle();

  if (!period) return { error: "Data payroll tidak ditemukan." };
  if (period.tenant_apotek_id !== active.tenantId) return { error: "Akses ditolak." };
  if (period.status !== "sent_to_owner") {
    return { error: "Payroll ini tidak dalam status menunggu review." };
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabaseAdmin
    .from("payroll_periods")
    .update({
      status: "revision_requested_by_owner",
      notes: reason,
      updated_at: now,
    })
    .eq("id", periodId);

  if (updateError) return { error: `Gagal meminta revisi: ${updateError.message}` };

  await writeAuditLog(supabase, {
    tenantApotekId: active.tenantId,
    actorUserId: user.id,
    entityType: "payroll_periods",
    entityId: periodId,
    action: "payroll_revision_requested",
    newValue: { status: "revision_requested_by_owner", reason },
  });

  revalidatePath("/owner/payroll");
  return { success: true, message: "Permintaan revisi berhasil dikirim ke BBA." };
}
