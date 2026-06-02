import { getSessionContext } from "@/lib/auth-context";
import { recordReminderDispatch } from "@/lib/reminder-dispatch-log";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GlassCard } from "@/components/shared/glass-card";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  ShieldCheck, ClipboardCheck, CheckCircle2,
  AlertCircle, BarChart3,
  Star, Clock,
  ArrowRight, CalendarDays, TrendingUp, Users,
} from "lucide-react";
import { BellButton } from "./bell-button";

export default async function AdminDashboardPage() {
  const session = await getSessionContext();
  const active = session?.activeMembership;

  if (!active || active.role !== "admin_apotek") {
    return (
      <section className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center text-slate-400 mb-6">
          <ShieldCheck size={40} />
        </div>
        <h1 className="text-2xl font-black text-slate-900 uppercase">Admin Dashboard</h1>
        <p className="text-slate-500 mt-2">Halaman ini hanya dapat diakses oleh Admin Apotek.</p>
      </section>
    );
  }

  const supabase = await createClient();
  const supabaseAdmin = createAdminClient();

  // ── Date scope: bulan berjalan (WIB-authoritative) ───────────────────────
  const reminderWindow = getOperationalReminderWindow();
  const [wibYear, wibMonth] = reminderWindow.dateKey.split("-").map(Number);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const firstDayOfMonth = `${wibYear}-${pad2(wibMonth!)}-01`;
  const today = reminderWindow.dateKey;
  const now = new Date();
  const currentMonthLabel = now.toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });

  // ── All queries in parallel ──────────────────────────────────────────────
  const [
    {
      data: { user },
    },
    queueCount,
    approvedCount,
    needsFollowupCount,
    draftCount,
    teamSubmissionsResult,
    crewCountResult,
    kpiConfigResult,
  ] = await Promise.all([
    supabase.auth.getUser(),

    // Antrean verifikasi — naturally current, no date scope needed
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .in("status", ["submitted", "edited_by_admin"]),

    // Submission selesai — scoped ke bulan ini
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("status", "approved")
      .gte("submission_date", firstDayOfMonth)
      .lte("submission_date", today),

    // Perlu revisi — scoped ke bulan ini
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("status", "reject")
      .gte("submission_date", firstDayOfMonth)
      .lte("submission_date", today),

    // Draft — scoped ke bulan ini
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("status", "draft")
      .gte("submission_date", firstDayOfMonth)
      .lte("submission_date", today),

    // Performa tim (omzet, trx, produk per submission approved)
    supabase
      .from("daily_submissions")
      .select("user_id, omzet_total, transaction_total, product_total")
      .eq("tenant_apotek_id", active.tenantId)
      .in("status", ["approved", "edited_by_admin"])
      .gte("submission_date", firstDayOfMonth)
      .lte("submission_date", today),

    // Jumlah crew aktif
    supabaseAdmin
      .from("tenant_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("is_active", true)
      .eq("role", "crew"),

    // KPI target bulan ini
    supabase
      .from("kpi_configs")
      .select("target_omzet")
      .eq("tenant_apotek_id", active.tenantId)
      .eq("period_month", wibMonth!)
      .eq("period_year", wibYear!)
      .maybeSingle(),
  ]);

  const numberFormatter = new Intl.NumberFormat("id-ID");
  const IDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
  const queueValue   = queueCount.count ?? 0;
  const followupValue = needsFollowupCount.count ?? 0;
  const draftValue   = draftCount.count ?? 0;

  // ── Performa tim ──
  const teamRows = (teamSubmissionsResult.data ?? []) as { user_id: string; omzet_total: number; transaction_total: number; product_total: number }[];
  const teamOmzet = teamRows.reduce((s, r) => s + Number(r.omzet_total ?? 0), 0);
  const teamTrx   = teamRows.reduce((s, r) => s + Number(r.transaction_total ?? 0), 0);
  const teamProd  = teamRows.reduce((s, r) => s + Number(r.product_total ?? 0), 0);
  const teamAtv   = teamTrx > 0 ? teamOmzet / teamTrx : 0;
  const teamAtu   = teamTrx > 0 ? teamProd  / teamTrx : 0;
  const activeSubmitters = new Set(teamRows.map(r => r.user_id)).size;
  const crewTotal = crewCountResult.count ?? 0;
  const kpiTarget = Number(kpiConfigResult.data?.target_omzet ?? 0);
  const teamCapaianPct = kpiTarget > 0 ? Math.min(100, (teamOmzet / kpiTarget) * 100) : 0;

  // ── Greeting ──
  const wibHour = reminderWindow.hour;
  const timeGreeting =
    wibHour < 11 ? "pagi" : wibHour < 15 ? "siang" : wibHour < 18 ? "sore" : "malam";
  const firstName = ((session?.userFullName || session?.userEmail || "Admin").split(" ")[0] ?? "Admin");
  const dayLabel = new Intl.DateTimeFormat("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date());

  const reminder =
    queueValue > 0 || followupValue > 0
      ? {
          tone: "amber" as const,
          title: "Perlu Verifikasi",
          text: `Terdapat ${numberFormatter.format(queueValue)} antrean verifikasi dan ${numberFormatter.format(followupValue)} submission ditolak yang perlu tindak lanjut.`,
          icon: <Clock size={16} className="text-amber-600" />,
        }
      : {
          tone: "emerald" as const,
          title: "Status Terkendali",
          text: "Antrean verifikasi saat ini terkendali. Kerja bagus!",
          icon: <CheckCircle2 size={16} className="text-emerald-600" />,
        };

  if (queueValue > 0 || followupValue > 0) {
    try {
      await recordReminderDispatch(supabase, {
        tenantApotekId: active.tenantId,
        actorUserId: user?.id ?? null,
        reminderDate: reminderWindow.dateKey,
        phase: reminderWindow.phase,
        scope: "admin_dashboard",
        reasonCode: "verification_backlog",
        payload: { queueCount: queueValue, followupCount: followupValue, draftCount: draftValue },
      });
    } catch {
      // Non-critical: reminder dispatch failure must not break the dashboard
    }
  }

  return (
    <section className="space-y-6">

      {/* ── Greeting card ───────────────────────────────────────────── */}
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
          <BellButton unreadCount={0} />
        </div>
      </div>

      {/* ── Reminder banner ──────────────────────────────────────────── */}
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-sm transition-all md:gap-4 md:p-5",
          reminder.tone === "amber"
            ? "border-amber-100 bg-amber-50/50"
            : "border-emerald-100 bg-emerald-50/50",
        )}
      >
        {/* Icon — kecil di mobile, besar di desktop */}
        <div
          className={cn(
            "flex flex-shrink-0 items-center justify-center rounded-xl shadow-sm h-8 w-8 md:h-12 md:w-12 md:rounded-2xl",
            reminder.tone === "amber"
              ? "bg-amber-100 text-amber-600"
              : "bg-emerald-100 text-emerald-600",
          )}
        >
          {reminder.icon}
        </div>

        {/* Teks — di mobile hanya judul, deskripsi muncul di desktop */}
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-xs font-black uppercase tracking-widest leading-tight",
              reminder.tone === "amber" ? "text-amber-700" : "text-emerald-700",
            )}
          >
            {reminder.title}
          </p>
          <p className="hidden md:block mt-1 text-sm font-medium text-slate-600">
            {reminder.text}
          </p>
        </div>

        {/* Tombol — arrow saja di mobile, label penuh di desktop */}
        <Link
          href="/admin/verifikasi"
          className={cn(
            "flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all md:gap-2 md:rounded-2xl md:px-5 md:py-2.5",
            reminder.tone === "amber"
              ? "bg-amber-600 text-white shadow-md shadow-amber-200"
              : "bg-emerald-600 text-white shadow-md shadow-emerald-200",
          )}
        >
          <span className="hidden md:inline">Selesaikan Queue</span>
          <ArrowRight size={14} />
        </Link>
      </div>

      {/* ── Stats cards ──────────────────────────────────────────────── */}

      {/* Mobile: 3 kartu compact sejajar */}
      <div className="grid grid-cols-3 gap-2 md:hidden">
        <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white px-2 py-3 text-center">
          <div className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <ClipboardCheck size={15} />
          </div>
          <p className="text-[8px] font-black uppercase tracking-wider text-slate-400 leading-tight">Antrean</p>
          <p className="mt-0.5 text-2xl font-black tabular-nums text-slate-900 leading-none">
            {numberFormatter.format(queueValue)}
          </p>
          <p className="mt-0.5 text-[8px] text-slate-400 leading-tight">menunggu</p>
        </div>

        <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white px-2 py-3 text-center">
          <div className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={15} />
          </div>
          <p className="text-[8px] font-black uppercase tracking-wider text-slate-400 leading-tight">Selesai</p>
          <p className="mt-0.5 text-2xl font-black tabular-nums text-slate-900 leading-none">
            {numberFormatter.format(approvedCount.count ?? 0)}
          </p>
          <p className="mt-0.5 text-[8px] text-slate-400 leading-tight">bulan ini</p>
        </div>

        <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white px-2 py-3 text-center">
          <div className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
            <AlertCircle size={15} />
          </div>
          <p className="text-[8px] font-black uppercase tracking-wider text-slate-400 leading-tight">Ditolak</p>
          <p className="mt-0.5 text-2xl font-black tabular-nums text-rose-600 leading-none">
            {numberFormatter.format(followupValue)}
          </p>
          <p className="mt-0.5 text-[8px] text-slate-400 leading-tight">bulan ini</p>
        </div>
      </div>

      {/* Desktop: GlassCard — tetap seperti semula */}
      <div className="hidden md:grid gap-4 md:grid-cols-3">
        <GlassCard interactive className="group">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition-all group-hover:bg-indigo-600 group-hover:text-white">
              <ClipboardCheck size={20} />
            </div>
            <span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-black uppercase text-indigo-600">Queue</span>
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Antrean Verifikasi</p>
          <p className="mt-1 text-3xl font-black tabular-nums text-slate-900 tracking-tight">
            {numberFormatter.format(queueValue)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Menunggu tindakan admin</p>
        </GlassCard>

        <GlassCard interactive className="group">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-all group-hover:bg-emerald-600 group-hover:text-white">
              <CheckCircle2 size={20} />
            </div>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-600">Approved</span>
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Submission Selesai</p>
          <p className="mt-1 text-3xl font-black tabular-nums text-slate-900 tracking-tight">
            {numberFormatter.format(approvedCount.count ?? 0)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">{currentMonthLabel}</p>
        </GlassCard>

        <GlassCard interactive className="group">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 transition-all group-hover:bg-rose-600 group-hover:text-white">
              <AlertCircle size={20} />
            </div>
            <span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-black uppercase text-rose-600">Rejected</span>
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Perlu Revisi Crew</p>
          <p className="mt-1 text-3xl font-black tabular-nums text-rose-600 tracking-tight">
            {numberFormatter.format(followupValue)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {currentMonthLabel}
            {draftValue > 0 && (
              <span className="ml-2 text-slate-300">· Draft: {numberFormatter.format(draftValue)}</span>
            )}
          </p>
        </GlassCard>
      </div>

      {/* ── Performa Tim ─────────────────────────────────────────────── */}
      {teamOmzet > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 px-4 py-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp size={14} className="text-emerald-600" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Performa Tim · {currentMonthLabel}
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
              <Users size={10} className="text-slate-500" />
              <p className="text-[10px] font-black text-slate-600">
                {activeSubmitters}/{crewTotal > 0 ? crewTotal : activeSubmitters} crew
              </p>
            </div>
          </div>

          {/* Omzet tim + target */}
          <div>
            <div className="flex items-end justify-between mb-1.5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Total Omzet Tim</p>
                <p className="text-2xl font-black text-slate-900 leading-none">{IDR.format(teamOmzet)}</p>
              </div>
              {kpiTarget > 0 && (
                <div className="text-right">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Target</p>
                  <p className="text-xs font-black text-slate-500">{IDR.format(kpiTarget)}</p>
                </div>
              )}
            </div>
            {kpiTarget > 0 && (
              <>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      teamCapaianPct >= 100 ? "bg-emerald-500"
                      : teamCapaianPct >= 75  ? "bg-sky-500"
                      : teamCapaianPct >= 50  ? "bg-amber-500"
                      : "bg-rose-400",
                    )}
                    style={{ width: `${teamCapaianPct}%` }}
                  />
                </div>
                <p className="text-[9px] font-bold text-slate-400 mt-1">{teamCapaianPct.toFixed(1)}% dari target</p>
              </>
            )}
          </div>

          {/* ATV / ATU */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 rounded-xl px-3 py-2.5">
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">ATV Rata-rata</p>
              <p className="text-sm font-black text-slate-800 mt-0.5">{IDR.format(teamAtv)}</p>
            </div>
            <div className="bg-slate-50 rounded-xl px-3 py-2.5">
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">ATU Rata-rata</p>
              <p className="text-sm font-black text-slate-800 mt-0.5">{teamAtu.toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick links ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2 md:gap-4">

        <Link href="/admin/verifikasi" className="group block">
          <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm transition-all hover:border-indigo-200 hover:shadow-md md:aspect-square md:rounded-2xl md:p-5">
            <div className="absolute inset-0 bg-indigo-50/30 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative z-10 mb-1.5 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 shadow-sm transition-all group-hover:bg-indigo-600 group-hover:text-white md:mb-3 md:h-14 md:w-14 md:rounded-2xl">
              <ClipboardCheck size={20} className="md:hidden" />
              <ClipboardCheck size={28} className="hidden md:block" />
            </div>
            <p className="relative z-10 text-[8px] font-black uppercase tracking-wider text-slate-400 md:text-[10px] md:tracking-widest">Approval</p>
            <p className="relative z-10 mt-0.5 text-[10px] font-black uppercase leading-tight text-slate-800 md:text-sm">Verifikasi</p>
          </div>
        </Link>

        <Link href="/admin/laporan" className="group block">
          <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm transition-all hover:border-emerald-200 hover:shadow-md md:aspect-square md:rounded-2xl md:p-5">
            <div className="absolute inset-0 bg-emerald-50/30 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative z-10 mb-1.5 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 shadow-sm transition-all group-hover:bg-emerald-600 group-hover:text-white md:mb-3 md:h-14 md:w-14 md:rounded-2xl">
              <BarChart3 size={20} className="md:hidden" />
              <BarChart3 size={28} className="hidden md:block" />
            </div>
            <p className="relative z-10 text-[8px] font-black uppercase tracking-wider text-slate-400 md:text-[10px] md:tracking-widest">Analisis</p>
            <p className="relative z-10 mt-0.5 text-[10px] font-black uppercase leading-tight text-slate-800 md:text-sm">Laporan</p>
          </div>
        </Link>

        <Link href="/admin/absensi" className="group block">
          <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm transition-all hover:border-violet-200 hover:shadow-md md:aspect-square md:rounded-2xl md:p-5">
            <div className="absolute inset-0 bg-violet-50/30 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative z-10 mb-1.5 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-600 shadow-sm transition-all group-hover:bg-violet-600 group-hover:text-white md:mb-3 md:h-14 md:w-14 md:rounded-2xl">
              <CalendarDays size={20} className="md:hidden" />
              <CalendarDays size={28} className="hidden md:block" />
            </div>
            <p className="relative z-10 text-[8px] font-black uppercase tracking-wider text-slate-400 md:text-[10px] md:tracking-widest">Tim</p>
            <p className="relative z-10 mt-0.5 text-[10px] font-black uppercase leading-tight text-slate-800 md:text-sm">Absensi</p>
          </div>
        </Link>

        <Link href="/admin/review-pelanggan" className="group block">
          <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm transition-all hover:border-amber-200 hover:shadow-md md:aspect-square md:rounded-2xl md:p-5">
            <div className="absolute inset-0 bg-amber-50/30 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative z-10 mb-1.5 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-600 shadow-sm transition-all group-hover:bg-amber-600 group-hover:text-white md:mb-3 md:h-14 md:w-14 md:rounded-2xl">
              <Star size={20} className="md:hidden" />
              <Star size={28} className="hidden md:block" />
            </div>
            <p className="relative z-10 text-[8px] font-black uppercase tracking-wider text-slate-400 md:text-[10px] md:tracking-widest">Input</p>
            <p className="relative z-10 mt-0.5 text-[10px] font-black uppercase leading-tight text-slate-800 md:text-sm">Review</p>
          </div>
        </Link>

      </div>
    </section>
  );
}
