"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Calculator, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { CurrencyInput } from "@/components/shared/currency-input";
import type { KpiConfigV2, BaseSchemeConfig, IndividualUserConfig } from "@/lib/types/kpi-v2";

// ─── Pure calculation helpers ────────────────────────────────────────────────

function calcScore(
  actualOmzet: number,
  targetOmzet: number,
  scheme: BaseSchemeConfig,
  global: KpiConfigV2["global"],
): number {
  let score = 0;
  let totalWeight = 0;

  if (scheme.use_omzet && targetOmzet > 0) {
    score += (actualOmzet / targetOmzet) * 100 * (scheme.weight_omzet / 100);
    totalWeight += scheme.weight_omzet;
  }
  if (scheme.use_atv && global.is_atv_enabled) {
    score += 100 * (scheme.weight_atv / 100); // assume ATV hit 100%
    totalWeight += scheme.weight_atv;
  }
  if (scheme.use_atu && global.is_atu_enabled) {
    score += 100 * (scheme.weight_atu / 100); // assume ATU hit 100%
    totalWeight += scheme.weight_atu;
  }

  if (totalWeight === 0) return 0;
  if (Math.abs(totalWeight - 100) > 0.1) score = (score / totalWeight) * 100;
  return score;
}

function calcBonus(
  score: number,
  actualOmzet: number,
  targetOmzet: number,
  scheme: BaseSchemeConfig,
): number {
  if (score < scheme.min_achievement_percent) return 0;
  if (scheme.bonus_type === "flat") return scheme.flat_nominal;
  if (scheme.bonus_type === "kelipatan") {
    const excess = actualOmzet - targetOmzet;
    if (excess <= 0 || scheme.kelipatan_step <= 0) return 0;
    return Math.floor(excess / scheme.kelipatan_step) * scheme.kelipatan_reward;
  }
  return 0;
}

function mergeUserScheme(base: BaseSchemeConfig, uc: IndividualUserConfig): BaseSchemeConfig {
  return {
    ...base,
    weight_omzet: uc.weight_omzet ?? base.weight_omzet,
    weight_atv: uc.weight_atv ?? base.weight_atv,
    weight_atu: uc.weight_atu ?? base.weight_atu,
    bonus_type: uc.bonus_type ?? base.bonus_type,
    flat_nominal: uc.flat_nominal ?? base.flat_nominal,
    kelipatan_step: uc.kelipatan_step ?? base.kelipatan_step,
    kelipatan_reward: uc.kelipatan_reward ?? base.kelipatan_reward,
  };
}

// ─── Simulation engine ───────────────────────────────────────────────────────

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

