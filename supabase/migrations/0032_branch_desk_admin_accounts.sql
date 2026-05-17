-- Akun admin cabang (meja): identitas login terpisah dari crew; tidak mengisi submission operasional.

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS is_branch_desk_account boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.app_users.is_branch_desk_account IS
  'True = akun portal admin cabang (boleh bergilir); bukan pegawai operasional; tidak mengisi daily submission.';

-- Hanya crew, super_admin_bba, atau admin_apotek yang BUKAN akun meja yang boleh INSERT daily_submissions.
DROP POLICY IF EXISTS submissions_insert_crew_admin ON public.daily_submissions;
CREATE POLICY submissions_insert_operational_staff
ON public.daily_submissions
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_tenant_role(tenant_apotek_id, ARRAY['crew', 'super_admin_bba']::public.role_name[])
  OR (
    public.has_tenant_role(tenant_apotek_id, ARRAY['admin_apotek']::public.role_name[])
    AND COALESCE(
      (SELECT au.is_branch_desk_account FROM public.app_users au WHERE au.id = auth.uid()),
      false
    ) = false
  )
);

DROP POLICY IF EXISTS dsp_insert_crew_admin ON public.daily_submission_products;
CREATE POLICY dsp_insert_operational_staff
ON public.daily_submission_products
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_tenant_role(tenant_apotek_id, ARRAY['crew', 'super_admin_bba']::public.role_name[])
  OR (
    public.has_tenant_role(tenant_apotek_id, ARRAY['admin_apotek']::public.role_name[])
    AND COALESCE(
      (SELECT au.is_branch_desk_account FROM public.app_users au WHERE au.id = auth.uid()),
      false
    ) = false
  )
);
