import test from "node:test";
import assert from "node:assert/strict";
import { productFokusEarnedForConfig, computeProductFokusBonusTotalForUser, describeProductFokusRule } from "@/lib/produk-fokus-core";

const earned = productFokusEarnedForConfig;

test("describeProductFokusRule — 5 skema tampil sbg kalimat benar", () => {
  assert.match(
    describeProductFokusRule({ bonus_type: "flat", has_min_target: true, target_value: 10, bonus_value: 5000 }),
    /Rp5\.000 \(sekali\) jika crew menjual minimal 10 unit/,
  );
  assert.match(
    describeProductFokusRule({ bonus_type: "flat", has_min_target: false, bonus_value: 5000 }),
    /Rp5\.000 \(sekali\) begitu crew menjual/,
  );
  assert.match(
    describeProductFokusRule({ bonus_type: "kelipatan", has_min_target: false, bonus_value: 1000, bonus_step: 2 }),
    /Rp1\.000 setiap 2 unit terjual — tanpa target minimal/,
  );
  assert.match(
    describeProductFokusRule({ bonus_type: "kelipatan", has_min_target: true, target_value: 50, bonus_value: 2000, bonus_step: 1, count_base: "excess" }),
    /Setelah capai 50 unit.*KELEBIHAN di atas target/,
  );
  assert.match(
    describeProductFokusRule({ bonus_type: "kelipatan", has_min_target: true, target_value: 50, bonus_value: 2000, bonus_step: 1, count_base: "full" }),
    /Setelah capai 50 unit.*SELURUH penjualan/,
  );
});

test("Skema 1 — flat + pakai target: bayar penuh saat tembus target, inklusif", () => {
  const cfg = { bonus_type: "flat", target_value: 31, bonus_value: 20000, has_min_target: true };
  assert.equal(earned(cfg, 30), 0);
  assert.equal(earned(cfg, 31), 20000);
  assert.equal(earned(cfg, 100), 20000);
});

test("Skema 2 — flat + tanpa target: asal jual >= 1 dapat bonus tetap", () => {
  const cfg = { bonus_type: "flat", bonus_value: 10000, has_min_target: false };
  assert.equal(earned(cfg, 0), 0);
  assert.equal(earned(cfg, 1), 10000);
  assert.equal(earned(cfg, 100), 10000);
});

test("Skema 3 — kelipatan + target, Rasa A (excess): hanya kelebihan di atas target", () => {
  const cfg = { bonus_type: "kelipatan", target_value: 50, bonus_value: 2000, bonus_step: 1, has_min_target: true, count_base: "excess" };
  assert.equal(earned(cfg, 49), 0);
  assert.equal(earned(cfg, 50), 0);
  assert.equal(earned(cfg, 55), 10000);
  assert.equal(earned(cfg, 60), 20000);
});

test("Skema 4 — kelipatan + target, Rasa B (full): semua unit begitu target tercapai", () => {
  const cfg = { bonus_type: "kelipatan", target_value: 50, bonus_value: 2000, bonus_step: 1, has_min_target: true, count_base: "full" };
  assert.equal(earned(cfg, 49), 0);
  assert.equal(earned(cfg, 50), 100000);
  assert.equal(earned(cfg, 60), 120000);
});

test("Skema 5 — kelipatan + tanpa target: komisi dari unit ke-1", () => {
  const cfg = { bonus_type: "kelipatan", bonus_value: 2000, bonus_step: 1, has_min_target: false };
  assert.equal(earned(cfg, 0), 0);
  assert.equal(earned(cfg, 1), 2000);
  assert.equal(earned(cfg, 50), 100000);
});

test("Step > 1 — kelipatan per N unit", () => {
  const cfg = { bonus_type: "kelipatan", bonus_value: 2000, bonus_step: 5, has_min_target: false };
  assert.equal(earned(cfg, 49), 18000);
  assert.equal(earned(cfg, 50), 20000);
});

test("computeProductFokusBonusTotalForUser: agregasi per crew + rentang tanggal + skema", () => {
  const configs = [
    { product_id: "p1", bonus_type: "kelipatan", target_value: 50, bonus_value: 2000, bonus_step: 1, has_min_target: true, count_base: "excess" },
  ];
  const rows = [
    { product_id: "p1", quantity_sold: 30, submission: { user_id: "u1", submission_date: "2026-07-10" } },
    { product_id: "p1", quantity_sold: 25, submission: { user_id: "u1", submission_date: "2026-07-11" } },
    { product_id: "p1", quantity_sold: 100, submission: { user_id: "u2", submission_date: "2026-07-10" } },
    { product_id: "p1", quantity_sold: 999, submission: { user_id: "u1", submission_date: "2026-08-01" } },
  ];
  const bounds = { monthStartKey: "2026-07-01", mtdThroughDateKey: "2026-07-31" };
  assert.equal(computeProductFokusBonusTotalForUser("u1", configs, rows, bounds), 10000);
  assert.equal(computeProductFokusBonusTotalForUser("u2", configs, rows, bounds), 100000);
  assert.equal(computeProductFokusBonusTotalForUser("u3", configs, rows, bounds), 0);
});

test("Data lama tanpa kolom baru diperlakukan pakai-target + excess (Rasa A)", () => {
  const legacy = { bonus_type: "kelipatan", target_value: 50, bonus_value: 2000, bonus_step: 1 };
  assert.equal(earned(legacy, 50), 0);
  assert.equal(earned(legacy, 60), 20000);
  const legacyFlat = { bonus_type: "flat", target_value: 31, bonus_value: 20000 };
  assert.equal(earned(legacyFlat, 30), 0);
  assert.equal(earned(legacyFlat, 31), 20000);
});
