import type {
  IndividualUserConfig,
  KpiConfigV2,
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
  ) => {
    if (!enabled) return;
    const wr = validateWeights(wO, wA, wU, useA, useU);
    warnings.push(...wr.warnings.map((w) => ({ ...w, field: `${key}.${w.field}` })));
    errors.push(...wr.errors.map((e) => ({ ...e, field: `${key}.${e.field}` })));
    if (bonusType === "flat" && flat <= 0) {
      warnings.push({ field: `${key}.flat_nominal`, message: "Bonus flat = 0" });
    }
  };

  checkScheme(
    "team_monthly",
    config.team_monthly.enabled,
    config.team_monthly.weight_omzet,
    config.team_monthly.weight_atv,
    config.team_monthly.weight_atu,
    config.team_monthly.use_atv,
    config.team_monthly.use_atu,
    config.team_monthly.bonus_type,
    config.team_monthly.flat_nominal,
  );
  checkScheme(
    "team_daily",
    config.team_daily.enabled,
    config.team_daily.weight_omzet,
    config.team_daily.weight_atv,
    config.team_daily.weight_atu,
    config.team_daily.use_atv,
    config.team_daily.use_atu,
    config.team_daily.bonus_type,
    config.team_daily.flat_nominal,
  );
  checkScheme(
    "individual_monthly",
    config.individual_monthly.enabled,
    config.individual_monthly.weight_omzet,
    config.individual_monthly.weight_atv,
    config.individual_monthly.weight_atu,
    config.individual_monthly.use_atv,
    config.individual_monthly.use_atu,
    config.individual_monthly.bonus_type,
    config.individual_monthly.flat_nominal,
  );
  checkScheme(
    "individual_daily",
    config.individual_daily.enabled,
    config.individual_daily.weight_omzet,
    config.individual_daily.weight_atv,
    config.individual_daily.weight_atu,
    config.individual_daily.use_atv,
    config.individual_daily.use_atu,
    config.individual_daily.bonus_type,
    config.individual_daily.flat_nominal,
  );

  if (
    config.individual_monthly.enabled &&
    config.individual_monthly.target_distribution === "manual"
  ) {
    const keys = Object.keys(config.individual_monthly.user_configs ?? {});
    if (keys.length === 0) {
      errors.push({
        field: "individual_monthly.user_configs",
        message: "Distribusi manual dipilih tetapi belum ada konfigurasi per pengguna",
      });
    }
  }

  if (config.individual_daily.enabled && config.individual_daily.target_distribution === "manual") {
    const keys = Object.keys(config.individual_daily.user_configs ?? {});
    if (keys.length === 0) {
      errors.push({
        field: "individual_daily.user_configs",
        message: "Distribusi manual dipilih tetapi belum ada konfigurasi per pengguna",
      });
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
