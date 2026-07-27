-- Pengerasan keamanan (temuan audit schema-drift): 3 tabel ORPHAN (0 baris, 0 kode)
-- punya policy 'Super admin can see all ...' yang implementasinya `FOR ALL TO public
-- USING (true)` = permisif penuh (data, termasuk employee_salary_configs = gaji,
-- secara teori terbaca lintas-tenant oleh user authenticated mana pun).
--
-- Drop policy ini → tabel jadi RLS-enabled tanpa policy = DENY-ALL kecuali service-role,
-- setara payroll_configs. NOL dampak fungsional: operasi super-admin memakai service-role
-- (bypass RLS), tak ada kode yang mengakses tabel ini via client sesi, dan tabelnya kosong.
--
-- Catatan: migrasi backfill 20260727310000 merekonstruksi policy ini (faithful thd state
-- lama). Migrasi ini (append-only, tak mengedit yang sudah applied) menghapusnya sebagai
-- fix keamanan; pada replay fresh-env: 310000 membuat → 320000 men-drop → end-state benar.

drop policy if exists "Super admin can see all crew achievements" on public.crew_achievements;
drop policy if exists "Super admin can see all daily achievements" on public.daily_achievements;
drop policy if exists "Super admin can see all salary configs" on public.employee_salary_configs;
