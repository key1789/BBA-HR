-- =====================================================
-- KPI V2: Multi-Scheme System Migration
-- =====================================================

-- 1. Backup existing bonus_config structure
-- (Data existing akan di-reset sesuai permintaan Anda)

-- 2. Update kpi_configs table structure
alter table public.kpi_configs
  drop column if exists bonus_mode,
  add column if not exists bonus_config_v2 jsonb default '{}'::jsonb;

-- 3. Add comment for documentation
comment on column public.kpi_configs.bonus_config_v2 is
'KPI V2 Multi-Scheme Configuration:
{
  "version": "2.0",
  "active_schemes": ["team_monthly", "team_daily", "individual_monthly", "individual_daily"],
  "global": { target_omzet, target_atv, target_atu, is_atv_enabled, is_atu_enabled, default_working_days },
  "team_monthly": { enabled, use_omzet, use_atv, use_atu, min_achievement_percent, weight_omzet, weight_atv, weight_atu, bonus_type, flat_nominal, kelipatan_step, kelipatan_reward, distribution_method },
  "team_daily": { ... similar structure ... },
  "individual_monthly": { enabled, target_distribution, use_omzet, use_atv, use_atu, min_achievement_percent, weight_omzet, weight_atv, weight_atu, bonus_type, flat_nominal, kelipatan_step, kelipatan_reward, user_configs },
  "individual_daily": { ... similar structure ... }
}';

-- 4. Create index for faster JSONB queries
create index if not exists idx_kpi_configs_bonus_config_v2_gin
  on public.kpi_configs using gin (bonus_config_v2);

-- 5. Create function to initialize default config
create or replace function public.initialize_kpi_v2_config()
returns jsonb
language plpgsql
immutable
as $$
begin
  return jsonb_build_object(
    'version', '2.0',
    'active_schemes', '[]'::jsonb,
    'global', jsonb_build_object(
      'target_omzet', 0,
      'target_atv', 0,
      'target_atu', 0,
      'is_atv_enabled', false,
      'is_atu_enabled', false,
      'default_working_days', 26
    ),
    'team_monthly', jsonb_build_object(
      'enabled', false,
      'use_omzet', true,
      'use_atv', false,
      'use_atu', false,
      'min_achievement_percent', 100,
      'weight_omzet', 100,
      'weight_atv', 0,
      'weight_atu', 0,
      'bonus_type', 'flat',
      'flat_nominal', 0,
      'kelipatan_step', 0,
      'kelipatan_reward', 0,
      'distribution_method', 'equal'
    ),
    'team_daily', jsonb_build_object(
      'enabled', false,
      'use_omzet', true,
      'use_atv', false,
      'use_atu', false,
      'min_achievement_percent', 100,
      'weight_omzet', 100,
      'weight_atv', 0,
      'weight_atu', 0,
      'bonus_type', 'flat',
      'flat_nominal', 0,
      'kelipatan_step', 0,
      'kelipatan_reward', 0,
      'distribution_method', 'equal'
    ),
    'individual_monthly', jsonb_build_object(
      'enabled', false,
      'target_distribution', 'rata',
      'use_omzet', true,
      'use_atv', false,
      'use_atu', false,
      'min_achievement_percent', 100,
      'weight_omzet', 100,
      'weight_atv', 0,
      'weight_atu', 0,
      'bonus_type', 'flat',
      'flat_nominal', 0,
      'kelipatan_step', 0,
      'kelipatan_reward', 0,
      'user_configs', '{}'::jsonb
    ),
    'individual_daily', jsonb_build_object(
      'enabled', false,
      'target_distribution', 'rata',
      'use_omzet', true,
      'use_atv', false,
      'use_atu', false,
      'min_achievement_percent', 100,
      'weight_omzet', 100,
      'weight_atv', 0,
      'weight_atu', 0,
      'bonus_type', 'flat',
      'flat_nominal', 0,
      'kelipatan_step', 0,
      'kelipatan_reward', 0,
      'user_configs', '{}'::jsonb
    )
  );
end;
$$;

-- 6. Update existing rows with default v2 config
update public.kpi_configs
set bonus_config_v2 = public.initialize_kpi_v2_config()
where bonus_config_v2 = '{}'::jsonb
   or bonus_config_v2 is null;
