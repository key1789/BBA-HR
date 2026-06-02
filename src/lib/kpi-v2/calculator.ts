import { createAdminClient } from "@/lib/supabase/admin";
import type { BonusType, KpiConfigV2 } from "@/lib/types/kpi-v2";
import { calculateDailyTargetPerUser, calculateTeamDailyTarget } from "./utils";

export interface DailyAchievementRow {
  achievement_date: string;
  total_omzet: number;
  total_transactions: number;
  total_items: number;
}

/** Key harus konsisten dengan `user_configs` di KPI V2 (mis. app_users.id jika data omzet per user memakai itu). */
export interface CrewAchievementRow {
  user_id: string;
  achievement_date: string;
  omzet: number;
  transactions: number;
  items: number;
}

export interface BonusBreakdown {
  target: number;
  actual: number;
  achievement_percent: number;
  bonus_earned: number;
  notes: string;
}

export interface BonusResult {
  user_id: string;
  team_monthly_bonus: number;
  team_daily_bonus: number;
  individual_monthly_bonus: number;
  individual_daily_bonus: number;
  total_bonus: number;
  breakdown: {
    team_monthly?: BonusBreakdown;
    team_daily?: BonusBreakdown;
    individual_monthly?: BonusBreakdown;
    individual_daily?: BonusBreakdown;
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function periodBounds(year: number, month: number): { startDate: string; endDate: string } {
  const startDate = `${year}-${pad2(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${pad2(month)}-${pad2(lastDay)}`;
  return { startDate, endDate };
}

function calculateAchievementScore(
  actualOmzet: number,
  actualAtv: number,
  actualAtu: number,
  targetOmzet: number,
  targetAtv: number,
  targetAtu: number,
  weightOmzet: number,
  weightAtv: number,
  weightAtu: number,
  useOmzet: boolean,
  useAtv: boolean,
  useAtu: boolean,
  globalAtvEnabled: boolean,
  globalAtuEnabled: boolean,
): number {
  let score = 0;
  let totalWeight = 0;

  if (useOmzet && targetOmzet > 0) {
    const omzetPercent = (actualOmzet / targetOmzet) * 100;
    score += omzetPercent * (weightOmzet / 100);
    totalWeight += weightOmzet;
  }

  if (useAtv && globalAtvEnabled && targetAtv > 0) {
    const atvPercent = (actualAtv / targetAtv) * 100;
    score += atvPercent * (weightAtv / 100);
    totalWeight += weightAtv;
  }

  if (useAtu && globalAtuEnabled && targetAtu > 0) {
    const atuPercent = (actualAtu / targetAtu) * 100;
    score += atuPercent * (weightAtu / 100);
    totalWeight += weightAtu;
  }

  if (totalWeight > 0 && totalWeight !== 100) {
    score = (score / totalWeight) * 100;
  }

  return score;
}

function calculateBonusAmount(
  achievementScore: number,
  actualOmzet: number,
  targetOmzet: number,
  minAchievementPercent: number,
  bonusType: BonusType,
  flatNominal: number,
  kelipatanStep: number,
  kelipatanReward: number,
): number {
  if (achievementScore < minAchievementPercent) {
    return 0;
  }

  if (bonusType === "flat") {
    return flatNominal;
  }

  if (bonusType === "kelipatan") {
    const excess = actualOmzet - targetOmzet;
    if (excess <= 0 || kelipatanStep <= 0) return 0;
    const multiplier = Math.floor(excess / kelipatanStep);
    return multiplier * kelipatanReward;
  }

  return 0;
}

function calculateTeamMonthly(
  config: KpiConfigV2,
  crewAchievements: CrewAchievementRow[],
): Record<string, { bonus: number; breakdown: BonusBreakdown }> {
  const scheme = config.team_monthly;
  if (!scheme.enabled) return {};

  const teamTotalOmzet = crewAchievements.reduce((sum, ca) => sum + ca.omzet, 0);
  const teamTotalTx = crewAchievements.reduce((sum, ca) => sum + ca.transactions, 0);
  const teamTotalItems = crewAchievements.reduce((sum, ca) => sum + ca.items, 0);

  const teamAtv = teamTotalTx > 0 ? teamTotalOmzet / teamTotalTx : 0;
  const teamAtu = teamTotalTx > 0 ? teamTotalItems / teamTotalTx : 0;

  const achievementScore = calculateAchievementScore(
    teamTotalOmzet,
    teamAtv,
    teamAtu,
    config.global.target_omzet,
    config.global.target_atv,
    config.global.target_atu,
    scheme.weight_omzet,
    scheme.weight_atv,
    scheme.weight_atu,
    scheme.use_omzet,
    scheme.use_atv,
    scheme.use_atu,
    config.global.is_atv_enabled,
    config.global.is_atu_enabled,
  );

  const totalBonus = calculateBonusAmount(
    achievementScore,
    teamTotalOmzet,
    config.global.target_omzet,
    scheme.min_achievement_percent,
    scheme.bonus_type,
    scheme.flat_nominal,
    scheme.kelipatan_step,
    scheme.kelipatan_reward,
  );

  if (totalBonus === 0) return {};

  const result: Record<string, { bonus: number; breakdown: BonusBreakdown }> = {};

  if (scheme.distribution_method === "equal") {
    const uniqueUsers = Array.from(new Set(crewAchievements.map((ca) => ca.user_id)));
    if (uniqueUsers.length === 0) return {};
    const perUser = totalBonus / uniqueUsers.length;

    uniqueUsers.forEach((userId) => {
      result[userId] = {
        bonus: perUser,
        breakdown: {
          target: config.global.target_omzet,
          actual: teamTotalOmzet,
          achievement_percent: achievementScore,
          bonus_earned: perUser,
          notes: `Team bonus (bagi rata) — ${achievementScore.toFixed(1)}% pencapaian`,
        },
      };
    });
  } else {
    crewAchievements.forEach((ca) => {
      const proportion = teamTotalOmzet > 0 ? ca.omzet / teamTotalOmzet : 0;
      const userBonus = totalBonus * proportion;

      if (!result[ca.user_id]) {
        result[ca.user_id] = {
          bonus: 0,
          breakdown: {
            target: config.global.target_omzet,
            actual: teamTotalOmzet,
            achievement_percent: achievementScore,
            bonus_earned: 0,
            notes: "",
          },
        };
      }

      result[ca.user_id].bonus += userBonus;
      result[ca.user_id].breakdown.bonus_earned = result[ca.user_id].bonus;
      result[ca.user_id].breakdown.notes = `Team bonus (proporsional ${(proportion * 100).toFixed(1)}%)`;
    });
  }

  return result;
}

function calculateTeamDaily(
  config: KpiConfigV2,
  dailyAchievements: DailyAchievementRow[],
  crewAchievements: CrewAchievementRow[],
): Record<string, { bonus: number; breakdown: BonusBreakdown }> {
  const scheme = config.team_daily;
  if (!scheme.enabled) return {};

  const dailyTarget = calculateTeamDailyTarget(
    config.global.target_omzet,
    config.global.default_working_days || 26,
  );
  const result: Record<string, { bonus: number; breakdown: BonusBreakdown }> = {};
  let totalDaysAchieved = 0;

  dailyAchievements.forEach((day) => {
    if (dailyTarget <= 0) return;
    const achievementScore = (day.total_omzet / dailyTarget) * 100;

    if (achievementScore >= scheme.min_achievement_percent) {
      totalDaysAchieved++;

      const dayBonus = calculateBonusAmount(
        achievementScore,
        day.total_omzet,
        dailyTarget,
        scheme.min_achievement_percent,
        scheme.bonus_type,
        scheme.flat_nominal,
        scheme.kelipatan_step,
        scheme.kelipatan_reward,
      );

      if (dayBonus > 0) {
        const dayCrews = crewAchievements.filter(
          (ca) => String(ca.achievement_date).slice(0, 10) === String(day.achievement_date).slice(0, 10),
        );

        if (dayCrews.length === 0) return;

        if (scheme.distribution_method === "equal") {
          const perUser = dayBonus / dayCrews.length;
          dayCrews.forEach((ca) => {
            if (!result[ca.user_id]) {
              result[ca.user_id] = {
                bonus: 0,
                breakdown: {
                  target: dailyTarget,
                  actual: 0,
                  achievement_percent: 0,
                  bonus_earned: 0,
                  notes: "",
                },
              };
            }
            result[ca.user_id].bonus += perUser;
          });
        } else {
          const dayTotal = dayCrews.reduce((sum, ca) => sum + ca.omzet, 0);
          dayCrews.forEach((ca) => {
            const proportion = dayTotal > 0 ? ca.omzet / dayTotal : 0;
            const userBonus = dayBonus * proportion;

            if (!result[ca.user_id]) {
              result[ca.user_id] = {
                bonus: 0,
                breakdown: {
                  target: dailyTarget,
                  actual: 0,
                  achievement_percent: 0,
                  bonus_earned: 0,
                  notes: "",
                },
              };
            }
            result[ca.user_id].bonus += userBonus;
          });
        }
      }
    }
  });

  Object.keys(result).forEach((userId) => {
    const userDates = new Set<string>();
    for (const ca of crewAchievements) {
      if (String(ca.user_id) !== String(userId)) continue;
      const dk = String(ca.achievement_date ?? "").slice(0, 10);
      if (dk) userDates.add(dk);
    }
    const daysWithData = userDates.size > 0 ? userDates.size : dailyAchievements.length;
    const denom = Math.max(daysWithData, 1);

    result[userId].breakdown.bonus_earned = result[userId].bonus;
    result[userId].breakdown.achievement_percent = (totalDaysAchieved / denom) * 100;
    result[userId].breakdown.notes = `Team harian — ${totalDaysAchieved} / ${daysWithData} hari tercapai`;
  });

  return result;
}

function calculateIndividualMonthly(
  config: KpiConfigV2,
  crewAchievements: CrewAchievementRow[],
): Record<string, { bonus: number; breakdown: BonusBreakdown }> {
  const scheme = config.individual_monthly;
  if (!scheme.enabled) return {};

  const result: Record<string, { bonus: number; breakdown: BonusBreakdown }> = {};

  const userTotals = crewAchievements.reduce(
    (acc, ca) => {
      if (!acc[ca.user_id]) {
        acc[ca.user_id] = { omzet: 0, transactions: 0, items: 0 };
      }
      acc[ca.user_id].omzet += ca.omzet;
      acc[ca.user_id].transactions += ca.transactions;
      acc[ca.user_id].items += ca.items;
      return acc;
    },
    {} as Record<string, { omzet: number; transactions: number; items: number }>,
  );

  // Fair-share per orang = target global ÷ jumlah crew yang ada data periode ini.
  // Dipakai sebagai target default untuk KEDUA mode (rata maupun manual).
  // Mode manual meng-override nilai ini via user_configs[userId].target_omzet di bawah.
  const userCount = Math.max(Object.keys(userTotals).length, 1);
  const baseTarget = config.global.target_omzet / userCount;

  Object.entries(userTotals).forEach(([userId, totals]) => {
    let userTarget = baseTarget;
    const userConfig = scheme.user_configs?.[userId];
    const weights = { omzet: scheme.weight_omzet, atv: scheme.weight_atv, atu: scheme.weight_atu };
    const bonusCfg = {
      type: scheme.bonus_type,
      flat: scheme.flat_nominal,
      step: scheme.kelipatan_step,
      reward: scheme.kelipatan_reward,
    };

    if (scheme.target_distribution === "manual" && userConfig) {
      if (userConfig.target_omzet != null) userTarget = Number(userConfig.target_omzet) || userTarget;
      if (userConfig.weight_omzet !== undefined) weights.omzet = userConfig.weight_omzet;
      if (userConfig.weight_atv !== undefined) weights.atv = userConfig.weight_atv;
      if (userConfig.weight_atu !== undefined) weights.atu = userConfig.weight_atu;
      if (userConfig.bonus_type) bonusCfg.type = userConfig.bonus_type;
      if (userConfig.flat_nominal !== undefined) bonusCfg.flat = userConfig.flat_nominal;
      if (userConfig.kelipatan_step !== undefined) bonusCfg.step = userConfig.kelipatan_step;
      if (userConfig.kelipatan_reward !== undefined) bonusCfg.reward = userConfig.kelipatan_reward;
    }

    const userAtv = totals.transactions > 0 ? totals.omzet / totals.transactions : 0;
    const userAtu = totals.transactions > 0 ? totals.items / totals.transactions : 0;

    const achievementScore = calculateAchievementScore(
      totals.omzet,
      userAtv,
      userAtu,
      userTarget,
      config.global.target_atv,
      config.global.target_atu,
      weights.omzet,
      weights.atv,
      weights.atu,
      scheme.use_omzet,
      scheme.use_atv,
      scheme.use_atu,
      config.global.is_atv_enabled,
      config.global.is_atu_enabled,
    );

    const bonus = calculateBonusAmount(
      achievementScore,
      totals.omzet,
      userTarget,
      scheme.min_achievement_percent,
      bonusCfg.type,
      bonusCfg.flat,
      bonusCfg.step,
      bonusCfg.reward,
    );

    result[userId] = {
      bonus,
      breakdown: {
        target: userTarget,
        actual: totals.omzet,
        achievement_percent: achievementScore,
        bonus_earned: bonus,
        notes: `Individu bulanan — ${achievementScore.toFixed(1)}%`,
      },
    };
  });

  return result;
}

function calculateIndividualDaily(
  config: KpiConfigV2,
  crewAchievements: CrewAchievementRow[],
): Record<string, { bonus: number; breakdown: BonusBreakdown }> {
  const scheme = config.individual_daily;
  if (!scheme.enabled) return {};

  const result: Record<string, { bonus: number; breakdown: BonusBreakdown }> = {};
  const wdGlobal = config.global.default_working_days || 26;
  const activeUserCount = new Set(crewAchievements.map((c) => c.user_id)).size || 1;

  crewAchievements.forEach((ca) => {
    let workingDays = wdGlobal;
    // Fair-share sebagai default untuk kedua mode (rata & manual).
    // Mode manual meng-override via userConfig.target_omzet_daily di bawah.
    let dailyTarget = calculateDailyTargetPerUser(
      config.global.target_omzet,
      activeUserCount,
      workingDays,
    );
    const bonusCfg = {
      type: scheme.bonus_type,
      flat: scheme.flat_nominal,
      step: scheme.kelipatan_step,
      reward: scheme.kelipatan_reward,
    };

    const userConfig = scheme.user_configs?.[ca.user_id];
    if (userConfig) {
      if (userConfig.working_days) workingDays = userConfig.working_days;
      if (userConfig.target_omzet_daily != null) {
        dailyTarget = Number(userConfig.target_omzet_daily) || dailyTarget;
      } else if (scheme.target_distribution === "rata") {
        dailyTarget = calculateDailyTargetPerUser(config.global.target_omzet, activeUserCount, workingDays);
      }
      if (userConfig.bonus_type) bonusCfg.type = userConfig.bonus_type;
      if (userConfig.flat_nominal !== undefined) bonusCfg.flat = userConfig.flat_nominal;
      if (userConfig.kelipatan_step !== undefined) bonusCfg.step = userConfig.kelipatan_step;
      if (userConfig.kelipatan_reward !== undefined) bonusCfg.reward = userConfig.kelipatan_reward;
    }

    if (dailyTarget <= 0) return;

    const achievementScore = (ca.omzet / dailyTarget) * 100;

    if (achievementScore >= scheme.min_achievement_percent) {
      const dayBonus = calculateBonusAmount(
        achievementScore,
        ca.omzet,
        dailyTarget,
        scheme.min_achievement_percent,
        bonusCfg.type,
        bonusCfg.flat,
        bonusCfg.step,
        bonusCfg.reward,
      );

      if (!result[ca.user_id]) {
        result[ca.user_id] = {
          bonus: 0,
          breakdown: {
            target: dailyTarget,
            actual: 0,
            achievement_percent: 0,
            bonus_earned: 0,
            notes: "",
          },
        };
      }
      result[ca.user_id].bonus += dayBonus;
    }
  });

  Object.keys(result).forEach((userId) => {
    const scheme = config.individual_daily;
    const activeUserCount = new Set(crewAchievements.map((c) => c.user_id)).size || 1;
    const userConfig = scheme.user_configs?.[userId];
    const wdGlobal = config.global.default_working_days || 26;
    const workingDays = userConfig?.working_days ?? wdGlobal;
    // Fair-share sebagai default; override via target_omzet_daily jika ada.
    let dailyTarget = calculateDailyTargetPerUser(
      config.global.target_omzet,
      activeUserCount,
      workingDays,
    );
    if (userConfig?.target_omzet_daily != null) {
      dailyTarget = Number(userConfig.target_omzet_daily) || dailyTarget;
    }

    const byDate = new Map<string, number>();
    for (const r of crewAchievements) {
      if (String(r.user_id) !== String(userId)) continue;
      const dk = String(r.achievement_date ?? "").slice(0, 10);
      if (!dk) continue;
      byDate.set(dk, (byDate.get(dk) ?? 0) + Number(r.omzet ?? 0));
    }

    let daysAchieved = 0;
    for (const omzet of byDate.values()) {
      if (dailyTarget > 0 && (omzet / dailyTarget) * 100 >= scheme.min_achievement_percent) {
        daysAchieved++;
      }
    }
    const daysWithData = byDate.size;
    const denom = Math.max(daysWithData, 1);

    result[userId].breakdown.bonus_earned = result[userId].bonus;
    result[userId].breakdown.achievement_percent = (daysAchieved / denom) * 100;
    result[userId].breakdown.notes = `Individu harian — ${daysAchieved} / ${daysWithData} hari tercapai`;
  });

  return result;
}

export function calculateMonthlyBonusFromInputs(
  config: KpiConfigV2,
  dailyAchievements: DailyAchievementRow[],
  crewAchievements: CrewAchievementRow[],
): BonusResult[] {
  const teamMonthly = calculateTeamMonthly(config, crewAchievements);
  const teamDaily = calculateTeamDaily(config, dailyAchievements, crewAchievements);
  const individualMonthly = calculateIndividualMonthly(config, crewAchievements);
  const individualDaily = calculateIndividualDaily(config, crewAchievements);

  const allUserIds = Array.from(
    new Set([
      ...Object.keys(teamMonthly),
      ...Object.keys(teamDaily),
      ...Object.keys(individualMonthly),
      ...Object.keys(individualDaily),
    ]),
  );

  return allUserIds.map((userId) => ({
    user_id: userId,
    team_monthly_bonus: teamMonthly[userId]?.bonus || 0,
    team_daily_bonus: teamDaily[userId]?.bonus || 0,
    individual_monthly_bonus: individualMonthly[userId]?.bonus || 0,
    individual_daily_bonus: individualDaily[userId]?.bonus || 0,
    total_bonus:
      (teamMonthly[userId]?.bonus || 0) +
      (teamDaily[userId]?.bonus || 0) +
      (individualMonthly[userId]?.bonus || 0) +
      (individualDaily[userId]?.bonus || 0),
    breakdown: {
      team_monthly: teamMonthly[userId]?.breakdown,
      team_daily: teamDaily[userId]?.breakdown,
      individual_monthly: individualMonthly[userId]?.breakdown,
      individual_daily: individualDaily[userId]?.breakdown,
    },
  }));
}

/**
 * Satu angka pencapaian / target untuk ringkasan audit (multi-skema).
 * Prioritas: individu bulanan → tim bulanan → individu harian → tim harian.
 */
export function pickPrimaryKpiDisplayFromBonusResult(
  br: BonusResult,
  config: KpiConfigV2,
  crewCount: number,
): { achievement_percent: number; target_omzet_display: number } {
  const n = Math.max(crewCount, 1);
  if (config.individual_monthly.enabled && br.breakdown.individual_monthly) {
    const b = br.breakdown.individual_monthly;
    return { achievement_percent: b.achievement_percent, target_omzet_display: b.target };
  }
  if (config.team_monthly.enabled && br.breakdown.team_monthly) {
    const b = br.breakdown.team_monthly;
    return {
      achievement_percent: b.achievement_percent,
      target_omzet_display: config.global.target_omzet > 0 ? config.global.target_omzet / n : 0,
    };
  }
  if (config.individual_daily.enabled && br.breakdown.individual_daily) {
    const b = br.breakdown.individual_daily;
    // b.target is the DAILY target from the calculator (which may use a stale activeUserCount).
    // Return the MONTHLY equivalent using the actual crew count (n) so the chart can divide
    // by effectiveWorkDays and get the correct per-day target line.
    const userConfig = config.individual_daily.user_configs?.[br.user_id];
    const monthlyEquivalent =
      userConfig?.target_omzet_daily != null
        ? // Manual override: daily → monthly
          (Number(userConfig.target_omzet_daily) || 0) *
          ((userConfig.working_days ?? config.global.default_working_days ?? 26) || 26)
        : // Fair-share using actual crew count (n) passed from the caller
          n > 0 ? config.global.target_omzet / n : config.global.target_omzet;
    return { achievement_percent: b.achievement_percent, target_omzet_display: monthlyEquivalent };
  }
  if (config.team_daily.enabled && br.breakdown.team_daily) {
    const b = br.breakdown.team_daily;
    return {
      achievement_percent: b.achievement_percent,
      target_omzet_display: n > 0 ? b.target / n : b.target,
    };
  }
  return {
    achievement_percent: 0,
    target_omzet_display: config.global.target_omzet > 0 ? config.global.target_omzet / n : 0,
  };
}

/**
 * Hitung bonus KPI V2 untuk cabang & periode.
 * Tabel `daily_achievements` / `crew_achievements` opsional — bila belum ada di DB, gunakan input kosong (hasil 0) atau {@link calculateMonthlyBonusFromInputs}.
 */
export async function calculateMonthlyBonus(
  branchId: string,
  month: number,
  year: number,
): Promise<BonusResult[]> {
  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("kpi_configs")
    .select("bonus_config_v2")
    .eq("tenant_apotek_id", branchId)
    .eq("period_month", month)
    .eq("period_year", year)
    .maybeSingle();

  if (error || !row?.bonus_config_v2) {
    throw new Error(error?.message ?? "KPI V2 untuk periode ini tidak ditemukan.");
  }

  const config = row.bonus_config_v2 as KpiConfigV2;
  const { startDate, endDate } = periodBounds(year, month);

  let dailyAchievements: DailyAchievementRow[] = [];
  let crewAchievements: CrewAchievementRow[] = [];

  const dailyRes = await admin
    .from("daily_achievements")
    .select("*")
    .eq("tenant_apotek_id", branchId)
    .gte("achievement_date", startDate)
    .lte("achievement_date", endDate);

  if (!dailyRes.error && dailyRes.data) {
    dailyAchievements = (dailyRes.data as Record<string, unknown>[]).map((r) => ({
      achievement_date: String(r.achievement_date ?? "").slice(0, 10),
      total_omzet: Number(r.total_omzet ?? r.omzet ?? 0) || 0,
      total_transactions: Number(r.total_transactions ?? r.transactions ?? 0) || 0,
      total_items: Number(r.total_items ?? r.items ?? 0) || 0,
    }));
  }

  const crewRes = await admin
    .from("crew_achievements")
    .select("*")
    .eq("tenant_apotek_id", branchId)
    .gte("achievement_date", startDate)
    .lte("achievement_date", endDate);

  if (!crewRes.error && crewRes.data) {
    crewAchievements = (crewRes.data as Record<string, unknown>[]).map((r) => ({
      user_id: String(r.user_id ?? ""),
      achievement_date: String(r.achievement_date ?? "").slice(0, 10),
      omzet: Number(r.omzet ?? r.total_omzet ?? 0) || 0,
      transactions: Number(r.transactions ?? r.total_transactions ?? 0) || 0,
      items: Number(r.items ?? r.total_items ?? 0) || 0,
    }));
  }

  return calculateMonthlyBonusFromInputs(config, dailyAchievements, crewAchievements);
}
