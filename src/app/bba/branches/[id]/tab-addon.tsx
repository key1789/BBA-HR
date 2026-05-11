"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useTransition, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { GlassCard } from "@/components/shared/glass-card";
import { Loader2, Target, Star, ClipboardCheck, Clock, Settings2, CheckCircle2, AlertCircle, X, Save, Users, CalendarDays, Banknote, Plus, Search, Info, Activity, Package, Gift, Trash2, ChevronRight } from "lucide-react";
import { saveAddonAction, saveAddonSettingsAction, deleteProductFokusAction, saveProductFokusAction, copyRosterAction, saveRosterAction } from "./actions";
import { toast } from "sonner";

/** Supabase/pg mengembalikan date sebagai "YYYY-MM-DD" atau ISO; bandingkan aman untuk roster. */
function scheduleDateKey(d: string | null | undefined): string {
  if (d == null || d === "") return "";
  const s = String(d);
  const head = s.includes("T") ? (s.split("T")[0] ?? "") : s;
  return head.length >= 10 ? head.slice(0, 10) : head;
}
import { motion, AnimatePresence } from "framer-motion";
import { CurrencyInput } from "@/components/shared/currency-input";

function RosterCell({
  schedule,
  shifts,
  branchId,
  userId,
  dateStr,
  day,
  userName,
  onApply,
  shiftColorById,
}: any) {
  const [isPending, startTransition] = useTransition();
  const [val, setVal] = useState(schedule?.is_off ? 'OFF' : schedule?.shift_id || '');

  useEffect(() => {
    setVal(schedule?.is_off ? 'OFF' : schedule?.shift_id || '');
  }, [schedule]);

  const applyValue = (v: string, silent: boolean) => {
    setVal(v);
    startTransition(async () => {
      await onApply({
        branchId,
        userId,
        dateStr,
        shiftId: v,
        day,
        userName,
        silent,
      });
    });
  };

  const hasShiftOption = !!(val && val !== "OFF" && shifts.some((s: any) => s.id === val));
  const shiftColor =
    val && val !== "OFF"
      ? hasShiftOption
        ? (shiftColorById?.[val] ?? "bg-sky-50 text-sky-700 hover:bg-sky-100")
        : "bg-amber-50 text-amber-700 hover:bg-amber-100"
      : "";

  return (
    <td className={`p-0 border-r border-slate-100 last:border-0 relative h-full min-w-[75px] transition-all duration-500 ${isPending ? 'bg-slate-50' : ''}`}>
      <select
        value={val}
        disabled={isPending}
        onChange={(e) => {
          const v = e.target.value;
          applyValue(v, false);
        }}
        className={`w-full h-12 p-0 bg-transparent text-[10px] font-black uppercase text-center cursor-pointer outline-none transition-all duration-300 appearance-none flex items-center justify-center ${
          val === '' ? 'text-slate-300 hover:bg-slate-50/50' : 
          val === 'OFF' ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' : 
          shiftColor
        }`}
      >
        <option value="">--</option>
        <option value="OFF" className="text-rose-600 font-bold bg-white">OFF</option>
        {val && val !== "OFF" && !hasShiftOption ? (
          <option value={val} className="bg-white text-amber-700">
            SHIFT LAMA (tidak ditemukan)
          </option>
        ) : null}
        {shifts.map((s: any) => (
          <option key={s.id} value={s.id} className="bg-white text-slate-800">{s.shift_name}</option>
        ))}
      </select>
      {isPending && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-white/40 backdrop-blur-[1px] animate-in fade-in duration-300">
           <div className="w-1.5 h-1.5 rounded-full bg-sky-600 animate-bounce"></div>
        </div>
      )}
      {val !== '' && !isPending && (
         <div className={`absolute bottom-1 right-1 w-1 h-1 rounded-full ${val === 'OFF' ? 'bg-rose-400' : 'bg-sky-400'} animate-in zoom-in duration-500`}></div>
      )}
    </td>
  )
}

