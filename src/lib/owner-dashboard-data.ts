import type { SupabaseClient } from "@supabase/supabase-js";
import { OWNER_PORTAL_SUBMISSION_STATUSES } from "@/lib/audit-branch-dashboard-data";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
import {
  buildDailyOmzetSeries,
  clampViewMonthYear,
  computeDashboardKpis,
  monthBoundsKeys,
} from "@/lib/bba-dashboard-metrics";
import type { LeaderboardRow } from "@/app/bba/dashboard/bba-dashboard-leaderboard";

type OmzetSubmissionRow = {
  submission_date: string;
  omzet_total: number | null;
  transaction_total: number | null;
  product_total: number | null;
  rejected_customer_total: number | null;
  user_id: string;
  user: { full_name: string } | { full_name: string }[] | null;
};

type KpiConfigRow = {
  tenant_apotek_id: string;
  target_omzet: number | null;
  target_atv: number | null;
  target_atu: number | null;
};

export type OwnerPenjualanSnapshot = {
  periodEnd: string;
  periodLabel: string;
  dailySeries: { dateKey: string; amount: number }[];
  kpis: ReturnType<typeof computeDashboardKpis>;
  capaianPct: number;
  proratedTargetOmzet: number;
  mtdDays: number;
  avgTargetAtv: number;
  avgTargetAtu: number;
  leaderboardRows: LeaderboardRow[];
};

export async function fetchOwnerPenjualanSnapshot(
  supabase: SupabaseClient,
  tenantId: string,
  month: number,
  year: number,
): Promise<OwnerPenjualanSnapshot> {
  const reminderWindow = getOperationalReminderWindow();
  const wibTodayParts = reminderWindow.dateKey.split("-").map((p) => parseInt(p, 10));
  const todayYear = wibTodayParts[0] ?? new Date().getFullYear();
  const todayMonth = wibTodayParts[1] ?? new Date().getMonth() + 1;
  const { month: m, year: y } = clampViewMonthYear(month, year);

  const { startKey, endKey: monthEndKey } = monthBoundsKeys(y, m);
  const isViewingCurrentMonth = y === todayYear && m === todayMonth;
  const periodEnd =
    isViewingCurrentMonth
      ? reminderWindow.dateKey <= monthEndKey
        ? reminderWindow.dateKey
        : monthEndKey
      : monthEndKey;

  const { data: omzetRowsData } = await supabase
    .from("daily_submissions")
    .select(
      "submission_date, omzet_total, transaction_total, product_total, rejected_customer_total, user_id, user:user_id(full_name)",
    )
    .eq("tenant_apotek_id", tenantId)
    .in("status", [...OWNER_PORTAL_SUBMISSION_STATUSES])
    .gte("submission_date", startKey)
    .lte("submission_date", periodEnd);

  const { data: targetRowsData } = await supabase
    .from("kpi_configs")
    .select("tenant_apotek_id, target_omzet, target_atv, target_atu")
    .eq("tenant_apotek_id", tenantId)
    .eq("period_month", m)
    .eq("period_year", y);

  const omzetRows = (omzetRowsData ?? []) as OmzetSubmissionRow[];
  const targetRows = (targetRowsData ?? []) as KpiConfigRow[];

  const kpis = computeDashboardKpis(omzetRows);
  const dailySeries = buildDailyOmzetSeries(omzetRows, startKey, periodEnd);

  const performerMap = new Map<string, { name: string; omzet: number }>();
  for (const row of omzetRows) {
    const actor = Array.isArray(row.user) ? row.user[0] : row.user;
    const current = performerMap.get(row.user_id) ?? {
      name: actor?.full_name ?? "Tanpa nama",
      omzet: 0,
    };
    current.omzet += Number(row.omzet_total ?? 0);
    performerMap.set(row.user_id, current);
  }
  const leaderboardRows: LeaderboardRow[] = Array.from(performerMap.entries())
    .map(([userId, value]) => ({ userId, name: value.name, omzet: value.omzet }))
    .sort((a, b) => b.omzet - a.omzet)
    .slice(0, 12);

  const daysInMonth = new Date(y, m, 0).getDate();
  const targetOmzetFull = targetRows.reduce((s, r) => s + Number(r.target_omzet ?? 0), 0);
  const dStart = new Date(`${startKey}T12:00:00+07:00`).getTime();
  const dEnd = new Date(`${periodEnd}T12:00:00+07:00`).getTime();
  const mtdDays = Math.max(1, Math.floor((dEnd - dStart) / 86400000) + 1);
  const proratedTargetOmzet = targetOmzetFull * (mtdDays / Math.max(1, daysInMonth));
  const capaianPct =
    proratedTargetOmzet > 0 ? Math.min(200, Math.round((kpis.omzet / proratedTargetOmzet) * 100)) : 0;

  const atvTargets = targetRows.map((r) => Number(r.target_atv ?? 0)).filter((n) => n > 0);
  const atuTargets = targetRows.map((r) => Number(r.target_atu ?? 0)).filter((n) => n > 0);
  const avgTargetAtv = atvTargets.length ? atvTargets.reduce((a, b) => a + b, 0) / atvTargets.length : 0;
  const avgTargetAtu = atuTargets.length ? atuTargets.reduce((a, b) => a + b, 0) / atuTargets.length : 0;

  const periodLabel = new Date(y, m - 1, 1).toLocaleString("id-ID", {
    month: "long",
    year: "numeric",
  });

  return {
    periodEnd,
    periodLabel,
    dailySeries,
    kpis,
    capaianPct,
    proratedTargetOmzet,
    mtdDays,
    avgTargetAtv,
    avgTargetAtu,
    leaderboardRows,
  };
}
