import type {
  IndividualSchemeConfig,
  IndividualUserConfig,
  KpiConfigV2,
  KpiGlobalConfig,
  ValidationResult,
} from "@/lib/types/kpi-v2";

/** Urutan stabil untuk header tabel / agregasi multi-skema. */
export const KPI_V2_SCHEME_ORDER = [
  "team_monthly",
  "team_daily",
  "individual_monthly",
  "individual_daily",
] as const;

export type KpiV2SchemeId = (typeof KPI_V2_SCHEME_ORDER)[number];

/**
 * Skema KPI V2 yang aktif untuk periode (hanya yang `enabled` di konfigurasi).
 */
export function getKpiV2SchemesEnabledForPeriod(config: KpiConfigV2): KpiV2SchemeId[] {
  return KPI_V2_SCHEME_ORDER.filter((id) => config[id]?.enabled === true);
}

/**
 * Apakah baris kpi_configs BENAR-BENAR terkonfigurasi (punya target/skema nyata),
 * bukan sekadar baris bootstrap dengan target 0? Menutup v1 (target_omzet) & v2 (skema aktif).
 * Dipakai oleh skor kelengkapan cabang agar centang "KPI dikonfigurasi" jujur.
 */
export function isKpiConfigReady(
  kpi: { target_omzet?: number | null; bonus_config_v2?: unknown } | null | undefined,
): boolean {
  if (!kpi) return false;
  if (isKpiConfigV2(kpi.bonus_config_v2) && getKpiV2SchemesEnabledForPeriod(kpi.bonus_config_v2).length > 0) {
    return true;
  }
  return Number(kpi.target_omzet ?? 0) > 0;
}

// =====================================================
// KPI V2 Utility Functions
// =====================================================

/**
 * Create default KPI V2 configuration
 */
export function createDefaultKpiV2Config(): KpiConfigV2 {
  const baseScheme = {
    enabled: false,
    use_omzet: true,
    use_atv: false,
    use_atu: false,
    min_achievement_percent: 100,
    weight_omzet: 100,
    weight_atv: 0,
    weight_atu: 0,
    bonus_type: "flat" as const,
    flat_nominal: 0,
    kelipatan_step: 0,
    kelipatan_reward: 0,
  };

  return {
    version: "2.0",
    active_schemes: [],
    global: {
      target_omzet: 0,
      target_atv: 0,
      target_atu: 0,
      is_atv_enabled: false,
      is_atu_enabled: false,
      default_working_days: 26,
    },
    team_monthly: {
      ...baseScheme,
      distribution_method: "equal",
    },
    team_daily: {
      ...baseScheme,
      distribution_method: "equal",
    },
    individual_monthly: {
      ...baseScheme,
      target_distribution: "rata",
      user_configs: {},
    },
    individual_daily: {
      ...baseScheme,
      target_distribution: "rata",
      user_configs: {},
    },
  };
}

/**
 * Validate weight distribution
 */
