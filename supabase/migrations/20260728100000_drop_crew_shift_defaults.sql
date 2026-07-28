-- Hapus fitur "Pola Mingguan" (crew_shift_defaults).
--
-- Alasan: pola mingguan dinilai kurang relevan dipakai. Satu-satunya konsumennya
-- adalah tombol "Buat Jadwal Otomatis" (generateRosterFromDefaultsAction), yang ikut
-- dihapus. Roster bulanan (shift_schedules) kini diisi manual per sel. Tidak ada
-- tabel lain yang bergantung pada crew_shift_defaults (ia hanya child dari
-- tenant_apotek / app_users / master_shifts), jadi drop aman.
--
-- CASCADE menutup sisa policy/index/constraint yang menempel.
DROP TABLE IF EXISTS public.crew_shift_defaults CASCADE;
