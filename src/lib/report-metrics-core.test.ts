import test from "node:test";
import assert from "node:assert/strict";
import { computeReportFormula } from "@/lib/report-metrics-core";

test("computeReportFormula returns expected baseline metrics", () => {
  const result = computeReportFormula({
    rangeOmzet: 1_000_000,
    rangeTransactions: 100,
    rangeProducts: 250,
    rangeRejectedCustomers: 3,
    monthToDateOmzet: 10_000_000,
    monthTargetOmzet: 24_000_000,
    daysInMonth: 30,
    elapsedDayOfMonth: 10,
  });

  assert.equal(result.atv, 10_000);
  assert.equal(result.atu, 2.5);
  assert.equal(result.projectedRejectedOmzet, 30_000);
  assert.equal(result.targetToDate, 8_000_000);
  assert.equal(result.varianceToDate, 2_000_000);
  assert.equal(result.projectedOmzetEom, 30_000_000);
  assert.equal(result.projectedOmzetGap, 6_000_000);
});

test("computeReportFormula handles zero transactions safely", () => {
  const result = computeReportFormula({
    rangeOmzet: 0,
    rangeTransactions: 0,
    rangeProducts: 0,
    rangeRejectedCustomers: 5,
    monthToDateOmzet: 0,
    monthTargetOmzet: 0,
    daysInMonth: 30,
    elapsedDayOfMonth: 1,
  });

  assert.equal(result.atv, 0);
  assert.equal(result.atu, 0);
  assert.equal(result.projectedRejectedOmzet, 0);
});

test("computeReportFormula clamps invalid day input safely", () => {
  const result = computeReportFormula({
    rangeOmzet: 500_000,
    rangeTransactions: 50,
    rangeProducts: 120,
    rangeRejectedCustomers: 2,
    monthToDateOmzet: 2_000_000,
    monthTargetOmzet: 9_000_000,
    daysInMonth: 0,
    elapsedDayOfMonth: 0,
  });

  assert.equal(result.targetToDate, 9_000_000);
  assert.equal(result.projectedOmzetEom, 2_000_000);
  assert.equal(result.varianceToDate, -7_000_000);
});