export function validateWeights(
  weightOmzet: number,
  weightAtv: number,
  weightAtu: number,
  useAtv: boolean,
  useAtu: boolean,
): ValidationResult {
  const errors: ValidationResult["errors"] = [];
  const warnings: ValidationResult["warnings"] = [];

  let totalWeight = weightOmzet;
  if (useAtv) totalWeight += weightAtv;
  if (useAtu) totalWeight += weightAtu;

  if (totalWeight !== 100) {
    warnings.push({
      field: "weights",
      message: `Total bobot ${totalWeight}% (seharusnya 100%). Sistem akan auto-normalize saat perhitungan.`,
    });
  }

  if (weightOmzet < 0 || weightAtv < 0 || weightAtu < 0) {
    errors.push({
      field: "weights",
      message: "Bobot tidak boleh negatif",
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate manual target distribution for individual schemes
 */
export function validateManualTargetDistribution(
  globalTargetOmzet: number,
  userConfigs: Record<string, IndividualUserConfig>,
  activeUserIds: string[],
): ValidationResult {
  const errors: ValidationResult["errors"] = [];
  const warnings: ValidationResult["warnings"] = [];

  let totalDistributed = 0;

  // Include both active users and saved configs (for resigned users)
  const allUserIds = Array.from(new Set([...activeUserIds, ...Object.keys(userConfigs)]));

  allUserIds.forEach((userId) => {
    const config = userConfigs[userId];
    if (config?.target_omzet != null) {
      totalDistributed += Number(config.target_omzet) || 0;
    }
  });

  if (Math.abs(totalDistributed - globalTargetOmzet) > 1) {
    errors.push({
      field: "manual_target_distribution",
      message: `Total target terdistribusi (Rp ${totalDistributed.toLocaleString()}) tidak sama dengan target global (Rp ${globalTargetOmzet.toLocaleString()})`,
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Calculate daily target per user (for individual daily scheme with rata distribution)
 */
export function calculateDailyTargetPerUser(
  globalTargetOmzet: number,
  totalActiveUsers: number,
  workingDays: number,
): number {
  if (totalActiveUsers === 0 || workingDays === 0) return 0;
  return globalTargetOmzet / totalActiveUsers / workingDays;
}

/**
 * Calculate daily target for team (for team daily scheme)
 */
export function calculateTeamDailyTarget(globalTargetOmzet: number, workingDays: number): number {
  if (workingDays === 0) return 0;
  return globalTargetOmzet / workingDays;
}

/**
 * Target harian efektif seorang crew di skema Individual Daily.
 * SATU sumber kebenaran — dipakai UI (tampilan) DAN calculator (bayaran) agar tak pernah berbeda.
 * Prioritas: override harian (>0) → porsi bulanan ÷ hari kerja (mode manual) → fair-share global.
 */
export function effectiveDailyTargetForUser(
  scheme: IndividualSchemeConfig,
  global: KpiGlobalConfig,
  userId: string,
  activeUserCount: number,
): number {
  const uc = scheme.user_configs?.[userId];
  const wdRaw = uc?.working_days;
  const workingDays =
    typeof wdRaw === "number" && Number.isFinite(wdRaw) && wdRaw > 0
      ? wdRaw
      : global.default_working_days || 26;

  // 1) Override harian eksplisit selalu menang.
  const override = uc?.target_omzet_daily;
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return override;
  }

  // 2) Mode manual: porsi bulanan ÷ hari kerja (menepati tampilan UI).
  if (scheme.target_distribution === "manual") {
    const porsi = uc?.target_omzet;
    if (typeof porsi === "number" && Number.isFinite(porsi) && porsi > 0) {
      return workingDays > 0 ? porsi / workingDays : 0;
    }
  }

  // 3) Default: bagi rata (fair-share) dari target global.
  return calculateDailyTargetPerUser(global.target_omzet, activeUserCount, workingDays);
}

/** Validasi menyeluruh konfigurasi KPI V2 sebelum simpan / kalkulasi. */
export function validateKpiV2Config(config: KpiConfigV2): ValidationResult {
  const errors: ValidationResult["errors"] = [];
  const warnings: ValidationResult["warnings"] = [];

  if (config.global.target_omzet <= 0) {
    errors.push({ field: "global.target_omzet", message: "Target omzet harus lebih dari 0" });
  }

  const anyEnabled =
    config.team_monthly.enabled ||
    config.team_daily.enabled ||
    config.individual_monthly.enabled ||
    config.individual_daily.enabled;

  if (!anyEnabled) {
    warnings.push({
      field: "schemes",
      message: "Tidak ada skema yang aktif — bonus tidak akan dihitung",
    });
  }

  const checkScheme = (
    key: string,
    enabled: boolean,
    wO: number,
    wA: number,
    wU: number,
    useA: boolean,
    useU: boolean,
    bonusType: string,
    flat: number,
    step: number,
    reward: number,
    minPercent: number,
  ) => {
    if (!enabled) return;
    const wr = validateWeights(wO, wA, wU, useA, useU);
    warnings.push(...wr.warnings.map((w) => ({ ...w, field: `${key}.${w.field}` })));
    errors.push(...wr.errors.map((e) => ({ ...e, field: `${key}.${e.field}` })));
    if (bonusType === "flat" && flat <= 0) {
      warnings.push({ field: `${key}.flat_nominal`, message: "Bonus flat = 0 — skema ini tidak membayar apa pun" });
    }
    // Kelipatan dengan step/reward tak valid → tak akan pernah membayar. (Dulu tak diperingatkan.)
    if (bonusType === "kelipatan") {
      if (step <= 0) {
        warnings.push({ field: `${key}.kelipatan_step`, message: "Kelipatan step = 0 — bonus tidak akan dihitung" });
      }
      if (reward <= 0) {
        warnings.push({ field: `${key}.kelipatan_reward`, message: "Kelipatan reward = 0 — skema ini tidak membayar apa pun" });
      }
    }
    if (minPercent < 0 || minPercent > 200) {
      errors.push({ field: `${key}.min_achievement_percent`, message: "Minimal pencapaian harus 0–200%" });
    }
  };

  const schemeKeys = ["team_monthly", "team_daily", "individual_monthly", "individual_daily"] as const;
  for (const k of schemeKeys) {
    const s = config[k];
    checkScheme(
      k,
      s.enabled,
      s.weight_omzet,
      s.weight_atv,
      s.weight_atu,
      s.use_atv,
      s.use_atu,
      s.bonus_type,
      s.flat_nominal,
      s.kelipatan_step,
      s.kelipatan_reward,
      s.min_achievement_percent,
    );
  }

  // Distribusi manual: (1) wajib ada konfigurasi; (2) jumlah porsi cocok dgn target global.
  // Cek jumlah kini di validator INTI → server (saveKpiV2Action) ikut memblok, tak cuma client.
  for (const k of ["individual_monthly", "individual_daily"] as const) {
    const scheme = config[k];
    if (!scheme.enabled || scheme.target_distribution !== "manual") continue;
    const cfgs = scheme.user_configs ?? {};
    if (Object.keys(cfgs).length === 0) {
      errors.push({
        field: `${k}.user_configs`,
        message: "Distribusi manual dipilih tetapi belum ada konfigurasi per pengguna",
      });
      continue;
    }
    const totalPorsi = Object.values(cfgs).reduce(
      (sum, uc) => sum + (typeof uc.target_omzet === "number" ? uc.target_omzet : 0),
      0,
    );
    // Daily boleh pakai override harian → porsi bisa sengaja tak dijumlah pas: peringatan saja.
    // Monthly murni porsi → mismatch = error.
    if (Math.abs(totalPorsi - config.global.target_omzet) > 1) {
      const msg = `Total porsi (Rp ${totalPorsi.toLocaleString("id-ID")}) ≠ target global (Rp ${config.global.target_omzet.toLocaleString("id-ID")})`;
      if (k === "individual_monthly") errors.push({ field: `${k}.user_configs`, message: msg });
      else warnings.push({ field: `${k}.user_configs`, message: `${msg} — cek bila tak memakai override harian` });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Deep merge two configs (for copy previous month functionality)
 */
export function mergeKpiConfigs(base: KpiConfigV2, override: Partial<KpiConfigV2>): KpiConfigV2 {
  return {
    ...base,
    ...override,
    global: { ...base.global, ...override.global },
    team_monthly: { ...base.team_monthly, ...override.team_monthly },
    team_daily: { ...base.team_daily, ...override.team_daily },
    individual_monthly: {
      ...base.individual_monthly,
      ...override.individual_monthly,
      user_configs: {
        ...base.individual_monthly.user_configs,
        ...(override.individual_monthly?.user_configs || {}),
      },
    },
    individual_daily: {
      ...base.individual_daily,
      ...override.individual_daily,
      user_configs: {
        ...base.individual_daily.user_configs,
        ...(override.individual_daily?.user_configs || {}),
      },
    },
  };
}

export function isKpiConfigV2(value: unknown): value is KpiConfigV2 {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    (value as { version: string }).version === "2.0"
  );
}
