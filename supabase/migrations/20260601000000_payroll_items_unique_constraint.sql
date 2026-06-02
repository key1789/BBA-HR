-- ============================================================
-- Migration: payroll_items — tambah UNIQUE CONSTRAINT bernama
-- ============================================================
-- Konteks: migrasi sebelumnya (20260531200000) membuat partial unique index:
--   create unique index idx_payroll_items_period_user
--     on payroll_items (payroll_period_id, user_id)
--     where user_id is not null;
--
-- PostgREST tidak dapat menggunakan partial index untuk ON CONFLICT
-- kecuali ada named constraint. Tanpa named constraint, upsert dengan
-- onConflict: "payroll_period_id,user_id" akan gagal saat ada konflik.
--
-- Solusi: tambah UNIQUE CONSTRAINT penuh pada (payroll_period_id, user_id).
-- PostgreSQL memperlakukan NULL sebagai distinct — beberapa baris dengan
-- user_id IS NULL untuk period_id yang sama tetap diizinkan (tidak melanggar
-- uniqueness), sehingga data historis berbasis employee_profile_id tidak terganggu.
--
-- Partial index lama dipertahankan untuk query performance; constraint baru
-- adalah yang dipakai oleh PostgREST ON CONFLICT.
-- ============================================================

-- Hapus partial index lama (akan digantikan oleh constraint di bawah)
drop index if exists public.idx_payroll_items_period_user;

-- Tambah UNIQUE CONSTRAINT bernama agar PostgREST dapat memetakan ON CONFLICT
alter table public.payroll_items
  add constraint uq_payroll_items_period_user
  unique (payroll_period_id, user_id);

-- Recreate index performance untuk lookup snapshot (tetap gunakan partial index)
create index if not exists idx_payroll_items_has_snapshot
  on public.payroll_items (payroll_period_id, user_id)
  where config_snapshot is not null and user_id is not null;

comment on constraint uq_payroll_items_period_user on public.payroll_items is
  'Satu item payroll per user per periode. NULL user_id (legacy employee_profile_id) tetap diizinkan duplikat karena NULL != NULL di PostgreSQL.';
