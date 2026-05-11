import { createClient } from "@/lib/supabase/server";
import { computeReportFormula } from "@/lib/report-metrics-core";

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
  targetToDate: number;
  varianceToDate: number;
  projectedOmzetGap: number;
  projectedOmzetEom: number;
  totalTransactions: number;
  totalProducts: number;
  atv: number;
  atu: number;
  rejectedCustomers: number;
  projectedRejectedOmzet: number;
  monthApprovedCount: number;
  rangeApprovedCount: number;
  effectiveFrom: string;
  effectiveTo: string;
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

  const monthStart = new Date(targetYear, targetMonth, 1).toISOString().slice(0, 10);
  const [{ data: rangeSubmissions }, { data: monthSubmissions }, { data: kpiConfig }] = await Promise.all([
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
      .from("daily_submissions")
      .select("submission_date, omzet_total")
      .eq("tenant_apotek_id", tenantId)
      .eq("status", "approved")
      .gte("submission_date", monthStart)
      .lte("submission_date", to),
    supabase
      .from("kpi_configs")
      .select("target_omzet")
      .eq("tenant_apotek_id", tenantId)
      .eq("period_month", targetMonth + 1)
      .eq("period_year", targetYear)
      .maybeSingle(),
  ]);

  const rows = (rangeSubmissions ?? []) as SubmissionRow[];
  const monthRows = (monthSubmissions ?? []) as Pick<SubmissionRow, "submission_date" | "omzet_total">[];

  const totalOmzet = sumBy(rows, (r) => Number(r.omzet_total));
  const totalTransactions = sumBy(rows, (r) => Number(r.transaction_total));
  const totalProducts = sumBy(rows, (r) => Number(r.product_total));
  const rejectedCustomers = sumBy(rows, (r) => Number(r.rejected_customer_total));

  const accumulatedOmzet = sumBy(monthRows, (r) => Number(r.omzet_total));
  const targetOmzet = Number(kpiConfig?.target_omzet ?? 0);
  const daysInMonth = monthEnd.getDate();
  const elapsedDays = Math.max(rangeEnd.getDate(), 1);
  const {
    atv,
    atu,
    projectedRejectedOmzet,
    targetToDate,
    varianceToDate,
    projectedOmzetEom,
    projectedOmzetGap,
  } = computeReportFormula({
    rangeOmzet: totalOmzet,
    rangeTransactions: totalTransactions,
    rangeProducts: totalProducts,
    rangeRejectedCustomers: rejectedCustomers,
    monthToDateOmzet: accumulatedOmzet,
    monthTargetOmzet: targetOmzet,
    daysInMonth,
    elapsedDayOfMonth: elapsedDays,
  });

  return {
    totalOmzet,
    accumulatedOmzet,
    targetOmzet,
    targetToDate,
    varianceToDate,
    projectedOmzetGap,
    projectedOmzetEom,
    totalTransactions,
    totalProducts,
    atv,
    atu,
    rejectedCustomers,
    projectedRejectedOmzet,
    monthApprovedCount: monthRows.length,
    rangeApprovedCount: rows.length,
    effectiveFrom: from,
    effectiveTo: to,
  };
}
