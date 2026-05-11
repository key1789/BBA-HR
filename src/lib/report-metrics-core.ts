export type ReportFormulaInput = {
  rangeOmzet: number;
  rangeTransactions: number;
  rangeProducts: number;
  rangeRejectedCustomers: number;
  monthToDateOmzet: number;
  monthTargetOmzet: number;
  daysInMonth: number;
  elapsedDayOfMonth: number;
};

export type ReportFormulaOutput = {
  atv: number;
  atu: number;
  projectedRejectedOmzet: number;
  targetToDate: number;
  varianceToDate: number;
  projectedOmzetEom: number;
  projectedOmzetGap: number;
};

export function computeReportFormula(input: ReportFormulaInput): ReportFormulaOutput {
  const safeDaysInMonth = Math.max(1, input.daysInMonth);
  const safeElapsed = Math.max(1, input.elapsedDayOfMonth);
  const atv = input.rangeTransactions > 0 ? input.rangeOmzet / input.rangeTransactions : 0;
  const atu = input.rangeTransactions > 0 ? input.rangeProducts / input.rangeTransactions : 0;
  const projectedRejectedOmzet = input.rangeRejectedCustomers * atv;
  const targetToDate = (input.monthTargetOmzet / safeDaysInMonth) * safeElapsed;
  const varianceToDate = input.monthToDateOmzet - targetToDate;
  const projectedOmzetEom = (input.monthToDateOmzet / safeElapsed) * safeDaysInMonth;
  const projectedOmzetGap = projectedOmzetEom - input.monthTargetOmzet;

  return {
    atv,
    atu,
    projectedRejectedOmzet,
    targetToDate,
    varianceToDate,
    projectedOmzetEom,
    projectedOmzetGap,
  };
}
