import type { SupabaseClient } from "@supabase/supabase-js";
import { AUDIT_COUNTED_SUBMISSION_STATUSES } from "@/lib/audit-branch-dashboard-data";
import {
  calculateMonthlyBonusFromInputs,
  type CrewAchievementRow,
  type DailyAchievementRow,
} from "@/lib/kpi-v2/calculator";
import { getKpiV2SchemesEnabledForPeriod, isKpiConfigV2 } from "@/lib/kpi-v2/utils";
import type { BonusResult } from "@/lib/kpi-v2/calculator";
import type { KpiConfigV2 } from "@/lib/types/kpi-v2";

const COUNTED_STATUSES = [...AUDIT_COUNTED_SUBMISSION_STATUSES];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function periodDateBounds(periodYear: number, periodMonth: number) {
  const periodStart = `${periodYear}-${pad2(periodMonth)}-01`;
  const periodEnd = `${periodYear}-${pad2(periodMonth)}-${pad2(
    new Date(periodYear, periodMonth, 0).getDate(),
  )}`;
  return { periodStart, periodEnd };
}

export function hasValidKpiV2Config(config: unknown): config is KpiConfigV2 {
  if (!isKpiConfigV2(config)) return false;
  return getKpiV2SchemesEnabledForPeriod(config).length > 0;
}

type SubmissionRow = {
  user_id: string;
  submission_date: string;
  omzet_total: number | null;
  transaction_total: number | null;
  product_total: number | null;
};

function buildAchievementRows(submissions: SubmissionRow[]) {
  const byDate = new Map<
    string,
    { total_omzet: number; total_transactions: number; total_items: number }
  >();

  for (const row of submissions) {
    const dateKey = String(row.submission_date).slice(0, 10);
    const current = byDate.get(dateKey) ?? {
      total_omzet: 0,
      total_transactions: 0,
      total_items: 0,
    };
    current.total_omzet += Number(row.omzet_total ?? 0);
    current.total_transactions += Number(row.transaction_total ?? 0);
    current.total_items += Number(row.product_total ?? 0);
    byDate.set(dateKey, current);
  }

  const dailyRows: DailyAchievementRow[] = Array.from(byDate.entries())
    .map(([achievement_date, val]) => ({
      achievement_date,
      total_omzet: val.total_omzet,
      total_transactions: val.total_transactions,
      total_items: val.total_items,
    }))
    .sort((a, b) => a.achievement_date.localeCompare(b.achievement_date));

  const crewRows: CrewAchievementRow[] = submissions.map((row) => ({
    user_id: String(row.user_id),
    achievement_date: String(row.submission_date).slice(0, 10),
    omzet: Number(row.omzet_total ?? 0),
    transactions: Number(row.transaction_total ?? 0),
    items: Number(row.product_total ?? 0),
  }));

  return { dailyRows, crewRows };
}

function aggregateSubmissionsByUser(submissions: SubmissionRow[]) {
  const aggregationMap = new Map<string, { count: number; omzet: number }>();
  for (const row of submissions) {
    const uid = row.user_id;
    if (!uid) continue;
    const cur = aggregationMap.get(uid) ?? { count: 0, omzet: 0 };
    cur.count += 1;
    cur.omzet += Number(row.omzet_total ?? 0);
    aggregationMap.set(uid, cur);
  }
  return aggregationMap;
}

function bonusBreakdownForCalc(
  config: KpiConfigV2,
  bonusResults: BonusResult[],
  dailyRows: DailyAchievementRow[],
  crewRows: CrewAchievementRow[],
  meta: {
    reason: string;
    source: string;
    generatedBy: string;
    periodStart: string;
    periodEnd: string;
  },
) {
  return {
    autoBonusFormula: "kpi_v2" as const,
    kpiV2: {
      enabledSchemes: getKpiV2SchemesEnabledForPeriod(config),
      globalTargetOmzet: config.global.target_omzet,
      dailyRowCount: dailyRows.length,
      crewRowCount: crewRows.length,
      perUser: bonusResults.map((br) => ({
        userId: br.user_id,
        teamMonthlyBonus: br.team_monthly_bonus,
        teamDailyBonus: br.team_daily_bonus,
        individualMonthlyBonus: br.individual_monthly_bonus,
        individualDailyBonus: br.individual_daily_bonus,
        totalBonus: br.total_bonus,
        breakdown: br.breakdown,
      })),
    },
    generatedAt: new Date().toISOString(),
    generatedBy: meta.generatedBy,
    periodStart: meta.periodStart,
    periodEnd: meta.periodEnd,
    reason: meta.reason,
    source: meta.source,
  };
}


export type SyncMonthlyAppraisalsInput = {
  tenantApotekId: string;
  periodMonth: number;
  periodYear: number;
  actorUserId: string;
  auditId?: string | null;
  reason: string;
  source: string;
  /** Skip rows already published (audit finalize). */
  excludePublishedUsers?: boolean;
  /** Keep is_published / published_* from existing rows (payroll recalc). */
  preservePublishState?: boolean;
  /**
   * When true, keep addon_manual_total and bba_adjustment from existing monthly_appraisals
   * if present; otherwise use addon table + crew audit (default for finalize).
   */
  preserveExistingAdjustments?: boolean;
};

