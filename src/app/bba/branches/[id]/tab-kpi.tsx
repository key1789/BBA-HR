"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useTransition, useEffect, useState } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import { Target, TrendingUp, DollarSign, Loader2, Copy, Gift, ChevronRight, Settings2, Users, User, AlertCircle, CheckCircle2, Banknote, Activity, Star } from "lucide-react";
import { saveKpiAction, getPreviousKpiAction } from "./actions";
import { toast } from "sonner";
import { CurrencyInput } from "@/components/shared/currency-input";

export function TabKpi({ branchId, currentKpi, currentMonth, currentYear, users }: { branchId: string, currentKpi: any, currentMonth: number, currentYear: number, users: any[] }) {
  const [isPending, startTransition] = useTransition();
  const [isCopying, setIsCopying] = useState(false);

  const displayUsers = users.filter(u => u.role === 'crew' || u.role === 'admin_apotek');

  // Base Targets
  const [omzet, setOmzet] = useState(currentKpi?.target_omzet || 0);
  const [atv, setAtv] = useState(currentKpi?.target_atv || 0);
  const [atu, setAtu] = useState(currentKpi?.target_atu || 0);

  // Global Bonus Config State
  const config = currentKpi?.bonus_config || {};
  const [isAtvEnabled, setIsAtvEnabled] = useState(config.is_atv_enabled ?? false);
  const [isAtuEnabled, setIsAtuEnabled] = useState(config.is_atu_enabled ?? false);
  
  const [weightOmzet, setWeightOmzet] = useState(config.weight_omzet ?? 100);
  const [weightAtv, setWeightAtv] = useState(config.weight_atv ?? 0);
  const [weightAtu, setWeightAtu] = useState(config.weight_atu ?? 0);

  const [bonusType, setBonusType] = useState(config.bonus_type || "flat");
  const [flatNominal, setFlatNominal] = useState(config.flat_nominal || 0);
  const [kelipatanStep, setKelipatanStep] = useState(config.kelipatan_step || 0);
  const [kelipatanReward, setKelipatanReward] = useState(config.kelipatan_reward || 0);

  // Distribution Schemes
  const [targetDistribution, setTargetDistribution] = useState(config.target_distribution || "rata");
  const [bonusDistribution, setBonusDistribution] = useState(config.bonus_distribution || "global");
  
  // User Configs
  const [userConfigs, setUserConfigs] = useState<any>(config.user_configs || {});

  // Sync state on period change
  useEffect(() => {
    const c = currentKpi?.bonus_config || {};
    setOmzet(currentKpi?.target_omzet || 0);
    setAtv(currentKpi?.target_atv || 0);
    setAtu(currentKpi?.target_atu || 0);
    setIsAtvEnabled(c.is_atv_enabled ?? false);
    setIsAtuEnabled(c.is_atu_enabled ?? false);
    setWeightOmzet(c.weight_omzet ?? 100);
    setWeightAtv(c.weight_atv ?? 0);
    setWeightAtu(c.weight_atu ?? 0);
    setBonusType(c.bonus_type || "flat");
    setFlatNominal(c.flat_nominal || 0);
    setKelipatanStep(c.kelipatan_step || 0);
    setKelipatanReward(c.kelipatan_reward || 0);
    setTargetDistribution(c.target_distribution || "rata");
    setBonusDistribution(c.bonus_distribution || "global");
    setUserConfigs(c.user_configs || {});
  }, [currentKpi]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.append("userConfigs", JSON.stringify(userConfigs));
    
    startTransition(async () => {
      const result = await saveKpiAction(null, formData);
      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        toast.success(result.message);
      }
    });
  };

  const handleCopyPrevious = async () => {
    setIsCopying(true);
    const toastId = toast.loading("Mencari data bulan sebelumnya...");
    const result = await getPreviousKpiAction(branchId, currentMonth, currentYear);
    
    if (result.error) {
      toast.error(result.error, { id: toastId });
    } else if (result.data) {
      const d = result.data;
      const c = d.bonus_config || {};
      
      setOmzet(d.target_omzet);
      setAtv(d.target_atv);
      setAtu(d.target_atu);
      
      setIsAtvEnabled(c.is_atv_enabled ?? false);
      setIsAtuEnabled(c.is_atu_enabled ?? false);
      setWeightOmzet(c.weight_omzet ?? 100);
      setWeightAtv(c.weight_atv ?? 0);
      setWeightAtu(c.weight_atu ?? 0);
      setBonusType(c.bonus_type || "flat");
      setFlatNominal(c.flat_nominal || 0);
      setKelipatanStep(c.kelipatan_step || 0);
      setKelipatanReward(c.kelipatan_reward || 0);
      setTargetDistribution(c.target_distribution || "rata");
      setBonusDistribution(c.bonus_distribution || "global");
      setUserConfigs(c.user_configs || {});
      
      toast.success("Berhasil menyalin data bulan sebelumnya!", { id: toastId });
    }
    setIsCopying(false);
  };

  // Helper for User Input
  const updateUserConfig = (userId: string, key: string, value: any) => {
    setUserConfigs((prev: any) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || {}),
        [key]: value
      }
    }));
  };

  const getUc = (userId: string, key: string, fallback: any) => {
    if (userConfigs[userId] && userConfigs[userId][key] !== undefined) {
      return userConfigs[userId][key];
    }
    return fallback;
  };

  // Calculate Totals for Target Distribution Validation
  const savedUserIds = Object.keys(userConfigs);
  const allUserIds = Array.from(new Set([...displayUsers.map(u => u.id), ...savedUserIds]));
  
  let totalDistributedOmzet = 0;
  if (targetDistribution === 'manual') {
    allUserIds.forEach(id => {
      totalDistributedOmzet += parseFloat(getUc(id, 'targetOmzet', 0)) || 0;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight leading-none">Target & KPI Cabang</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1.5">Konfigurasi target performa & skema bonus periode ini</p>
        </div>
        <button
          type="button"
          onClick={handleCopyPrevious}
          disabled={isCopying}
          className="group flex items-center gap-3 px-5 py-2.5 bg-white hover:bg-slate-900 text-slate-600 hover:text-white border border-slate-200 hover:border-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all duration-500 hover:shadow-xl hover:shadow-slate-200 hover:-translate-y-0.5 disabled:opacity-50"
        >
          <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-500 ${isCopying ? 'bg-sky-100 text-sky-600' : 'bg-slate-50 text-slate-400 group-hover:bg-sky-500 group-hover:text-white group-hover:rotate-12'}`}>
            {isCopying ? <Loader2 size={14} className="animate-spin" /> : <Copy size={12} />}
          </div>
          Salin Data Bulan Lalu
        </button>
      </div>

      <GlassCard variant="light" className="p-0 overflow-visible bg-white/80 backdrop-blur-xl border-slate-200/60 shadow-xl shadow-slate-200/50">
        <form onSubmit={handleSubmit}>
          <input type="hidden" name="tenantId" value={branchId} />
          <input type="hidden" name="month" value={currentMonth} />
          <input type="hidden" name="year" value={currentYear} />
          
          <div className="p-6 space-y-8">
            
            {/* 1. TARGET GLOBAL */}
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shadow-sm">
                    <Target size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 uppercase tracking-tight">Angka Target Global</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Akumulasi Seluruh Apotek</p>
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
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-black uppercase">Wajib Diisi</span>
                  </div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Target Omzet Bulanan</label>
                  <div className="flex items-baseline gap-1 border-b-2 border-slate-50 group-hover:border-emerald-500/30 transition-colors pb-1">
                    <span className="text-sm font-black text-emerald-500">Rp</span>
                    <CurrencyInput 
                      name="targetOmzet"
                      value={omzet}
                      onChange={setOmzet}
                      required
                      className="w-full bg-transparent border-none p-0 text-2xl font-black text-slate-800 placeholder:text-slate-200 focus:ring-0"
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Target ATV */}
                <div className={`rounded-3xl p-5 border transition-all duration-500 group ${isAtvEnabled ? 'bg-white border-slate-100 shadow-sm hover:shadow-xl hover:shadow-sky-500/5' : 'bg-slate-50/50 border-slate-100 opacity-60'}`}>
                  <div className="flex justify-between items-center mb-4">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${isAtvEnabled ? 'bg-sky-50 text-sky-600' : 'bg-slate-200 text-slate-400'}`}>
                      <TrendingUp size={16} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black text-slate-400 uppercase">{isAtvEnabled ? 'Aktif' : 'Non-aktif'}</span>
                      <input 
                        type="checkbox" 
                        name="isAtvEnabled"
                        checked={isAtvEnabled}
                        onChange={(e) => setIsAtvEnabled(e.target.checked)}
                        className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300 cursor-pointer"
                      />
                    </div>
                  </div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Target ATV (Rata-rata)</label>
                  <div className="flex items-baseline gap-1 border-b-2 border-slate-50 group-hover:border-sky-500/30 transition-colors pb-1">
                    <span className={`text-sm font-black ${isAtvEnabled ? 'text-sky-500' : 'text-slate-300'}`}>Rp</span>
                    <CurrencyInput 
                      name="targetAtv"
                      disabled={!isAtvEnabled}
                      value={atv}
                      onChange={setAtv}
                      className="w-full bg-transparent border-none p-0 text-2xl font-black text-slate-800 placeholder:text-slate-200 focus:ring-0 disabled:text-slate-300"
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Target ATU */}
                <div className={`rounded-3xl p-5 border transition-all duration-500 group ${isAtuEnabled ? 'bg-white border-slate-100 shadow-sm hover:shadow-xl hover:shadow-sky-500/5' : 'bg-slate-50/50 border-slate-100 opacity-60'}`}>
                  <div className="flex justify-between items-center mb-4">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${isAtuEnabled ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-200 text-slate-400'}`}>
                      <Target size={16} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black text-slate-400 uppercase">{isAtuEnabled ? 'Aktif' : 'Non-aktif'}</span>
                      <input 
                        type="checkbox" 
                        name="isAtuEnabled"
                        checked={isAtuEnabled}
                        onChange={(e) => setIsAtuEnabled(e.target.checked)}
                        className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300 cursor-pointer"
                      />
                    </div>
                  </div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Target ATU (Qty/Tx)</label>
                  <div className="flex items-baseline gap-1 border-b-2 border-slate-50 group-hover:border-indigo-500/30 transition-colors pb-1">
                    <input 
                      type="number" 
                      name="targetAtu"
                      disabled={!isAtuEnabled}
                      step="0.01"
                      value={atu}
                      onChange={(e) => setAtu(parseFloat(e.target.value))}
                      className="w-full bg-transparent border-none p-0 text-2xl font-black text-slate-800 placeholder:text-slate-200 focus:ring-0 disabled:text-slate-300"
                      placeholder="0"
                    />
                    <span className={`text-[10px] font-black ${isAtuEnabled ? 'text-indigo-400' : 'text-slate-300'}`}>Items</span>
                  </div>
                </div>
              </div>
            </div>


            {/* 2. DISTRIBUSI TARGET */}
            <div className="pt-8 border-t border-slate-100">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm">
                    <Users size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 uppercase tracking-tight">Skema Distribusi Target</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Cara pembagian target ke personil</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <button
                  type="button"
                  onClick={() => setTargetDistribution("rata")}
                  className={`group p-6 rounded-3xl border-2 transition-all duration-500 text-left flex gap-4 relative overflow-hidden ${targetDistribution === 'rata' ? 'border-indigo-600 bg-white shadow-xl shadow-indigo-500/10' : 'border-slate-100 bg-slate-50/50 hover:border-slate-200 hover:bg-white'}`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-500 ${targetDistribution === 'rata' ? 'bg-indigo-600 text-white rotate-6 scale-110' : 'bg-white text-slate-400 shadow-sm'}`}>
                    <Users size={24} />
                  </div>
                  <div className="relative z-10">
                    <h4 className="font-black text-slate-800 text-sm uppercase tracking-tight">Dibagi Rata Otomatis</h4>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed font-medium">Sistem akan membagi target global secara proporsional ke semua pegawai aktif.</p>
                  </div>
                  {targetDistribution === 'rata' && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-indigo-600 animate-ping"></div>}
                </button>
                
                <button
                  type="button"
                  onClick={() => setTargetDistribution("manual")}
                  className={`group p-6 rounded-3xl border-2 transition-all duration-500 text-left flex gap-4 relative overflow-hidden ${targetDistribution === 'manual' ? 'border-indigo-600 bg-white shadow-xl shadow-indigo-500/10' : 'border-slate-100 bg-slate-50/50 hover:border-slate-200 hover:bg-white'}`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-500 ${targetDistribution === 'manual' ? 'bg-indigo-600 text-white rotate-6 scale-110' : 'bg-white text-slate-400 shadow-sm'}`}>
                    <Settings2 size={24} />
                  </div>
                  <div className="relative z-10">
                    <h4 className="font-black text-slate-800 text-sm uppercase tracking-tight">Kustomisasi Manual</h4>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed font-medium">Tentukan target spesifik (Omzet/ATV/ATU) untuk setiap personil secara mandiri.</p>
                  </div>
                  {targetDistribution === 'manual' && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-indigo-600 animate-ping"></div>}
                </button>
              </div>
              <input type="hidden" name="targetDistribution" value={targetDistribution} />

              {/* MANUAL TARGET DISTRIBUTION UI */}
              {targetDistribution === 'manual' && (
                <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
                  <div className={`p-5 rounded-3xl flex gap-4 items-center border-2 shadow-sm transition-colors ${totalDistributedOmzet === omzet ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800' : 'bg-amber-50/50 border-amber-200 text-amber-800'}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${totalDistributedOmzet === omzet ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white animate-pulse'}`}>
                      {totalDistributedOmzet === omzet ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Validasi Distribusi Omzet</p>
                      <div className="flex flex-wrap gap-x-6 gap-y-1 mt-1">
                        <p className="text-sm font-black">Global: <span className="text-slate-500">Rp {omzet.toLocaleString()}</span></p>
                        <p className="text-sm font-black">Terdistribusi: <span className={totalDistributedOmzet === omzet ? 'text-emerald-600' : 'text-amber-600'}>Rp {totalDistributedOmzet.toLocaleString()}</span></p>
                        {omzet !== totalDistributedOmzet && (
                           <p className="text-sm font-black">Selisih: <span className="text-rose-600">Rp {(omzet - totalDistributedOmzet).toLocaleString()}</span></p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {allUserIds.map(uid => {
                      const userObj = displayUsers.find(u => u.id === uid);
                      const isResigned = !userObj && savedUserIds.includes(uid);
                      const fullName = userObj ? userObj.app_users?.full_name : "Pegawai Nonaktif";
                      
                      const initials = fullName?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
                      const colors = ['bg-sky-100 text-sky-600', 'bg-indigo-100 text-indigo-600', 'bg-emerald-100 text-emerald-600', 'bg-amber-100 text-amber-600', 'bg-rose-100 text-rose-600'];
                      const colorClass = colors[fullName?.length % colors.length] || colors[0];

                      return (
                        <div key={uid} className={`bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-500/5 transition-all duration-500 group ${isResigned ? 'opacity-60 grayscale' : ''}`}>
                          <div className="flex items-center gap-4 mb-6">
                            <div className={`w-12 h-12 rounded-2xl ${colorClass} flex items-center justify-center font-black text-sm border-2 border-white shadow-sm group-hover:scale-110 transition-transform duration-500`}>
                              {initials}
                            </div>
                            <div>
                              <p className="font-black text-slate-800 text-base uppercase tracking-tight">{fullName}</p>
                              {isResigned ? (
                                <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-[9px] font-black uppercase mt-1 inline-block">Resigned / Nonaktif</span>
                              ) : (
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 inline-block">Porsi Target Individu</span>
                              )}
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><DollarSign size={10} /> Target Omzet (Rp)</label>
                              <CurrencyInput 
                                name={`targetOmzet_${uid}`}
                                value={getUc(uid, 'targetOmzet', 0)}
                                onChange={(val) => updateUserConfig(uid, 'targetOmzet', val)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                              />
                            </div>
                            {isAtvEnabled && (
                              <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><TrendingUp size={10} /> Target ATV (Rp)</label>
                                <CurrencyInput 
                                  name={`targetAtv_${uid}`}
                                  value={getUc(uid, 'targetAtv', 0)}
                                  onChange={(val) => updateUserConfig(uid, 'targetAtv', val)}
                                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                                />
                              </div>
                            )}
                            {isAtuEnabled && (
                              <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Target size={10} /> Target ATU</label>
                                <input 
                                  type="number"
                                  step="0.01"
                                  value={getUc(uid, 'targetAtu', 0)}
                                  onChange={(e) => updateUserConfig(uid, 'targetAtu', parseFloat(e.target.value))}
                                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>


            {/* 3. DISTRIBUSI BONUS */}
            <div className="pt-8 border-t border-slate-100">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-sm">
                    <Gift size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 uppercase tracking-tight">Skema Bonus & Bobot</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Aturan perhitungan insentif</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <button
                  type="button"
                  onClick={() => setBonusDistribution("global")}
                  className={`group p-6 rounded-3xl border-2 transition-all duration-500 text-left flex gap-4 relative overflow-hidden ${bonusDistribution === 'global' ? 'border-emerald-600 bg-white shadow-xl shadow-emerald-500/10' : 'border-slate-100 bg-slate-50/50 hover:border-slate-200 hover:bg-white'}`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-500 ${bonusDistribution === 'global' ? 'bg-emerald-600 text-white rotate-6 scale-110' : 'bg-white text-slate-400 shadow-sm'}`}>
                    <Target size={24} />
                  </div>
                  <div className="relative z-10">
                    <h4 className="font-black text-slate-800 text-sm uppercase tracking-tight">Global (Satu Skema)</h4>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed font-medium">Satu aturan bobot dan bonus yang berlaku seragam untuk seluruh personil.</p>
                  </div>
                  {bonusDistribution === 'global' && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-600 animate-ping"></div>}
                </button>
                
                <button
                  type="button"
                  onClick={() => setBonusDistribution("manual")}
                  className={`group p-6 rounded-3xl border-2 transition-all duration-500 text-left flex gap-4 relative overflow-hidden ${bonusDistribution === 'manual' ? 'border-emerald-600 bg-white shadow-xl shadow-emerald-500/10' : 'border-slate-100 bg-slate-50/50 hover:border-slate-200 hover:bg-white'}`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-500 ${bonusDistribution === 'manual' ? 'bg-emerald-600 text-white rotate-6 scale-110' : 'bg-white text-slate-400 shadow-sm'}`}>
                    <User size={24} />
                  </div>
                  <div className="relative z-10">
                    <h4 className="font-black text-slate-800 text-sm uppercase tracking-tight">Kustomisasi Manual</h4>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed font-medium">Atur bobot dan nominal bonus yang spesifik dan berbeda-beda tiap personil.</p>
                  </div>
                  {bonusDistribution === 'manual' && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-600 animate-ping"></div>}
                </button>
              </div>
              <input type="hidden" name="bonusDistribution" value={bonusDistribution} />

              {/* GLOBAL BONUS UI */}
              {bonusDistribution === 'global' && (
                <div className="bg-slate-50/50 border border-slate-100 rounded-3xl p-8 animate-in fade-in slide-in-from-left-2 duration-500">
                  <div className="mb-10">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-6">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Bobot Porsi Target Global
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Omzet</span>
                        <div className="flex items-center gap-2">
                           <input type="number" name="weightOmzet" value={weightOmzet} onChange={e => setWeightOmzet(parseInt(e.target.value))} className="w-full bg-transparent border-none p-0 text-xl font-black text-slate-800 focus:ring-0" />
                           <span className="font-black text-emerald-500">%</span>
                        </div>
                      </div>
                      {isAtvEnabled && (
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase">ATV</span>
                          <div className="flex items-center gap-2">
                            <input type="number" name="weightAtv" value={weightAtv} onChange={e => setWeightAtv(parseInt(e.target.value))} className="w-full bg-transparent border-none p-0 text-xl font-black text-slate-800 focus:ring-0" />
                            <span className="font-black text-sky-500">%</span>
                          </div>
                        </div>
                      )}
                      {isAtuEnabled && (
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase">ATU</span>
                          <div className="flex items-center gap-2">
                            <input type="number" name="weightAtu" value={weightAtu} onChange={e => setWeightAtu(parseInt(e.target.value))} className="w-full bg-transparent border-none p-0 text-xl font-black text-slate-800 focus:ring-0" />
                            <span className="font-black text-indigo-500">%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-6">
                    <div className="flex flex-col sm:flex-row gap-6">
                      <label className={`flex-1 flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer ${bonusType === 'flat' ? 'border-emerald-600 bg-emerald-50/30' : 'border-slate-50 bg-slate-50/50 hover:bg-slate-50'}`}>
                        <input type="radio" name="bonusType" value="flat" checked={bonusType === 'flat'} onChange={() => setBonusType('flat')} className="w-5 h-5 text-emerald-600 focus:ring-emerald-500 border-slate-300" />
                        <div>
                          <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Bonus Flat</p>
                          <p className="text-[10px] text-slate-500 font-medium">Satu nilai tetap jika target tercapai.</p>
                        </div>
                      </label>
                      <label className={`flex-1 flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer ${bonusType === 'kelipatan' ? 'border-emerald-600 bg-emerald-50/30' : 'border-slate-50 bg-slate-50/50 hover:bg-slate-50'}`}>
                        <input type="radio" name="bonusType" value="kelipatan" checked={bonusType === 'kelipatan'} onChange={() => setBonusType('kelipatan')} className="w-5 h-5 text-emerald-600 focus:ring-emerald-500 border-slate-300" />
                        <div>
                          <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Bonus Kelipatan</p>
                          <p className="text-[10px] text-slate-500 font-medium">Bonus bertambah setiap kelipatan tertentu.</p>
                        </div>
                      </label>
                    </div>

                    <div className="pt-4 animate-in zoom-in-95 duration-300">
                      {bonusType === 'flat' ? (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Banknote size={12} /> Nominal Bonus Flat (Rp)
                          </label>
                          <CurrencyInput name="flatNominal" value={flatNominal} onChange={setFlatNominal} className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xl font-black text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none" />
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                              <Activity size={12} /> Setiap Kelipatan (Rp)
                            </label>
                            <CurrencyInput name="kelipatanStep" value={kelipatanStep} onChange={setKelipatanStep} className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xl font-black text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                              <Star size={12} /> Reward per Kelipatan (Rp)
                            </label>
                            <CurrencyInput name="kelipatanReward" value={kelipatanReward} onChange={setKelipatanReward} className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xl font-black text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* MANUAL BONUS DISTRIBUTION UI */}
              {bonusDistribution === 'manual' && (
                <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-top-2 duration-500">
                  {allUserIds.map(uid => {
                    const userObj = displayUsers.find(u => u.id === uid);
                    const isResigned = !userObj && savedUserIds.includes(uid);
                    const fullName = userObj ? userObj.app_users?.full_name : "Pegawai Nonaktif";
                    const bType = getUc(uid, 'bonusType', 'flat');

                    const initials = fullName?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
                    const colors = ['bg-sky-100 text-sky-600', 'bg-indigo-100 text-indigo-600', 'bg-emerald-100 text-emerald-600', 'bg-amber-100 text-amber-600', 'bg-rose-100 text-rose-600'];
                    const colorClass = colors[fullName?.length % colors.length] || colors[0];
                    
                    return (
                      <div key={uid} className={`bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-500/5 transition-all duration-500 group ${isResigned ? 'opacity-60 grayscale' : ''}`}>
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl ${colorClass} flex items-center justify-center font-black text-sm border-2 border-white shadow-sm group-hover:scale-110 transition-transform duration-500`}>
                              {initials}
                            </div>
                            <div>
                              <p className="font-black text-slate-800 text-base uppercase tracking-tight">{fullName}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Bobot & Bonus Individu</p>
                            </div>
                          </div>

                          <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
                            <button type="button" onClick={() => updateUserConfig(uid, 'bonusType', 'flat')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${bType === 'flat' ? 'bg-white text-emerald-600 shadow-sm border border-emerald-100' : 'text-slate-400 hover:text-slate-600'}`}>Flat</button>
                            <button type="button" onClick={() => updateUserConfig(uid, 'bonusType', 'kelipatan')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${bType === 'kelipatan' ? 'bg-white text-emerald-600 shadow-sm border border-emerald-100' : 'text-slate-400 hover:text-slate-600'}`}>Kelipatan</button>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-8 pt-4 border-t border-slate-50">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Bobot Omzet</label>
                            <div className="flex items-center gap-2">
                              <input type="number" value={getUc(uid, 'weightOmzet', 100)} onChange={e => updateUserConfig(uid, 'weightOmzet', parseInt(e.target.value))} className="w-full bg-transparent border-none p-0 text-lg font-black text-slate-800 focus:ring-0" />
                              <span className="text-emerald-500 font-black text-sm">%</span>
                            </div>
                          </div>
                          {isAtvEnabled && (
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Bobot ATV</label>
                              <div className="flex items-center gap-2">
                                <input type="number" value={getUc(uid, 'weightAtv', 0)} onChange={e => updateUserConfig(uid, 'weightAtv', parseInt(e.target.value))} className="w-full bg-transparent border-none p-0 text-lg font-black text-slate-800 focus:ring-0" />
                                <span className="text-sky-500 font-black text-sm">%</span>
                              </div>
                            </div>
                          )}
                          {isAtuEnabled && (
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Bobot ATU</label>
                              <div className="flex items-center gap-2">
                                <input type="number" value={getUc(uid, 'weightAtu', 0)} onChange={e => updateUserConfig(uid, 'weightAtu', parseInt(e.target.value))} className="w-full bg-transparent border-none p-0 text-lg font-black text-slate-800 focus:ring-0" />
                                <span className="text-indigo-500 font-black text-sm">%</span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 animate-in zoom-in-95 duration-300">
                          {bType === 'flat' ? (
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Banknote size={10} /> Nominal Flat (Rp)</label>
                              <CurrencyInput value={getUc(uid, 'flatNominal', 0)} onChange={val => updateUserConfig(uid, 'flatNominal', val)} className="w-full bg-transparent border-none p-0 text-base font-black text-slate-800 focus:ring-0" />
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-6">
                              <div className="space-y-1 border-r border-slate-200">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Activity size={10} /> Step Kelipatan (Rp)</label>
                                <CurrencyInput value={getUc(uid, 'kelipatanStep', 0)} onChange={val => updateUserConfig(uid, 'kelipatanStep', val)} className="w-full bg-transparent border-none p-0 text-base font-black text-slate-800 focus:ring-0" />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Star size={10} /> Reward (Rp)</label>
                                <CurrencyInput value={getUc(uid, 'kelipatanReward', 0)} onChange={val => updateUserConfig(uid, 'kelipatanReward', val)} className="w-full bg-transparent border-none p-0 text-base font-black text-slate-800 focus:ring-0" />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>


          </div>

          {/* FOOTER ACTION */}
          <div className="p-4 sm:p-6 bg-slate-50/50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-slate-500 w-full sm:w-auto justify-center sm:justify-start">
              <ChevronRight size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">Penyimpanan Otomatis ke bonus_config</span>
            </div>
            <button 
              type="submit" 
              disabled={isPending || (targetDistribution === 'manual' && totalDistributedOmzet !== omzet)}
              className="w-full sm:w-auto px-8 py-3.5 sm:py-3 rounded-2xl font-black text-sm text-white bg-sky-600 hover:bg-sky-700 shadow-xl shadow-sky-600/30 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isPending ? <Loader2 size={18} className="animate-spin" /> : "Simpan Konfigurasi KPI"}
            </button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
