"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useTransition, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { GlassCard } from "@/components/shared/glass-card";
import {
  Users, Save, Loader2, ChevronDown, Calculator, Copy, Plus, X,
  AlertCircle, CheckCircle2, ShieldCheck, UserCog, Building2, Banknote, Trash2,
} from "lucide-react";
import { InfoTooltip } from "@/components/shared/info-tooltip";
import { savePayrollConfigAction, updatePayrollAddonSettingsAction } from "./actions";
import { toast } from "sonner";
import { CurrencyInput } from "@/components/shared/currency-input";
import { cn } from "@/lib/utils";
import { isBranchOperationalPersonnel } from "@/lib/branch-personnel";

const IDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

const BPJS_IDS = ["__bpjs_kes_k__", "__bpjs_tk_k__", "__bpjs_kes_p__", "__bpjs_tk_p__"];

type CustomAdjustment = { id: string; name: string; type: "addition" | "deduction"; amount: number };

// ─── Per-card component ────────────────────────────────────────────────────────

function BbaPayrollCard({
  user,
  allConfigs,
  allUsers,
  branchId,
}: {
  user: any;
  allConfigs: any[];
  allUsers: any[];
  branchId: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isDirty, setIsDirty] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);

  const toNum = (v: unknown) => typeof v === "number" ? v : typeof v === "string" ? Number(v) || 0 : 0;

  const buildStateFromConfig = (cfg: any) => {
    const allAdj: any[] = Array.isArray(cfg?.custom_adjustments) ? cfg.custom_adjustments : [];
    const bpjsItems = allAdj.filter((a: any) => BPJS_IDS.includes(a.id));
    const normalItems = allAdj.filter((a: any) => !BPJS_IDS.includes(a.id));
    const getBpjs = (id: string) => bpjsItems.find((a: any) => a.id === id)?.amount ?? 0;
    const legacyBpjs = toNum(cfg?.bpjs_deduction);
    return {
      baseSalary:         toNum(cfg?.base_salary),
      positionAllowance:  toNum(cfg?.position_allowance),
      mealAllowance:      toNum(cfg?.meal_allowance),
      transportAllowance: toNum(cfg?.transport_allowance),
      bpjsKesKaryawan:    bpjsItems.length === 0 && legacyBpjs > 0 ? legacyBpjs : getBpjs("__bpjs_kes_k__"),
      bpjsTkKaryawan:     bpjsItems.length === 0 ? 0 : getBpjs("__bpjs_tk_k__"),
      bpjsKesPerusahaan:  getBpjs("__bpjs_kes_p__"),
      bpjsTkPerusahaan:   getBpjs("__bpjs_tk_p__"),
      customAdj:          normalItems.map((a: any, i: number): CustomAdjustment => ({
        id:     String(a.id ?? `${Date.now()}_${i}`),
        name:   String(a.name ?? ""),
        type:   (a.type === "deduction" ? "deduction" : "addition") as "addition" | "deduction",
        amount: Number(a.amount ?? 0),
      })),
    };
  };

  const uid = user.app_users.id;
  const initialCfg = allConfigs.find((c) => c.user_id === uid);
  const initial = buildStateFromConfig(initialCfg);

  const [baseSalary,         setBaseSalary]         = useState(initial.baseSalary);
  const [positionAllowance,  setPositionAllowance]  = useState(initial.positionAllowance);
  const [mealAllowance,      setMealAllowance]      = useState(initial.mealAllowance);
  const [transportAllowance, setTransportAllowance] = useState(initial.transportAllowance);
  const [bpjsKesKaryawan,    setBpjsKesKaryawan]    = useState(initial.bpjsKesKaryawan);
  const [bpjsTkKaryawan,     setBpjsTkKaryawan]     = useState(initial.bpjsTkKaryawan);
  const [bpjsKesPerusahaan,  setBpjsKesPerusahaan]  = useState(initial.bpjsKesPerusahaan);
  const [bpjsTkPerusahaan,   setBpjsTkPerusahaan]   = useState(initial.bpjsTkPerusahaan);
  const [customAdj,          setCustomAdj]          = useState<CustomAdjustment[]>(initial.customAdj);
  const [baseline,           setBaseline]           = useState(initial);

  // Re-sync when branchId changes (parent re-renders with new data)
  useEffect(() => {
    const cfg = allConfigs.find((c) => c.user_id === uid);
    const s = buildStateFromConfig(cfg);
    setBaseSalary(s.baseSalary); setPositionAllowance(s.positionAllowance);
    setMealAllowance(s.mealAllowance); setTransportAllowance(s.transportAllowance);
    setBpjsKesKaryawan(s.bpjsKesKaryawan); setBpjsTkKaryawan(s.bpjsTkKaryawan);
    setBpjsKesPerusahaan(s.bpjsKesPerusahaan); setBpjsTkPerusahaan(s.bpjsTkPerusahaan);
    setCustomAdj(s.customAdj); setBaseline(s); setIsDirty(false); setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  const mark = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setIsDirty(true); };

  const bpjsEmployeeTotal = bpjsKesKaryawan + bpjsTkKaryawan;
  const bpjsEmployerTotal = bpjsKesPerusahaan + bpjsTkPerusahaan;
  const totalGross = baseSalary + positionAllowance + mealAllowance + transportAllowance
    + customAdj.filter((c) => c.type === "addition").reduce((s, c) => s + c.amount, 0);
  const netSalary = totalGross - bpjsEmployeeTotal
    - customAdj.filter((c) => c.type === "deduction").reduce((s, c) => s + c.amount, 0);

  const isConfigured = baseSalary > 0 || positionAllowance > 0 || mealAllowance > 0;

  const addAdj = (type: "addition" | "deduction") => {
    setCustomAdj((p) => [...p, { id: Date.now().toString(), name: "", type, amount: 0 }]);
    setIsDirty(true);
  };
  const removeAdj = (id: string) => { setCustomAdj((p) => p.filter((c) => c.id !== id)); setIsDirty(true); };
  const updateAdj = (id: string, patch: Partial<CustomAdjustment>) => {
    setCustomAdj((p) => p.map((c) => c.id === id ? { ...c, ...patch } : c));
    setIsDirty(true);
  };

  const resetToBaseline = () => {
    setBaseSalary(baseline.baseSalary); setPositionAllowance(baseline.positionAllowance);
    setMealAllowance(baseline.mealAllowance); setTransportAllowance(baseline.transportAllowance);
    setBpjsKesKaryawan(baseline.bpjsKesKaryawan); setBpjsTkKaryawan(baseline.bpjsTkKaryawan);
    setBpjsKesPerusahaan(baseline.bpjsKesPerusahaan); setBpjsTkPerusahaan(baseline.bpjsTkPerusahaan);
    setCustomAdj(baseline.customAdj); setIsDirty(false);
  };

  const handleToggleOpen = () => {
    if (open && isDirty) { setShowUnsavedWarning(true); return; }
    setOpen(!open);
  };
  const handleDiscardAndClose = () => { resetToBaseline(); setShowUnsavedWarning(false); setOpen(false); };

  const handleCopyFrom = (sourceUser: any) => {
    const srcCfg = allConfigs.find((c) => c.user_id === sourceUser.app_users.id);
    const s = buildStateFromConfig(srcCfg);
    setBaseSalary(s.baseSalary); setPositionAllowance(s.positionAllowance);
    setMealAllowance(s.mealAllowance); setTransportAllowance(s.transportAllowance);
    setBpjsKesKaryawan(s.bpjsKesKaryawan); setBpjsTkKaryawan(s.bpjsTkKaryawan);
    setBpjsKesPerusahaan(s.bpjsKesPerusahaan); setBpjsTkPerusahaan(s.bpjsTkPerusahaan);
    setCustomAdj(s.customAdj); setIsDirty(true); setShowCopyModal(false);
    toast.success(`Disalin dari ${sourceUser.app_users.full_name}. Periksa lalu simpan.`);
  };

  const handleSave = () => {
    const bpjsItems = [
      { id: "__bpjs_kes_k__", name: "BPJS Kesehatan - Karyawan",   type: "bpjs_employee", amount: bpjsKesKaryawan },
      { id: "__bpjs_tk_k__",  name: "BPJS TK - Karyawan",          type: "bpjs_employee", amount: bpjsTkKaryawan },
      { id: "__bpjs_kes_p__", name: "BPJS Kesehatan - Perusahaan", type: "bpjs_employer", amount: bpjsKesPerusahaan },
      { id: "__bpjs_tk_p__",  name: "BPJS TK - Perusahaan",        type: "bpjs_employer", amount: bpjsTkPerusahaan },
    ].filter((b) => b.amount > 0);

    const fd = new FormData();
    fd.set("tenantId", branchId);
    fd.set("userId", uid);
    fd.set("baseSalary", String(baseSalary));
    fd.set("positionAllowance", String(positionAllowance));
    fd.set("mealAllowance", String(mealAllowance));
    fd.set("transportAllowance", String(transportAllowance));
    fd.set("bpjsDeduction", String(bpjsEmployeeTotal));
    fd.set("customAdjustments", JSON.stringify([...bpjsItems, ...customAdj]));

    startTransition(async () => {
      const result = await savePayrollConfigAction(null, fd);
      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        toast.success(result.message);
        setIsDirty(false);
        setBaseline({
          baseSalary, positionAllowance, mealAllowance, transportAllowance,
          bpjsKesKaryawan, bpjsTkKaryawan, bpjsKesPerusahaan, bpjsTkPerusahaan, customAdj,
        });
      }
    });
  };

  const otherUsers = allUsers.filter((u) => u.app_users.id !== uid);

  return (
    <div className={cn(
      "bg-white border rounded-2xl overflow-hidden shadow-sm transition-colors",
      isDirty ? "border-amber-300" : isConfigured ? "border-slate-200" : "border-amber-200/80",
    )}>
      {/* ── Header ── */}
      <button
        type="button"
        onClick={handleToggleOpen}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
            isConfigured ? "bg-sky-50" : "bg-amber-50",
          )}>
            <Users size={14} className={isConfigured ? "text-sky-600" : "text-amber-500"} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-slate-800">{user.app_users.full_name}</p>
              {isDirty && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 uppercase tracking-wide">
                  <AlertCircle size={8} /> Belum disimpan
                </span>
              )}
            </div>
            {isConfigured ? (
              <p className="text-[10px] text-slate-400 font-medium">
                Gaji pokok {IDR.format(baseSalary)} · THP ~{IDR.format(netSalary)}
              </p>
            ) : (
              <p className="text-[10px] text-amber-500 font-bold uppercase tracking-wide">Belum dikonfigurasi</p>
            )}
          </div>
        </div>
        <ChevronDown size={14} className={cn("text-slate-400 transition-transform shrink-0 ml-2", open && "rotate-180")} />
      </button>

      {/* ── Form ── */}
      {open && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-5">

          {/* Top action bar */}
          <div className="flex items-center justify-between">
            {otherUsers.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowCopyModal(true)}
                className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-sky-600 uppercase tracking-widest transition-colors"
              >
                <Copy size={11} /> Salin dari pegawai lain
              </button>
            ) : <span />}
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !isDirty}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white bg-sky-600 hover:bg-sky-500 shadow-sm transition-colors disabled:opacity-50"
            >
              {isPending ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              {isPending ? "Menyimpan…" : isDirty ? "Simpan Perubahan" : "Tersimpan"}
            </button>
          </div>

          {/* Gaji & Tunjangan */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Gaji & Tunjangan</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-[9px] font-bold uppercase text-slate-400 flex items-center gap-1">
                  Gaji Pokok
                  <InfoTooltip content="Komponen gaji tetap yang diterima setiap bulan terlepas dari kehadiran." side="top" width="w-52" />
                </span>
                <CurrencyInput value={baseSalary} onChange={mark(setBaseSalary)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10 outline-none transition-all" />
              </label>
              <label className="block space-y-1">
                <span className="text-[9px] font-bold uppercase text-slate-400 flex items-center gap-1">
                  Tunjangan Jabatan
                  <InfoTooltip content="Tunjangan berdasarkan posisi/jabatan. Bersifat tetap setiap bulan." side="top" width="w-52" />
                </span>
                <CurrencyInput value={positionAllowance} onChange={mark(setPositionAllowance)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10 outline-none transition-all" />
              </label>
              <label className="block space-y-1">
                <span className="text-[9px] font-bold uppercase text-slate-400 flex items-center gap-1">
                  Uang Makan / Hari
                  <InfoTooltip content="Rate per hari kehadiran. Dikali jumlah hari masuk aktual saat rekap payroll." side="top" width="w-56" />
                </span>
                <CurrencyInput value={mealAllowance} onChange={mark(setMealAllowance)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10 outline-none transition-all" />
              </label>
              <label className="block space-y-1">
                <span className="text-[9px] font-bold uppercase text-slate-400 flex items-center gap-1">
                  Transport / Hari
                  <InfoTooltip content="Rate per hari kehadiran. Dikali jumlah hari masuk aktual saat rekap payroll." side="top" width="w-56" />
                </span>
                <CurrencyInput value={transportAllowance} onChange={mark(setTransportAllowance)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10 outline-none transition-all" />
              </label>
            </div>
          </div>

          {/* Penambahan Kustom */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-1">
                <Plus size={10} /> Penambahan Kustom
                <InfoTooltip content="Komponen tambahan tetap setiap bulan. Contoh: insentif jabatan, uang bensin khusus." side="top" width="w-64" />
              </p>
              <button type="button" onClick={() => addAdj("addition")} className="p-1 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors">
                <Plus size={12} />
              </button>
            </div>
            {customAdj.filter((c) => c.type === "addition").length === 0 ? (
              <p className="text-[10px] text-slate-400 italic px-1">Belum ada. Contoh: Uang Bensin Khusus, Insentif Jabatan.</p>
            ) : (
              <div className="space-y-2">
                {customAdj.filter((c) => c.type === "addition").map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <input placeholder="Nama penambahan..." value={item.name}
                      onChange={(e) => updateAdj(item.id, { name: e.target.value })}
                      className="flex-1 min-w-0 rounded-xl border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white focus:border-emerald-500 outline-none" />
                    <CurrencyInput value={item.amount} onChange={(val) => updateAdj(item.id, { amount: val })}
                      className="w-28 rounded-xl border border-emerald-200 px-2 py-1.5 text-xs font-black text-emerald-600 bg-emerald-50/30 outline-none focus:border-emerald-400" />
                    <button type="button" onClick={() => removeAdj(item.id)} className="text-rose-300 hover:text-rose-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pengurangan Kustom */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 flex items-center gap-1">
                <X size={10} /> Pengurangan Kustom
                <InfoTooltip content="Potongan tetap tiap bulan. Contoh: cicilan kasbon, denda absensi rutin." side="top" width="w-64" />
              </p>
              <button type="button" onClick={() => addAdj("deduction")} className="p-1 bg-rose-50 text-rose-500 rounded-lg hover:bg-rose-100 transition-colors">
                <Plus size={12} />
              </button>
            </div>
            {customAdj.filter((c) => c.type === "deduction").length === 0 ? (
              <p className="text-[10px] text-slate-400 italic px-1">Belum ada. Contoh: Kasbon, Denda Absensi.</p>
            ) : (
              <div className="space-y-2">
                {customAdj.filter((c) => c.type === "deduction").map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <input placeholder="Nama pengurangan..." value={item.name}
                      onChange={(e) => updateAdj(item.id, { name: e.target.value })}
                      className="flex-1 min-w-0 rounded-xl border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white focus:border-rose-400 outline-none" />
                    <CurrencyInput value={item.amount} onChange={(val) => updateAdj(item.id, { amount: val })}
                      className="w-28 rounded-xl border border-rose-200 px-2 py-1.5 text-xs font-black text-rose-600 bg-rose-50/30 outline-none focus:border-rose-400" />
                    <button type="button" onClick={() => removeAdj(item.id)} className="text-rose-300 hover:text-rose-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* BPJS */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-rose-500">Potongan & Tanggungan BPJS</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 p-3 bg-rose-50/40 rounded-xl border border-rose-100">
                <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest">Dari Karyawan</p>
                <label className="block space-y-1">
                  <span className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1">
                    BPJS Kesehatan
                    <InfoTooltip content="Potongan iuran BPJS Kesehatan karyawan. Umumnya 1% dari gaji." side="top" width="w-52" />
                  </span>
                  <CurrencyInput value={bpjsKesKaryawan} onChange={mark(setBpjsKesKaryawan)}
                    className="w-full rounded-xl border border-rose-200 px-2.5 py-2 text-sm font-black text-rose-600 bg-white outline-none focus:ring-2 focus:ring-rose-500/10 transition-all" />
                </label>
                <label className="block space-y-1">
                  <span className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1">
                    BPJS Ketenagakerjaan
                    <InfoTooltip content="Potongan JHT (2%) dan JP (1%) dari gaji karyawan." side="top" width="w-52" />
                  </span>
                  <CurrencyInput value={bpjsTkKaryawan} onChange={mark(setBpjsTkKaryawan)}
                    className="w-full rounded-xl border border-rose-200 px-2.5 py-2 text-sm font-black text-rose-600 bg-white outline-none focus:ring-2 focus:ring-rose-500/10 transition-all" />
                </label>
                {bpjsEmployeeTotal > 0 && (
                  <div className="flex justify-between items-center text-[10px] font-black text-rose-600 bg-rose-50 rounded-lg px-2.5 py-1.5 border border-rose-100">
                    <span>Total Potongan</span><span>−{IDR.format(bpjsEmployeeTotal)}</span>
                  </div>
                )}
              </div>
              <div className="space-y-2 p-3 bg-slate-50/60 rounded-xl border border-slate-100">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tanggungan Perusahaan</p>
                <label className="block space-y-1">
                  <span className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1">
                    BPJS Kesehatan
                    <InfoTooltip content="Tanggungan BPJS Kesehatan oleh perusahaan (4%). Tidak mengurangi THP karyawan." side="top" width="w-60" />
                  </span>
                  <CurrencyInput value={bpjsKesPerusahaan} onChange={mark(setBpjsKesPerusahaan)}
                    className="w-full rounded-xl border border-slate-200 px-2.5 py-2 text-sm font-black text-slate-700 bg-white outline-none focus:ring-2 focus:ring-slate-400/10 transition-all" />
                </label>
                <label className="block space-y-1">
                  <span className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1">
                    BPJS Ketenagakerjaan
                    <InfoTooltip content="Tanggungan JHT (3.7%), JP (2%), JKK/JKM oleh perusahaan. Tidak mengurangi THP." side="top" width="w-64" />
                  </span>
                  <CurrencyInput value={bpjsTkPerusahaan} onChange={mark(setBpjsTkPerusahaan)}
                    className="w-full rounded-xl border border-slate-200 px-2.5 py-2 text-sm font-black text-slate-700 bg-white outline-none focus:ring-2 focus:ring-slate-400/10 transition-all" />
                </label>
                {bpjsEmployerTotal > 0 && (
                  <div className="flex justify-between items-center text-[10px] font-black text-slate-500 bg-slate-100 rounded-lg px-2.5 py-1.5">
                    <span>Total Tanggungan</span><span>{IDR.format(bpjsEmployerTotal)}</span>
                  </div>
                )}
                <p className="text-[9px] text-slate-400 leading-snug">Dicatat sebagai beban perusahaan, tidak mengurangi THP.</p>
              </div>
            </div>
          </div>

          {/* Estimasi THP */}
          <div className="bg-sky-600 rounded-2xl px-4 py-3 flex items-center justify-between shadow-lg shadow-sky-600/20">
            <div className="flex items-center gap-2">
              <Calculator size={16} className="text-sky-200 shrink-0" />
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-sky-200">Estimasi THP</p>
                <p className="text-[9px] text-sky-300 font-medium">*Makan & Transport dikali hari masuk · *Belum termasuk bonus KPI</p>
              </div>
            </div>
            <span className={cn("text-lg font-black", netSalary < 0 ? "text-rose-300" : "text-white")}>
              {IDR.format(netSalary)}
            </span>
          </div>

          {/* Bottom actions */}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => isDirty ? setShowUnsavedWarning(true) : setOpen(false)}
              disabled={isPending}
              className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !isDirty}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white bg-sky-600 hover:bg-sky-500 shadow-sm transition-colors disabled:opacity-50"
            >
              {isPending ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              {isPending ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </div>
      )}

      {/* Unsaved warning modal */}
      {showUnsavedWarning && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowUnsavedWarning(false)} />
          <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0">
                  <AlertCircle size={20} className="text-amber-500" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm">Perubahan Belum Disimpan</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{user.app_users.full_name}</p>
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed bg-amber-50/60 border border-amber-100 rounded-xl p-3">
                Konfigurasi gaji yang sudah diubah belum disimpan. Jika dilanjutkan, perubahan akan hilang.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowUnsavedWarning(false)}
                  className="flex-1 px-3 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                  Batal
                </button>
                <button type="button" onClick={handleDiscardAndClose}
                  className="flex-1 px-3 py-2.5 rounded-xl font-black text-sm text-white bg-amber-500 hover:bg-amber-600 transition-colors">
                  Buang Perubahan
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Copy-from modal */}
      {showCopyModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowCopyModal(false)} />
          <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                  <Copy size={13} className="text-sky-600" /> Salin Konfigurasi Dari
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">ke: {user.app_users.full_name}</p>
              </div>
              <button type="button" onClick={() => setShowCopyModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-500 flex items-center justify-center transition-colors">
                <X size={15} />
              </button>
            </div>
            <div className="p-3 space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
              {otherUsers.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-6 font-bold">Tidak ada pegawai lain.</p>
              ) : otherUsers.map((u) => {
                const srcCfg = allConfigs.find((c) => c.user_id === u.app_users.id);
                const hasData = srcCfg && (toNum(srcCfg.base_salary) > 0 || toNum(srcCfg.position_allowance) > 0);
                return (
                  <button key={u.app_users.id} type="button" onClick={() => handleCopyFrom(u)} disabled={!hasData}
                    className="w-full text-left p-3 rounded-2xl border border-slate-100 hover:border-sky-200 hover:bg-sky-50/60 transition-all flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed group">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-400 group-hover:bg-sky-100 group-hover:text-sky-600 flex items-center justify-center shrink-0 transition-colors">
                      <Users size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-800 text-xs truncate">{u.app_users.full_name}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">{u.role?.replace("_", " ")}</p>
                    </div>
                    {hasData ? (
                      <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 shrink-0">Ada data</span>
                    ) : (
                      <span className="text-[9px] font-black text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200 shrink-0">Kosong</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="p-3 border-t border-slate-100 bg-slate-50/30">
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest text-center">
                Semua komponen gaji akan disalin. Data belum tersimpan otomatis.
              </p>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── Parent component ──────────────────────────────────────────────────────────

export function TabPayroll({
  branchId,
  users,
  payrollConfigs,
  allowOwnerInput,
  allowAdminInput,
}: {
  branchId: string;
  users: any[];
  payrollConfigs: any[];
  allowOwnerInput: boolean;
  allowAdminInput: boolean;
}) {
  const [localConfigs, setLocalConfigs] = useState<any[]>(payrollConfigs || []);
  useEffect(() => { setLocalConfigs(payrollConfigs || []); }, [branchId, payrollConfigs]);

  // Delegation state
  const [localAllowOwner, setLocalAllowOwner] = useState(allowOwnerInput);
  const [localAllowAdmin, setLocalAllowAdmin] = useState(allowAdminInput);
  const [isSavingDelegation, startSavingDelegation] = useTransition();
  useEffect(() => { setLocalAllowOwner(allowOwnerInput); }, [allowOwnerInput]);
  useEffect(() => { setLocalAllowAdmin(allowAdminInput); }, [allowAdminInput]);

  const handleDelegationToggle = (key: "owner" | "admin", next: boolean) => {
    const nextOwner = key === "owner" ? next : localAllowOwner;
    const nextAdmin = key === "admin" ? next : localAllowAdmin;
    if (key === "owner") setLocalAllowOwner(next); else setLocalAllowAdmin(next);
    startSavingDelegation(async () => {
      const fd = new FormData();
      fd.set("tenantId", branchId);
      fd.set("allow_owner_input", String(nextOwner));
      fd.set("allow_admin_input", String(nextAdmin));
      const result = await updatePayrollAddonSettingsAction(null, fd);
      if (result.error) {
        toast.error(result.error);
        if (key === "owner") setLocalAllowOwner(!next); else setLocalAllowAdmin(!next);
      } else {
        toast.success(
          next
            ? `${key === "owner" ? "Owner" : "Admin Apotek"} kini dapat mengelola konfigurasi gaji.`
            : `Akses ${key === "owner" ? "Owner" : "Admin Apotek"} dinonaktifkan.`,
        );
      }
    });
  };

  const filteredUsers = users.filter((u) => isBranchOperationalPersonnel(u));
  const configuredCount = filteredUsers.filter((u) => {
    const cfg = localConfigs.find((c) => c.user_id === u.app_users.id);
    return cfg && (Number(cfg.base_salary) > 0 || Number(cfg.position_allowance) > 0);
  }).length;

  return (
    <>
      {/* ── Delegation panel ── */}
      <GlassCard variant="light" className="mb-6 p-5 border border-slate-200/80 bg-white/60">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
              <ShieldCheck size={16} className="text-indigo-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">Delegasi Konfigurasi Gaji</p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5 leading-relaxed flex items-center gap-1">
                Izinkan pihak lain untuk melihat &amp; mengatur konfigurasi gaji karyawan cabang ini.
                <InfoTooltip content="Jika diaktifkan, owner/admin apotek dapat membuka dan mengedit konfigurasi gaji karyawan melalui portal mereka masing-masing." side="right" width="w-72" />
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            {/* Owner toggle */}
            <button type="button" disabled={isSavingDelegation}
              onClick={() => handleDelegationToggle("owner", !localAllowOwner)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border text-xs font-black transition-all select-none
                ${localAllowOwner ? "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100" : "bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"}
                disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {isSavingDelegation ? <Loader2 size={13} className="animate-spin shrink-0" /> : <Building2 size={13} className="shrink-0" />}
              <span>Owner Apotek</span>
              <span className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${localAllowOwner ? "bg-indigo-500" : "bg-slate-300"}`}>
                <span className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${localAllowOwner ? "translate-x-3.5" : "translate-x-0.5"}`} />
              </span>
            </button>
            {/* Admin toggle */}
            <button type="button" disabled={isSavingDelegation}
              onClick={() => handleDelegationToggle("admin", !localAllowAdmin)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border text-xs font-black transition-all select-none
                ${localAllowAdmin ? "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100" : "bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"}
                disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {isSavingDelegation ? <Loader2 size={13} className="animate-spin shrink-0" /> : <UserCog size={13} className="shrink-0" />}
              <span>Admin Apotek</span>
              <span className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${localAllowAdmin ? "bg-indigo-500" : "bg-slate-300"}`}>
                <span className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${localAllowAdmin ? "translate-x-3.5" : "translate-x-0.5"}`} />
              </span>
            </button>
          </div>
        </div>
        {(localAllowOwner || localAllowAdmin) && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
            {localAllowOwner && (
              <span className="inline-flex items-center gap-1 text-[9px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full uppercase tracking-widest">
                <CheckCircle2 size={9} /> Owner dapat akses via Portal Owner → Setup Gaji
              </span>
            )}
            {localAllowAdmin && (
              <span className="inline-flex items-center gap-1 text-[9px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full uppercase tracking-widest">
                <CheckCircle2 size={9} /> Admin dapat akses via Portal Admin → Konfigurasi Gaji
              </span>
            )}
          </div>
        )}
      </GlassCard>

      {/* ── Summary + accordion list ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500 font-medium">
            <span className="font-black text-slate-800">{configuredCount}</span> dari{" "}
            <span className="font-black text-slate-800">{filteredUsers.length}</span> pegawai sudah dikonfigurasi
          </p>
          <span className="text-[9px] font-black uppercase tracking-widest text-sky-600 bg-sky-50 border border-sky-100 rounded-lg px-2 py-1 flex items-center gap-1">
            <Banknote size={10} /> Konfigurasi Gaji Pokok
          </span>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Users size={32} className="mx-auto mb-3 opacity-40" />
            <p className="font-bold text-sm">Tidak ada pegawai operasional</p>
            <p className="text-xs mt-1">Belum ada crew yang bergabung di cabang ini.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredUsers.map((user) => (
              <BbaPayrollCard
                key={user.app_users.id}
                user={user}
                allConfigs={localConfigs}
                allUsers={filteredUsers}
                branchId={branchId}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
