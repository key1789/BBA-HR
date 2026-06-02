import { AnimatedPage } from "@/components/shared/animated-page";
import { getOwnerPortalContext } from "@/app/owner/_lib/owner-portal-context";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
import {
  BBA_DASHBOARD_OMZET_STATUSES,
  monthBoundsKeys,
  parseSalesPeriod,
  getMonthsInRange,
  type SalesMonthlyPoint,
} from "@/lib/bba-dashboard-metrics";
import { Building2 } from "lucide-react";
import {
  OwnerDashboardClient,
  type OwnerPortfolioItem,
  type OwnerOpsData,
  type OwnerTrendData,
} from "./owner-dashboard-client";

const ADDON_LABELS: Record<string, string> = {
  payroll: "Payroll & Gaji",
  attendance: "Absensi",
  appraisal: "Penilaian Karyawan",
  product_focus: "Produk Fokus",
};

export default async function OwnerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    tenant?: string;
    tab?: string;
    sales_from?: string;
    sales_to?: string;
  }>;
}) {
  const params = await searchParams;
  const ctxResult = await getOwnerPortalContext({ tenant: params.tenant });

  if (!ctxResult.ok) {
    if (ctxResult.reason === "no_owner") {
      return (
        <AnimatedPage className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="h-16 w-16 text-slate-300 mb-4" />
          <h1 className="text-xl font-black text-slate-800 uppercase">Belum ada cabang</h1>
          <p className="text-slate-500 mt-2">Akun Anda belum ditugaskan sebagai owner apotek manapun.</p>
        </AnimatedPage>
      );
    }
    return <p className="text-sm text-slate-600">Halaman ini khusus owner.</p>;
  }

  const { data: ctx } = ctxResult;
  const { supabase, activeOwnerMembership, ownerMemberships } = ctx;
  const tenantId = activeOwnerMembership.tenantId;
  const isMultiBranch = ownerMemberships.length > 1;

  const activeTab = params.tab === "ops" ? "ops" : "trend";

  const reminderWindow = getOperationalReminderWindow();
  const todayDateKey = reminderWindow.dateKey;
  const todayParts = todayDateKey.split("-").map(Number);
  const todayYear = todayParts[0]!;
  const todayMonth = todayParts[1]!;

  const { salesFrom, salesTo } = parseSalesPeriod(
    params.sales_from, params.sales_to, todayYear, todayMonth,
  );

  // ── Always: portfolio (multi-branch) ──────────────────────────────────────
  let portfolio: OwnerPortfolioItem[] = [];

  if (isMultiBranch) {
    const allIds = ownerMemberships.map((m) => m.tenantId);
    const { startKey } = monthBoundsKeys(todayMonth, todayYear);
    const daysInMonth = new Date(todayYear, todayMonth, 0).getDate();
    const dStart = new Date(`${startKey}T12:00:00+07:00`).getTime();
    const dEnd = new Date(`${todayDateKey}T12:00:00+07:00`).getTime();
    const mtdDays = Math.max(1, Math.floor((dEnd - dStart) / 86400000) + 1);

    const [omzetRes, targetRes] = await Promise.all([
      supabase
        .from("daily_submissions")
        .select("tenant_apotek_id, omzet_total")
        .in("tenant_apotek_id", allIds)
        .in("status", [...BBA_DASHBOARD_OMZET_STATUSES])
        .gte("submission_date", startKey)
        .lte("submission_date", todayDateKey),
      supabase
        .from("kpi_configs")
        .select("tenant_apotek_id, target_omzet")
        .in("tenant_apotek_id", allIds)
        .eq("period_month", todayMonth)
        .eq("period_year", todayYear),
    ]);

    const omzetMap = new Map<string, number>();
    for (const row of (omzetRes.data ?? [])) {
      omzetMap.set(
        row.tenant_apotek_id,
        (omzetMap.get(row.tenant_apotek_id) ?? 0) + Number(row.omzet_total ?? 0),
      );
    }
    const targetMap = new Map(
      (targetRes.data ?? []).map((r) => [r.tenant_apotek_id, Number(r.target_omzet ?? 0)]),
    );

    portfolio = ownerMemberships
      .map((m) => {
        const omzet = omzetMap.get(m.tenantId) ?? 0;
        const target = targetMap.get(m.tenantId) ?? 0;
        const prorated = target * (mtdDays / Math.max(1, daysInMonth));
        const capaian = prorated > 0 ? Math.min(200, Math.round((omzet / prorated) * 100)) : 0;
        return {
          tenantId: m.tenantId,
          tenantCode: m.tenantCode,
          tenantName: m.tenantName,
          mtdOmzet: omzet,
          mtdCapaianPct: capaian,
          isActive: m.tenantId === tenantId,
        };
      })
      .sort((a, b) => b.mtdCapaianPct - a.mtdCapaianPct);
  }

  // ── Tab: Trend ────────────────────────────────────────────────────────────
  let trendData: OwnerTrendData | null = null;

  if (activeTab === "trend") {
    const salesMonths = getMonthsInRange(salesFrom, salesTo);

    if (salesMonths.length > 0) {
      const firstMonth = salesMonths[0]!;
      const lastMonth = salesMonths[salesMonths.length - 1]!;
      const salesStartKey = `${firstMonth.year}-${String(firstMonth.month).padStart(2, "0")}-01`;
      const salesEndKey = monthBoundsKeys(lastMonth.year, lastMonth.month).endKey;
      const salesYears = [...new Set(salesMonths.map((m) => m.year))];

      const [salesOmzetRes, salesTargetRes] = await Promise.all([
        supabase
          .from("daily_submissions")
          .select("submission_date, omzet_total, transaction_total, product_total")
          .eq("tenant_apotek_id", tenantId)
          .in("status", [...BBA_DASHBOARD_OMZET_STATUSES])
          .gte("submission_date", salesStartKey)
          .lte("submission_date", salesEndKey),
        supabase
          .from("kpi_configs")
          .select("period_month, period_year, target_omzet, target_atv, target_atu")
          .eq("tenant_apotek_id", tenantId)
          .in("period_year", salesYears),
      ]);

      type OmzetRow = { submission_date: string; omzet_total: number | null; transaction_total: number | null; product_total: number | null };
      type TargetRow = { period_month: number; period_year: number; target_omzet: number | null; target_atv: number | null; target_atu: number | null };

      const salesOmzetRows = (salesOmzetRes.data ?? []) as OmzetRow[];
      const salesTargetRows = (salesTargetRes.data ?? []) as TargetRow[];

      type Bucket = { omzet: number; transactions: number; products: number };
      const omzetBuckets = new Map<string, Bucket>();
      for (const row of salesOmzetRows) {
        const ym = (row.submission_date ?? "").slice(0, 7);
        if (!ym) continue;
        const cur = omzetBuckets.get(ym) ?? { omzet: 0, transactions: 0, products: 0 };
        cur.omzet += Number(row.omzet_total ?? 0);
        cur.transactions += Number(row.transaction_total ?? 0);
        cur.products += Number(row.product_total ?? 0);
        omzetBuckets.set(ym, cur);
      }

      const targetBuckets = new Map<string, { targetOmzet: number; targetAtv: number; targetAtu: number }>();
      for (const row of salesTargetRows) {
        if (!salesMonths.some((m) => m.year === row.period_year && m.month === row.period_month)) continue;
        const ym = `${row.period_year}-${String(row.period_month).padStart(2, "0")}`;
        targetBuckets.set(ym, {
          targetOmzet: Number(row.target_omzet ?? 0),
          targetAtv: Number(row.target_atv ?? 0),
          targetAtu: Number(row.target_atu ?? 0),
        });
      }

      const monthlyPoints: SalesMonthlyPoint[] = salesMonths.map(({ year, month, yearMonth }) => {
        const b = omzetBuckets.get(yearMonth) ?? { omzet: 0, transactions: 0, products: 0 };
        const t = targetBuckets.get(yearMonth) ?? { targetOmzet: 0, targetAtv: 0, targetAtu: 0 };
        const atv = b.transactions > 0 ? b.omzet / b.transactions : 0;
        const atu = b.transactions > 0 ? b.products / b.transactions : 0;
        const omzetCapaian = t.targetOmzet > 0 ? Math.min(999, Math.round((b.omzet / t.targetOmzet) * 100)) : 0;
        const atvCapaian = t.targetAtv > 0 ? Math.min(999, Math.round((atv / t.targetAtv) * 100)) : 0;
        const atuCapaian = t.targetAtu > 0 ? Math.min(999, Math.round((atu / t.targetAtu) * 100)) : 0;
        return { yearMonth, year, month, ...b, atv, atu, ...t, omzetCapaian, atvCapaian, atuCapaian };
      });

      const withCapaian = monthlyPoints.filter((p) => p.omzetCapaian > 0);
      const avgCapaianPct = withCapaian.length
        ? Math.round(withCapaian.reduce((s, p) => s + p.omzetCapaian, 0) / withCapaian.length)
        : 0;
      const totalOmzet = monthlyPoints.reduce((s, p) => s + p.omzet, 0);
      const withTrx = monthlyPoints.filter((p) => p.transactions > 0);
      const avgAtv = withTrx.length ? withTrx.reduce((s, p) => s + p.atv, 0) / withTrx.length : 0;
      const avgAtu = withTrx.length ? withTrx.reduce((s, p) => s + p.atu, 0) / withTrx.length : 0;

      trendData = {
        monthlyPoints,
        salesFrom,
        salesTo,
        avgCapaianPct,
        totalOmzet,
        avgAtv: Math.round(avgAtv),
        avgAtu: Math.round(avgAtu * 100) / 100,
      };
    }
  }

  // ── Tab: Ops ──────────────────────────────────────────────────────────────
  let opsData: OwnerOpsData | null = null;

  if (activeTab === "ops") {
    const [todaySubRes, openQueueRes, overdueQueueRes, leaveRes, swapRes, addonRes] =
      await Promise.all([
        supabase
          .from("daily_submissions")
          .select("status")
          .eq("tenant_apotek_id", tenantId)
          .eq("submission_date", todayDateKey),
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
        supabase
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("tenant_apotek_id", tenantId)
          .eq("status", "pending"),
        supabase
          .from("shift_swap_requests")
          .select("id", { count: "exact", head: true })
          .eq("tenant_apotek_id", tenantId)
          .in("status", ["pending_crew", "pending_admin"]),
        supabase
          .from("addon_settings")
          .select("addon_key")
          .eq("tenant_apotek_id", tenantId)
          .eq("is_enabled", true),
      ]);

    const todaySubs = (todaySubRes.data ?? []) as { status: string }[];
    const hasVerified = todaySubs.some((s) =>
      (BBA_DASHBOARD_OMZET_STATUSES as readonly string[]).includes(s.status),
    );
    const hasPending = todaySubs.some(
      (s) => !(BBA_DASHBOARD_OMZET_STATUSES as readonly string[]).includes(s.status),
    );
    const todayStatus: "verified" | "pending" | "none" = hasVerified
      ? "verified"
      : hasPending
        ? "pending"
        : "none";

    const activeAddons = (addonRes.data ?? []).map((r) => ({
      key: r.addon_key as string,
      label: ADDON_LABELS[r.addon_key] ?? r.addon_key,
    }));

    opsData = {
      todayStatus,
      openQueue: openQueueRes.count ?? 0,
      overdueQueue: overdueQueueRes.count ?? 0,
      pendingLeave: leaveRes.count ?? 0,
      pendingSwap: swapRes.count ?? 0,
      activeAddons,
      todayDateKey,
      timezoneLabel: reminderWindow.timezoneLabel,
    };
  }

  return (
    <AnimatedPage>
      <OwnerDashboardClient
        activeTab={activeTab}
        portfolio={portfolio}
        trendData={trendData}
        opsData={opsData}
        currentTenant={tenantId}
        salesFrom={salesFrom}
        salesTo={salesTo}
        isMultiBranch={isMultiBranch}
      />
    </AnimatedPage>
  );
}
