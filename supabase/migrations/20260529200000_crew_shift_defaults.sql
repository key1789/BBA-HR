-- Pola mingguan default per crew: shift yang biasa dikerjakan + hari kerja aktif
CREATE TABLE IF NOT EXISTS public.crew_shift_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_apotek_id uuid NOT NULL REFERENCES public.tenant_apotek(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.master_shifts(id) ON DELETE CASCADE,
  -- Nilai JS getDay(): 0=Minggu, 1=Senin, 2=Selasa, 3=Rabu, 4=Kamis, 5=Jumat, 6=Sabtu
  working_weekdays integer[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_apotek_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_crew_shift_defaults_tenant ON public.crew_shift_defaults (tenant_apotek_id);
CREATE INDEX IF NOT EXISTS idx_crew_shift_defaults_user ON public.crew_shift_defaults (user_id);

ALTER TABLE public.crew_shift_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crew_shift_defaults_select_members" ON public.crew_shift_defaults;
CREATE POLICY "crew_shift_defaults_select_members" ON public.crew_shift_defaults
  FOR SELECT TO authenticated
  USING (public.is_member_of_tenant(tenant_apotek_id));

DROP POLICY IF EXISTS "crew_shift_defaults_insert_staff" ON public.crew_shift_defaults;
CREATE POLICY "crew_shift_defaults_insert_staff" ON public.crew_shift_defaults
  FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_apotek_id, ARRAY['super_admin_bba','admin_apotek']::public.role_name[]));

DROP POLICY IF EXISTS "crew_shift_defaults_update_staff" ON public.crew_shift_defaults;
CREATE POLICY "crew_shift_defaults_update_staff" ON public.crew_shift_defaults
  FOR UPDATE TO authenticated
  USING (public.has_tenant_role(tenant_apotek_id, ARRAY['super_admin_bba','admin_apotek']::public.role_name[]))
  WITH CHECK (public.has_tenant_role(tenant_apotek_id, ARRAY['super_admin_bba','admin_apotek']::public.role_name[]));

DROP POLICY IF EXISTS "crew_shift_defaults_delete_staff" ON public.crew_shift_defaults;
CREATE POLICY "crew_shift_defaults_delete_staff" ON public.crew_shift_defaults
  FOR DELETE TO authenticated
  USING (public.has_tenant_role(tenant_apotek_id, ARRAY['super_admin_bba','admin_apotek']::public.role_name[]));
