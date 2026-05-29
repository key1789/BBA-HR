"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useTransition, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { GlassCard } from "@/components/shared/glass-card";
import { Banknote, Users, Save, Loader2, Info, ChevronRight, Calculator, Wallet, Receipt, CreditCard, Plus, X, AlertCircle, CheckCircle2, Copy } from "lucide-react";
import { savePayrollConfigAction } from "./actions";
import { toast } from "sonner";
import { CurrencyInput } from "@/components/shared/currency-input";
import { motion, AnimatePresence } from "framer-motion";
import { isBranchOperationalPersonnel } from "@/lib/branch-personnel";

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

  // BPJS multi-komponen
  const [bpjsKesKaryawan, setBpjsKesKaryawan] = useState(0);
  const [bpjsTkKaryawan, setBpjsTkKaryawan] = useState(0);
  const [bpjsKesPerusahaan, setBpjsKesPerusahaan] = useState(0);
  const [bpjsTkPerusahaan, setBpjsTkPerusahaan] = useState(0);

  // Custom Adjustments state
  const [customAdjustments, setCustomAdjustments] = useState<CustomAdjustment[]>([]);
  
  // Protection State
  const [isDirty, setIsDirty] = useState(false);

  const toNum = (v: unknown) => {
    if (typeof v === "number") return v;
    if (typeof v === "string") return Number(v) || 0;
    return 0;
  };

  const filteredUsers = users.filter((u) => isBranchOperationalPersonnel(u));

  // 'configured' = punya row dan minimal satu nilai > 0
  // 'empty'      = punya row tapi semua nilai 0
  // 'none'       = belum punya row sama sekali
  const getConfigStatus = (userId: string): 'configured' | 'empty' | 'none' => {
    const cfg = localPayrollConfigs.find(c => c.user_id === userId);
    if (!cfg) return 'none';
    const hasValues = toNum(cfg.base_salary) > 0 || toNum(cfg.position_allowance) > 0
      || toNum(cfg.meal_allowance) > 0 || toNum(cfg.transport_allowance) > 0;
    return hasValues ? 'configured' : 'empty';
  };

  const unconfiguredCount = filteredUsers.filter(u => getConfigStatus(u.app_users.id) !== 'configured').length;

  const BPJS_IDS = ['__bpjs_kes_k__', '__bpjs_tk_k__', '__bpjs_kes_p__', '__bpjs_tk_p__'];

  const loadUserConfig = (user: any) => {
    const config = localPayrollConfigs.find(c => c.user_id === user.app_users.id);
    setBaseSalary(toNum(config?.base_salary));
    setPositionAllowance(toNum(config?.position_allowance));
    setMealAllowance(toNum(config?.meal_allowance));
    setTransportAllowance(toNum(config?.transport_allowance));

    const allAdj: any[] = Array.isArray(config?.custom_adjustments) ? config.custom_adjustments : [];
    const bpjsItems = allAdj.filter((a: any) => BPJS_IDS.includes(a.id));
    const normalItems = allAdj.filter((a: any) => !BPJS_IDS.includes(a.id));

    const getBpjs = (id: string) => bpjsItems.find((a: any) => a.id === id)?.amount ?? 0;

    if (bpjsItems.length === 0 && toNum(config?.bpjs_deduction) > 0) {
      // Migrate legacy single bpjs_deduction → kes_karyawan
      setBpjsKesKaryawan(toNum(config.bpjs_deduction));
      setBpjsTkKaryawan(0);
    } else {
      setBpjsKesKaryawan(getBpjs('__bpjs_kes_k__'));
      setBpjsTkKaryawan(getBpjs('__bpjs_tk_k__'));
    }
    setBpjsKesPerusahaan(getBpjs('__bpjs_kes_p__'));
    setBpjsTkPerusahaan(getBpjs('__bpjs_tk_p__'));

    setCustomAdjustments(normalItems);
    setIsDirty(false);
  };

  const handleSelectUser = (user: any) => {
    if (isDirty) {
      setPendingNav({ type: "user", user });
      return;
    }
    setSelectedUser(user);
    loadUserConfig(user);
  };

  const handleClose = () => {
    if (isDirty) {
      setPendingNav({ type: "close" });
      return;
    }
    setSelectedUser(null);
  };

  const executePendingNav = () => {
    if (!pendingNav) return;
    if (pendingNav.type === "close") {
      setSelectedUser(null);
      setIsDirty(false);
    } else if (pendingNav.type === "user") {
      setSelectedUser(pendingNav.user);
      loadUserConfig(pendingNav.user);
    } else if (pendingNav.type === "copy") {
      setCopyTargetUser(pendingNav.user);
    }
    setPendingNav(null);
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

  // ── Unsaved-changes warning modal ────────────────────────────────────────────
  // "close" = klik Tutup, any = pindah ke user lain, "copy" = buka copy modal
  const [pendingNav, setPendingNav] = useState<{ type: "user"; user: any } | { type: "close" } | { type: "copy"; user: any } | null>(null);

  // ── Copy-from state ──────────────────────────────────────────────────────────
  const [copyTargetUser, setCopyTargetUser] = useState<any>(null);

  const handleOpenCopyModal = (user: any) => {
    if (isDirty && selectedUser && selectedUser.id !== user.id) {
      setPendingNav({ type: "copy", user });
      return;
    }
    setCopyTargetUser(user);
  };

  const handleCopyFrom = (sourceUser: any) => {
    const config = localPayrollConfigs.find(c => c.user_id === sourceUser.app_users.id);
    setSelectedUser(copyTargetUser);
    setBaseSalary(toNum(config?.base_salary));
    setPositionAllowance(toNum(config?.position_allowance));
    setMealAllowance(toNum(config?.meal_allowance));
    setTransportAllowance(toNum(config?.transport_allowance));

    const allAdj: any[] = Array.isArray(config?.custom_adjustments) ? config.custom_adjustments : [];
    const srcBpjsItems = allAdj.filter((a: any) => BPJS_IDS.includes(a.id));
    const srcNormalItems = allAdj.filter((a: any) => !BPJS_IDS.includes(a.id));
    const getBpjs = (id: string) => srcBpjsItems.find((a: any) => a.id === id)?.amount ?? 0;

    if (srcBpjsItems.length === 0 && toNum(config?.bpjs_deduction) > 0) {
      setBpjsKesKaryawan(toNum(config.bpjs_deduction));
      setBpjsTkKaryawan(0);
    } else {
      setBpjsKesKaryawan(getBpjs('__bpjs_kes_k__'));
      setBpjsTkKaryawan(getBpjs('__bpjs_tk_k__'));
    }
    setBpjsKesPerusahaan(getBpjs('__bpjs_kes_p__'));
    setBpjsTkPerusahaan(getBpjs('__bpjs_tk_p__'));
    setCustomAdjustments(srcNormalItems);
    setIsDirty(true);
    setCopyTargetUser(null);
    toast.success(`Disalin dari ${sourceUser.app_users.full_name}. Periksa lalu simpan.`);
  };

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    // Compile BPJS components into custom_adjustments
    const bpjsItems = [
      { id: '__bpjs_kes_k__', name: 'BPJS Kesehatan - Karyawan', type: 'bpjs_employee', amount: bpjsKesKaryawan },
      { id: '__bpjs_tk_k__', name: 'BPJS TK - Karyawan', type: 'bpjs_employee', amount: bpjsTkKaryawan },
      { id: '__bpjs_kes_p__', name: 'BPJS Kesehatan - Perusahaan', type: 'bpjs_employer', amount: bpjsKesPerusahaan },
      { id: '__bpjs_tk_p__', name: 'BPJS TK - Perusahaan', type: 'bpjs_employer', amount: bpjsTkPerusahaan },
    ].filter(b => b.amount > 0);

    const allAdjustments = [...bpjsItems, ...customAdjustments];
    const bpjsEmployeeTotal = bpjsKesKaryawan + bpjsTkKaryawan;

    formData.set("bpjsDeduction", String(bpjsEmployeeTotal));
    formData.append("customAdjustments", JSON.stringify(allAdjustments));
    
    startTransition(async () => {
      const result = await savePayrollConfigAction(null, formData);
      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        toast.success(result.message);
        setLocalPayrollConfigs((prev) => {
          const bpjsItemsSave = [
            { id: '__bpjs_kes_k__', name: 'BPJS Kesehatan - Karyawan', type: 'bpjs_employee', amount: bpjsKesKaryawan },
            { id: '__bpjs_tk_k__', name: 'BPJS TK - Karyawan', type: 'bpjs_employee', amount: bpjsTkKaryawan },
            { id: '__bpjs_kes_p__', name: 'BPJS Kesehatan - Perusahaan', type: 'bpjs_employer', amount: bpjsKesPerusahaan },
            { id: '__bpjs_tk_p__', name: 'BPJS TK - Perusahaan', type: 'bpjs_employer', amount: bpjsTkPerusahaan },
          ].filter(b => b.amount > 0);
          const payload = {
            user_id: selectedUser.app_users.id,
            base_salary: baseSalary,
            position_allowance: positionAllowance,
            meal_allowance: mealAllowance,
            transport_allowance: transportAllowance,
            bpjs_deduction: bpjsKesKaryawan + bpjsTkKaryawan,
            custom_adjustments: [...bpjsItemsSave, ...customAdjustments],
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
  const bpjsEmployeeTotal = bpjsKesKaryawan + bpjsTkKaryawan;
  const bpjsEmployerTotal = bpjsKesPerusahaan + bpjsTkPerusahaan;
  const totalFixed = baseSalary + positionAllowance + mealAllowance + transportAllowance + totalCustomAdditions - bpjsEmployeeTotal - totalCustomDeductions;

  return (
    <>
    <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6 lg:gap-8">
      {/* 1. EMPLOYEE LIST */}
      <div className="lg:col-span-1 flex flex-col gap-4 shrink-0">
        <div className="space-y-1 px-1">
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Users size={20} className="text-sky-600" /> Daftar Pegawai
          </h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Pilih pegawai untuk mengatur gaji</p>
        </div>

        {/* Banner status konfigurasi */}
        {filteredUsers.length > 0 && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border ${
            unconfiguredCount > 0
              ? 'bg-amber-50 border-amber-100 text-amber-700'
              : 'bg-emerald-50 border-emerald-100 text-emerald-700'
          }`}>
            {unconfiguredCount > 0 ? (
              <>
                <AlertCircle size={13} className="shrink-0" />
                {unconfiguredCount} dari {filteredUsers.length} pegawai belum dikonfigurasi
              </>
            ) : (
              <>
                <CheckCircle2 size={13} className="shrink-0" />
                Semua pegawai sudah dikonfigurasi
              </>
            )}
          </div>
        )}

        <div className="overflow-y-auto max-h-72 lg:max-h-[55vh] pr-2 space-y-3 custom-scrollbar">
          {filteredUsers.map((user) => {
            const uid = user.app_users.id;
            const status = getConfigStatus(uid);
            const unconfigured = status !== 'configured';
            const isSelected = selectedUser?.id === user.id;

            return (
              <div
                key={user.id}
                className={`w-full rounded-3xl border-2 transition-all overflow-hidden ${
                  isSelected
                    ? 'border-sky-600 bg-sky-50 shadow-lg shadow-sky-600/10'
                    : unconfigured
                    ? 'border-amber-200 bg-amber-50/40 shadow-sm'
                    : 'border-white bg-white/50 shadow-sm'
                }`}
              >
                {/* Main select area */}
                <button
                  type="button"
                  onClick={() => handleSelectUser(user)}
                  title={unconfigured && !isSelected ? "Belum dikonfigurasi — klik untuk isi konfigurasi gaji" : undefined}
                  className={`w-full p-4 text-left flex items-center justify-between group transition-colors ${
                    isSelected ? '' : unconfigured ? 'hover:bg-amber-50' : 'hover:bg-white'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-sky-600 text-white'
                        : unconfigured
                        ? 'bg-amber-100 text-amber-500 group-hover:bg-amber-200'
                        : 'bg-slate-100 text-slate-400 group-hover:bg-sky-100 group-hover:text-sky-600'
                    }`}>
                      <Users size={18} />
                    </div>
                    <div>
                      <p className="font-black text-slate-800 text-sm truncate max-w-[120px]">{user.app_users.full_name}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{user.role.replace('_', ' ')}</p>
                      {unconfigured && !isSelected && (
                        <span className="inline-flex items-center gap-0.5 mt-0.5 text-[9px] font-black text-amber-600 uppercase tracking-tight">
                          <AlertCircle size={9} />
                          {status === 'none' ? 'Belum diisi' : 'Semua nilai 0'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {isSelected ? null : unconfigured ? (
                      <AlertCircle size={15} className="text-amber-400" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                        <Save size={12} />
                      </div>
                    )}
                  </div>
                </button>

                {/* Copy strip */}
                {filteredUsers.length > 1 && (
                  <div className={`border-t px-4 py-2 ${isSelected ? 'border-sky-200/60' : unconfigured ? 'border-amber-100' : 'border-slate-100'}`}>
                    <button
                      type="button"
                      onClick={() => handleOpenCopyModal(user)}
                      className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 hover:text-sky-600 uppercase tracking-widest transition-colors"
                    >
                      <Copy size={10} /> Salin dari pegawai lain
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. SETUP PANEL */}
      <div className="lg:col-span-2">
        <AnimatePresence mode="wait">
          {selectedUser ? (
            <motion.div
              key={selectedUser.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <GlassCard variant="light" className="p-0 overflow-hidden flex flex-col border-2 border-sky-100 shadow-2xl shadow-sky-600/5">
                <form onSubmit={handleSave} className="flex flex-col">
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
                      <button type="button" onClick={handleClose} className="text-[10px] font-black text-slate-400 uppercase hover:text-rose-500 transition-colors">Tutup</button>
                    </div>
                  </div>

                  {/* Form Content */}
                  <div className="p-8 space-y-8 bg-white">
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
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                              Transport / Hari Masuk (Rp)
                            </label>
                            <CurrencyInput
                              name="transportAllowance"
                              value={transportAllowance}
                              onChange={setter(setTransportAllowance)}
                              className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-sky-500/10 focus:border-sky-600 outline-none transition-all font-black text-slate-800"
                            />
                            <p className="text-[10px] text-slate-400 font-medium">Rate per hari — dikalikan hari masuk saat rekap payroll bulanan.</p>
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

                    {/* BPJS MULTI-KOMPONEN */}
                    <div className="pt-8 border-t border-slate-100 space-y-4">
                      <div className="flex items-center gap-2 text-slate-800 pb-1">
                        <ChevronRight size={14} className="text-rose-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-rose-500">Potongan & Tanggungan BPJS</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Karyawan side */}
                        <div className="space-y-4">
                          <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest border-b border-rose-100 pb-1">Potongan dari Karyawan</p>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">BPJS Kesehatan - Karyawan (Rp)</label>
                            <CurrencyInput
                              value={bpjsKesKaryawan}
                              onChange={setter(setBpjsKesKaryawan)}
                              className="w-full px-5 py-3 bg-rose-50/50 border border-rose-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-rose-500/10 focus:border-rose-600 outline-none transition-all font-black text-rose-600"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">BPJS Ketenagakerjaan - Karyawan (Rp)</label>
                            <CurrencyInput
                              value={bpjsTkKaryawan}
                              onChange={setter(setBpjsTkKaryawan)}
                              className="w-full px-5 py-3 bg-rose-50/50 border border-rose-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-rose-500/10 focus:border-rose-600 outline-none transition-all font-black text-rose-600"
                            />
                          </div>
                          {bpjsEmployeeTotal > 0 && (
                            <div className="flex justify-between items-center px-4 py-2.5 bg-rose-50 rounded-xl border border-rose-100">
                              <span className="text-[10px] font-bold text-rose-600 uppercase">Total Potongan</span>
                              <span className="font-black text-rose-600 text-sm">−Rp {bpjsEmployeeTotal.toLocaleString('id-ID')}</span>
                            </div>
                          )}
                        </div>
                        {/* Perusahaan side */}
                        <div className="space-y-4">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">Tanggungan Perusahaan (Info)</p>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">BPJS Kesehatan - Perusahaan (Rp)</label>
                            <CurrencyInput
                              value={bpjsKesPerusahaan}
                              onChange={setter(setBpjsKesPerusahaan)}
                              className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition-all font-black text-slate-700"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">BPJS Ketenagakerjaan - Perusahaan (Rp)</label>
                            <CurrencyInput
                              value={bpjsTkPerusahaan}
                              onChange={setter(setBpjsTkPerusahaan)}
                              className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition-all font-black text-slate-700"
                            />
                          </div>
                          {bpjsEmployerTotal > 0 && (
                            <div className="flex justify-between items-center px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200">
                              <span className="text-[10px] font-bold text-slate-500 uppercase">Total Tanggungan</span>
                              <span className="font-black text-slate-600 text-sm">Rp {bpjsEmployerTotal.toLocaleString('id-ID')}</span>
                            </div>
                          )}
                          <p className="text-[9px] text-slate-400 font-medium leading-relaxed">Tidak mengurangi take-home karyawan. Dicatat sebagai beban perusahaan.</p>
                        </div>
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
                          <p className="text-[9px] font-bold opacity-75 bg-black/20 px-2 py-1 rounded-md">*Makan & Transport dikali hari masuk</p>
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
                         Tips: Uang makan & transport dihitung per hari masuk saat rekap payroll. Kategori kustom berlaku tetap tiap bulan sampai dihapus. Tanggungan BPJS perusahaan tidak mengurangi gaji karyawan.
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
            <div className="flex items-center justify-center text-center py-20 px-8">
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

      {/* Unsaved changes warning modal */}
      {pendingNav && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setPendingNav(null)}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
            className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
          >
            <div className="p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0">
                  <AlertCircle size={22} className="text-amber-500" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm">Perubahan Belum Disimpan</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    {selectedUser?.app_users?.full_name}
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed bg-amber-50/60 border border-amber-100 rounded-xl p-3">
                Konfigurasi gaji yang sudah diubah belum disimpan. Jika dilanjutkan, perubahan akan hilang.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPendingNav(null)}
                  className="flex-1 px-3 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={executePendingNav}
                  className="flex-1 px-3 py-2.5 rounded-xl font-black text-sm text-white bg-amber-500 hover:bg-amber-600 transition-colors"
                >
                  Buang Perubahan
                </button>
              </div>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {/* Copy-from modal */}
      {copyTargetUser && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setCopyTargetUser(null)}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
            className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
          >
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-black text-slate-800 text-sm flex items-center gap-2"><Copy size={14} className="text-sky-600" /> Salin Konfigurasi Dari</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  ke: {copyTargetUser.app_users.full_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCopyTargetUser(null)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-500 flex items-center justify-center transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-3 space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
              {filteredUsers.filter(u => u.app_users.id !== copyTargetUser.app_users.id).length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-6 font-bold">Tidak ada pegawai lain di cabang ini.</p>
              ) : (
                filteredUsers.filter(u => u.app_users.id !== copyTargetUser.app_users.id).map(u => {
                  const srcStatus = getConfigStatus(u.app_users.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleCopyFrom(u)}
                      disabled={srcStatus === 'none'}
                      className="w-full text-left p-3 rounded-2xl border border-slate-100 hover:border-sky-200 hover:bg-sky-50/60 transition-all flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-400 group-hover:bg-sky-100 group-hover:text-sky-600 flex items-center justify-center shrink-0 transition-colors">
                        <Users size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-slate-800 text-xs truncate">{u.app_users.full_name}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">{u.role.replace('_', ' ')}</p>
                      </div>
                      <div className="shrink-0">
                        {srcStatus === 'configured' ? (
                          <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">Ada data</span>
                        ) : srcStatus === 'empty' ? (
                          <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">Semua 0</span>
                        ) : (
                          <span className="text-[9px] font-black text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">Kosong</span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="p-3 border-t border-slate-100 bg-slate-50/30">
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest text-center">
                Semua komponen gaji akan disalin. Data belum tersimpan otomatis.
              </p>
            </div>
          </motion.div>
        </div>,
        document.body
      )}
    </>
  );
}
