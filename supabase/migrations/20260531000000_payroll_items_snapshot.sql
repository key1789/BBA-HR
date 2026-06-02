-- ============================================================
-- Migration: payroll_items snapshot & days_worked
-- ============================================================
-- Adds two columns to payroll_items:
--
--   days_worked     — hari masuk karyawan bulan ini (manual input oleh
--                     BBA/analyst). Digunakan untuk menghitung komponen
--                     harian: uang_makan × days_worked, transport × days_worked.
--                     NULL = belum diisi.
--
--   config_snapshot — snapshot lengkap rincian payroll pada saat draft
--                     disimpan. Menyimpan breakdown per komponen (gaji pokok,
--                     setiap tunjangan, setiap potongan, bonus dari audit)
--                     sehingga perubahan konfigurasi di bulan berikutnya
--                     tidak mempengaruhi histori periode lama.
--
-- Shape of config_snapshot (JSONB):
-- {
--   "days_worked": 26,
--   "base_salary": 5000000,
--   "position_allowance": 500000,
--   "meal_allowance_per_day": 15000,
--   "meal_allowance_total": 390000,        -- meal_allowance_per_day × days_worked
--   "transport_allowance_per_day": 20000,
--   "transport_allowance_total": 520000,   -- transport × days_worked
--   "custom_adjustments": [               -- snapshot dari payroll_configs.custom_adjustments
--     { "id": "...", "name": "...", "type": "addition|deduction|bpjs_employee|bpjs_employer", "amount": 200000 }
--   ],
--   "bonus_from_audit": {                 -- pulled dari monthly_audit kpi+produk+addon+adjustment
--     "kpi": 1100000,
--     "produk_fokus": 300000,
--     "addon_manual": 200000,
--     "adjustment": -50000,
--     "total": 1550000
--   },
--   "totals": {
--     "gross_income": 6410000,            -- semua pendapatan (sebelum bonus audit)
--     "total_deductions": 250000,
--     "bonus_total": 1550000,
--     "net_salary": 7710000               -- gross_income - deductions + bonus_total
--   },
--   "config_source": "default|override",  -- "override" jika diubah dari audit tab (bulan ini saja)
--   "saved_at": "2026-05-31T10:00:00Z"
-- }
-- ============================================================

alter table public.payroll_items
  add column if not exists days_worked     integer       check (days_worked is null or days_worked >= 0),
  add column if not exists config_snapshot jsonb;

-- GIN index untuk query/filter berdasarkan isi snapshot (mis. bonus_from_audit, config_source)
create index if not exists idx_payroll_items_config_snapshot
  on public.payroll_items using gin (config_snapshot);

-- Partial index: items yang sudah punya snapshot (digunakan untuk display di audit tab)
create index if not exists idx_payroll_items_has_snapshot
  on public.payroll_items (payroll_period_id, employee_profile_id)
  where config_snapshot is not null;

comment on column public.payroll_items.days_worked is
  'Jumlah hari masuk karyawan periode ini. Dipakai untuk menghitung komponen harian (uang makan, transport). Diisi manual oleh BBA/analyst.';

comment on column public.payroll_items.config_snapshot is
  'Snapshot lengkap rincian payroll saat draft disimpan. Berisi breakdown per komponen pendapatan, potongan, dan bonus dari audit. Immutable setelah period terkunci.';
