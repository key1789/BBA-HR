import type { HelpContent } from "@/components/shared/help-drawer";

export const RIWAYAT_INPUT_HELP: HelpContent = {
  menuName: "Riwayat Input",
  description:
    "Lihat seluruh riwayat laporan input harian yang pernah kamu buat, dengan filter status dan rentang tanggal.",
  steps: [
    {
      title: "Status Summary",
      description:
        "Chip ringkasan di bagian atas menampilkan jumlah laporan per status. Klik salah satunya untuk langsung memfilter berdasarkan status tersebut.",
    },
    {
      title: "Filter Data",
      description:
        "Gunakan filter Status, Dari, dan Sampai untuk menyaring data. Klik tombol Filter untuk menerapkan, atau Reset untuk kembali ke tampilan semua data.",
    },
    {
      title: "Edit Laporan",
      description:
        "Untuk mengedit laporan berstatus Draft atau Ditolak, gunakan tombol 'Input Baru' atau buka halaman Input Harian dan pilih Edit pada log laporan. Laporan Disetujui tidak bisa diubah dari portal crew.",
    },
  ],
  statuses: [
    {
      label: "Draft",
      variant: "neutral",
      description: "Tersimpan sementara, belum dikirim ke admin.",
    },
    {
      label: "Menunggu",
      variant: "warning",
      description: "Sudah dikirim, menunggu verifikasi admin.",
    },
    {
      label: "Disetujui",
      variant: "success",
      description: "Diverifikasi dan disetujui admin — sudah terhitung di rapor.",
    },
    {
      label: "Diedit Admin",
      variant: "info",
      description: "Admin telah melakukan koreksi data pada laporanmu.",
    },
    {
      label: "Ditolak",
      variant: "error",
      description: "Ditolak admin. Edit dan kirim ulang dari halaman Input Harian.",
    },
  ],
  tips: [
    {
      type: "tip",
      text: "Gunakan filter tanggal untuk melihat laporan periode tertentu — misalnya seluruh bulan lalu.",
    },
    {
      type: "info",
      text: "Laporan berstatus 'Disetujui' atau 'Diedit Admin' sudah masuk ke perhitungan omzet dan rapor bulananmu.",
    },
  ],
};
