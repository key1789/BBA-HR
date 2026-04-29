-- BBA HR V1 core operational alignment
-- Adds PRD entities for input/verifikasi/report/leaderboard governance.

create type public.submission_status as enum (
  'draft',
  'submitted',
  'approved',
  'reject',
  'edited_by_admin',
  'missing_submission'
);

create type public.verification_action as enum (
  'approve',
  'reject',
  'edit_directly'
);

create type public.addon_key as enum (
  'produk_fokus',
  'absensi_shift',
  'review_internal',
  'review_pelanggan',
  'payroll'
);

create type public.bonus_mode as enum (
  'fixed_only',
  'progressive_only',
  'fixed_plus_progressive'
);

create table public.kpi_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  period_month int not null check (period_month between 1 and 12),
  period_year int not null check (period_year >= 2000),
  target_omzet numeric(18,2) not null default 0,
  target_atv numeric(18,2) not null default 0,
  target_atu numeric(18,4) not null default 0,
  bonus_mode public.bonus_mode not null default 'fixed_only',
  bonus_config jsonb not null default '{}'::jsonb,
  created_by_user_id uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_apotek_id, period_month, period_year)
);

create table public.addon_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  addon_key public.addon_key not null,
  is_enabled boolean not null default false,
  updated_by_user_id uuid not null references public.app_users(id),
  updated_at timestamptz not null default now(),
  unique (tenant_apotek_id, addon_key)
);

create table public.daily_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  user_id uuid not null references public.app_users(id),
  submission_date date not null,
  shift_label text not null default 'general',
  omzet_total numeric(18,2) not null default 0,
  transaction_total int not null default 0,
  product_total int not null default 0,
  rejected_customer_total int not null default 0,
  status public.submission_status not null default 'draft',
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_apotek_id, user_id, submission_date, shift_label)
);

create table public.submission_verifications (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.daily_submissions(id) on delete cascade,
  action public.verification_action not null,
  error_code text,
  note text,
  acted_by_user_id uuid not null references public.app_users(id),
  acted_at timestamptz not null default now()
);

create table public.minus_points (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.daily_submissions(id) on delete cascade,
  user_id uuid not null references public.app_users(id),
  point int not null default 1 check (point > 0),
  reason_code text not null,
  created_by_user_id uuid not null references public.app_users(id),
  created_at timestamptz not null default now()
);

create table public.leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  period_month int not null check (period_month between 1 and 12),
  period_year int not null check (period_year >= 2000),
  user_id uuid not null references public.app_users(id),
  omzet_value numeric(18,2) not null default 0,
  atv_value numeric(18,2) not null default 0,
  atu_value numeric(18,4) not null default 0,
  atv_percent numeric(8,2) not null default 0,
  atu_percent numeric(8,2) not null default 0,
  sarp_percent numeric(8,2) not null default 0,
  late_flag_count int not null default 0,
  calculated_at timestamptz not null default now(),
  unique (tenant_apotek_id, period_month, period_year, user_id)
);

create index idx_daily_submissions_tenant_date_user
  on public.daily_submissions (tenant_apotek_id, submission_date, user_id);
create index idx_submission_verifications_submission_acted_at
  on public.submission_verifications (submission_id, acted_at desc);
create index idx_leaderboard_tenant_period_sarp
  on public.leaderboard_snapshots (tenant_apotek_id, period_year, period_month, sarp_percent desc);

create trigger trg_kpi_configs_updated_at
before update on public.kpi_configs
for each row execute function public.set_updated_at();

create trigger trg_daily_submissions_updated_at
before update on public.daily_submissions
for each row execute function public.set_updated_at();

create or replace function public.apply_submission_verification_effect()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  submission_tenant uuid;
  submission_user uuid;
