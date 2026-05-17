"use client";

import { Target, TrendingUp, DollarSign } from "lucide-react";
import { CurrencyInput } from "@/components/shared/currency-input";
import type { KpiGlobalConfig } from "@/lib/types/kpi-v2";

interface GlobalTargetSectionProps {
  config: KpiGlobalConfig;
  onChange: (config: KpiGlobalConfig) => void;
}

export function GlobalTargetSection({ config, onChange }: GlobalTargetSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shadow-sm">
            <Target size={20} />
          </div>
          <div>
            <h3 className="font-black text-slate-800 uppercase tracking-tight">Target Global Apotek</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Wajib diisi sebelum setup skema</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Target Omzet */}
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-sky-500/5 transition-all duration-500 group">
          <div className="flex justify-between items-center mb-4">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <DollarSign size={16} />
            </div>
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-black uppercase">Wajib</span>
          </div>
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Target Omzet Bulanan</label>
          <div className="flex items-baseline gap-1 border-b-2 border-slate-50 group-hover:border-emerald-500/30 transition-colors pb-1">
            <span className="text-sm font-black text-emerald-500">Rp</span>
            <CurrencyInput
              value={config.target_omzet}
              onChange={(val) => onChange({ ...config, target_omzet: val })}
              required
              className="w-full bg-transparent border-none p-0 text-2xl font-black text-slate-800 placeholder:text-slate-200 focus:ring-0"
              placeholder="0"
            />
          </div>
        </div>

        {/* Target ATV */}
        <div
          className={`rounded-3xl p-5 border transition-all duration-500 group ${
            config.is_atv_enabled
              ? "bg-white border-slate-100 shadow-sm hover:shadow-xl hover:shadow-sky-500/5"
              : "bg-slate-50/50 border-slate-100 opacity-60"
          }`}
        >
          <div className="flex justify-between items-center mb-4">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                config.is_atv_enabled ? "bg-sky-50 text-sky-600" : "bg-slate-200 text-slate-400"
              }`}
            >
              <TrendingUp size={16} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black text-slate-400 uppercase">
                {config.is_atv_enabled ? "Aktif" : "Non-aktif"}
              </span>
              <input
                type="checkbox"
                checked={config.is_atv_enabled}
                onChange={(e) => onChange({ ...config, is_atv_enabled: e.target.checked })}
                className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300 cursor-pointer"
              />
            </div>
          </div>
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Target ATV (Rata-rata)</label>
          <div className="flex items-baseline gap-1 border-b-2 border-slate-50 group-hover:border-sky-500/30 transition-colors pb-1">
            <span className={`text-sm font-black ${config.is_atv_enabled ? "text-sky-500" : "text-slate-300"}`}>Rp</span>
            <CurrencyInput
              disabled={!config.is_atv_enabled}
              value={config.target_atv}
              onChange={(val) => onChange({ ...config, target_atv: val })}
              className="w-full bg-transparent border-none p-0 text-2xl font-black text-slate-800 placeholder:text-slate-200 focus:ring-0 disabled:text-slate-300"
              placeholder="0"
            />
          </div>
        </div>

        {/* Target ATU */}
        <div
          className={`rounded-3xl p-5 border transition-all duration-500 group ${
            config.is_atu_enabled
              ? "bg-white border-slate-100 shadow-sm hover:shadow-xl hover:shadow-sky-500/5"
              : "bg-slate-50/50 border-slate-100 opacity-60"
          }`}
        >
          <div className="flex justify-between items-center mb-4">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                config.is_atu_enabled ? "bg-indigo-50 text-indigo-600" : "bg-slate-200 text-slate-400"
              }`}
            >
              <Target size={16} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black text-slate-400 uppercase">
                {config.is_atu_enabled ? "Aktif" : "Non-aktif"}
              </span>
              <input
                type="checkbox"
                checked={config.is_atu_enabled}
                onChange={(e) => onChange({ ...config, is_atu_enabled: e.target.checked })}
                className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300 cursor-pointer"
              />
            </div>
          </div>
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Target ATU (Qty/Tx)</label>
          <div className="flex items-baseline gap-1 border-b-2 border-slate-50 group-hover:border-indigo-500/30 transition-colors pb-1">
            <input
              type="number"
              disabled={!config.is_atu_enabled}
              step="0.01"
              value={config.target_atu}
              onChange={(e) => onChange({ ...config, target_atu: parseFloat(e.target.value) || 0 })}
              className="w-full bg-transparent border-none p-0 text-2xl font-black text-slate-800 placeholder:text-slate-200 focus:ring-0 disabled:text-slate-300"
              placeholder="0"
            />
            <span className={`text-[10px] font-black ${config.is_atu_enabled ? "text-indigo-400" : "text-slate-300"}`}>Items</span>
          </div>
        </div>
      </div>

      {/* Default Working Days */}
      <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
          Default Hari Kerja (untuk perhitungan harian)
        </label>
        <input
          type="number"
          min={1}
          max={31}
          value={config.default_working_days}
          onChange={(e) => onChange({ ...config, default_working_days: parseInt(e.target.value, 10) || 26 })}
          className="w-full sm:w-32 px-4 py-2 bg-white border border-slate-200 rounded-xl text-lg font-black text-slate-800 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all outline-none"
        />
      </div>
    </div>
  );
}
