import { getSessionContext } from "@/lib/auth-context";
import { recordReminderDispatch } from "@/lib/reminder-dispatch-log";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AnimatedPage } from "@/components/shared/animated-page";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Award,
  History,
  Bell,
  ChevronRight,
  TrendingUp,
  CircleDot,
} from "lucide-react";

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const NUM = new Intl.NumberFormat("id-ID");

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Menunggu verifikasi",
  approved: "Disetujui",
  edited_by_admin: "Diedit admin",
  reject: "Ditolak",
};

export default async function CrewDashboardPage() {
  const session = await getSessionContext();
  const active = session?.activeMembership;

  if (!active || (active.role !== "crew" && active.role !== "admin_apotek")) {
    return (
      <AnimatedPage className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center text-slate-400 mb-6">
          <CircleDot size={40} />
        </div>
        <p className="text-slate-500 font-bold">Halaman ini hanya untuk crew atau admin apotek.</p>
      </AnimatedPage>
    );
  }

  const supabase = await createClient();
  const supabaseAdmin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();

  const reminderWindow = getOperationalReminderWindow();
  const today = reminderWindow.dateKey;
  const [todayY, todayM, todayD] = today.split("-").map(Number);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const monthStart = `${todayY}-${pad2(todayM!)}-01`;
  const monthEnd   = `${todayY}-${pad2(todayM!)}-${new Date(todayY!, todayM!, 0).getDate()}`;

  const [
    todaySubmissions,
    personalPending,
    personalApproved,
    monthDaysData,
    bonusResult,
    unreadAnnouncementsResult,
  ] = await Promise.all([
    supabase
      .from("daily_submissions")
      .select("omzet_total, status")
      .eq("tenant_apotek_id", active.tenantId)
      .eq("user_id", user?.id ?? "")
      .eq("submission_date", today),

    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("user_id", user?.id ?? "")
      .in("status", ["draft", "submitted", "edited_by_admin"]),

    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("user_id", user?.id ?? "")
      .eq("status", "approved")
      .gte("submission_date", monthStart)
      .lte("submission_date", monthEnd),

    supabase
      .from("daily_submissions")
      .select("submission_date")
      .eq("tenant_apotek_id", active.tenantId)
      .eq("user_id", user?.id ?? "")
      .gte("submission_date", monthStart)
      .lte("submission_date", today)
      .neq("status", "draft"),

    supabase
      .from("monthly_appraisals")
      .select("is_published, auto_bonus_accountability, addon_manual_total, bba_adjustment")
      .eq("tenant_apotek_id", active.tenantId)
      .eq("crew_user_id", user?.id ?? "")
      .eq("period_month", todayM!)
      .eq("period_year", todayY!)
      .maybeSingle(),

    supabaseAdmin
      .from("announcement_receipts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", session.userId)
      .eq("role", active.role === "admin_apotek" ? "admin_apotek" : "crew")
      .or(`tenant_apotek_id.eq.${active.tenantId},tenant_apotek_id.is.null`)
      .is("viewed_at", null),
  ]);

  // ── Derived values ──
  const todayRows = todaySubmissions.data ?? [];
  const hasTodaySubmission = todayRows.length > 0;
  const todayCount = todayRows.length;
  const todayOmzet = todayRows.reduce((s, r) => s + Number(r.omzet_total ?? 0), 0);
  const todayStatus = todayRows[0]?.status ?? null;

  const pendingCount  = personalPending.count  ?? 0;
  const approvedCount = personalApproved.count ?? 0;

  const submittedDates = new Set((monthDaysData.data ?? []).map(r => r.submission_date as string));
  const submittedDays = submittedDates.size;
  const elapsedDays   = todayD ?? 1;
  const progressPct   = Math.min(100, Math.round((submittedDays / elapsedDays) * 100));

  const bonus = bonusResult.data;
  const bonusEstimate = bonus
    ? Number(bonus.auto_bonus_accountability ?? 0)
      + Number(bonus.addon_manual_total ?? 0)
      + Number(bonus.bba_adjustment ?? 0)
    : null;
  const bonusPublished = Boolean(bonus?.is_published);
  const unreadCount = unreadAnnouncementsResult.count ?? 0;

  // ── Greeting ──
  const wibHour = reminderWindow.hour;
  const timeGreeting =
    wibHour < 11 ? "pagi" : wibHour < 15 ? "siang" : wibHour < 18 ? "sore" : "malam";
  const firstName = ((session.userFullName || session.userEmail || "Crew").split(" ")[0] ?? "Crew");
  const dayLabel = new Intl.DateTimeFormat("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date());

  // ── Reminder dispatch (analytics) ──
  const reminderWrites: Promise<unknown>[] = [];
  if (!hasTodaySubmission) {
    reminderWrites.push(recordReminderDispatch(supabase, {
      tenantApotekId: active.tenantId,
      actorUserId: user?.id ?? null,
      reminderDate: reminderWindow.dateKey,
      phase: reminderWindow.phase,
      scope: "crew_dashboard",
      reasonCode: "missing_submission",
      payload: { pendingCount },
    }));
  }
  if (pendingCount > 0) {
    reminderWrites.push(recordReminderDispatch(supabase, {
      tenantApotekId: active.tenantId,
      actorUserId: user?.id ?? null,
      reminderDate: reminderWindow.dateKey,
      phase: reminderWindow.phase,
      scope: "crew_dashboard",
      reasonCode: "pending_submission",
      payload: { pendingCount },
    }));
  }
  if (reminderWrites.length > 0) await Promise.allSettled(reminderWrites);

  return (
    <AnimatedPage className="space-y-4 pb-10">

      {/* ── Greeting ── */}
      <div className="bg-white rounded-3xl px-5 py-5 shadow-sm border border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-slate-400 capitalize">{dayLabel}</p>
            <h1 className="text-2xl font-black text-slate-900 mt-1 leading-tight">
              Selamat {timeGreeting},{" "}
              <span className="text-sky-600">{firstName}</span>!
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
              <span>{active.tenantName}</span>
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              <span>Cut-off {reminderWindow.cutoffHour}.00 {reminderWindow.timezoneLabel}</span>
            </div>
          </div>
          <Link
            href="/crew/pengumuman"
            className="relative shrink-0 w-10 h-10 rounded-2xl bg-slate-100 hover:bg-sky-50 flex items-center justify-center transition-colors group"
          >
            <Bell size={18} className="text-slate-500 group-hover:text-sky-600 transition-colors" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-1 leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* ── Status hari ini ── */}
      {hasTodaySubmission ? (
        <div className="bg-emerald-50 border border-emerald-100 rounded-3xl px-5 py-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
            <CheckCircle2 size={20} className="text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-emerald-900 leading-tight">
              {todayCount > 1 ? `${todayCount} laporan` : "Laporan"} hari ini sudah masuk
            </p>
            <p className="text-[11px] font-bold text-emerald-600 mt-0.5">
              {IDR.format(todayOmzet)}
              {todayStatus && ` · ${STATUS_LABEL[todayStatus] ?? todayStatus}`}
            </p>
          </div>
          <Link
            href="/crew/riwayat-input"
            className="shrink-0 text-[10px] font-black text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-xl uppercase tracking-wide transition-colors"
          >
            Lihat
          </Link>
        </div>
      ) : (
        <Link href="/crew/input-harian">
          <div className={cn(
            "border rounded-3xl px-5 py-4 flex items-center gap-4 transition-all",
            reminderWindow.phase === "post_cutoff"
              ? "bg-slate-50 border-slate-200"
              : "bg-amber-50 border-amber-200 hover:border-amber-300",
          )}>
            <div className={cn(
              "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0",
              reminderWindow.phase === "post_cutoff" ? "bg-slate-100" : "bg-amber-100",
            )}>
              <AlertCircle size={20} className={
                reminderWindow.phase === "post_cutoff" ? "text-slate-400" : "text-amber-600"
              } />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-sm font-black leading-tight",
                reminderWindow.phase === "post_cutoff" ? "text-slate-600" : "text-amber-900",
              )}>
                {reminderWindow.phase === "post_cutoff"
                  ? "Sudah melewati cut-off hari ini"
                  : "Belum ada input hari ini"}
              </p>
              <p className={cn(
                "text-[11px] font-bold mt-0.5",
                reminderWindow.phase === "post_cutoff" ? "text-slate-400" : "text-amber-600",
              )}>
                {reminderWindow.phase === "post_cutoff"
                  ? "Input kemarin masih bisa dikumpulkan"
                  : `Batas ${reminderWindow.cutoffHour}.00 WIB · Tap untuk input`}
              </p>
            </div>
            <ChevronRight size={16} className={
              reminderWindow.phase === "post_cutoff" ? "text-slate-300" : "text-amber-400"
            } />
          </div>
        </Link>
      )}

      {/* ── 3 stat chips ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center">
          <p className="text-2xl font-black text-slate-900">{NUM.format(todayCount)}</p>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mt-1 leading-tight">
            Input<br/>Hari Ini
          </p>
        </div>
        <div className={cn(
          "rounded-2xl p-4 border shadow-sm text-center",
          pendingCount > 0 ? "bg-amber-50 border-amber-100" : "bg-white border-slate-100",
        )}>
          <p className={cn("text-2xl font-black", pendingCount > 0 ? "text-amber-600" : "text-slate-900")}>
            {NUM.format(pendingCount)}
          </p>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mt-1 leading-tight">
            Menunggu<br/>Verifikasi
          </p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center">
          <p className="text-2xl font-black text-emerald-600">{NUM.format(approvedCount)}</p>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mt-1 leading-tight">
            Approved<br/>Bulan Ini
          </p>
        </div>
      </div>

      {/* ── Progress bulan ── */}
      <div className="bg-white rounded-3xl px-5 py-4 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-sky-600 shrink-0" />
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Konsistensi bulan ini
            </p>
          </div>
          <p className="text-xs font-black text-slate-700">
            {submittedDays}
            <span className="font-bold text-slate-400">/{elapsedDays} hari</span>
          </p>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              progressPct >= 80 ? "bg-emerald-500"
              : progressPct >= 50 ? "bg-sky-500"
              : "bg-amber-500",
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-[9px] font-bold text-slate-400 mt-2">
          {progressPct >= 80
            ? "Konsistensi sangat baik, pertahankan!"
            : progressPct >= 50
            ? "Sudah lebih dari separuh — terus semangat."
            : "Masih ada ruang untuk meningkatkan konsistensi."}
        </p>
      </div>

      {/* ── Estimasi bonus ── */}
      <Link href="/crew/rapor" className="block">
        <div className="bg-slate-950 rounded-3xl px-5 py-5 flex items-center gap-4 hover:bg-slate-900 transition-colors">
          <div className="w-11 h-11 bg-white/10 rounded-2xl flex items-center justify-center shrink-0">
            <Award size={20} className="text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
              Estimasi bonus bulan ini
            </p>
            {bonusEstimate !== null ? (
              <>
                <p className="text-2xl font-black text-white mt-0.5 leading-none">
                  {IDR.format(bonusEstimate)}
                </p>
                <p className="text-[9px] font-bold text-slate-500 mt-1">
                  {bonusPublished
                    ? "✓ Sudah final · Lihat rapor lengkap"
                    : "Estimasi sementara · Lihat rapor"}
                </p>
              </>
            ) : (
              <>
                <p className="text-base font-black text-slate-500 mt-0.5">Belum tersedia</p>
                <p className="text-[9px] font-bold text-slate-600 mt-0.5">
                  Rapor bulan ini belum dikalkulasi
                </p>
              </>
            )}
          </div>
          <ChevronRight size={16} className="text-slate-600 shrink-0" />
        </div>
      </Link>

      {/* ── Quick links ── */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/crew/riwayat-input"
          className="bg-white border border-slate-100 rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm hover:border-sky-200 hover:shadow-md transition-all group"
        >
          <History size={16} className="text-sky-500 shrink-0 group-hover:scale-110 transition-transform" />
          <span className="text-xs font-black text-slate-700 truncate">Riwayat Input</span>
          <ChevronRight size={13} className="ml-auto text-slate-300 shrink-0" />
        </Link>
        <Link
          href="/crew/rapor"
          className="bg-white border border-slate-100 rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm hover:border-amber-200 hover:shadow-md transition-all group"
        >
          <Award size={16} className="text-amber-500 shrink-0 group-hover:scale-110 transition-transform" />
          <span className="text-xs font-black text-slate-700 truncate">Rapor Saya</span>
          <ChevronRight size={13} className="ml-auto text-slate-300 shrink-0" />
        </Link>
      </div>

      {/* ── Pending reminder banner (only when pending > 0) ── */}
      {pendingCount > 0 && (
        <Link href="/crew/riwayat-input" className="block">
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 hover:border-amber-300 transition-colors">
            <Clock size={14} className="text-amber-600 shrink-0" />
            <p className="text-[11px] font-bold text-amber-800 flex-1">
              {NUM.format(pendingCount)} laporan masih menunggu verifikasi admin
            </p>
            <ChevronRight size={13} className="text-amber-400 shrink-0" />
          </div>
        </Link>
      )}

    </AnimatedPage>
  );
}
