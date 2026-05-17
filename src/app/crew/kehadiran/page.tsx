/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { KehadiranClient } from "@/app/crew/kehadiran/kehadiran-client";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";

export default async function CrewKehadiranPage() {
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

  // Use WIB date to avoid UTC boundary issues
  const reminderWindow = getOperationalReminderWindow();
  const [wibYear, wibMonth] = reminderWindow.dateKey.split("-").map(Number);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(wibYear!, wibMonth!, 0).getDate();
  const startOfMonthDate = `${wibYear}-${pad2(wibMonth!)}-01`;
  const endOfMonthDate   = `${wibYear}-${pad2(wibMonth!)}-${pad2(lastDay)}`;
  const startOfMonthTs = new Date(`${startOfMonthDate}T00:00:00+07:00`).toISOString();
  const endOfMonthTs   = new Date(`${endOfMonthDate}T23:59:59+07:00`).toISOString();

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
  
  // Metrics
  const hariKerjaBerjalan = attendances.length;
  const totalTerlambat = attendances.filter(a => a.is_late).length;

  // 2. Fetch Leave Requests (for metrics and history)
  const { data: leaveData } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("tenant_apotek_id", active.tenantId)
    .eq("user_id", user.id)
    .gte("created_at", startOfMonthTs)
    .lte("created_at", endOfMonthTs)
    .order("created_at", { ascending: false });

  const leaves = leaveData || [];
  const totalIzinApproved = leaves.filter(l => l.status === "approved").length;

  // 3. Fetch Shift Swap Requests (for history)
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

  const swaps = swapsData || [];

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

  // 5. Fetch Active Schedules (for calendar and shift swap selection)
  const { data: schedulesData } = await supabaseAdmin
    .from("shift_schedules")
    .select(`
      id, schedule_date, is_off,
      master_shifts (shift_name, start_time, end_time)
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
      shift_name: shift?.shift_name ?? null,
      shift_start_time: shift?.start_time ?? null,
      shift_end_time: shift?.end_time ?? null,
    };
  });

  // 6. Fetch team schedules in current month for shift swap candidate filtering.
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
    <section className="space-y-6">
      <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 relative z-20 mb-2">
         <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Kehadiran & <span className="text-sky-600">Jadwal</span></h1>
         <p className="text-slate-500 text-sm mt-1 font-medium">Kelola absensi harian, pengajuan izin, dan tukar shift.</p>
      </div>

      <KehadiranClient 
        metrics={{
          hariKerja: hariKerjaBerjalan,
          terlambat: totalTerlambat,
          izin: totalIzinApproved
        }}
        attendances={attendances}
        leaves={leaves}
        swaps={swaps}
        crewList={crewList}
        schedules={schedules}
        swapCandidateUserIdsByDate={swapCandidateUserIdsByDate}
        tenantId={active.tenantId}
        userId={user.id}
      />
    </section>
  );
}
