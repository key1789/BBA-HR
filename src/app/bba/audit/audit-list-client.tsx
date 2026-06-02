"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useMemo, useTransition } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import { AnimatedList, AnimatedListItem } from "@/components/shared/animated-list";
import {
  Search, CalendarDays, Loader2, ChevronRight, X,
  CheckCircle2, AlertCircle, Eye, TrendingUp,
  Target, Users, AlertTriangle, FlaskConical,
  LayoutGrid, LayoutList,
} from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { getAuditStatusBadgeClass, getAuditStatusLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

function formatIdr(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatIdrCompact(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}M`;
  if (value >= 1_000_000)     return `${(value / 1_000_000).toFixed(1)}jt`;
  if (value >= 1_000)         return `${(value / 1_000).toFixed(0)}rb`;
  return String(value);
}

type StatusFilter = "all" | "DRAFT" | "UNDER_REVIEW" | "APPROVED";
type ViewMode = "card" | "table";

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all",          label: "Semua" },
  { id: "DRAFT",        label: "Draft" },
  { id: "UNDER_REVIEW", label: "Under Review" },
  { id: "APPROVED",     label: "Approved" },
];

export function AuditListClient({
  branches,
  audits,
  branchMetrics,
  kpiV2ActiveByBranch = {},
  currentMonth,
  currentYear,
  periodLabel,
}: {
  branches: any[];
  audits: any[];
  branchMetrics: Record<string, { targetOmzet: number; omzetAchieved: number; crewAdminCount: number }>;
  kpiV2ActiveByBranch?: Record<string, boolean>;
  currentMonth: number;
  currentYear: number;
  periodLabel: { mtdNote: boolean; effectiveEndDate: string };
}) {
  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>("all");
  const [branchSegment, setBranchSegment] = useState<"production" | "trial">("production");
  const [viewMode, setViewMode]           = useState<ViewMode>("card");
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handlePeriodChange = (month: number, year: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", month.toString());
    params.set("year", year.toString());
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const auditByBranchId = useMemo(() => {
    const map = new Map<string, any>();
    for (const a of audits) {
      if (a.tenant_apotek_id) map.set(String(a.tenant_apotek_id), a);
    }
    return map;
  }, [audits]);

  const prodBranches  = useMemo(() => branches.filter((b) => !b.is_trial), [branches]);
  const trialBranches = useMemo(() => branches.filter((b) => b.is_trial), [branches]);
  const activeBranches = branchSegment === "trial" ? trialBranches : prodBranches;

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = { all: activeBranches.length, DRAFT: 0, UNDER_REVIEW: 0, APPROVED: 0 };
    for (const b of activeBranches) {
      const audit = auditByBranchId.get(b.id);
      const s = String(audit?.status || "DRAFT") as StatusFilter;
      if (counts[s] !== undefined) counts[s]++;
    }
    return counts;
  }, [activeBranches, auditByBranchId]);

  const filteredBranches = useMemo(() => {
    const q = search.toLowerCase().trim();
    return activeBranches.filter((b) => {
      if (q) {
        const name = String(b.name ?? "").toLowerCase();
        const code = String(b.code ?? "").toLowerCase();
        if (!name.includes(q) && !code.includes(q)) return false;
      }
      if (statusFilter !== "all") {
        const audit = auditByBranchId.get(b.id);
        const s = String(audit?.status || "DRAFT");
        if (s !== statusFilter) return false;
      }
      return true;
    });
  }, [activeBranches, search, statusFilter, auditByBranchId]);

  const yearRange = useMemo(() => {
    const base = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => base - 2 + i);
  }, []);

  return (
    <div className="space-y-4">
      {/* ── Filter bar ─────────────────────────────────────────── */}
      <GlassCard variant="light" className="p-4">
        {/* Row 1: Search + Period + View toggle */}
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1 group">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-sky-500 transition-colors"
              size={16}
            />
            <input
              type="text"
              placeholder="Cari cabang atau kode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none transition-all text-sm font-bold text-slate-800 placeholder:font-normal placeholder:text-slate-400"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm w-full lg:w-auto">
            <CalendarDays size={15} className="text-slate-400 shrink-0" />
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Periode:</span>
            <select
              value={currentMonth}
              onChange={(e) => handlePeriodChange(parseInt(e.target.value), currentYear)}
              disabled={isPending}
              className="bg-transparent text-xs font-black text-slate-700 outline-none cursor-pointer hover:text-sky-600 transition-colors disabled:opacity-50"
            >
              {[...Array(12)].map((_, i) => (
                <option key={i + 1} value={i + 1}>Bulan {i + 1}</option>
              ))}
            </select>
            <div className="w-px h-4 bg-slate-200" />
            <select
              value={currentYear}
              onChange={(e) => handlePeriodChange(currentMonth, parseInt(e.target.value))}
              disabled={isPending}
              className="bg-transparent text-xs font-black text-slate-700 outline-none cursor-pointer hover:text-sky-600 transition-colors disabled:opacity-50"
            >
              {yearRange.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {isPending && <Loader2 size={14} className="animate-spin text-sky-500 ml-1 shrink-0" />}
          </div>

          {/* View toggle */}
          <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode("card")}
              title="Tampilan Kartu"
              className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                viewMode === "card" ? "bg-white text-sky-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              title="Tampilan Tabel"
              className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                viewMode === "table" ? "bg-white text-sky-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <LayoutList size={15} />
            </button>
          </div>
        </div>

        {/* Row 2: Segment + Status tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-3 pt-3 border-t border-slate-100">
          {/* Segment: Produksi / Trial */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => { setBranchSegment("production"); setStatusFilter("all"); }}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all",
                branchSegment === "production"
                  ? "bg-sky-600 text-white shadow-sm shadow-sky-600/20"
                  : "border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700",
              )}
            >
              Produksi
              <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-black tabular-nums", branchSegment === "production" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500")}>
                {prodBranches.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setBranchSegment("trial"); setStatusFilter("all"); }}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all",
                branchSegment === "trial"
                  ? "bg-amber-500 text-white shadow-sm shadow-amber-500/20"
                  : "border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700",
              )}
            >
              <FlaskConical size={12} />
              Trial
              <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-black tabular-nums", branchSegment === "trial" ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-500")}>
                {trialBranches.length}
              </span>
            </button>
          </div>

          <div className="hidden sm:block w-px h-4 bg-slate-200 mx-1 shrink-0" />

          {/* Status tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all",
                  statusFilter === tab.id
                    ? "bg-sky-600 text-white shadow-sm shadow-sky-600/20"
                    : "border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700",
                )}
              >
                {tab.label}
                <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-black tabular-nums", statusFilter === tab.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500")}>
                  {statusCounts[tab.id]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* ── CARD VIEW ─────────────────────────────────────────── */}
      {viewMode === "card" && (
        <>
          {filteredBranches.length === 0 ? (
            <EmptyState search={search} statusFilter={statusFilter} onReset={() => { setSearch(""); setStatusFilter("all"); }} />
          ) : (
            <AnimatedList className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredBranches.map((branch) => {
                const audit  = auditByBranchId.get(branch.id);
                const status = String(audit?.status || "DRAFT");
                const m      = branchMetrics[branch.id] ?? { targetOmzet: 0, omzetAchieved: 0, crewAdminCount: 0 };
                const { targetOmzet: target, omzetAchieved: achieved, crewAdminCount: crewAdminTotal } = m;
                const pct        = target > 0 ? (achieved / target) * 100 : null;
                const hasKpiV2   = Boolean(kpiV2ActiveByBranch[branch.id]);
                const noKpi      = target === 0;
                const noKaryawan = crewAdminTotal === 0;
                const statusHelp =
                  status === "APPROVED"    ? "Audit final, baris karyawan terkunci." :
                  status === "UNDER_REVIEW"? "Audit sedang ditinjau." :
                                             "Audit belum disetujui.";

                return (
                  <AnimatedListItem key={branch.id}>
                    <Link href={`/bba/audit/${branch.id}?month=${currentMonth}&year=${currentYear}`}>
                      <GlassCard
                        className={cn(
                          "p-5 h-full group cursor-pointer hover:border-sky-200 transition-all hover:shadow-lg hover:shadow-sky-600/5",
                          branchSegment === "trial" ? "border-amber-200/70 hover:shadow-amber-500/10 hover:border-amber-300" : "",
                        )}
                        variant="light"
                      >
                        <div className="flex flex-col gap-4">
                          {/* Header */}
                          <div className="flex justify-between items-start gap-3">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <div className="w-11 h-11 shrink-0 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-sky-50 group-hover:text-sky-600 transition-all border border-slate-100 group-hover:border-sky-100">
                                <TrendingUp size={20} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <h3 className="font-black text-slate-800 uppercase tracking-tight leading-snug group-hover:text-sky-700 transition-colors line-clamp-2" title={branch.name}>
                                  {branch.name}
                                </h3>
                                <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest truncate">
                                  {branch.code || "—"}
                                </p>
                                {branchSegment === "trial" && (
                                  <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-amber-700">
                                    <FlaskConical size={9} /> Trial
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <div
                                className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${getAuditStatusBadgeClass(status)}`}
                                title={`${statusHelp} SLA: review maksimal H+3.`}
                              >
                                {status === "APPROVED" ? <CheckCircle2 size={10} /> : status === "UNDER_REVIEW" ? <Eye size={10} /> : <AlertCircle size={10} />}
                                {getAuditStatusLabel(status)}
                              </div>
                              {hasKpiV2 && (
                                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[7px] font-black uppercase tracking-widest text-indigo-700" title="Skema KPI aktif.">
                                  KPI
                                </span>
                              )}
                              {noKpi && (
                                <span className="flex items-center gap-0.5 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[7px] font-black uppercase tracking-widest text-rose-600" title="Target omzet belum diatur.">
                                  <AlertTriangle size={8} /> KPI Belum Diatur
                                </span>
                              )}
                              {noKaryawan && (
                                <span className="flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[7px] font-black uppercase tracking-widest text-amber-700" title="Tidak ada karyawan aktif.">
                                  <AlertTriangle size={8} /> 0 Karyawan
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Metrics */}
                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5">
                              <p className="mb-0.5 text-[9px] font-bold uppercase tracking-tight text-slate-400">Target omzet</p>
                              <div className="flex items-center gap-1.5 min-h-[2rem]">
                                <Target size={12} className="shrink-0 text-slate-300" />
                                <span className="text-xs font-black leading-tight text-slate-800">{target > 0 ? formatIdr(target) : "—"}</span>
                              </div>
                            </div>
                            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5">
                              <p className="mb-0.5 text-[9px] font-bold uppercase tracking-tight text-slate-400">
                                {periodLabel.mtdNote ? "Omzet MTD" : "Omzet bulan"}
                              </p>
                              <div className="flex items-center gap-1.5 min-h-[2rem]">
                                <TrendingUp size={12} className="shrink-0 text-emerald-500" />
                                <span className="text-xs font-black leading-tight text-slate-800">{formatIdr(achieved)}</span>
                              </div>
                            </div>
                            <div className="col-span-2 rounded-xl border border-emerald-100/80 bg-emerald-50/40 p-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[9px] font-bold uppercase tracking-tight text-emerald-800/80">% vs target</p>
                                <span className={cn("text-sm font-black tabular-nums", pct == null ? "text-slate-400" : pct >= 100 ? "text-emerald-700" : pct >= 80 ? "text-amber-700" : "text-rose-700")}>
                                  {pct == null ? "—" : `${pct.toFixed(1)}%`}
                                </span>
                              </div>
                              {pct != null && (
                                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/70">
                                  <motion.div
                                    className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-500" : pct >= 80 ? "bg-amber-400" : "bg-rose-400")}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, pct)}%` }}
                                    transition={{ duration: 0.6, ease: "easeOut" }}
                                  />
                                </div>
                              )}
                              {periodLabel.mtdNote && (
                                <p className="mt-1.5 text-[8px] font-semibold text-emerald-900/50">
                                  Agregasi s/d {new Date(`${periodLabel.effectiveEndDate}T12:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border", noKaryawan ? "border-amber-200 bg-amber-50 text-amber-600" : "border-slate-200 bg-slate-100 text-slate-600")}>
                                <Users size={14} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Crew &amp; admin apotek</p>
                                <p className={cn("text-xs font-black tabular-nums", noKaryawan ? "text-amber-700" : "text-slate-800")}>{crewAdminTotal}</p>
                              </div>
                            </div>
                            <ChevronRight size={18} className="shrink-0 text-slate-300 transition-all group-hover:translate-x-1 group-hover:text-sky-500" />
                          </div>
                        </div>
                      </GlassCard>
                    </Link>
                  </AnimatedListItem>
                );
              })}
            </AnimatedList>
          )}
        </>
      )}

      {/* ── TABLE VIEW ─────────────────────────────────────────── */}
      {viewMode === "table" && (
        <GlassCard variant="light" className="p-0 overflow-hidden">
          {filteredBranches.length === 0 ? (
            <div className="py-12 px-4">
              <EmptyState search={search} statusFilter={statusFilter} onReset={() => { setSearch(""); setStatusFilter("all"); }} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-5 py-3.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Cabang</th>
                    <th className="px-4 py-3.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Status Audit</th>
                    <th className="px-4 py-3.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Target Omzet</th>
                    <th className="px-4 py-3.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">
                      {periodLabel.mtdNote ? "Omzet MTD" : "Omzet Bulan"}
                    </th>
                    <th className="px-4 py-3.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">% Target</th>
                    <th className="px-4 py-3.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">
                      <span className="flex items-center justify-center gap-1"><Users size={10} /> Crew</span>
                    </th>
                    <th className="px-4 py-3.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredBranches.map((branch) => {
                    const audit  = auditByBranchId.get(branch.id);
                    const status = String(audit?.status || "DRAFT");
                    const m      = branchMetrics[branch.id] ?? { targetOmzet: 0, omzetAchieved: 0, crewAdminCount: 0 };
                    const { targetOmzet: target, omzetAchieved: achieved, crewAdminCount: crew } = m;
                    const pct        = target > 0 ? (achieved / target) * 100 : null;
                    const noKaryawan = crew === 0;

                    return (
                      <tr key={branch.id} className="hover:bg-slate-50/60 transition-colors group">
                        {/* Cabang */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            {branchSegment === "trial" && <FlaskConical size={12} className="text-amber-500 shrink-0" />}
                            <div>
                              <p className="font-black text-slate-800 text-xs leading-tight group-hover:text-sky-600 transition-colors">{branch.name}</p>
                              <span className="text-[9px] font-black text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded mt-0.5 inline-block uppercase tracking-widest">{branch.code}</span>
                            </div>
                          </div>
                        </td>
                        {/* Status Audit */}
                        <td className="px-4 py-3.5">
                          <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${getAuditStatusBadgeClass(status)}`}>
                            {status === "APPROVED" ? <CheckCircle2 size={10} /> : status === "UNDER_REVIEW" ? <Eye size={10} /> : <AlertCircle size={10} />}
                            {getAuditStatusLabel(status)}
                          </div>
                        </td>
                        {/* Target Omzet */}
                        <td className="px-4 py-3.5 text-right">
                          <span className="text-xs font-black text-slate-700 tabular-nums">
                            {target > 0 ? formatIdrCompact(target) : <span className="text-slate-300 font-medium">—</span>}
                          </span>
                        </td>
                        {/* Omzet */}
                        <td className="px-4 py-3.5 text-right">
                          <span className={cn("text-xs font-black tabular-nums", achieved > 0 ? "text-slate-800" : "text-slate-300")}>
                            {formatIdrCompact(achieved)}
                          </span>
                        </td>
                        {/* % Target */}
                        <td className="px-4 py-3.5 min-w-[100px]">
                          {pct != null ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden min-w-[40px]">
                                <div
                                  className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-500" : pct >= 80 ? "bg-amber-400" : "bg-rose-400")}
                                  style={{ width: `${Math.min(100, pct)}%` }}
                                />
                              </div>
                              <span className={cn("text-[10px] font-black tabular-nums shrink-0", pct >= 100 ? "text-emerald-700" : pct >= 80 ? "text-amber-700" : "text-rose-600")}>
                                {pct.toFixed(1)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-300 font-medium">—</span>
                          )}
                        </td>
                        {/* Crew */}
                        <td className="px-4 py-3.5 text-center">
                          <span className={cn("text-xs font-black tabular-nums", noKaryawan ? "text-amber-600" : "text-slate-700")}>
                            {crew}
                          </span>
                        </td>
                        {/* Aksi */}
                        <td className="px-4 py-3.5">
                          <Link
                            href={`/bba/audit/${branch.id}?month=${currentMonth}&year=${currentYear}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-sky-600 hover:text-white border border-slate-200 hover:border-sky-600 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shadow-sm group/btn whitespace-nowrap"
                          >
                            Audit
                            <ChevronRight size={9} className="group-hover/btn:translate-x-0.5 transition-transform" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}

function EmptyState({
  search,
  statusFilter,
  onReset,
}: {
  search: string;
  statusFilter: StatusFilter;
  onReset: () => void;
}) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-16">
      <Search size={32} className="mb-3 opacity-30 text-slate-400" />
      <p className="text-sm font-black uppercase tracking-widest text-slate-500">Tidak ada cabang ditemukan</p>
      <p className="mt-1.5 text-xs font-medium text-slate-400">
        {search
          ? `Tidak ada cabang cocok dengan "${search}"`
          : `Tidak ada cabang berstatus ${STATUS_TABS.find((t) => t.id === statusFilter)?.label}`}
      </p>
      {(search || statusFilter !== "all") && (
        <button
          type="button"
          onClick={onReset}
          className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:border-sky-200 hover:text-sky-700"
        >
          Reset filter
        </button>
      )}
    </div>
  );
}
