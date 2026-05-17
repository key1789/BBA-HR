export const FEEDBACK_MESSAGES: Record<string, string> = {
  // --- Umum ---
  access_denied: "Akses ditolak untuk aksi ini.",
  user_not_found: "Sesi tidak ditemukan. Silakan login ulang.",

  // --- Input Harian (Crew & Admin) ---
  draft_saved: "Draft berhasil disimpan.",
  submission_submitted: "Laporan harian berhasil dikirim untuk verifikasi.",
  submission_updated: "Laporan berhasil diperbarui.",
  invalid_input: "Input tidak valid. Mohon periksa kembali semua kolom isian.",
  save_failed: "Gagal menyimpan laporan. Coba lagi beberapa saat.",
  focus_save_failed: "Laporan utama tersimpan, tetapi detail produk fokus gagal tersimpan. Coba simpan ulang.",
  approved_locked: "Laporan ini sudah disetujui dan tidak dapat diubah lagi.",
  duplicate_exists: "Tanggal dan shift ini sudah memiliki laporan. Gunakan tombol Edit jika ingin mengubahnya.",

  // --- Verifikasi (Admin) ---
  single_verified: "Verifikasi berhasil diproses.",
  single_not_eligible: "Laporan ini tidak memenuhi syarat untuk diverifikasi.",
  single_insert_failed: "Gagal menyimpan aksi verifikasi. Silakan coba lagi.",
  single_action_invalid: "Aksi verifikasi tidak dikenali.",
  single_invalid_payload: "Data verifikasi tidak lengkap.",
  edit_direct_saved: "Perbaikan admin berhasil disimpan dan laporan difinalkan.",
  edit_direct_invalid: "Input edit langsung tidak valid.",
  edit_direct_save_failed: "Gagal menyimpan perbaikan admin. Coba lagi.",

  // --- Verifikasi Massal (Admin) ---
  bulk_approved: "Persetujuan massal berhasil diproses.",
  bulk_rejected: "Penolakan massal berhasil diproses.",
  bulk_edited_directly: "Edit langsung massal berhasil diproses.",
  bulk_empty: "Pilih minimal satu laporan untuk diproses.",
  bulk_none_eligible: "Laporan yang dipilih tidak memenuhi syarat untuk aksi ini.",
  bulk_action_invalid: "Aksi massal tidak dikenali.",
  bulk_fetch_failed: "Gagal membaca data laporan yang dipilih.",
  bulk_insert_failed: "Proses massal gagal. Silakan coba lagi.",

  // --- Penugasan (Admin) ---
  assign_unassigned_success: "Laporan berhasil ditugaskan.",
  assign_take_over_success: "Penugasan berhasil diambil alih.",
  assign_selection_empty: "Pilih minimal satu laporan untuk ditugaskan.",
  assign_all_assigned: "Semua laporan yang dipilih sudah memiliki penugasan.",
  assign_none_eligible: "Tidak ada laporan yang memenuhi syarat untuk ditugaskan.",
  assign_mode_invalid: "Mode penugasan tidak valid.",
  assign_fetch_failed: "Gagal membaca data laporan.",
  assign_upsert_failed: "Gagal menyimpan penugasan. Coba lagi.",

  // --- Absensi & Izin (Crew) ---
  leave_invalid_payload: "Data pengajuan izin tidak lengkap.",
  leave_not_eligible: "Pengajuan izin ini tidak dapat diperbarui.",
  leave_update_failed: "Gagal memperbarui status izin. Coba lagi.",
  leave_updated: "Status izin berhasil diperbarui.",
  admin_note_required: "Catatan admin wajib diisi.",
  swap_invalid_payload: "Data pengajuan tukar shift tidak lengkap.",
  swap_not_eligible: "Pengajuan tukar shift ini tidak dapat diperbarui.",
  swap_update_failed: "Gagal memperbarui tukar shift. Coba lagi.",
  swap_updated: "Tukar shift berhasil diperbarui.",
  swap_missing_target_schedule: "Jadwal shift tujuan tidak ditemukan.",
  swap_schedule_not_found: "Jadwal tidak ditemukan.",
  swap_apply_failed: "Gagal menerapkan tukar shift. Coba lagi.",

  // --- Payroll & Rapor (BBA) ---
  tenant_required: "Pilih cabang terlebih dahulu.",
  invalid_appraisal_period: "Periode tidak valid.",
  appraisal_reason_required: "Alasan wajib diisi (min. 3 karakter).",
  appraisal_recalc_failed: "Gagal menghitung ulang rapor.",
  appraisal_recalculated: "Rapor bulanan berhasil dihitung ulang.",
  appraisal_recalculated_bulk: "Rapor multi-periode berhasil dihitung ulang.",
  appraisal_already_published: "Periode sudah dipublish, tidak dapat dihitung ulang.",
  appraisal_publish_failed: "Gagal mempublish rapor.",
  appraisal_published: "Rapor bulanan berhasil dipublish.",
  appraisal_unpublish_failed: "Gagal membatalkan publish rapor.",
  appraisal_unpublished: "Rapor bulanan berhasil dibatalkan publishnya.",
  appraisal_not_found: "Belum ada rapor untuk periode ini. Hitung ulang atau finalisasi audit terlebih dahulu.",
  appraisal_not_published: "Periode ini belum dipublish.",
  appraisal_schema_missing: "Skema database rapor belum tersedia.",
  no_crew_members: "Tidak ada crew aktif di cabang ini.",
  period_locked: "Periode payroll berhasil dikunci.",
  period_unlocked: "Periode payroll berhasil dibuka kembali.",
  lock_failed: "Gagal mengunci periode.",
  unlock_failed: "Gagal membuka kunci periode.",
  lock_reason_required: "Alasan penguncian wajib diisi.",
  unlock_reason_required: "Alasan pembukaan kunci wajib diisi.",
  period_not_found: "Periode payroll tidak ditemukan.",
  already_locked: "Periode ini sudah terkunci.",
  not_locked: "Periode ini belum terkunci.",
};

export function getFeedbackMessage(key: string | null | undefined, fallback = "Aksi selesai."): string {
  if (!key) return fallback;
  return FEEDBACK_MESSAGES[key] ?? fallback;
}
