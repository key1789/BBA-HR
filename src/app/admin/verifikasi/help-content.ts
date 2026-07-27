import type { HelpContent } from "@/components/shared/help-drawer";

export const VERIFIKASI_HELP: HelpContent = {
  menuName: "Verifikasi Data",
  description:
    "Menu ini adalah gate QA cabang — tempat admin mereview dan memutuskan nasib setiap submission harian crew. Setiap data yang crew kirimkan akan masuk antrean di sini sebelum dikunci dan diteruskan ke jalur audit bulanan Apotrik. Keputusan admin di halaman ini (Setujui / Tolak / Edit) bersifat final dari sisi cabang.",

  steps: [
    {
      title: "Atur filter untuk mempersempit antrean",
      description:
        'Gunakan filter Status dan Rentang Tanggal lalu klik "Terapkan Filter". Filter "Semua" menampilkan seluruh riwayat, diurutkan otomatis berdasarkan prioritas aksi — submission yang paling butuh perhatian muncul paling atas.',
    },
    {
      title: "Periksa detail tiap submission",
      description:
        'Klik "Lihat detail" pada baris yang ingin diperiksa untuk melihat data lengkap (omzet, transaksi, produk, pelanggan ditolak, alasan terlambat), daftar produk fokus, dan seluruh riwayat verifikasi sebelumnya.',
    },
    {
      title: "Setujui submission yang datanya benar",
      description:
        'Klik tombol "Setujui" pada baris yang bersangkutan. Submission langsung berpindah ke status Disetujui dan masuk jalur audit Apotrik. Tindakan ini tidak bisa dibatalkan.',
    },
    {
      title: "Tolak submission yang bermasalah",
      description:
        'Klik "Tolak" jika data tidak sesuai, lalu isi alasan penolakan (wajib). Crew akan melihat alasan tersebut di riwayat input dan bisa mengirim ulang data yang sudah diperbaiki. Penolakan tidak memberi hukuman poin.',
    },
    {
      title: "Edit langsung jika ada kesalahan minor",
      description:
        'Klik "Edit langsung" untuk membuka form edit. Ubah nilai yang salah — termasuk kuantitas produk fokus bila perlu — lalu klik "Simpan & Setujui". Data baru langsung tersimpan dan submission otomatis berstatus Disetujui, tidak perlu tolak lalu minta crew submit ulang.',
    },
    {
      title: "Proses banyak submission sekaligus",
      description:
        'Centang baris yang ingin diproses (tidak ada yang tercentang otomatis), isi alasan bila "Tolak massal", lalu klik "Setujui massal" atau "Tolak massal".',
    },
  ],

  statuses: [
    {
      label: "Menunggu Verifikasi",
      variant: "warning",
      description:
        "Crew sudah mengirimkan data, menunggu keputusan admin. Ini adalah prioritas tertinggi — harap segera diproses agar tidak melewati SLA.",
    },
    {
      label: "Diedit Admin",
      variant: "info",
      description:
        "Admin pernah mengedit data submission ini secara langsung dan langsung menyetujuinya. Status akhir tercatat sebagai Disetujui.",
    },
    {
      label: "Ditolak",
      variant: "error",
      description:
        "Submission ditolak oleh admin. Crew perlu memperbaiki dan mengirim ulang data.",
    },
    {
      label: "Disetujui",
      variant: "success",
      description:
        "Submission sudah final dari sisi cabang dan masuk jalur audit bulanan Apotrik. Tidak bisa diubah lagi.",
    },
    {
      label: "Draft",
      variant: "neutral",
      description:
        "Crew sudah membuka form input tapi belum mengirimkan data. Belum masuk antrean verifikasi.",
    },
    {
      label: "SLA Aman (H0)",
      variant: "success",
      description:
        "Submission dikirimkan hari ini dan belum melewati tenggat waktu cut-off operasional.",
    },
    {
      label: "SLA Waspada (H+1)",
      variant: "warning",
      description:
        "Submission sudah melewati satu hari tanpa keputusan. Segera proses agar tidak masuk backlog.",
    },
    {
      label: "SLA Terlewati",
      variant: "error",
      description:
        "Submission sudah tertunda lebih dari satu hari. Data yang terlalu lama diverifikasi dapat mempengaruhi keakuratan laporan bulanan Apotrik.",
    },
  ],

  tips: [
    {
      type: "tip",
      text: 'Filter "Semua (prioritas aksi)" adalah tampilan paling efisien untuk kerja harian — submission yang butuh tindakan segera otomatis naik ke atas, tanpa perlu pilih filter manual.',
    },
    {
      type: "tip",
      text: 'Gunakan "Edit langsung" saat crew salah input angka minor. Ini lebih cepat dibanding tolak-tunggu-re-submit yang membutuhkan bolak-balik komunikasi.',
    },
    {
      type: "warning",
      text: "Edit langsung dan Setujui/Tolak bersifat final dan tidak bisa dibatalkan. Pastikan data sudah benar sebelum menyimpan.",
    },
    {
      type: "info",
      text: "Setelah submission Disetujui, data akan tersedia untuk diaudit oleh tim Apotrik di portal mereka. Proses penilaian dan publish rapor bulanan adalah kewenangan Apotrik, bukan admin cabang.",
    },
  ],
};
