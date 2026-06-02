import type { HelpContent } from "@/components/shared/help-drawer";

export const INPUT_HARIAN_HELP: HelpContent = {
  menuName: "Input Harian",
  description:
    "Formulir untuk mencatat laporan operasional harian: omzet, transaksi, produk terjual, dan pelanggan yang tidak terlayani.",
  steps: [
    {
      title: "Pilih tanggal dan shift",
      description:
        "Pilih tanggal laporan (maksimal hari ini) dan shift kerja yang sesuai. Jika mengisi hari sebelumnya, kamu wajib mengisi alasan keterlambatan.",
    },
    {
      title: "Isi metrik laporan",
      description:
        "Masukkan total omzet (Rupiah), jumlah transaksi/nota, total produk terjual, dan jumlah pelanggan yang tidak terlayani. Pelanggan Tertolak adalah pelanggan yang tidak bisa dilayani karena stok habis, resep tidak lengkap, dll. Isi 0 jika tidak ada.",
    },
    {
      title: "Isi produk fokus (jika aktif)",
      description:
        "Jika fitur Produk Fokus diaktifkan admin, masukkan jumlah penjualan untuk setiap produk yang sudah ditargetkan bulan ini. Produk yang tidak terjual tidak perlu diisi — kosongkan saja.",
    },
    {
      title: "Simpan Draft atau Submit",
      description:
        "Pilih 'Simpan Draft' untuk menyimpan sementara tanpa mengirim ke admin. Pilih 'Submit Laporan' jika data sudah lengkap — laporan dikirim ke admin untuk diverifikasi. Setelah disetujui, laporan tidak bisa diubah dari portal crew.",
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
      description: "Diverifikasi dan disetujui admin. Tidak bisa diubah lagi.",
    },
    {
      label: "Diedit Admin",
      variant: "info",
      description: "Admin telah melakukan koreksi data pada laporanmu.",
    },
    {
      label: "Ditolak",
      variant: "error",
      description: "Ditolak admin. Kamu bisa mengedit dan mengirim ulang.",
    },
  ],
  tips: [
    {
      type: "warning",
      text: "Deadline input harian adalah pukul 19:00 WIB. Laporan setelah waktu ini tercatat terlambat.",
    },
    {
      type: "info",
      text: "Laporan yang sudah disetujui admin tidak dapat diubah dari portal crew. Hubungi admin jika ada kesalahan data.",
    },
    {
      type: "tip",
      text: "Gunakan Simpan Draft jika data belum lengkap. Kamu bisa kembali dan melengkapinya sebelum deadline.",
    },
    {
      type: "tip",
      text: "Produk fokus yang kosong tidak perlu diisi — hanya isi produk yang benar-benar terjual hari ini.",
    },
  ],
};
