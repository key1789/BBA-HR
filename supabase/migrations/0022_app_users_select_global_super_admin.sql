-- Nested app_users dari tenant_memberships gagal untuk superadmin global (0018) yang
-- tidak punya baris membership di setiap cabang: policy lama hanya self + share_tenant_with_user.

DROP POLICY IF EXISTS app_users_select_self_or_shared_tenant ON public.app_users;

CREATE POLICY app_users_select_self_or_shared_tenant
ON public.app_users
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.share_tenant_with_user(id)
  OR public.is_global_super_admin()
);
