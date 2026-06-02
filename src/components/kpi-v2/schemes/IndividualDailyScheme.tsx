"use client";

import { useId, useMemo, useState } from "react";
import { Calendar, DollarSign, AlertCircle, CheckCircle2 } from "lucide-react";
import { SchemeCard } from "../shared/SchemeCard";
import { BonusTypeSelector } from "../shared/BonusTypeSelector";
import { CurrencyInput } from "@/components/shared/currency-input";
import { InfoTooltip } from "@/components/shared/info-tooltip";
import type { IndividualSchemeConfig, IndividualUserConfig, KpiGlobalConfig } from "@/lib/types/kpi-v2";
import { calculateDailyTargetPerUser } from "@/lib/kpi-v2/utils";

export interface IndividualDailySchemeProps {
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

function CompactUserBonusBlockDaily({
  groupName,
  uc,
  onPatch,
}: {
  groupName: string;
  uc: IndividualUserConfig;
  onPatch: (patch: Partial<IndividualUserConfig>) => void;
}) {
  const bonusType = uc.bonus_type ?? "flat";
  return (
    <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4 space-y-3 shadow-sm">
      <p className="text-[9px] font-black text-violet-700 uppercase tracking-widest">Bonus per orang</p>
      <div className="flex flex-wrap gap-2">
        <label
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-black uppercase cursor-pointer ${
            bonusType === "flat" ? "border-violet-600 bg-white text-violet-900" : "border-violet-100 bg-white/80 text-violet-500"
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
            bonusType === "kelipatan" ? "border-violet-600 bg-white text-violet-900" : "border-violet-100 bg-white/80 text-violet-500"
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
          <span className="text-[9px] font-black text-violet-600 uppercase tracking-widest">Nominal (Rp)</span>
          <CurrencyInput
            value={uc.flat_nominal ?? 0}
            onChange={(val) => onPatch({ flat_nominal: val })}
            className="w-full px-3 py-2 bg-white border border-violet-100 rounded-xl text-sm font-black text-slate-800"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <span className="text-[9px] font-black text-violet-600 uppercase tracking-widest">Step (Rp)</span>
            <CurrencyInput
              value={uc.kelipatan_step ?? 0}
              onChange={(val) => onPatch({ kelipatan_step: val })}
              className="w-full px-3 py-2 bg-white border border-violet-100 rounded-xl text-sm font-black text-slate-800"
            />
          </div>
          <div className="space-y-1">
            <span className="text-[9px] font-black text-violet-600 uppercase tracking-widest">Reward (Rp)</span>
            <CurrencyInput
              value={uc.kelipatan_reward ?? 0}
              onChange={(val) => onPatch({ kelipatan_reward: val })}
              className="w-full px-3 py-2 bg-white border border-violet-100 rounded-xl text-sm font-black text-slate-800"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function IndividualDailyScheme({
  config,
  globalConfig,
  activeUsers,
  onChange,
}: IndividualDailySchemeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const distributionGroupName = useId();
  const bonusGroupBase = useId();

  const activeIdSet = useMemo(() => new Set(activeUsers.map((u) => u.id)), [activeUsers]);

  const crewCount = Math.max(activeUsers.length, 1);
  const rataDailyExample = calculateDailyTargetPerUser(
    globalConfig.target_omzet,
    crewCount,
    globalConfig.default_working_days,
  );

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

  const omzetValid = config.target_distribution === "manual" ? totalDistributedOmzet === globalConfig.target_omzet : true;

  const displayName = (userId: string) => {
    const row = activeUsers.find((u) => u.id === userId);
    return row?.app_users?.full_name?.trim() || "Pegawai nonaktif";
  };

  const effectiveDailyForUser = (userId: string) => {
    const wdRaw = config.user_configs[userId]?.working_days;
    const wd =
      typeof wdRaw === "number" && Number.isFinite(wdRaw) && wdRaw > 0
        ? wdRaw
        : globalConfig.default_working_days;
    const monthly = getUserConfig(userId, "target_omzet", 0);
    const override = config.user_configs[userId]?.target_omzet_daily;
    if (typeof override === "number" && Number.isFinite(override) && override > 0) return override;
    if (wd <= 0) return 0;
    return monthly / wd;
  };

  return (
    <SchemeCard
      title="Bonus Individu Harian"
      description="Bonus harian per personil berdasarkan pencapaian target harian masing-masing"
      icon={<Calendar size={24} />}
      enabled={config.enabled}
      onToggle={(enabled) => onChange({ ...config, enabled })}
      isExpanded={isExpanded}
      onToggleExpand={() => setIsExpanded(!isExpanded)}
      iconBgColor="bg-purple-50"
      iconTextColor="text-purple-600"
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <label className="text-[10px] font-black text-violet-700 uppercase tracking-widest flex items-center gap-1">
            Distribusi target individu
            <InfoTooltip content="Bagi Rata Otomatis: target harian per orang dihitung otomatis dari target global ÷ jumlah crew ÷ hari kerja default. Kustomisasi Manual: atur porsi omzet bulanan dan hari kerja per orang, target harian dihitung dari porsi tersebut." />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label
              className={`flex items-center gap-4 p-4 rounded-3xl border-2 transition-all cursor-pointer shadow-sm ${
                config.target_distribution === "rata"
                  ? "border-violet-600 bg-violet-50/40"
                  : "border-slate-100 bg-slate-50/50 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name={distributionGroupName}
                checked={config.target_distribution === "rata"}
                onChange={() => onChange({ ...config, target_distribution: "rata" })}
                className="w-5 h-5 text-violet-600 focus:ring-violet-500 border-slate-300"
              />
              <div>
                <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Bagi Rata Otomatis</p>
                <p className="text-[10px] text-slate-500 font-medium">Target harian dihitung otomatis dari global</p>
              </div>
            </label>
            <label
              className={`flex items-center gap-4 p-4 rounded-3xl border-2 transition-all cursor-pointer shadow-sm ${
                config.target_distribution === "manual"
                  ? "border-violet-600 bg-violet-50/40"
                  : "border-slate-100 bg-slate-50/50 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name={distributionGroupName}
                checked={config.target_distribution === "manual"}
                onChange={() => onChange({ ...config, target_distribution: "manual" })}
                className="w-5 h-5 text-violet-600 focus:ring-violet-500 border-slate-300"
              />
              <div>
                <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Kustomisasi Manual</p>
                <p className="text-[10px] text-slate-500 font-medium">Atur porsi bulanan & hari kerja per orang</p>
              </div>
            </label>
          </div>
        </div>

        {config.target_distribution === "rata" ? (
          <div className="space-y-6">
            <div className="rounded-3xl border border-violet-100 bg-violet-50/50 p-5 shadow-sm space-y-2">
              <p className="text-[10px] font-black text-violet-800 uppercase tracking-widest">Perhitungan target harian (rata)</p>
              <p className="text-sm text-slate-700 font-medium leading-relaxed">
                Target harian per personil ={" "}
                <span className="font-black text-violet-800">Target omzet global</span> ÷{" "}
                <span className="font-black text-violet-800">Jumlah crew</span> ÷{" "}
                <span className="font-black text-violet-800">Hari kerja default</span>.
              </p>
              <p className="text-xs text-slate-600 font-medium">
                Contoh dengan nilai saat ini: Rp {globalConfig.target_omzet.toLocaleString("id-ID")} ÷ {crewCount} ÷{" "}
                {globalConfig.default_working_days} ={" "}
                <span className="font-black text-violet-700">Rp {rataDailyExample.toLocaleString("id-ID")}</span> / hari /
                orang.
              </p>
              <p className="text-[10px] text-violet-700 font-bold uppercase tracking-widest pt-1">
                Skema harian hanya memakai omzet (tanpa bobot ATV/ATU).
              </p>
            </div>
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
                const uc = config.user_configs[userId] ?? {};
                const wdDisplay = getUserConfig(userId, "working_days", globalConfig.default_working_days);
                const daily = effectiveDailyForUser(userId);
                const hasOverride =
                  typeof uc.target_omzet_daily === "number" && Number.isFinite(uc.target_omzet_daily) && uc.target_omzet_daily > 0;

                return (
                  <div
                    key={userId}
                    className={`bg-white rounded-3xl p-6 border border-violet-100 shadow-sm space-y-4 ${
                      isActive ? "" : "opacity-70 grayscale"
                    }`}
                  >
                    <div className="flex items-center gap-4 mb-2">
                      <div className="w-12 h-12 rounded-2xl bg-violet-100 text-violet-800 flex items-center justify-center font-black text-sm border-2 border-white shadow-sm">
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-violet-700 uppercase tracking-widest flex items-center gap-1">
                          <DollarSign size={10} /> Porsi target omzet bulanan (Rp)
                        </label>
                        <CurrencyInput
                          value={getUserConfig(userId, "target_omzet", 0)}
                          onChange={(val) => updateUserConfig(userId, "target_omzet", val)}
                          className="w-full px-4 py-3 bg-violet-50/50 border border-violet-100 rounded-2xl text-sm font-black text-slate-800"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-violet-700 uppercase tracking-widest">
                          Hari kerja (override)
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
                          className="w-full px-4 py-3 bg-violet-50/50 border border-violet-100 rounded-2xl text-sm font-black text-slate-800"
                        />
                        <p className="text-[10px] text-slate-500 font-medium">Default cabang: {globalConfig.default_working_days} hari</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-violet-100 bg-violet-50/30 p-4 shadow-sm">
                      <p className="text-[9px] font-black text-violet-700 uppercase tracking-widest mb-1">Target harian Anda</p>
                      <p className="text-2xl font-black text-violet-800">Rp {Math.round(daily).toLocaleString("id-ID")}</p>
                      <p className="text-[10px] text-slate-600 font-medium mt-1">
                        {hasOverride
                          ? "Menggunakan nilai override target harian."
                          : `= Rp ${getUserConfig(userId, "target_omzet", 0).toLocaleString("id-ID")} ÷ ${wdDisplay} hari kerja`}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-violet-700 uppercase tracking-widest flex items-center gap-1">
                        Override target harian (Rp, opsional)
                        <InfoTooltip content="Jika diisi, nilai ini menggantikan hasil perhitungan otomatis (porsi omzet bulanan ÷ hari kerja). Gunakan jika target harian pegawai ini berbeda dari pembagian normal. Isi 0 untuk memakai perhitungan otomatis." />
                      </label>
                      <CurrencyInput
                        value={typeof uc.target_omzet_daily === "number" ? uc.target_omzet_daily : 0}
                        onChange={(val) => updateUserConfig(userId, "target_omzet_daily", val > 0 ? val : 0)}
                        className="w-full px-4 py-3 bg-white border border-violet-100 rounded-2xl text-sm font-black text-slate-800"
                      />
                      <p className="text-[10px] text-slate-500 font-medium">Isi 0 untuk memakai perhitungan otomatis di atas.</p>
                    </div>

                    <CompactUserBonusBlockDaily
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
