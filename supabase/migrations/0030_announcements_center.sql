-- Pusat Pengumuman fase 1 (BBA publish terpusat, audience Admin + Crew)

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  priority text not null default 'info',
  status text not null default 'draft',
  require_ack boolean not null default false,
  publish_at timestamptz,
  expire_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_by_user_id uuid references public.app_users (id) on delete set null,
  updated_by_user_id uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_priority_chk check (priority in ('info', 'attention', 'required', 'urgent')),
  constraint announcements_status_chk check (status in ('draft', 'scheduled', 'published', 'archived'))
);

create index if not exists idx_announcements_status_publish_at
  on public.announcements (status, publish_at desc nulls last);
create index if not exists idx_announcements_expire_at
  on public.announcements (expire_at);

create table if not exists public.announcement_targets (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  target_role public.role_name not null,
  tenant_apotek_id uuid references public.tenant_apotek (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint announcement_targets_role_chk check (target_role in ('admin_apotek', 'crew'))
);

create unique index if not exists idx_announcement_targets_unique
  on public.announcement_targets (announcement_id, target_role, coalesce(tenant_apotek_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists idx_announcement_targets_announcement
  on public.announcement_targets (announcement_id);

create index if not exists idx_announcement_targets_tenant_role
  on public.announcement_targets (tenant_apotek_id, target_role);

create table if not exists public.announcement_receipts (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id uuid not null references public.app_users (id) on delete cascade,
  tenant_apotek_id uuid references public.tenant_apotek (id) on delete cascade,
  role public.role_name not null,
  delivery_status text not null default 'delivered',
  delivered_at timestamptz not null default now(),
  viewed_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcement_receipts_delivery_chk check (delivery_status in ('delivered', 'failed')),
  constraint announcement_receipts_role_chk check (role in ('admin_apotek', 'crew'))
);

create unique index if not exists idx_announcement_receipts_unique
  on public.announcement_receipts (announcement_id, user_id);

create index if not exists idx_announcement_receipts_announcement
  on public.announcement_receipts (announcement_id);

create index if not exists idx_announcement_receipts_user
  on public.announcement_receipts (user_id);

create table if not exists public.announcement_audit_logs (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  actor_user_id uuid references public.app_users (id) on delete set null,
  action text not null,
  old_value jsonb not null default '{}'::jsonb,
  new_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_announcement_audit_logs_announcement
  on public.announcement_audit_logs (announcement_id, created_at desc);

alter table public.announcements enable row level security;
alter table public.announcement_targets enable row level security;
alter table public.announcement_receipts enable row level security;
alter table public.announcement_audit_logs enable row level security;

drop policy if exists "announcement_receipts_select_own" on public.announcement_receipts;
create policy "announcement_receipts_select_own"
  on public.announcement_receipts
  for select to authenticated
  using (auth.uid() = user_id);

comment on table public.announcements is 'Master data pengumuman operasional dari BBA (draft/scheduled/published/archived).';
comment on table public.announcement_targets is 'Target penerima pengumuman per role dan opsional per tenant.';
comment on table public.announcement_receipts is 'Status delivery/viewed/ack per user untuk setiap pengumuman.';
comment on table public.announcement_audit_logs is 'Audit trail perubahan lifecycle pengumuman.';
