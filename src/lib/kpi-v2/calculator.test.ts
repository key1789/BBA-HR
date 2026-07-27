import test from "node:test";
import assert from "node:assert/strict";
import { calculateMonthlyBonusFromInputs, type CrewAchievementRow, type DailyAchievementRow } from "./calculator";
import { createDefaultKpiV2Config } from "./utils";
import type { KpiConfigV2 } from "../types/kpi-v2";

const NO_DAILY: DailyAchievementRow[] = [];

function baseConfig(): KpiConfigV2 {
  const c = createDefaultKpiV2Config();
  c.global.target_omzet = 1000;
  return c;
}

// ── A1: ATV sekarang benar-benar dihitung ────────────────────────────────────
test("A1: ATV counts when global-enabled + weight>0 (composite below min → no bonus)", () => {
  const c = baseConfig();
  c.global.is_atv_enabled = true;
  c.global.target_atv = 100;
  c.team_monthly = {
    ...c.team_monthly,
    enabled: true,
    weight_omzet: 50,
    weight_atv: 50,
    min_achievement_percent: 100,
    bonus_type: "flat",
    flat_nominal: 500,
    distribution_method: "equal",
  };

  // Omzet 100% target, tapi ATV cuma 50% (50 dari target 100) → skor komposit 75 < 100.
  const crew: CrewAchievementRow[] = [
    { user_id: "u1", achievement_date: "2026-07-01", omzet: 1000, transactions: 20, items: 30 },
  ];
  const res = calculateMonthlyBonusFromInputs(c, NO_DAILY, crew);
  const u1 = res.find((r) => r.user_id === "u1");
  // Kalau ATV diabaikan (bug lama), skor=100 → bonus 500. Sekarang harus 0.
  assert.equal(u1?.team_monthly_bonus ?? 0, 0);
});

test("A1: ATV weight ignored when global flag OFF (omzet-only, bonus paid)", () => {
  const c = baseConfig();
  c.global.is_atv_enabled = false; // dimatikan per-apotek
  c.global.target_atv = 100;
  c.team_monthly = {
    ...c.team_monthly,
    enabled: true,
    weight_omzet: 50,
    weight_atv: 50, // ada bobot tapi global OFF → tak dihitung
    min_achievement_percent: 100,
    bonus_type: "flat",
    flat_nominal: 500,
    distribution_method: "equal",
  };
  const crew: CrewAchievementRow[] = [
    { user_id: "u1", achievement_date: "2026-07-01", omzet: 1000, transactions: 20, items: 30 },
  ];
  const res = calculateMonthlyBonusFromInputs(c, NO_DAILY, crew);
  const u1 = res.find((r) => r.user_id === "u1");
  assert.equal(u1?.team_monthly_bonus ?? 0, 500);
});

// ── A2: Individual Daily manual membaca porsi bulanan (bukan fair-share) ───────
test("A2: individual_daily manual uses porsi ÷ working_days, not fair-share", () => {
  const c = baseConfig();
  c.global.target_omzet = 99999; // fair-share akan besar → skor kecil → 0 bonus jika salah
  c.global.default_working_days = 26;
  c.individual_daily = {
    ...c.individual_daily,
    enabled: true,
    target_distribution: "manual",
    min_achievement_percent: 100,
    bonus_type: "flat",
    flat_nominal: 10,
    user_configs: {
      u1: { target_omzet: 2600, working_days: 26 }, // porsi/hari = 100
    },
  };
  const crew: CrewAchievementRow[] = [
    { user_id: "u1", achievement_date: "2026-07-01", omzet: 100, transactions: 5, items: 8 },
  ];
  const res = calculateMonthlyBonusFromInputs(c, NO_DAILY, crew);
  const u1 = res.find((r) => r.user_id === "u1");
  // Target harian efektif = 2600/26 = 100 → capai 100% → flat 10.
  // Kalau masih fair-share (99999/1/26 ≈ 3846), skor ≈ 2.6% → 0.
  assert.equal(u1?.individual_daily_bonus ?? 0, 10);
});

