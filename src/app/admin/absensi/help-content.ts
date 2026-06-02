import type { HelpContent } from "@/components/shared/help-drawer";

export const ABSENSI_HELP: HelpContent = {
  menuName: "Absensi Tim",
  description:
    "Menu ini menampilkan kalender jadwal shift seluruh kru, sekaligus menjadi tempat admin memproses pengajuan izin dan permintaan tukar shift yang masuk dari crew.",

  steps: [
    {
      title: "Cek kalender jadwal bulanan",
      description:
        "Tab Kalender menampilkan siapa yang bertugas setiap harinya. Navigasi bulan menggunakan tombol panah kiri/kanan. Klik hari ini (kotak biru) untuk langsung melihat jadwal hari ini.",
    },
    {
      title: "Proses pengajuan izin",
      description:
        "Buka tab Izin untuk melihat semua permohonan izin yang masih berstatus pending. Baca alasan dan lampiran, lalu pilih Setujui atau Tolak. Penolakan wajib disertai catatan.",
    },
    {
      title: "Proses permintaan tukar shift",
      description:
        "Tab Tukar Shift menampilkan permintaan yang sudah melewati konfirmasi awal crew maupun yang masih menunggu. Admin dapat menyetujui atau menolak — penolakan wajib disertai catatan.",
    },
    {
      title: "Beri catatan saat menolak",
      description:
        "Saat memilih Tolak, form catatan akan muncul di bawah card. Isi dengan alasan yang jelas agar crew tahu perbaikan apa yang diperlukan sebelum mengajukan ulang.",
    },
  ],

  statuses: [
    {
      label: "Menunggu target",
      variant: "neutral",
      description:
        "Tukar shift masih menunggu konfirmasi dari crew yang menjadi target tukar. Admin tetap dapat menolak di tahap ini.",
    },
    {
      label: "Siap diputuskan",
      variant: "info",
      description:
        "Kedua crew sudah setuju. Admin dapat menyetujui atau menolak permintaan tukar shift ini.",
    },
    {
      label: "Pending izin",
      variant: "warning",
      description:
        "Pengajuan izin belum diproses. Segera ditindaklanjuti agar crew mendapat kepastian sebelum tanggal izin tiba.",
    },
  ],

  tips: [
    {
      type: "info",
      text: "Kalender hanya menampilkan hari yang memiliki data jadwal. Hari tanpa jadwal terdaftar tidak akan muncul di tampilan mobile.",
    },
    {
      type: "tip",
      text: "Proses pengajuan izin sebelum tanggal izin mulai agar jadwal harian tetap akurat dan crew tidak menunggu terlalu lama.",
    },
    {
      type: "warning",
      text: "Persetujuan tukar shift langsung mengubah jadwal kedua crew secara atomik di database. Pastikan sudah yakin sebelum menekan Setujui.",
    },
    {
      type: "tip",
      text: "Gunakan navigasi bulan untuk melihat jadwal bulan mendatang — berguna saat merencanakan cuti atau mengantisipasi kekosongan shift.",
    },
  ],
};
