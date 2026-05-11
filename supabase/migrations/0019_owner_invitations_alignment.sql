-- Align owner_invitations with staff invitation patterns + allow re-invite after accept.
-- Owner tidak terikat satu apotek: undangan ini hanya membuat identitas owner (app_users + auth);
-- penempatan ke banyak cabang tetap lewat tenant_memberships di Manajemen Apotek.

ALTER TABLE public.owner_invitations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_by_user_id UUID REFERENCES public.app_users(id);

ALTER TABLE public.owner_invitations
  DROP CONSTRAINT IF EXISTS owner_invitations_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_invitations_one_pending_email_lower
  ON public.owner_invitations (lower(trim(email)))
  WHERE (status = 'pending');

ALTER TABLE public.owner_invitations
  DROP CONSTRAINT IF EXISTS owner_invitations_status_check;

ALTER TABLE public.owner_invitations
  ADD CONSTRAINT owner_invitations_status_check
  CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled'));

DROP TRIGGER IF EXISTS trg_owner_invitations_updated_at ON public.owner_invitations;

CREATE TRIGGER trg_owner_invitations_updated_at
  BEFORE UPDATE ON public.owner_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
