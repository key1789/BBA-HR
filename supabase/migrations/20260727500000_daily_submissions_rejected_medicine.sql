-- Poin input baru: "Obat Tertolak" (rejected_medicine_total) — jumlah item obat yang
-- gagal dilayani (stok habis, resep tak lengkap, dll). METRIK PELAPORAN saja (bukan
-- KPI/bonus), independen dari rejected_customer_total. Default 0 utk baris lama.
ALTER TABLE public.daily_submissions
  ADD COLUMN IF NOT EXISTS rejected_medicine_total integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.daily_submissions.rejected_medicine_total IS
  'Jumlah item obat yang tertolak/gagal dilayani per closingan (pelaporan, bukan bonus).';
