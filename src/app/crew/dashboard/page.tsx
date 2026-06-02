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
  ChevronRight,
  CircleDot,
} from "lucide-react";
import { CrewDashboardClient } from "./crew-dashboard-client";
import { BellButton } from "./bell-button";
import type { KpiConfigV2 } from "@/lib/types/kpi-v2";

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

  if (!active || active.role !== "crew") {
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
  const userId = user?.id ?? "";

  const reminderWindow = getOperationalReminderWindow();
  const today = reminderWindow.dateKey;
  const [todayY, todayM, todayD] = today.split("-").map(Number);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const monthStart = `${todayY}-${pad2(todayM!)}-01`;
  const monthEnd   = `${todayY}-${pad2(todayM!)}-${new Date(todayY!, todayM!, 0).getDate()}`;
  const daysInMonth = new Date(todayY!, todayM!, 0).getDate();

  const [
    todaySubmissions,
    personalPending,
    personalApproved,
    bonusResult,
    unreadAnnouncementsResult,
    personalMonthlyResult,
    leaderboardResult,
    kpiConfigResult,
    crewCountResult,
  ] = await Promise.all([
    supabase
      .from("daily_submissions")
      .select("omzet_total, transaction_total, product_total, rejected_customer_total, status")
      .eq("tenant_apotek_id", active.tenantId)
      .eq("user_id", userId)
      .eq("submission_date", today),

    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("user_id", userId)
      .in("status", ["draft", "submitted", "edited_by_admin"]),

    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("user_id", userId)
      .eq("status", "approved")
      .gte("submission_date", monthStart)
      .lte("submission_date", monthEnd),

    supabase
      .from("monthly_appraisals")
      .select("is_published, auto_bonus_accountability, addon_manual_total, bba_adjustment")
      .eq("tenant_apotek_id", active.tenantId)
      .eq("crew_user_id", userId)
      .eq("period_month", todayM!)
      .eq("period_year", todayY!)
      .maybeSingle(),

    supabaseAdmin
      .from("announcement_receipts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", session.userId)
      .eq("role", "crew")
      .or(`tenant_apotek_id.eq.${active.tenantId},tenant_apotek_id.is.null`)
      .is("viewed_at", null),

    // Personal omzet + metrics bulan ini (approved)
    supabase
      .from("daily_submissions")
      .select("omzet_total, transaction_total, product_total, rejected_customer_total, submission_date")
      .eq("tenant_apotek_id", active.tenantId)
      .eq("user_id", userId)
      .in("status", ["approved", "edited_by_admin"])
      .gte("submission_date", monthStart)
      .lte("submission_date", monthEnd),

    // Live team leaderboard from daily_submissions (approved/edited_by_admin)
    supabase
      .from("daily_submissions")
      .select("user_id, omzet_total, transaction_total, product_total, user:user_id(full_name)")
      .eq("tenant_apotek_id", active.tenantId)
      .in("status", ["approved", "edited_by_admin"])
      .gte("submission_date", monthStart)
      .lte("submission_date", monthEnd),

    // KPI config bulan ini untuk target
    supabase
      .from("kpi_configs")
      .select("target_omzet, bonus_config_v2")
      .eq("tenant_apotek_id", active.tenantId)
      .eq("period_month", todayM!)
      .eq("period_year", todayY!)
      .maybeSingle(),

    // Active crew count (for rata target distribution)
    supabaseAdmin
      .from("tenant_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("is_active", true)
      .eq("role", "crew"),
  ]);

  // ── Today's stats ──
  const todayRows = todaySubmissions.data ?? [];
  const hasTodaySubmission = todayRows.length > 0;
  const todayCount    = todayRows.length;
  const todayOmzet    = todayRows.reduce((s, r) => s + Number(r.omzet_total ?? 0), 0);
  const todayTrx      = todayRows.reduce((s, r) => s + Number(r.transaction_total ?? 0), 0);
  const todayProd     = todayRows.reduce((s, r) => s + Number(r.product_total ?? 0), 0);
  const todayRejected = todayRows.reduce((s, r) => s + Number(r.rejected_customer_total ?? 0), 0);
  const todayStatus   = todayRows[0]?.status ?? null;

  const pendingCount  = personalPending.count  ?? 0;
  const approvedCount = personalApproved.count ?? 0;

  // ── Bonus ──
  const bonus = bonusResult.data;
  const bonusEstimate = bonus
    ? Number(bonus.auto_bonus_accountability ?? 0)
      + Number(bonus.addon_manual_total ?? 0)
      + Number(bonus.bba_adjustment ?? 0)
    : null;
  const bonusPublished = Boolean(bonus?.is_published);
  const unreadCount = unreadAnnouncementsResult.count ?? 0;

  // ── Running personal bulan ini ──
  const personalMonthly = personalMonthlyResult.data ?? [];
  const runOmzet    = personalMonthly.reduce((s, r) => s + Number(r.omzet_total ?? 0), 0);
  const runTrx      = personalMonthly.reduce((s, r) => s + Number(r.transaction_total ?? 0), 0);
  const runProd     = personalMonthly.reduce((s, r) => s + Number(r.product_total ?? 0), 0);
  const runRejected = personalMonthly.reduce((s, r) => s + Number(r.rejected_customer_total ?? 0), 0);

  // ── Chart bars (personal daily omzet for current month up to today) ──
  const submissionByDate = new Map<string, number>();
  for (const row of personalMonthly) {
    const d = row.submission_date as string;
    submissionByDate.set(d, (submissionByDate.get(d) ?? 0) + Number(row.omzet_total ?? 0));
  }
  const chartBars = Array.from({ length: todayD }, (_, i) => {
    const d = i + 1;
    const dateStr = `${todayY}-${pad2(todayM!)}-${pad2(d)}`;
    return { day: d, omzet: submissionByDate.get(dateStr) ?? 0, isToday: dateStr === today };
  });

  // ── Target computation ──
  const bonusConfig = (kpiConfigResult.data?.bonus_config_v2 as KpiConfigV2 | null) ?? null;
  const teamTarget  = Number(kpiConfigResult.data?.target_omzet ?? 0);
  const activeCrew  = crewCountResult.count ?? 1;
  // Effective working days: from KPI config if set, otherwise fall back to calendar days
  const effectiveWorkDays = bonusConfig?.global?.default_working_days || daysInMonth;

  let monthlyTarget: number | null = null;
  const isIndvMonthly = bonusConfig?.active_schemes?.includes("individual_monthly") ?? false;
  if (isIndvMonthly) {
    const scheme = bonusConfig!.individual_monthly;
    if (scheme.target_distribution === "manual") {
      const uc = scheme.user_configs?.[userId];
      monthlyTarget = uc?.target_omzet ? Number(uc.target_omzet) : null;
    } else {
      // rata: split team target evenly (null when target not configured)
      monthlyTarget = activeCrew > 0 && teamTarget > 0 ? teamTarget / activeCrew : null;
    }
  } else if (teamTarget > 0) {
    // No individual scheme — show fair-share per crew member
    monthlyTarget = activeCrew > 0 ? teamTarget / activeCrew : teamTarget;
  }

  let dailyTarget: number | null = null;
  const isIndvDaily = bonusConfig?.active_schemes?.includes("individual_daily") ?? false;
  if (isIndvDaily) {
    const scheme = bonusConfig!.individual_daily;
    if (scheme.target_distribution === "manual") {
      const uc = scheme.user_configs?.[userId];
      dailyTarget = uc?.target_omzet_daily ? Number(uc.target_omzet_daily) : null;
    } else {
      dailyTarget = activeCrew > 0 && effectiveWorkDays > 0
        ? teamTarget / activeCrew / effectiveWorkDays
        : null;
    }
  } else if (monthlyTarget !== null && effectiveWorkDays > 0) {
    dailyTarget = monthlyTarget / effectiveWorkDays;
  }

  // ── Leaderboard (live aggregation from daily_submissions) ──
  const lbMap = new Map<string, { fullName: string; omzet: number; trx: number; prod: number }>();
  for (const row of (leaderboardResult.data ?? [])) {
    const uid = row.user_id as string;
    const fullName = ((row.user as unknown) as { full_name: string } | null)?.full_name ?? "—";
    const existing = lbMap.get(uid);
    if (existing) {
      existing.omzet += Number(row.omzet_total ?? 0);
      existing.trx   += Number(row.transaction_total ?? 0);
      existing.prod  += Number(row.product_total ?? 0);
    } else {
      lbMap.set(uid, {
        fullName,
        omzet: Number(row.omzet_total ?? 0),
        trx:   Number(row.transaction_total ?? 0),
        prod:  Number(row.product_total ?? 0),
      });
    }
  }
  // Team totals for SARP (relative metric: individual vs team average)
  let teamTotalOmzet = 0, teamTotalTrx = 0, teamTotalProd = 0;
  for (const v of lbMap.values()) {
    teamTotalOmzet += v.omzet;
    teamTotalTrx   += v.trx;
    teamTotalProd  += v.prod;
  }
  const teamAvgAtv = teamTotalTrx > 0 ? teamTotalOmzet / teamTotalTrx : 0;
  const teamAvgAtu = teamTotalTrx > 0 ? teamTotalProd  / teamTotalTrx : 0;

  const leaderboard = Array.from(lbMap.entries())
    .map(([uid, v]) => {
      const atv    = v.trx > 0 ? v.omzet / v.trx : 0;
      const atu    = v.trx > 0 ? v.prod  / v.trx : 0;
      const atvPct = teamAvgAtv > 0 ? (atv / teamAvgAtv) * 100 : 0;
      const atuPct = teamAvgAtu > 0 ? (atu / teamAvgAtu) * 100 : 0;
      return {
        userId:   uid,
        fullName: v.fullName,
        omzet:    v.omzet,
        atv,
        atu,
        sarp:     (atvPct + atuPct) / 2,
        isMe:     uid === userId,
      };
    })
    .sort((a, b) => b.omzet - a.omzet);

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
      actorUserId: userId || null,
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
      actorUserId: userId || null,
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
            <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <span>{active.tenantName}</span>
            </div>
          </div>
          <BellButton unreadCount={unreadCount} />
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
            className="shrink-0 text-[10px] font-black text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-xl uppercase tracking-widest transition-colors"
          >
            Lihat
          </Link>
        </div>
      ) : (
        <Link href="/crew/input-harian">
          <div className="bg-amber-50 border border-amber-200 hover:border-amber-300 rounded-3xl px-5 py-4 flex items-center gap-4 transition-all">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
              <AlertCircle size={20} className="text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-amber-900 leading-tight">
                Belum ada input hari ini
              </p>
              <p className="text-[11px] font-bold text-amber-600 mt-0.5">
                Tap untuk mulai input
              </p>
            </div>
            <ChevronRight size={16} className="text-amber-400" />
          </div>
        </Link>
      )}

      {/* ── 3 stat chips ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center">
          <p className="text-2xl font-black text-slate-900">{NUM.format(todayCount)}</p>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1 leading-tight">
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
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1 leading-tight">
            Menunggu<br/>Verifikasi
          </p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center">
          <p className="text-2xl font-black text-emerald-600">{NUM.format(approvedCount)}</p>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1 leading-tight">
            Approved<br/>Bulan Ini
          </p>
        </div>
      </div>

      {/* ── Client section: performa card, daily chart, leaderboard ── */}
      <CrewDashboardClient
        todayOmzet={todayOmzet}
        todayTrx={todayTrx}
        todayProd={todayProd}
        todayRejected={todayRejected}
        dailyTarget={dailyTarget}
        runOmzet={runOmzet}
        runTrx={runTrx}
        runProd={runProd}
        runRejected={runRejected}
        monthlyTarget={monthlyTarget}
        chartBars={chartBars}
        leaderboard={leaderboard}
      />

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

      {/* ── Pending reminder banner ── */}
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
