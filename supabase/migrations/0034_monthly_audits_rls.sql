-- monthly_audits / monthly_crew_audits: dokumentasi skema + RLS untuk owner read & BBA manage.
-- Aplikasi BBA memakai service role (admin client) untuk mutasi; policy ini melindungi akses authenticated.

create table if not exists public.monthly_audits (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek (id) on delete cascade,
  period_month int not null check (period_month between 1 and 12),
  period_year int not null check (period_year >= 2000),
  status text not null default 'DRAFT',
  approved_by uuid references public.app_users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_apotek_id, period_month, period_year)
);

create table if not exists public.monthly_crew_audits (
  id uuid primary key default gen_random_uuid(),
  monthly_audit_id uuid not null references public.monthly_audits (id) on delete cascade,
  user_id uuid not null references public.app_users (id) on delete cascade,
  analyst_score numeric(8, 2),
  bba_adjustment numeric(14, 2) not null default 0,
  analyst_feedback text,
  internal_review_score numeric(8, 2),
  customer_review_score numeric(8, 2),
  is_locked boolean not null default false,
  locked_at timestamptz,
  locked_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (monthly_audit_id, user_id)
);

create index if not exists idx_monthly_audits_tenant_period
  on public.monthly_audits (tenant_apotek_id, period_year desc, period_month desc);

create index if not exists idx_monthly_crew_audits_audit
  on public.monthly_crew_audits (monthly_audit_id);

drop trigger if exists trg_monthly_audits_updated_at on public.monthly_audits;
create trigger trg_monthly_audits_updated_at
before update on public.monthly_audits
for each row execute function public.set_updated_at();

drop trigger if exists trg_monthly_crew_audits_updated_at on public.monthly_crew_audits;
create trigger trg_monthly_crew_audits_updated_at
before update on public.monthly_crew_audits
for each row execute function public.set_updated_at();

alter table public.monthly_audits enable row level security;
alter table public.monthly_crew_audits enable row level security;

-- SELECT: anggota tenant (owner, admin apotek, crew) + global super admin
drop policy if exists monthly_audits_select_members on public.monthly_audits;
create policy monthly_audits_select_members
on public.monthly_audits
for select to authenticated
using (public.is_member_of_tenant(tenant_apotek_id));

drop policy if exists monthly_crew_audits_select_members on public.monthly_crew_audits;
create policy monthly_crew_audits_select_members
on public.monthly_crew_audits
for select to authenticated
using (
  exists (
    select 1
    from public.monthly_audits ma
    where ma.id = monthly_audit_id
      and public.is_member_of_tenant(ma.tenant_apotek_id)
  )
);

-- Mutasi: super_admin_bba per tenant (admin client tetap bypass RLS)
drop policy if exists monthly_audits_manage_bba on public.monthly_audits;
create policy monthly_audits_manage_bba
on public.monthly_audits
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

drop policy if exists monthly_crew_audits_manage_bba on public.monthly_crew_audits;
create policy monthly_crew_audits_manage_bba
on public.monthly_crew_audits
for all to authenticated
using (
  exists (
    select 1
    from public.monthly_audits ma
    where ma.id = monthly_audit_id
      and public.has_tenant_role(
        ma.tenant_apotek_id,
        array['super_admin_bba']::public.role_name[]
      )
  )
)
with check (
  exists (
    select 1
    from public.monthly_audits ma
    where ma.id = monthly_audit_id
      and public.has_tenant_role(
        ma.tenant_apotek_id,
        array['super_admin_bba']::public.role_name[]
      )
  )
);

comment on table public.monthly_audits is 'Siklus approval audit bulanan per cabang (DRAFT / UNDER_REVIEW / APPROVED).';
comment on table public.monthly_crew_audits is 'Baris audit per karyawan (skor, penyesuaian BBA, lock).';
