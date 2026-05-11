-- Kolom finalisasi audit (sinkron dengan aplikasi: finalize / reopen global admin)
alter table public.monthly_audits
  add column if not exists approved_by uuid references public.app_users (id) on delete set null;

alter table public.monthly_audits
  add column if not exists approved_at timestamptz;

comment on column public.monthly_audits.approved_by is 'User BBA yang memfinalisasi audit (APPROVED).';
comment on column public.monthly_audits.approved_at is 'Waktu audit diset ke APPROVED.';
