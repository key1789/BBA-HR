import { createClient } from "@/lib/supabase/server";

type SubmissionRow = {
  submission_date: string;
  omzet_total: number;
  transaction_total: number;
  product_total: number;
  rejected_customer_total: number;
};

export type ReportMetrics = {
  totalOmzet: number;
  accumulatedOmzet: number;
  targetOmzet: number;
  projectedOmzetEom: number;
  totalTransactions: number;
  totalProducts: number;
  atv: number;
  atu: number;
  rejectedCustomers: number;
  projectedRejectedOmzet: number;
  monthApprovedCount: number;
};

export type ReportMetricsOptions = {
  from?: string;
  to?: string;
};

function sumBy<T>(arr: T[], pick: (x: T) => number): number {
  return arr.reduce((acc, item) => acc + pick(item), 0);
}

export async function getReportMetricsForTenant(
  tenantId: string,
  options?: ReportMetricsOptions,
): Promise<ReportMetrics> {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const defaultTo = now.toISOString().slice(0, 10);

  const from = options?.from && options.from <= defaultTo ? options.from : defaultFrom;
  const to = options?.to && options.to >= from ? options.to : defaultTo;

  const rangeEnd = new Date(to);
  const targetMonth = rangeEnd.getMonth();
  const targetYear = rangeEnd.getFullYear();
  const monthEnd = new Date(targetYear, targetMonth + 1, 0);

  const supabase = await createClient();

  const [{ data: submissions }, { data: kpiConfig }] = await Promise.all([
    supabase
      .from("daily_submissions")
      .select(
        "submission_date, omzet_total, transaction_total, product_total, rejected_customer_total",
      )
      .eq("tenant_apotek_id", tenantId)
      .eq("status", "approved")
      .gte("submission_date", from)
      .lte("submission_date", to),
    supabase
      .from("kpi_configs")
      .select("target_omzet")
      .eq("tenant_apotek_id", tenantId)
      .eq("period_month", targetMonth + 1)
      .eq("period_year", targetYear)
      .maybeSingle(),
  ]);

  const rows = (submissions ?? []) as SubmissionRow[];
  const dailyRows = rows.filter((row) => row.submission_date === to);

  const totalOmzet = sumBy(dailyRows, (r) => Number(r.omzet_total));
  const totalTransactions = sumBy(dailyRows, (r) => Number(r.transaction_total));
  const totalProducts = sumBy(dailyRows, (r) => Number(r.product_total));
  const rejectedCustomers = sumBy(dailyRows, (r) => Number(r.rejected_customer_total));

  const accumulatedOmzet = sumBy(rows, (r) => Number(r.omzet_total));
  const targetOmzet = Number(kpiConfig?.target_omzet ?? 0);
  const daysInMonth = monthEnd.getDate();
  const elapsedDays = Math.max(rangeEnd.getDate(), 1);
  const projectedOmzetEom = elapsedDays > 0 ? (accumulatedOmzet / elapsedDays) * daysInMonth : 0;

  const atv = totalTransactions > 0 ? totalOmzet / totalTransactions : 0;
  const atu = totalTransactions > 0 ? totalProducts / totalTransactions : 0;
  const projectedRejectedOmzet = rejectedCustomers * atv;

  return {
    totalOmzet,
    accumulatedOmzet,
    targetOmzet,
    projectedOmzetEom,
    totalTransactions,
    totalProducts,
    atv,
    atu,
    rejectedCustomers,
    projectedRejectedOmzet,
    monthApprovedCount: rows.length,
  };
}
