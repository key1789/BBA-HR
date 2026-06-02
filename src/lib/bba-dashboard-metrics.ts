/** Status submission yang dihitung sebagai omzet terverifikasi (selaras audit BBA). */
export const BBA_DASHBOARD_OMZET_STATUSES = ["approved", "edited_by_admin"] as const;
export type BbaDashboardOmzetStatus = (typeof BBA_DASHBOARD_OMZET_STATUSES)[number];

export type BbaDashboardOmzetPoint = {
  dateKey: string;
  amount: number;
};

export type BbaDashboardKpiAgg = {
  omzet: number;
  transactions: number;
  products: number;
  lostCustomers: number;
  atv: number;
  atu: number;
};

export function computeDashboardKpis(
  rows: {
    omzet_total: number | null;
    transaction_total?: number | null;
    product_total?: number | null;
    rejected_customer_total?: number | null;
  }[],
): BbaDashboardKpiAgg {
  let omzet = 0;
  let transactions = 0;
  let products = 0;
  let lostCustomers = 0;
  for (const r of rows) {
    omzet += Number(r.omzet_total ?? 0);
    transactions += Number(r.transaction_total ?? 0);
    products += Number(r.product_total ?? 0);
    lostCustomers += Number(r.rejected_customer_total ?? 0);
  }
  const atv = transactions > 0 ? omzet / transactions : 0;
  const atu = transactions > 0 ? products / transactions : 0;
  return { omzet, transactions, products, lostCustomers, atv, atu };
}

export function buildDailyOmzetSeries(
  rows: { submission_date: string; omzet_total: number | null }[],
  startKey: string,
  endKey: string,
): BbaDashboardOmzetPoint[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const d = (r.submission_date ?? "").slice(0, 10);
    if (!d || d < startKey || d > endKey) continue;
    map.set(d, (map.get(d) ?? 0) + Number(r.omzet_total ?? 0));
  }
  const series: BbaDashboardOmzetPoint[] = [];
  for (const dateKey of eachDateKeyInRangeInclusive(startKey, endKey)) {
    series.push({ dateKey, amount: map.get(dateKey) ?? 0 });
  }
  return series;
}

export function eachDateKeyInRangeInclusive(startKey: string, endKey: string): string[] {
  const [sy, sm, sd] = startKey.split("-").map(Number);
  const [ey, em, ed] = endKey.split("-").map(Number);
  const cur = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const out: string[] = [];
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function monthBoundsKeys(year: number, month: number): { startKey: string; endKey: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(year, month, 0).getDate();
  return {
    startKey: `${year}-${pad(month)}-01`,
    endKey: `${year}-${pad(month)}-${pad(last)}`,
  };
}

export function clampViewMonthYear(
  month: number,
  year: number,
  opts?: { minYear?: number; maxYear?: number },
): { month: number; year: number } {
  let m = month;
  let y = year;
  const minY = opts?.minYear ?? 2020;
  const maxY = opts?.maxYear ?? new Date().getFullYear() + 1;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  if (y < minY) return { month: 1, year: minY };
  if (y > maxY) return { month: 12, year: maxY };
  return { month: m, year: y };
}

// ── Sales Multi-Month Types ──────────────────────────────────────────────────

export type SalesMonthlyPoint = {
  yearMonth: string; // "YYYY-MM"
  year: number;
  month: number;
  omzet: number;
  transactions: number;
  products: number;
  atv: number;
  atu: number;
  targetOmzet: number;
  targetAtv: number;
  targetAtu: number;
  omzetCapaian: number; // 0–999
  atvCapaian: number;
  atuCapaian: number;
};

export type SalesBranchSummary = {
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  avgOmzetCapaian: number;
  totalOmzet: number;
  trend: "up" | "down" | "stable";
  monthlyData: SalesMonthlyPoint[];
};

const _pad2 = (n: number) => String(n).padStart(2, "0");

/** Parse sales_from / sales_to URL params, defaulting to last 12 months. */
export function parseSalesPeriod(
  fromRaw: string | undefined,
  toRaw: string | undefined,
  todayYear: number,
  todayMonth: number,
): { salesFrom: string; salesTo: string } {
  const salesTo = toRaw ?? `${todayYear}-${_pad2(todayMonth)}`;
  const [toY, toM] = salesTo.split("-").map(Number);
  const defFrom = new Date((toY ?? todayYear), ((toM ?? todayMonth) - 1) - 11, 1);
  const salesFrom = fromRaw ?? `${defFrom.getFullYear()}-${_pad2(defFrom.getMonth() + 1)}`;
  return { salesFrom, salesTo };
}

/** Return all months between from and to inclusive, capped at 24. */
export function getMonthsInRange(
  from: string,
  to: string,
): { year: number; month: number; yearMonth: string }[] {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const result: { year: number; month: number; yearMonth: string }[] = [];
  let y = fy!, m = fm!;
  while ((y < ty! || (y === ty! && m <= tm!)) && result.length < 24) {
    result.push({ year: y, month: m, yearMonth: `${y}-${_pad2(m)}` });
    if (m === 12) { y++; m = 1; } else { m++; }
  }
  return result;
}

/** Compare last-3-month avg vs prior-3-month avg to derive trend. */
export function computeSalesTrend(
  monthlyData: Pick<SalesMonthlyPoint, "omzet">[],
): "up" | "down" | "stable" {
  if (monthlyData.length < 4) return "stable";
  const n = monthlyData.length;
  const recent = monthlyData.slice(-3);
  const prior = monthlyData.slice(Math.max(0, n - 6), n - 3);
  if (prior.length === 0) return "stable";
  const recentAvg = recent.reduce((s, p) => s + p.omzet, 0) / recent.length;
  const priorAvg = prior.reduce((s, p) => s + p.omzet, 0) / prior.length;
  if (priorAvg <= 0) return "stable";
  const delta = (recentAvg - priorAvg) / priorAvg;
  if (delta > 0.05) return "up";
  if (delta < -0.05) return "down";
  return "stable";
}

// ─────────────────────────────────────────────────────────────────────────────

export const BBA_DASHBOARD_TABS = ["overview", "sales", "ops"] as const;
export type BbaDashboardTab = (typeof BBA_DASHBOARD_TABS)[number];

export function parseDashboardTab(raw: string | undefined): BbaDashboardTab {
  if (raw === "sales") return "sales";
  if (raw === "ops") return "ops";
  return "overview";
}
