-- Ensure ON CONFLICT target used by saveProductFokusAction exists.
-- Also deduplicate legacy rows that may block unique constraint creation.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'product_fokus_configs'
  ) THEN
    WITH ranked AS (
      SELECT
        ctid,
        ROW_NUMBER() OVER (
          PARTITION BY tenant_apotek_id, product_id, period_month, period_year
          ORDER BY created_at DESC NULLS LAST, id DESC
        ) AS rn
      FROM public.product_fokus_configs
    )
    DELETE FROM public.product_fokus_configs p
    USING ranked r
    WHERE p.ctid = r.ctid
      AND r.rn > 1;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'product_fokus_configs'
        AND c.contype = 'u'
        AND c.conname = 'product_fokus_configs_tenant_product_period_key'
    ) THEN
      ALTER TABLE public.product_fokus_configs
        ADD CONSTRAINT product_fokus_configs_tenant_product_period_key
        UNIQUE (tenant_apotek_id, product_id, period_month, period_year);
    END IF;
  END IF;
END $$;
