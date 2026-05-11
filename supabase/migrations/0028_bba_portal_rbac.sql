-- Portal BBA: role staff (analyst), izin menu per user, undangan email, mutual exclusivity dengan global admin.

do $$
begin
  create type public.bba_portal_staff_role as enum ('analyst');
exception
  when duplicate_object then null;
end $$;

alter table public.app_users
  add column if not exists bba_portal_staff_role public.bba_portal_staff_role;

alter table public.app_users
  drop constraint if exists app_users_global_vs_portal_staff_role_chk;

alter table public.app_users
  add constraint app_users_global_vs_portal_staff_role_chk
  check (not (coalesce(is_global_admin, false) = true and bba_portal_staff_role is not null));

create table if not exists public.bba_portal_user_menus (
  user_id uuid not null references public.app_users (id) on delete cascade,
  menu_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, menu_key)
);

create index if not exists idx_bba_portal_user_menus_user on public.bba_portal_user_menus (user_id);

alter table public.bba_portal_user_menus enable row level security;

drop policy if exists "bba_portal_user_menus_select_own" on public.bba_portal_user_menus;
create policy "bba_portal_user_menus_select_own"
  on public.bba_portal_user_menus
  for select
  using (auth.uid() = user_id);

create table if not exists public.bba_portal_staff_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  token text not null unique,
  staff_role public.bba_portal_staff_role not null default 'analyst',
  tenant_apotek_ids uuid[] not null default '{}'::uuid[],
  menu_keys text[] not null default '{}'::text[],
  status text not null default 'pending',
  expires_at timestamptz not null,
  created_by_user_id uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by_user_id uuid references public.app_users (id) on delete set null
);

create index if not exists idx_bba_portal_staff_inv_token on public.bba_portal_staff_invitations (token);
create index if not exists idx_bba_portal_staff_inv_status on public.bba_portal_staff_invitations (status);

drop index if exists public.idx_bba_portal_staff_inv_one_pending_email_lower;

create unique index idx_bba_portal_staff_inv_one_pending_email_lower
  on public.bba_portal_staff_invitations (lower(trim(email)))
  where status = 'pending';

alter table public.bba_portal_staff_invitations enable row level security;

comment on column public.app_users.bba_portal_staff_role is 'Role portal BBA non-global (mis. analyst). NULL = staff BBA penuh per cabang (legacy) atau non-staff.';
comment on table public.bba_portal_user_menus is 'Menu portal BBA yang boleh diakses user analyst (kunci = menu_key aplikasi).';
