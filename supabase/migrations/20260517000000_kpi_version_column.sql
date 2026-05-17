-- Tambah kolom kpi_version ke kpi_configs.
-- Semua baris lama dan baru menggunakan 'kpi' (sistem single-version).
-- Kolom calc_version di monthly_appraisals juga distandarisasi ke 'kpi'.

alter table public.kpi_configs
  add column if not exists kpi_version text not null default 'kpi'
    check (kpi_version = 'kpi');

-- Standarisasi data lama di monthly_appraisals
update public.monthly_appraisals
  set calc_version = 'kpi'
  where calc_version in ('kpi_v2', 'v1_baseline');