export function TabAddon({ 
  branchId, addons, users, shifts, products, productFokus, roster, currentMonth, currentYear 
}: { 
  branchId: string, addons: any[], users: any[], shifts: any[], products: any[], productFokus: any[], roster: any[], currentMonth: number, currentYear: number 
}) {
  const [isPending, startTransition] = useTransition();
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [pendingRosterSaves, setPendingRosterSaves] = useState(0);
  const [configModal, setConfigModal] = useState<string | null>(null);
  // Cache roster lokal supaya setelah close/open modal tidak "kosong" tanpa refresh page
  const [localRosterByUserDate, setLocalRosterByUserDate] = useState<Record<string, any>>({});
  
  // Produk Fokus State
  const [searchProduct, setSearchProduct] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [localProductFokus, setLocalProductFokus] = useState<any[]>(productFokus ?? []);
  const [targetType, setTargetType] = useState('item');
  const [bonusType, setBonusType] = useState('flat');
  const [targetValue, setTargetValue] = useState(0);
  const [bonusValue, setBonusValue] = useState(0);
  const [bonusStep, setBonusStep] = useState(0);

  // Local state for toggles to show config buttons immediately
  const [activeAddons, setActiveAddons] = useState<Record<string, boolean>>(() => {
    const initialState: Record<string, boolean> = {};
    addons.forEach(a => {
      initialState[a.addon_key] = a.is_enabled;
    });
    return initialState;
  });
  const [savedAddons, setSavedAddons] = useState<Record<string, boolean>>(() => {
    const initialState: Record<string, boolean> = {};
    addons.forEach((a) => {
      initialState[a.addon_key] = a.is_enabled;
    });
    return initialState;
  });
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutosaveErrorAtRef = useRef<number>(0);

  // Re-init toggle snapshots when switching branch.
  useEffect(() => {
    const next: Record<string, boolean> = {};
    addons.forEach((a) => {
      next[a.addon_key] = a.is_enabled;
    });
    setActiveAddons(next);
    setSavedAddons(next);
  }, [branchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const addonStaffUsers = useMemo(
    () =>
      users.filter(
        (u: any) => (u.role === "crew" || u.role === "admin_apotek") && u.app_users?.id
      ),
    [users]
  );

  const getAddon = (key: string) => addons.find(a => a.addon_key === key);
  const isEnabled = (key: string) => activeAddons[key] ?? false;
  const getSettings = (key: string) => getAddon(key)?.settings ?? {};

  const isDirty = Object.keys(activeAddons).some((k) => (activeAddons[k] ?? false) !== (savedAddons[k] ?? false));

  /** Jangan pakai Object.keys(settings) saja ({}) bisa menyesatkan; “minimal siap pakai” per fitur berbeda. */
  function isConfiguredForAddon(key: string): boolean {
    const settings = getSettings(key);
    switch (key) {
      case "produk_fokus":
        return productFokus.length > 0;
      case "review_pelanggan": {
        const pics = settings.pic_user_ids;
        return Array.isArray(pics) && pics.length > 0;
      }
      case "review_internal":
        return typeof settings.frequency_per_month === "number";
      case "absensi_shift":
        return shifts.length > 0;
      default:
        return false;
    }
  }

  const handleToggle = (key: string) => {
    setActiveAddons((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const applyRosterChange = useCallback(
    async ({
      branchId: bId,
      userId,
      dateStr,
      shiftId,
      day,
      userName,
      silent,
    }: {
      branchId: string;
      userId: string;
      dateStr: string;
      shiftId: string;
      day: number;
      userName: string;
      silent: boolean;
    }) => {
      const formData = new FormData();
      formData.append("tenantId", bId);
      formData.append("userId", userId);
      formData.append("date", dateStr);
      formData.append("shiftId", shiftId);

      setPendingRosterSaves((c) => c + 1);
      try {
        const res = await saveRosterAction(formData);
        if (res?.error) {
          toast.error(res.error);
        } else if (!silent) {
          toast.success(`Tgl ${day}: ${userName} OK`, { duration: 800 });
        }
        if (!res?.error) {
          setLocalRosterByUserDate((prev) => ({
            ...prev,
            [`${userId}|${dateStr}`]: {
              user_id: userId,
              schedule_date: dateStr,
              shift_id: shiftId === "" || shiftId === "OFF" ? null : shiftId,
              is_off: shiftId === "OFF",
            },
          }));
        }
      } finally {
        setPendingRosterSaves((c) => Math.max(0, c - 1));
      }
    },
    []
  );

  const doSaveRules = (snapshot: Record<string, boolean>) => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    setIsAutoSaving(false);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("tenantId", branchId);
      for (const k of ["produk_fokus", "absensi_shift", "review_pelanggan", "review_internal", "payroll"]) {
        if (snapshot[k]) formData.append(k, "on");
      }
      const result = await saveAddonAction(null, formData);
      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        setSavedAddons(snapshot);
        toast.success(result.message);
      }
    });
  };

  const rosterBusy = pendingRosterSaves > 0;
  const handleCloseModal = () => {
    if (configModal === "absensi_shift" && rosterBusy) {
      toast.info("Tunggu sebentar, roster masih sedang disimpan...");
      return;
    }
    setConfigModal(null);
  };

  const handleSaveSettings = async (key: string, settings: any) => {
    const formData = new FormData();
    formData.append("tenantId", branchId);
    formData.append("addonKey", key);
    formData.append("settings", JSON.stringify(settings));
    
    const res = await saveAddonSettingsAction(null, formData);
    if (res.success) {
      toast.success(res.message);
      // Optional: uncomment below to auto close after selecting PIC/Freq, but usually better to let user close manually if multi-select
      // if (key !== 'review_pelanggan') setConfigModal(null);
    } else {
      toast.error(res.error);
    }
  };

  const handleSaveAddon = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    doSaveRules(activeAddons);
  };

  // Auto-save toggle (debounced) agar tidak membingungkan vs tombol simpan besar.
  useEffect(() => {
    if (!isDirty) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      setIsAutoSaving(true);
      const snapshot = { ...activeAddons };
      const formData = new FormData();
      formData.append("tenantId", branchId);
      for (const k of ["produk_fokus", "absensi_shift", "review_pelanggan", "review_internal", "payroll"]) {
        if (snapshot[k]) formData.append(k, "on");
      }
      const result = await saveAddonAction(null, formData);
      setIsAutoSaving(false);
      if (result?.error) {
        const nowMs = Date.now();
        // Hindari spam toast kalau koneksi jelek — max 1 toast/5 detik.
        if (nowMs - lastAutosaveErrorAtRef.current > 5000) {
          lastAutosaveErrorAtRef.current = nowMs;
          toast.error(result.error);
        }
        return;
      }
      if (result?.success) {
        setSavedAddons(snapshot);
      }
    }, 700);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [activeAddons, branchId, isDirty]);

  const shiftColorById = useMemo(() => {
    const palette = [
      "bg-sky-50 text-sky-700 hover:bg-sky-100",
      "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
      "bg-amber-50 text-amber-700 hover:bg-amber-100",
      "bg-violet-50 text-violet-700 hover:bg-violet-100",
      "bg-cyan-50 text-cyan-700 hover:bg-cyan-100",
    ];
    const map: Record<string, string> = {};
    shifts.forEach((s: any) => {
      const raw = String(s.id ?? "");
      let hash = 0;
      for (let i = 0; i < raw.length; i++) hash = (hash * 31 + raw.charCodeAt(i)) | 0;
      const idx = Math.abs(hash) % palette.length;
      map[s.id] = palette[idx] ?? palette[0];
    });
    return map;
  }, [shifts]);

  // Hydrate cache dari data server
  useEffect(() => {
    const next: Record<string, any> = {};
    for (const r of roster ?? []) {
      const d = scheduleDateKey(r.schedule_date);
      if (!r.user_id || !d) continue;
      next[`${r.user_id}|${d}`] = r;
    }
    setLocalRosterByUserDate(next);
  }, [branchId, roster]);

  useEffect(() => {
    setLocalProductFokus(productFokus ?? []);
  }, [branchId, productFokus]);

  const filteredProducts = products.filter(p => 
    p.is_active !== false &&
    p.product_name.toLowerCase().includes(searchProduct.toLowerCase()) &&
    !localProductFokus.some(pf => pf.product_id === p.id)
  );

  const ADDON_CARDS = [
    {
      key: "produk_fokus",
      title: "Produk Fokus",
      desc: "Insentif otomatis untuk penjualan produk tertentu (item/nominal).",
      icon: Target,
      color: "emerald",
      isAccountability: true,
    },
    {
      key: "absensi_shift",
      title: "Absensi & Roster",
      desc: "Selfie absensi, pengajuan izin, dan penjadwalan shift (Roster).",
      icon: Clock,
      color: "cyan",
      isAccountability: false,
    },
    {
      key: "review_pelanggan",
      title: "Review Pelanggan",
      desc: "Input ulasan pelanggan oleh PIC yang ditunjuk untuk penilaian bonus.",
      icon: Star,
      color: "amber",
      isAccountability: false,
    },
    {
      key: "review_internal",
      title: "Review Internal",
      desc: "Penilaian antar karyawan secara berkala (peer review).",
      icon: ClipboardCheck,
      color: "rose",
      isAccountability: false,
    },
    {
      key: "payroll",
      title: "Payroll & Gaji",
      desc: "Pengelolaan gaji pokok dan generate slip gaji otomatis.",
      icon: Banknote,
      color: "sky",
      isAccountability: false,
    },
  ];

  const addonIconActive: Record<string, string> = {
    emerald: "bg-emerald-600 text-white scale-110 rotate-3 shadow-sm",
    cyan: "bg-cyan-600 text-white scale-110 rotate-3 shadow-sm",
    amber: "bg-amber-500 text-white scale-110 rotate-3 shadow-sm",
    rose: "bg-rose-600 text-white scale-110 rotate-3 shadow-sm",
    sky: "bg-sky-600 text-white scale-110 rotate-3 shadow-sm",
  };

  return (
    <div className="space-y-6 pb-20">
      <form onSubmit={handleSaveAddon} className="space-y-8">
        <input type="hidden" name="tenantId" value={branchId} />
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-800">Add-on & Konfigurasi</h2>
            <p className="text-sm text-slate-500 mt-1">Aktifkan fitur tambahan dan atur sistem kerjanya sesuai kebutuhan cabang.</p>
            <div className="mt-2 flex items-center gap-2">
              {isAutoSaving ? (
                <span className="text-[10px] font-black uppercase tracking-widest text-sky-600 bg-sky-50 border border-sky-100 px-2 py-1 rounded-lg flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> Menyimpan...
                </span>
              ) : isDirty ? (
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1 rounded-lg flex items-center gap-1.5">
                  <AlertCircle size={12} /> Ada perubahan belum tersimpan
                </span>
              ) : (
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg flex items-center gap-1.5">
                  <CheckCircle2 size={12} /> Semua perubahan tersimpan
                </span>
              )}
            </div>
          </div>
          <button 
            type="submit" 
            disabled={isPending || !isDirty}
            className="w-full sm:w-auto px-6 py-3 rounded-2xl font-black text-sm text-white bg-slate-900 hover:bg-black shadow-xl transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-70 flex items-center justify-center gap-2 border border-slate-700"
          >
            {isPending ? <Loader2 size={18} className="animate-spin text-sky-400" /> : <Save size={18} className="text-sky-400" />}
            Simpan Perubahan Aturan
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ADDON_CARDS.map((card) => {
            const active = isEnabled(card.key);
            const Icon = card.icon;
            const hasConfig = card.key !== 'payroll';
            const iconActiveClass =
              addonIconActive[card.color] ?? addonIconActive.sky;

            return (
              <GlassCard 
                key={card.key}
                variant="light" 
                className={`p-0 overflow-hidden transition-all duration-500 border-slate-200/60 hover:shadow-2xl hover:shadow-sky-500/10 flex flex-col bg-white ${!active && 'opacity-60 grayscale-[0.5]'}`}
              >
                <div className="p-6 flex-1">
                  <div className="flex justify-between items-start mb-6">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 ${active ? iconActiveClass : "bg-slate-100 text-slate-400"}`}
                    >
                      <Icon size={24} />
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer group">
                      <input 
                        type="checkbox" 
                        name={card.key} 
                        checked={active}
                        onChange={() => handleToggle(card.key)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                      <span className="sr-only">Toggle {card.title}</span>
                    </label>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm">{card.title}</h3>
                      {card.isAccountability && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[8px] font-black uppercase">
                          <CheckCircle2 size={8} /> Auto
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] font-medium text-slate-500 leading-relaxed min-h-[40px]">{card.desc}</p>
                  </div>
                </div>

                {active && hasConfig && (
                  <div
                    className={`px-5 py-4 border-t flex items-center justify-between transition-colors ${
                      isConfiguredForAddon(card.key)
                        ? "bg-slate-50/50 border-slate-100"
                        : "bg-amber-50/30 border-amber-100/50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setConfigModal(card.key)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        isConfiguredForAddon(card.key)
                          ? "bg-white text-sky-600 border border-slate-200 shadow-sm hover:border-sky-300"
                          : "bg-amber-500 text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600"
                      }`}
                    >
                      <Settings2 size={12} />
                      {isConfiguredForAddon(card.key) ? "Konfigurasi" : "Set Aturan"}
                    </button>

                    {isConfiguredForAddon(card.key) ? (
                      <div className="flex items-center gap-1.5 py-1 px-2 bg-emerald-50 text-emerald-600 rounded-lg">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-[9px] font-black uppercase tracking-tight">Aktif</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 py-1 px-2 bg-amber-50 text-amber-600 rounded-lg">
                        <AlertCircle size={10} />
                        <span className="text-[9px] font-black uppercase tracking-tight">Belum Set</span>
                      </div>
                    )}
                  </div>
                )}

                {!active && (
                   <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/30 flex items-center justify-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fitur Dinonaktifkan</span>
                   </div>
                )}
              </GlassCard>
            );
          })}
        </div>


      </form>

      {/* CONFIGURATION MODALS */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {configModal && (
            <div className="fixed inset-0 z-[100] flex items-start justify-center p-3 sm:p-4 overflow-y-auto">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleCloseModal}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" 
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 30 }}
                transition={{ type: "spring", damping: 30, stiffness: 400 }}
                className={`relative my-2 sm:my-6 bg-white shadow-[0_32px_64px_-15px_rgba(0,0,0,0.3)] rounded-[32px] flex flex-col overflow-hidden border border-slate-100 max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] ${configModal === 'absensi_shift' ? 'w-full max-w-[95vw]' : 'w-full max-w-2xl'}`}
              >
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-white relative z-10">
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-2xl shadow-slate-900/20 rotate-3">
                      <Settings2 size={28} />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-800 uppercase tracking-tight text-lg">Konfigurasi Fitur</h3>
                      <div className="flex items-center gap-2 mt-1">
                         <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></span>
                         <p className="text-[10px] font-black text-sky-600 uppercase tracking-widest">{configModal.replace('_', ' ')}</p>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleCloseModal}
                    className="w-12 h-12 flex items-center justify-center bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-2xl transition-all duration-500 group"
                    disabled={configModal === 'absensi_shift' && rosterBusy}
                  >
                    <X size={24} className="group-hover:rotate-90 transition-transform duration-500" />
                  </button>
                </div>

              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                {configModal === 'review_pelanggan' && (
                  <div className="space-y-8">
                    <div className="p-6 bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-100/50 rounded-[24px] flex gap-5 items-start">
                      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-sky-600 shadow-sm shrink-0">
                         <Info size={20} />
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                        Fitur ini memungkinkan apotek untuk merekam kepuasan pelanggan secara sistematis. Silakan <span className="text-sky-600 font-black text-[10px] uppercase tracking-widest">Pilih Personil</span> yang bertugas mengelola input data ulasan.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Users size={14} /> Daftar Personil (PIC)
                      </h4>
                      <div className="grid grid-cols-1 gap-3">
                        {addonStaffUsers.length === 0 ? (
                          <p className="text-xs text-slate-500 font-medium px-2">
                            Belum ada crew atau admin cabang untuk dijadikan PIC. Tambahkan pegawai di tab Manajemen Pegawai terlebih dulu.
                          </p>
                        ) : null}
                        {addonStaffUsers.map(u => {
                          const currentPics = getSettings('review_pelanggan').pic_user_ids || [];
                          const uid = u.app_users?.id as string;
                          const isSelected = currentPics.includes(uid);
                          const initials = u.app_users.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
                          
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => {
                                const newPics = isSelected
                                  ? currentPics.filter((id: string) => id !== uid)
                                  : [...currentPics, uid];
                                handleSaveSettings('review_pelanggan', { pic_user_ids: newPics });
                              }}
                              className={`group p-4 rounded-2xl border-2 text-left transition-all duration-500 flex items-center justify-between ${isSelected ? 'border-sky-600 bg-sky-50/50 shadow-xl shadow-sky-500/5' : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50'}`}
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs transition-all duration-500 ${isSelected ? 'bg-sky-600 text-white rotate-6' : 'bg-slate-100 text-slate-400 group-hover:bg-white'}`}>
                                  {initials}
                                </div>
                                <div>
                                  <p className="font-black text-slate-800 text-sm uppercase tracking-tight">{u.app_users.full_name}</p>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{u.role}</p>
                                </div>
                              </div>
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-500 ${isSelected ? 'bg-sky-600 text-white scale-110' : 'bg-slate-200 text-white'}`}>
                                <CheckCircle2 size={14} />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {configModal === 'review_internal' && (
                  <div className="space-y-8">
                    <div className="p-6 bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-100/50 rounded-[24px] flex gap-5 items-start">
                      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-rose-600 shadow-sm shrink-0">
                         <CalendarDays size={20} />
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                        Evaluasi antar rekan kerja membantu menjaga kualitas layanan. Tentukan <span className="text-rose-600 font-black text-[10px] uppercase tracking-widest">Frekuensi Penilaian</span> yang harus dilakukan personil setiap bulannya.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Activity size={14} /> Frekuensi Penilaian
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[1, 2, 4].map(freq => {
                          const isSelected = getSettings('review_internal').frequency_per_month === freq;
                          return (
                            <button
                              key={freq}
                              type="button"
                              onClick={() => handleSaveSettings('review_internal', { frequency_per_month: freq })}
                              className={`group relative p-6 rounded-3xl border-2 transition-all duration-500 text-center overflow-hidden ${isSelected ? 'border-rose-600 bg-white shadow-xl shadow-rose-500/10' : 'border-slate-100 bg-slate-50/50 hover:bg-white hover:border-slate-200'}`}
                            >
                              <div className={`text-3xl font-black mb-1 transition-all duration-500 ${isSelected ? 'text-rose-600 scale-110' : 'text-slate-300'}`}>
                                {freq}x
                              </div>
                              <p className={`text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-rose-500' : 'text-slate-400'}`}>Per Bulan</p>
                              {isSelected && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-600 animate-ping"></div>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {configModal === 'produk_fokus' && (
                  <div className="space-y-10 pb-10">
                    <div className="p-6 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100/50 rounded-[24px] flex gap-5 items-start">
                      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-emerald-600 shadow-sm shrink-0">
                         <Target size={20} />
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                        Optimalkan penjualan dengan menetapkan <span className="text-emerald-600 font-black text-[10px] uppercase tracking-widest">Produk Fokus</span>. Item yang dipilih akan mendapatkan insentif khusus bagi personil yang berhasil menjualnya.
                      </p>
                    </div>

                    {/* FORM TAMBAH PRODUK FOKUS */}
                    <div className="space-y-6">
                      <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Plus size={14} /> Tambah Produk Baru
                      </h4>

                      {!selectedProduct ? (
                        <div className="space-y-4">
                          <div className="relative group">
                            <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                            <input 
                              placeholder="Cari nama produk apotek..."
                              value={searchProduct}
                              onChange={(e) => setSearchProduct(e.target.value)}
                              className="w-full pl-14 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-3xl focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all font-black text-slate-800 outline-none text-sm"
                            />
                          </div>
                          <div className="max-h-60 overflow-y-auto border border-slate-100 rounded-[28px] bg-slate-50/50 p-2 custom-scrollbar">
                            {filteredProducts.map(p => (
                              <button
                                key={p.id}
                                onClick={() => setSelectedProduct(p)}
                                className="w-full p-4 text-left hover:bg-white hover:shadow-md hover:text-emerald-700 text-xs font-black uppercase tracking-tight text-slate-600 transition-all rounded-2xl mb-1 last:mb-0 flex items-center justify-between group"
                              >
                                {p.product_name}
                                <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                              </button>
                            ))}
                            {searchProduct && filteredProducts.length === 0 && (
                              <div className="p-8 text-center">
                                 <p className="text-xs text-slate-400 font-bold uppercase tracking-widest italic">Produk tidak ditemukan</p>
                              </div>
                            )}
                            {!searchProduct && filteredProducts.length === 0 && (
                              <div className="p-8 text-center">
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                                  Tidak ada produk tersedia untuk ditambahkan.
                                </p>
                                <p className="text-[10px] text-slate-400 mt-2">
                                  Kemungkinan semua produk aktif sudah menjadi produk fokus pada periode ini.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <form action={async (formData) => {
                          const res = await saveProductFokusAction(null, formData);
                          if(res.success) {
                            toast.success(res.message);
                            const nextItem = {
                              id: `${selectedProduct.id}-${currentMonth}-${currentYear}`,
                              tenant_apotek_id: branchId,
                              product_id: selectedProduct.id,
                              period_month: currentMonth,
                              period_year: currentYear,
                              target_type: targetType,
                              target_value: targetValue,
                              bonus_type: bonusType,
                              bonus_value: bonusValue,
                              bonus_step: bonusType === "kelipatan" ? bonusStep : null,
                              master_products: { product_name: selectedProduct.product_name },
                            };
                            setLocalProductFokus((prev) => {
                              const others = prev.filter((x) => x.product_id !== selectedProduct.id);
                              return [nextItem, ...others];
                            });
                            setSelectedProduct(null);
                            setSearchProduct("");
                          } else toast.error(res.error);
                        }} className="space-y-6 p-8 bg-emerald-50/50 rounded-[32px] border border-emerald-100 relative animate-in zoom-in-95 duration-500">
                          <div className="flex justify-between items-start mb-4">
                            <div className="space-y-1">
                               <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Produk Terpilih</p>
                               <h5 className="text-lg font-black text-slate-800 uppercase tracking-tight">{selectedProduct.product_name}</h5>
                            </div>
                            <button type="button" onClick={() => setSelectedProduct(null)} className="px-3 py-1 bg-white text-[9px] font-black text-rose-500 uppercase rounded-lg border border-rose-100 hover:bg-rose-50 transition-all">Ganti Produk</button>
                          </div>
                          
                          <input type="hidden" name="tenantId" value={branchId} />
                          <input type="hidden" name="productId" value={selectedProduct.id} />
                          <input type="hidden" name="periodMonth" value={currentMonth} />
                          <input type="hidden" name="periodYear" value={currentYear} />

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Jenis Target</label>
                              <select 
                                name="targetType" 
                                value={targetType}
                                onChange={(e) => setTargetType(e.target.value)}
                                className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                              >
                                <option value="item">Total Item / Unit</option>
                                <option value="nominal">Nominal Rupiah (Rp)</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nilai Target</label>
                              {targetType === 'nominal' ? (
                                <CurrencyInput 
                                  name="targetValue" 
                                  value={targetValue}
                                  onChange={setTargetValue}
                                  required
                                  className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all" 
                                />
                              ) : (
                                <input 
                                  name="targetValue" 
                                  type="number"
                                  required
                                  value={targetValue || ''}
                                  onChange={(e) => setTargetValue(parseInt(e.target.value) || 0)}
                                  placeholder="0"
                                  className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all" 
                                />
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Mode Bonus</label>
                              <select 
                                name="bonusType" 
                                value={bonusType}
                                onChange={(e) => setBonusType(e.target.value)}
                                className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                              >
                                <option value="flat">Bonus Flat (Sekali)</option>
                                <option value="kelipatan">Bonus Kelipatan</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nominal Bonus (Rp)</label>
                              <CurrencyInput 
                                name="bonusValue" 
                                value={bonusValue}
                                onChange={setBonusValue}
                                required
                                className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all" 
                              />
                            </div>
                          </div>

                          {bonusType === 'kelipatan' && (
                            <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Kelipatan Per Berapa (Unit/Rp)</label>
                              {targetType === 'nominal' ? (
                                <CurrencyInput 
                                  name="bonusStep" 
                                  value={bonusStep}
                                  onChange={setBonusStep}
                                  required
                                  className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all" 
                                />
                              ) : (
                                <input 
                                  name="bonusStep" 
                                  type="number"
                                  required
                                  value={bonusStep || ''}
                                  onChange={(e) => setBonusStep(parseInt(e.target.value) || 0)}
                                  placeholder="1"
                                  className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all" 
                                />
                              )}
                            </div>
                          )}

                          <button type="submit" className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition-all active:scale-95 flex items-center justify-center gap-2">
                             <Save size={18} /> Simpan Konfigurasi Produk
                          </button>
                        </form>
                      )}
                    </div>

                    {/* LIST PRODUK FOKUS AKTIF */}
                    <div className="pt-10 border-t border-slate-100 space-y-5">
                      <div className="flex items-center justify-between">
                         <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                           <CheckCircle2 size={14} /> Produk Fokus Aktif
                         </h4>
                         <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-black uppercase tracking-widest">{localProductFokus.length} Item</span>
                      </div>
                      
                      {localProductFokus.length === 0 ? (
                        <div className="p-10 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[32px] text-center space-y-3">
                           <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-slate-300 mx-auto shadow-sm">
                              <Search size={24} />
                           </div>
                           <p className="text-xs text-slate-400 font-bold uppercase tracking-widest italic">Belum ada produk fokus yang diatur</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-3">
                          {localProductFokus.map(pf => (
                            <div key={pf.id} className="group p-5 bg-white border border-slate-100 rounded-3xl flex justify-between items-center shadow-sm hover:shadow-xl hover:shadow-emerald-500/5 hover:border-emerald-200 transition-all duration-500">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black text-xs shadow-inner group-hover:scale-110 transition-transform duration-500">
                                   <Package size={20} />
                                </div>
                                <div>
                                  <p className="font-black text-slate-800 text-sm uppercase tracking-tight leading-tight">{pf.master_products?.product_name}</p>
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                       <Target size={10} className="text-emerald-500" /> {pf.target_type === 'item' ? `${Number(pf.target_value || 0).toLocaleString()} Item` : `Rp ${Number(pf.target_value || 0).toLocaleString()}`}
                                    </div>
                                    <div className="w-1 h-1 rounded-full bg-slate-200"></div>
                                    <div className="flex items-center gap-1 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                                       <Gift size={10} /> {pf.bonus_type === 'flat' ? `Rp ${Number(pf.bonus_value || 0).toLocaleString()} (Flat)` : `Rp ${Number(pf.bonus_value || 0).toLocaleString()} / ${Number(pf.bonus_step || 0).toLocaleString()} unit`}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <form action={async (formData) => {
                                if(confirm("Hapus produk fokus ini?")) {
                                  const res = await deleteProductFokusAction(formData);
                                  if(res.success) {
                                    setLocalProductFokus((prev) => prev.filter((x) => x.id !== pf.id));
                                    toast.success(res.message);
                                  } else toast.error(res.error);
                                }
                              }}>
                                <input type="hidden" name="configId" value={pf.id} />
                                <input type="hidden" name="tenantId" value={branchId} />
                                <button className="w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-300 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all duration-500">
                                  <Trash2 size={16} />
                                </button>
                              </form>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {configModal === 'absensi_shift' && (
                   <div className="space-y-8 pb-10">
                     <div className="p-6 bg-gradient-to-br from-cyan-50 to-sky-50 border border-cyan-100/50 rounded-[24px] flex gap-5 items-start">
                        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-cyan-600 shadow-sm shrink-0">
                           <Clock size={20} />
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                           Atur jadwal shift kerja karyawan untuk satu bulan penuh. Pastikan <span className="text-cyan-600 font-black text-[10px] uppercase tracking-widest">Roster Terisi</span> dengan benar agar operasional apotek berjalan lancar.
                        </p>
                     </div>

                     <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <CalendarDays size={14} /> Penjadwalan Roster
                        </h4>
                        <form
                          action={async (formData) => {
                            formData.append("tenantId", branchId);
                            formData.append("month", currentMonth.toString());
                            formData.append("year", currentYear.toString());
                            const res = await copyRosterAction(formData);
                            if(res.success) toast.success(res.message);
                            else toast.error(res.error);
                          }}
                        >
                          <button type="submit" className="group flex items-center gap-2 px-4 py-2 bg-white hover:bg-sky-50 text-sky-600 border border-sky-100 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all duration-300 shadow-sm hover:shadow-sky-100 w-full sm:w-auto">
                            <Save size={12} className="group-hover:rotate-12 transition-transform" /> Salin dari Bulan Lalu
                          </button>
                        </form>
                     </div>

                     <div className="border border-slate-100 rounded-[28px] overflow-hidden bg-white shadow-xl shadow-slate-200/50 overflow-x-auto custom-scrollbar relative border-separate border-spacing-0">
                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                          <thead>
                            <tr className="bg-slate-50/80 backdrop-blur-sm">
                              <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest sticky left-0 bg-slate-50/90 backdrop-blur-md z-20 w-56 border-b border-r border-slate-100 shadow-[2px_0_10px_-2px_rgba(0,0,0,0.05)]">Karyawan</th>
                              {Array.from({ length: new Date(currentYear, currentMonth, 0).getDate() }).map((_, i) => (
                                <th key={i} className={`p-3 text-center text-[10px] font-black uppercase min-w-[65px] border-b border-r border-slate-100 last:border-r-0 ${[0, 6].includes(new Date(currentYear, currentMonth - 1, i + 1).getDay()) ? 'bg-rose-50/50 text-rose-500' : 'text-slate-400'}`}>
                                  <div className="flex flex-col items-center">
                                     <span className="text-[8px] opacity-50 mb-0.5">{['Min','Sen','Sel','Rab','Kam','Jum','Sab'][new Date(currentYear, currentMonth - 1, i + 1).getDay()]}</span>
                                     <span>{i + 1}</span>
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {users.filter(u => u.role === 'crew' || u.role === 'admin_apotek').map(user => (
                              <tr key={user.id} className="group hover:bg-slate-50/50 transition-colors">
                                <td className="p-5 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-b border-r border-slate-100 transition-colors shadow-[2px_0_10px_-2px_rgba(0,0,0,0.05)]">
                                  <p className="font-black text-slate-800 text-xs truncate max-w-[200px] uppercase tracking-tight">{user.app_users.full_name}</p>
                                  <div className="flex items-center gap-1.5 mt-1">
                                     <div className={`w-1.5 h-1.5 rounded-full ${user.role === 'admin_apotek' ? 'bg-sky-500' : 'bg-emerald-500'}`}></div>
                                     <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{user.role.replace('_', ' ')}</p>
                                  </div>
                                </td>
                                {Array.from({ length: new Date(currentYear, currentMonth, 0).getDate() }).map((_, i) => {
                                  const day = i + 1;
                                  const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                  const schedule =
                                    localRosterByUserDate[`${user.app_users.id}|${dateStr}`] ??
                                    roster.find(
                                      (r) =>
                                        r.user_id === user.app_users.id &&
                                        scheduleDateKey(r.schedule_date) === dateStr
                                    );
                                  
                                  return (
                                    <RosterCell 
                                      key={i}
                                      schedule={schedule}
                                      shifts={shifts}
                                      branchId={branchId}
                                      userId={user.app_users.id}
                                      dateStr={dateStr}
                                      day={day}
                                      userName={user.app_users.full_name}
                                      onApply={applyRosterChange}
                                      shiftColorById={shiftColorById}
                                    />
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                     </div>
                   </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
