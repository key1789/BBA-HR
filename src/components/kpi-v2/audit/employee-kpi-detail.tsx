"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Info } from "lucide-react";
import type { BonusResult } from "@/lib/kpi-v2/calculator";
import type { KpiConfigV2 } from "@/lib/types/kpi-v2";
import { getKpiV2SchemesEnabledForPeriod, type KpiV2SchemeId } from "@/lib/kpi-v2/utils";
import { calculateDailyTargetPerUser, calculateTeamDailyTarget } from "@/lib/kpi-v2/utils";
import type { IndividualSchemeConfig, TeamSchemeConfig } from "@/lib/types/kpi-v2";
import { cn } from "@/lib/utils";

export const KPI_V2_SCHEME_LABELS: Record<KpiV2SchemeId, string> = {
  team_monthly: "Tim (bulanan)",
  team_daily: "Tim (harian)",
  individual_monthly: "Individu (bulanan)",
  individual_daily: "Individu (harian)",
};

type FormatFn = (val: number | null | undefined) => string;

function bonusTypeLabel(type: string | undefined) {
  return type === "kelipatan" ? "Kelipatan omzet" : "Flat";
}

function distributionLabel(method: string | undefined) {
  return method === "proportional" ? "Proporsional omzet" : "Rata (equal)";
}

function targetDistLabel(dist: string | undefined) {
  return dist === "manual" ? "Manual per orang" : "Rata (equal)";
}

function parseTeamDailyDaysFromNotes(notes: string | undefined): number | null {
  if (!notes) return null;
  const m = notes.match(/(\d+)\s+hari\s+memenuhi\s+syarat/i);
  return m ? Number(m[1]) : null;
}

export function getIndividualDailyDayStats(
  userId: string,
  config: KpiConfigV2,
  crewRows: Array<{ user_id: string; achievement_date: string; omzet: number }>,
): { daysWithData: number; daysAchieved: number } {
  const scheme = config.individual_daily;
  if (!scheme.enabled) return { daysWithData: 0, daysAchieved: 0 };

  const activeUserCount = new Set(crewRows.map((c) => c.user_id)).size || 1;
  const userConfig = scheme.user_configs?.[userId];
  const wdGlobal = config.global.default_working_days || 26;
  const workingDays = userConfig?.working_days ?? wdGlobal;
  let dailyTarget = 0;

  if (userConfig?.target_omzet_daily != null) {
    dailyTarget = Number(userConfig.target_omzet_daily) || 0;
  } else if (scheme.target_distribution === "rata") {
    dailyTarget = calculateDailyTargetPerUser(config.global.target_omzet, activeUserCount, workingDays);
  } else {
    dailyTarget = calculateDailyTargetPerUser(config.global.target_omzet, 1, workingDays);
  }

  const minPct = scheme.min_achievement_percent;
  const byDate = new Map<string, number>();
  for (const r of crewRows) {
    if (String(r.user_id) !== String(userId)) continue;
    const dk = String(r.achievement_date ?? "").slice(0, 10);
    if (!dk) continue;
    byDate.set(dk, (byDate.get(dk) ?? 0) + Number(r.omzet ?? 0));
  }

  let daysAchieved = 0;
  for (const omzet of byDate.values()) {
    if (dailyTarget > 0 && (omzet / dailyTarget) * 100 >= minPct) daysAchieved++;
  }
  return { daysWithData: byDate.size, daysAchieved };
}

export function getTeamDailyDayStats(
  config: KpiConfigV2,
  dailyRows: Array<{ achievement_date: string; total_omzet: number }>,
  crewRows: Array<{ user_id: string; achievement_date: string }>,
  userId: string,
  notesFromBreakdown?: string,
): { daysWithData: number; daysAchieved: number } {
  const scheme = config.team_daily;
  if (!scheme.enabled) return { daysWithData: 0, daysAchieved: 0 };

  const dailyTarget = calculateTeamDailyTarget(
    config.global.target_omzet,
    config.global.default_working_days || 26,
  );
  const minPct = scheme.min_achievement_percent;

  let teamDaysAchieved = parseTeamDailyDaysFromNotes(notesFromBreakdown);
  if (teamDaysAchieved == null) {
    teamDaysAchieved = 0;
    for (const d of dailyRows) {
      if (dailyTarget <= 0) continue;
      const pct = (Number(d.total_omzet ?? 0) / dailyTarget) * 100;
      if (pct >= minPct) teamDaysAchieved++;
    }
  }

  const userDates = new Set<string>();
  for (const r of crewRows) {
    if (String(r.user_id) !== String(userId)) continue;
    const dk = String(r.achievement_date ?? "").slice(0, 10);
    if (dk) userDates.add(dk);
  }

  return { daysWithData: userDates.size, daysAchieved: teamDaysAchieved };
}

