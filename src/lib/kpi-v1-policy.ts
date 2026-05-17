export type TenantKpiPolicyRow = {
  id: string;
  tenant_apotek_id: string;
  effective_from: string;
  effective_to: string | null;
  working_days_default: number;
  minimum_active_days_enabled: boolean;
  minimum_active_days: number | null;
  scheme_team_monthly: boolean;
  scheme_team_daily: boolean;
  scheme_individual_monthly: boolean;
  scheme_individual_daily: boolean;
  team_daily_target_omzet: number;
  targets_json: Record<string, unknown>;
  created_by_user_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type TenantKpiPolicyWorkingDaysOverride = {
  user_id: string;
  working_days: number;
};

export type TenantKpiPolicyWithOverrides = TenantKpiPolicyRow & {
  tenant_kpi_policy_working_days_overrides?: TenantKpiPolicyWorkingDaysOverride[] | null;
};

const USER_DAILY_OMZET_KEY = "user_daily_omzet";

export function parseUserDailyOmzetMap(targetsJson: unknown): Record<string, number> {
  if (!targetsJson || typeof targetsJson !== "object" || Array.isArray(targetsJson)) return {};
  const raw = (targetsJson as Record<string, unknown>)[USER_DAILY_OMZET_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = typeof v === "number" ? v : parseFloat(String(v));
    if (Number.isFinite(n) && n >= 0) out[k] = n;
  }
  return out;
}

export function buildTargetsJsonWithUserDaily(userDaily: Record<string, number>): Record<string, unknown> {
  return { [USER_DAILY_OMZET_KEY]: userDaily };
}

export function isoDateMinusOneDay(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return isoDate;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const prev = new Date(t - 86400000);
  return prev.toISOString().slice(0, 10);
}
