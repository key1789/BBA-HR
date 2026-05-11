"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useTransition, useState, useEffect } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import { Banknote, Users, Save, Loader2, Info, ChevronRight, Calculator, Wallet, Receipt, CreditCard, Plus, X, AlertCircle } from "lucide-react";
import { savePayrollConfigAction } from "./actions";
import { toast } from "sonner";
import { CurrencyInput } from "@/components/shared/currency-input";
import { motion, AnimatePresence } from "framer-motion";

type CustomAdjustment = {
  id: string;
  name: string;
  type: 'addition' | 'deduction';
  amount: number;
};

export function TabPayroll({ branchId, users, payrollConfigs }: { branchId: string, users: any[], payrollConfigs: any[] }) {
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isPending, startTransition] = useTransition();
  const [localPayrollConfigs, setLocalPayrollConfigs] = useState<any[]>(payrollConfigs || []);
  useEffect(() => {
    setLocalPayrollConfigs(payrollConfigs || []);
    setSelectedUser(null);
  }, [branchId, payrollConfigs]);

  // Core salary states
  const [baseSalary, setBaseSalary] = useState(0);
  const [positionAllowance, setPositionAllowance] = useState(0);
  const [mealAllowance, setMealAllowance] = useState(0);
  const [transportAllowance, setTransportAllowance] = useState(0);
  const [bpjsDeduction, setBpjsDeduction] = useState(0);
  
  // Custom Adjustments state
  const [customAdjustments, setCustomAdjustments] = useState<CustomAdjustment[]>([]);
  
  // Protection State
  const [isDirty, setIsDirty] = useState(false);

  const filteredUsers = users.filter(u => u.role === 'crew' || u.role === 'admin_apotek');

  const toNum = (v: unknown) => {
    if (typeof v === "number") return v;
    if (typeof v === "string") return Number(v) || 0;
    return 0;
  };

  const loadUserConfig = (user: any) => {
    const config = localPayrollConfigs.find(c => c.user_id === user.app_users.id);
    setBaseSalary(toNum(config?.base_salary));
    setPositionAllowance(toNum(config?.position_allowance));
    setMealAllowance(toNum(config?.meal_allowance));
    setTransportAllowance(toNum(config?.transport_allowance));
    setBpjsDeduction(toNum(config?.bpjs_deduction));
    setCustomAdjustments(Array.isArray(config?.custom_adjustments) ? config.custom_adjustments : []);
    setIsDirty(false);
  };

  const handleSelectUser = (user: any) => {
    if (isDirty) {
      if (!confirm("🚨 PERINGATAN 🚨\nAnda memiliki perubahan gaji yang belum disimpan. Yakin ingin pindah tanpa menyimpan?")) {
        return;
      }
    }
    setSelectedUser(user);
    loadUserConfig(user);
  };

  const setter = (setFn: any) => (val: any) => {
    setFn(val);
    setIsDirty(true);
  };

  const addCustomItem = (type: 'addition' | 'deduction') => {
    setCustomAdjustments([
      ...customAdjustments, 
      { id: Date.now().toString(), name: '', type, amount: 0 }
    ]);
    setIsDirty(true);
  };

  const updateCustomItem = (id: string, field: string, value: any) => {
    setCustomAdjustments(customAdjustments.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
    setIsDirty(true);
  };

  const removeCustomItem = (id: string) => {
    setCustomAdjustments(customAdjustments.filter(item => item.id !== id));
    setIsDirty(true);
  };

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.append("customAdjustments", JSON.stringify(customAdjustments));
    
    startTransition(async () => {
      const result = await savePayrollConfigAction(null, formData);
      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        toast.success(result.message);
        setLocalPayrollConfigs((prev) => {
          const payload = {
            user_id: selectedUser.app_users.id,
            base_salary: baseSalary,
            position_allowance: positionAllowance,
            meal_allowance: mealAllowance,
            transport_allowance: transportAllowance,
            bpjs_deduction: bpjsDeduction,
            custom_adjustments: customAdjustments,
          };
          const idx = prev.findIndex((c) => c.user_id === selectedUser.app_users.id);
          if (idx === -1) return [...prev, payload];
          const next = [...prev];
          next[idx] = { ...next[idx], ...payload };
          return next;
        });
        setIsDirty(false);
      }
    });
  };

  const totalCustomAdditions = customAdjustments.filter(c => c.type === 'addition').reduce((sum, item) => sum + item.amount, 0);
  const totalCustomDeductions = customAdjustments.filter(c => c.type === 'deduction').reduce((sum, item) => sum + item.amount, 0);
  const totalFixed = baseSalary + positionAllowance + mealAllowance + transportAllowance + totalCustomAdditions - bpjsDeduction - totalCustomDeductions;

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6 lg:gap-8 lg:h-[calc(100vh-14rem)] lg:overflow-hidden">
      {/* 1. EMPLOYEE LIST */}
      <div className="lg:col-span-1 flex flex-col gap-4 lg:h-full lg:overflow-hidden shrink-0">
        <div className="space-y-1 px-1">
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Users size={20} className="text-sky-600" /> Daftar Pegawai
          </h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Pilih pegawai untuk mengatur gaji</p>
        </div>

        <div className="flex-1 overflow-y-auto max-h-[40vh] lg:max-h-none pr-2 space-y-3 custom-scrollbar">
          {filteredUsers.map((user) => {
            const hasConfig = localPayrollConfigs.some(c => c.user_id === user.app_users.id);
            return (
              <button
                key={user.id}
                onClick={() => handleSelectUser(user)}
                className={`w-full p-4 rounded-3xl border-2 transition-all text-left flex items-center justify-between group ${selectedUser?.id === user.id ? 'border-sky-600 bg-sky-50 shadow-lg shadow-sky-600/10' : 'border-white bg-white/50 hover:bg-white hover:border-slate-100 shadow-sm'}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${selectedUser?.id === user.id ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-sky-100 group-hover:text-sky-600'}`}>
                    <Users size={18} />
                  </div>
                  <div>
                    <p className="font-black text-slate-800 text-sm truncate max-w-[120px]">{user.app_users.full_name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{user.role.replace('_', ' ')}</p>
                  </div>
                </div>
                {hasConfig ? (
                  <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <Save size={12} />
                  </div>
                ) : (
                  <ChevronRight size={16} className="text-slate-300 group-hover:text-sky-400 transition-colors" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. SETUP PANEL */}
      <div className="lg:col-span-2 h-[80vh] lg:h-full lg:overflow-hidden">
        <AnimatePresence mode="wait">
          {selectedUser ? (
            <motion.div
              key={selectedUser.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full flex flex-col"
            >
              <GlassCard variant="light" className="p-0 overflow-hidden flex flex-col h-full border-2 border-sky-100 shadow-2xl shadow-sky-600/5">
                <form onSubmit={handleSave} className="flex flex-col h-full">
                  <input type="hidden" name="tenantId" value={branchId} />
                  <input type="hidden" name="userId" value={selectedUser.app_users.id} />
                  
                  {/* Header */}
                  <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center">
                        <Calculator className="text-sky-600" size={24} />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-800 uppercase tracking-tight">Konfigurasi Gaji Pokok</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs font-bold text-sky-600 uppercase">{selectedUser.app_users.full_name}</p>
                          {isDirty && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-black uppercase flex items-center gap-1"><AlertCircle size={10} /> Belum Disimpan</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={isPending || !isDirty}
                        className="px-3 py-2 bg-sky-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-sky-700 transition-colors disabled:opacity-60"
                      >
                        {isPending ? "Menyimpan..." : "Simpan"}
                      </button>
                      <button type="button" onClick={() => handleSelectUser(null)} className="text-[10px] font-black text-slate-400 uppercase hover:text-rose-500 transition-colors">Tutup</button>
                    </div>
                  </div>

                  {/* Form Content */}
                  <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar bg-white">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Fixed Salary Components */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-2 text-slate-800 border-b border-slate-100 pb-2">
                          <Wallet size={16} className="text-sky-600" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-sky-600">Pendapatan Tetap</span>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Gaji Pokok (Rp)</label>
                            <CurrencyInput 
                              name="baseSalary"
                              value={baseSalary}
                              onChange={setter(setBaseSalary)}
                              className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-sky-500/10 focus:border-sky-600 outline-none transition-all font-black text-slate-800"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tunjangan Jabatan (Rp)</label>
                            <CurrencyInput 
                              name="positionAllowance"
                              value={positionAllowance}
                              onChange={setter(setPositionAllowance)}
                              className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-sky-500/10 focus:border-sky-600 outline-none transition-all font-black text-slate-800"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Daily & Deductions */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-2 text-slate-800 border-b border-slate-100 pb-2">
                          <Receipt size={16} className="text-sky-600" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-sky-600">Tunjangan Harian & Potongan Pokok</span>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
                              Uang Makan / Hari Masuk (Rp)
                            </label>
                            <CurrencyInput 
                              name="mealAllowance"
                              value={mealAllowance}
                              onChange={setter(setMealAllowance)}
                              className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-sky-500/10 focus:border-sky-600 outline-none transition-all font-black text-slate-800"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Potongan BPJS Tetap (Rp)</label>
                            <CurrencyInput 
                              name="bpjsDeduction"
                              value={bpjsDeduction}
                              onChange={setter(setBpjsDeduction)}
                              className="w-full px-5 py-3 bg-rose-50/50 border border-rose-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-rose-500/10 focus:border-rose-600 outline-none transition-all font-black text-rose-600"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* CUSTOM ADJUSTMENTS SECTION */}
                    <div className="pt-8 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* ADDITIONS */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                           <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5"><Plus size={14}/> Penambahan Kustom</h4>
                           <button type="button" onClick={() => addCustomItem('addition')} className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors">
                             <Plus size={14} />
                           </button>
                        </div>
                        {customAdjustments.filter(c => c.type === 'addition').length === 0 ? (
                          <p className="text-[10px] text-slate-400 italic bg-slate-50 p-4 rounded-xl text-center border border-dashed border-slate-200">Belum ada penambahan kustom (Contoh: Uang Bensin Khusus, dll).</p>
                        ) : (
                          <div className="space-y-3">
                            {customAdjustments.filter(c => c.type === 'addition').map((item) => (
                              <div key={item.id} className="flex gap-2 items-start animate-in fade-in zoom-in-95">
                                <div className="flex-1 space-y-2">
                                  <input 
                                    placeholder="Nama Penambahan..." 
                                    value={item.name} 
                                    onChange={(e) => updateCustomItem(item.id, 'name', e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-[11px] outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white"
                                  />
                                  <CurrencyInput 
                                    value={item.amount}
                                    onChange={(val) => updateCustomItem(item.id, 'amount', val)}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-black text-emerald-600 text-xs outline-none focus:ring-2 focus:ring-emerald-500/20"
                                  />
                                </div>
                                <button type="button" onClick={() => removeCustomItem(item.id)} className="mt-1 p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                                  <X size={16} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* DEDUCTIONS */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                           <h4 className="text-[10px] font-black text-rose-600 uppercase tracking-widest flex items-center gap-1.5"><X size={14}/> Pengurangan Kustom</h4>
                           <button type="button" onClick={() => addCustomItem('deduction')} className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-colors">
                             <Plus size={14} />
                           </button>
                        </div>
                        {customAdjustments.filter(c => c.type === 'deduction').length === 0 ? (
                          <p className="text-[10px] text-slate-400 italic bg-slate-50 p-4 rounded-xl text-center border border-dashed border-slate-200">Belum ada pengurangan kustom (Contoh: Kasbon, Denda, dll).</p>
                        ) : (
                          <div className="space-y-3">
                            {customAdjustments.filter(c => c.type === 'deduction').map((item) => (
                              <div key={item.id} className="flex gap-2 items-start animate-in fade-in zoom-in-95">
                                <div className="flex-1 space-y-2">
                                  <input 
                                    placeholder="Nama Pengurangan..." 
                                    value={item.name} 
                                    onChange={(e) => updateCustomItem(item.id, 'name', e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-[11px] outline-none focus:ring-2 focus:ring-rose-500/20 focus:bg-white"
                                  />
                                  <CurrencyInput 
                                    value={item.amount}
                                    onChange={(val) => updateCustomItem(item.id, 'amount', val)}
                                    className="w-full px-3 py-2 bg-rose-50/30 border border-rose-200 rounded-xl font-black text-rose-600 text-xs outline-none focus:ring-2 focus:ring-rose-500/20 focus:bg-white"
                                  />
                                </div>
                                <button type="button" onClick={() => removeCustomItem(item.id)} className="mt-1 p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                                  <X size={16} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Summary Info */}
                    <div className="bg-sky-600 rounded-[32px] p-8 text-white flex flex-col md:flex-row justify-between items-center gap-6 shadow-2xl shadow-sky-600/30 mt-8 relative overflow-hidden">
                      {/* Decoration */}
                      <div className="absolute top-0 right-0 -mr-8 -mt-8 w-40 h-40 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
                      
                      <div className="relative z-10">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-1">Total Estimasi Take Home Pay (Dasar)</p>
                        <h4 className="text-4xl font-black tracking-tighter">Rp {totalFixed.toLocaleString('id-ID')}</h4>
                        <div className="flex gap-3 mt-3">
                          <p className="text-[9px] font-bold opacity-75 bg-black/20 px-2 py-1 rounded-md">*Uang Makan dikali otomatis by absensi</p>
                          <p className="text-[9px] font-bold opacity-75 bg-black/20 px-2 py-1 rounded-md">*Belum termasuk bonus KPI</p>
                        </div>
                      </div>
                      <div className="relative z-10 bg-white/10 backdrop-blur-md p-4 rounded-2xl flex items-center gap-3 border border-white/20">
                        <CreditCard size={24} className="text-sky-100" />
                        <div className="text-[10px] font-black uppercase leading-tight tracking-wider text-sky-50">
                          Siap untuk<br />Audit Payroll
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-sky-50 border border-sky-100 rounded-2xl flex gap-3">
                       <Info size={18} className="text-sky-600 shrink-0" />
                       <p className="text-[10px] text-sky-800 leading-relaxed font-bold uppercase tracking-wider">
                         Tips: Kategori kustom (seperti kasbon atau denda) akan masuk sebagai komponen tetap setiap bulan sampai Anda menghapusnya di sini.
                       </p>
                    </div>
                  </div>

                  {/* Footer Action */}
                  <div className="p-6 bg-slate-50 border-t border-slate-100 shrink-0">
                    <button 
                      type="submit" 
                      disabled={isPending}
                      className="w-full py-4 bg-sky-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-sky-600/30 hover:bg-sky-700 transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5 active:scale-95 disabled:opacity-70 disabled:hover:translate-y-0"
                    >
                      {isPending ? <Loader2 size={18} className="animate-spin text-sky-200" /> : <Save size={18} className="text-sky-200" />}
                      {isDirty ? "Simpan Perubahan Gaji" : "Konfigurasi Tersimpan"}
                    </button>
                  </div>
                </form>
              </GlassCard>
            </motion.div>
          ) : (
            <div className="h-full flex items-center justify-center text-center p-8">
              <div className="max-w-xs space-y-4">
                <div className="w-20 h-20 rounded-[32px] bg-slate-100 text-slate-300 flex items-center justify-center mx-auto">
                  <Banknote size={40} />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 uppercase tracking-tight">Belum Ada Pegawai Dipilih</h3>
                  <p className="text-xs text-slate-400 font-bold leading-relaxed mt-2 uppercase tracking-tighter">Silakan pilih pegawai di daftar sebelah kiri untuk mengatur konfigurasi gaji dasarnya.</p>
                  <p className="text-[10px] text-sky-600 font-black uppercase mt-3 tracking-wider">Tombol simpan muncul setelah pegawai dipilih.</p>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
