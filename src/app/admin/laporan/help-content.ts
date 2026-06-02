import type { HelpContent } from "@/components/shared/help-drawer";

export const LAPORAN_HELP: HelpContent = {
  menuName: "Laporan Kinerja",
  description:
    "Menu Laporan menampilkan ringkasan kinerja penjualan apotek dalam rentang tanggal yang bisa disesuaikan. Data berasal dari submission yang sudah disetujui (approved) oleh admin.",

  steps: [
    {
      title: "Atur rentang tanggal",
      description:
        "Ketuk area 'Filter Range' di bagian atas untuk membuka panel filter. Gunakan tombol cepat '7 Hari Terakhir' atau 'Bulan Ini', atau isi tanggal manual lalu ketuk 'Terapkan'.",
    },
    {
      title: "Baca ringkasan KPI",
      description:
        "Kotak metrik di bawah filter menampilkan total omzet, jumlah nota, rata-rata ATV, ATU, dan total pelanggan tertolak dalam rentang aktif.",
    },
    {
      title: "Analisis breakdown per karyawan",
      description:
        "Tabel (desktop) atau kartu (mobile) 'Breakdown per Karyawan' menampilkan kinerja individual — omzet, nota, produk, ATV, ATU, serta perkiraan omzet tertolak. Diurutkan dari omzet tertinggi.",
    },
    {
      title: "Periksa penolakan per hari",
      description:
        "Bagian 'Penolakan Pelanggan per Hari' hanya muncul jika ada hari dengan pelanggan tertolak. Gunakan ini untuk mendeteksi hari-hari dengan penolakan tinggi.",
    },
    {
      title: "Gunakan untuk evaluasi rutin",
      description:
        "Bandingkan kinerja antar karyawan, identifikasi yang ATV-nya rendah, dan cek apakah ada lonjakan penolakan di hari tertentu untuk ditindaklanjuti di coaching.",
    },
  ],

  statuses: [
    {
      label: "Omzet",
      variant: "success",
      description:
        "Total pendapatan dari semua submission approved dalam rentang aktif.",
    },
    {
      label: "ATV",
      variant: "info",
      description:
        "Average Transaction Value — rata-rata nilai per nota. Dihitung: Omzet ÷ Jumlah Nota.",
    },
    {
      label: "ATU",
      variant: "info",
      description:
        "Average Transaction Units — rata-rata produk per nota. Dihitung: Jumlah Produk ÷ Jumlah Nota.",
    },
    {
      label: "Plg. Tertolak",
      variant: "error",
      description:
        "Jumlah pelanggan yang tidak dilayani (ditolak) dan dicatat oleh karyawan pada hari itu.",
    },
    {
      label: "Est. Omzet Hilang",
      variant: "warning",
      description:
        "Perkiraan omzet yang hilang akibat penolakan. Dihitung: Pelanggan Tertolak × ATV hari itu. Ini adalah estimasi, bukan angka pasti.",
    },
  ],

  tips: [
    {
      type: "tip",
      text: "Range default adalah bulan berjalan. Gunakan '7 Hari Terakhir' untuk melihat kinerja minggu ini dengan cepat.",
    },
    {
      type: "info",
      text: "Hanya submission dengan status Approved atau Diedit Admin yang masuk ke laporan ini. Submission pending atau rejected tidak dihitung.",
    },
    {
      type: "warning",
      text: "ATV yang jauh di bawah rata-rata bisa menjadi sinyal karyawan tersebut perlu coaching — kemungkinan tidak melakukan upselling.",
    },
    {
      type: "warning",
      text: "Perkiraan Omzet Tertolak adalah estimasi kasar. Angka sebenarnya bisa lebih tinggi jika pelanggan yang ditolak termasuk pelanggan besar.",
    },
  ],
};
