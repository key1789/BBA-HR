# Test Plan Approval & Audit

## Scope
- Workflow status: `DRAFT -> UNDER_REVIEW -> APPROVED -> UNDER_REVIEW (global reopen)`.
- Guardrails mutasi: RBAC action-level, lock period payroll, lock baris crew.
- Konsistensi UI: label status list/detail, CTA utama, penanda outlier harian.
- Konsistensi metrik: denominator KPI menggunakan crew aktif; sinkron KPI V2 saat finalize.
- Portal owner: filter laporan terverifikasi (default) vs semua alur verifikasi.

## P0/P1 (sudah diimplementasi — regression)
- Finalize memanggil `syncMonthlyAppraisalsForPeriod` dengan `calcVersion` KPI V2 bila `bonus_config_v2` valid.
- Halaman `/bba/payroll` menampilkan rapor hasil sync; status `UNDER_REVIEW` di list & detail audit.
- UI audit crew: lock/unlock baris, skor analis, penyesuaian BBA, add-on bulanan.

## Unit / Server Action Checks
- `finalizeAuditAction` menolak jika status sudah `APPROVED`.
- `finalizeAuditAction` menolak jika periode payroll sudah publish.
- `finalizeAuditAction` rollback status saat lock crew gagal (tidak partial finalize).
- `finalizeAuditAction` memicu sync rapor (V2 bila skema aktif) sebelum set `APPROVED`.
- `updateCrewAuditAction` menolak untuk non `super_admin_bba`.
- `upsertMonthlyAddonAppraisalAction` menolak `addonKey` di luar whitelist.
- `upsertMonthlyAddonAppraisalAction` menolak skor di luar 0..100.
- `upsertMonthlyAddonAppraisalAction` menolak nominal di luar batas range.

## Role Access Matrix
- `super_admin_bba`: dapat edit crew audit, lock/unlock, simpan add-on, finalize.
- `analyst` tanpa menu audit: seluruh mutasi audit ditolak.
- role selain `super_admin_bba`: seluruh mutasi audit ditolak.
- `global super admin`: hanya bisa reopen audit approved.
- `owner`: read-only audit & dashboard; RLS `monthly_audits` select via membership tenant.

## E2E Scenarios
1. **Finalize sukses**
   - Siapkan audit `UNDER_REVIEW` dengan crew belum terkunci.
   - Klik `Setujui audit` (perhatikan hint KPI V2 jika cabang memakai V2).
   - Verifikasi status jadi `Approved` dan seluruh `monthly_crew_audits.is_locked=true`.
2. **Finalize → Payroll (KPI V2)**
   - Cabang dengan `bonus_config_v2` dan minimal satu skema `enabled`.
   - Finalize audit periode tersebut.
   - Buka `/bba/payroll?month=M&year=Y` untuk tenant yang sama.
   - Verifikasi baris `monthly_appraisals` ter-update (`calc_version` kpi_v2 / breakdown V2), bonus selaras audit.
3. **Finalize gagal lock**
   - Simulasikan kegagalan lock row crew.
   - Jalankan finalize.
   - Verifikasi status audit tetap status awal (rollback), muncul error non-partial.
4. **Reopen by global**
   - Login sebagai global super admin.
   - Reopen audit `APPROVED`.
   - Verifikasi status kembali `Under Review` dan lock crew terbuka.
5. **Published payroll hard-stop**
   - Publish payroll period.
   - Coba edit crew audit / simpan add-on / toggle lock.
   - Verifikasi semua mutasi ditolak.
6. **UI consistency**
   - Buka list dan detail untuk cabang sama.
   - Verifikasi status badge konsisten (`Draft`, `Under Review`, `Approved`).
   - Kartu list menampilkan badge `KPI V2` bila skema aktif di periode.
7. **Daily outlier**
   - Masukkan data hari dengan reject tinggi atau omzet turun drastis.
   - Verifikasi baris tertandai badge `Outlier`.
8. **Owner — laporan terverifikasi (default)**
   - Login owner, buka `/owner/ringkasan-bonus` tanpa query (default terverifikasi).
   - Bandingkan total omzet MTD dengan `/bba/audit/[tenant]` untuk periode sama → harus selaras.
9. **Owner — semua alur verifikasi**
   - Toggle `Semua alur` atau `?verifiedOnly=false`.
   - Verifikasi omzet/KPI naik jika ada submission `submitted` belum disetujui.
   - Kembali ke `Terverifikasi` → angka kembali selaras BBA.

## P2 — THP & payroll slip
- Di tab Payroll & Rapor audit, perkiraan THP akhir untuk karyawan terpilih memasukkan bonus produk fokus otomatis (selaras baris slip).
- `getUserStats().thp` memasukkan `productBonus` dari perhitungan produk fokus (bukan placeholder 0).

## Regression Checklist
- Halaman `bba/audit` bisa render normal untuk semua periode.
- Halaman detail audit tetap bisa buka tab `Ringkasan`, `Data per Karyawan` (MTD, harian, payroll).
- Revalidate path setelah mutasi audit tetap berjalan (`/bba/audit/[id]`, `/bba/payroll`).
- Owner portal: toggle verified tidak merusak navigasi bulan/cabang.
