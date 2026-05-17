"use client";

import { useId, useState } from "react";
import { Target, Users, User } from "lucide-react";
import { SchemeCard } from "../shared/SchemeCard";
import { WeightInputs } from "../shared/WeightInputs";
import { BonusTypeSelector } from "../shared/BonusTypeSelector";
import type { TeamSchemeConfig, KpiGlobalConfig } from "@/lib/types/kpi-v2";

interface TeamMonthlySchemeProps {
  config: TeamSchemeConfig;
  globalConfig: KpiGlobalConfig;
  onChange: (config: TeamSchemeConfig) => void;
}

export function TeamMonthlyScheme({ config, globalConfig, onChange }: TeamMonthlySchemeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const distributionGroupName = useId();

  return (
    <SchemeCard
      title="Bonus Team Bulanan"
      description="Target dan bonus dihitung berdasarkan performa kolektif team dalam 1 bulan"
      icon={<Target size={24} />}
      enabled={config.enabled}
      onToggle={(enabled) => onChange({ ...config, enabled })}
      isExpanded={isExpanded}
      onToggleExpand={() => setIsExpanded(!isExpanded)}
      iconBgColor="bg-emerald-50"
      iconTextColor="text-emerald-600"
    >
      <div className="space-y-6">
        {/* Min Achievement */}
        <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
            Minimum Pencapaian untuk Dapat Bonus
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              max={200}
              value={config.min_achievement_percent}
              onChange={(e) => onChange({ ...config, min_achievement_percent: parseInt(e.target.value, 10) || 100 })}
              className="w-24 px-4 py-2 bg-white border border-slate-200 rounded-xl text-lg font-black text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
            />
            <span className="text-lg font-black text-emerald-600">%</span>
            <span className="text-[10px] text-slate-500 font-medium">dari target global</span>
          </div>
        </div>

        {/* Weights */}
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

        {/* Bonus Type */}
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

        {/* Distribution Method */}
        <div className="space-y-3">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Cara Distribusi Bonus ke Anggota Team
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label
              className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                config.distribution_method === "equal"
                  ? "border-emerald-600 bg-emerald-50/30"
                  : "border-slate-100 bg-slate-50/50 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name={distributionGroupName}
                checked={config.distribution_method === "equal"}
                onChange={() => onChange({ ...config, distribution_method: "equal" })}
                className="w-5 h-5 text-emerald-600 focus:ring-emerald-500 border-slate-300"
              />
              <div className="flex items-center gap-3">
                <Users size={20} className="text-emerald-600" />
                <div>
                  <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Bagi Rata</p>
                  <p className="text-[10px] text-slate-500 font-medium">Semua dapat porsi sama</p>
                </div>
              </div>
            </label>

            <label
              className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                config.distribution_method === "proportional"
                  ? "border-emerald-600 bg-emerald-50/30"
                  : "border-slate-100 bg-slate-50/50 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name={distributionGroupName}
                checked={config.distribution_method === "proportional"}
                onChange={() => onChange({ ...config, distribution_method: "proportional" })}
                className="w-5 h-5 text-emerald-600 focus:ring-emerald-500 border-slate-300"
              />
              <div className="flex items-center gap-3">
                <User size={20} className="text-emerald-600" />
                <div>
                  <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Proporsional</p>
                  <p className="text-[10px] text-slate-500 font-medium">Sesuai kontribusi omzet</p>
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>
    </SchemeCard>
  );
}
