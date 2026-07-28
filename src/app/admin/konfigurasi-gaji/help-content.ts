import type { HelpContent } from "@/components/shared/help-drawer";

export const SETUP_GAJI_HELP: HelpContent = {
  menuName: "Setup Gaji",
  description:
    "Menu ini untuk menyusun struktur gaji tiap karyawan: gaji pokok, tunjangan, komponen harian (makan & transport), penambahan/pengurangan kustom, serta BPJS. Nilai di sini menjadi dasar perhitungan payroll bulanan. Perubahan tersimpan otomatis.",

  steps: [
    {
      title: "Buka kartu karyawan",
      description:
        "Ketuk kartu crew untuk membuka editornya. Indikator di atas menunjukkan berapa karyawan yang sudah dikonfigurasi.",
    },
    {
      title: "Isi gaji pokok & tunjangan tetap",
      description:
        "Gaji Pokok dan Tunjangan Jabatan bersifat tetap setiap bulan, tidak tergantung kehadiran.",
    },
    {
      title: "Atur komponen harian (makan & transport)",
      description:
        "Uang Makan/Hari dan Transport/Hari adalah rate PER HARI kehadiran. Nilai finalnya dihitung otomatis saat rekap payroll: rate × jumlah hari masuk aktual.",
    },
    {
      title: "Tambah komponen kustom bila perlu",
      description:
        "Gunakan Penambahan Kustom untuk insentif/uang bensin khusus, dan Pengurangan Kustom untuk kasbon/denda. Tiap komponen bisa disetel bulanan atau harian.",
    },
    {
      title: "Atur BPJS",
      description:
        "Potongan BPJS karyawan (Kesehatan/JHT/JP) mengurangi THP. Tanggungan BPJS oleh perusahaan tercatat tapi TIDAK mengurangi THP karyawan.",
    },
    {
      title: "Salin dari karyawan lain (opsional)",
      description:
        'Bila struktur gaji seragam, gunakan tombol "Salin dari Karyawan Lain" untuk menyalin konfigurasi lalu sesuaikan seperlunya.',
    },
  ],

  statuses: [
    {
      label: "Tersimpan",
      variant: "success",
      description: "Konfigurasi karyawan ini sudah tersimpan. Perubahan disimpan otomatis.",
    },
    {
      label: "Belum dikonfigurasi",
      variant: "neutral",
      description: "Gaji pokok masih 0 — karyawan ini belum punya struktur gaji.",
    },
    {
      label: "THP (perkiraan)",
      variant: "info",
      description:
        "Take-home pay perkiraan: pendapatan − potongan + bonus. Komponen harian belum dikali hari masuk hingga rekap payroll.",
    },
  ],

  tips: [
    {
      type: "info",
      text: "Uang makan & transport baru final saat rekap payroll — nilainya = rate × hari masuk aktual, bukan angka bulanan tetap.",
    },
    {
      type: "warning",
      text: "Tanggungan BPJS perusahaan tidak mengurangi THP karyawan. Yang mengurangi THP hanya potongan BPJS bagian karyawan.",
    },
    {
      type: "tip",
      text: "Perubahan tersimpan otomatis (badge “Tersimpan”) — tak perlu tombol simpan terpisah.",
    },
    {
      type: "info",
      text: "Konfigurasi gaji hanya bisa diubah admin bila Apotrik mengaktifkan izinnya. Perhitungan payroll final tetap mengikuti data kehadiran periode berjalan.",
    },
  ],
};
