-- Flag untuk membedakan akun owner demo/trial dari owner produksi.
-- BBA set manual via edit owner di portal BBA.

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.app_users.is_demo IS
  'true = akun demo yang digunakan untuk keperluan trial prospek; ditandai manual oleh BBA.';
