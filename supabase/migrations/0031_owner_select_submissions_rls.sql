-- Owner harus bisa membaca submission crew di tenant yang sama (portal owner / dashboard).
-- 0025 membatasi SELECT ke creator atau admin_bba; owner tidak ikut sehingga query owner kosong.

DROP POLICY IF EXISTS submissions_select_creator_or_admin ON public.daily_submissions;
CREATE POLICY submissions_select_creator_or_admin
ON public.daily_submissions
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_tenant_role(
    tenant_apotek_id,
    ARRAY['admin_apotek', 'super_admin_bba', 'owner']::public.role_name[]
  )
);

DROP POLICY IF EXISTS dsp_select_creator_or_admin ON public.daily_submission_products;
CREATE POLICY dsp_select_creator_or_admin
ON public.daily_submission_products
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.daily_submissions s
    WHERE s.id = submission_id
      AND (
        s.user_id = auth.uid()
        OR public.has_tenant_role(
          s.tenant_apotek_id,
          ARRAY['admin_apotek', 'super_admin_bba', 'owner']::public.role_name[]
        )
      )
  )
);
