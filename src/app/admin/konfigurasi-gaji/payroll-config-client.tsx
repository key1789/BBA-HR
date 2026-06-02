"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown, Loader2, CheckCircle2, Save, User, Banknote, Plus,
  Trash2, AlertCircle, Copy, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/shared/info-tooltip";
import { CurrencyInput } from "@/components/shared/currency-input";
import { toast } from "sonner";

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export type CrewPayrollRow = {
  userId: string;
  name: string;
  baseSalary: number;
  positionAllowance: number;
  mealAllowance: number;
  transportAllowance: number;
  bpjsKesKaryawan: number;
  bpjsTkKaryawan: number;
  bpjsKesPerusahaan: number;
  bpjsTkPerusahaan: number;
  customAdjustments: { name: string; amount: number; type: "addition" | "deduction" }[];
};

type CustomAdj = { name: string; amount: number; type: "addition" | "deduction" };
type SaveAction = (prevState: unknown, formData: FormData) => Promise<{ success?: boolean; error?: string; message?: string }>;

interface Props {
  tenantId: string;
  crew: CrewPayrollRow[];
  saveAction: SaveAction;
  /** Label shown on the page title badge */
  portalLabel?: string;
}

type SavedBaseline = {
  baseSalary: number; positionAllowance: number; mealAllowance: number; transportAllowance: number;
  bpjsKesKaryawan: number; bpjsTkKaryawan: number; bpjsKesPerusahaan: number; bpjsTkPerusahaan: number;
  customAdj: CustomAdj[];
};

