/**
 * SATU sumber penentu status kehadiran per (crew, hari), menggabungkan
 * roster (shift_schedules), clock-in (attendance_logs), dan izin disetujui
 * (leave_requests). Dipakai rekap admin/owner, kalender/roster, dan petunjuk
 * payroll — agar status konsisten di semua tempat.
 *
 * Prioritas: tak dijadwalkan → OFF → clock-in (hadir/terlambat) → izin →
 * alpha (bila lampau) / belum (bila hari ini/mendatang).
 * Catatan: clock-in mengalahkan izin (crew nyatanya datang = hadir).
 */
export type AttendanceStatus =
  | "none" // tak dijadwalkan pada hari itu
  | "off" // roster libur
  | "hadir" // clock-in tepat waktu
  | "terlambat" // clock-in terlambat
  | "izin" // izin disetujui, tanpa clock-in
  | "alpha" // terjadwal kerja, LAMPAU, tanpa clock-in & tanpa izin (mangkir)
  | "belum"; // terjadwal kerja, hari ini/mendatang, belum absen (bukan alpha)

export type AttendanceResolveInput = {
  /** Ada baris roster (shift_schedules) untuk crew+hari ini. */
  isScheduled: boolean;
  /** Roster menandai hari libur (is_off). */
  isOff: boolean;
  /** Ada clock-in (attendance_logs) pada hari itu. */
  hasClockIn: boolean;
  /** Clock-in terlambat (is_late). */
  isLate: boolean;
  /** Ada leave_requests status 'approved' yang mencakup hari itu. */
  hasApprovedLeave: boolean;
  /** Tanggal < hari ini (WIB). Hari ini/mendatang = false. */
  isPast: boolean;
};

export function resolveAttendanceStatus(i: AttendanceResolveInput): AttendanceStatus {
  if (!i.isScheduled) return "none";
  if (i.isOff) return "off";
  if (i.hasClockIn) return i.isLate ? "terlambat" : "hadir";
  if (i.hasApprovedLeave) return "izin";
  return i.isPast ? "alpha" : "belum";
}

/** Status yang dihitung sebagai "hari kerja terjadwal" (untuk denominator disiplin). */
export const SCHEDULED_WORK_STATUSES: AttendanceStatus[] = ["hadir", "terlambat", "izin", "alpha", "belum"];

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  none: "—",
  off: "Libur",
  hadir: "Hadir",
  terlambat: "Terlambat",
  izin: "Izin",
  alpha: "Alpha",
  belum: "Belum",
};
