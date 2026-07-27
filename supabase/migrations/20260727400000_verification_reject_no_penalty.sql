-- Verifikasi Closingan: kebijakan baru.
--  (#1) "Tolak" TIDAK lagi memberi minus_point (penalti KPI). Tolak murni status.
--  (#5) Cabang 'edit_directly' dihapus dari trigger — kode mati: "Edit Langsung"
--       memakai action 'approve' (lihat adminDirectEditSubmissionAction).
-- Efek trigger kini hanya memetakan action → status daily_submissions.
CREATE OR REPLACE FUNCTION public.apply_submission_verification_effect()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  submission_tenant uuid;
BEGIN
  SELECT tenant_apotek_id
  INTO submission_tenant
  FROM public.daily_submissions
  WHERE id = new.submission_id;

  IF submission_tenant IS NULL THEN
    RAISE EXCEPTION 'submission not found';
  END IF;

  IF new.action = 'approve' THEN
    UPDATE public.daily_submissions
    SET status = 'approved', approved_at = now()
    WHERE id = new.submission_id;
  ELSIF new.action = 'reject' THEN
    UPDATE public.daily_submissions
    SET status = 'reject', approved_at = null
    WHERE id = new.submission_id;
  END IF;

  RETURN new;
END;
$function$;
