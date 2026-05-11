import { getSessionContext } from "@/lib/auth-context";
import { GlassCard } from "@/components/shared/glass-card";
import { InlineAlert } from "@/components/shared/inline-alert";
import { AnimatedPage } from "@/components/shared/animated-page";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { 
  TrendingUp, Activity, AlertCircle, Users, 
  ArrowUpRight, ArrowDownRight, LayoutGrid, Building2,
  Calendar, CheckCircle2, ChevronRight, Clock
} from "lucide-react";

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

type ApprovedTrendRow = {
  submission_date: string;
  omzet_total: number;
};

type PerformanceRow = {
  user_id: string;
  omzet_total: number;
  user: { full_name: string } | { full_name: string }[] | null;
};

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
  searchParams: Promise<{ tenant?: string }>;
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
  const currentDate = new Date(`${reminderWindow.dateKey}T00:00:00+07:00`);
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const monthStartKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;

  const { data: tenantData } = await supabase
    .from("tenant_apotek")
    .select("id, name, code, status")
    .order("name", { ascending: true });
  const tenants = (tenantData ?? []) as TenantRow[];
  const selectedTenantId =
    params.tenant && params.tenant !== "all" ? params.tenant : tenants[0]?.id ?? null;
  const scopedTenantIds =
    params.tenant === "all" || !selectedTenantId ? tenants.map((tenant) => tenant.id) : [selectedTenantId];

  if (tenants.length === 0) {
    return (
      <AnimatedPage className="space-y-4">
        <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center text-slate-400 mb-6">
               <Building2 size={40} />
            </div>
            <h1 className="text-2xl font-black text-slate-900 uppercase">BBA Pantauan Harian</h1>
            <p className="text-slate-500 mt-2">Belum ada tenant apotek yang terdaftar dalam sistem.</p>
        </div>
      </AnimatedPage>
    );
  }

  const [
    { data: reminderRows },
    assignmentStats,
    perTenantQueue,
    { data: trendRowsData },
    { data: targetRowsData },
    { data: performanceData },
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
      .select("submission_date, omzet_total")
      .in("tenant_apotek_id", scopedTenantIds)
      .eq("status", "approved")
      .gte("submission_date", last7Iso.slice(0, 10)),
    supabase
      .from("kpi_configs")
      .select("tenant_apotek_id, target_omzet")
      .in("tenant_apotek_id", scopedTenantIds)
      .eq("period_month", currentMonth)
      .eq("period_year", currentYear),
    supabase
      .from("daily_submissions")
      .select("user_id, omzet_total, user:user_id(full_name)")
      .in("tenant_apotek_id", scopedTenantIds)
      .eq("status", "approved")
      .gte("submission_date", monthStartKey)
      .lte("submission_date", reminderWindow.dateKey),
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
      .eq("period_month", currentMonth)
      .eq("period_year", currentYear)
      .eq("is_published", true),
  ]);
  const reminderLogs = (reminderRows ?? []) as ReminderLogRow[];
  const trendRows = (trendRowsData ?? []) as ApprovedTrendRow[];
  const targetRows = (targetRowsData ?? []) as { tenant_apotek_id: string; target_omzet: number }[];
  const performanceRows = (performanceData ?? []) as PerformanceRow[];
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

  const dateRange = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(currentDate);
    date.setDate(currentDate.getDate() - (6 - index));
    return date.toISOString().slice(0, 10);
  });
  const trendMap = new Map<string, number>();
  for (const row of trendRows) {
    trendMap.set(row.submission_date, (trendMap.get(row.submission_date) ?? 0) + Number(row.omzet_total ?? 0));
  }
  const dailyTargetTotal =
    targetRows.reduce((sum, row) => sum + Number(row.target_omzet ?? 0), 0) / Math.max(1, daysInMonth);
  const trendSeries = dateRange.map((dateKey) => {
    const actual = trendMap.get(dateKey) ?? 0;
    return {
      dateKey,
      actual,
      target: dailyTargetTotal,
    };
  });

  const performerMap = new Map<string, { name: string; omzet: number }>();
  for (const row of performanceRows) {
    const actor = Array.isArray(row.user) ? row.user[0] : row.user;
    const current = performerMap.get(row.user_id) ?? {
      name: actor?.full_name ?? "Tanpa nama",
      omzet: 0,
    };
    current.omzet += Number(row.omzet_total ?? 0);
    performerMap.set(row.user_id, current);
  }
  const topPerformers = Array.from(performerMap.entries())
    .map(([userId, value]) => ({ userId, ...value }))
    .sort((a, b) => b.omzet - a.omzet)
    .slice(0, 3);
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
  const actionAlerts: string[] = [];
  if (totals.overdueQueue > 0) {
    actionAlerts.push(
      `${numberFormatter.format(totals.overdueQueue)} antrean melewati batas waktu. Prioritaskan verifikasi hari ini.`,
    );
  }
  if (totals.openQueue > 0) {
    actionAlerts.push(
      `${numberFormatter.format(totals.openQueue)} antrean belum selesai. Dorong admin tenant selesaikan sebelum cut-off.`,
    );
  }
  if (totals.reminders7d > 0) {
    actionAlerts.push(
      `${numberFormatter.format(totals.reminders7d)} pengingat terkirim 7 hari terakhir. Cek tenant dengan alasan terbanyak.`,
    );
  }
  if (actionAlerts.length === 0) {
    actionAlerts.push("Kondisi operasional aman. Tidak ada antrean prioritas mendesak.");
  }

  return (
    <AnimatedPage className="space-y-8 pb-10">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
         <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-3 border border-indigo-100">
               <Activity size={12} /> Live Operations
            </div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight uppercase">BBA Pantauan <span className="text-indigo-600">Harian</span></h1>
            <p className="text-slate-500 text-sm mt-1 font-medium">Ringkasan operasional seluruh cabang apotek dalam satu dashboard.</p>
         </div>
         
         <div className="flex items-center gap-4">
            <div className="text-right">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Periode Aktif</p>
               <p className="text-sm font-bold text-slate-800 uppercase">{reminderWindow.dateKey}</p>
            </div>
            <div className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center text-indigo-600">
               <Calendar size={24} />
            </div>
         </div>
      </div>

      {/* Tenant Quick Filter */}
      <GlassCard className="!p-2 flex flex-wrap gap-2 bg-slate-50/50">
        <Link
          href="/bba/dashboard?tenant=all"
          className={`rounded-2xl px-5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${
            params.tenant === "all" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200" : "bg-white text-slate-600 hover:bg-white/80"
          }`}
        >
          Semua Tenant
        </Link>
        {tenants.map((tenant) => (
          <Link
            key={tenant.id}
            href={`/bba/dashboard?tenant=${tenant.id}`}
            className={`rounded-2xl px-5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${
              selectedTenantId === tenant.id && params.tenant !== "all"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                : "bg-white text-slate-600 hover:bg-white/80"
            }`}
          >
            {tenant.code}
          </Link>
        ))}
      </GlassCard>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-4">
        <GlassCard interactive className="group">
          <div className="flex justify-between items-start mb-4">
             <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 group-hover:bg-slate-900 group-hover:text-white transition-all">
                <LayoutGrid size={20} />
             </div>
             <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full uppercase">Normal</span>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Open Queue</p>
          <p className="mt-1 text-3xl font-black text-slate-900 tracking-tight">
            {numberFormatter.format(totals.openQueue)}
          </p>
        </GlassCard>

        <GlassCard interactive className="group">
          <div className="flex justify-between items-start mb-4">
             <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-all">
                <Clock size={20} />
             </div>
             <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-1 rounded-full uppercase">SLA Breach</span>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Overdue</p>
          <p className="mt-1 text-3xl font-black text-rose-600 tracking-tight">
            {numberFormatter.format(totals.overdueQueue)}
          </p>
        </GlassCard>

        <GlassCard interactive className="group">
          <div className="flex justify-between items-start mb-4">
             <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-all">
                <AlertCircle size={20} />
             </div>
             <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-full uppercase">Reminders</span>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Events (7D)</p>
          <p className="mt-1 text-3xl font-black text-slate-900 tracking-tight">
            {numberFormatter.format(totals.reminders7d)}
          </p>
        </GlassCard>

        <GlassCard interactive className="group">
          <div className="flex justify-between items-start mb-4">
             <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                <Users size={20} />
             </div>
             <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full uppercase">Team</span>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Assignments</p>
          <p className="mt-1 text-3xl font-black text-slate-900 tracking-tight">
            {numberFormatter.format(totals.assignments)}
          </p>
        </GlassCard>
      </div>

      <InlineAlert
        tone="info"
        message={`Fokus hari ini: ${actionAlerts[0]} Waktu monitoring ${reminderWindow.dateKey} (WIB), cut-off ${reminderWindow.cutoffHour}.00 WIB.`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2 !p-0 overflow-hidden border-indigo-100/50">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
             <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
               <TrendingUp size={16} className="text-indigo-600" /> Tren Omzet 7 Hari
             </h2>
             <span className="text-[10px] font-bold text-slate-400">Aktual vs Target Harian</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4">Tanggal</th>
                  <th className="px-6 py-4">Omzet Aktual</th>
                  <th className="px-6 py-4">Target</th>
                  <th className="px-6 py-4">Selisih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trendSeries.map((item) => {
                  const variance = item.actual - item.target;
                  return (
                    <tr key={item.dateKey} className="hover:bg-slate-50/50 transition-all group">
                      <td className="px-6 py-4 font-bold text-slate-700">{item.dateKey}</td>
                      <td className="px-6 py-4 font-bold text-slate-900">{currencyFormatter.format(item.actual)}</td>
                      <td className="px-6 py-4 text-slate-400">{currencyFormatter.format(item.target)}</td>
                      <td className="px-6 py-4">
                        <div className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[10px]",
                          variance >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                        )}>
                           {variance >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                           {currencyFormatter.format(Math.abs(variance))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>

        <div className="space-y-6">
           <GlassCard className="border-indigo-100/50">
             <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
               <Activity size={16} className="text-indigo-600" /> Kesiapan Insentif
             </h2>
             <div className="flex justify-between items-end mb-2">
                <div>
                   <p className="text-3xl font-black text-slate-900">{publishProgressPercent}%</p>
                   <p className="text-[10px] font-bold text-slate-400 uppercase">Sudah Publish Appraisal</p>
                </div>
                <p className="text-xs font-bold text-indigo-600">{numberFormatter.format(publishedCrewCount)} / {numberFormatter.format(totalCrewCount ?? 0)} Crew</p>
             </div>
             <div className="h-3 rounded-full bg-slate-100 overflow-hidden border border-slate-200 p-0.5">
               <div
                 className="h-full rounded-full bg-indigo-600 transition-all shadow-[0_0_10px_rgba(79,70,229,0.4)]"
                 style={{ width: `${publishProgressPercent}%` }}
               />
             </div>
           </GlassCard>

           <GlassCard className="border-indigo-100/50">
             <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
               <CheckCircle2 size={16} className="text-emerald-600" /> Top Performer
             </h2>
             <div className="space-y-3">
               {topPerformers.map((item, index) => (
                 <div key={item.userId} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center font-black text-xs text-indigo-600 border border-indigo-50">
                       #{index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                       <p className="text-xs font-black text-slate-800 truncate">{item.name}</p>
                       <p className="text-[10px] font-bold text-emerald-600">{currencyFormatter.format(item.omzet)}</p>
                    </div>
                 </div>
               ))}
             </div>
           </GlassCard>
        </div>
      </div>

      <GlassCard className="!p-0 overflow-hidden border-indigo-100/50">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
             <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
               <Building2 size={16} className="text-indigo-600" /> Performa per Tenant
             </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4">Tenant Apotek</th>
                  <th className="px-6 py-4">Open Queue</th>
                  <th className="px-6 py-4">SLA Status</th>
                  <th className="px-6 py-4">Reminders (7D)</th>
                  <th className="px-6 py-4">Assignments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tenantRows.map((row) => (
                  <tr key={row.tenantId} className="hover:bg-slate-50/50 transition-all group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xs uppercase">
                            {row.tenantCode.slice(0, 2)}
                         </div>
                         <div>
                            <p className="font-black text-slate-800 leading-none mb-1">{row.tenantCode}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{row.tenantName}</p>
                         </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-700">{numberFormatter.format(row.openQueue)}</td>
                    <td className="px-6 py-4">
                      <div className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-black text-[10px] uppercase tracking-widest",
                        row.overdueQueue > 0 ? "bg-rose-50 text-rose-600 border border-rose-100" : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                      )}>
                        {row.overdueQueue > 0 ? <Clock size={12} /> : <CheckCircle2 size={12} />}
                        {row.overdueQueue > 0 ? `${row.overdueQueue} Overdue` : "On Track"}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-700">{numberFormatter.format(row.reminders7d)}</td>
                    <td className="px-6 py-4 font-bold text-slate-700">{numberFormatter.format(row.assignments)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </GlassCard>

      <div className="grid gap-6 md:grid-cols-4">
        <Link href="/bba/owners" className="group">
           <GlassCard interactive className="!p-4 flex items-center justify-between border-slate-100 bg-white/40">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    <Building2 size={18} />
                 </div>
                 <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Kelola Owner</p>
              </div>
              <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-600 transition-all" />
           </GlassCard>
        </Link>
        <Link href="/bba/branches" className="group">
           <GlassCard interactive className="!p-4 flex items-center justify-between border-slate-100 bg-white/40">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    <LayoutGrid size={18} />
                 </div>
                 <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Master Apotek</p>
              </div>
              <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-600 transition-all" />
           </GlassCard>
        </Link>
        <Link href="/bba/audit" className="group">
           <GlassCard interactive className="!p-4 flex items-center justify-between border-slate-100 bg-white/40">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    <CheckCircle2 size={18} />
                 </div>
                 <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Approval & Audit</p>
              </div>
              <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-600 transition-all" />
           </GlassCard>
        </Link>
        <Link href="/bba/export" className="group">
           <GlassCard interactive className="!p-4 flex items-center justify-between border-slate-100 bg-white/40">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    <Clock size={18} />
                 </div>
                 <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Pusat Unduhan</p>
              </div>
              <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-600 transition-all" />
           </GlassCard>
        </Link>
      </div>
    </AnimatedPage>
  );
}
