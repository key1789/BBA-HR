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
  clampViewMonthYear,
  computeDashboardKpis,
  computeSalesTrend,
  getMonthsInRange,
  monthBoundsKeys,
  parseDashboardTab,
  parseSalesPeriod,
  type BbaDashboardTab,
  type SalesBranchSummary,
  type SalesMonthlyPoint,
} from "@/lib/bba-dashboard-metrics";
import {
  Activity,
  AlertTriangle,
  Building2,
  CalendarOff,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  LayoutGrid,
  TrendingUp,
  Users,
  Bell,
  ArrowLeftRight,
  FileCheck,
} from "lucide-react";
import { BbaDashboardTenantSelect } from "./bba-dashboard-tenant-select";
import { BbaDashboardBranchMatrix, type BranchHealthRow } from "./bba-dashboard-branch-matrix";
import { BbaDashboardSalesContent } from "./bba-dashboard-sales-content";

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
  tenant_apotek_id: string;
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

type TodaySubmissionRow = {
  tenant_apotek_id: string;
  status: string;
};

type PendingApprovalRow = {
  tenant_apotek_id: string;
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
  searchParams: Promise<{
    tenant?: string;
    month?: string;
    year?: string;
    tab?: string;
    sales_from?: string;
    sales_to?: string;
  }>;
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
    .eq("is_trial", false)
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

  // Parse sales period (only used when tab=sales)
  const { salesFrom, salesTo } = parseSalesPeriod(
    params.sales_from,
    params.sales_to,
    todayYear,
    todayMonth,
  );

  // Overview and Sales both default to showing all branches when no tenant is explicitly selected
  const isOverviewNoTenant = tab === "overview" && !params.tenant;
  const isSalesNoTenant = tab === "sales" && !params.tenant;
  const selectedTenantId =
    isOverviewNoTenant || isSalesNoTenant || params.tenant === "all"
      ? null
      : (params.tenant ?? tenants[0]?.id ?? null);
  const scopedTenantIds =
    !selectedTenantId ? tenants.map((t) => t.id) : [selectedTenantId];
  const tenantQueryForLinks: string =
    isOverviewNoTenant || isSalesNoTenant || params.tenant === "all"
      ? "all"
      : (params.tenant ?? selectedTenantId ?? tenants[0]!.id);

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
    { data: todaySubmissionsData },
    pendingLeaveResult,
    pendingSwapResult,
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
        "tenant_apotek_id, submission_date, omzet_total, transaction_total, product_total, rejected_customer_total, user_id, user:user_id(full_name)",
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
    // Today's submission status per branch
    supabase
      .from("daily_submissions")
      .select("tenant_apotek_id, status")
      .in("tenant_apotek_id", scopedTenantIds)
      .eq("submission_date", reminderWindow.dateKey),
    // Pending leave requests
    supabase
      .from("leave_requests")
      .select("tenant_apotek_id")
      .in("tenant_apotek_id", scopedTenantIds)
      .eq("status", "pending"),
    // Pending shift swap requests
    supabase
      .from("shift_swap_requests")
      .select("tenant_apotek_id")
      .in("tenant_apotek_id", scopedTenantIds)
      .in("status", ["pending_crew", "pending_admin"]),
  ]);

  const reminderLogs = (reminderRows ?? []) as ReminderLogRow[];
  const omzetRows = (omzetRowsData ?? []) as OmzetSubmissionRow[];
  const targetRows = (targetRowsData ?? []) as KpiConfigRow[];
  const publishedAppraisalRows =
    publishedAppraisalResult.error?.code === "42P01"
      ? []
      : ((publishedAppraisalResult.data ?? []) as { crew_user_id: string }[]);
  const todaySubmissions = (todaySubmissionsData ?? []) as TodaySubmissionRow[];
  const pendingLeaveRows =
    pendingLeaveResult.error?.code === "42P01"
      ? []
      : ((pendingLeaveResult.data ?? []) as PendingApprovalRow[]);
  const pendingSwapRows =
    pendingSwapResult.error?.code === "42P01"
      ? []
      : ((pendingSwapResult.data ?? []) as PendingApprovalRow[]);

  const assignmentMap = new Map(assignmentStats);
  const queueMap = new Map(perTenantQueue);

  // ── Reminder aggregation ──
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

  // ── Per-branch queue + reminder rows ──
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

  // ── Sales KPIs ──
  const kpis = computeDashboardKpis(omzetRows);

  const daysInMonth = new Date(year, month, 0).getDate();
  const targetOmzetFull = targetRows.reduce((s, r) => s + Number(r.target_omzet ?? 0), 0);
  const dStart = new Date(`${startKey}T12:00:00+07:00`).getTime();
  const dEnd = new Date(`${periodEnd}T12:00:00+07:00`).getTime();
  const mtdDays = Math.max(1, Math.floor((dEnd - dStart) / 86400000) + 1);
  const proratedTargetOmzet = targetOmzetFull * (mtdDays / Math.max(1, daysInMonth));
  const capaianPct =
    proratedTargetOmzet > 0 ? Math.min(200, Math.round((kpis.omzet / proratedTargetOmzet) * 100)) : 0;

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

  // ── Per-branch omzet (for Overview matrix + Sales branch table) ──
  const omzetByTenant = new Map<string, number>();
  for (const row of omzetRows) {
    omzetByTenant.set(
      row.tenant_apotek_id,
      (omzetByTenant.get(row.tenant_apotek_id) ?? 0) + Number(row.omzet_total ?? 0),
    );
  }
  const targetByTenant = new Map(targetRows.map((r) => [r.tenant_apotek_id, Number(r.target_omzet ?? 0)]));

  function branchMtdPct(tenantId: string): number {
    const omzet = omzetByTenant.get(tenantId) ?? 0;
    const targetFull = targetByTenant.get(tenantId) ?? 0;
    if (targetFull <= 0) return 0;
    const prorated = targetFull * (mtdDays / Math.max(1, daysInMonth));
    return Math.min(999, Math.round((omzet / prorated) * 100));
  }

  // ── Today's submission status per branch ──
  const todayStatusMap = new Map<string, "verified" | "pending" | "none">();
  for (const id of scopedTenantIds) todayStatusMap.set(id, "none");
  for (const row of todaySubmissions) {
    const cur = todayStatusMap.get(row.tenant_apotek_id);
    if (cur === "verified") continue;
    if (BBA_DASHBOARD_OMZET_STATUSES.includes(row.status as (typeof BBA_DASHBOARD_OMZET_STATUSES)[number])) {
      todayStatusMap.set(row.tenant_apotek_id, "verified");
    } else {
      todayStatusMap.set(row.tenant_apotek_id, "pending");
    }
  }

  // ── Pending approvals per branch ──
  const pendingLeaveMap = new Map<string, number>();
  for (const row of pendingLeaveRows) {
    pendingLeaveMap.set(row.tenant_apotek_id, (pendingLeaveMap.get(row.tenant_apotek_id) ?? 0) + 1);
  }
  const pendingSwapMap = new Map<string, number>();
  for (const row of pendingSwapRows) {
    pendingSwapMap.set(row.tenant_apotek_id, (pendingSwapMap.get(row.tenant_apotek_id) ?? 0) + 1);
  }

  // ── Branch Health Matrix rows ──
  const branchHealthRows: BranchHealthRow[] = tenantRows.map((row) => ({
    tenantId: row.tenantId,
    tenantCode: row.tenantCode,
    tenantName: row.tenantName,
    todayStatus: todayStatusMap.get(row.tenantId) ?? "none",
    mtdPct: branchMtdPct(row.tenantId),
    openQueue: row.openQueue,
    overdueQueue: row.overdueQueue,
    pendingLeave: pendingLeaveMap.get(row.tenantId) ?? 0,
    pendingSwap: pendingSwapMap.get(row.tenantId) ?? 0,
    detailHref: `/bba/audit?tenant=${row.tenantId}&month=${month}&year=${year}`,
  }));

  // ── Overview KPIs ──
  const laporedCount = branchHealthRows.filter((r) => r.todayStatus !== "none").length;
  const totalBranches = branchHealthRows.length;
  const perluPerhatianCount = branchHealthRows.filter(
    (r) => r.overdueQueue > 0 || r.todayStatus === "none",
  ).length;
  const totalPendingApprovals = pendingLeaveRows.length + pendingSwapRows.length;

  // ── Sales multi-month data (only fetched when tab=sales) ──
  let salesBranchSummaries: SalesBranchSummary[] = [];

  if (tab === "sales") {
    const salesMonths = getMonthsInRange(salesFrom, salesTo);
    if (salesMonths.length > 0) {
      const firstMonth = salesMonths[0]!;
      const lastMonth = salesMonths[salesMonths.length - 1]!;
      const salesStartKey = `${firstMonth.year}-${String(firstMonth.month).padStart(2, "0")}-01`;
      const salesEndKey = monthBoundsKeys(lastMonth.year, lastMonth.month).endKey;
      const salesYears = [...new Set(salesMonths.map((m) => m.year))];

      const [salesOmzetResult, salesTargetResult] = await Promise.all([
        supabase
          .from("daily_submissions")
          .select("tenant_apotek_id, submission_date, omzet_total, transaction_total, product_total")
          .in("tenant_apotek_id", scopedTenantIds)
          .in("status", [...BBA_DASHBOARD_OMZET_STATUSES])
          .gte("submission_date", salesStartKey)
          .lte("submission_date", salesEndKey),
        supabase
          .from("kpi_configs")
          .select("tenant_apotek_id, period_month, period_year, target_omzet, target_atv, target_atu")
          .in("tenant_apotek_id", scopedTenantIds)
          .in("period_year", salesYears),
      ]);

      type SalesOmzetRow = {
        tenant_apotek_id: string;
        submission_date: string;
        omzet_total: number | null;
        transaction_total: number | null;
        product_total: number | null;
      };
      type SalesTargetRow = {
        tenant_apotek_id: string;
        period_month: number;
        period_year: number;
        target_omzet: number | null;
        target_atv: number | null;
        target_atu: number | null;
      };

      const salesOmzetRows = (salesOmzetResult.data ?? []) as SalesOmzetRow[];
      const salesTargetRows = (salesTargetResult.data ?? []) as SalesTargetRow[];

      // Group omzet by (tenantId, yearMonth)
      type MonthBucket = { omzet: number; transactions: number; products: number };
      const omzetBuckets = new Map<string, Map<string, MonthBucket>>();
      for (const row of salesOmzetRows) {
        const ym = (row.submission_date ?? "").slice(0, 7);
        if (!ym) continue;
        if (!omzetBuckets.has(row.tenant_apotek_id)) omzetBuckets.set(row.tenant_apotek_id, new Map());
        const bm = omzetBuckets.get(row.tenant_apotek_id)!;
        const cur = bm.get(ym) ?? { omzet: 0, transactions: 0, products: 0 };
        cur.omzet += Number(row.omzet_total ?? 0);
        cur.transactions += Number(row.transaction_total ?? 0);
        cur.products += Number(row.product_total ?? 0);
        bm.set(ym, cur);
      }

      // Group targets by (tenantId, yearMonth)
      type TargetBucket = { targetOmzet: number; targetAtv: number; targetAtu: number };
      const targetBuckets = new Map<string, Map<string, TargetBucket>>();
      for (const row of salesTargetRows) {
        // Only include months in our range
        if (!salesMonths.some((m) => m.year === row.period_year && m.month === row.period_month)) continue;
        const ym = `${row.period_year}-${String(row.period_month).padStart(2, "0")}`;
        if (!targetBuckets.has(row.tenant_apotek_id)) targetBuckets.set(row.tenant_apotek_id, new Map());
        targetBuckets.get(row.tenant_apotek_id)!.set(ym, {
          targetOmzet: Number(row.target_omzet ?? 0),
          targetAtv: Number(row.target_atv ?? 0),
          targetAtu: Number(row.target_atu ?? 0),
        });
      }

      // Build SalesBranchSummary for each tenant
      for (const tenantId of scopedTenantIds) {
        const tenant = tenants.find((t) => t.id === tenantId);
        if (!tenant) continue;

        const monthlyData: SalesMonthlyPoint[] = salesMonths.map(({ year, month, yearMonth }) => {
          const bucket = omzetBuckets.get(tenantId)?.get(yearMonth) ?? { omzet: 0, transactions: 0, products: 0 };
          const tgt = targetBuckets.get(tenantId)?.get(yearMonth) ?? { targetOmzet: 0, targetAtv: 0, targetAtu: 0 };
          const atv = bucket.transactions > 0 ? bucket.omzet / bucket.transactions : 0;
          const atu = bucket.transactions > 0 ? bucket.products / bucket.transactions : 0;
          const omzetCapaian =
            tgt.targetOmzet > 0 ? Math.min(999, Math.round((bucket.omzet / tgt.targetOmzet) * 100)) : 0;
          const atvCapaian =
            tgt.targetAtv > 0 ? Math.min(999, Math.round((atv / tgt.targetAtv) * 100)) : 0;
          const atuCapaian =
            tgt.targetAtu > 0 ? Math.min(999, Math.round((atu / tgt.targetAtu) * 100)) : 0;
          return { yearMonth, year, month, ...bucket, atv, atu, ...tgt, omzetCapaian, atvCapaian, atuCapaian };
        });

        const withData = monthlyData.filter((p) => p.omzet > 0);
        const totalOmzet = withData.reduce((s, p) => s + p.omzet, 0);
        const withCapaian = monthlyData.filter((p) => p.omzetCapaian > 0);
        const avgOmzetCapaian =
          withCapaian.length > 0
            ? withCapaian.reduce((s, p) => s + p.omzetCapaian, 0) / withCapaian.length
            : 0;

        salesBranchSummaries.push({
          tenantId,
          tenantCode: tenant.code,
          tenantName: tenant.name,
          avgOmzetCapaian: Math.round(avgOmzetCapaian),
          totalOmzet,
          trend: computeSalesTrend(monthlyData),
          monthlyData,
        });
      }
    }
  }

  const tenantOpts = tenants.map((t) => ({ id: t.id, code: t.code, name: t.name }));
  const effectiveTenantId =
    isOverviewNoTenant || isSalesNoTenant
      ? "all"
      : (params.tenant === "all" ? "all" : (params.tenant ?? selectedTenantId ?? tenants[0]!.id));

  return (
    <AnimatedPage className="space-y-5 pb-10">
      {/* ── Header ── */}
      <GlassCard className="p-4 sm:p-5" variant="light">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-sky-600/25">
              <Activity size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase leading-tight">
                Dashboard BBA
              </h1>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {reminderWindow.dateKey}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:block">
              {periodLabel}
            </span>
            <div className="flex rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <Link
                href={dashboardHref({
                  tenant: tenantQueryForLinks,
                  month: prevPeriod.month,
                  year: prevPeriod.year,
                  tab,
                })}
                className="p-1.5 hover:bg-slate-50 text-slate-500 transition-colors"
                aria-label="Bulan sebelumnya"
              >
                <ChevronLeft size={16} />
              </Link>
              <span className="px-3 flex items-center text-[11px] font-black text-slate-700 border-x border-slate-100">
                {periodLabel}
              </span>
              <Link
                href={dashboardHref({
                  tenant: tenantQueryForLinks,
                  month: nextPeriod.month,
                  year: nextPeriod.year,
                  tab,
                })}
                className="p-1.5 hover:bg-slate-50 text-slate-500 transition-colors"
                aria-label="Bulan berikutnya"
              >
                <ChevronRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* ── Filter strip ── */}
      <Suspense fallback={<div className="h-12 rounded-2xl bg-slate-100 animate-pulse" />}>
        <BbaDashboardTenantSelect
          tenants={tenantOpts}
          tenantId={effectiveTenantId}
          month={month}
          year={year}
          tab={tab}
        />
      </Suspense>

      {/* ══════════════════════════════════════════════════════════ */}
      {/*  TAB: OVERVIEW                                            */}
      {/* ══════════════════════════════════════════════════════════ */}
      {tab === "overview" ? (
        <>
          {/* ── 4 KPI alert cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Lapor hari ini */}
            <GlassCard interactive className="group !py-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-all shrink-0">
                  <FileCheck size={14} />
                </div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-tight">
                  Lapor hari ini
                </p>
              </div>
              <p className="text-2xl font-black text-slate-900 tracking-tight">
                {laporedCount}
                <span className="text-sm font-bold text-slate-400">/{totalBranches}</span>
              </p>
              <p className="text-[9px] font-bold text-slate-400 mt-1">
                {totalBranches - laporedCount > 0 ? (
                  <span className="text-rose-500">{totalBranches - laporedCount} belum lapor</span>
                ) : (
                  <span className="text-emerald-600">Semua sudah lapor ✓</span>
                )}
              </p>
            </GlassCard>

            {/* MTD capaian */}
            <GlassCard interactive className="group !py-4">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0",
                    capaianPct >= 100
                      ? "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white"
                      : capaianPct >= 75
                        ? "bg-sky-50 text-sky-600 group-hover:bg-sky-600 group-hover:text-white"
                        : "bg-amber-50 text-amber-600 group-hover:bg-amber-500 group-hover:text-white",
                  )}
                >
                  <TrendingUp size={14} />
                </div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-tight">
                  MTD capaian
                </p>
              </div>
              <p
                className={cn(
                  "text-2xl font-black tracking-tight",
                  capaianPct >= 100
                    ? "text-emerald-600"
                    : capaianPct >= 75
                      ? "text-sky-600"
                      : "text-amber-600",
                )}
              >
                {capaianPct}%
              </p>
              <p className="text-[9px] font-bold text-slate-400 mt-1">{mtdDays} hari data</p>
            </GlassCard>

            {/* Verifikasi queue */}
            <GlassCard interactive className="group !py-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-slate-800 group-hover:text-white transition-all shrink-0">
                  <Clock size={14} />
                </div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-tight">
                  Verifikasi queue
                </p>
              </div>
              <p className="text-2xl font-black text-slate-900 tracking-tight">
                {numberFormatter.format(totals.openQueue)}
              </p>
              {totals.overdueQueue > 0 && (
                <p className="text-[9px] font-bold text-rose-500 mt-1">
                  {numberFormatter.format(totals.overdueQueue)} overdue
                </p>
              )}
            </GlassCard>

            {/* Perlu perhatian */}
            <GlassCard interactive className="group !py-4">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0",
                    perluPerhatianCount > 0
                      ? "bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white"
                      : "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white",
                  )}
                >
                  <AlertTriangle size={14} />
                </div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-tight">
                  Perlu perhatian
                </p>
              </div>
              <p
                className={cn(
                  "text-2xl font-black tracking-tight",
                  perluPerhatianCount > 0 ? "text-rose-600" : "text-emerald-600",
                )}
              >
                {perluPerhatianCount}
              </p>
              <p className="text-[9px] font-bold text-slate-400 mt-1">
                {totalPendingApprovals > 0 && (
                  <span className="text-amber-500">{totalPendingApprovals} pending approval · </span>
                )}
                cabang bermasalah
              </p>
            </GlassCard>
          </div>

          {/* ── Branch Health Matrix ── */}
          <GlassCard className="!p-0 overflow-hidden border-slate-100/50">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <LayoutGrid size={14} className="text-sky-600" />
                <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                  Branch Health Matrix
                </h2>
                <span className="px-2 py-0.5 bg-sky-100 text-sky-700 rounded text-[9px] font-black uppercase">
                  {totalBranches} cabang
                </span>
              </div>
              <div className="flex items-center gap-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  Lapor
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  Pending
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
                  Belum
                </span>
              </div>
            </div>
            <div className="p-4">
              <BbaDashboardBranchMatrix rows={branchHealthRows} />
            </div>
          </GlassCard>
        </>
      ) : tab === "sales" ? (
        /* ══════════════════════════════════════════════════════════ */
        /*  TAB: PENJUALAN (multi-month, branch comparison)          */
        /* ══════════════════════════════════════════════════════════ */
        <BbaDashboardSalesContent
          branches={salesBranchSummaries}
          selectedTenantId={selectedTenantId}
          salesFrom={salesFrom}
          salesTo={salesTo}
          currentTenant={effectiveTenantId}
        />
      ) : (
        /* ══════════════════════════════════════════════════════════ */
        /*  TAB: OPERASIONAL                                         */
        /* ══════════════════════════════════════════════════════════ */
        <>
          {/* ── 4-stat strip ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <GlassCard interactive className="group !py-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-slate-800 group-hover:text-white transition-all shrink-0">
                  <Clock size={14} />
                </div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Open queue</p>
              </div>
              <p className="text-2xl font-black text-slate-900 tracking-tight">
                {numberFormatter.format(totals.openQueue)}
              </p>
            </GlassCard>

            <GlassCard interactive className="group !py-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-rose-50 flex items-center justify-center text-rose-500 group-hover:bg-rose-600 group-hover:text-white transition-all shrink-0">
                  <AlertTriangle size={14} />
                </div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Overdue</p>
              </div>
              <p className="text-2xl font-black text-rose-600 tracking-tight">
                {numberFormatter.format(totals.overdueQueue)}
              </p>
            </GlassCard>

            <GlassCard interactive className="group !py-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-all shrink-0">
                  <Bell size={14} />
                </div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Reminder 7h</p>
              </div>
              <p className="text-2xl font-black text-slate-900 tracking-tight">
                {numberFormatter.format(totals.reminders7d)}
              </p>
            </GlassCard>

            <GlassCard interactive className="group !py-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-sky-50 flex items-center justify-center text-sky-600 group-hover:bg-sky-600 group-hover:text-white transition-all shrink-0">
                  <Users size={14} />
                </div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Assignment</p>
              </div>
              <p className="text-2xl font-black text-slate-900 tracking-tight">
                {numberFormatter.format(totals.assignments)}
              </p>
            </GlassCard>
          </div>

          {/* ── Pending Approvals ── */}
          {totalPendingApprovals > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <GlassCard className="border-amber-100/60">
                <div className="flex items-center gap-2 mb-3">
                  <CalendarOff size={14} className="text-amber-600 shrink-0" />
                  <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                    Pengajuan Izin Pending
                  </h2>
                </div>
                <p className="text-3xl font-black text-amber-600">{pendingLeaveRows.length}</p>
                <p className="text-[10px] font-bold text-slate-400 mt-1">
                  Menunggu persetujuan admin
                </p>
                {pendingLeaveRows.length > 0 && (
                  <Link
                    href="/admin/absensi"
                    className="mt-2 inline-block text-[10px] font-black uppercase tracking-widest text-sky-600 hover:underline"
                  >
                    Kelola →
                  </Link>
                )}
              </GlassCard>

              <GlassCard className="border-sky-100/60">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowLeftRight size={14} className="text-sky-600 shrink-0" />
                  <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                    Tukar Shift Pending
                  </h2>
                </div>
                <p className="text-3xl font-black text-sky-600">{pendingSwapRows.length}</p>
                <p className="text-[10px] font-bold text-slate-400 mt-1">
                  Menunggu persetujuan
                </p>
                {pendingSwapRows.length > 0 && (
                  <Link
                    href="/admin/absensi"
                    className="mt-2 inline-block text-[10px] font-black uppercase tracking-widest text-sky-600 hover:underline"
                  >
                    Kelola →
                  </Link>
                )}
              </GlassCard>
            </div>
          )}

          {/* ── Publish progress + Priority branches ── */}
          <div className="grid gap-4 lg:grid-cols-3">
            <GlassCard className="border-slate-100/50">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={14} className="text-sky-600 shrink-0" />
                <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                  Kesiapan insentif
                </h2>
              </div>
              <div className="flex justify-between items-end mb-2">
                <p className="text-3xl font-black text-slate-900">{publishProgressPercent}%</p>
                <p className="text-[10px] font-bold text-sky-600">
                  {numberFormatter.format(publishedCrewCount)}/{numberFormatter.format(totalCrewCount ?? 0)} crew
                </p>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky-600 transition-all"
                  style={{ width: `${publishProgressPercent}%` }}
                />
              </div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-2">{periodLabel}</p>
            </GlassCard>

            {priorityBranches.length > 0 && (
              <GlassCard className="lg:col-span-2">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 size={14} className="text-sky-600 shrink-0" />
                  <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                    Cabang prioritas
                  </h2>
                </div>
                <ul className="divide-y divide-slate-100">
                  {priorityBranches.map((row) => (
                    <li
                      key={row.tenantId}
                      className="py-2 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div>
                        <p className="text-xs font-black text-slate-800">{row.tenantCode}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">{row.tenantName}</p>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-[10px] font-bold text-slate-500">
                          Open{" "}
                          <span className="text-slate-800 font-black">
                            {numberFormatter.format(row.openQueue)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "text-[10px] font-bold",
                            row.overdueQueue > 0 ? "text-rose-600" : "text-emerald-600",
                          )}
                        >
                          Overdue{" "}
                          <span className="font-black">{numberFormatter.format(row.overdueQueue)}</span>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </GlassCard>
            )}
          </div>

          {/* ── Full ops table ── */}
          <GlassCard className="!p-0 overflow-hidden border-slate-100/50">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <Building2 size={14} className="text-sky-600" />
                Ringkasan operasional per cabang
              </h2>
              <Link
                href={auditHrefThisPeriod}
                className="text-[10px] font-black uppercase tracking-widest text-sky-600 hover:underline"
              >
                Buka audit →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <tr>
                    <th className="px-5 py-3">Cabang</th>
                    <th className="px-5 py-3">Antrean</th>
                    <th className="px-5 py-3">Overdue</th>
                    <th className="px-5 py-3">Reminder 7h</th>
                    <th className="px-5 py-3">Assignment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tenantRows.map((row) => (
                    <tr key={row.tenantId} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-xs font-black text-slate-800">{row.tenantCode}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">{row.tenantName}</p>
                      </td>
                      <td className="px-5 py-3 text-xs font-bold text-slate-700 tabular-nums">
                        {numberFormatter.format(row.openQueue)}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            "text-xs font-black tabular-nums",
                            row.overdueQueue > 0 ? "text-rose-600" : "text-emerald-600",
                          )}
                        >
                          {numberFormatter.format(row.overdueQueue)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs font-bold text-slate-700 tabular-nums">
                        {numberFormatter.format(row.reminders7d)}
                      </td>
                      <td className="px-5 py-3 text-xs font-bold text-slate-700 tabular-nums">
                        {numberFormatter.format(row.assignments)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </>
      )}
    </AnimatedPage>
  );
}