function runSimulation(
  config: KpiConfigV2,
  users: Array<{ id: string; name: string }>,
  inputOmzet: number,
): SimResult {
  const g = config.global;
  const workingDays = g.default_working_days || 26;
  const n = users.length;
  const targetOmzet = g.target_omzet;

  const acc: Record<string, UserRow> = {};
  users.forEach((u) => {
    acc[u.id] = { userId: u.id, name: u.name, teamMonthly: 0, teamDaily: 0, indMonthly: 0, indDaily: 0, total: 0 };
  });

  // ── Team monthly ──────────────────────────────────────────────────────────
  const tm = config.team_monthly;
  const tmScore = tm.enabled ? calcScore(inputOmzet, targetOmzet, tm, g) : 0;
  const tmPool = tm.enabled ? calcBonus(tmScore, inputOmzet, targetOmzet, tm) : 0;
  if (n > 0 && tmPool > 0) users.forEach((u) => { acc[u.id].teamMonthly = tmPool / n; });

  const teamMonthly: SchemeDetail = {
    enabled: tm.enabled,
    score: tmScore,
    minPercent: tm.min_achievement_percent,
    achieved: tmScore >= tm.min_achievement_percent,
    pool: tmPool,
    note: tm.distribution_method === "proportional"
      ? "Mode proporsional — simulasi pakai distribusi rata (data per user tidak tersedia)"
      : `Total pool dibagi rata ke ${n} pegawai`,
  };

  // ── Team daily ────────────────────────────────────────────────────────────
  const td = config.team_daily;
  const dailyTarget = workingDays > 0 ? targetOmzet / workingDays : 0;
  const dailyActual = workingDays > 0 ? inputOmzet / workingDays : 0;
  const tdScore = td.enabled && dailyTarget > 0 ? calcScore(dailyActual, dailyTarget, td, g) : 0;
  const tdDayBonus = td.enabled ? calcBonus(tdScore, dailyActual, dailyTarget, td) : 0;
  const tdDaysAchieved = tdScore >= td.min_achievement_percent ? workingDays : 0;
  const tdPool = tdDayBonus * tdDaysAchieved;
  if (n > 0 && tdPool > 0) users.forEach((u) => { acc[u.id].teamDaily = tdPool / n; });

  const teamDaily: DailySchemeDetail = {
    enabled: td.enabled,
    score: tdScore,
    minPercent: td.min_achievement_percent,
    achieved: tdScore >= td.min_achievement_percent,
    pool: tdPool,
    daysAchieved: tdDaysAchieved,
    workingDays,
    note: `Omzet diasumsikan merata ${workingDays} hari kerja`,
  };

  // ── Individual monthly ───────────────────────────────────────────────────
  const im = config.individual_monthly;
  let imPool = 0;
  let imAvgScore = 0;

  if (im.enabled && n > 0) {
    const ucs = im.user_configs ?? {};
    if (im.target_distribution === "rata") {
      const perTarget = targetOmzet / n;
      const perActual = inputOmzet / n;
      const score = calcScore(perActual, perTarget, im, g);
      const bonus = calcBonus(score, perActual, perTarget, im);
      users.forEach((u) => { acc[u.id].indMonthly = bonus; });
      imPool = bonus * n;
      imAvgScore = score;
    } else {
      const totalManualTarget = users.reduce(
        (s, u) => s + (ucs[u.id]?.target_omzet ?? targetOmzet / n),
        0,
      );
      users.forEach((u) => {
        const uc = ucs[u.id];
        const uTarget = uc?.target_omzet ?? targetOmzet / n;
        const uActual = totalManualTarget > 0 ? inputOmzet * (uTarget / totalManualTarget) : 0;
        const effectiveScheme = uc ? mergeUserScheme(im, uc) : im;
        const score = calcScore(uActual, uTarget, effectiveScheme, g);
        const bonus = calcBonus(score, uActual, uTarget, effectiveScheme);
        acc[u.id].indMonthly = bonus;
        imPool += bonus;
        imAvgScore += score;
      });
      imAvgScore = imAvgScore / n;
    }
  }

  const indMonthly: SchemeDetail = {
    enabled: im.enabled,
    score: imAvgScore,
    minPercent: im.min_achievement_percent,
    achieved: imAvgScore >= im.min_achievement_percent,
    pool: imPool,
    note: im.target_distribution === "rata"
      ? "Target dibagi rata ke semua pegawai"
      : "Target manual per pegawai — distribusi omzet proporsional",
  };

  // ── Individual daily ─────────────────────────────────────────────────────
  const id_ = config.individual_daily;
  let idPool = 0;
  let idAvgScore = 0;
  let idAvgDays = 0;

  if (id_.enabled && n > 0) {
    const ucs = id_.user_configs ?? {};
    users.forEach((u) => {
      const uc = ucs[u.id];
      const uWorkingDays = uc?.working_days ?? workingDays;
      const uDailyTarget =
        id_.target_distribution === "rata"
          ? targetOmzet / n / uWorkingDays
          : (uc?.target_omzet_daily ?? targetOmzet / n / uWorkingDays);
      const uDailyActual = inputOmzet / n / uWorkingDays;
      const score = uDailyTarget > 0 ? calcScore(uDailyActual, uDailyTarget, id_, g) : 0;
      const dayBonus = calcBonus(score, uDailyActual, uDailyTarget, id_);
      const daysAchieved = score >= id_.min_achievement_percent ? uWorkingDays : 0;
      acc[u.id].indDaily = dayBonus * daysAchieved;
      idPool += acc[u.id].indDaily;
      idAvgScore += score;
      idAvgDays += daysAchieved;
    });
    idAvgScore = idAvgScore / n;
    idAvgDays = idAvgDays / n;
  }

  const indDaily: DailySchemeDetail = {
    enabled: id_.enabled,
    score: idAvgScore,
    minPercent: id_.min_achievement_percent,
    achieved: idAvgScore >= id_.min_achievement_percent,
    pool: idPool,
    daysAchieved: idAvgDays,
    workingDays,
    note: "Omzet diasumsikan merata tiap hari & tiap pegawai",
  };

  // ── Totals ────────────────────────────────────────────────────────────────
  users.forEach((u) => {
    const r = acc[u.id];
    r.total = r.teamMonthly + r.teamDaily + r.indMonthly + r.indDaily;
  });

  return { rows: users.map((u) => acc[u.id]), teamMonthly, teamDaily, indMonthly, indDaily };
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
          const { createPortal } = require("react-dom");
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
