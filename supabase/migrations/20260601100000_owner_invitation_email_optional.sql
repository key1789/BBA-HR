-- Owner invitations: email is now optional at creation time.
-- BBA fills only the owner's name; the owner fills their own email when accepting.
-- The unique-on-pending partial index is dropped because there's no email to deduplicate at creation.

ALTER TABLE public.owner_invitations
  ALTER COLUMN email DROP NOT NULL;

DROP INDEX IF EXISTS idx_owner_invitations_one_pending_email_lower;