function CrewCard({
  row,
  allCrew,
  tenantId,
  saveAction,
}: {
  row: CrewPayrollRow;
  allCrew: CrewPayrollRow[];
  tenantId: string;
  saveAction: SaveAction;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isDirty, setIsDirty] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);

  const [baseSalary, setBaseSalary] = useState(row.baseSalary);
  const [positionAllowance, setPositionAllowance] = useState(row.positionAllowance);
  const [mealAllowance, setMealAllowance] = useState(row.mealAllowance);
  const [transportAllowance, setTransportAllowance] = useState(row.transportAllowance);
  const [bpjsKesKaryawan, setBpjsKesKaryawan] = useState(row.bpjsKesKaryawan);
  const [bpjsTkKaryawan, setBpjsTkKaryawan] = useState(row.bpjsTkKaryawan);
  const [bpjsKesPerusahaan, setBpjsKesPerusahaan] = useState(row.bpjsKesPerusahaan);
  const [bpjsTkPerusahaan, setBpjsTkPerusahaan] = useState(row.bpjsTkPerusahaan);
  const [customAdj, setCustomAdj] = useState<CustomAdj[]>(row.customAdjustments);

  // Track last-saved baseline so "Buang Perubahan" resets to post-save values
  const [baseline, setBaseline] = useState<SavedBaseline>({
    baseSalary: row.baseSalary, positionAllowance: row.positionAllowance,
    mealAllowance: row.mealAllowance, transportAllowance: row.transportAllowance,
    bpjsKesKaryawan: row.bpjsKesKaryawan, bpjsTkKaryawan: row.bpjsTkKaryawan,
    bpjsKesPerusahaan: row.bpjsKesPerusahaan, bpjsTkPerusahaan: row.bpjsTkPerusahaan,
    customAdj: row.customAdjustments,
  });

  const mark = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setIsDirty(true); };

  const bpjsEmployeeTotal = bpjsKesKaryawan + bpjsTkKaryawan;
  const bpjsEmployerTotal = bpjsKesPerusahaan + bpjsTkPerusahaan;
  const totalGross = baseSalary + positionAllowance + mealAllowance + transportAllowance
    + customAdj.filter((c) => c.type === "addition").reduce((s, c) => s + c.amount, 0);
  const totalDeduction = bpjsEmployeeTotal
    + customAdj.filter((c) => c.type === "deduction").reduce((s, c) => s + c.amount, 0);
  const netSalary = totalGross - totalDeduction;

  const addCustomAdj = (type: "addition" | "deduction") => {
    setCustomAdj((prev) => [...prev, { name: "", amount: 0, type }]);
    setIsDirty(true);
  };
  const removeCustomAdj = (idx: number) => {
    setCustomAdj((prev) => prev.filter((_, i) => i !== idx));
    setIsDirty(true);
  };
  const updateCustomAdj = (idx: number, patch: Partial<CustomAdj>) => {
    setCustomAdj((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
    setIsDirty(true);
  };

  const handleToggleOpen = () => {
    if (open && isDirty) { setShowUnsavedWarning(true); return; }
    setOpen(!open);
  };

  const resetToBaseline = () => {
    setBaseSalary(baseline.baseSalary);
    setPositionAllowance(baseline.positionAllowance);
    setMealAllowance(baseline.mealAllowance);
    setTransportAllowance(baseline.transportAllowance);
    setBpjsKesKaryawan(baseline.bpjsKesKaryawan);
    setBpjsTkKaryawan(baseline.bpjsTkKaryawan);
    setBpjsKesPerusahaan(baseline.bpjsKesPerusahaan);
    setBpjsTkPerusahaan(baseline.bpjsTkPerusahaan);
    setCustomAdj(baseline.customAdj);
    setIsDirty(false);
  };

  const handleDiscardAndClose = () => {
    resetToBaseline();
    setShowUnsavedWarning(false);
    setOpen(false);
  };

  const handleCopyFrom = (source: CrewPayrollRow) => {
    setBaseSalary(source.baseSalary);
    setPositionAllowance(source.positionAllowance);
    setMealAllowance(source.mealAllowance);
    setTransportAllowance(source.transportAllowance);
    setBpjsKesKaryawan(source.bpjsKesKaryawan);
    setBpjsTkKaryawan(source.bpjsTkKaryawan);
    setBpjsKesPerusahaan(source.bpjsKesPerusahaan);
    setBpjsTkPerusahaan(source.bpjsTkPerusahaan);
    setCustomAdj(source.customAdjustments);
    setIsDirty(true);
    setShowCopyModal(false);
    toast.success(`Disalin dari ${source.name}. Periksa lalu simpan.`);
  };

  function handleSave() {
    const bpjsItems = [
      { id: "__bpjs_kes_k__", name: "BPJS Kesehatan - Karyawan",    type: "bpjs_employee", amount: bpjsKesKaryawan },
      { id: "__bpjs_tk_k__",  name: "BPJS TK - Karyawan",           type: "bpjs_employee", amount: bpjsTkKaryawan },
      { id: "__bpjs_kes_p__", name: "BPJS Kesehatan - Perusahaan",  type: "bpjs_employer", amount: bpjsKesPerusahaan },
      { id: "__bpjs_tk_p__",  name: "BPJS TK - Perusahaan",         type: "bpjs_employer", amount: bpjsTkPerusahaan },
    ].filter((b) => b.amount > 0);

    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("userId", row.userId);
    fd.set("baseSalary", String(baseSalary));
    fd.set("positionAllowance", String(positionAllowance));
    fd.set("mealAllowance", String(mealAllowance));
    fd.set("transportAllowance", String(transportAllowance));
    fd.set("bpjsDeduction", String(bpjsEmployeeTotal));
    fd.set("customAdjustments", JSON.stringify([...bpjsItems, ...customAdj]));

    startTransition(async () => {
      const res = await saveAction(undefined, fd);
      if (res.error) {
        toast.error(res.error);
      } else if (res.success) {
        toast.success(res.message ?? "Konfigurasi gaji tersimpan.");
        setIsDirty(false);
        setBaseline({
          baseSalary, positionAllowance, mealAllowance, transportAllowance,
          bpjsKesKaryawan, bpjsTkKaryawan, bpjsKesPerusahaan, bpjsTkPerusahaan,
          customAdj,
        });
      }
    });
  }

  const isConfigured = row.baseSalary > 0;
  const otherCrew = allCrew.filter((c) => c.userId !== row.userId);

  return (
    <div className={cn(
      "bg-white border rounded-2xl overflow-hidden shadow-sm transition-colors",
      isDirty ? "border-amber-300" : isConfigured ? "border-slate-200" : "border-amber-200/80",
    )}>
      {/* ── Card header (accordion toggle) ── */}
      <button
        onClick={handleToggleOpen}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
            isConfigured ? "bg-indigo-50" : "bg-amber-50",
          )}>
            <User size={14} className={isConfigured ? "text-indigo-500" : "text-amber-500"} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-slate-800">{row.name}</p>
              {isDirty && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 uppercase tracking-widest">
                  <AlertCircle size={8} /> Belum disimpan
                </span>
              )}
            </div>
            {isConfigured ? (
              <p className="text-[10px] text-slate-400 font-medium">
                Gaji pokok {IDR.format(row.baseSalary)} · THP ~{IDR.format(
                  row.baseSalary + row.positionAllowance + row.mealAllowance + row.transportAllowance
                  - (row.bpjsKesKaryawan + row.bpjsTkKaryawan)
                )}
              </p>
            ) : (
              <p className="text-[10px] text-amber-500 font-bold uppercase tracking-widest">Belum dikonfigurasi</p>
            )}
          </div>
        </div>
        <ChevronDown
          size={14}
          className={cn("text-slate-400 transition-transform shrink-0 ml-2", open && "rotate-180")}
        />
      </button>

      {/* ── Edit form ── */}
      {open && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-5">

          {/* Top action bar */}
          <div className="flex items-center justify-between">
            {otherCrew.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowCopyModal(true)}
                className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-sky-600 uppercase tracking-widest transition-colors"
              >
                <Copy size={11} /> Salin dari karyawan lain
              </button>
            ) : <span />}
            <button
              onClick={handleSave}
              disabled={isPending || !isDirty}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-500 shadow-sm transition-colors disabled:opacity-50"
            >
              {isPending ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              {isPending ? "Menyimpan…" : isDirty ? "Simpan Perubahan" : "Tersimpan"}
            </button>
          </div>

          {/* ── Gaji & Tunjangan ── */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Gaji & Tunjangan</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-[9px] font-bold uppercase text-slate-400 flex items-center gap-1">
                  Gaji Pokok
                  <InfoTooltip content="Komponen gaji tetap yang diterima setiap bulan terlepas dari kehadiran." side="top" width="w-52" />
                </span>
                <CurrencyInput
                  value={baseSalary}
                  onChange={mark(setBaseSalary)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10 outline-none transition-all"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[9px] font-bold uppercase text-slate-400 flex items-center gap-1">
                  Tunjangan Jabatan
                  <InfoTooltip content="Tunjangan berdasarkan posisi/jabatan. Bersifat tetap setiap bulan." side="top" width="w-52" />
                </span>
                <CurrencyInput
                  value={positionAllowance}
                  onChange={mark(setPositionAllowance)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10 outline-none transition-all"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[9px] font-bold uppercase text-slate-400 flex items-center gap-1">
                  Uang Makan / Hari
                  <InfoTooltip content="Rate per hari kehadiran. Dikali jumlah hari masuk aktual saat rekap payroll." side="top" width="w-56" />
                </span>
                <CurrencyInput
                  value={mealAllowance}
                  onChange={mark(setMealAllowance)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10 outline-none transition-all"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[9px] font-bold uppercase text-slate-400 flex items-center gap-1">
                  Transport / Hari
                  <InfoTooltip content="Rate per hari kehadiran. Dikali jumlah hari masuk aktual saat rekap payroll." side="top" width="w-56" />
                </span>
                <CurrencyInput
                  value={transportAllowance}
                  onChange={mark(setTransportAllowance)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10 outline-none transition-all"
                />
              </label>
            </div>
          </div>

          {/* ── Penambahan Kustom ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-1">
                <Plus size={10} /> Penambahan Kustom
                <InfoTooltip content="Komponen tambahan tetap setiap bulan. Contoh: insentif jabatan, uang bensin khusus." side="top" width="w-64" />
              </p>
              <button
                type="button"
                onClick={() => addCustomAdj("addition")}
                className="p-1 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
              >
                <Plus size={12} />
              </button>
            </div>
            {customAdj.filter((c) => c.type === "addition").length === 0 ? (
              <p className="text-[10px] text-slate-400 italic px-1">Belum ada. Contoh: Uang Bensin Khusus, Insentif Jabatan.</p>
            ) : (
              <div className="space-y-2">
                {customAdj.map((adj, idx) => adj.type !== "addition" ? null : (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Nama penambahan..."
                      value={adj.name}
                      onChange={(e) => updateCustomAdj(idx, { name: e.target.value })}
                      className="flex-1 min-w-0 rounded-xl border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white focus:border-emerald-500 outline-none"
                    />
                    <CurrencyInput
                      value={adj.amount}
                      onChange={(val) => updateCustomAdj(idx, { amount: val })}
                      className="w-28 rounded-xl border border-emerald-200 px-2 py-1.5 text-xs font-black text-emerald-600 bg-emerald-50/30 outline-none focus:border-emerald-400"
                    />
                    <button type="button" onClick={() => removeCustomAdj(idx)} className="text-rose-300 hover:text-rose-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Pengurangan Kustom ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 flex items-center gap-1">
                <X size={10} /> Pengurangan Kustom
                <InfoTooltip content="Potongan tetap tiap bulan. Contoh: cicilan kasbon, denda absensi rutin." side="top" width="w-64" />
              </p>
              <button
                type="button"
                onClick={() => addCustomAdj("deduction")}
                className="p-1 bg-rose-50 text-rose-500 rounded-lg hover:bg-rose-100 transition-colors"
              >
                <Plus size={12} />
              </button>
            </div>
            {customAdj.filter((c) => c.type === "deduction").length === 0 ? (
              <p className="text-[10px] text-slate-400 italic px-1">Belum ada. Contoh: Kasbon, Denda Absensi.</p>
            ) : (
              <div className="space-y-2">
                {customAdj.map((adj, idx) => adj.type !== "deduction" ? null : (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Nama pengurangan..."
                      value={adj.name}
                      onChange={(e) => updateCustomAdj(idx, { name: e.target.value })}
                      className="flex-1 min-w-0 rounded-xl border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white focus:border-rose-400 outline-none"
                    />
                    <CurrencyInput
                      value={adj.amount}
                      onChange={(val) => updateCustomAdj(idx, { amount: val })}
                      className="w-28 rounded-xl border border-rose-200 px-2 py-1.5 text-xs font-black text-rose-600 bg-rose-50/30 outline-none focus:border-rose-400"
                    />
                    <button type="button" onClick={() => removeCustomAdj(idx)} className="text-rose-300 hover:text-rose-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── BPJS ── */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-rose-500">Potongan & Tanggungan BPJS</p>
            <div className="grid grid-cols-2 gap-3">

              {/* Dari Karyawan */}
              <div className="space-y-2 p-3 bg-rose-50/40 rounded-xl border border-rose-100">
                <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest">Dari Karyawan</p>
                <label className="block space-y-1">
                  <span className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1">
                    BPJS Kesehatan
                    <InfoTooltip content="Potongan iuran BPJS Kesehatan karyawan. Umumnya 1% dari gaji." side="top" width="w-52" />
                  </span>
                  <CurrencyInput
                    value={bpjsKesKaryawan}
                    onChange={mark(setBpjsKesKaryawan)}
                    className="w-full rounded-xl border border-rose-200 px-2.5 py-2 text-sm font-black text-rose-600 bg-white outline-none focus:ring-2 focus:ring-rose-500/10 transition-all"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1">
                    BPJS Ketenagakerjaan
                    <InfoTooltip content="Potongan JHT (2%) dan JP (1%) dari gaji karyawan." side="top" width="w-52" />
                  </span>
                  <CurrencyInput
                    value={bpjsTkKaryawan}
                    onChange={mark(setBpjsTkKaryawan)}
                    className="w-full rounded-xl border border-rose-200 px-2.5 py-2 text-sm font-black text-rose-600 bg-white outline-none focus:ring-2 focus:ring-rose-500/10 transition-all"
                  />
                </label>
                {bpjsEmployeeTotal > 0 && (
                  <div className="flex justify-between items-center text-[10px] font-black text-rose-600 bg-rose-50 rounded-lg px-2.5 py-1.5 border border-rose-100">
                    <span>Total Potongan</span>
                    <span>−{IDR.format(bpjsEmployeeTotal)}</span>
                  </div>
                )}
              </div>

              {/* Tanggungan Perusahaan */}
              <div className="space-y-2 p-3 bg-slate-50/60 rounded-xl border border-slate-100">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tanggungan Perusahaan</p>
                <label className="block space-y-1">
                  <span className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1">
                    BPJS Kesehatan
                    <InfoTooltip content="Tanggungan BPJS Kesehatan oleh perusahaan (4%). Tidak mengurangi THP karyawan." side="top" width="w-60" />
                  </span>
                  <CurrencyInput
                    value={bpjsKesPerusahaan}
                    onChange={mark(setBpjsKesPerusahaan)}
                    className="w-full rounded-xl border border-slate-200 px-2.5 py-2 text-sm font-black text-slate-700 bg-white outline-none focus:ring-2 focus:ring-slate-400/10 transition-all"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1">
                    BPJS Ketenagakerjaan
                    <InfoTooltip content="Tanggungan JHT (3.7%), JP (2%), JKK/JKM oleh perusahaan. Tidak mengurangi THP karyawan." side="top" width="w-64" />
                  </span>
                  <CurrencyInput
                    value={bpjsTkPerusahaan}
                    onChange={mark(setBpjsTkPerusahaan)}
                    className="w-full rounded-xl border border-slate-200 px-2.5 py-2 text-sm font-black text-slate-700 bg-white outline-none focus:ring-2 focus:ring-slate-400/10 transition-all"
                  />
                </label>
                {bpjsEmployerTotal > 0 && (
                  <div className="flex justify-between items-center text-[10px] font-black text-slate-500 bg-slate-100 rounded-lg px-2.5 py-1.5">
                    <span>Total Tanggungan</span>
                    <span>{IDR.format(bpjsEmployerTotal)}</span>
                  </div>
                )}
                <p className="text-[9px] text-slate-400 leading-snug">Dicatat sebagai beban perusahaan, tidak mengurangi THP.</p>
              </div>
            </div>
          </div>

          {/* ── Estimasi THP ── */}
          <div className="bg-indigo-600 rounded-2xl px-4 py-3 flex items-center justify-between shadow-lg shadow-indigo-600/20">
            <div className="flex items-center gap-2">
              <Banknote size={16} className="text-indigo-200 shrink-0" />
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-indigo-200">Estimasi THP</p>
                <p className="text-[9px] text-indigo-300 font-medium">*Makan & Transport dikali hari masuk</p>
              </div>
            </div>
            <span className={cn("text-lg font-black", netSalary < 0 ? "text-rose-300" : "text-white")}>
              {IDR.format(netSalary)}
            </span>
          </div>

          {/* ── Bottom actions ── */}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => isDirty ? setShowUnsavedWarning(true) : setOpen(false)}
              disabled={isPending}
              className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              Tutup
            </button>
            <button
              onClick={handleSave}
              disabled={isPending || !isDirty}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-500 shadow-sm transition-colors disabled:opacity-50"
            >
              {isPending ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              {isPending ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </div>
      )}

      {/* ── Unsaved warning modal ── */}
      {showUnsavedWarning && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setShowUnsavedWarning(false)}
          />
          <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0">
                  <AlertCircle size={20} className="text-amber-500" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm">Perubahan Belum Disimpan</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{row.name}</p>
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed bg-amber-50/60 border border-amber-100 rounded-xl p-3">
                Konfigurasi gaji yang sudah diubah belum disimpan. Jika dilanjutkan, perubahan akan hilang.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowUnsavedWarning(false)}
                  className="flex-1 px-3 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleDiscardAndClose}
                  className="flex-1 px-3 py-2.5 rounded-xl font-black text-sm text-white bg-amber-500 hover:bg-amber-600 transition-colors"
                >
                  Buang Perubahan
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Copy-from modal ── */}
      {showCopyModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setShowCopyModal(false)}
          />
          <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                  <Copy size={13} className="text-sky-600" /> Salin Konfigurasi Dari
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">ke: {row.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCopyModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-500 flex items-center justify-center transition-colors"
              >
                <X size={15} />
              </button>
            </div>
            <div className="p-3 space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
              {otherCrew.map((src) => {
                const hasData = src.baseSalary > 0;
                return (
                  <button
                    key={src.userId}
                    type="button"
                    onClick={() => handleCopyFrom(src)}
                    disabled={!hasData}
                    className="w-full text-left p-3 rounded-2xl border border-slate-100 hover:border-sky-200 hover:bg-sky-50/60 transition-all flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed group"
                  >
                    <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-400 group-hover:bg-sky-100 group-hover:text-sky-600 flex items-center justify-center shrink-0 transition-colors">
                      <User size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-800 text-xs truncate">{src.name}</p>
                      <p className="text-[10px] text-slate-400 font-bold">
                        {hasData ? IDR.format(src.baseSalary) + " / bulan" : "Belum dikonfigurasi"}
                      </p>
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

export function PayrollConfigClient({ tenantId, crew, saveAction, portalLabel }: Props) {
  const configuredCount = crew.filter((c) => c.baseSalary > 0).length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 font-medium">
          <span className="font-black text-slate-800">{configuredCount}</span> dari{" "}
          <span className="font-black text-slate-800">{crew.length}</span> karyawan sudah dikonfigurasi
        </p>
        {portalLabel && (
          <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1">
            {portalLabel}
          </span>
        )}
      </div>

      {crew.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <User size={32} className="mx-auto mb-3 opacity-40" />
          <p className="font-bold text-sm">Tidak ada karyawan aktif</p>
          <p className="text-xs mt-1">Belum ada crew yang bergabung di apotek ini.</p>
        </div>
      )}

      <div className="space-y-2">
        {crew.map((row) => (
          <CrewCard key={row.userId} row={row} allCrew={crew} tenantId={tenantId} saveAction={saveAction} />
        ))}
      </div>
    </div>
  );
}
