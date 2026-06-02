import type { SupabaseClient } from "@supabase/supabase-js";
import { AUDIT_COUNTED_SUBMISSION_STATUSES } from "@/lib/audit-branch-dashboard-data";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export type SyncLeaderboardSnapshotsInput = {
  tenantApotekId: string;
  periodMonth: number;
  periodYear: number;
};

export type SyncLeaderboardSnapshotsResult = {
  error?: string;
  upsertedCount: number;
};

const COUNTED_STATUSES = [...AUDIT_COUNTED_SUBMISSION_STATUSES];

export async function syncLeaderboardSnapshotsForPeriod(
  supabase: SupabaseClient,
  input: SyncLeaderboardSnapshotsInput,
): Promise<SyncLeaderboardSnapshotsResult> {
  const { tenantApotekId, periodMonth, periodYear } = input;

  const lastDay = new Date(periodYear, periodMonth, 0).getDate();
  const startDate = `${periodYear}-${pad2(periodMonth)}-01`;
  const endDate = `${periodYear}-${pad2(periodMonth)}-${pad2(lastDay)}`;
  // WIB (UTC+7) boundaries for attendance_logs clock_in_time (stored as UTC)
  const startUtc = new Date(`${startDate}T00:00:00+07:00`).toISOString();
  const endUtc = new Date(`${endDate}T23:59:59.999+07:00`).toISOString();

  // 1. Active crew members for this tenant
  const { data: crewData, error: crewErr } = await supabase
    .from("tenant_memberships")
    .select("user_id")
    .eq("tenant_apotek_id", tenantApotekId)
    .eq("role", "crew")
    .eq("is_active", true);

  if (crewErr) {
    return { error: "Gagal membaca daftar crew.", upsertedCount: 0 };
  }

  const crewUserIds = Array.from(
    new Set((crewData ?? []).map((r) => r.user_id as string).filter(Boolean)),
  );
  if (crewUserIds.length === 0) {
    return { upsertedCount: 0 };
  }

  // 2. Approved submissions for the period
  const { data: submissions, error: subErr } = await supabase
    .from("daily_submissions")
    .select("user_id, omzet_total, transaction_total, product_total")
    .eq("tenant_apotek_id", tenantApotekId)
    .in("status", COUNTED_STATUSES)
    .in("user_id", crewUserIds)
    .gte("submission_date", startDate)
    .lte("submission_date", endDate);

  if (subErr) {
    return { error: "Gagal membaca submission.", upsertedCount: 0 };
  }

  // 3. Aggregate per user
  const byUser = new Map<string, { omzet: number; trx: number; prod: number }>();
  for (const row of submissions ?? []) {
    const uid = String(row.user_id);
    const cur = byUser.get(uid) ?? { omzet: 0, trx: 0, prod: 0 };
    cur.omzet += Number(row.omzet_total ?? 0);
    cur.trx   += Number(row.transaction_total ?? 0);
    cur.prod  += Number(row.product_total ?? 0);
    byUser.set(uid, cur);
  }

  // 4. Team-level totals for relative SARP calculation
  let teamOmzet = 0, teamTrx = 0, teamProd = 0;
  for (const v of byUser.values()) {
    teamOmzet += v.omzet;
    teamTrx   += v.trx;
    teamProd  += v.prod;
  }
  // Avoid division-by-zero: if no transactions, all relative metrics stay 0
  const teamAvgAtv = teamTrx > 0 ? teamOmzet / teamTrx : 0;
  const teamAvgAtu = teamTrx > 0 ? teamProd  / teamTrx : 0;

  // 5. Late flags per user for the period (WIB-bounded)
  const { data: lateLogs, error: lateErr } = await supabase
    .from("attendance_logs")
    .select("user_id")
    .eq("tenant_apotek_id", tenantApotekId)
    .eq("is_late", true)
    .in("user_id", crewUserIds)
    .gte("clock_in_time", startUtc)
    .lte("clock_in_time", endUtc);

  if (lateErr) {
    return { error: "Gagal membaca data kehadiran.", upsertedCount: 0 };
  }

  const lateCountByUser = new Map<string, number>();
  for (const log of lateLogs ?? []) {
    const uid = String(log.user_id);
    lateCountByUser.set(uid, (lateCountByUser.get(uid) ?? 0) + 1);
  }

  // 6. Build snapshot rows
  // SARP formula (from Excel "Daily Report Auto"):
  //   atv_percent = (user_atv / team_avg_atv) * 100
  //   atu_percent = (user_atu / team_avg_atu) * 100
  //   sarp_percent = (atv_percent + atu_percent) / 2
  // Value 100 = exactly at team average; >100 = above average; <100 = below average
  const payload = crewUserIds.map((uid) => {
    const agg    = byUser.get(uid) ?? { omzet: 0, trx: 0, prod: 0 };
    const atv    = agg.trx > 0 ? agg.omzet / agg.trx : 0;
    const atu    = agg.trx > 0 ? agg.prod  / agg.trx : 0;
    const atvPct = teamAvgAtv > 0 ? (atv / teamAvgAtv) * 100 : 0;
    const atuPct = teamAvgAtu > 0 ? (atu / teamAvgAtu) * 100 : 0;
    const sarpPct = (atvPct + atuPct) / 2;

    return {
      tenant_apotek_id: tenantApotekId,
      period_month:     periodMonth,
      period_year:      periodYear,
      user_id:          uid,
      omzet_value:      agg.omzet,
      atv_value:        atv,
      atu_value:        atu,
      atv_percent:      atvPct,
      atu_percent:      atuPct,
      sarp_percent:     sarpPct,
      late_flag_count:  lateCountByUser.get(uid) ?? 0,
      calculated_at:    new Date().toISOString(),
    };
  });

  // 7. Upsert — unique key: (tenant_apotek_id, period_month, period_year, user_id)
  const { error: upsertErr } = await supabase
    .from("leaderboard_snapshots")
    .upsert(payload, {
      onConflict: "tenant_apotek_id,period_month,period_year,user_id",
    });

  if (upsertErr) {
    return { error: "Gagal menyimpan snapshot leaderboard.", upsertedCount: 0 };
  }

  return { upsertedCount: payload.length };
}
