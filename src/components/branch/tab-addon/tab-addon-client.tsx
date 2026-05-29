"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useTransition, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { GlassCard } from "@/components/shared/glass-card";
import {
  Loader2,
  Target,
  Star,
  ClipboardCheck,
  Clock,
  Settings2,
  CheckCircle2,
  AlertCircle,
  X,
  Save,
  Banknote,
  ArrowRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { saveAddonAction } from "@/app/bba/branches/[id]/actions";
import { toast } from "sonner";
import { ProductFokusSection } from "./ProductFokusSection";
import { AppraisalAddonsSection } from "./AppraisalAddonsSection";

export function TabAddon({
  branchId,
  addons,
  products,
  productFokus,
  currentMonth,
  currentYear,
  onNavigateToTab,
}: {
  branchId: string;
  addons: any[];
  products: any[];
  productFokus: any[];
  currentMonth: number;
  currentYear: number;
  onNavigateToTab?: (tabId: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [configModal, setConfigModal] = useState<string | null>(null);
  const [confirmDisableKey, setConfirmDisableKey] = useState<string | null>(null);

  const CRITICAL_ADDONS: Record<string, string> = {
    payroll: "Menonaktifkan Payroll akan menyembunyikan tab Setup Payroll dan Payroll Bulanan. Konfigurasi gaji pegawai tidak dihapus, tapi tidak bisa diakses sampai diaktifkan kembali.",
    absensi_shift: "Menonaktifkan Absensi & Jadwal akan menghentikan fitur absensi selfie dan Jadwal & Absensi. Data absensi yang sudah ada tetap tersimpan di database.",
  };

  const [activeAddons, setActiveAddons] = useState<Record<string, boolean>>(() => {
    const initialState: Record<string, boolean> = {};
    addons.forEach((a) => {
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

  useEffect(() => {
    const next: Record<string, boolean> = {};
    addons.forEach((a) => {
      next[a.addon_key] = a.is_enabled;
    });
    setActiveAddons(next);
    setSavedAddons(next);
  }, [branchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const reviewInternalFrequency = useMemo(() => {
    const s = addons.find((a) => a.addon_key === "review_internal")?.settings as Record<string, unknown> | undefined;
    const f = s?.frequency_per_month;
    return typeof f === "number" ? f : undefined;
  }, [addons]);

  const getAddon = (key: string) => addons.find((a) => a.addon_key === key);
  const isEnabled = (key: string) => activeAddons[key] ?? false;
  const getSettings = (key: string) => getAddon(key)?.settings ?? {};

  const isDirty = Object.keys(activeAddons).some((k) => (activeAddons[k] ?? false) !== (savedAddons[k] ?? false));

  function isConfiguredForAddon(key: string): boolean {
    const settings = getSettings(key);
    switch (key) {
      case "produk_fokus":
        return productFokus.length > 0;
      case "review_internal":
        return typeof settings.frequency_per_month === "number";
      default:
        return false;
    }
  }

  const handleToggle = (key: string) => {
    // If disabling a critical add-on, ask for confirmation first
    if (CRITICAL_ADDONS[key] && activeAddons[key]) {
      setConfirmDisableKey(key);
      return;
    }
    setActiveAddons((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleConfirmDisable = () => {
    if (!confirmDisableKey) return;
    setActiveAddons((prev) => ({ ...prev, [confirmDisableKey]: false }));
    setConfirmDisableKey(null);
  };

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

  const handleCloseModal = useCallback(() => {
    setConfigModal(null);
  }, []);

  const handleSaveAddon = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    doSaveRules(activeAddons);
  };

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
      desc: "Input ulasan pelanggan mengikuti aturan default; pengaturan akses dikelola admin.",
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
            <p className="text-sm text-slate-500 mt-1">
              Aktifkan fitur tambahan dan atur sistem kerjanya sesuai kebutuhan cabang.
            </p>
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
            {isPending ? (
              <Loader2 size={18} className="animate-spin text-sky-400" />
            ) : (
              <Save size={18} className="text-sky-400" />
            )}
            Simpan Perubahan Aturan
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ADDON_CARDS.map((card) => {
            const active = isEnabled(card.key);
            const Icon = card.icon;
            const hasConfig = card.key !== "payroll" && card.key !== "review_pelanggan" && card.key !== "absensi_shift";
            const iconActiveClass = addonIconActive[card.color] ?? addonIconActive.sky;

            return (
              <GlassCard
                key={card.key}
                variant="light"
                className={`p-0 overflow-hidden transition-all duration-500 border-slate-200/60 hover:shadow-2xl hover:shadow-sky-500/10 flex flex-col bg-white ${!active && "opacity-60 grayscale-[0.5]"}`}
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
                      isConfiguredForAddon(card.key) ? "bg-slate-50/50 border-slate-100" : "bg-amber-50/30 border-amber-100/50"
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

                {active && !hasConfig && (
                  <div className="px-5 py-4 border-t border-sky-50 bg-sky-50/40 flex items-center justify-between">
                    {(card.key === "payroll" || card.key === "absensi_shift") && onNavigateToTab ? (
                      <button
                        type="button"
                        onClick={() => {
                          const tabMap: Record<string, string> = {
                            payroll: "payroll",
                            absensi_shift: "jadwal",
                          };
                          onNavigateToTab(tabMap[card.key]);
                        }}
                        className="flex items-center gap-1.5 text-[10px] font-black text-sky-600 hover:text-sky-800 uppercase tracking-widest transition-all group"
                      >
                        {card.key === "absensi_shift" ? "Kelola Jadwal & Absensi" : "Konfigurasi Gaji Pegawai"}
                        <ArrowRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    ) : (
                      <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">
                        Berjalan otomatis
                      </span>
                    )}
                    <div className="flex items-center gap-1.5 py-1 px-2 bg-emerald-50 text-emerald-600 rounded-lg">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="text-[9px] font-black uppercase tracking-tight">Aktif</span>
                    </div>
                  </div>
                )}

                {!active && (
                  <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/30 flex items-center justify-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Fitur Dinonaktifkan
                    </span>
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      </form>

      {/* CONFIRM DISABLE MODAL */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {confirmDisableKey && (
              <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setConfirmDisableKey(null)}
                  className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
                >
                  <div className="p-6 flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0">
                        <AlertCircle size={22} className="text-amber-500" />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-800 text-sm">Nonaktifkan Add-on?</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {confirmDisableKey.replace("_", " ")}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed bg-amber-50/60 border border-amber-100 rounded-xl p-3">
                      {CRITICAL_ADDONS[confirmDisableKey]}
                    </p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setConfirmDisableKey(null)}
                        className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmDisable}
                        className="flex-1 px-4 py-2.5 rounded-xl font-black text-sm text-white bg-amber-500 hover:bg-amber-600 transition-colors"
                      >
                        Ya, Nonaktifkan
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}

      {typeof document !== "undefined" &&
        createPortal(
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
                  className="relative my-2 sm:my-6 bg-white shadow-[0_32px_64px_-15px_rgba(0,0,0,0.3)] rounded-[32px] flex flex-col overflow-hidden border border-slate-100 max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] w-full max-w-2xl"
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
                          <p className="text-[10px] font-black text-sky-600 uppercase tracking-widest">
                            {configModal.replace("_", " ")}
                          </p>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="w-12 h-12 flex items-center justify-center bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-2xl transition-all duration-500 group"
                    >
                      <X size={24} className="group-hover:rotate-90 transition-transform duration-500" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    {configModal === "review_internal" && (
                      <AppraisalAddonsSection
                        branchId={branchId}
                        reviewInternalFrequency={reviewInternalFrequency}
                      />
                    )}

                    {configModal === "produk_fokus" && (
                      <ProductFokusSection
                        branchId={branchId}
                        currentMonth={currentMonth}
                        currentYear={currentYear}
                        products={products}
                        productFokus={productFokus}
                      />
                    )}

                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
