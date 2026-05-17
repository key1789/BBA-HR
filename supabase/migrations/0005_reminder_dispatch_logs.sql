-- V1.1 operational automation: persistent reminder dispatch logs
create table public.reminder_dispatch_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  actor_user_id uuid references public.app_users(id),
  reminder_date date not null,
  phase text not null check (phase in ('near_cutoff', 'post_cutoff')),
  scope text not null check (scope in ('crew_dashboard', 'admin_dashboard', 'admin_verifikasi')),
  reason_code text not null check (
    reason_code in (
      'missing_submission',
      'pending_submission',
      'verification_backlog',
      'overdue_verification'
    )
  ),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_apotek_id, reminder_date, phase, scope, reason_code)
);

create index idx_reminder_dispatch_logs_tenant_created_at
  on public.reminder_dispatch_logs (tenant_apotek_id, created_at desc);

alter table public.reminder_dispatch_logs enable row level security;

create policy "Reminder logs read by tenant member"
on public.reminder_dispatch_logs
for select
using (
  public.has_tenant_role(
    tenant_apotek_id,
    array['super_admin_bba', 'admin_apotek', 'crew', 'owner']::public.role_name[]
  )
);

create policy "Reminder logs insert by tenant member"
on public.reminder_dispatch_logs
for insert
with check (
  public.has_tenant_role(
    tenant_apotek_id,
    array['super_admin_bba', 'admin_apotek', 'crew']::public.role_name[]
  )
);
