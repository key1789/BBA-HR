-- Allow tenant members to read product fokus configs (for crew input form).
-- Table may come from older schema; guard with existence checks.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'product_fokus_configs'
  ) THEN
    -- Ensure RLS is enabled (no-op if already enabled).
    EXECUTE 'ALTER TABLE public.product_fokus_configs ENABLE ROW LEVEL SECURITY';

    -- Create a read policy for tenant members if missing.
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'product_fokus_configs'
        AND policyname = 'product_fokus_configs_select_members'
    ) THEN
      EXECUTE $POLICY$
        CREATE POLICY product_fokus_configs_select_members
        ON public.product_fokus_configs
        FOR SELECT
        TO authenticated
        USING (public.is_member_of_tenant(tenant_apotek_id))
      $POLICY$;
    END IF;
  END IF;
END $$;

