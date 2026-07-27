-- Mode pencatatan closingan per-apotek.
--   'berjenjang' (default) : crew mencatat closingan → admin verifikasi (perilaku lama).
--   'admin_full'           : admin mencatat closingan atas nama tiap crew → langsung sah
--                            (auto-approve). Crew tetap login untuk absen/rapor/payroll,
--                            tapi tidak menginput closingan.
--
-- Disimpan sebagai kolom intrinsik tenant_apotek (bukan addon_settings) karena
-- saklarnya dikelola di tab "Tim & Akses" yang beroperasi langsung pada objek branch.
-- Apotek lama otomatis 'berjenjang' → nol perubahan perilaku.

ALTER TABLE public.tenant_apotek
  ADD COLUMN IF NOT EXISTS closing_mode text NOT NULL DEFAULT 'berjenjang'
    CHECK (closing_mode IN ('berjenjang', 'admin_full'));
