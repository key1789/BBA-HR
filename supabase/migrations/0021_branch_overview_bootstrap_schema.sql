-- Kolom profil cabang untuk tab Overview (selaras dengan updateBranchAction)
ALTER TABLE public.tenant_apotek
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text;

-- JSON konfigurasi per add-on (clone/review PIC, dll.)
ALTER TABLE public.addon_settings
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Master shift (seed minimal saat daftar cabang baru)
CREATE TABLE IF NOT EXISTS public.master_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_apotek_id uuid NOT NULL REFERENCES public.tenant_apotek(id) ON DELETE CASCADE,
  shift_name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_master_shifts_tenant ON public.master_shifts (tenant_apotek_id);

ALTER TABLE public.master_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "master_shifts_select_members" ON public.master_shifts;
CREATE POLICY "master_shifts_select_members" ON public.master_shifts
  FOR SELECT TO authenticated
  USING (public.is_member_of_tenant(tenant_apotek_id));

DROP POLICY IF EXISTS "master_shifts_insert_staff" ON public.master_shifts;
CREATE POLICY "master_shifts_insert_staff" ON public.master_shifts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_apotek_id, ARRAY['super_admin_bba','admin_apotek']::public.role_name[]));

DROP POLICY IF EXISTS "master_shifts_update_staff" ON public.master_shifts;
CREATE POLICY "master_shifts_update_staff" ON public.master_shifts
  FOR UPDATE TO authenticated
  USING (public.has_tenant_role(tenant_apotek_id, ARRAY['super_admin_bba','admin_apotek']::public.role_name[]))
  WITH CHECK (public.has_tenant_role(tenant_apotek_id, ARRAY['super_admin_bba','admin_apotek']::public.role_name[]));

DROP POLICY IF EXISTS "master_shifts_delete_staff" ON public.master_shifts;
CREATE POLICY "master_shifts_delete_staff" ON public.master_shifts
  FOR DELETE TO authenticated
  USING (public.has_tenant_role(tenant_apotek_id, ARRAY['super_admin_bba','admin_apotek']::public.role_name[]));
