-- Global super admin (app_users.is_global_admin): dapat mengakses semua tenant di RLS
-- tanpa harus punya baris tenant_memberships per cabang.

create or replace function public.is_global_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.is_global_admin from public.app_users u where u.id = auth.uid()),
    false
  );
$$;

create or replace function public.is_member_of_tenant(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_global_super_admin()
  or exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_apotek_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.is_active = true
  );
$$;

create or replace function public.has_tenant_role(target_tenant_id uuid, allowed_roles public.role_name[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      'super_admin_bba'::public.role_name = any(allowed_roles)
      and public.is_global_super_admin()
    )
    or exists (
      select 1
      from public.tenant_memberships m
      where m.tenant_apotek_id = target_tenant_id
        and m.user_id = auth.uid()
        and m.is_active = true
        and m.role = any(allowed_roles)
    );
$$;
