"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/shared/glass-card";
import { BbaDashboardSalesChart } from "@/app/bba/dashboard/bba-dashboard-sales-chart";
import type { SalesMonthlyPoint } from "@/lib/bba-dashboard-metrics";
import {
  LayoutDashboard, Wrench, ArrowRight, CalendarRange,
  CheckCircle2, Clock, XCircle, AlertTriangle, Bell, X,
  ArrowLeftRight, Package, TrendingUp, TrendingDown, Minus,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OwnerPortfolioItem = {
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  mtdOmzet: number;
  mtdCapaianPct: number;
  isActive: boolean;
};

export type OwnerOpsData = {
  todayStatus: "verified" | "pending" | "none";
  openQueue: number;
  overdueQueue: number;
  pendingLeave: number;
  pendingSwap: number;
  activeAddons: { key: string; label: string }[];
  todayDateKey: string;
  timezoneLabel: string;
};

export type OwnerTrendData = {
  monthlyPoints: SalesMonthlyPoint[];
  salesFrom: string;
  salesTo: string;
  avgCapaianPct: number;
  totalOmzet: number;
  avgAtv: number;
  avgAtu: number;
};

interface Props {
  activeTab: "trend" | "ops";
  portfolio: OwnerPortfolioItem[];
  trendData: OwnerTrendData | null;
  opsData: OwnerOpsData | null;
  currentTenant: string; // "all" or tenantId
  salesFrom: string;
  salesTo: string;
  isMultiBranch: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];
const CY = new Date().getFullYear();
const YEAR_OPTS = Array.from({ length: 5 }, (_, i) => CY - 3 + i);

function fmtIdr(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
  return String(Math.round(n));
}

function capaianColor(pct: number) {
  if (pct >= 100) return "text-emerald-600";
  if (pct >= 75) return "text-sky-600";
  if (pct >= 50) return "text-amber-600";
  return "text-rose-600";
}

function periodLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTH_NAMES[(m ?? 1) - 1]} ${y}`;
}

const ADDON_LABELS: Record<string, string> = {
  payroll: "Payroll & Gaji",
  attendance: "Absensi",
  appraisal: "Penilaian Karyawan",
  product_focus: "Produk Fokus",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function OwnerDashboardClient({
  activeTab,
  portfolio,
  trendData,
  opsData,
  currentTenant,
  salesFrom,
  salesTo,
  isMultiBranch,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [underConstructionOpen, setUnderConstructionOpen] = useState(false);

  const [fromY, fromM] = salesFrom.split("-").map(Number);
  const [toY, toM] = salesTo.split("-").map(Number);

  function buildUrl(opts: {
    tab?: string;
    tenant?: string;
    sales_from?: string;
    sales_to?: string;
  }) {
    const q = new URLSearchParams();
    q.set("tab", opts.tab ?? activeTab);
    if (opts.tenant ?? currentTenant) q.set("tenant", opts.tenant ?? currentTenant);
    q.set("sales_from", opts.sales_from ?? salesFrom);
    q.set("sales_to", opts.sales_to ?? salesTo);
    return `${pathname}?${q.toString()}`;
  }

  function setPeriod(from: string, to: string) {
    router.push(buildUrl({ sales_from: from, sales_to: to }));
  }

  function setTab(tab: "trend" | "ops") {
    router.push(buildUrl({ tab }));
  }

  function selectBranch(tenantId: string) {
    router.push(buildUrl({ tenant: tenantId }));
  }

  // ─── Portfolio strip ───────────────────────────────────────────────────────

  const portfolioStrip = isMultiBranch && portfolio.length > 0 ? (
    <GlassCard className="!p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Apotek Anda — bulan ini</span>
      </div>
      <div className="divide-y divide-slate-50">
        {portfolio.map((item) => (
          <button
            key={item.tenantId}
            type="button"
            onClick={() => selectBranch(item.tenantId)}
            className={cn(
              "w-full flex items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-sky-50/40",
              item.isActive && "bg-sky-50/60 border-l-2 border-sky-500",
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-black text-slate-800 uppercase">{item.tenantCode}</p>
              <p className="text-[9px] font-bold text-slate-400 truncate">{item.tenantName}</p>
            </div>
            <span className={cn("text-[13px] font-black tabular-nums w-12 text-right shrink-0", capaianColor(item.mtdCapaianPct))}>
              {item.mtdCapaianPct}%
            </span>
            <span className="text-[11px] font-bold text-slate-500 tabular-nums w-20 text-right shrink-0 hidden sm:block">
              Rp {fmtIdr(item.mtdOmzet)}
            </span>
            <ArrowRight size={12} className={cn("shrink-0", item.isActive ? "text-sky-500" : "text-slate-300")} />
          </button>
        ))}
      </div>
    </GlassCard>
  ) : null;

  // ─── Tab switcher ──────────────────────────────────────────────────────────

  const tabSwitcher = (
    <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 self-start">
      {([
        { id: "trend" as const, label: "Trend", Icon: TrendingUp },
        { id: "ops" as const, label: "Operasional", Icon: Wrench },
      ] as const).map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all",
            activeTab === t.id
              ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
              : "text-slate-500 hover:text-slate-700",
          )}
        >
          <t.Icon size={11} />
          {t.label}
        </button>
      ))}
    </div>
  );

  // ─── Trend Tab ─────────────────────────────────────────────────────────────

  const trendTab = (
    <div className="space-y-4">
      {/* Period picker */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-50/80 rounded-2xl p-3 border border-slate-100">
        <div className="flex items-center gap-1.5">
          <CalendarRange size={13} className="text-slate-400 shrink-0" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dari</span>
        </div>
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
          <select
            className="bg-transparent text-[11px] font-black text-slate-700 outline-none cursor-pointer"
            value={fromM}
            onChange={(e) => setPeriod(`${fromY}-${String(Number(e.target.value)).padStart(2, "0")}`, salesTo)}
          >
            {MONTH_NAMES.map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
          </select>
          <span className="text-slate-300 text-xs">/</span>
          <select
            className="bg-transparent text-[11px] font-black text-slate-700 outline-none cursor-pointer"
            value={fromY}
            onChange={(e) => setPeriod(`${e.target.value}-${String(fromM ?? 1).padStart(2, "0")}`, salesTo)}
          >
            {YEAR_OPTS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <ArrowRight size={13} className="text-slate-300 shrink-0" />
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sampai</span>
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
          <select
            className="bg-transparent text-[11px] font-black text-slate-700 outline-none cursor-pointer"
            value={toM}
            onChange={(e) => setPeriod(salesFrom, `${toY}-${String(Number(e.target.value)).padStart(2, "0")}`)}
          >
            {MONTH_NAMES.map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
          </select>
          <span className="text-slate-300 text-xs">/</span>
          <select
            className="bg-transparent text-[11px] font-black text-slate-700 outline-none cursor-pointer"
            value={toY}
            onChange={(e) => setPeriod(salesFrom, `${e.target.value}-${String(toM ?? 1).padStart(2, "0")}`)}
          >
            {YEAR_OPTS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <span className="ml-auto text-[9px] font-bold text-slate-400">
          {periodLabel(salesFrom)} – {periodLabel(salesTo)}
        </span>
      </div>

      {/* KPI summary */}
      {trendData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Avg capaian", value: `${trendData.avgCapaianPct}%`, color: capaianColor(trendData.avgCapaianPct) },
            { label: "Total omzet", value: `Rp ${fmtIdr(trendData.totalOmzet)}`, color: "text-slate-900" },
            { label: "Avg ATV", value: `Rp ${fmtIdr(trendData.avgAtv)}`, color: "text-slate-900" },
            { label: "Avg ATU", value: `${trendData.avgAtu.toFixed(2)} item`, color: "text-slate-900" },
          ].map((c) => (
            <GlassCard key={c.label} className="!py-3">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{c.label}</p>
              <p className={cn("text-xl font-black mt-1 leading-none", c.color)}>{c.value}</p>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Chart */}
      <GlassCard className="border-slate-100/50">
        <div className="flex items-center gap-2 mb-4">
          <LayoutDashboard size={14} className="text-sky-600 shrink-0" />
          <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
            Trend per Bulan — {periodLabel(salesFrom)} s.d. {periodLabel(salesTo)}
          </h2>
        </div>
        {trendData && trendData.monthlyPoints.length > 0 ? (
          <BbaDashboardSalesChart points={trendData.monthlyPoints} />
        ) : (
          <div className="flex items-center justify-center py-16 text-[12px] font-bold text-slate-400">
            Tidak ada data untuk periode ini.
          </div>
        )}
      </GlassCard>

      {/* Monthly breakdown table */}
      {trendData && trendData.monthlyPoints.length > 0 && (
        <GlassCard className="!p-0 overflow-hidden border-slate-100/50">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <TrendingUp size={13} className="text-sky-600 shrink-0" />
            <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
              Rincian Per Bulan
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                <tr>
                  <th className="px-5 py-3 whitespace-nowrap">Bulan</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Omzet</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Target</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Capaian</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Transaksi</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">ATV</th>
                  <th className="px-5 py-3 text-right whitespace-nowrap">ATU</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...trendData.monthlyPoints].reverse().map((p) => {
                  const hasData = p.omzet > 0 || p.transactions > 0;
                  return (
                    <tr key={p.yearMonth} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3 text-[11px] font-black text-slate-700 whitespace-nowrap">
                        {MONTH_NAMES[p.month - 1]} {p.year}
                      </td>
                      <td className="px-4 py-3 text-[11px] font-bold text-slate-900 tabular-nums text-right whitespace-nowrap">
                        {hasData ? `Rp ${fmtIdr(p.omzet)}` : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-[11px] font-bold text-slate-400 tabular-nums text-right whitespace-nowrap">
                        {p.targetOmzet > 0 ? `Rp ${fmtIdr(p.targetOmzet)}` : <span className="text-slate-200">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {hasData && p.omzetCapaian > 0 ? (
                          <span className={cn(
                            "inline-block text-[10px] font-black tabular-nums",
                            capaianColor(p.omzetCapaian),
                          )}>
                            {p.omzetCapaian}%
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[11px] font-bold text-slate-700 tabular-nums text-right">
                        {hasData ? p.transactions.toLocaleString("id-ID") : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-[11px] font-bold text-slate-700 tabular-nums text-right whitespace-nowrap">
                        {hasData ? `Rp ${fmtIdr(p.atv)}` : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3 text-[11px] font-bold text-slate-700 tabular-nums text-right">
                        {hasData ? p.atu.toFixed(2) : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Totals / averages footer */}
              <tfoot className="bg-sky-50/40 border-t-2 border-sky-100">
                <tr>
                  <td className="px-5 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">
                    Periode ini
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-[12px] font-black text-slate-900 tabular-nums whitespace-nowrap">
                      Rp {fmtIdr(trendData.totalOmzet)}
                    </span>
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right">
                    <span className={cn("text-[12px] font-black tabular-nums", capaianColor(trendData.avgCapaianPct))}>
                      {trendData.avgCapaianPct}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-[11px] font-black text-slate-700 tabular-nums">
                      {trendData.monthlyPoints.reduce((s, p) => s + p.transactions, 0).toLocaleString("id-ID")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-[11px] font-black text-slate-700 tabular-nums whitespace-nowrap">
                      Rp {fmtIdr(trendData.avgAtv)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="text-[11px] font-black text-slate-700 tabular-nums">
                      {trendData.avgAtu.toFixed(2)}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </GlassCard>
      )}
    </div>
  );

  // ─── Ops Tab ───────────────────────────────────────────────────────────────

  const opsTab = opsData ? (
    <div className="space-y-4">
      {/* Today status */}
      <p className="text-[10px] font-bold text-slate-400">
        {opsData.todayDateKey}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Laporan hari ini */}
        <GlassCard className="!py-4 group">
          <div className="flex items-center gap-2 mb-2">
            <div className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
              opsData.todayStatus === "verified" ? "bg-emerald-50 text-emerald-600"
              : opsData.todayStatus === "pending" ? "bg-amber-50 text-amber-600"
              : "bg-rose-50 text-rose-500",
            )}>
              {opsData.todayStatus === "verified" ? <CheckCircle2 size={14} /> :
               opsData.todayStatus === "pending" ? <Clock size={14} /> : <XCircle size={14} />}
            </div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-tight">
              Laporan hari ini
            </p>
          </div>
          <p className={cn(
            "text-base font-black",
            opsData.todayStatus === "verified" ? "text-emerald-600"
            : opsData.todayStatus === "pending" ? "text-amber-600"
            : "text-rose-500",
          )}>
            {opsData.todayStatus === "verified" ? "Sudah lapor ✓"
             : opsData.todayStatus === "pending" ? "Sedang diproses"
             : "Belum lapor"}
          </p>
        </GlassCard>

        {/* Queue */}
        <GlassCard className="!py-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
              <Clock size={14} />
            </div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-tight">
              Verifikasi queue
            </p>
          </div>
          <p className="text-2xl font-black text-slate-900">{opsData.openQueue}</p>
          {opsData.overdueQueue > 0 && (
            <p className="text-[9px] font-bold text-rose-500 mt-0.5">
              {opsData.overdueQueue} overdue
            </p>
          )}
        </GlassCard>

        {/* Pending izin */}
        <GlassCard className="!py-4">
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              onClick={() => setUnderConstructionOpen(true)}
              className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-opacity hover:opacity-70 active:opacity-50",
                opsData.pendingLeave > 0 ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-400",
              )}
              title="Notifikasi (dalam pengembangan)"
            >
              <Bell size={14} />
            </button>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-tight">
              Pengajuan izin
            </p>
          </div>
          <p className={cn("text-2xl font-black", opsData.pendingLeave > 0 ? "text-amber-600" : "text-slate-900")}>
            {opsData.pendingLeave}
          </p>
          <p className="text-[9px] font-bold text-slate-400 mt-0.5">pengajuan pending</p>
        </GlassCard>

        {/* Tukar shift */}
        <GlassCard className="!py-4">
          <div className="flex items-center gap-2 mb-2">
            <div className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
              opsData.pendingSwap > 0 ? "bg-sky-50 text-sky-600" : "bg-slate-100 text-slate-400",
            )}>
              <ArrowLeftRight size={14} />
            </div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-tight">
              Tukar shift
            </p>
          </div>
          <p className={cn("text-2xl font-black", opsData.pendingSwap > 0 ? "text-sky-600" : "text-slate-900")}>
            {opsData.pendingSwap}
          </p>
          <p className="text-[9px] font-bold text-slate-400 mt-0.5">pengajuan pending</p>
        </GlassCard>
      </div>

      {/* Active addons */}
      <GlassCard>
        <div className="flex items-center gap-2 mb-4">
          <Package size={14} className="text-sky-600 shrink-0" />
          <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
            Modul Aktif
          </h2>
        </div>
        {opsData.activeAddons.length === 0 ? (
          <p className="text-[11px] font-bold text-slate-400">Tidak ada modul tambahan yang aktif.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {opsData.activeAddons.map((addon) => (
              <span
                key={addon.key}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 border border-sky-100 text-sky-700 rounded-xl text-[10px] font-black uppercase tracking-wide"
              >
                <CheckCircle2 size={10} /> {addon.label}
              </span>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Alert summary */}
      {(opsData.overdueQueue > 0 || opsData.pendingLeave > 0 || opsData.pendingSwap > 0) && (
        <GlassCard className="border-amber-100/60 bg-amber-50/30">
          <div className="flex items-start gap-3">
            <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] font-black text-amber-800 uppercase tracking-wide">
                Perlu perhatian
              </p>
              <ul className="mt-1.5 space-y-0.5 text-[10px] font-bold text-amber-700">
                {opsData.overdueQueue > 0 && <li>• {opsData.overdueQueue} laporan overdue menunggu verifikasi BBA</li>}
                {opsData.pendingLeave > 0 && <li>• {opsData.pendingLeave} pengajuan izin belum diproses</li>}
                {opsData.pendingSwap > 0 && <li>• {opsData.pendingSwap} permintaan tukar shift belum diproses</li>}
              </ul>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  ) : (
    <div className="flex items-center justify-center py-16 text-[12px] font-bold text-slate-400">
      Tidak ada data operasional.
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <GlassCard className="p-4 sm:p-5" variant="light">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-sky-600/25">
              <LayoutDashboard size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase leading-tight">
                Dashboard
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Pantau tren dan kondisi operasional apotek Anda
              </p>
            </div>
          </div>
          {tabSwitcher}
        </div>
      </GlassCard>

      {/* Portfolio strip (multi-branch only) */}
      {portfolioStrip}

      {/* Tab content */}
      {activeTab === "trend" ? trendTab : opsTab}

      {/* Under Construction Modal */}
      {underConstructionOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setUnderConstructionOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setUnderConstructionOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X size={18} />
            </button>
            <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Wrench size={28} className="text-amber-600" />
            </div>
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
              Dalam Pengembangan
            </h2>
            <p className="text-sm font-medium text-slate-500 mt-2 leading-relaxed">
              Fitur notifikasi sedang dalam tahap pengembangan.
              Nantikan pembaruan berikutnya!
            </p>
            <button
              type="button"
              onClick={() => setUnderConstructionOpen(false)}
              className="mt-6 px-6 py-2.5 bg-sky-600 text-white text-sm font-black rounded-xl hover:bg-sky-700 transition-colors w-full"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
