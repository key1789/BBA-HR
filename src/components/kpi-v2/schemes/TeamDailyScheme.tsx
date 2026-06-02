"use client";

import { useId, useState } from "react";
import { Calendar } from "lucide-react";
import { SchemeCard } from "../shared/SchemeCard";
import { BonusTypeSelector } from "../shared/BonusTypeSelector";
import { InfoTooltip } from "@/components/shared/info-tooltip";
import type { TeamSchemeConfig, KpiGlobalConfig } from "@/lib/types/kpi-v2";
import { calculateTeamDailyTarget } from "@/lib/kpi-v2/utils";

interface TeamDailySchemeProps {
  config: TeamSchemeConfig;
  globalConfig: KpiGlobalConfig;
  onChange: (config: TeamSchemeConfig) => void;
}

export function TeamDailyScheme({ config, globalConfig, onChange }: TeamDailySchemeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const distributionGroupName = useId();

  const dailyTarget = calculateTeamDailyTarget(
    globalConfig.target_omzet,
    globalConfig.default_working_days,
  );

  return (
    <SchemeCard
      title="Bonus Team Harian"
      description="Bonus diberikan setiap hari jika team mencapai target harian"
      icon={<Calendar size={24} />}
      enabled={config.enabled}
      onToggle={(enabled) => onChange({ ...config, enabled })}
      isExpanded={isExpanded}
      onToggleExpand={() => setIsExpanded(!isExpanded)}
      iconBgColor="bg-sky-50"
      iconTextColor="text-sky-600"
    >
      <div className="space-y-6">
        {/* Daily Target Info */}
        <div className="bg-sky-50/50 rounded-2xl p-4 border border-sky-100">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
            Target Harian Team (Auto-calculated)
          </p>
          <p className="text-2xl font-black text-sky-600">Rp {dailyTarget.toLocaleString("id-ID")}</p>
          <p className="text-[10px] text-slate-500 font-medium mt-1">
            = Target Bulanan (Rp {globalConfig.target_omzet.toLocaleString("id-ID")}) / {globalConfig.default_working_days}{" "}
            hari
          </p>
        </div>

        {/* Min Achievement */}
        <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
            Minimum Pencapaian untuk Dapat Bonus (Per Hari)
            <InfoTooltip content="Persentase pencapaian harian minimum agar bonus hari itu cair. Contoh: 80% berarti team harus mencapai minimal 80% dari target harian untuk mendapatkan bonus di hari itu." />
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              max={200}
              value={config.min_achievement_percent}
              onChange={(e) => onChange({ ...config, min_achievement_percent: parseInt(e.target.value, 10) || 100 })}
              className="w-24 px-4 py-2 bg-white border border-slate-200 rounded-xl text-lg font-black text-slate-800 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all outline-none"
            />
            <span className="text-lg font-black text-sky-600">%</span>
            <span className="text-[10px] text-slate-500 font-medium">dari target harian</span>
          </div>
        </div>

        {/* Weights - Only Omzet for daily */}
        <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Target Komponen</p>
          <p className="text-sm text-slate-600 font-medium">
            Target harian hanya menggunakan <span className="font-black text-emerald-600">Omzet</span> sebagai komponen.
          </p>
        </div>

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
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
            Cara Distribusi Bonus Harian ke Anggota Team
            <InfoTooltip content="Bagi Rata: bonus harian dibagi sama rata ke semua crew yang hadir. Proporsional: dibagi sesuai kontribusi omzet masing-masing crew di hari itu." />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label
              className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                config.distribution_method === "equal"
                  ? "border-sky-600 bg-sky-50/30"
                  : "border-slate-100 bg-slate-50/50 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name={distributionGroupName}
                checked={config.distribution_method === "equal"}
                onChange={() => onChange({ ...config, distribution_method: "equal" })}
                className="w-5 h-5 text-sky-600 focus:ring-sky-500 border-slate-300"
              />
              <div>
                <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Bagi Rata</p>
                <p className="text-[10px] text-slate-500 font-medium">Semua dapat porsi sama</p>
              </div>
            </label>

            <label
              className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                config.distribution_method === "proportional"
                  ? "border-sky-600 bg-sky-50/30"
                  : "border-slate-100 bg-slate-50/50 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name={distributionGroupName}
                checked={config.distribution_method === "proportional"}
                onChange={() => onChange({ ...config, distribution_method: "proportional" })}
                className="w-5 h-5 text-sky-600 focus:ring-sky-500 border-slate-300"
              />
              <div>
                <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Proporsional</p>
                <p className="text-[10px] text-slate-500 font-medium">Sesuai kontribusi omzet hari itu</p>
              </div>
            </label>
          </div>
        </div>
      </div>
    </SchemeCard>
  );
}
