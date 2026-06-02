"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { KpiConfigV2 } from "@/lib/types/kpi-v2";
import { createDefaultKpiV2Config, isKpiConfigV2 } from "@/lib/kpi-v2/utils";
import { writeAuditLog } from "@/lib/audit-log";
import { getSessionContext } from "@/lib/auth-context";
import { syncMonthlyAppraisalsForPeriod } from "@/lib/kpi-v2/sync-monthly-appraisals";

// =====================================================
// KPI V2 Server Actions
// =====================================================

export interface ActionResult<T = unknown> {
  success?: boolean;
  error?: string;
  message?: string;
  data?: T;
}

/**
 * Save KPI V2 Configuration
 */
export async function saveKpiV2Action(prevState: unknown, formData: FormData): Promise<ActionResult> {
  try {
    // Role + analyst guard
    const session = await getSessionContext();
    if (!session) return { error: "Unauthorized" };
    const role = session.activeMembership?.role;
    if (!session.isGlobalSuperAdmin && role !== "super_admin_bba") {
      return { error: "Akses ditolak." };
    }
    if (session.bbaPortalStaffRole === "analyst") {
      return { error: "Akses ditolak. Analyst tidak dapat mengubah konfigurasi KPI." };
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { error: "Unauthorized" };
    }

    const tenantId = formData.get("tenantId") as string;
    const month = parseInt(formData.get("month") as string, 10);
    const year = parseInt(formData.get("year") as string, 10);

    const configJson = formData.get("configV2") as string;
    const config: KpiConfigV2 = JSON.parse(configJson) as KpiConfigV2;

    if (!tenantId || !Number.isFinite(month) || !Number.isFinite(year)) {
      return { error: "Data tidak lengkap" };
    }

    const supabaseAdmin = createAdminClient();

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("kpi_configs")
      .select("id")
      .eq("tenant_apotek_id", tenantId)
      .eq("period_month", month)
      .eq("period_year", year)
      .maybeSingle();

    if (existingError) {
      console.error("saveKpiV2Action existing row:", existingError);
      return { error: "Gagal memeriksa data KPI" };
    }

    const now = new Date().toISOString();

    if (existing?.id) {
      const { error: updateError } = await supabaseAdmin
        .from("kpi_configs")
        .update({
          target_omzet: config.global.target_omzet,
          target_atv: config.global.target_atv,
          target_atu: config.global.target_atu,
          bonus_config_v2: config,
          updated_at: now,
        })
        .eq("id", existing.id);

      if (updateError) {
        console.error("Update error:", updateError);
        return { error: "Gagal mengupdate konfigurasi KPI" };
      }

      await writeAuditLog(supabase, {
        tenantApotekId: tenantId,
        actorUserId: user.id,
        entityType: "kpi_configs",
        entityId: existing.id,
        action: "kpi_config_upserted",
        newValue: {
          source: "branch_kpi_v2",
          period_month: month,
          period_year: year,
          target_omzet: config.global.target_omzet,
          target_atv: config.global.target_atv,
          target_atu: config.global.target_atu,
          active_schemes: config.active_schemes,
          schemes_enabled: {
            team_monthly: config.team_monthly.enabled,
            team_daily: config.team_daily.enabled,
            individual_monthly: config.individual_monthly.enabled,
            individual_daily: config.individual_daily.enabled,
          },
        },
      });

      // Auto-recalculate appraisals if they already exist for this period
      await autoRecalcIfAppraisalsExist(supabaseAdmin, tenantId, month, year, user.id);

      revalidatePath(`/bba/branches/${tenantId}`);
      revalidatePath(`/bba/audit/${tenantId}`);
      return {
        success: true,
        message: "Konfigurasi KPI berhasil diperbarui dan bonus otomatis direcalculate!",
      };
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("kpi_configs")
      .insert({
        tenant_apotek_id: tenantId,
        period_month: month,
        period_year: year,
        target_omzet: config.global.target_omzet,
        target_atv: config.global.target_atv,
        target_atu: config.global.target_atu,
        bonus_config_v2: config,
        created_by_user_id: user.id,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .maybeSingle();

    if (insertError) {
      console.error("Insert error:", insertError);
      return { error: "Gagal menyimpan konfigurasi KPI" };
    }

    if (inserted?.id) {
      await writeAuditLog(supabase, {
        tenantApotekId: tenantId,
        actorUserId: user.id,
        entityType: "kpi_configs",
        entityId: inserted.id,
        action: "kpi_config_upserted",
        newValue: {
          source: "branch_kpi_v2",
          period_month: month,
          period_year: year,
          target_omzet: config.global.target_omzet,
          target_atv: config.global.target_atv,
          target_atu: config.global.target_atu,
          active_schemes: config.active_schemes,
          schemes_enabled: {
            team_monthly: config.team_monthly.enabled,
            team_daily: config.team_daily.enabled,
            individual_monthly: config.individual_monthly.enabled,
            individual_daily: config.individual_daily.enabled,
          },
        },
      });
    }

    // Auto-recalculate appraisals if they already exist for this period
    await autoRecalcIfAppraisalsExist(supabaseAdmin, tenantId, month, year, user.id);

    revalidatePath(`/bba/branches/${tenantId}`);
    revalidatePath(`/bba/audit/${tenantId}`);
    return {
      success: true,
      message: "Konfigurasi KPI berhasil disimpan!",
    };
  } catch (error) {
    console.error("saveKpiV2Action error:", error);
    return { error: "Terjadi kesalahan sistem" };
  }
}

/**
 * Internal helper: trigger appraisal recalculation if rows already exist for the period.
 * Preserves publish state and manual adjustments so BBA edits are not lost.
 */
async function autoRecalcIfAppraisalsExist(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  month: number,
  year: number,
  actorUserId: string,
): Promise<void> {
  try {
    const { count } = await supabase
      .from("monthly_appraisals")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", tenantId)
      .eq("period_month", month)
      .eq("period_year", year);

    if ((count ?? 0) > 0) {
      await syncMonthlyAppraisalsForPeriod(supabase, {
        tenantApotekId: tenantId,
        periodMonth: month,
        periodYear: year,
        actorUserId,
        reason: "kpi_config_saved",
        source: "kpi_v2_action",
        preservePublishState: true,
        preserveExistingAdjustments: true,
      });
    }
  } catch (err) {
    // Non-fatal: recalc failure should not block the config save response
    console.error("autoRecalcIfAppraisalsExist failed:", err);
  }
}

/**
 * Get previous month KPI configuration
 */
export async function getPreviousKpiV2Action(
  branchId: string,
  currentMonth: number,
  currentYear: number,
): Promise<ActionResult<KpiConfigV2>> {
  try {
    // Auth guard — only BBA admins may read KPI config for any branch
    const session = await getSessionContext();
    if (!session) return { error: "Unauthorized" };
    const role = session.activeMembership?.role;
    if (
      !session.isGlobalSuperAdmin &&
      role !== "super_admin_bba" &&
      session.bbaPortalStaffRole !== "analyst"
    ) {
      return { error: "Akses ditolak." };
    }

    const supabaseAdmin = createAdminClient();

    let prevMonth = currentMonth - 1;
    let prevYear = currentYear;

    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear -= 1;
    }

    const { data, error } = await supabaseAdmin
      .from("kpi_configs")
      .select("bonus_config_v2")
      .eq("tenant_apotek_id", branchId)
      .eq("period_month", prevMonth)
      .eq("period_year", prevYear)
      .maybeSingle();

    if (error) {
      console.error("getPreviousKpiV2Action:", error);
      return { error: "Data bulan sebelumnya tidak ditemukan" };
    }

    if (!data?.bonus_config_v2 || !isKpiConfigV2(data.bonus_config_v2)) {
      return { error: "Data bulan sebelumnya tidak ditemukan" };
    }

    return {
      success: true,
      data: data.bonus_config_v2,
    };
  } catch (error) {
    console.error("getPreviousKpiV2Action error:", error);
    return { error: "Gagal mengambil data bulan sebelumnya" };
  }
}

/**
 * Get current KPI configuration
 */
export async function getCurrentKpiV2(branchId: string, month: number, year: number): Promise<KpiConfigV2> {
  try {
    const supabaseAdmin = createAdminClient();

    const { data, error } = await supabaseAdmin
      .from("kpi_configs")
      .select("bonus_config_v2")
      .eq("tenant_apotek_id", branchId)
      .eq("period_month", month)
      .eq("period_year", year)
      .maybeSingle();

    if (error || !data?.bonus_config_v2 || !isKpiConfigV2(data.bonus_config_v2)) {
      return createDefaultKpiV2Config();
    }

    return data.bonus_config_v2;
  } catch (error) {
    console.error("getCurrentKpiV2 error:", error);
    return createDefaultKpiV2Config();
  }
}
