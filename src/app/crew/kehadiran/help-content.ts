import type { HelpContent } from "@/components/shared/help-drawer";

export const KEHADIRAN_HELP: HelpContent = {
  menuName: "Kehadiran & Jadwal",
  description:
    "Pantau jadwal kerja bulanan, catat absensi harian dengan foto selfie, dan kelola pengajuan izin atau tukar shift.",
  steps: [
    {
      title: "Cek Kalender Jadwal",
      description:
        "Kalender menampilkan semua jadwal shift kamu bulan ini. Titik hijau pada tanggal menandakan hari yang sudah tercatat kehadirannya. Tanggal hari ini ditandai latar biru muda.",
    },
    {
      title: "Absen Foto",
      description:
        "Klik tombol 'Absen Foto', ambil selfie, lalu tekan Submit. Waktu absen dicatat otomatis oleh server berdasarkan jam server — bukan jam perangkatmu. Pastikan kamu sudah berada di lokasi apotek.",
    },
    {
      title: "Pengajuan Izin",
      description:
        "Pilih jenis izin (Sakit, Cuti Tahunan, atau Keperluan Lainnya), tentukan tanggal mulai dan selesai, isi alasan, lalu lampirkan foto bukti jika ada. Pengajuan akan diproses admin.",
    },
    {
      title: "Tukar Shift",
      description:
        "Pilih jadwal kamu yang ingin ditukar, pilih kru yang memiliki jadwal di tanggal yang sama, lalu isi alasan. Admin akan memverifikasi dan memproses pertukaran.",
    },
  ],
  statuses: [
    {
      label: "Menunggu",
      variant: "warning",
      description: "Pengajuan sudah terkirim, menunggu persetujuan admin.",
    },
    {
      label: "Disetujui",
      variant: "success",
      description: "Admin telah menyetujui pengajuan izin atau tukar shift.",
    },
    {
      label: "Ditolak",
      variant: "error",
      description: "Admin menolak pengajuan. Kamu bisa mengajukan kembali dengan alasan lebih lengkap.",
    },
  ],
  tips: [
    {
      type: "warning",
      text: "Keterlambatan dihitung otomatis berdasarkan jam absen dibandingkan jam mulai shift. Pastikan absen tepat waktu.",
    },
    {
      type: "info",
      text: "Lampiran foto (surat dokter, surat keterangan) sangat dianjurkan untuk izin sakit — mempercepat persetujuan admin.",
    },
    {
      type: "tip",
      text: "Untuk tukar shift, hanya kru yang memiliki jadwal di tanggal yang sama yang bisa dipilih sebagai target penukaran.",
    },
  ],
};
