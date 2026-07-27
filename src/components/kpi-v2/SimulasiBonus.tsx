"use client";

import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Calculator, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { CurrencyInput } from "@/components/shared/currency-input";
import type { KpiConfigV2 } from "@/lib/types/kpi-v2";
import {
  calculateMonthlyBonusFromInputs,
  type BonusResult,
  type CrewAchievementRow,
  type DailyAchievementRow,
} from "@/lib/kpi-v2/calculator";

// ─── Simulation engine ───────────────────────────────────────────────────────
// Memakai calculator PRODUKSI (calculateMonthlyBonusFromInputs) atas input SINTETIS
// agar angka simulasi = angka bayaran nyata. Asumsi: omzet tersebar merata tiap
// pegawai & hari kerja; ATV/ATU dianggap tercapai 100%.

type UserRow = {
  userId: string;
  name: string;
  teamMonthly: number;
  teamDaily: number;
  indMonthly: number;
  indDaily: number;
  total: number;
};

type SchemeDetail = {
  enabled: boolean;
  score: number;
  minPercent: number;
  achieved: boolean;
  pool: number;
  note: string;
};

type DailySchemeDetail = SchemeDetail & { daysAchieved: number; workingDays: number };

type SimResult = {
  rows: UserRow[];
  teamMonthly: SchemeDetail;
  teamDaily: DailySchemeDetail;
  indMonthly: SchemeDetail;
  indDaily: DailySchemeDetail;
};

const avg = (nums: number[]): number => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

function runSimulation(
  config: KpiConfigV2,
  users: Array<{ id: string; name: string }>,
  inputOmzet: number,
): SimResult {
  const g = config.global;
  const workingDays = Math.max(1, g.default_working_days || 26);
  const n = users.length;

  const emptyScheme = (enabled: boolean): SchemeDetail => ({
    enabled, score: 0, minPercent: 0, achieved: false, pool: 0, note: "",
  });
  const emptyDaily = (enabled: boolean): DailySchemeDetail => ({
    ...emptyScheme(enabled), daysAchieved: 0, workingDays,
  });
  if (n === 0) {
    return {
      rows: [],
      teamMonthly: emptyScheme(config.team_monthly.enabled),
      teamDaily: emptyDaily(config.team_daily.enabled),
      indMonthly: emptyScheme(config.individual_monthly.enabled),
      indDaily: emptyDaily(config.individual_daily.enabled),
    };
  }

  // ── Input sintetis: omzet disebar merata tiap pegawai & hari; ATV/ATU 100% ──
  const perUserPerDay = inputOmzet / n / workingDays;
  const targetAtv = g.is_atv_enabled && g.target_atv > 0 ? g.target_atv : 0;
  const targetAtu = g.is_atu_enabled && g.target_atu > 0 ? g.target_atu : 0;
  const txPerDay = targetAtv > 0 ? perUserPerDay / targetAtv : 1; // ATV = omzet/tx = target
  const itemsPerDay = targetAtu > 0 ? txPerDay * targetAtu : txPerDay; // ATU = items/tx = target

  const crewAchievements: CrewAchievementRow[] = [];
  const dailyAchievements: DailyAchievementRow[] = [];
  for (let d = 1; d <= workingDays; d++) {
    const dateKey = `sim-${String(d).padStart(4, "0")}`;
    for (const u of users) {
      crewAchievements.push({
        user_id: u.id, achievement_date: dateKey,
        omzet: perUserPerDay, transactions: txPerDay, items: itemsPerDay,
      });
    }
    dailyAchievements.push({
      achievement_date: dateKey,
      total_omzet: perUserPerDay * n, total_transactions: txPerDay * n, total_items: itemsPerDay * n,
    });
  }

  const results = calculateMonthlyBonusFromInputs(config, dailyAchievements, crewAchievements, {
    activeCrewCount: n,
  });
  const byUser = new Map<string, BonusResult>(results.map((r) => [r.user_id, r]));

  const rows: UserRow[] = users.map((u) => {
    const br = byUser.get(u.id);
    return {
      userId: u.id,
      name: u.name,
      teamMonthly: br?.team_monthly_bonus ?? 0,
      teamDaily: br?.team_daily_bonus ?? 0,
      indMonthly: br?.individual_monthly_bonus ?? 0,
      indDaily: br?.individual_daily_bonus ?? 0,
      total: br?.total_bonus ?? 0,
    };
  });

  const scoreOf = (pick: (b: BonusResult["breakdown"]) => { achievement_percent: number } | undefined) =>
    avg(results.map((r) => pick(r.breakdown)?.achievement_percent).filter((x): x is number => typeof x === "number"));

  const tmScore = scoreOf((b) => b.team_monthly);
  const teamMonthly: SchemeDetail = {
    enabled: config.team_monthly.enabled,
    score: tmScore,
    minPercent: config.team_monthly.min_achievement_percent,
    achieved: tmScore >= config.team_monthly.min_achievement_percent,
    pool: rows.reduce((s, r) => s + r.teamMonthly, 0),
    note: config.team_monthly.distribution_method === "proportional"
      ? "Mode proporsional — omzet disebar merata di simulasi"
      : `Pool dibagi ke ${n} pegawai`,
  };

  const tdPool = rows.reduce((s, r) => s + r.teamDaily, 0);
  const tdScore = scoreOf((b) => b.team_daily);
  const teamDaily: DailySchemeDetail = {
    enabled: config.team_daily.enabled,
    score: tdScore,
    minPercent: config.team_daily.min_achievement_percent,
    achieved: tdPool > 0,
    pool: tdPool,
    daysAchieved: Math.round((tdScore / 100) * workingDays),
    workingDays,
    note: `Omzet diasumsikan merata ${workingDays} hari kerja`,
  };

  const imScore = scoreOf((b) => b.individual_monthly);
  const indMonthly: SchemeDetail = {
    enabled: config.individual_monthly.enabled,
    score: imScore,
    minPercent: config.individual_monthly.min_achievement_percent,
    achieved: imScore >= config.individual_monthly.min_achievement_percent,
    pool: rows.reduce((s, r) => s + r.indMonthly, 0),
    note: config.individual_monthly.target_distribution === "rata"
      ? "Target dibagi rata ke semua pegawai"
      : "Target manual per pegawai",
  };

  const idPool = rows.reduce((s, r) => s + r.indDaily, 0);
  const idScore = scoreOf((b) => b.individual_daily);
  const indDaily: DailySchemeDetail = {
    enabled: config.individual_daily.enabled,
    score: idScore,
    minPercent: config.individual_daily.min_achievement_percent,
    achieved: idPool > 0,
    pool: idPool,
    daysAchieved: Math.round((idScore / 100) * workingDays),
    workingDays,
    note: "Omzet diasumsikan merata tiap hari & tiap pegawai",
  };

  return { rows, teamMonthly, teamDaily, indMonthly, indDaily };
}

