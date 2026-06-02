import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { HelpDrawer } from "@/components/shared/help-drawer";
import { AddonGate } from "@/components/shared/addon-gate";
import { AbsensiClient } from "./absensi-client";
import { ABSENSI_HELP } from "./help-content";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
import { CalendarDays } from "lucide-react";

// ─── Types exported for client ───────────────────────────────────────────────

export type ScheduleEntry = {
  userId: string;
  userName: string;
  shiftName: string | null;
  startTime: string | null;
  isOff: boolean;
};

export type PendingLeave = {
  id: string;
  user_id: string;
  userName: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  attachment_url: string | null;
  status: string;
  created_at: string | null;
};

export type PendingSwap = {
  id: string;
  requester_user_id: string;
  target_user_id: string;
  requesterName: string;
  targetName: string;
  reason: string | null;
  status: string;
  created_at: string | null;
  requesterDate: string | null;
  requesterShift: string | null;
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function AdminAbsensiPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "admin_apotek") redirect("/admin/dashboard");

  const params = await searchParams;
  const reminderWindow = getOperationalReminderWindow();
  const todayDateKey = reminderWindow.dateKey; // WIB YYYY-MM-DD
  const [todayYear, todayMonth] = todayDateKey.split("-").map(Number);

  const monthRaw = Number(params.month ?? NaN);
  const yearRaw = Number(params.year ?? NaN);
  const month =
    Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12
      ? monthRaw
      : todayMonth!;
  const year =
    Number.isInteger(yearRaw) && yearRaw >= 2000 ? yearRaw : todayYear!;

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const monthStart = `${year}-${pad2(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${pad2(month)}-${pad2(lastDay)}`;

  const supabase = await createClient();
  const supabaseAdmin = createAdminClient();

  // ── All queries in parallel (addon guard bundled in) ────────────────────
  const [addonResult, schedulesResult, membershipsResult, pendingLeavesResult, pendingSwapsResult] =
    await Promise.all([
      supabase
        .from("addon_settings")
        .select("is_enabled")
        .eq("tenant_apotek_id", active.tenantId)
        .eq("addon_key", "absensi_shift")
        .maybeSingle(),
      // Admin client needed — shift_schedules has RLS that restricts to own rows
      supabaseAdmin
        .from("shift_schedules")
        .select(
          "id, user_id, schedule_date, is_off, master_shifts(shift_name, start_time)",
        )
        .eq("tenant_apotek_id", active.tenantId)
        .gte("schedule_date", monthStart)
        .lte("schedule_date", monthEnd)
        .order("schedule_date"),

      supabase
        .from("tenant_memberships")
        .select("user_id, app_users!inner(id, full_name)")
        .eq("tenant_apotek_id", active.tenantId)
        .in("role", ["crew", "admin_apotek"])
        .eq("is_active", true)
        .eq("app_users.is_active", true),

      supabase
        .from("leave_requests")
        .select(
          "id, user_id, leave_type, start_date, end_date, reason, attachment_url, status, created_at",
        )
        .eq("tenant_apotek_id", active.tenantId)
        .eq("status", "pending")
        .order("created_at"),

      supabase
        .from("shift_swap_requests")
        .select(
          `id, requester_user_id, target_user_id, reason, status, created_at,
           requester_schedule:shift_schedules!requester_schedule_id(schedule_date, master_shifts(shift_name))`,
        )
        .eq("tenant_apotek_id", active.tenantId)
        .in("status", ["pending_crew", "pending_admin"])
        .order("created_at"),
    ]);

  const addonEnabled = addonResult.data?.is_enabled ?? false;

  // ── Build name map ───────────────────────────────────────────────────────
  const nameById = new Map<string, string>();
  for (const m of membershipsResult.data ?? []) {
    const user = Array.isArray(m.app_users) ? m.app_users[0] : m.app_users;
    const u = user as { id: string; full_name: string } | null;
    if (u) nameById.set(m.user_id, u.full_name);
  }

  // ── Build schedulesByDate ────────────────────────────────────────────────
  const schedulesByDate: Record<string, ScheduleEntry[]> = {};
  for (const row of schedulesResult.data ?? []) {
    const dateKey = String(row.schedule_date).slice(0, 10);
    if (!schedulesByDate[dateKey]) schedulesByDate[dateKey] = [];
    const ms = Array.isArray(row.master_shifts)
      ? row.master_shifts[0]
      : row.master_shifts;
    const shift = ms as { shift_name: string; start_time: string } | null;
    schedulesByDate[dateKey].push({
      userId: row.user_id,
      userName: nameById.get(row.user_id) ?? "—",
      shiftName: shift?.shift_name ?? null,
      startTime: shift?.start_time ?? null,
      isOff: Boolean(row.is_off),
    });
  }

  // Sort entries per day: working first, then off; alphabetical within group
  for (const entries of Object.values(schedulesByDate)) {
    entries.sort((a, b) => {
      if (a.isOff !== b.isOff) return a.isOff ? 1 : -1;
      return a.userName.localeCompare(b.userName, "id");
    });
  }

  // ── Pending leaves ───────────────────────────────────────────────────────
  const pendingLeaves: PendingLeave[] = (pendingLeavesResult.data ?? []).map(
    (l) => ({
      ...l,
      userName: nameById.get(l.user_id) ?? "—",
    }),
  );

  // ── Pending swaps ────────────────────────────────────────────────────────
  const pendingSwaps: PendingSwap[] = (pendingSwapsResult.data ?? []).map(
    (s) => {
      const reqSched = Array.isArray(s.requester_schedule)
        ? s.requester_schedule[0]
        : s.requester_schedule;
      const reqMs = reqSched
        ? Array.isArray((reqSched as { master_shifts: unknown }).master_shifts)
          ? (
              (reqSched as { master_shifts: unknown[] }).master_shifts
            )[0]
          : (reqSched as { master_shifts: unknown }).master_shifts
        : null;
      return {
        id: s.id,
        requester_user_id: s.requester_user_id,
        target_user_id: s.target_user_id,
        requesterName: nameById.get(s.requester_user_id) ?? "—",
        targetName: nameById.get(s.target_user_id) ?? "—",
        reason: s.reason ?? null,
        status: s.status,
        created_at: s.created_at ?? null,
        requesterDate: reqSched
          ? String((reqSched as { schedule_date: unknown }).schedule_date).slice(
              0,
              10,
            )
          : null,
        requesterShift:
          (reqMs as { shift_name?: string } | null)?.shift_name ?? null,
      };
    },
  );

  return (
    <section className="space-y-4">
      {/* ── Hero card ── */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sky-600 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
            <CalendarDays size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Jadwal & Absensi Tim</h1>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {active.tenantName} · {todayDateKey}
            </p>
          </div>
        </div>
      </div>

      <AddonGate
        enabled={addonEnabled}
        addonName="Jadwal & Absensi"
        addonKey="absensi_shift"
        description="Fitur kalender jadwal shift, approval izin, dan persetujuan tukar shift antar kru."
      >
        <AbsensiClient
          schedulesByDate={schedulesByDate}
          pendingLeaves={pendingLeaves}
          pendingSwaps={pendingSwaps}
          month={month}
          year={year}
          today={todayDateKey}
        />
      </AddonGate>

      <HelpDrawer content={ABSENSI_HELP} />
    </section>
  );
}
