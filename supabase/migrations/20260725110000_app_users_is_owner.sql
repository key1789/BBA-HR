-- Penanda queryable "akun ini adalah Owner apotek" di public.app_users.
-- Menggantikan scan Auth Admin API (listUsers + filter user_metadata.role='owner')
-- yang O(semua user) dan diulang di beberapa halaman. Pola sama dgn is_global_admin / is_branch_desk_account.

alter table public.app_users
  add column if not exists is_owner boolean not null default false;

-- Backfill: owner = punya membership role 'owner' ATAU metadata Auth role='owner' (owner belum di-assign).
update public.app_users au
set is_owner = true
where au.is_owner = false
  and (
    exists (
      select 1 from public.tenant_memberships tm
      where tm.user_id = au.id and tm.role = 'owner'
    )
    or exists (
      select 1 from auth.users u
      where u.id = au.id and u.raw_user_meta_data->>'role' = 'owner'
    )
  );

create index if not exists app_users_is_owner_idx
  on public.app_users (is_owner) where is_owner;