// ─── UI Helpers ──────────────────────────────────────────────────────────────

const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const pct = (n: number) => `${n.toFixed(1)}%`;

function SchemeCard({
  label,
  detail,
  daily,
}: {
  label: string;
  detail: SchemeDetail | DailySchemeDetail;
  daily?: boolean;
}) {
  if (!detail.enabled) {
    return (
      <div className="p-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center">
        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{label}</p>
        <p className="text-xs text-slate-300 mt-1">Tidak aktif</p>
      </div>
    );
  }

  const achieved = detail.achieved;
  return (
    <div className={`p-4 rounded-2xl border ${achieved ? "border-emerald-100 bg-emerald-50/40" : "border-rose-100 bg-rose-50/30"}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
        <div className={`flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-full ${achieved ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"}`}>
          {achieved ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
          {achieved ? "Tercapai" : "Tidak Tercapai"}
        </div>
      </div>
      <p className="text-xl font-black text-slate-800">{fmt(detail.pool)}</p>
      <p className={`text-xs font-bold mt-1 ${achieved ? "text-emerald-600" : "text-rose-500"}`}>
        {pct(detail.score)} pencapaian (min. {pct(detail.minPercent)})
      </p>
      {daily && "daysAchieved" in detail && (
        <p className="text-[10px] text-slate-400 font-bold mt-1">
          {detail.daysAchieved} / {detail.workingDays} hari tercapai
        </p>
      )}
      <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">{detail.note}</p>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SimulasiBonus({
  config,
  users,
}: {
  config: KpiConfigV2;
  users: Array<{ id: string; name: string }>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputOmzet, setInputOmzet] = useState(0);

  const result = useMemo(
    () => (isOpen && users.length > 0 ? runSimulation(config, users, inputOmzet) : null),
    [isOpen, config, users, inputOmzet],
  );

  const grandTotal = result ? result.rows.reduce((s, r) => s + r.total, 0) : 0;
  const overallScore = config.global.target_omzet > 0
    ? (inputOmzet / config.global.target_omzet) * 100
    : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-sm text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100 transition-colors"
      >
        <Calculator size={16} />
        Simulasi Bonus
      </button>

      {typeof document !== "undefined" &&
        (() => {
          return createPortal(
            <AnimatePresence>
              {isOpen && (
                <div className="fixed inset-0 z-[120] flex items-start justify-center p-3 sm:p-6 overflow-y-auto">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsOpen(false)}
                    className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 24 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 24 }}
                    transition={{ type: "spring", damping: 28, stiffness: 380 }}
                    className="relative my-4 w-full max-w-4xl bg-white rounded-[32px] border border-slate-100 shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)]"
                  >
                    {/* Header */}
                    <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/60">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center shadow-lg shadow-sky-600/30 rotate-3">
                          <Calculator size={24} />
                        </div>
                        <div>
                          <h3 className="font-black text-slate-800 text-lg uppercase tracking-tight">
                            Simulasi Estimasi Bonus
                          </h3>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            Hypothetical — bukan data aktual
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsOpen(false)}
                        className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-400 flex items-center justify-center transition-all"
                      >
                        <X size={20} />
                      </button>
                    </div>

                    {/* Scrollable body */}
                    <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">

                      {/* Input section */}
                      <div className="flex flex-col sm:flex-row sm:items-end gap-6">
                        <div className="flex-1 space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            Total Omzet yang Dicapai (Rp)
                          </label>
                          <CurrencyInput
                            value={inputOmzet}
                            onChange={(v) => setInputOmzet(v)}
                            className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-sky-500/10 focus:border-sky-500 outline-none transition-all font-black text-slate-800 text-lg"
                          />
                        </div>

                        {/* Quick stats */}
                        <div className="flex gap-4 sm:shrink-0">
                          <div className="text-center">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Target</p>
                            <p className="text-sm font-black text-slate-700">{fmt(config.global.target_omzet)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Pencapaian</p>
                            <p className={`text-sm font-black ${overallScore >= 100 ? "text-emerald-600" : overallScore >= 80 ? "text-amber-500" : "text-rose-500"}`}>
                              {pct(overallScore)}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Gap</p>
                            <p className={`text-sm font-black flex items-center gap-0.5 ${inputOmzet >= config.global.target_omzet ? "text-emerald-600" : "text-rose-500"}`}>
                              {inputOmzet >= config.global.target_omzet ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                              {fmt(Math.abs(inputOmzet - config.global.target_omzet))}
                            </p>
                          </div>
                        </div>
                      </div>

                      {result && (
                        <>
                          {/* Scheme cards */}
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <SchemeCard label="Tim Bulanan" detail={result.teamMonthly} />
                            <SchemeCard label="Tim Harian" detail={result.teamDaily} daily />
                            <SchemeCard label="Ind. Bulanan" detail={result.indMonthly} />
                            <SchemeCard label="Ind. Harian" detail={result.indDaily} daily />
                          </div>

                          {/* Per-user table */}
                          <div className="rounded-2xl border border-slate-100 overflow-hidden">
                            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
                              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                Estimasi Per Pegawai
                              </p>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs min-w-[600px]">
                                <thead>
                                  <tr className="border-b border-slate-50">
                                    <th className="text-left px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Pegawai</th>
                                    {result.teamMonthly.enabled && (
                                      <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Tim Bln</th>
                                    )}
                                    {result.teamDaily.enabled && (
                                      <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Tim Hr</th>
                                    )}
                                    {result.indMonthly.enabled && (
                                      <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Ind. Bln</th>
                                    )}
                                    {result.indDaily.enabled && (
                                      <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Ind. Hr</th>
                                    )}
                                    <th className="text-right px-5 py-3 text-[9px] font-black text-sky-600 uppercase tracking-widest">Total Bonus</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {result.rows.map((row) => (
                                    <tr key={row.userId} className="hover:bg-slate-50/50">
                                      <td className="px-5 py-3 font-bold text-slate-800">{row.name}</td>
                                      {result.teamMonthly.enabled && (
                                        <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">
                                          {row.teamMonthly > 0 ? fmt(row.teamMonthly) : <Minus size={12} className="inline text-slate-300" />}
                                        </td>
                                      )}
                                      {result.teamDaily.enabled && (
                                        <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">
                                          {row.teamDaily > 0 ? fmt(row.teamDaily) : <Minus size={12} className="inline text-slate-300" />}
                                        </td>
                                      )}
                                      {result.indMonthly.enabled && (
                                        <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">
                                          {row.indMonthly > 0 ? fmt(row.indMonthly) : <Minus size={12} className="inline text-slate-300" />}
                                        </td>
                                      )}
                                      {result.indDaily.enabled && (
                                        <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">
                                          {row.indDaily > 0 ? fmt(row.indDaily) : <Minus size={12} className="inline text-slate-300" />}
                                        </td>
                                      )}
                                      <td className="px-5 py-3 text-right">
                                        <span className="font-black text-sky-700 whitespace-nowrap">{fmt(row.total)}</span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="bg-sky-50 border-t-2 border-sky-100">
                                    <td colSpan={
                                      1 +
                                      (result.teamMonthly.enabled ? 1 : 0) +
                                      (result.teamDaily.enabled ? 1 : 0) +
                                      (result.indMonthly.enabled ? 1 : 0) +
                                      (result.indDaily.enabled ? 1 : 0)
                                    } className="px-5 py-3.5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                      Total Estimasi Bonus Seluruh Pegawai
                                    </td>
                                    <td className="px-5 py-3.5 text-right">
                                      <span className="text-base font-black text-sky-700 whitespace-nowrap">{fmt(grandTotal)}</span>
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        </>
                      )}

                      {/* Disclaimer */}
                      <div className="flex gap-3 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                        <Info size={14} className="text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-amber-800 leading-relaxed font-medium">
                          Simulasi ini bersifat estimasi. ATV dan ATU diasumsikan tercapai 100%. Skema harian
                          mengasumsikan omzet tersebar merata tiap hari. Hasil aktual bergantung pada data
                          submission nyata dan distribusi omzet per pegawai.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>,
            document.body,
          );
        })()}
    </>
  );
}
