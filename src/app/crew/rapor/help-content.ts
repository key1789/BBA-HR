import type { HelpContent } from "@/components/shared/help-drawer";

export const RAPOR_HELP: HelpContent = {
  menuName: "Rapor Bulanan",
  description:
    "Pantau capaian target omzet, estimasi bonus berjalan, performa operasional, absensi, dan slip gaji bulan ini.",
  steps: [
    {
      title: "Pilih Periode",
      description:
        "Gunakan dropdown di bagian atas untuk beralih ke bulan lain. Tersedia 6 bulan ke belakang dan 6 bulan ke depan dari bulan berjalan.",
    },
    {
      title: "Tab Penilaian",
      description:
        "Menampilkan progress omzet vs target individu, metrik KPI & operasional (nota, produk, ATV, ATU, SARP), jadwal & absensi (hadir, telat, izin), evaluasi & penilaian dari admin, serta ringkasan bonus variabel — termasuk estimasi berjalan jika admin belum menjalankan kalkulasi.",
    },
    {
      title: "Tab Rapor & Payroll",
      description:
        "Menampilkan total bonus (estimasi berjalan atau final), breakdown detail per skema KPI (tim bulanan, tim harian, individu bulanan, individu harian), slip gaji lengkap (gaji pokok, tunjangan, potongan, bonus), target produk fokus, dan histori performa 1 tahun.",
    },
    {
      title: "Estimasi Berjalan",
      description:
        "Bonus dihitung langsung dari data input harian yang sudah disetujui, menggunakan konfigurasi KPI yang sama seperti yang dilihat owner. Estimasi otomatis tampil selama admin belum menjalankan kalkulasi resmi — angka bisa berubah.",
    },
    {
      title: "Slip Gaji",
      description:
        "Slip gaji hanya muncul setelah admin memproses payroll. Menampilkan rincian gaji pokok, tunjangan jabatan/makan/transport, potongan BPJS, bonus KPI & produk fokus, dan total Take Home Pay.",
    },
  ],
  statuses: [
    {
      label: "Final",
      variant: "success",
      description:
        "Rapor sudah dipublikasikan admin — angka bonus dan performa sudah final dan tidak akan berubah.",
    },
    {
      label: "Estimasi Berjalan",
      variant: "warning",
      description:
        "Bonus dihitung otomatis dari data input kamu saat ini. Angka akan diperbarui setiap ada input baru yang disetujui, dan akan digantikan oleh angka final setelah admin menjalankan kalkulasi resmi.",
    },
    {
      label: "Belum Ada Data",
      variant: "error",
      description:
        "Tidak ada input harian yang disetujui untuk periode ini, atau konfigurasi KPI belum diatur oleh admin.",
    },
  ],
  tips: [
    {
      type: "tip",
      text: "Estimasi bonus menggunakan perhitungan yang sama persis dengan yang dilihat owner — bukan sekadar perkiraan kasar.",
    },
    {
      type: "info",
      text: "Jadwal & Absensi bersumber dari data clock-in harian dan pengajuan izin yang sudah disetujui admin.",
    },
    {
      type: "info",
      text: "Slip gaji baru muncul setelah admin memproses payroll. Sebelum itu, kamu bisa melihat estimasi bonus di Ringkasan Bonus Variabel.",
    },
    {
      type: "warning",
      text: "Angka estimasi bisa berubah jika ada input baru yang disetujui, atau jika admin mengubah konfigurasi KPI bulan ini.",
    },
  ],
};
