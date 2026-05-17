-- Audit trail untuk state transitions & perubahan data pada monthly_audits.
-- Mencakup: submit_for_review, finalize, reopen, crew_lock, crew_unlock,
--           crew_audit_update, addon_upsert, recalculate.

create table if not exists public.monthly_audit_state_events (
  id               uuid        primary key default gen_random_uuid(),
  monthly_audit_id uuid        references public.monthly_audits (id) on delete set null,
  tenant_apotek_id uuid        not null references public.tenant_apotek (id) on delete cascade,
  period_month     int         not null check (period_month between 1 and 12),
  period_year      int         not null check (period_year >= 2000),
  action           text        not null,
  actor_user_id    uuid        references public.app_users (id) on delete set null,
  target_user_id   uuid        references public.app_users (id) on delete set null,
  from_status      text,
  to_status        text,
  metadata         jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists idx_monthly_audit_state_events_audit_id
  on public.monthly_audit_state_events (monthly_audit_id, created_at desc);

create index if not exists idx_monthly_audit_state_events_tenant_period
  on public.monthly_audit_state_events (tenant_apotek_id, period_year desc, period_month desc, created_at desc);

alter table public.monthly_audit_state_events enable row level security;

-- BBA super admin dapat melihat log cabang mereka.
create policy monthly_audit_state_events_select_bba
  on public.monthly_audit_state_events
  for select to authenticated
  using (
    public.has_tenant_role(
      tenant_apotek_id,
      array['super_admin_bba']::public.role_name[]
    )
  );

-- Insert hanya lewat service role (admin client) — aplikasi menggunakan createAdminClient().
-- Tidak ada insert policy untuk authenticated role.
