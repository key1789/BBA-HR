/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { KehadiranClient } from "@/app/crew/kehadiran/kehadiran-client";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
import { AnimatedPage } from "@/components/shared/animated-page";
import { HelpDrawer } from "@/components/shared/help-drawer";
import { KEHADIRAN_HELP } from "./help-content";
import { CalendarDays } from "lucide-react";

export default async function CrewKehadiranPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await getSessionContext();
  const active = session?.activeMembership;

  if (!active || (active.role !== "crew" && active.role !== "admin_apotek")) {
    return redirect("/login");
  }

  const supabase = await createClient();
  const supabaseAdmin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  // Addon: absensi_shift — controls clock-in photo, shift swap, and log tab
  const { data: addonAbsensiData } = await supabase
    .from("addon_settings")
    .select("is_enabled")
    .eq("tenant_apotek_id", active.tenantId)
    .eq("addon_key", "absensi_shift")
    .maybeSingle();
  const addonAbsensi = addonAbsensiData?.is_enabled ?? false;

  // ── Date resolution ─────────────────────────────────────────────────────────
  // todayDateKey: real WIB today, always (used for banner + today highlight)
  // calYear/calMonth: the month being viewed (from searchParams, or today)
  const reminderWindow = getOperationalReminderWindow();
  const todayDateKey = reminderWindow.dateKey; // YYYY-MM-DD WIB
  const [todayYear, todayMonth] = todayDateKey.split("-").map(Number);

  const pad2 = (n: number) => String(n).padStart(2, "0");

  // Parse ?month=YYYY-MM — validate range: -1 to +2 months from today
  const params = await searchParams;
  let calYear  = todayYear!;
  let calMonth = todayMonth!;

  const monthParam = params.month ?? "";
  if (/^\d{4}-\d{2}$/.test(monthParam)) {
    const [py, pm] = monthParam.split("-").map(Number);
    if (py && pm && pm >= 1 && pm <= 12) {
      const diff = (py - todayYear!) * 12 + (pm - todayMonth!);
      if (diff >= -1 && diff <= 2) {
        calYear  = py;
        calMonth = pm;
      }
    }
  }

  const calMonthKey     = `${calYear}-${pad2(calMonth)}`; // YYYY-MM
  const lastDay         = new Date(calYear, calMonth, 0).getDate();
  const startOfMonthDate = `${calYear}-${pad2(calMonth)}-01`;
  const endOfMonthDate   = `${calYear}-${pad2(calMonth)}-${pad2(lastDay)}`;
  const startOfMonthTs  = new Date(`${startOfMonthDate}T00:00:00+07:00`).toISOString();
  const endOfMonthTs    = new Date(`${endOfMonthDate}T23:59:59+07:00`).toISOString();

  // 1. Fetch Attendance Logs (for metrics and history tab)
  const { data: attendanceData } = await supabase
    .from("attendance_logs")
    .select(`
      id, clock_in_time, clock_out_time, photo_url, is_late, notes, created_at,
      shift_schedules (
        id, schedule_date,
        master_shifts (shift_name, start_time, end_time)
      )
    `)
    .eq("tenant_apotek_id", active.tenantId)
    .eq("user_id", user.id)
    .gte("clock_in_time", startOfMonthTs)
    .lte("clock_in_time", endOfMonthTs)
    .order("clock_in_time", { ascending: false });

  const attendances = attendanceData || [];

  // Metrics — reflect the viewed month
  const hariKerjaBerjalan = attendances.length;
  const totalTerlambat    = attendances.filter(a => a.is_late).length;

  // 2. Fetch Leave Requests — overlap filter so multi-month leaves appear on calendar
  const { data: leaveData } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("tenant_apotek_id", active.tenantId)
    .eq("user_id", user.id)
    .lte("start_date", endOfMonthDate)
    .gte("end_date", startOfMonthDate)
    .order("start_date", { ascending: false });

  const leaves = leaveData || [];
  const totalIzinApproved = leaves.filter(l => l.status === "approved").length;

  // 3. Fetch Shift Swap Requests — filtered client-side by schedule_date
  const { data: swapsData } = await supabase
    .from("shift_swap_requests")
    .select(`
      *,
      target_user:app_users!target_user_id(full_name),
      requester_schedule:shift_schedules!requester_schedule_id(schedule_date, master_shifts(shift_name))
    `)
    .eq("tenant_apotek_id", active.tenantId)
    .eq("requester_user_id", user.id)
    .order("created_at", { ascending: false });

  const swaps = (swapsData || []).filter((swap: any) => {
    const d = String(swap.requester_schedule?.schedule_date ?? "").slice(0, 10);
    return d >= startOfMonthDate && d <= endOfMonthDate;
  });

  // 4. Fetch Users (for shift swap target selection)
  const { data: membersData } = await supabaseAdmin
    .from("tenant_memberships")
    .select("user_id, role")
    .eq("tenant_apotek_id", active.tenantId)
    .eq("is_active", true)
    .in("role", ["crew", "admin_apotek"])
    .neq("user_id", user.id);

  const memberUserIds = Array.from(
    new Set((membersData || []).map((u: any) => u.user_id).filter(Boolean)),
  );
  const { data: userRows } =
    memberUserIds.length > 0
      ? await supabaseAdmin
          .from("app_users")
          .select("id, full_name")
          .in("id", memberUserIds)
      : { data: [] as any[] };
  const nameByUserId = new Map((userRows || []).map((u: any) => [u.id, u.full_name]));
  const crewList = memberUserIds.map((id) => ({
    id,
    name: nameByUserId.get(id) || "Unknown Crew",
  }));

  // 5. Fetch Schedules for the viewed month
  const { data: schedulesData } = await supabaseAdmin
    .from("shift_schedules")
    .select(`
      id, schedule_date, is_off,
      master_shifts (id, shift_name, start_time, end_time)
    `)
    .eq("tenant_apotek_id", active.tenantId)
    .eq("user_id", user.id)
    .gte("schedule_date", startOfMonthDate)
    .lte("schedule_date", endOfMonthDate)
    .order("schedule_date", { ascending: true });

  const schedules = (schedulesData || []).map((row: any) => {
    const shiftRaw = row.master_shifts;
    const shift = Array.isArray(shiftRaw) ? (shiftRaw[0] ?? null) : shiftRaw;
    return {
      ...row,
      shift_id: shift?.id ?? null,
      shift_name: shift?.shift_name ?? null,
      shift_start_time: shift?.start_time ?? null,
      shift_end_time: shift?.end_time ?? null,
    };
  });

  // 6. Fetch team schedules for shift swap candidate filtering
  const { data: teamSchedulesData } = await supabaseAdmin
    .from("shift_schedules")
    .select("user_id, schedule_date")
    .eq("tenant_apotek_id", active.tenantId)
    .in("user_id", crewList.map((c) => c.id))
    .gte("schedule_date", startOfMonthDate)
    .lte("schedule_date", endOfMonthDate);

  const swapCandidateUserIdsByDate: Record<string, string[]> = {};
  for (const row of teamSchedulesData ?? []) {
    const d = String(row.schedule_date).slice(0, 10);
    if (!swapCandidateUserIdsByDate[d]) swapCandidateUserIdsByDate[d] = [];
    swapCandidateUserIdsByDate[d].push(row.user_id);
  }

  return (
    <AnimatedPage className="space-y-4 pb-10">
      {/* Page header */}
      <div className="bg-white rounded-3xl p-5 shadow-md border border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sky-600 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
            <CalendarDays size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">
              Kehadiran & <span className="text-sky-600">Jadwal</span>
            </h1>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {active.tenantCode} · {todayDateKey}
            </p>
          </div>
        </div>
      </div>

      <HelpDrawer content={KEHADIRAN_HELP} />

      <KehadiranClient
        metrics={{
          hariKerja: hariKerjaBerjalan,
          terlambat: totalTerlambat,
          izin: totalIzinApproved,
        }}
        attendances={attendances}
        leaves={leaves}
        swaps={swaps}
        crewList={crewList}
        schedules={schedules}
        swapCandidateUserIdsByDate={swapCandidateUserIdsByDate}
        addonAbsensi={addonAbsensi}
        todayDateKey={todayDateKey}
        calMonthKey={calMonthKey}
      />
    </AnimatedPage>
  );
}
