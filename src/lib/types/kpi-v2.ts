// =====================================================
// KPI V2 Type Definitions
// =====================================================

export type BonusType = "flat" | "kelipatan";
export type DistributionMethod = "equal" | "proportional";
export type TargetDistribution = "rata" | "manual";

// Global Settings
export interface KpiGlobalConfig {
  target_omzet: number;
  target_atv: number;
  target_atu: number;
  is_atv_enabled: boolean;
  is_atu_enabled: boolean;
  default_working_days: number;
}

// Base Scheme Configuration
export interface BaseSchemeConfig {
  enabled: boolean;
  use_omzet: boolean;
  use_atv: boolean;
  use_atu: boolean;
  min_achievement_percent: number;
  weight_omzet: number;
  weight_atv: number;
  weight_atu: number;
  bonus_type: BonusType;
  flat_nominal: number;
  kelipatan_step: number;
  kelipatan_reward: number;
}

// Team Scheme
export interface TeamSchemeConfig extends BaseSchemeConfig {
  distribution_method: DistributionMethod;
}

// Individual Scheme - User Config
export interface IndividualUserConfig {
  // Targets (manual distribution only)
  target_omzet?: number;
  target_atv?: number;
  target_atu?: number;
  target_omzet_daily?: number; // For daily scheme
  working_days?: number; // For daily scheme

  // Weights (manual bonus distribution only)
  weight_omzet?: number;
  weight_atv?: number;
  weight_atu?: number;

  // Bonus (manual bonus distribution only)
  bonus_type?: BonusType;
  flat_nominal?: number;
  kelipatan_step?: number;
  kelipatan_reward?: number;
}

// Individual Scheme
export interface IndividualSchemeConfig extends BaseSchemeConfig {
  target_distribution: TargetDistribution;
  user_configs: Record<string, IndividualUserConfig>; // key: user_id
}

// Complete KPI V2 Configuration
export interface KpiConfigV2 {
  version: "2.0";
  active_schemes: Array<"team_monthly" | "team_daily" | "individual_monthly" | "individual_daily">;
  global: KpiGlobalConfig;
  team_monthly: TeamSchemeConfig;
  team_daily: TeamSchemeConfig;
  individual_monthly: IndividualSchemeConfig;
  individual_daily: IndividualSchemeConfig;
}

// Database Row Type
export interface KpiConfigRow {
  id: string;
  tenant_apotek_id: string;
  period_month: number;
  period_year: number;
  target_omzet: number;
  target_atv: number;
  target_atu: number;
  bonus_config: unknown; // Legacy, deprecated
  bonus_config_v2: KpiConfigV2;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

// UI State Types
export interface KpiFormState {
  global: KpiGlobalConfig;
  team_monthly: TeamSchemeConfig;
  team_daily: TeamSchemeConfig;
  individual_monthly: IndividualSchemeConfig;
  individual_daily: IndividualSchemeConfig;
}

// Validation Result
export interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    field: string;
    message: string;
  }>;
  warnings: Array<{
    field: string;
    message: string;
  }>;
}
