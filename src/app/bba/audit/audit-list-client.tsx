"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useTransition } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import { Search, CalendarDays, Loader2, ChevronRight, CheckCircle2, AlertCircle, Eye, TrendingUp, Target, Users } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { getAuditStatusBadgeClass, getAuditStatusLabel } from "@/lib/labels";

function formatIdr(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

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
  const [search, setSearch] = useState("");
  const router = useRouter();
  const pathname = usePathname();
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

  const filteredBranches = branches.filter((b) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const name = String(b.name ?? "").toLowerCase();
    const code = String(b.code ?? "").toLowerCase();
    return name.includes(q) || code.includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row gap-6 items-center">
        <div className="relative flex-1 group w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-600 transition-colors" size={20} />
          <input
            type="text"
            placeholder="Cari cabang atau kode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-3xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-600 outline-none transition-all font-bold text-slate-800 shadow-sm"
          />
        </div>

        <div className="bg-slate-50 p-1.5 rounded-[28px] border border-slate-200 flex items-center gap-2 w-full lg:w-auto shadow-inner">
          <div className="px-4 flex items-center gap-2">
            <CalendarDays size={18} className="text-slate-400" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Periode Audit</span>
          </div>

          <div className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-slate-100 shadow-sm">
            <select
              value={currentMonth}
              onChange={(e) => handlePeriodChange(parseInt(e.target.value), currentYear)}
              disabled={isPending}
              className="bg-transparent text-xs font-black text-slate-700 px-3 py-2 outline-none cursor-pointer hover:text-emerald-600 transition-colors disabled:opacity-50"
            >
              {[...Array(12)].map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  Bulan {i + 1}
                </option>
              ))}
            </select>
            <div className="w-px h-5 bg-slate-100" />
            <select
              value={currentYear}
              onChange={(e) => handlePeriodChange(currentMonth, parseInt(e.target.value))}
              disabled={isPending}
              className="bg-transparent text-xs font-black text-slate-700 px-3 py-2 outline-none cursor-pointer hover:text-emerald-600 transition-colors disabled:opacity-50"
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            {isPending && <Loader2 size={16} className="animate-spin text-emerald-500 ml-2 mr-2" />}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {filteredBranches.map((branch) => {
            const audit = audits.find((a) => a.tenant_apotek_id === branch.id);
            const status = String(audit?.status || "DRAFT");
            const statusHelp =
              status === "APPROVED"
                ? "Approved: audit final, baris karyawan terkunci."
                : status === "UNDER_REVIEW"
                  ? "Under Review: audit sedang ditinjau dan dapat diperbarui."
                  : "Draft: audit belum disetujui.";
            const m = branchMetrics[branch.id] ?? { targetOmzet: 0, omzetAchieved: 0, crewAdminCount: 0 };
            const target = m.targetOmzet;
            const achieved = m.omzetAchieved;
            const pct = target > 0 ? (achieved / target) * 100 : null;
            const crewAdminTotal = m.crewAdminCount;
            const hasKpiV2 = Boolean(kpiV2ActiveByBranch[branch.id]);

            return (
              <motion.div
                layout
                key={branch.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <Link href={`/bba/audit/${branch.id}?month=${currentMonth}&year=${currentYear}`}>
                  <GlassCard
                    className="p-5 md:p-6 group cursor-pointer hover:border-emerald-200 transition-all hover:shadow-2xl hover:shadow-emerald-600/5 relative overflow-hidden"
                    variant="light"
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <div className="w-12 h-12 shrink-0 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-all border border-slate-100 group-hover:border-emerald-100 md:w-14 md:h-14">
                            <TrendingUp size={24} className="md:w-[28px] md:h-[28px]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3
                              className="font-black text-slate-800 uppercase tracking-tight leading-snug group-hover:text-emerald-700 transition-colors line-clamp-2"
                              title={branch.name}
                            >
                              {branch.name}
                            </h3>
                            <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest truncate">
                              {branch.code || "—"}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <div
                            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-widest ${getAuditStatusBadgeClass(
                              status,
                            )}`}
                            title={`${statusHelp} SLA rekomendasi: review maksimal H+3.`}
                          >
                            {status === "APPROVED" ? (
                              <CheckCircle2 size={10} />
                            ) : status === "UNDER_REVIEW" ? (
                              <Eye size={10} />
                            ) : (
                              <AlertCircle size={10} />
                            )}
                            {getAuditStatusLabel(status)}
                          </div>
                          {hasKpiV2 ? (
                            <span
                              className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[7px] font-black uppercase tracking-widest text-indigo-700"
                              title="Cabang memakai skema KPI aktif pada periode ini."
                            >
                              KPI
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-2.5 md:p-3">
                          <p className="mb-0.5 text-[8px] font-bold uppercase tracking-tight text-slate-400 md:text-[9px]">Target omzet</p>
                          <div className="flex items-center gap-1.5 min-h-[2.25rem]">
                            <Target size={12} className="shrink-0 text-slate-300" />
                            <span
                              className="text-[11px] font-black leading-tight text-slate-800 md:text-xs"
                              title={target > 0 ? String(target) : "Belum diatur"}
                            >
                              {target > 0 ? formatIdr(target) : "—"}
                            </span>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-2.5 md:p-3">
                          <p className="mb-0.5 text-[8px] font-bold uppercase tracking-tight text-slate-400 md:text-[9px]">
                            {periodLabel.mtdNote ? "Omzet MTD" : "Omzet bulan"}
                          </p>
                          <div className="flex items-center gap-1.5 min-h-[2.25rem]">
                            <TrendingUp size={12} className="shrink-0 text-emerald-500" />
                            <span className="text-[11px] font-black leading-tight text-slate-800 md:text-xs">{formatIdr(achieved)}</span>
                          </div>
                        </div>
                        <div className="col-span-2 rounded-2xl border border-emerald-100/80 bg-emerald-50/40 p-2.5 md:p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[8px] font-bold uppercase tracking-tight text-emerald-800/80 md:text-[9px]">% vs target</p>
                            <span
                              className={`text-sm font-black tabular-nums md:text-base ${pct == null ? "text-slate-400" : pct >= 100 ? "text-emerald-700" : pct >= 80 ? "text-amber-700" : "text-rose-700"}`}
                            >
                              {pct == null ? "—" : `${pct.toFixed(1)}%`}
                            </span>
                          </div>
                          {periodLabel.mtdNote ? (
                            <p className="mt-1 text-[8px] font-semibold text-emerald-900/50">
                              Agregasi s/d{" "}
                              {new Date(`${periodLabel.effectiveEndDate}T12:00:00`).toLocaleDateString("id-ID", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-600">
                            <Users size={14} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Crew &amp; admin apotek</p>
                            <p className="text-xs font-black tabular-nums text-slate-800">{crewAdminTotal}</p>
                          </div>
                        </div>
                        <ChevronRight size={18} className="shrink-0 text-slate-300 transition-all group-hover:translate-x-1 group-hover:text-emerald-500" />
                      </div>
                    </div>
                  </GlassCard>
                </Link>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
