import type { HelpContent } from "@/components/shared/help-drawer";

export const ABSENSI_HELP: HelpContent = {
  menuName: "Jadwal & Absensi Tim",
  description:
    "Satu tempat untuk melihat jadwal shift, memantau rekap kehadiran, memproses izin & tukar shift, serta menyusun roster bulanan. Navigasi bulan berlaku bersama untuk tab Kalender, Rekap, dan Atur Jadwal.",

  steps: [
    {
      title: "Lihat kalender jadwal (tab Kalender)",
      description:
        "Menampilkan siapa yang bertugas setiap hari beserta shift-nya. Di HP tampil sebagai kartu per-hari; di desktop sebagai grid bulanan. Ganti bulan lewat panah kiri/kanan di header.",
    },
    {
      title: "Pantau rekap kehadiran (tab Rekap)",
      description:
        "Rangkuman kehadiran tiap crew dari gabungan roster + absensi + izin disetujui. Di HP tampil kartu ringkasan per crew (total Hadir/Telat/Izin/Alpha/Libur); di desktop matriks harian penuh.",
    },
    {
      title: "Proses pengajuan izin (tab Izin)",
      description:
        "Semua permohonan izin berstatus pending muncul di sini. Baca alasan & lampiran, lalu Setujui atau Tolak. Penolakan wajib disertai catatan.",
    },
    {
      title: "Proses permintaan tukar shift (tab Tukar Shift)",
      description:
        "Menampilkan permintaan tukar yang sudah/menunggu konfirmasi crew. Admin dapat menyetujui atau menolak — penolakan wajib disertai catatan.",
    },
    {
      title: "Susun roster bulanan (tab Atur Jadwal)",
      description:
        "Tab ini muncul bila Apotrik mengizinkan admin mengatur jadwal. Isi shift tiap crew secara manual. Di HP: ketuk satu hari untuk membuka daftar crew, lalu pilih shift/OFF/kosong per orang. Sel bertanda IZIN = crew punya izin disetujui hari itu.",
    },
  ],

  statuses: [
    {
      label: "H — Hadir",
      variant: "success",
      description: "Crew terjadwal kerja dan sudah melakukan clock-in tepat waktu.",
    },
    {
      label: "T — Terlambat",
      variant: "warning",
      description: "Crew hadir (clock-in) tetapi melewati jam mulai shift.",
    },
    {
      label: "I — Izin",
      variant: "info",
      description: "Crew punya izin yang sudah disetujui pada hari tersebut.",
    },
    {
      label: "A — Alpha",
      variant: "error",
      description:
        "Mangkir: hari LAMPAU yang terjadwal kerja, tanpa clock-in dan tanpa izin. Hari ini & mendatang belum dihitung alpha.",
    },
    {
      label: "L — Libur",
      variant: "neutral",
      description: "Crew dijadwalkan OFF (libur) pada hari tersebut.",
    },
    {
      label: "Menunggu target",
      variant: "neutral",
      description:
        "Tukar shift masih menunggu konfirmasi crew target. Admin tetap dapat menolak di tahap ini.",
    },
    {
      label: "Siap diputuskan",
      variant: "info",
      description: "Kedua crew sudah setuju. Admin dapat menyetujui atau menolak tukar shift.",
    },
  ],

  tips: [
    {
      type: "info",
      text: "Navigasi bulan di header berlaku untuk tab Kalender, Rekap, dan Atur Jadwal. Di tab Izin & Tukar Shift ia disembunyikan karena antrian tak bergantung bulan.",
    },
    {
      type: "tip",
      text: "Gunakan tab Rekap untuk cepat melihat siapa yang alpha atau sering terlambat sebelum sesi coaching — di HP totalnya langsung terlihat sebagai chip per crew.",
    },
    {
      type: "warning",
      text: "Persetujuan tukar shift langsung mengubah jadwal kedua crew secara atomik di database. Pastikan sudah yakin sebelum menekan Setujui.",
    },
    {
      type: "info",
      text: "Roster diisi manual per hari (fitur pola mingguan otomatis sudah tidak digunakan). Sel yang dikosongkan berarti crew tidak dijadwalkan hari itu.",
    },
  ],
};
