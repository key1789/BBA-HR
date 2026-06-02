"use client";

import { useId, useMemo, useState } from "react";
import { User, DollarSign, TrendingUp, Target, AlertCircle, CheckCircle2 } from "lucide-react";
import { SchemeCard } from "../shared/SchemeCard";
import { WeightInputs } from "../shared/WeightInputs";
import { BonusTypeSelector } from "../shared/BonusTypeSelector";
import { CurrencyInput } from "@/components/shared/currency-input";
import { InfoTooltip } from "@/components/shared/info-tooltip";
import type {
  BonusType,
  IndividualSchemeConfig,
  IndividualUserConfig,
  KpiGlobalConfig,
} from "@/lib/types/kpi-v2";

export interface IndividualMonthlySchemeProps {
  config: IndividualSchemeConfig;
  globalConfig: KpiGlobalConfig;
  activeUsers: Array<{ id: string; app_users: { full_name: string } }>;
  onChange: (config: IndividualSchemeConfig) => void;
}

function initialsFromName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function CompactUserBonusBlock({
  groupName,
  uc,
  onPatch,
}: {
  groupName: string;
  uc: IndividualUserConfig;
  onPatch: (patch: Partial<IndividualUserConfig>) => void;
}) {
  const bonusType: BonusType = uc.bonus_type ?? "flat";
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 space-y-3 shadow-sm">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Bonus per orang</p>
      <div className="flex flex-wrap gap-2">
        <label
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-black uppercase cursor-pointer ${
            bonusType === "flat" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-500"
          }`}
        >
          <input
            type="radio"
            name={groupName}
            checked={bonusType === "flat"}
            onChange={() => onPatch({ bonus_type: "flat" })}
            className="sr-only"
          />
          Flat
        </label>
        <label
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-black uppercase cursor-pointer ${
            bonusType === "kelipatan" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-500"
          }`}
        >
          <input
            type="radio"
            name={groupName}
            checked={bonusType === "kelipatan"}
            onChange={() => onPatch({ bonus_type: "kelipatan" })}
            className="sr-only"
          />
          Kelipatan
        </label>
      </div>
      {bonusType === "flat" ? (
        <div className="space-y-1">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nominal (Rp)</span>
          <CurrencyInput
            value={uc.flat_nominal ?? 0}
            onChange={(val) => onPatch({ flat_nominal: val })}
            className="w-full px-3 py-2 bg-white border border-slate-100 rounded-xl text-sm font-black text-slate-800"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Step (Rp)</span>
            <CurrencyInput
              value={uc.kelipatan_step ?? 0}
              onChange={(val) => onPatch({ kelipatan_step: val })}
              className="w-full px-3 py-2 bg-white border border-slate-100 rounded-xl text-sm font-black text-slate-800"
            />
          </div>
          <div className="space-y-1">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Reward (Rp)</span>
            <CurrencyInput
              value={uc.kelipatan_reward ?? 0}
              onChange={(val) => onPatch({ kelipatan_reward: val })}
              className="w-full px-3 py-2 bg-white border border-slate-100 rounded-xl text-sm font-black text-slate-800"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function IndividualMonthlyScheme({
  config,
  globalConfig,
  activeUsers,
  onChange,
}: IndividualMonthlySchemeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const distributionGroupName = useId();
  const bonusGroupBase = useId();

  const activeIdSet = useMemo(() => new Set(activeUsers.map((u) => u.id)), [activeUsers]);

  const updateUserConfig = (userId: string, key: keyof IndividualUserConfig, value: unknown) => {
    const prev = config.user_configs[userId] ?? {};
    onChange({
      ...config,
      user_configs: {
        ...config.user_configs,
        [userId]: { ...prev, [key]: value },
      },
    });
  };

  const getUserConfig = (userId: string, key: keyof IndividualUserConfig, fallback: number): number => {
    const raw = config.user_configs[userId]?.[key];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim() !== "") {
      const n = parseFloat(raw);
      if (Number.isFinite(n)) return n;
    }
    return fallback;
  };

  const allUserIds = useMemo(() => {
    const s = new Set<string>();
    activeUsers.forEach((u) => s.add(u.id));
    Object.keys(config.user_configs).forEach((k) => s.add(k));
    return Array.from(s);
  }, [activeUsers, config.user_configs]);

  const totalDistributedOmzet = useMemo(() => {
    let sum = 0;
    for (const uid of allUserIds) {
      const raw = config.user_configs[uid]?.target_omzet;
      if (typeof raw === "number" && Number.isFinite(raw)) sum += raw;
    }
    return sum;
  }, [allUserIds, config.user_configs]);

  // Total hari kerja seluruh crew untuk hitung saran proporsional di manual mode
  const sumAllWorkingDays = useMemo(() => {
    return allUserIds.reduce((sum, uid) => {
      const raw = config.user_configs[uid]?.working_days;
      const days =
        typeof raw === "number" && Number.isFinite(raw) && raw > 0
          ? raw
          : globalConfig.default_working_days;
      return sum + days;
    }, 0);
  }, [allUserIds, config.user_configs, globalConfig.default_working_days]);

  const omzetValid = totalDistributedOmzet === globalConfig.target_omzet;

  const displayName = (userId: string) => {
    const row = activeUsers.find((u) => u.id === userId);
    return row?.app_users?.full_name?.trim() || "Pegawai nonaktif";
  };

  return (
    <SchemeCard
      title="Bonus Individu Bulanan"
      description="Target dan bonus per personil berdasarkan performa individual bulanan"
      icon={<User size={24} />}
      enabled={config.enabled}
      onToggle={(enabled) => onChange({ ...config, enabled })}
      isExpanded={isExpanded}
      onToggleExpand={() => setIsExpanded(!isExpanded)}
      iconBgColor="bg-indigo-50"
      iconTextColor="text-indigo-600"
    >
      <div className="space-y-6">
        {/* Target distribution */}
        <div className="space-y-3">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
            Distribusi target individu
            <InfoTooltip content="Bagi Rata Otomatis: target global dibagi sama rata ke semua crew dengan bobot dan skema bonus yang seragam. Kustomisasi Manual: atur target omzet, hari kerja, bobot metrik, dan nominal bonus secara individual per orang." />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label
              className={`flex items-center gap-4 p-4 rounded-3xl border-2 transition-all cursor-pointer shadow-sm ${
                config.target_distribution === "rata"
                  ? "border-indigo-600 bg-indigo-50/30"
                  : "border-slate-100 bg-slate-50/50 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name={distributionGroupName}
                checked={config.target_distribution === "rata"}
                onChange={() => onChange({ ...config, target_distribution: "rata" })}
                className="w-5 h-5 text-indigo-600 focus:ring-indigo-500 border-slate-300"
              />
              <div>
                <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Bagi Rata Otomatis</p>
                <p className="text-[10px] text-slate-500 font-medium">Target & bobot bonus sama untuk semua crew</p>
              </div>
            </label>
            <label
              className={`flex items-center gap-4 p-4 rounded-3xl border-2 transition-all cursor-pointer shadow-sm ${
                config.target_distribution === "manual"
                  ? "border-indigo-600 bg-indigo-50/30"
                  : "border-slate-100 bg-slate-50/50 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name={distributionGroupName}
                checked={config.target_distribution === "manual"}
                onChange={() => onChange({ ...config, target_distribution: "manual" })}
                className="w-5 h-5 text-indigo-600 focus:ring-indigo-500 border-slate-300"
              />
              <div>
                <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Kustomisasi Manual</p>
                <p className="text-[10px] text-slate-500 font-medium">Atur target, hari kerja, bobot, dan bonus per orang</p>
              </div>
            </label>
          </div>
        </div>

        {config.target_distribution === "rata" ? (
          <div className="space-y-6">
            {/* ── Rata mode — fixed formula description ── */}
            <div className="rounded-3xl border border-indigo-100 bg-indigo-50/40 p-4 shadow-sm space-y-2">
              <p className="text-[10px] font-black text-indigo-800 uppercase tracking-widest">Perhitungan target (rata)</p>
              <p className="text-sm text-slate-700 font-medium leading-relaxed">
                Target masing-masing ={" "}
                <span className="font-black text-indigo-700">target global ÷ jumlah crew aktif</span>.
                Hanya yang mencapai target individunya yang mendapatkan bonus.
              </p>
              <p className="text-xs text-slate-600 font-medium">
                Saat ini: Rp {globalConfig.target_omzet.toLocaleString("id-ID")} ÷{" "}
                {Math.max(activeUsers.length, 1)} crew ={" "}
                <span className="font-black text-indigo-700">
                  Rp {Math.round(globalConfig.target_omzet / Math.max(activeUsers.length, 1)).toLocaleString("id-ID")}
                </span>{" "}
                / orang / bulan
              </p>
            </div>
            <WeightInputs
              weightOmzet={config.weight_omzet}
              weightAtv={config.weight_atv}
              weightAtu={config.weight_atu}
              onChangeOmzet={(val) => onChange({ ...config, weight_omzet: val })}
              onChangeAtv={(val) => onChange({ ...config, weight_atv: val })}
              onChangeAtu={(val) => onChange({ ...config, weight_atu: val })}
              isAtvEnabled={globalConfig.is_atv_enabled}
              isAtuEnabled={globalConfig.is_atu_enabled}
            />
            <BonusTypeSelector
              bonusType={config.bonus_type}
              flatNominal={config.flat_nominal}
              kelipatanStep={config.kelipatan_step}
              kelipatanReward={config.kelipatan_reward}
              onChangeBonusType={(type) => onChange({ ...config, bonus_type: type })}
              onChangeFlatNominal={(val) => onChange({ ...config, flat_nominal: val })}
              onChangeKelipatanStep={(val) => onChange({ ...config, kelipatan_step: val })}
              onChangeKelipatanReward={(val) => onChange({ ...config, kelipatan_reward: val })}
            />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Validasi total omzet terdistribusi */}
            <div
              className={`rounded-3xl p-5 border-2 flex gap-4 items-center shadow-sm transition-colors ${
                omzetValid ? "bg-emerald-50/50 border-emerald-100" : "bg-amber-50/50 border-amber-200"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  omzetValid ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
                }`}
              >
                {omzetValid ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Validasi omzet manual</p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 mt-1 text-sm font-black text-slate-800">
                  <span>
                    Global:{" "}
                    <span className="text-slate-500">Rp {globalConfig.target_omzet.toLocaleString("id-ID")}</span>
                  </span>
                  <span>
                    Terdistribusi:{" "}
                    <span className={omzetValid ? "text-emerald-600" : "text-amber-600"}>
                      Rp {totalDistributedOmzet.toLocaleString("id-ID")}
                    </span>
                  </span>
                  {!omzetValid && (
                    <span className="text-rose-600">
                      Selisih: Rp {(globalConfig.target_omzet - totalDistributedOmzet).toLocaleString("id-ID")}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {allUserIds.map((userId) => {
                const isActive = activeIdSet.has(userId);
                const name = displayName(userId);
                const colorClass = "bg-indigo-100 text-indigo-700";
                const uc = config.user_configs[userId] ?? {};

                const wdDisplay = getUserConfig(userId, "working_days", globalConfig.default_working_days);
                const suggestedTarget =
                  sumAllWorkingDays > 0
                    ? Math.round(globalConfig.target_omzet * (wdDisplay / sumAllWorkingDays))
                    : Math.round(globalConfig.target_omzet / Math.max(allUserIds.length, 1));

                return (
                  <div
                    key={userId}
                    className={`bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4 ${
                      isActive ? "" : "opacity-70 grayscale"
                    }`}
                  >
                    {/* Nama crew */}
                    <div className="flex items-center gap-4 mb-2">
                      <div
                        className={`w-12 h-12 rounded-2xl ${colorClass} flex items-center justify-center font-black text-sm border-2 border-white shadow-sm`}
                      >
                        {initialsFromName(name)}
                      </div>
                      <div>
                        <p className="font-black text-slate-800 text-base uppercase tracking-tight">{name}</p>
                        {!isActive && (
                          <span className="mt-1 inline-block px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-[9px] font-black uppercase">
                            Resigned / Nonaktif
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Hari kerja + saran proporsional */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          Hari Kerja / Bulan
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={wdDisplay}
                          onChange={(e) =>
                            updateUserConfig(
                              userId,
                              "working_days",
                              parseInt(e.target.value, 10) || globalConfig.default_working_days,
                            )
                          }
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black text-slate-800"
                        />
                        <p className="text-[10px] text-slate-500 font-medium">
                          Default cabang: {globalConfig.default_working_days} hari
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                          Saran target proporsional
                          <InfoTooltip content="Target yang disarankan berdasarkan proporsi hari kerja pegawai ini terhadap total hari kerja semua crew. Pegawai yang lebih banyak bekerja mendapat porsi target yang lebih besar." />
                        </p>
                        <div className="px-4 py-3 bg-indigo-50/60 border border-indigo-100 rounded-2xl">
                          <p className="text-sm font-black text-indigo-700">
                            Rp {suggestedTarget.toLocaleString("id-ID")}
                          </p>
                          <p className="text-[10px] text-slate-500 font-medium">
                            {wdDisplay} hr ÷ {sumAllWorkingDays} hr total × target global
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateUserConfig(userId, "target_omzet", suggestedTarget)}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                          ↑ Terapkan ke target omzet
                        </button>
                      </div>
                    </div>

                    {/* Target omzet, ATV, ATU */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                          <DollarSign size={10} /> Target omzet (Rp)
                        </label>
                        <CurrencyInput
                          value={getUserConfig(userId, "target_omzet", 0)}
                          onChange={(val) => updateUserConfig(userId, "target_omzet", val)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black text-slate-800"
                        />
                      </div>
                      {globalConfig.is_atv_enabled && (
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            <TrendingUp size={10} /> Target ATV (Rp)
                          </label>
                          <CurrencyInput
                            value={getUserConfig(userId, "target_atv", 0)}
                            onChange={(val) => updateUserConfig(userId, "target_atv", val)}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black text-slate-800"
                          />
                        </div>
                      )}
                      {globalConfig.is_atu_enabled && (
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            <Target size={10} /> Target ATU
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={getUserConfig(userId, "target_atu", 0)}
                            onChange={(e) =>
                              updateUserConfig(userId, "target_atu", parseFloat(e.target.value) || 0)
                            }
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black text-slate-800"
                          />
                        </div>
                      )}
                    </div>

                    {/* Bobot per metrik */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Bobot omzet %</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={getUserConfig(userId, "weight_omzet", 100)}
                          onChange={(e) =>
                            updateUserConfig(userId, "weight_omzet", parseInt(e.target.value, 10) || 0)
                          }
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black text-slate-800"
                        />
                      </div>
                      {globalConfig.is_atv_enabled && (
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Bobot ATV %</label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={getUserConfig(userId, "weight_atv", 0)}
                            onChange={(e) =>
                              updateUserConfig(userId, "weight_atv", parseInt(e.target.value, 10) || 0)
                            }
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black text-slate-800"
                          />
                        </div>
                      )}
                      {globalConfig.is_atu_enabled && (
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Bobot ATU %</label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={getUserConfig(userId, "weight_atu", 0)}
                            onChange={(e) =>
                              updateUserConfig(userId, "weight_atu", parseInt(e.target.value, 10) || 0)
                            }
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black text-slate-800"
                          />
                        </div>
                      )}
                    </div>

                    <CompactUserBonusBlock
                      groupName={`${bonusGroupBase}-${userId}`}
                      uc={uc}
                      onPatch={(patch) => {
                        const prev = config.user_configs[userId] ?? {};
                        onChange({
                          ...config,
                          user_configs: {
                            ...config.user_configs,
                            [userId]: { ...prev, ...patch },
                          },
                        });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </SchemeCard>
  );
}
