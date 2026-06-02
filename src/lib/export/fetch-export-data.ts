/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient } from "@/lib/supabase/admin";

export type ExportCrewMember = { userId: string; fullName: string };

export type ExportDailyTotal = {
  date: string;
  omzet: number;
  transactions: number;
  products: number;
  rejectedCustomers: number;
};

export type ExportCrewDaily = {
  userId: string;
  date: string;
  omzet: number;
  transactions: number;
  products: number;
  rejectedCustomers: number;
};

export type ExportMonthlyTrend = { month: number; year: number; omzet: number };

export type ExportData = {
  branch: { id: string; name: string; code: string; address: string | null; phone: string | null };
  owner: { fullName: string } | null;
  kpi: { targetOmzet: number; targetAtv: number; targetAtu: number } | null;
  crew: ExportCrewMember[];
  period: { month: number; year: number; daysInMonth: number };
  dailyTotals: ExportDailyTotal[];
  crewDailyData: ExportCrewDaily[];
  monthlyTrend: ExportMonthlyTrend[];
  /** All distinct user_ids that submitted data this month (may include ex-crew) */
  allActiveUserIds: Set<string>;
};

const COUNTED_STATUSES = ["approved", "edited_by_admin"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export async function fetchExportData(
  branchId: string,
  month: number,
  year: number,
): Promise<ExportData | null> {
  const supabase = createAdminClient();

  const { data: branch } = await supabase
    .from("tenant_apotek")
    .select("id, name, code, address, phone")
    .eq("id", branchId)
    .maybeSingle();

  if (!branch) return null;

  const startDate = `${year}-${pad2(month)}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const endDate = `${year}-${pad2(month)}-${pad2(daysInMonth)}`;

  // 12-month trend window start
  const histStart = new Date(year, month - 1 - 11, 1);
  const histStartYear = histStart.getFullYear();
  const histStartMonth = histStart.getMonth() + 1;

  const [
    ownerResult,
    kpiResult,
    crewResult,
    submissionsResult,
    snapshotsResult,
  ] = await Promise.all([
    supabase
      .from("tenant_memberships")
      .select("user_id, app_users!user_id(full_name)")
      .eq("tenant_apotek_id", branchId)
      .eq("role", "owner")
      .eq("is_active", true)
      .limit(1),

    supabase
      .from("kpi_configs")
      .select("target_omzet, target_atv, target_atu")
      .eq("tenant_apotek_id", branchId)
      .eq("period_month", month)
      .eq("period_year", year)
      .maybeSingle(),

    supabase
      .from("tenant_memberships")
      .select("user_id, app_users!user_id(full_name)")
      .eq("tenant_apotek_id", branchId)
      .eq("role", "crew")
      .eq("is_active", true),

    supabase
      .from("daily_submissions")
      .select(
        "submission_date, user_id, omzet_total, transaction_total, product_total, rejected_customer_total",
      )
      .eq("tenant_apotek_id", branchId)
      .in("status", COUNTED_STATUSES)
      .gte("submission_date", startDate)
      .lte("submission_date", endDate),

    supabase
      .from("leaderboard_snapshots")
      .select("period_month, period_year, omzet_value, user_id")
      .eq("tenant_apotek_id", branchId)
      .gte("period_year", histStartYear)
      .lte("period_year", year),
  ]);

  // Owner
  let owner: ExportData["owner"] = null;
  const ownerRows = ownerResult.data ?? [];
  if (ownerRows.length > 0) {
    const au: any = Array.isArray(ownerRows[0].app_users)
      ? ownerRows[0].app_users[0]
      : ownerRows[0].app_users;
    if (au?.full_name) owner = { fullName: au.full_name };
  }

  // KPI
  const kpiRow = kpiResult.data;
  const kpi: ExportData["kpi"] = kpiRow
    ? {
        targetOmzet: Number(kpiRow.target_omzet ?? 0),
        targetAtv: Number(kpiRow.target_atv ?? 0),
        targetAtu: Number(kpiRow.target_atu ?? 0),
      }
    : null;

  // Crew list (active)
  const crew: ExportCrewMember[] = (crewResult.data ?? [])
    .map((m: any) => {
      const au: any = Array.isArray(m.app_users) ? m.app_users[0] : m.app_users;
      return { userId: m.user_id as string, fullName: (au?.full_name as string) ?? "Unknown" };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "id", { sensitivity: "base" }));

  // Aggregate daily totals (branch-level) and per-crew
  const byDate = new Map<string, ExportDailyTotal>();
  const byUserDate = new Map<string, ExportCrewDaily>();
  const allActiveUserIds = new Set<string>();

  for (const sub of submissionsResult.data ?? []) {
    const date = String(sub.submission_date).slice(0, 10);
    const userId = sub.user_id as string;
    allActiveUserIds.add(userId);

    // Branch daily
    const bd = byDate.get(date) ?? {
      date,
      omzet: 0,
      transactions: 0,
      products: 0,
      rejectedCustomers: 0,
    };
    bd.omzet += Number(sub.omzet_total ?? 0);
    bd.transactions += Number(sub.transaction_total ?? 0);
    bd.products += Number(sub.product_total ?? 0);
    bd.rejectedCustomers += Number(sub.rejected_customer_total ?? 0);
    byDate.set(date, bd);

    // Per-crew daily
    const key = `${userId}__${date}`;
    const cd = byUserDate.get(key) ?? {
      userId,
      date,
      omzet: 0,
      transactions: 0,
      products: 0,
      rejectedCustomers: 0,
    };
    cd.omzet += Number(sub.omzet_total ?? 0);
    cd.transactions += Number(sub.transaction_total ?? 0);
    cd.products += Number(sub.product_total ?? 0);
    cd.rejectedCustomers += Number(sub.rejected_customer_total ?? 0);
    byUserDate.set(key, cd);
  }

  const dailyTotals = Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const crewDailyData = Array.from(byUserDate.values());

  // 12-month trend (filter correctly by month boundaries)
  const omzetByPeriod = new Map<string, number>();
  for (const s of snapshotsResult.data ?? []) {
    // only include months within our 12-month window
    if (
      s.period_year < histStartYear ||
      (s.period_year === histStartYear && s.period_month < histStartMonth) ||
      s.period_year > year ||
      (s.period_year === year && s.period_month > month)
    ) continue;
    const key = `${s.period_year}-${s.period_month}`;
    omzetByPeriod.set(key, (omzetByPeriod.get(key) ?? 0) + Number(s.omzet_value ?? 0));
  }

  const monthlyTrend: ExportMonthlyTrend[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1);
    const m2 = d.getMonth() + 1;
    const y2 = d.getFullYear();
    monthlyTrend.push({ month: m2, year: y2, omzet: omzetByPeriod.get(`${y2}-${m2}`) ?? 0 });
  }

  return {
    branch: {
      id: branch.id as string,
      name: branch.name as string,
      code: branch.code as string,
      address: (branch.address as string | null) ?? null,
      phone: (branch.phone as string | null) ?? null,
    },
    owner,
    kpi,
    crew,
    period: { month, year, daysInMonth },
    dailyTotals,
    crewDailyData,
    monthlyTrend,
    allActiveUserIds,
  };
}
