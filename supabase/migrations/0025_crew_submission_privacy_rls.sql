-- Crew should only read their own raw submissions and submission product details.
-- Admin apotek / super admin can still supervise tenant-level records.

DROP POLICY IF EXISTS submissions_select_members ON public.daily_submissions;
CREATE POLICY submissions_select_creator_or_admin
ON public.daily_submissions
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_tenant_role(
    tenant_apotek_id,
    ARRAY['admin_apotek', 'super_admin_bba']::public.role_name[]
  )
);

DROP POLICY IF EXISTS dsp_select_members ON public.daily_submission_products;
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
          ARRAY['admin_apotek', 'super_admin_bba']::public.role_name[]
        )
      )
  )
);