function SchemeConfigSummary({
  schemeId,
  config,
  formatIDR,
}: {
  schemeId: KpiV2SchemeId;
  config: KpiConfigV2;
  formatIDR: FormatFn;
}) {
  const scheme = config[schemeId] as TeamSchemeConfig | IndividualSchemeConfig;
  const isIndividual = schemeId === "individual_monthly" || schemeId === "individual_daily";

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Metrik capaian</p>
          <p className="mt-1 font-semibold text-slate-800">
            {[
              scheme.use_omzet ? `Omzet ${scheme.weight_omzet}%` : null,
              scheme.use_atv && config.global.is_atv_enabled ? `ATV ${scheme.weight_atv}%` : null,
              scheme.use_atu && config.global.is_atu_enabled ? `ATU ${scheme.weight_atu}%` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Syarat minimum</p>
          <p className="mt-1 font-semibold text-slate-800">{scheme.min_achievement_percent}% capaian</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Jenis bonus</p>
          <p className="mt-1 font-semibold text-slate-800">{bonusTypeLabel(scheme.bonus_type)}</p>
          {scheme.bonus_type === "flat" ? (
            <p className="text-[11px] text-slate-600">Nominal: {formatIDR(scheme.flat_nominal)}</p>
          ) : (
            <p className="text-[11px] text-slate-600">
              Step {formatIDR(scheme.kelipatan_step)} · Reward {formatIDR(scheme.kelipatan_reward)}
            </p>
          )}
        </div>
        {!isIndividual ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Distribusi bonus tim</p>
            <p className="mt-1 font-semibold text-slate-800">
              {distributionLabel((scheme as TeamSchemeConfig).distribution_method)}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Distribusi target</p>
            <p className="mt-1 font-semibold text-slate-800">
              {targetDistLabel((scheme as IndividualSchemeConfig).target_distribution)}
            </p>
          </div>
        )}
      </div>
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 text-[11px] text-indigo-900">
        <p className="font-black uppercase tracking-widest text-[9px] text-indigo-600">Target global cabang (periode)</p>
        <p className="mt-1 font-semibold">
          Omzet {formatIDR(config.global.target_omzet)}
          {config.global.is_atv_enabled ? ` · ATV ${formatIDR(config.global.target_atv)}` : ""}
          {config.global.is_atu_enabled ? ` · ATU ${config.global.target_atu}` : ""}
        </p>
        <p className="mt-1 text-indigo-800/80">Hari kerja default: {config.global.default_working_days} hari</p>
      </div>
    </div>
  );
}

