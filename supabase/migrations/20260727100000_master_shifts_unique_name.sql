-- Nama shift wajib unik per apotek (case-insensitive, abaikan spasi tepi).
-- Nama shift dipakai sebagai kunci closingan (daily_submissions.shift_label) &
-- nilai opsi di form input crew/admin — duplikat membuat closingan ambigu.
CREATE UNIQUE INDEX IF NOT EXISTS idx_master_shifts_tenant_name_unique
  ON public.master_shifts (tenant_apotek_id, lower(btrim(shift_name)));
