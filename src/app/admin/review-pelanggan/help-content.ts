import type { HelpContent } from "@/components/shared/help-drawer";

export const REVIEW_PELANGGAN_HELP: HelpContent = {
  menuName: "Review Pelanggan",
  description:
    "Menu ini untuk mencatat ulasan atau feedback pelanggan terhadap karyawan secara langsung. Data review ini masuk ke raport bulanan crew sebagai komponen penilaian non-operasional.",

  steps: [
    {
      title: "Pilih karyawan yang mendapat review",
      description:
        "Pilih nama karyawan dari dropdown. Hanya crew aktif yang terdaftar di apotek ini yang muncul di daftar.",
    },
    {
      title: "Isi nama pelanggan (opsional)",
      description:
        "Masukkan nama pelanggan jika diketahui. Biarkan kosong jika pelanggan tidak mau menyebutkan nama atau review bersifat anonim.",
    },
    {
      title: "Beri rating 1–5 (opsional)",
      description:
        "Pilih rating jika pelanggan memberikan penilaian bintang. Kosongkan jika pelanggan hanya memberikan komentar tanpa rating.",
    },
    {
      title: "Atur waktu ulasan",
      description:
        "Default terisi waktu sekarang. Ubah jika perlu mencatat review yang diterima sebelumnya (misal review via WhatsApp kemarin).",
    },
    {
      title: "Tulis ulasan / catatan",
      description:
        "Wajib diisi. Tulis apa yang disampaikan pelanggan — bisa positif, negatif, atau saran. Semakin detail semakin baik untuk bahan evaluasi.",
    },
    {
      title: "Pantau riwayat per karyawan",
      description:
        "Gunakan filter di bagian Riwayat untuk melihat semua review milik satu karyawan tertentu beserta rata-rata rating-nya.",
    },
  ],

  statuses: [
    {
      label: "★★★★★ 5",
      variant: "success",
      description: "Sangat Baik — pelanggan sangat puas dengan pelayanan.",
    },
    {
      label: "★★★★ 4",
      variant: "success",
      description: "Baik — pelanggan puas, ada ruang kecil untuk perbaikan.",
    },
    {
      label: "★★★ 3",
      variant: "warning",
      description: "Cukup — pelayanan rata-rata, perlu perhatian lebih.",
    },
    {
      label: "★★ 2",
      variant: "error",
      description: "Kurang — pelanggan kurang puas, perlu coaching segera.",
    },
    {
      label: "★ 1",
      variant: "error",
      description: "Buruk — pelanggan sangat tidak puas, perlu tindak lanjut serius.",
    },
  ],

  tips: [
    {
      type: "tip",
      text: "Catat review sesegera mungkin setelah kejadian agar detail tidak terlupakan. Review yang dicatat real-time lebih akurat.",
    },
    {
      type: "info",
      text: "Review pelanggan menjadi salah satu komponen penilaian di raport bulanan crew. Semakin banyak data, semakin representatif penilaiannya.",
    },
    {
      type: "warning",
      text: "Review yang sudah disimpan tidak dapat diedit atau dihapus dari portal admin. Pastikan data sudah benar sebelum menekan 'Simpan'.",
    },
    {
      type: "tip",
      text: "Gunakan filter per karyawan di bagian Riwayat untuk melihat rata-rata rating satu orang — berguna saat sesi coaching atau evaluasi bulanan.",
    },
  ],
};
