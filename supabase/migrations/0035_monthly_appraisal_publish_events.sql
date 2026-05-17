-- Audit trail untuk publish / unpublish rapor bulanan (monthly_appraisals periode).

create table if not exists public.monthly_appraisal_publish_events (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek (id) on delete cascade,
  period_month int not null check (period_month between 1 and 12),
  period_year int not null check (period_year >= 2000),
  action text not null check (action in ('publish', 'unpublish')),
  actor_user_id uuid not null references public.app_users (id),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_monthly_appraisal_publish_events_tenant_period_created
  on public.monthly_appraisal_publish_events (
    tenant_apotek_id,
    period_year desc,
    period_month desc,
    created_at desc
  );

alter table public.monthly_appraisal_publish_events enable row level security;

drop policy if exists monthly_appraisal_publish_events_select_bba
  on public.monthly_appraisal_publish_events;
create policy monthly_appraisal_publish_events_select_bba
on public.monthly_appraisal_publish_events
for select to authenticated
using (
  public.has_tenant_role(
    tenant_apotek_id,
    array['super_admin_bba']::public.role_name[]
  )
);

drop policy if exists monthly_appraisal_publish_events_insert_bba
  on public.monthly_appraisal_publish_events;
create policy monthly_appraisal_publish_events_insert_bba
on public.monthly_appraisal_publish_events
for insert to authenticated
with check (
  public.has_tenant_role(
    tenant_apotek_id,
    array['super_admin_bba']::public.role_name[]
  )
);
