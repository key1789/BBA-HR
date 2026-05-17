-- KPI v1: kebijakan skema target/bonus (bukan add-on), versi per tanggal berlaku, hari kerja + override per crew.

create table if not exists public.tenant_kpi_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek (id) on delete cascade,
  effective_from date not null default ((timezone('utc', now()))::date),
  effective_to date,
  working_days_default int not null default 26,
  minimum_active_days_enabled boolean not null default false,
  minimum_active_days int,
  scheme_team_monthly boolean not null default true,
  scheme_team_daily boolean not null default false,
  scheme_individual_monthly boolean not null default true,
  scheme_individual_daily boolean not null default false,
  team_daily_target_omzet numeric(18, 2) not null default 0,
  targets_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_kpi_policies_working_days_chk check (working_days_default between 1 and 31),
  constraint tenant_kpi_policies_min_days_chk check (
    minimum_active_days is null
    or minimum_active_days between 1 and 366
  )
);

create unique index if not exists idx_tenant_kpi_policies_one_open
  on public.tenant_kpi_policies (tenant_apotek_id)
  where (effective_to is null);

create index if not exists idx_tenant_kpi_policies_tenant_from
  on public.tenant_kpi_policies (tenant_apotek_id, effective_from desc);

create table if not exists public.tenant_kpi_policy_working_days_overrides (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.tenant_kpi_policies (id) on delete cascade,
  user_id uuid not null references public.app_users (id) on delete cascade,
  working_days int not null,
  constraint tenant_kpi_policy_wd_overrides_days_chk check (working_days between 1 and 31),
  unique (policy_id, user_id)
);

create index if not exists idx_tenant_kpi_policy_wd_overrides_policy
  on public.tenant_kpi_policy_working_days_overrides (policy_id);

comment on table public.tenant_kpi_policies is 'Kebijakan KPI v1 per cabang; versi dengan effective_from / effective_to.';
comment on column public.tenant_kpi_policies.targets_json is 'Mis. {"user_daily_omzet":{"<user_uuid>":123}} untuk target harian perorangan.';
comment on table public.tenant_kpi_policy_working_days_overrides is 'Override jumlah hari kerja per crew untuk perhitungan KPI v1.';

alter table public.tenant_kpi_policies enable row level security;
alter table public.tenant_kpi_policy_working_days_overrides enable row level security;

create policy tenant_kpi_policies_select_members
  on public.tenant_kpi_policies
  for select
  to authenticated
  using (public.is_member_of_tenant (tenant_apotek_id));

create policy tenant_kpi_policies_manage_bba
  on public.tenant_kpi_policies
  for all
  to authenticated
  using (public.has_tenant_role (tenant_apotek_id, array['super_admin_bba']::public.role_name[]))
  with check (public.has_tenant_role (tenant_apotek_id, array['super_admin_bba']::public.role_name[]));

create policy tenant_kpi_policy_wd_overrides_select_members
  on public.tenant_kpi_policy_working_days_overrides
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_kpi_policies p
      where p.id = policy_id
        and public.is_member_of_tenant (p.tenant_apotek_id)
    )
  );

create policy tenant_kpi_policy_wd_overrides_manage_bba
  on public.tenant_kpi_policy_working_days_overrides
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_kpi_policies p
      where p.id = policy_id
        and public.has_tenant_role (p.tenant_apotek_id, array['super_admin_bba']::public.role_name[])
    )
  )
  with check (
    exists (
      select 1
      from public.tenant_kpi_policies p
      where p.id = policy_id
        and public.has_tenant_role (p.tenant_apotek_id, array['super_admin_bba']::public.role_name[])
    )
  );

create trigger trg_tenant_kpi_policies_updated_at
  before update on public.tenant_kpi_policies
  for each row execute function public.set_updated_at ();
