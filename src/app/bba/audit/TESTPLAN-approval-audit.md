# Test Plan Approval & Audit

## Scope
- Workflow status: `DRAFT -> UNDER_REVIEW -> APPROVED -> UNDER_REVIEW (global reopen)`.
- Guardrails mutasi: RBAC action-level, lock period payroll, lock baris crew.
- Konsistensi UI: label status list/detail, CTA utama, penanda outlier harian.
- Konsistensi metrik: denominator KPI menggunakan crew aktif.

## Unit / Server Action Checks
- `finalizeAuditAction` menolak jika status sudah `APPROVED`.
- `finalizeAuditAction` menolak jika periode payroll sudah publish.
- `finalizeAuditAction` rollback status saat lock crew gagal (tidak partial finalize).
- `updateCrewAuditAction` menolak untuk non `super_admin_bba`.
- `upsertMonthlyAddonAppraisalAction` menolak `addonKey` di luar whitelist.
- `upsertMonthlyAddonAppraisalAction` menolak skor di luar 0..100.
- `upsertMonthlyAddonAppraisalAction` menolak nominal di luar batas range.

## Role Access Matrix
- `super_admin_bba`: dapat edit crew audit, lock/unlock, simpan add-on, finalize.
- `analyst` tanpa menu audit: seluruh mutasi audit ditolak.
- role selain `super_admin_bba`: seluruh mutasi audit ditolak.
- `global super admin`: hanya bisa reopen audit approved.

## E2E Scenarios
1. **Finalize sukses**
   - Siapkan audit `UNDER_REVIEW` dengan crew belum terkunci.
   - Klik `Setujui audit`.
   - Verifikasi status jadi `Approved` dan seluruh `monthly_crew_audits.is_locked=true`.
2. **Finalize gagal lock**
   - Simulasikan kegagalan lock row crew.
   - Jalankan finalize.
   - Verifikasi status audit tetap status awal (rollback), muncul error non-partial.
3. **Reopen by global**
   - Login sebagai global super admin.
   - Reopen audit `APPROVED`.
   - Verifikasi status kembali `Under Review` dan lock crew terbuka.
4. **Published payroll hard-stop**
   - Publish payroll period.
   - Coba edit crew audit / simpan add-on / toggle lock.
   - Verifikasi semua mutasi ditolak.
5. **UI consistency**
   - Buka list dan detail untuk cabang sama.
   - Verifikasi status badge konsisten (`Draft`, `Under Review`, `Approved`).
6. **Daily outlier**
   - Masukkan data hari dengan reject tinggi atau omzet turun drastis.
   - Verifikasi baris tertandai badge `Outlier`.

## Regression Checklist
- Halaman `bba/audit` bisa render normal untuk semua periode.
- Halaman detail audit tetap bisa buka tab `Ringkasan`, `Bulanan/MTD`, `Rincian Harian`, `Payroll & Rapor`.
- Revalidate path setelah mutasi audit tetap berjalan.
