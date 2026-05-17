-- Ensure roster upsert conflicts are scoped per tenant.
-- Prevent accidental cross-tenant overwrite for same user/date.

DO $$
DECLARE
  old_constraint_name text;
BEGIN
  -- Drop old unique(user_id, schedule_date) constraint if it exists.
  SELECT c.conname
    INTO old_constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'shift_schedules'
    AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) ILIKE '%UNIQUE (user_id, schedule_date)%'
  LIMIT 1;

  IF old_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.shift_schedules DROP CONSTRAINT %I', old_constraint_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'shift_schedules'
      AND c.contype = 'u'
      AND c.conname = 'shift_schedules_tenant_user_date_key'
  ) THEN
    ALTER TABLE public.shift_schedules
      ADD CONSTRAINT shift_schedules_tenant_user_date_key
      UNIQUE (tenant_apotek_id, user_id, schedule_date);
  END IF;
END $$;