function KpiSchemeReadOnlyModal({
  open,
  onClose,
  schemeId,
  config,
  formatIDR,
}: {
  open: boolean;
  onClose: () => void;
  schemeId: KpiV2SchemeId | null;
  config: KpiConfigV2;
  formatIDR: FormatFn;
}) {
  if (!open || !schemeId) return null;

  const content = (
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        aria-label="Tutup"
        onClick={onClose}
      />
      <div className="relative z-[201] flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Syarat skema KPI</p>
            <h3 className="text-lg font-black text-slate-900">{KPI_V2_SCHEME_LABELS[schemeId]}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 custom-scrollbar">
          <SchemeConfigSummary schemeId={schemeId} config={config} formatIDR={formatIDR} />
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl bg-slate-800 px-4 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-900"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}

export function EmployeeUnifiedPerformanceCard({
  employeeName,
  employeeOmzet,
  targetAssigned,
  achievementPercent,
  branchMtdOmzet,
  contributionPct,
  periodLabel,
  formatIDR,
}: {
  employeeName: string;
  employeeOmzet: number;
  targetAssigned: number;
  achievementPercent: number;
  branchMtdOmzet: number;
  contributionPct: number;
  periodLabel: string;
  formatIDR: FormatFn;
}) {
  const pctTone =
    achievementPercent >= 100
      ? "text-emerald-700"
      : achievementPercent >= 80
        ? "text-amber-700"
        : "text-slate-800";

  return (
    <div className="overflow-hidden rounded-2xl border border-indigo-100/80 bg-gradient-to-br from-white via-indigo-50/30 to-white shadow-sm">
      <div className="border-b border-indigo-100/60 bg-indigo-50/40 px-5 py-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Performa & capaian</p>
        <p className="mt-0.5 text-sm font-black text-slate-900">{employeeName}</p>
        <p className="mt-1 text-[11px] font-semibold text-slate-500">{periodLabel}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Omzet karyawan</p>
          <p className="mt-1 text-xl font-black tabular-nums text-slate-900">{formatIDR(employeeOmzet)}</p>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target individu</p>
          <p className="mt-1 text-xl font-black tabular-nums text-slate-900">{formatIDR(targetAssigned)}</p>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Capaian vs target</p>
          <p className={cn("mt-1 text-xl font-black tabular-nums", pctTone)}>{achievementPercent.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Kontribusi ke cabang</p>
          <p className="mt-1 text-xl font-black tabular-nums text-indigo-700">{contributionPct.toFixed(1)}%</p>
          <p className="mt-1 text-[10px] font-semibold text-slate-500">Omzet cabang {formatIDR(branchMtdOmzet)}</p>
        </div>
      </div>
    </div>
  );
}

export function EmployeeKpiBonusSection({
  config,
  v2BonusRow,
  userId,
  totalKpiBonus,
  crewRows,
  dailyRows,
  formatIDR,
}: {
  config: KpiConfigV2;
  v2BonusRow: BonusResult | null;
  userId: string;
  totalKpiBonus: number;
  crewRows: Array<{ user_id: string; achievement_date: string; omzet: number }>;
  dailyRows: Array<{ achievement_date: string; total_omzet: number }>;
  formatIDR: FormatFn;
}) {
  const enabledSchemes = getKpiV2SchemesEnabledForPeriod(config);
  const [schemeModalId, setSchemeModalId] = useState<KpiV2SchemeId | null>(null);

  if (enabledSchemes.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Bonus KPI (V2)</p>
        <p className="mt-2 text-xs font-semibold text-slate-500">Tidak ada skema KPI V2 aktif untuk periode ini.</p>
      </div>
    );
  }

  const isMonthly = (id: KpiV2SchemeId) => id === "team_monthly" || id === "individual_monthly";

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Bonus KPI (skema aktif)</p>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              Perhitungan sama dengan kalkulator audit ({enabledSchemes.length} skema)
            </p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-2 text-right">
            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Σ Total bonus KPI</p>
            <p className="text-lg font-black tabular-nums text-emerald-800">{formatIDR(totalKpiBonus)}</p>
          </div>
        </div>

        <div className="space-y-3">
          {enabledSchemes.map((schemeId) => {
            const bd = v2BonusRow?.breakdown?.[schemeId];
            const schemeCfg = config[schemeId];
            const typeLabel = bonusTypeLabel(schemeCfg.bonus_type);

            if (isMonthly(schemeId)) {
              return (
                <div
                  key={schemeId}
                  className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-slate-800">{KPI_V2_SCHEME_LABELS[schemeId]}</p>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{typeLabel}</p>
                    <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <div>
                        <span className="text-[9px] font-black uppercase text-slate-400">Capaian</span>
                        <p className="text-sm font-black tabular-nums text-indigo-800">
                          {bd != null ? `${bd.achievement_percent.toFixed(1)}%` : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-[9px] font-black uppercase text-slate-400">Target</span>
                        <p className="text-sm font-black tabular-nums text-slate-800">
                          {bd != null ? formatIDR(bd.target) : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-[9px] font-black uppercase text-slate-400">Bonus</span>
                        <p className="text-sm font-black tabular-nums text-emerald-700">
                          {bd != null ? formatIDR(bd.bonus_earned) : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSchemeModalId(schemeId)}
                    className="shrink-0 self-start rounded-lg border border-indigo-100 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-700 hover:bg-indigo-50"
                  >
                    Lihat syarat lengkap
                  </button>
                </div>
              );
            }

            const notes = bd?.notes;
            const dayStats =
              schemeId === "team_daily"
                ? getTeamDailyDayStats(config, dailyRows, crewRows, userId, notes)
                : getIndividualDailyDayStats(userId, config, crewRows);

            return (
              <div
                key={schemeId}
                className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-slate-800">{KPI_V2_SCHEME_LABELS[schemeId]}</p>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{typeLabel}</p>
                  <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div>
                      <span className="text-[9px] font-black uppercase text-slate-400">Hari tercapai</span>
                      <p className="text-sm font-black tabular-nums text-indigo-800">
                        {dayStats.daysAchieved} / {dayStats.daysWithData}
                      </p>
                      <p className="text-[10px] font-medium text-slate-500">hari dengan data</p>
                    </div>
                    <div>
                      <span className="text-[9px] font-black uppercase text-slate-400">Target harian</span>
                      <p className="text-sm font-black tabular-nums text-slate-800">
                        {bd != null ? formatIDR(bd.target) : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-[9px] font-black uppercase text-slate-400">Total bonus</span>
                      <p className="text-sm font-black tabular-nums text-emerald-700">
                        {bd != null ? formatIDR(bd.bonus_earned) : formatIDR(0)}
                      </p>
                    </div>
                  </div>
                  {notes ? (
                    <p className="mt-2 flex items-start gap-1 text-[10px] font-medium text-slate-500">
                      <Info size={12} className="mt-0.5 shrink-0" />
                      {notes}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setSchemeModalId(schemeId)}
                  className="shrink-0 self-start rounded-lg border border-indigo-100 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-700 hover:bg-indigo-50"
                >
                  Lihat syarat lengkap
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <KpiSchemeReadOnlyModal
        open={schemeModalId != null}
        schemeId={schemeModalId}
        config={config}
        formatIDR={formatIDR}
        onClose={() => setSchemeModalId(null)}
      />
    </>
  );
}
