-- Foundation for Appraisal Draft Engine (P2-02 Stage A)

create table if not exists public.monthly_appraisals (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  crew_user_id uuid not null references public.app_users(id) on delete cascade,
  period_month int not null check (period_month between 1 and 12),
  period_year int not null check (period_year >= 2000),
  approved_submission_count int not null default 0 check (approved_submission_count >= 0),
  approved_omzet_total numeric(18,2) not null default 0 check (approved_omzet_total >= 0),
  minus_point_total int not null default 0 check (minus_point_total >= 0),
  auto_bonus_accountability numeric(14,2) not null default 0,
  addon_manual_total numeric(14,2) not null default 0,
  bba_adjustment numeric(14,2) not null default 0,
  final_total_bonus numeric(14,2) generated always as (auto_bonus_accountability + addon_manual_total + bba_adjustment) stored,
  calc_version text not null default 'v1_baseline',
  calc_breakdown jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  published_at timestamptz,
  published_by_user_id uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_apotek_id, crew_user_id, period_month, period_year)
);

create table if not exists public.monthly_addon_appraisals (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  crew_user_id uuid not null references public.app_users(id) on delete cascade,
  period_month int not null check (period_month between 1 and 12),
  period_year int not null check (period_year >= 2000),
  addon_key text not null,
  score_manual numeric(8,2) not null default 0,
  nominal_manual numeric(14,2) not null default 0,
  notes text,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_apotek_id, crew_user_id, period_month, period_year, addon_key)
);

create index if not exists idx_monthly_appraisals_tenant_period
  on public.monthly_appraisals (tenant_apotek_id, period_year desc, period_month desc);

create index if not exists idx_monthly_addon_appraisals_tenant_period
  on public.monthly_addon_appraisals (tenant_apotek_id, period_year desc, period_month desc);

drop trigger if exists trg_monthly_appraisals_updated_at on public.monthly_appraisals;
create trigger trg_monthly_appraisals_updated_at
before update on public.monthly_appraisals
for each row execute function public.set_updated_at();

drop trigger if exists trg_monthly_addon_appraisals_updated_at on public.monthly_addon_appraisals;
create trigger trg_monthly_addon_appraisals_updated_at
before update on public.monthly_addon_appraisals
for each row execute function public.set_updated_at();

alter table public.monthly_appraisals enable row level security;
alter table public.monthly_addon_appraisals enable row level security;

drop policy if exists monthly_appraisals_select_members on public.monthly_appraisals;
create policy monthly_appraisals_select_members
on public.monthly_appraisals
for select to authenticated
using (public.is_member_of_tenant(tenant_apotek_id));

drop policy if exists monthly_appraisals_manage_bba on public.monthly_appraisals;
create policy monthly_appraisals_manage_bba
on public.monthly_appraisals
for all to authenticated
using (
  public.has_tenant_role(
    tenant_apotek_id,
    array['super_admin_bba']::public.role_name[]
  )
)
with check (
  public.has_tenant_role(
    tenant_apotek_id,
    array['super_admin_bba']::public.role_name[]
  )
);

drop policy if exists monthly_addon_appraisals_select_members on public.monthly_addon_appraisals;
create policy monthly_addon_appraisals_select_members
on public.monthly_addon_appraisals
for select to authenticated
using (public.is_member_of_tenant(tenant_apotek_id));

drop policy if exists monthly_addon_appraisals_manage_bba on public.monthly_addon_appraisals;
create policy monthly_addon_appraisals_manage_bba
on public.monthly_addon_appraisals
for all to authenticated
using (
  public.has_tenant_role(
    tenant_apotek_id,
    array['super_admin_bba']::public.role_name[]
  )
)
with check (
  public.has_tenant_role(
    tenant_apotek_id,
    array['super_admin_bba']::public.role_name[]
  )
);
