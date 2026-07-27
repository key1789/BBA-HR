-- Fix schema drift: monthly_crew_audits di DB nyata dibuat di luar migrasi
-- (prototipe lama) dengan kolom status/calculated_bonus/analyst_notes, sehingga
-- migrasi 0034 (`create table if not exists`) jadi NO-OP dan kolom yang benar
-- (analyst_score, bba_adjustment, analyst_feedback, internal_review_score,
--  customer_review_score) tidak pernah ditambahkan.
--
-- Akibat: updateCrewAuditAction (simpan Penilaian Final Auditor) dan
-- syncMonthlyAppraisalsForPeriod (baca bba_adjustment sebelum Simpan Draft Payroll)
-- gagal dengan "column does not exist". Migrasi ini menyelaraskan tabel ke skema 0034.
-- Aman: idempoten; tabel dikonfirmasi 0 baris; kolom lama nullable+default & tak
-- direferensikan kode mana pun (vestigial) sehingga di-drop.

alter table public.monthly_crew_audits
  add column if not exists analyst_score          numeric(8, 2),
  add column if not exists bba_adjustment         numeric(14, 2) not null default 0,
  add column if not exists analyst_feedback       text,
  add column if not exists internal_review_score  numeric(8, 2),
  add column if not exists customer_review_score  numeric(8, 2);

-- Kolom vestigial (bukan dari migrasi, tak dipakai kode, tabel kosong)
alter table public.monthly_crew_audits
  drop column if exists status,
  drop column if exists calculated_bonus,
  drop column if exists analyst_notes;

comment on column public.monthly_crew_audits.bba_adjustment is
  'Penyesuaian nominal auditor (Apotrik) per karyawan; dibaca oleh sync rapor & payroll.';
