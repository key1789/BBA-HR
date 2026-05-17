-- Audit trail for super-admin portal governance actions (invite, promote, demote, analyst scope, etc.)

create table if not exists public.bba_portal_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.app_users (id) on delete set null,
  action text not null,
  target_user_id uuid references public.app_users (id) on delete set null,
  target_invitation_id uuid references public.bba_portal_staff_invitations (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_bba_portal_admin_audit_created_at
  on public.bba_portal_admin_audit (created_at desc);

comment on table public.bba_portal_admin_audit is 'Append-only style log for BBA portal staff/global management actions.';
