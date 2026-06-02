"use client";

import { useId } from "react";
import { Banknote, Activity, Star } from "lucide-react";
import { CurrencyInput } from "@/components/shared/currency-input";
import { InfoTooltip } from "@/components/shared/info-tooltip";
import type { BonusType } from "@/lib/types/kpi-v2";

interface BonusTypeSelectorProps {
  bonusType: BonusType;
  flatNominal: number;
  kelipatanStep: number;
  kelipatanReward: number;
  onChangeBonusType: (type: BonusType) => void;
  onChangeFlatNominal: (value: number) => void;
  onChangeKelipatanStep: (value: number) => void;
  onChangeKelipatanReward: (value: number) => void;
}

export function BonusTypeSelector({
  bonusType,
  flatNominal,
  kelipatanStep,
  kelipatanReward,
  onChangeBonusType,
  onChangeFlatNominal,
  onChangeKelipatanStep,
  onChangeKelipatanReward,
}: BonusTypeSelectorProps) {
  const radioGroupName = useId();

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-6">
      {/* Type Selector */}
      <div className="flex flex-col sm:flex-row gap-4">
        <label
          className={`flex-1 flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer ${
            bonusType === "flat" ? "border-emerald-600 bg-emerald-50/30" : "border-slate-50 bg-slate-50/50 hover:bg-slate-50"
          }`}
        >
          <input
            type="radio"
            name={radioGroupName}
            checked={bonusType === "flat"}
            onChange={() => onChangeBonusType("flat")}
            className="w-5 h-5 text-emerald-600 focus:ring-emerald-500 border-slate-300"
          />
          <div>
            <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Bonus Flat</p>
            <p className="text-[10px] text-slate-500 font-medium">Nominal tetap jika target tercapai</p>
          </div>
        </label>

        <label
          className={`flex-1 flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer ${
            bonusType === "kelipatan" ? "border-emerald-600 bg-emerald-50/30" : "border-slate-50 bg-slate-50/50 hover:bg-slate-50"
          }`}
        >
          <input
            type="radio"
            name={radioGroupName}
            checked={bonusType === "kelipatan"}
            onChange={() => onChangeBonusType("kelipatan")}
            className="w-5 h-5 text-emerald-600 focus:ring-emerald-500 border-slate-300"
          />
          <div>
            <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Bonus Kelipatan</p>
            <p className="text-[10px] text-slate-500 font-medium">Bonus bertambah per kelipatan</p>
          </div>
        </label>
      </div>

      {/* Input Fields */}
      <div className="pt-4 animate-in zoom-in-95 duration-300">
        {bonusType === "flat" ? (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Banknote size={12} /> Nominal Bonus Flat (Rp)
              <InfoTooltip content="Jumlah bonus tetap yang diterima jika target tercapai, tidak peduli seberapa jauh target terlampaui. Contoh: Rp 300.000 flat setiap bulan target terpenuhi." />
            </label>
            <CurrencyInput
              value={flatNominal}
              onChange={onChangeFlatNominal}
              className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xl font-black text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Activity size={12} /> Setiap Kelipatan (Rp)
                <InfoTooltip content="Kelipatan omzet di atas target yang memicu reward. Contoh: step Rp 1.000.000 berarti setiap Rp 1 juta kelebihan omzet = 1 reward." />
              </label>
              <CurrencyInput
                value={kelipatanStep}
                onChange={onChangeKelipatanStep}
                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xl font-black text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Star size={12} /> Reward per Kelipatan (Rp)
                <InfoTooltip content="Bonus yang diterima untuk setiap kelipatan yang terpenuhi. Contoh: Rp 50.000 per kelipatan — jika ada 3 kelipatan terpenuhi, bonus total Rp 150.000." />
              </label>
              <CurrencyInput
                value={kelipatanReward}
                onChange={onChangeKelipatanReward}
                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xl font-black text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
