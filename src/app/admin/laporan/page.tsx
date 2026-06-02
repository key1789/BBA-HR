import { Card } from "@/components/shared/card";
import { Input } from "@/components/shared/input";
import { PageHeader } from "@/components/shared/page-header";
import { ReportMetricsGrid } from "@/components/reports/report-metrics-grid";
import { HelpDrawer } from "@/components/shared/help-drawer";
import { getSessionContext } from "@/lib/auth-context";
import { getReportMetricsForTenant } from "@/lib/report-metrics";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ChevronDown, Target } from "lucide-react";
import { LAPORAN_HELP } from "./help-content";
import { cn } from "@/lib/utils";

const IDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("id-ID");

const AUDIT_STATUS_LABEL: Record<string, string> = {
  DRAFT:        "Draft",
  UNDER_REVIEW: "Under Review",
  APPROVED:     "Disetujui BBA",
};

type CrewRow = {
  userId: string;
  name: string;
  omzet: number;
  trx: number;
  prod: number;
  rejected: number;
  atv: number;
  atu: number;
  projectedLost: number;
};

type DayRow = {
  date: string;
  rejected: number;
  atv: number;
  projectedLost: number;
};

function fmtShortDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

function fmtFullDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function AdminLaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "admin_apotek") {
    return <p className="text-sm text-slate-600">Akses laporan admin tidak tersedia.</p>;
  }

  // Compute effective range (mirrors logic in getReportMetricsForTenant)
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const defaultTo   = now.toISOString().slice(0, 10);
  const effectiveFrom = params.from && params.from <= defaultTo ? params.from : defaultFrom;
  const effectiveTo   = params.to   && params.to   >= effectiveFrom ? params.to : defaultTo;

  // Current-month constants (for KPI section — always bulan berjalan)
  const currentMonth      = now.getMonth() + 1;
  const currentYear       = now.getFullYear();
  const currentMonthLabel = now.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  const currentMonthStart = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
  const currentMonthToday = now.toISOString().slice(0, 10);
  const totalDaysInMonth  = new Date(currentYear, currentMonth, 0).getDate();
  const dayOfMonth        = now.getDate();

  const supabase = await createClient();

  // All queries in parallel (including KPI & audit data)
  const [metrics, submissionsResult, kpiResult, auditResult, appraisalRows, mtdRows] = await Promise.all([
    getReportMetricsForTenant(active.tenantId, { from: params.from, to: params.to }),
    supabase
      .from("daily_submissions")
      .select("user_id, submission_date, omzet_total, transaction_total, product_total, rejected_customer_total, app_user:user_id(full_name)")
      .eq("tenant_apotek_id", active.tenantId)
      .in("status", ["approved", "edited_by_admin"])
      .gte("submission_date", effectiveFrom)
      .lte("submission_date", effectiveTo),
    // KPI target bulan berjalan
    supabase
      .from("kpi_configs")
      .select("target_omzet")
      .eq("tenant_apotek_id", active.tenantId)
      .eq("period_month", currentMonth)
      .eq("period_year", currentYear)
      .maybeSingle(),
    // Status audit BBA bulan berjalan
    supabase
      .from("monthly_audits")
      .select("status")
      .eq("tenant_apotek_id", active.tenantId)
      .eq("period_month", currentMonth)
      .eq("period_year", currentYear)
      .maybeSingle(),
    // Status publish rapor bulan berjalan
    supabase
      .from("monthly_appraisals")
      .select("is_published")
      .eq("tenant_apotek_id", active.tenantId)
      .eq("period_month", currentMonth)
      .eq("period_year", currentYear),
    // Omzet MTD bulan berjalan (untuk KPI, terpisah dari filter range)
    supabase
      .from("daily_submissions")
      .select("omzet_total")
      .eq("tenant_apotek_id", active.tenantId)
      .in("status", ["approved", "edited_by_admin"])
      .gte("submission_date", currentMonthStart)
      .lte("submission_date", currentMonthToday),
  ]);

  // ── KPI computed values ───────────────────────────────────────────────────
  const targetOmzet    = Number(kpiResult.data?.target_omzet ?? 0);
  const auditStatus    = auditResult.data?.status ?? null;
  const isPublished    =
    (appraisalRows.data ?? []).length > 0 &&
    (appraisalRows.data ?? []).every((r: { is_published: unknown }) => Boolean(r.is_published));
  const mtdOmzet       = (mtdRows.data ?? []).reduce(
    (s: number, r: { omzet_total: unknown }) => s + Number(r.omzet_total ?? 0), 0,
  );
  const avgDailyMtd    = dayOfMonth > 0 ? mtdOmzet / dayOfMonth : 0;
  const projectedOmzet = avgDailyMtd * totalDaysInMonth;
  const achievementPct = targetOmzet > 0 ? (mtdOmzet / targetOmzet) * 100 : 0;
  const projectedPct   = targetOmzet > 0 ? (projectedOmzet / targetOmzet) * 100 : 0;

  // ── Per-karyawan aggregation ──
  const byUser = new Map<string, { name: string; omzet: number; trx: number; prod: number; rejected: number }>();
  for (const row of (submissionsResult.data ?? []) as any[]) {
    const uid  = String(row.user_id);
    const name = (Array.isArray(row.app_user) ? row.app_user[0]?.full_name : row.app_user?.full_name) ?? "—";
    const cur  = byUser.get(uid) ?? { name, omzet: 0, trx: 0, prod: 0, rejected: 0 };
    cur.omzet    += Number(row.omzet_total            ?? 0);
    cur.trx      += Number(row.transaction_total      ?? 0);
    cur.prod     += Number(row.product_total          ?? 0);
    cur.rejected += Number(row.rejected_customer_total ?? 0);
    byUser.set(uid, cur);
  }

  const crewRows: CrewRow[] = Array.from(byUser.entries())
    .map(([userId, v]) => {
      const atv          = v.trx > 0 ? v.omzet / v.trx : 0;
      const atu          = v.trx > 0 ? v.prod  / v.trx : 0;
      const projectedLost = v.rejected * atv;
      return { userId, name: v.name, omzet: v.omzet, trx: v.trx, prod: v.prod, rejected: v.rejected, atv, atu, projectedLost };
    })
    .sort((a, b) => b.omzet - a.omzet);

  // ── Per-hari penolakan aggregation ──
  const byDate = new Map<string, { omzet: number; trx: number; rejected: number }>();
  for (const row of (submissionsResult.data ?? []) as any[]) {
    const d   = String(row.submission_date).slice(0, 10);
    const cur = byDate.get(d) ?? { omzet: 0, trx: 0, rejected: 0 };
    cur.omzet    += Number(row.omzet_total            ?? 0);
    cur.trx      += Number(row.transaction_total      ?? 0);
    cur.rejected += Number(row.rejected_customer_total ?? 0);
    byDate.set(d, cur);
  }

  const dayRows: DayRow[] = Array.from(byDate.entries())
    .filter(([, v]) => v.rejected > 0)
    .map(([date, v]) => {
      const atv           = v.trx > 0 ? v.omzet / v.trx : 0;
      const projectedLost = v.rejected * atv;
      return { date, rejected: v.rejected, atv, projectedLost };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const hasCustomRange = Boolean(params.from || params.to);
  const sevenDaysAgo   = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const fmt            = (d: Date) => d.toISOString().slice(0, 10);
  const quickLast7     = `/admin/laporan?from=${fmt(sevenDaysAgo)}&to=${fmt(now)}`;
  const monthStart     = new Date(now.getFullYear(), now.getMonth(), 1);
  const quickThisMonth = `/admin/laporan?from=${fmt(monthStart)}&to=${fmt(now)}`;

  const totalOmzet        = crewRows.reduce((s, r) => s + r.omzet, 0);
  const totalTrx          = crewRows.reduce((s, r) => s + r.trx, 0);
  const totalProd         = crewRows.reduce((s, r) => s + r.prod, 0);
  const totalRejected     = crewRows.reduce((s, r) => s + r.rejected, 0);
  const totalProjectedLost = crewRows.reduce((s, r) => s + r.projectedLost, 0);
  const totalDayRejected  = dayRows.reduce((s, d) => s + d.rejected, 0);
  const totalDayLost      = dayRows.reduce((s, d) => s + d.projectedLost, 0);

  return (
    <section className="space-y-6">
      <PageHeader title="Laporan" subtitle="Analisis omzet, KPI, dan performa tim" />

      {/* ── Filter — collapsible ─────────────────────────────────────── */}
      <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 select-none">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-700">Filter Range</span>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[9px] font-black text-indigo-600">
              {fmtShortDate(metrics.effectiveFrom)} – {fmtShortDate(metrics.effectiveTo)}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[9px] font-black text-slate-500">
              {metrics.rangeApprovedCount} data
            </span>
          </div>
          <ChevronDown
            size={15}
            className="flex-shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180"
          />
        </summary>

        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
          {/* Quick links */}
          <div className="flex flex-wrap gap-2">
            <Link
              href={quickLast7}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              7 Hari Terakhir
            </Link>
            <Link
              href={quickThisMonth}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Bulan Ini
            </Link>
            {hasCustomRange && (
              <Link
                href="/admin/laporan"
                className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50"
              >
                Reset Range
              </Link>
            )}
          </div>

          {/* Date form */}
          <form className="flex flex-wrap items-end gap-3 text-sm">
            <label className="block">
              <span className="mb-1 block text-[11px] text-slate-500">Dari Tanggal</span>
              <Input type="date" name="from" defaultValue={params.from} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-slate-500">Sampai Tanggal</span>
              <Input type="date" name="to" defaultValue={params.to} />
            </label>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-700"
            >
              Terapkan
            </button>
          </form>
        </div>
      </details>

      {/* ── Target KPI Bulan Berjalan ────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Target KPI {currentMonthLabel}
            </h2>
            <Target size={11} className="text-slate-300" />
          </div>
          {/* Status audit BBA */}
          {auditStatus ? (
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest",
                isPublished
                  ? "bg-emerald-100 text-emerald-800"
                  : auditStatus === "APPROVED"
                    ? "bg-blue-100 text-blue-800"
                    : auditStatus === "UNDER_REVIEW"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-100 text-slate-600",
              )}
            >
              {isPublished ? "Rapor Published" : (AUDIT_STATUS_LABEL[auditStatus] ?? auditStatus)}
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Audit Belum Dimulai
            </span>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          {targetOmzet === 0 ? (
            <p className="py-3 text-center text-sm text-slate-400">
              KPI belum dikonfigurasi untuk {currentMonthLabel}. Hubungi tim BBA.
            </p>
          ) : (
            <div className="space-y-4">
              {/* 4 metrik */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target</p>
                  <p className="mt-1 text-sm font-black tabular-nums text-slate-800">{IDR.format(targetOmzet)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Realisasi MTD</p>
                  <p className="mt-1 text-sm font-black tabular-nums text-slate-800">{IDR.format(mtdOmzet)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Capaian</p>
                  <p
                    className={cn(
                      "mt-1 text-sm font-black tabular-nums",
                      achievementPct >= 100
                        ? "text-emerald-600"
                        : achievementPct >= 75
                          ? "text-amber-600"
                          : "text-rose-600",
                    )}
                  >
                    {achievementPct.toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Proyeksi</p>
                  <p className="mt-1 text-sm font-black tabular-nums text-slate-800">{IDR.format(projectedOmzet)}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">{projectedPct.toFixed(1)}% dari target</p>
                </div>
              </div>

              {/* Progress bar */}
              <div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      achievementPct >= 100
                        ? "bg-emerald-500"
                        : achievementPct >= 75
                          ? "bg-amber-500"
                          : "bg-rose-500",
                    )}
                    style={{ width: `${Math.min(100, achievementPct)}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  Hari ke-{dayOfMonth} dari {totalDaysInMonth} hari —{" "}
                  rata-rata harian: {IDR.format(Math.round(avgDailyMtd))}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Aggregate metrics ───────────────────────────────────────── */}
      <ReportMetricsGrid metrics={metrics} />

      {/* ── Breakdown per Karyawan ──────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Breakdown per Karyawan
        </h2>

        {crewRows.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            Belum ada submission approved pada range ini.
          </p>
        ) : (
          <>
            {/* Mobile card stack */}
            <div className="space-y-2 md:hidden">
              {crewRows.map((r, idx) => (
                <div key={r.userId} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="w-4 text-right text-[10px] font-bold tabular-nums text-slate-400">
                        {idx + 1}
                      </span>
                      <span className="truncate text-sm font-bold text-slate-800">{r.name}</span>
                    </div>
                    <span className="whitespace-nowrap text-base font-black tabular-nums text-slate-900">
                      {IDR.format(r.omzet)}
                    </span>
                  </div>

                  <div className="ml-6 mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                    <div>
                      <span className="text-slate-400">Nota</span>
                      <span className="ml-1.5 font-semibold tabular-nums text-slate-700">
                        {NUM.format(r.trx)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Produk</span>
                      <span className="ml-1.5 font-semibold tabular-nums text-slate-700">
                        {NUM.format(r.prod)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">ATV</span>
                      <span className="ml-1.5 font-semibold tabular-nums text-slate-700">
                        {IDR.format(r.atv)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">ATU</span>
                      <span className="ml-1.5 font-semibold tabular-nums text-slate-700">
                        {r.atu.toFixed(2)}
                      </span>
                    </div>
                    {r.rejected > 0 && (
                      <>
                        <div>
                          <span className="text-slate-400">Ditolak</span>
                          <span className="ml-1.5 font-semibold tabular-nums text-rose-600">
                            {NUM.format(r.rejected)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Est. Hilang</span>
                          <span className="ml-1.5 font-semibold tabular-nums text-rose-600">
                            {IDR.format(r.projectedLost)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}

              {/* Mobile total row */}
              {crewRows.length > 1 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600">Total</span>
                    <span className="text-base font-black tabular-nums text-slate-900">
                      {IDR.format(totalOmzet)}
                    </span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                    <div>
                      <span className="text-slate-400">Nota</span>
                      <span className="ml-1.5 font-semibold tabular-nums text-slate-700">
                        {NUM.format(totalTrx)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Produk</span>
                      <span className="ml-1.5 font-semibold tabular-nums text-slate-700">
                        {NUM.format(totalProd)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Ditolak</span>
                      <span className="ml-1.5 font-semibold tabular-nums text-rose-600">
                        {NUM.format(totalRejected)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Est. Hilang</span>
                      <span className="ml-1.5 font-semibold tabular-nums text-rose-600">
                        {IDR.format(totalProjectedLost)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Nama</th>
                    <th className="px-4 py-3 text-right">Omzet</th>
                    <th className="px-4 py-3 text-right">Nota</th>
                    <th className="px-4 py-3 text-right">ATV</th>
                    <th className="px-4 py-3 text-right">Produk</th>
                    <th className="px-4 py-3 text-right">ATU</th>
                    <th className="px-4 py-3 text-right">Plg. Tertolak</th>
                    <th className="px-4 py-3 text-right">Perkiraan Omzet Tertolak</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {crewRows.map((r) => (
                    <tr key={r.userId} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{IDR.format(r.omzet)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{NUM.format(r.trx)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{IDR.format(r.atv)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{NUM.format(r.prod)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{r.atu.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{NUM.format(r.rejected)}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-rose-600">{IDR.format(r.projectedLost)}</td>
                    </tr>
                  ))}
                </tbody>
                {crewRows.length > 1 && (
                  <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                    <tr>
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3 text-right tabular-nums">{IDR.format(totalOmzet)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{NUM.format(totalTrx)}</td>
                      <td className="px-4 py-3 text-right">—</td>
                      <td className="px-4 py-3 text-right tabular-nums">{NUM.format(totalProd)}</td>
                      <td className="px-4 py-3 text-right">—</td>
                      <td className="px-4 py-3 text-right tabular-nums">{NUM.format(totalRejected)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-rose-600">{IDR.format(totalProjectedLost)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Penolakan Pelanggan per Hari ────────────────────────────── */}
      {dayRows.length === 0 && crewRows.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Penolakan Pelanggan per Hari
          </h2>
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <span className="text-emerald-500">✓</span>
            <p className="text-sm text-emerald-700">
              Tidak ada penolakan pelanggan pada range ini.
            </p>
          </div>
        </div>
      )}
      {dayRows.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Penolakan Pelanggan per Hari
          </h2>

          <>
            {/* Mobile compact cards */}
            <div className="space-y-2 md:hidden">
              {dayRows.map((d) => (
                <div
                  key={d.date}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3"
                >
                  <div>
                    <p className="text-xs font-bold text-slate-700">{fmtFullDate(d.date)}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      ATV: {IDR.format(d.atv)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold tabular-nums text-rose-600">
                      {NUM.format(d.rejected)} pelanggan
                    </p>
                    <p className="text-[11px] tabular-nums text-rose-500">
                      {IDR.format(d.projectedLost)}
                    </p>
                  </div>
                </div>
              ))}

              {/* Mobile total */}
              <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
                <span className="text-xs font-bold text-slate-600">Total</span>
                <div className="text-right">
                  <p className="text-xs font-bold tabular-nums text-rose-600">
                    {NUM.format(totalDayRejected)} pelanggan
                  </p>
                  <p className="text-[11px] tabular-nums text-rose-500">
                    {IDR.format(totalDayLost)}
                  </p>
                </div>
              </div>
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Tanggal</th>
                    <th className="px-4 py-3 text-right">Plg. Tertolak</th>
                    <th className="px-4 py-3 text-right">ATV Hari Itu</th>
                    <th className="px-4 py-3 text-right">Perkiraan Omzet Tertolak</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dayRows.map((d) => (
                    <tr key={d.date} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-700">{fmtFullDate(d.date)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{NUM.format(d.rejected)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{IDR.format(d.atv)}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-rose-600">{IDR.format(d.projectedLost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                  <tr>
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right tabular-nums">{NUM.format(totalDayRejected)}</td>
                    <td className="px-4 py-3 text-right">—</td>
                    <td className="px-4 py-3 text-right tabular-nums text-rose-600">{IDR.format(totalDayLost)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        </div>
      )}

      <Card className="rounded-2xl p-4 text-sm text-slate-600">
        Data sumber laporan berasal dari submission status <code>approved</code>. Total approved
        bulan ini:{" "}
        <span className="font-semibold text-slate-900">{metrics.monthApprovedCount}</span>.
      </Card>

      <HelpDrawer content={LAPORAN_HELP} />
    </section>
  );
}
