import type { HelpContent } from "@/components/shared/help-drawer";

export const REVIEW_REKAN_HELP: HelpContent = {
  menuName: "Review Rekan Kerja",
  description:
    "Berikan penilaian dan apresiasi untuk rekan kerja satu tim setiap bulannya. Penilaianmu berkontribusi ke rapor performa rekanmu.",
  steps: [
    {
      title: "Pilih Rekan untuk Dinilai",
      description:
        "Daftar rekan satu tim tampil di bawah. Klik 'Beri Nilai' pada rekan yang ingin dinilai. Rekan yang sudah dinilai bulan ini ditandai dengan ikon centang hijau.",
    },
    {
      title: "Beri Rating Bintang",
      description:
        "Pilih rating 1–5 bintang berdasarkan kerjasama dan kontribusi rekan tersebut bulan ini. Rating wajib diisi sebelum bisa submit.",
    },
    {
      title: "Isi Komentar (Opsional)",
      description:
        "Tuliskan apresiasi atau masukan yang membangun. Komentar bersifat opsional namun sangat membantu pertumbuhan tim.",
    },
    {
      title: "Perhatikan Kuota Bulanan",
      description:
        "Ada batasan jumlah review yang bisa diberikan setiap bulan. Kuota sisa ditampilkan di bagian atas. Setelah kuota habis, review baru tidak bisa dikirim hingga bulan depan.",
    },
  ],
  statuses: [],
  tips: [
    {
      type: "info",
      text: "Penilaian peer review kamu masuk ke skor rapor bulanan rekanmu dan bisa berpengaruh ke bonus mereka.",
    },
    {
      type: "tip",
      text: "Berikan penilaian yang jujur dan adil. Fokus pada kerjasama tim, inisiatif, dan kontribusi nyata bulan ini.",
    },
    {
      type: "warning",
      text: "Review yang sudah dikirim tidak bisa diubah. Pastikan rating dan komentar sudah sesuai sebelum submit.",
    },
  ],
};
