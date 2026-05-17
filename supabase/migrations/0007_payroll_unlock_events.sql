-- Payroll unlock governance timeline

create table if not exists public.payroll_unlock_events (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  event_type text not null check (event_type in ('lock', 'unlock')),
  reason text,
  actor_user_id uuid not null references public.app_users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_payroll_unlock_events_tenant_created_at
  on public.payroll_unlock_events(tenant_apotek_id, created_at desc);

create index if not exists idx_payroll_unlock_events_period_created_at
  on public.payroll_unlock_events(payroll_period_id, created_at desc);

alter table public.payroll_unlock_events enable row level security;

drop policy if exists payroll_unlock_events_select_bba on public.payroll_unlock_events;
create policy payroll_unlock_events_select_bba
on public.payroll_unlock_events
for select to authenticated
using (
  public.has_tenant_role(
    tenant_apotek_id,
    array['super_admin_bba']::public.role_name[]
  )
);

drop policy if exists payroll_unlock_events_insert_bba on public.payroll_unlock_events;
create policy payroll_unlock_events_insert_bba
on public.payroll_unlock_events
for insert to authenticated
with check (
  public.has_tenant_role(
    tenant_apotek_id,
    array['super_admin_bba']::public.role_name[]
  )
);
