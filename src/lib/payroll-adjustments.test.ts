import test from "node:test";
import assert from "node:assert/strict";
import { customAdjMultiplier } from "@/lib/payroll-adjustments";

test("monthly (default) selalu ×1 apa pun hari masuk", () => {
  assert.equal(customAdjMultiplier({ basis: "monthly" }, 26), 1);
  assert.equal(customAdjMultiplier({ basis: "monthly" }, 0), 1);
  assert.equal(customAdjMultiplier({}, 26), 1);          // basis hilang → monthly
  assert.equal(customAdjMultiplier({ basis: null }, 26), 1);
});

test("daily dikali jumlah hari masuk", () => {
  assert.equal(customAdjMultiplier({ basis: "daily" }, 26), 26);
  assert.equal(customAdjMultiplier({ basis: "DAILY" }, 20), 20); // case-insensitive
});

test("daily saat hari masuk 0/blank → 0 (preview=persist, cegah underpay diam-diam)", () => {
  assert.equal(customAdjMultiplier({ basis: "daily" }, 0), 0);
});
