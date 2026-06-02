"use client";

import { useState, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  X,
  CalendarRange,
  BarChart3,
  Building2,
  ExternalLink,
  MousePointerClick,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/shared/glass-card";
import type { SalesBranchSummary } from "@/lib/bba-dashboard-metrics";
import { BbaDashboardSalesChart } from "./bba-dashboard-sales-chart";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  branches: SalesBranchSummary[];
  selectedTenantId: string | null; // null = all branches
  salesFrom: string; // "YYYY-MM"
  salesTo: string;   // "YYYY-MM"
  currentTenant: string; // for URL param ("all" or id)
}

type ModalSortKey = "capaian" | "omzet";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];

const CY = new Date().getFullYear();
const YEAR_OPTS = Array.from({ length: 5 }, (_, i) => CY - 3 + i); // CY-3 … CY+1

function fmtIdr(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
  return String(Math.round(n));
}

function capaianColor(pct: number): string {
  if (pct >= 100) return "text-emerald-600";
  if (pct >= 75) return "text-sky-600";
  if (pct >= 50) return "text-amber-600";
  return "text-rose-600";
}

function TrendIcon({ trend, size = 14 }: { trend: "up" | "down" | "stable"; size?: number }) {
  if (trend === "up") return <TrendingUp size={size} className="text-emerald-500" />;
  if (trend === "down") return <TrendingDown size={size} className="text-rose-500" />;
  return <Minus size={size} className="text-slate-400" />;
}

function periodLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTH_NAMES[(m ?? 1) - 1]} ${y}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BbaDashboardSalesContent({
  branches,
  selectedTenantId,
  salesFrom,
  salesTo,
  currentTenant,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalSort, setModalSort] = useState<ModalSortKey>("capaian");
  const [modalDir, setModalDir] = useState<"asc" | "desc">("desc");

  // ── Parse current period ──
  const [fromY, fromM] = salesFrom.split("-").map(Number);
  const [toY, toM] = salesTo.split("-").map(Number);

  // ── Navigation helpers ──
  function buildUrl(tenant: string, from: string, to: string): string {
    const q = new URLSearchParams();
    q.set("tab", "sales");
    q.set("tenant", tenant);
    q.set("sales_from", from);
    q.set("sales_to", to);
    return `${pathname}?${q.toString()}`;
  }

  function setPeriod(from: string, to: string) {
    router.push(buildUrl(currentTenant, from, to));
  }

  function selectBranch(tenantId: string) {
    router.push(buildUrl(tenantId, salesFrom, salesTo));
    setIsModalOpen(false);
  }

  // ── Derived data ──
  const selectedBranch = selectedTenantId
    ? (branches.find((b) => b.tenantId === selectedTenantId) ?? null)
    : null;
  const isAllBranches = !selectedBranch;

  const top3 = useMemo(
    () => [...branches].sort((a, b) => b.avgOmzetCapaian - a.avgOmzetCapaian).slice(0, 3),
    [branches],
  );

  const modalRows = useMemo(() => {
    return [...branches].sort((a, b) => {
      const diff =
        modalSort === "capaian"
          ? a.avgOmzetCapaian - b.avgOmzetCapaian
          : a.totalOmzet - b.totalOmzet;
      return modalDir === "desc" ? -diff : diff;
    });
  }, [branches, modalSort, modalDir]);

  function handleModalSort(key: ModalSortKey) {
    if (modalSort === key) setModalDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setModalSort(key); setModalDir("desc"); }
  }

  function ModalSortIcon({ col }: { col: ModalSortKey }) {
    if (modalSort !== col) return <ArrowUpDown size={9} className="opacity-30 shrink-0" />;
    return modalDir === "asc"
      ? <ChevronUp size={9} className="text-sky-600 shrink-0" />
      : <ChevronDown size={9} className="text-sky-600 shrink-0" />;
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Period Picker ── */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-50/80 rounded-2xl p-3 border border-slate-100">
        <div className="flex items-center gap-1.5">
          <CalendarRange size={13} className="text-slate-400 shrink-0" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dari</span>
        </div>
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
          <select
            className="bg-transparent text-[11px] font-black text-slate-700 outline-none cursor-pointer"
            value={fromM}
            onChange={(e) => {
              const m = String(Number(e.target.value)).padStart(2, "0");
              setPeriod(`${fromY}-${m}`, salesTo);
            }}
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
          <span className="text-slate-300 text-xs">/</span>
          <select
            className="bg-transparent text-[11px] font-black text-slate-700 outline-none cursor-pointer"
            value={fromY}
            onChange={(e) => {
              const pad = (n: number) => String(n).padStart(2, "0");
              setPeriod(`${e.target.value}-${pad(fromM ?? 1)}`, salesTo);
            }}
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
            onChange={(e) => {
              const m = String(Number(e.target.value)).padStart(2, "0");
              setPeriod(salesFrom, `${toY}-${m}`);
            }}
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
          <span className="text-slate-300 text-xs">/</span>
          <select
            className="bg-transparent text-[11px] font-black text-slate-700 outline-none cursor-pointer"
            value={toY}
            onChange={(e) => {
              const pad = (n: number) => String(n).padStart(2, "0");
              setPeriod(salesFrom, `${e.target.value}-${pad(toM ?? 1)}`);
            }}
          >
            {YEAR_OPTS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <span className="ml-auto text-[9px] font-bold text-slate-400">
          {periodLabel(salesFrom)} – {periodLabel(salesTo)}
        </span>
      </div>

      {/* ── Branch Ranking List ── */}
      <GlassCard className="!p-0 overflow-hidden border-slate-100/50">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={14} className="text-sky-600" />
            <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
              Top 3 Capaian
            </h2>
            <span className="text-[9px] font-bold text-slate-400">
              {periodLabel(salesFrom)} – {periodLabel(salesTo)}
            </span>
          </div>
          {branches.length > 3 && (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="text-[10px] font-black uppercase tracking-widest text-sky-600 hover:underline flex items-center gap-1"
            >
              Lihat {branches.length - 3} cabang lainnya →
            </button>
          )}
        </div>

        {/* List rows */}
        {branches.length === 0 ? (
          <div className="px-5 py-8 text-center text-[11px] font-bold text-slate-400">
            Tidak ada data cabang untuk periode ini.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {top3.map((branch, rank) => (
              <li key={branch.tenantId}>
                <button
                  type="button"
                  onClick={() => selectBranch(branch.tenantId)}
                  className={cn(
                    "w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-sky-50/40",
                    selectedTenantId === branch.tenantId && "bg-sky-50/60 border-l-2 border-l-sky-500",
                  )}
                >
                  {/* Rank */}
                  <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 shrink-0">
                    {rank + 1}
                  </span>

                  {/* Branch info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black text-slate-800 uppercase tracking-tight">
                      {branch.tenantCode}
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 truncate">{branch.tenantName}</p>
                  </div>

                  {/* Trend */}
                  <div className="flex items-center gap-1 shrink-0">
                    <TrendIcon trend={branch.trend} size={13} />
                    <span className="text-[9px] font-bold text-slate-400 hidden sm:block">
                      {branch.trend === "up" ? "Naik" : branch.trend === "down" ? "Turun" : "Stabil"}
                    </span>
                  </div>

                  {/* Capaian */}
                  <span className={cn("text-[13px] font-black tabular-nums shrink-0 w-14 text-right", capaianColor(branch.avgOmzetCapaian))}>
                    {Math.round(branch.avgOmzetCapaian)}%
                  </span>

                  {/* Total omzet */}
                  <span className="text-[11px] font-bold text-slate-600 tabular-nums shrink-0 hidden sm:block w-24 text-right">
                    Rp {fmtIdr(branch.totalOmzet)}
                  </span>

                  {/* Arrow indicator */}
                  <ArrowRight size={12} className={cn(
                    "shrink-0 transition-colors",
                    selectedTenantId === branch.tenantId ? "text-sky-500" : "text-slate-300",
                  )} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      {/* ── Branch Detail Area ── */}
      {isAllBranches ? (
        /* Empty state — no branch selected */
        <div className="flex flex-col items-center justify-center py-14 rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 text-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
            <MousePointerClick size={18} />
          </div>
          <div>
            <p className="text-[12px] font-black text-slate-600 uppercase tracking-wide">
              Pilih salah satu cabang
            </p>
            <p className="text-[11px] font-bold text-slate-400 mt-0.5">
              Gunakan filter cabang di atas atau klik baris dari daftar untuk melihat grafik dan rincian datanya.
            </p>
          </div>
        </div>
      ) : (
        /* Single branch detail */
        <div className="space-y-4">
          {/* Branch header */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-sky-100 flex items-center justify-center text-sky-600 shrink-0">
                <Building2 size={14} />
              </div>
              <div>
                <p className="text-sm font-black text-slate-800 uppercase tracking-tight">
                  {selectedBranch.tenantCode}
                </p>
                <p className="text-[10px] font-bold text-slate-400">{selectedBranch.tenantName}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <TrendIcon trend={selectedBranch.trend} />
              <span className={cn(
                "text-[10px] font-black uppercase",
                selectedBranch.trend === "up" ? "text-emerald-600"
                  : selectedBranch.trend === "down" ? "text-rose-600"
                  : "text-slate-400",
              )}>
                {selectedBranch.trend === "up" ? "Tren naik"
                  : selectedBranch.trend === "down" ? "Tren turun"
                  : "Stabil"}
              </span>
              <Link
                href={`/bba/audit?tenant=${selectedBranch.tenantId}`}
                className="ml-2 text-[10px] font-black uppercase tracking-widest text-sky-600 hover:underline flex items-center gap-1"
              >
                Buka audit <ExternalLink size={10} />
              </Link>
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: "Avg capaian",
                value: `${Math.round(selectedBranch.avgOmzetCapaian)}%`,
                color: capaianColor(selectedBranch.avgOmzetCapaian),
              },
              {
                label: "Total omzet",
                value: `Rp ${fmtIdr(selectedBranch.totalOmzet)}`,
                color: "text-slate-900",
              },
              {
                label: "Bulan data",
                value: String(selectedBranch.monthlyData.length),
                color: "text-slate-900",
              },
              {
                label: "Tren",
                value: selectedBranch.trend === "up" ? "↑ Naik"
                  : selectedBranch.trend === "down" ? "↓ Turun"
                  : "→ Stabil",
                color: selectedBranch.trend === "up" ? "text-emerald-600"
                  : selectedBranch.trend === "down" ? "text-rose-600"
                  : "text-slate-500",
              },
            ].map((card) => (
              <GlassCard key={card.label} className="!py-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{card.label}</p>
                <p className={cn("text-xl font-black mt-1", card.color)}>{card.value}</p>
              </GlassCard>
            ))}
          </div>

          {/* Chart */}
          <GlassCard className="border-slate-100/50">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={14} className="text-sky-600 shrink-0" />
              <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                Grafik Per Bulan — {periodLabel(salesFrom)} s.d. {periodLabel(salesTo)}
              </h2>
            </div>
            {selectedBranch.monthlyData.length > 0 ? (
              <BbaDashboardSalesChart points={selectedBranch.monthlyData} />
            ) : (
              <p className="text-sm text-slate-500 py-8 text-center">
                Tidak ada data untuk periode ini.
              </p>
            )}
          </GlassCard>

          {/* Monthly detail table */}
          <GlassCard className="!p-0 overflow-hidden border-slate-100/50">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                Rincian per Bulan
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="px-5 py-3">Bulan</th>
                    <th className="px-5 py-3">Omzet</th>
                    <th className="px-5 py-3">Target</th>
                    <th className="px-5 py-3">Capaian%</th>
                    <th className="px-5 py-3">ATV</th>
                    <th className="px-5 py-3">ATU</th>
                    <th className="px-5 py-3 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedBranch.monthlyData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-[11px] font-bold text-slate-400">
                        Tidak ada data.
                      </td>
                    </tr>
                  ) : (
                    [...selectedBranch.monthlyData].reverse().map((p) => (
                      <tr key={p.yearMonth} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3 text-[11px] font-bold text-slate-700 whitespace-nowrap">
                          {MONTH_NAMES[(p.month - 1) % 12]} {p.year}
                        </td>
                        <td className="px-5 py-3 text-[11px] font-bold text-slate-900 tabular-nums whitespace-nowrap">
                          Rp {p.omzet.toLocaleString("id-ID")}
                        </td>
                        <td className="px-5 py-3 text-[11px] font-bold text-slate-400 tabular-nums whitespace-nowrap">
                          {p.targetOmzet > 0 ? `Rp ${p.targetOmzet.toLocaleString("id-ID")}` : "—"}
                        </td>
                        <td className="px-5 py-3">
                          <span className={cn("text-[11px] font-black tabular-nums", capaianColor(p.omzetCapaian))}>
                            {p.omzetCapaian > 0 ? `${p.omzetCapaian}%` : "—"}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-[11px] font-bold text-slate-700 tabular-nums whitespace-nowrap">
                          {p.atv > 0 ? `Rp ${Math.round(p.atv).toLocaleString("id-ID")}` : "—"}
                        </td>
                        <td className="px-5 py-3 text-[11px] font-bold text-slate-700 tabular-nums">
                          {p.atu > 0 ? p.atu.toFixed(2) : "—"}
                        </td>
                        <td className="px-5 py-3">
                          <Link
                            href={`/bba/audit?tenant=${selectedBranch.tenantId}&month=${p.month}&year=${p.year}`}
                            className="text-slate-300 hover:text-sky-600 transition-colors"
                            aria-label={`Audit ${MONTH_NAMES[p.month - 1]} ${p.year}`}
                          >
                            <ExternalLink size={12} />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      )}

      {/* ── Modal: semua cabang ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          />

          {/* Panel */}
          <div className="relative z-10 w-full max-w-2xl max-h-[85vh] flex flex-col bg-white rounded-3xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                  Semua Cabang
                </h2>
                <p className="text-[10px] font-bold text-slate-400">
                  {periodLabel(salesFrom)} – {periodLabel(salesTo)} · {branches.length} cabang
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* Table */}
            <div className="overflow-y-auto flex-1">
              <table className="min-w-full text-left">
                <thead className="sticky top-0 bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest z-10">
                  <tr>
                    <th className="px-5 py-3 w-8">#</th>
                    <th className="px-5 py-3">Cabang</th>
                    <th className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => handleModalSort("capaian")}
                        className="flex items-center gap-1 hover:text-slate-600"
                      >
                        Avg Capaian <ModalSortIcon col="capaian" />
                      </button>
                    </th>
                    <th className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => handleModalSort("omzet")}
                        className="flex items-center gap-1 hover:text-slate-600"
                      >
                        Total Omzet <ModalSortIcon col="omzet" />
                      </button>
                    </th>
                    <th className="px-5 py-3">Tren</th>
                    <th className="px-5 py-3 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {modalRows.map((branch, idx) => (
                    <tr
                      key={branch.tenantId}
                      className="hover:bg-sky-50/40 cursor-pointer transition-colors"
                      onClick={() => selectBranch(branch.tenantId)}
                    >
                      <td className="px-5 py-3 text-[10px] font-black text-slate-400">{idx + 1}</td>
                      <td className="px-5 py-3">
                        <p className="text-[11px] font-black text-slate-800">{branch.tenantCode}</p>
                        <p className="text-[9px] font-bold text-slate-400 truncate max-w-[160px]">{branch.tenantName}</p>
                      </td>
                      <td className="px-5 py-3">
                        <span className={cn("text-[12px] font-black tabular-nums", capaianColor(branch.avgOmzetCapaian))}>
                          {Math.round(branch.avgOmzetCapaian)}%
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[11px] font-bold text-slate-700 tabular-nums">
                        Rp {fmtIdr(branch.totalOmzet)}
                      </td>
                      <td className="px-5 py-3">
                        <TrendIcon trend={branch.trend} size={13} />
                      </td>
                      <td className="px-5 py-3">
                        <ExternalLink size={12} className="text-slate-300" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
