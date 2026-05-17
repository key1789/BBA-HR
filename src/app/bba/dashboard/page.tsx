import { Suspense } from "react";
import Link from "next/link";
import { getSessionContext } from "@/lib/auth-context";
import { GlassCard } from "@/components/shared/glass-card";
import { AnimatedPage } from "@/components/shared/animated-page";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  BBA_DASHBOARD_OMZET_STATUSES,
  buildDailyOmzetSeries,
  clampViewMonthYear,
  computeDashboardKpis,
  monthBoundsKeys,
  parseDashboardTab,
  type BbaDashboardTab,
} from "@/lib/bba-dashboard-metrics";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  LayoutGrid,
  TrendingUp,
} from "lucide-react";
import { CustomLineChart } from "@/components/dashboard/custom-line-chart";
import { BbaDashboardLeaderboard, type LeaderboardRow } from "./bba-dashboard-leaderboard";
import { BbaDashboardTenantSelect } from "./bba-dashboard-tenant-select";

type TenantRow = {
  id: string;
  name: string;
  code: string;
  status: string;
};

type ReminderLogRow = {
  tenant_apotek_id: string;
  reason_code: string;
  created_at: string;
};

type OmzetSubmissionRow = {
  submission_date: string;
  omzet_total: number | null;
  transaction_total: number | null;
  product_total: number | null;
  rejected_customer_total: number | null;
  user_id: string;
  user: { full_name: string } | { full_name: string }[] | null;
};

type KpiConfigRow = {
  tenant_apotek_id: string;
  target_omzet: number | null;
  target_atv: number | null;
  target_atu: number | null;
};

function addCalendarMonths(m: number, y: number, delta: number): { month: number; year: number } {
  const d = new Date(y, m - 1 + delta, 1);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

function dashboardHref(opts: {
  tenant: string;
  month: number;
  year: number;
  tab: BbaDashboardTab;
}): string {
  const q = new URLSearchParams();
  q.set("tenant", opts.tenant);
  q.set("month", String(opts.month));
  q.set("year", String(opts.year));
  q.set("tab", opts.tab);
  return `/bba/dashboard?${q.toString()}`;
}

async function getQueueStats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  todayDateKey: string,
) {
  const [openQueue, overdueQueue] = await Promise.all([
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", tenantId)
      .in("status", ["submitted", "edited_by_admin", "reject"]),
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", tenantId)
      .lt("submission_date", todayDateKey)
      .in("status", ["submitted", "edited_by_admin", "reject"]),
  ]);
  return {
    openQueue: openQueue.count ?? 0,
    overdueQueue: overdueQueue.count ?? 0,
  };
}