test("A2: individual_daily manual override harian menang atas porsi", () => {
  const c = baseConfig();
  c.individual_daily = {
    ...c.individual_daily,
    enabled: true,
    target_distribution: "manual",
    min_achievement_percent: 100,
    bonus_type: "flat",
    flat_nominal: 7,
    user_configs: {
      u1: { target_omzet: 2600, working_days: 26, target_omzet_daily: 50 }, // override = 50
    },
  };
  const crew: CrewAchievementRow[] = [
    { user_id: "u1", achievement_date: "2026-07-01", omzet: 50, transactions: 3, items: 4 },
  ];
  const res = calculateMonthlyBonusFromInputs(c, NO_DAILY, crew);
  const u1 = res.find((r) => r.user_id === "u1");
  // Target = override 50 → omzet 50 = 100% → flat 7. (porsi/hari 100 akan gagal.)
  assert.equal(u1?.individual_daily_bonus ?? 0, 7);
});

// ── B2: multi-shift/hari tidak dobel-hitung ──────────────────────────────────
test("B2: two shifts same day count as ONE day (flat paid once)", () => {
  const c = baseConfig();
  c.global.target_omzet = 50;
  c.global.default_working_days = 1;
  c.individual_daily = {
    ...c.individual_daily,
    enabled: true,
    target_distribution: "rata",
    min_achievement_percent: 100,
    bonus_type: "flat",
    flat_nominal: 5,
  };
  // Satu crew, satu tanggal, DUA closingan (2 shift) masing-masing 60.
  const crew: CrewAchievementRow[] = [
    { user_id: "u1", achievement_date: "2026-07-01", omzet: 60, transactions: 4, items: 6 },
    { user_id: "u1", achievement_date: "2026-07-01", omzet: 60, transactions: 4, items: 6 },
  ];
  const res = calculateMonthlyBonusFromInputs(c, NO_DAILY, crew, { activeCrewCount: 1 });
  const u1 = res.find((r) => r.user_id === "u1");
  // Digabung jadi 120 vs target 50 → 1 hari tercapai → flat 5 SEKALI (bukan 10).
  assert.equal(u1?.individual_daily_bonus ?? 0, 5);
});

// ── B3: target "rata" dibagi crew AKTIF, bukan yang kebetulan input ───────────
test("B3: individual_monthly rata divides by activeCrewCount (stable target)", () => {
  const c = baseConfig();
  c.global.target_omzet = 300;
  c.individual_monthly = {
    ...c.individual_monthly,
    enabled: true,
    target_distribution: "rata",
    min_achievement_percent: 100,
    bonus_type: "flat",
    flat_nominal: 8,
  };
  // Hanya 1 dari 3 crew yang input.
  const crew: CrewAchievementRow[] = [
    { user_id: "u1", achievement_date: "2026-07-01", omzet: 100, transactions: 5, items: 8 },
  ];
  // Dengan activeCrewCount=3 → target per orang 100 → capai 100% → flat 8.
  const withActive = calculateMonthlyBonusFromInputs(c, NO_DAILY, crew, { activeCrewCount: 3 });
  assert.equal(withActive.find((r) => r.user_id === "u1")?.individual_monthly_bonus ?? 0, 8);

  // Tanpa activeCrewCount (fallback = jumlah submitter = 1) → target 300 → 33% → 0.
  const withoutActive = calculateMonthlyBonusFromInputs(c, NO_DAILY, crew);
  assert.equal(withoutActive.find((r) => r.user_id === "u1")?.individual_monthly_bonus ?? 0, 0);
});

// ── Sanity: omzet-only tetap benar ────────────────────────────────────────────
test("sanity: omzet-only team monthly pays flat when target met", () => {
  const c = baseConfig();
  c.team_monthly = {
    ...c.team_monthly,
    enabled: true,
    min_achievement_percent: 100,
    bonus_type: "flat",
    flat_nominal: 300,
    distribution_method: "equal",
  };
  const crew: CrewAchievementRow[] = [
    { user_id: "u1", achievement_date: "2026-07-01", omzet: 600, transactions: 10, items: 15 },
    { user_id: "u2", achievement_date: "2026-07-01", omzet: 600, transactions: 10, items: 15 },
  ];
  const res = calculateMonthlyBonusFromInputs(c, NO_DAILY, crew);
  // Tim total 1200 ≥ 1000 target → flat 300 dibagi rata 2 = 150 masing-masing.
  assert.equal(res.find((r) => r.user_id === "u1")?.team_monthly_bonus ?? 0, 150);
  assert.equal(res.find((r) => r.user_id === "u2")?.team_monthly_bonus ?? 0, 150);
});
