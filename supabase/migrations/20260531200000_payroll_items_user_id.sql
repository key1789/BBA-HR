-- ============================================================
-- Migration: payroll_items — tambah user_id, buat employee_profile_id nullable
-- ============================================================
-- Konteks: sistem audit memakai app_users.id sebagai kunci karyawan
-- (monthly_crew_audits, payroll_configs, dsb.), sedangkan employee_profiles
-- adalah tabel rekrutmen yang tidak memiliki kolom user_id.
--
-- Solusi: tambah kolom user_id (FK ke app_users) di payroll_items sehingga
-- draft payroll yang disimpan dari tab Audit dapat dikaitkan langsung ke
-- karyawan aktif tanpa perlu record employee_profiles.
--
-- employee_profile_id dibuat nullable (bukan dihapus) agar data historis
-- yang mungkin sudah ada tidak terganggu.
-- ============================================================

-- 1. Jadikan employee_profile_id nullable
alter table public.payroll_items
  alter column employee_profile_id drop not null;

-- 2. Tambah kolom user_id (FK ke app_users)
alter table public.payroll_items
  add column if not exists user_id uuid references public.app_users(id) on delete set null;

-- 3. Unique index: satu item payroll per user per periode
--    (partial index — hanya berlaku bila user_id terisi)
create unique index if not exists idx_payroll_items_period_user
  on public.payroll_items (payroll_period_id, user_id)
  where user_id is not null;

-- 4. Drop index lama yang menggunakan employee_profile_id (dari migration snapshot)
--    dan buat ulang dengan user_id sebagai kolom utama
drop index if exists public.idx_payroll_items_has_snapshot;

create index if not exists idx_payroll_items_has_snapshot
  on public.payroll_items (payroll_period_id, user_id)
  where config_snapshot is not null and user_id is not null;

-- 5. Index untuk lookup payroll item per user_id
create index if not exists idx_payroll_items_user_id
  on public.payroll_items (user_id)
  where user_id is not null;

comment on column public.payroll_items.user_id is
  'FK ke app_users.id. Diisi oleh sistem audit (draft payroll dari tab Audit BBA). employee_profile_id dipertahankan untuk integrasi rekrutmen/legacy.';

comment on column public.payroll_items.employee_profile_id is
  'FK ke employee_profiles.id. Sekarang nullable — digunakan oleh payroll tradisional (HR). Untuk draft dari audit, gunakan user_id.';
