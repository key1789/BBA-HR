-- Mark certain apoteks as trial/demo branches.
-- BBA can filter, manage, and hard-reset these separately from production tenants.

ALTER TABLE public.tenant_apotek
  ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenant_apotek.is_trial IS
  'true = apotek demo/trial yang dipinjamkan ke prospek; semua data operasionalnya bisa di-hard-reset oleh BBA.';