begin
  select tenant_apotek_id, user_id
  into submission_tenant, submission_user
  from public.daily_submissions
  where id = new.submission_id;

  if submission_tenant is null then
    raise exception 'submission not found';
  end if;

  if new.action = 'approve' then
    update public.daily_submissions
    set status = 'approved', approved_at = now()
    where id = new.submission_id;
  elsif new.action = 'reject' then
    update public.daily_submissions
    set status = 'reject', approved_at = null
    where id = new.submission_id;
  elsif new.action = 'edit_directly' then
    update public.daily_submissions
    set status = 'edited_by_admin', approved_at = null
    where id = new.submission_id;
  end if;

  if new.action in ('reject', 'edit_directly') then
    insert into public.minus_points (
      submission_id,
      user_id,
      point,
      reason_code,
      created_by_user_id
    ) values (
      new.submission_id,
      submission_user,
      1,
      coalesce(new.error_code, 'verification_minus'),
      new.acted_by_user_id
    );
  end if;

  return new;
end;
$$;

create trigger trg_submission_verification_effect
after insert on public.submission_verifications
for each row execute function public.apply_submission_verification_effect();

-- RLS baseline
alter table public.kpi_configs enable row level security;
alter table public.addon_settings enable row level security;
alter table public.daily_submissions enable row level security;
alter table public.submission_verifications enable row level security;
alter table public.minus_points enable row level security;
alter table public.leaderboard_snapshots enable row level security;

create policy kpi_select_members
on public.kpi_configs
for select to authenticated
using (public.is_member_of_tenant(tenant_apotek_id));

create policy kpi_manage_bba
on public.kpi_configs
for all to authenticated
using (public.has_tenant_role(tenant_apotek_id, array['super_admin_bba']::public.role_name[]))
with check (public.has_tenant_role(tenant_apotek_id, array['super_admin_bba']::public.role_name[]));

create policy addon_select_members
on public.addon_settings
for select to authenticated
using (public.is_member_of_tenant(tenant_apotek_id));

create policy addon_manage_bba
on public.addon_settings
for all to authenticated
using (public.has_tenant_role(tenant_apotek_id, array['super_admin_bba']::public.role_name[]))
with check (public.has_tenant_role(tenant_apotek_id, array['super_admin_bba']::public.role_name[]));

create policy submissions_select_members
on public.daily_submissions
for select to authenticated
using (public.is_member_of_tenant(tenant_apotek_id));

create policy submissions_insert_crew_admin
on public.daily_submissions
for insert to authenticated
with check (public.has_tenant_role(tenant_apotek_id, array['crew', 'admin_apotek', 'super_admin_bba']::public.role_name[]));

create policy submissions_update_creator_or_admin
on public.daily_submissions
for update to authenticated
using (
  user_id = auth.uid()
  or public.has_tenant_role(tenant_apotek_id, array['admin_apotek', 'super_admin_bba']::public.role_name[])
)
with check (
  user_id = auth.uid()
  or public.has_tenant_role(tenant_apotek_id, array['admin_apotek', 'super_admin_bba']::public.role_name[])
);

create policy verifications_select_members
on public.submission_verifications
for select to authenticated
using (
  exists (
    select 1
    from public.daily_submissions s
    where s.id = submission_id
      and public.is_member_of_tenant(s.tenant_apotek_id)
  )
);

create policy verifications_insert_admin_bba
on public.submission_verifications
for insert to authenticated
with check (
  exists (
    select 1
    from public.daily_submissions s
    where s.id = submission_id
      and public.has_tenant_role(s.tenant_apotek_id, array['admin_apotek', 'super_admin_bba']::public.role_name[])
  )
);

create policy minus_points_select_members
on public.minus_points
for select to authenticated
using (
  exists (
    select 1
    from public.daily_submissions s
    where s.id = submission_id
      and public.is_member_of_tenant(s.tenant_apotek_id)
  )
);

create policy leaderboard_select_members
on public.leaderboard_snapshots
for select to authenticated
using (public.is_member_of_tenant(tenant_apotek_id));

create policy leaderboard_manage_bba
on public.leaderboard_snapshots
for all to authenticated
using (public.has_tenant_role(tenant_apotek_id, array['super_admin_bba']::public.role_name[]))
with check (public.has_tenant_role(tenant_apotek_id, array['super_admin_bba']::public.role_name[]));