export type SyncMonthlyAppraisalsResult = {
  error?: string;
  upsertedCount: number;
  affectedUserCount: number;
  calcVersion: "kpi";
};

export async function syncMonthlyAppraisalsForPeriod(
  supabase: SupabaseClient,
  input: SyncMonthlyAppraisalsInput,
): Promise<SyncMonthlyAppraisalsResult> {
  const { periodStart, periodEnd } = periodDateBounds(input.periodYear, input.periodMonth);

  const { data: crewMembershipData, error: crewMemErr } = await supabase
    .from("tenant_memberships")
    .select("user_id")
    .eq("tenant_apotek_id", input.tenantApotekId)
    .eq("role", "crew")
    .eq("is_active", true);

  if (crewMemErr) {
    return { error: "Gagal membaca membership crew.", upsertedCount: 0, affectedUserCount: 0, calcVersion: "kpi" };
  }

  const crewUserIds = Array.from(
    new Set((crewMembershipData ?? []).map((r) => r.user_id as string).filter(Boolean)),
  );
  if (crewUserIds.length === 0) {
    return { upsertedCount: 0, affectedUserCount: 0, calcVersion: "kpi" };
  }

  const { data: kpiRow, error: kpiErr } = await supabase
    .from("kpi_configs")
    .select("bonus_config_v2")
    .eq("tenant_apotek_id", input.tenantApotekId)
    .eq("period_month", input.periodMonth)
    .eq("period_year", input.periodYear)
    .maybeSingle();

  if (kpiErr) {
    return { error: "Gagal membaca konfigurasi KPI.", upsertedCount: 0, affectedUserCount: 0, calcVersion: "kpi" };
  }

  const configV2 = hasValidKpiV2Config(kpiRow?.bonus_config_v2) ? (kpiRow!.bonus_config_v2 as KpiConfigV2) : null;

  const { data: submissionData, error: subErr } = await supabase
    .from("daily_submissions")
    .select("user_id, submission_date, omzet_total, transaction_total, product_total")
    .eq("tenant_apotek_id", input.tenantApotekId)
    .in("status", COUNTED_STATUSES)
    .in("user_id", crewUserIds)
    .gte("submission_date", periodStart)
    .lte("submission_date", periodEnd);

  if (subErr) {
    return { error: "Gagal membaca submission untuk sinkron rapor.", upsertedCount: 0, affectedUserCount: 0, calcVersion: "kpi" };
  }

  const submissions = (submissionData ?? []) as SubmissionRow[];
  const aggregationMap = aggregateSubmissionsByUser(submissions);
  const { dailyRows, crewRows } = buildAchievementRows(submissions);

  let resolvedAuditId = input.auditId ?? null;
  if (!resolvedAuditId) {
    const { data: auditRow } = await supabase
      .from("monthly_audits")
      .select("id")
      .eq("tenant_apotek_id", input.tenantApotekId)
      .eq("period_month", input.periodMonth)
      .eq("period_year", input.periodYear)
      .maybeSingle();
    resolvedAuditId = auditRow?.id ?? null;
  }

  const bbaByUser = new Map<string, number>();
  if (resolvedAuditId && !input.preserveExistingAdjustments) {
    const { data: crewAuditRows, error: crewAuditErr } = await supabase
      .from("monthly_crew_audits")
      .select("user_id, bba_adjustment")
      .eq("monthly_audit_id", resolvedAuditId);
    if (crewAuditErr) {
      return { error: "Gagal membaca penyesuaian BBA dari audit.", upsertedCount: 0, affectedUserCount: 0, calcVersion: "kpi" };
    }
    for (const row of crewAuditRows ?? []) {
      const uid = row.user_id as string;
      if (!uid) continue;
      bbaByUser.set(uid, Number(row.bba_adjustment ?? 0));
    }
  }

  const { data: addonRows, error: addonErr } = await supabase
    .from("monthly_addon_appraisals")
    .select("crew_user_id, nominal_manual")
    .eq("tenant_apotek_id", input.tenantApotekId)
    .eq("period_month", input.periodMonth)
    .eq("period_year", input.periodYear);

  if (addonErr) {
    return { error: "Gagal membaca penilaian add-on.", upsertedCount: 0, affectedUserCount: 0, calcVersion: "kpi" };
  }

  const addonSumByUser = new Map<string, number>();
  for (const row of addonRows ?? []) {
    const uid = row.crew_user_id as string;
    if (!uid) continue;
    addonSumByUser.set(uid, (addonSumByUser.get(uid) ?? 0) + Number(row.nominal_manual ?? 0));
  }

  const { data: existingAppraisalData, error: exErr } = await supabase
    .from("monthly_appraisals")
    .select(
      "crew_user_id, is_published, published_at, published_by_user_id, addon_manual_total, bba_adjustment",
    )
    .eq("tenant_apotek_id", input.tenantApotekId)
    .eq("period_month", input.periodMonth)
    .eq("period_year", input.periodYear);

  if (exErr) {
    return { error: "Gagal membaca rapor bulanan (monthly_appraisals).", upsertedCount: 0, affectedUserCount: 0, calcVersion: "kpi" };
  }

  const existingMap = new Map(
    (existingAppraisalData ?? [])
      .filter((row) => row.crew_user_id != null)
      .map((row) => [
        row.crew_user_id as string,
        {
          isPublished: Boolean(row.is_published),
          publishedAt: row.published_at ?? null,
          publishedByUserId: row.published_by_user_id ?? null,
          addonManualTotal: Number(row.addon_manual_total ?? 0),
          bbaAdjustment: Number(row.bba_adjustment ?? 0),
        },
      ]),
  );

  const publishedSet = new Set(
    (existingAppraisalData ?? [])
      .filter((r) => r.is_published && r.crew_user_id != null)
      .map((r) => r.crew_user_id as string),
  );

  const bonusByUser = new Map<string, BonusResult>();
  if (configV2) {
    const results = calculateMonthlyBonusFromInputs(configV2, dailyRows, crewRows);
    for (const br of results) {
      bonusByUser.set(br.user_id, br);
    }
  }

  const meta = {
    reason: input.reason,
    source: input.source,
    generatedBy: input.actorUserId,
    periodStart,
    periodEnd,
  };

  const calcVersion = "kpi" as const;

  // Compute branch-level breakdown once — shared across all crew rows to avoid N redundant calls.
  const sharedCalcBreakdown = configV2
    ? bonusBreakdownForCalc(configV2, Array.from(bonusByUser.values()), dailyRows, crewRows, meta)
    : null;

  const upsertPayload = crewUserIds
    .filter((crewUserId) => !(input.excludePublishedUsers && publishedSet.has(crewUserId)))
    .map((crewUserId) => {
      const agg = aggregationMap.get(crewUserId) ?? { count: 0, omzet: 0 };
      const existing = existingMap.get(crewUserId);

      let addonManualTotal = addonSumByUser.get(crewUserId) ?? 0;
      let bbaAdjustment = bbaByUser.get(crewUserId) ?? 0;

      if (input.preserveExistingAdjustments && existing) {
        addonManualTotal = existing.addonManualTotal;
        bbaAdjustment = existing.bbaAdjustment;
      }

      const br = bonusByUser.get(crewUserId);
      const autoBonus = br ? br.total_bonus : 0;

      const calcBreakdown = sharedCalcBreakdown
        ? {
            approvedSubmissionCount: agg.count,
            approvedOmzetTotal: agg.omzet,
            ...sharedCalcBreakdown,
            perUserBonus: br
              ? {
                  userId: crewUserId,
                  teamMonthlyBonus: br.team_monthly_bonus,
                  teamDailyBonus: br.team_daily_bonus,
                  individualMonthlyBonus: br.individual_monthly_bonus,
                  individualDailyBonus: br.individual_daily_bonus,
                  totalBonus: br.total_bonus,
                  breakdown: br.breakdown,
                }
              : null,
          }
        : { approvedSubmissionCount: agg.count, approvedOmzetTotal: agg.omzet };

      return {
        tenant_apotek_id: input.tenantApotekId,
        crew_user_id: crewUserId,
        period_month: input.periodMonth,
        period_year: input.periodYear,
        approved_submission_count: agg.count,
        approved_omzet_total: agg.omzet,
        minus_point_total: 0,
        auto_bonus_accountability: autoBonus,
        addon_manual_total: addonManualTotal,
        bba_adjustment: bbaAdjustment,
        calc_version: calcVersion,
        calc_breakdown: calcBreakdown,
        is_published: input.preservePublishState ? (existing?.isPublished ?? false) : false,
        published_at: input.preservePublishState ? (existing?.publishedAt ?? null) : null,
        published_by_user_id: input.preservePublishState
          ? (existing?.publishedByUserId ?? null)
          : null,
      };
    });

  if (upsertPayload.length === 0) {
    return { upsertedCount: 0, affectedUserCount: crewUserIds.length, calcVersion };
  }

  const { error: upsertError } = await supabase.from("monthly_appraisals").upsert(upsertPayload, {
    onConflict: "tenant_apotek_id,crew_user_id,period_month,period_year",
  });

  if (upsertError) {
    console.error("syncMonthlyAppraisalsForPeriod", upsertError);
    return { error: "Gagal menyinkronkan rapor bulanan (monthly_appraisals).", upsertedCount: 0, affectedUserCount: crewUserIds.length, calcVersion };
  }

  return {
    upsertedCount: upsertPayload.length,
    affectedUserCount: crewUserIds.length,
    calcVersion,
  };
}
