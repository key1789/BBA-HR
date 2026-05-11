-- Owner reset password via same table may occur before tenant assignment.
ALTER TABLE public.staff_password_reset_links
  ALTER COLUMN tenant_apotek_id DROP NOT NULL;