export default async function BbaControlDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string; month?: string; year?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return <p className="text-sm text-slate-600">Control dashboard hanya untuk super admin BBA.</p>;
  }

  const supabase = await createClient();
  const reminderWindow = getOperationalReminderWindow();
  const numberFormatter = new Intl.NumberFormat("id-ID");
  const currencyFormatter = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  });

  const last7Date = new Date();
  last7Date.setDate(last7Date.getDate() - 7);
  const last7Iso = last7Date.toISOString();

  const wibTodayParts = reminderWindow.dateKey.split("-").map((p) => parseInt(p, 10));
  const todayYear = wibTodayParts[0] ?? new Date().getFullYear();
  const todayMonth = wibTodayParts[1] ?? new Date().getMonth() + 1;

  const rawMonth = parseInt(params.month ?? "", 10);
  const rawYear = parseInt(params.year ?? "", 10);
  const { month, year } = clampViewMonthYear(
    Number.isFinite(rawMonth) ? rawMonth : todayMonth,
    Number.isFinite(rawYear) ? rawYear : todayYear,
  );
  const tab = parseDashboardTab(params.tab);

  const { data: tenantData } = await supabase
    .from("tenant_apotek")
    .select("id, name, code, status")
    .order("name", { ascending: true });
  const tenants = (tenantData ?? []) as TenantRow[];

  if (tenants.length === 0) {
    return (
      <AnimatedPage className="space-y-4">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center text-slate-400 mb-6">
            <Building2 size={40} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 uppercase">BBA Dashboard</h1>
          <p className="text-slate-500 mt-2">Belum ada tenant apotek yang terdaftar dalam sistem.</p>
        </div>
      </AnimatedPage>
    );
  }

  const selectedTenantId =
    params.tenant && params.tenant !== "all" ? params.tenant : tenants[0]?.id ?? null;
  const scopedTenantIds =
    params.tenant === "all" || !selectedTenantId ? tenants.map((t) => t.id) : [selectedTenantId];

  const tenantQueryForLinks: string =
    params.tenant === "all" ? "all" : (params.tenant ?? selectedTenantId ?? tenants[0]!.id);

  const { startKey, endKey: monthEndKey } = monthBoundsKeys(year, month);
  const isViewingCurrentMonth = year === todayYear && month === todayMonth;
  const periodEnd = isViewingCurrentMonth
    ? reminderWindow.dateKey <= monthEndKey
      ? reminderWindow.dateKey
      : monthEndKey
    : monthEndKey;

  const prevPeriod = addCalendarMonths(month, year, -1);
  const nextPeriod = addCalendarMonths(month, year, 1);
  const periodLabel = new Date(year, month - 1, 1).toLocaleString("id-ID", {
    month: "long",
    year: "numeric",
  });
  const auditHrefThisPeriod = `/bba/audit?month=${month}&year=${year}`;

  const [
    { data: reminderRows },
    assignmentStats,
    perTenantQueue,
    { data: omzetRowsData },
    { data: targetRowsData },
    { count: totalCrewCount },
    publishedAppraisalResult,
  ] = await Promise.all([
    supabase
      .from("reminder_dispatch_logs")
      .select("tenant_apotek_id, reason_code, created_at")
      .gte("created_at", last7Iso)
      .in("tenant_apotek_id", scopedTenantIds),
    Promise.all(
      scopedTenantIds.map(async (tenantId) => {
        const { count } = await supabase
          .from("submission_assignments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_apotek_id", tenantId);
        return [tenantId, count ?? 0] as const;
      }),
    ),
    Promise.all(
      scopedTenantIds.map(async (tenantId) => {
        const stats = await getQueueStats(supabase, tenantId, reminderWindow.dateKey);
        return [tenantId, stats] as const;
      }),
    ),
    supabase
      .from("daily_submissions")
      .select(
        "submission_date, omzet_total, transaction_total, product_total, rejected_customer_total, user_id, user:user_id(full_name)",
      )
      .in("tenant_apotek_id", scopedTenantIds)
      .in("status", [...BBA_DASHBOARD_OMZET_STATUSES])
      .gte("submission_date", startKey)
      .lte("submission_date", periodEnd),
    supabase
      .from("kpi_configs")
      .select("tenant_apotek_id, target_omzet, target_atv, target_atu")
      .in("tenant_apotek_id", scopedTenantIds)
      .eq("period_month", month)
      .eq("period_year", year),
    supabase
      .from("tenant_memberships")
      .select("id", { count: "exact", head: true })
      .in("tenant_apotek_id", scopedTenantIds)
      .eq("role", "crew")
      .eq("is_active", true),
    supabase
      .from("monthly_appraisals")
      .select("crew_user_id")
      .in("tenant_apotek_id", scopedTenantIds)
      .eq("period_month", month)
      .eq("period_year", year)
      .eq("is_published", true),
  ]);

  const reminderLogs = (reminderRows ?? []) as ReminderLogRow[];
  const omzetRows = (omzetRowsData ?? []) as OmzetSubmissionRow[];
  const targetRows = (targetRowsData ?? []) as KpiConfigRow[];
  const publishedAppraisalRows =
    publishedAppraisalResult.error?.code === "42P01"
      ? []
      : ((publishedAppraisalResult.data ?? []) as { crew_user_id: string }[]);
  const assignmentMap = new Map(assignmentStats);
  const queueMap = new Map(perTenantQueue);

  const reminderByTenant = new Map<
    string,
    { total: number; overdueVerification: number; verificationBacklog: number }
  >();
  for (const row of reminderLogs) {
    const current = reminderByTenant.get(row.tenant_apotek_id) ?? {
      total: 0,
      overdueVerification: 0,
      verificationBacklog: 0,
    };
    current.total += 1;
    if (row.reason_code === "overdue_verification") current.overdueVerification += 1;
    if (row.reason_code === "verification_backlog") current.verificationBacklog += 1;
    reminderByTenant.set(row.tenant_apotek_id, current);
  }

  const tenantRows = scopedTenantIds
    .map((tenantId) => {
      const tenant = tenants.find((item) => item.id === tenantId);
      if (!tenant) return null;
      const queue = queueMap.get(tenantId) ?? { openQueue: 0, overdueQueue: 0 };
      const reminder = reminderByTenant.get(tenantId) ?? {
        total: 0,
        overdueVerification: 0,
        verificationBacklog: 0,
      };
      return {
        tenantId,
        tenantCode: tenant.code,
        tenantName: tenant.name,
        openQueue: queue.openQueue,
        overdueQueue: queue.overdueQueue,
        reminders7d: reminder.total,
        overdueReminders7d: reminder.overdueVerification,
        backlogReminders7d: reminder.verificationBacklog,
        assignments: assignmentMap.get(tenantId) ?? 0,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.overdueQueue - a.overdueQueue || b.openQueue - a.openQueue);

  const priorityBranches = tenantRows.slice(0, 6);

  const kpis = computeDashboardKpis(omzetRows);
  const dailySeries = buildDailyOmzetSeries(omzetRows, startKey, periodEnd);

  const performerMap = new Map<string, { name: string; omzet: number }>();
  for (const row of omzetRows) {
    const actor = Array.isArray(row.user) ? row.user[0] : row.user;
    const current = performerMap.get(row.user_id) ?? {
      name: actor?.full_name ?? "Tanpa nama",
      omzet: 0,
    };
    current.omzet += Number(row.omzet_total ?? 0);
    performerMap.set(row.user_id, current);
  }
  const leaderboardRows: LeaderboardRow[] = Array.from(performerMap.entries())
    .map(([userId, value]) => ({ userId, name: value.name, omzet: value.omzet }))
    .sort((a, b) => b.omzet - a.omzet)
    .slice(0, 12);

  const daysInMonth = new Date(year, month, 0).getDate();
  const targetOmzetFull = targetRows.reduce((s, r) => s + Number(r.target_omzet ?? 0), 0);
  const dStart = new Date(`${startKey}T12:00:00+07:00`).getTime();
  const dEnd = new Date(`${periodEnd}T12:00:00+07:00`).getTime();
  const mtdDays = Math.max(1, Math.floor((dEnd - dStart) / 86400000) + 1);
  const proratedTargetOmzet = targetOmzetFull * (mtdDays / Math.max(1, daysInMonth));
  const capaianPct =
    proratedTargetOmzet > 0 ? Math.min(200, Math.round((kpis.omzet / proratedTargetOmzet) * 100)) : 0;

  const atvTargets = targetRows.map((r) => Number(r.target_atv ?? 0)).filter((n) => n > 0);
  const atuTargets = targetRows.map((r) => Number(r.target_atu ?? 0)).filter((n) => n > 0);
  const avgTargetAtv = atvTargets.length ? atvTargets.reduce((a, b) => a + b, 0) / atvTargets.length : 0;
  const avgTargetAtu = atuTargets.length ? atuTargets.reduce((a, b) => a + b, 0) / atuTargets.length : 0;

  const publishedCrewCount = new Set(publishedAppraisalRows.map((row) => row.crew_user_id)).size;
  const publishProgressPercent =
    (totalCrewCount ?? 0) > 0
      ? Math.min(100, Math.round((publishedCrewCount / (totalCrewCount ?? 1)) * 100))
      : 0;

  const totals = tenantRows.reduce(
    (acc, row) => {
      acc.openQueue += row.openQueue;
      acc.overdueQueue += row.overdueQueue;
      acc.reminders7d += row.reminders7d;
      acc.assignments += row.assignments;
      return acc;
    },
    { openQueue: 0, overdueQueue: 0, reminders7d: 0, assignments: 0 },
  );

  const tenantOpts = tenants.map((t) => ({ id: t.id, code: t.code, name: t.name }));

  return (
    <AnimatedPage className="space-y-8 pb-10">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-3 border border-indigo-100">
            <Activity size={12} /> BBA Control
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight uppercase">
            Dashboard <span className="text-indigo-600">BBA</span>
          </h1>
          <p className="text-slate-500 text-sm mt-1 font-medium max-w-xl">
            Pantau penjualan per periode dan beban operasional verifikasi lintas cabang.
          </p>
        </div>

        <div className="flex flex-col items-stretch sm:items-end gap-3">
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <span>Periode KPI</span>
            <div className="flex rounded-xl border border-slate-200 bg-white overflow-hidden">
              <Link
                href={dashboardHref({
                  tenant: tenantQueryForLinks,
                  month: prevPeriod.month,
                  year: prevPeriod.year,
                  tab,
                })}
                className="p-2 hover:bg-slate-50 text-slate-600"
                aria-label="Bulan sebelumnya"
              >
                <ChevronLeft size={18} />
              </Link>
              <Link
                href={dashboardHref({
                  tenant: tenantQueryForLinks,
                  month: nextPeriod.month,
                  year: nextPeriod.year,
                  tab,
                })}
                className="p-2 hover:bg-slate-50 text-slate-600 border-l border-slate-100"
                aria-label="Bulan berikutnya"
              >
                <ChevronRight size={18} />
              </Link>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hari operasional (WIB)</p>
            <p className="text-sm font-bold text-slate-800">{reminderWindow.dateKey}</p>
            <p className="text-[10px] text-slate-400">
              Cut-off pengingat {reminderWindow.cutoffHour}.00 {reminderWindow.timezoneLabel}
            </p>
          </div>
        </div>
      </div>

      <Suspense
        fallback={
          <GlassCard className="!p-4 h-24 animate-pulse bg-slate-100/80 border border-slate-100">
            <span className="sr-only">Memuat filter…</span>
          </GlassCard>
        }
      >
        <BbaDashboardTenantSelect
          tenants={tenantOpts}
          tenantId={params.tenant === "all" ? "all" : (params.tenant ?? selectedTenantId ?? tenants[0]!.id)}
          month={month}
          year={year}
          tab={tab}
        />
      </Suspense>

      {tab === "ops" ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <GlassCard interactive className="group">
              <div className="flex justify-between items-start mb-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 group-hover:bg-slate-900 group-hover:text-white transition-all">
                  <LayoutGrid size={20} />
                </div>
                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full uppercase">
                  Antrean
                </span>
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Open queue</p>
              <p className="mt-1 text-3xl font-black text-slate-900 tracking-tight">
                {numberFormatter.format(totals.openQueue)}
              </p>
            </GlassCard>
            <GlassCard interactive className="group">
              <div className="flex justify-between items-start mb-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-all">
                  <Clock size={20} />
                </div>
                <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-1 rounded-full uppercase">
                  SLA
                </span>
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Overdue</p>
              <p className="mt-1 text-3xl font-black text-rose-600 tracking-tight">
                {numberFormatter.format(totals.overdueQueue)}
              </p>
            </GlassCard>
          </div>

          {priorityBranches.length > 0 ? (
            <GlassCard>
              <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3">
                Prioritas cabang
              </h2>
              <ul className="divide-y divide-slate-100">
                {priorityBranches.map((row) => (
                  <li key={row.tenantId} className="py-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-black text-slate-900">{row.tenantCode}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{row.tenantName}</p>
                    </div>
                    <div className="flex gap-3 text-xs font-bold">
                      <span className="text-slate-600">Open {numberFormatter.format(row.openQueue)}</span>
                      <span className="text-rose-600">Overdue {numberFormatter.format(row.overdueQueue)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </GlassCard>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <GlassCard>
              <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                <Calendar size={16} className="text-indigo-600" />
                Reminder & assignment (7 hari)
              </h2>
              <p className="text-sm text-slate-600">
                <span className="font-black text-slate-900">{numberFormatter.format(totals.reminders7d)}</span>{" "}
                event reminder terkirim ·{" "}
                <span className="font-black text-slate-900">{numberFormatter.format(totals.assignments)}</span>{" "}
                penugasan aktif (scoped tenant).
              </p>
            </GlassCard>
            <GlassCard className="border-indigo-100/50">
              <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-indigo-600" />
                Kesiapan insentif ({periodLabel})
              </h2>
              <div className="flex justify-between items-end mb-2">
                <div>
                  <p className="text-3xl font-black text-slate-900">{publishProgressPercent}%</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Sudah publish appraisal</p>
                </div>
                <p className="text-xs font-bold text-indigo-600">
                  {numberFormatter.format(publishedCrewCount)} / {numberFormatter.format(totalCrewCount ?? 0)} crew
                </p>
              </div>
              <div className="h-3 rounded-full bg-slate-100 overflow-hidden border border-slate-200 p-0.5">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all"
                  style={{ width: `${publishProgressPercent}%` }}
                />
              </div>
            </GlassCard>
          </div>

          <GlassCard className="!p-0 overflow-hidden border-indigo-100/50">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <Building2 size={16} className="text-indigo-600" />
                Ringkasan operasional per tenant
              </h2>
              <Link
                href={auditHrefThisPeriod}
                className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:underline"
              >
                Buka audit periode ini →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Cabang</th>
                    <th className="px-6 py-4">Antrean terbuka</th>
                    <th className="px-6 py-4">Lewat batas</th>
                    <th className="px-6 py-4">Reminder 7h</th>
                    <th className="px-6 py-4">Assignment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tenantRows.map((row) => (
                    <tr key={row.tenantId} className="hover:bg-slate-50/50 transition-all">
                      <td className="px-6 py-4">
                        <p className="font-black text-slate-800">{row.tenantCode}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">{row.tenantName}</p>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-700">
                        {numberFormatter.format(row.openQueue)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            "font-black text-[10px] uppercase",
                            row.overdueQueue > 0 ? "text-rose-600" : "text-emerald-600",
                          )}
                        >
                          {numberFormatter.format(row.overdueQueue)}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-700">
                        {numberFormatter.format(row.reminders7d)}
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-700">
                        {numberFormatter.format(row.assignments)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <GlassCard>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Omzet (s.d. {periodEnd})</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{currencyFormatter.format(kpis.omzet)}</p>
              <p className="text-[10px] text-slate-500 mt-1 font-bold">
                vs target prorata {currencyFormatter.format(Math.round(proratedTargetOmzet))}
              </p>
            </GlassCard>
            <GlassCard>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Capaian prorata</p>
              <p className="mt-1 text-2xl font-black text-indigo-600">{capaianPct}%</p>
              <p className="text-[10px] text-slate-500 mt-1 font-bold">{mtdDays} hari dalam bulan</p>
            </GlassCard>
            <GlassCard>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ATV aktual</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{currencyFormatter.format(kpis.atv)}</p>
              <p className="text-[10px] text-slate-500 mt-1 font-bold">
                Target avg {avgTargetAtv > 0 ? currencyFormatter.format(avgTargetAtv) : "—"}
              </p>
            </GlassCard>
            <GlassCard>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ATU aktual</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{kpis.atu.toFixed(2)}</p>
              <p className="text-[10px] text-slate-500 mt-1 font-bold">
                Target avg {avgTargetAtu > 0 ? avgTargetAtu.toFixed(2) : "—"}
              </p>
            </GlassCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <GlassCard className="lg:col-span-2 !p-0 overflow-hidden border-indigo-100/50">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
                <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <TrendingUp size={16} className="text-indigo-600" />
                  Omzet harian — {periodLabel}
                </h2>
              </div>
              <div className="p-4">
                <CustomLineChart points={dailySeries} />
              </div>
            </GlassCard>
            <GlassCard>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pelanggan hilang</p>
              <p className="mt-2 text-3xl font-black text-amber-700">
                {numberFormatter.format(kpis.lostCustomers)}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Akumulasi kolom penolakan / pelanggan tidak jadi beli pada submission terverifikasi di periode ini.
              </p>
              <Link
                href={auditHrefThisPeriod}
                className="mt-4 inline-flex text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:underline"
              >
                Audit & approval →
              </Link>
            </GlassCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <BbaDashboardLeaderboard
              periodLabel={`${periodLabel} (s.d. ${periodEnd})`}
              rows={leaderboardRows}
              currencyFormatter={currencyFormatter}
            />
            <GlassCard className="!p-0 overflow-hidden border-indigo-100/50">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                  Riwayat omzet harian
                </h2>
              </div>
              <div className="max-h-[420px] overflow-y-auto overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest z-10">
                    <tr>
                      <th className="px-4 py-3">Tanggal</th>
                      <th className="px-4 py-3">Omzet</th>
                      <th className="px-4 py-3">Δ harian</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...dailySeries].reverse().map((row, idx, arr) => {
                      const prev = arr[idx + 1];
                      const delta = prev ? row.amount - prev.amount : 0;
                      return (
                        <tr key={row.dateKey} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2 font-bold text-slate-700">{row.dateKey}</td>
                          <td className="px-4 py-2 font-bold text-slate-900">
                            {currencyFormatter.format(row.amount)}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 text-[10px] font-black uppercase",
                                delta >= 0 ? "text-emerald-600" : "text-rose-600",
                              )}
                            >
                              {delta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                              {currencyFormatter.format(Math.abs(delta))}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </div>
        </>
      )}
    </AnimatedPage>
  );
}
