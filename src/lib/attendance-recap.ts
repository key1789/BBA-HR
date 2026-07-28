import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveAttendanceStatus,
  type AttendanceStatus,
} from "@/lib/attendance-status";

export type RecapCrewRow = {
  userId: string;
  name: string;
  days: { date: string; status: AttendanceStatus }[];
  totals: Record<AttendanceStatus, number>;
};

export type AttendanceRecap = {
  month: number;
  year: number;
  dates: string[]; // YYYY-MM-DD sepanjang bulan
  rows: RecapCrewRow[];
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Timestamptz → tanggal WIB (UTC+7) "YYYY-MM-DD". */
function toWibDateKey(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return `${wib.getUTCFullYear()}-${pad2(wib.getUTCMonth() + 1)}-${pad2(wib.getUTCDate())}`;
}

function emptyTotals(): Record<AttendanceStatus, number> {
  return { none: 0, off: 0, hadir: 0, terlambat: 0, izin: 0, alpha: 0, belum: 0 };
}

/**
 * Kunci `${user_id}|${YYYY-MM-DD}` untuk tiap hari izin DISETUJUI dalam sebulan.
 * Ringan — dipakai overlay izin di grid roster (RosterSection). Format key pakai
 * pipe `|` menyesuaikan RosterSection.
 */
export async function fetchApprovedLeaveKeys(
  supabaseAdmin: SupabaseClient,
  opts: { tenantId: string; month: number; year: number },
): Promise<string[]> {
  const { tenantId, month, year } = opts;
  const monthStart = `${year}-${pad2(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${pad2(month)}-${pad2(lastDay)}`;
  const { data } = await supabaseAdmin
    .from("leave_requests")
    .select("user_id, start_date, end_date")
    .eq("tenant_apotek_id", tenantId)
    .eq("status", "approved")
    .lte("start_date", monthEnd)
    .gte("end_date", monthStart);
  const keys: string[] = [];
  for (const lv of data ?? []) {
    const start = String(lv.start_date).slice(0, 10);
    const end = String(lv.end_date).slice(0, 10);
    for (let d = 1; d <= lastDay; d++) {
      const dk = `${year}-${pad2(month)}-${pad2(d)}`;
      if (dk >= start && dk <= end) keys.push(`${lv.user_id}|${dk}`);
    }
  }
  return keys;
}

/**
 * Bangun rekap kehadiran per (crew, hari) untuk satu bulan, menggabungkan
 * roster + clock-in + izin disetujui via resolver. Butuh service-role client
 * (shift_schedules/attendance_logs punya RLS per-baris).
 */
export async function fetchAttendanceRecap(
  supabaseAdmin: SupabaseClient,
  opts: { tenantId: string; month: number; year: number; todayKey: string },
): Promise<AttendanceRecap> {
  const { tenantId, month, year, todayKey } = opts;
  const monthStart = `${year}-${pad2(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${pad2(month)}-${pad2(lastDay)}`;
  const dates: string[] = [];
  for (let d = 1; d <= lastDay; d++) dates.push(`${year}-${pad2(month)}-${pad2(d)}`);

  const [crewRes, schedRes, attRes, leaveRes] = await Promise.all([
    supabaseAdmin
      .from("tenant_memberships")
      .select("user_id, app_users!inner(id, full_name, is_active)")
      .eq("tenant_apotek_id", tenantId)
      .in("role", ["crew", "admin_apotek"])
      .eq("is_active", true),
    supabaseAdmin
      .from("shift_schedules")
      .select("user_id, schedule_date, is_off")
      .eq("tenant_apotek_id", tenantId)
      .gte("schedule_date", monthStart)
      .lte("schedule_date", monthEnd),
    supabaseAdmin
      .from("attendance_logs")
      .select("user_id, clock_in_time, is_late")
      .eq("tenant_apotek_id", tenantId)
      .gte("clock_in_time", `${monthStart}T00:00:00Z`)
      .lte("clock_in_time", `${monthEnd}T23:59:59Z`),
    supabaseAdmin
      .from("leave_requests")
      .select("user_id, start_date, end_date, status")
      .eq("tenant_apotek_id", tenantId)
      .eq("status", "approved")
      .lte("start_date", monthEnd)
      .gte("end_date", monthStart),
  ]);

  // Crew list (unik, aktif)
  const crewMap = new Map<string, string>();
  for (const m of crewRes.data ?? []) {
    const u = Array.isArray(m.app_users) ? m.app_users[0] : m.app_users;
    if (!u?.is_active) continue;
    if (m.user_id) crewMap.set(String(m.user_id), String(u.full_name ?? "—"));
  }

  // roster: key `uid_date` → is_off
  const schedMap = new Map<string, boolean>();
  for (const s of schedRes.data ?? []) {
    schedMap.set(`${s.user_id}_${String(s.schedule_date).slice(0, 10)}`, Boolean(s.is_off));
  }

  // attendance: key `uid_date` → is_late
  const attMap = new Map<string, boolean>();
  for (const a of attRes.data ?? []) {
    const dk = toWibDateKey(String(a.clock_in_time));
    if (dk) attMap.set(`${a.user_id}_${dk}`, Boolean(a.is_late));
  }

  // approved leave: expand ke set tanggal
  const leaveSet = new Set<string>();
  for (const lv of leaveRes.data ?? []) {
    const start = String(lv.start_date).slice(0, 10);
    const end = String(lv.end_date).slice(0, 10);
    for (const dk of dates) {
      if (dk >= start && dk <= end) leaveSet.add(`${lv.user_id}_${dk}`);
    }
  }

  const rows: RecapCrewRow[] = Array.from(crewMap.entries())
    .map(([userId, name]) => {
      const totals = emptyTotals();
      const days = dates.map((date) => {
        const key = `${userId}_${date}`;
        const status = resolveAttendanceStatus({
          isScheduled: schedMap.has(key),
          isOff: schedMap.get(key) === true,
          hasClockIn: attMap.has(key),
          isLate: attMap.get(key) === true,
          hasApprovedLeave: leaveSet.has(key),
          isPast: date < todayKey,
        });
        totals[status] += 1;
        return { date, status };
      });
      return { userId, name, days, totals };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "id", { sensitivity: "base" }));

  return { month, year, dates, rows };
}
