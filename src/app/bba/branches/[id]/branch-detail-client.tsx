"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useTransition, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/shared/glass-card";
import { Info, Users, Target, ArrowLeft, Clock, CalendarDays, Loader2, Wand2, CheckSquare, Hash, MapPin, Puzzle } from "lucide-react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { TabOverview } from "./tab-overview";
import { TabTargetKpi } from "./tab-target-kpi";
import type { KpiConfigV2 } from "@/lib/types/kpi-v2";
import { TabOperasional } from "./tab-operasional";
import { TabTimAkses } from "./tab-tim-akses";
import { TabActivity } from "./tab-activity";
import { TabAddons } from "./tab-addons";
import { ScrollText, X } from "lucide-react";
import { getOtherBranchesAction, cloneBranchConfigAction } from "./actions";
import { toast } from "sonner";


export function BranchDetailClient({
  branch, users, kpi, kpiConfigV2, addons, shifts, products, productFokus, roster, shiftDefaults, payrollConfigs, activityLogs, availableOwners, currentMonth, currentYear,
  canEditKpi = true,
  canCloneBranch = true,
}: {
  branch: any, users: any[], kpi: any, kpiConfigV2: KpiConfigV2, addons: any[], shifts: any[], products: any[], productFokus: any[], roster: any[], shiftDefaults: any[], payrollConfigs: any[], activityLogs: any[], availableOwners: any[], currentMonth: number, currentYear: number,
  canEditKpi?: boolean,
  canCloneBranch?: boolean,
}) {
  const [activeTab, setActiveTab] = useState("info");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Clone Modal State
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [otherBranches, setOtherBranches] = useState<any[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isCloning, setIsCloning] = useState(false);

  const openCloneModal = async () => {
    setIsCloneModalOpen(true);
    setIsLoadingBranches(true);
    const result = await getOtherBranchesAction(branch.id);
    if (result.success) {
      setOtherBranches(result.data || []);
    } else {
      toast.error(result.error);
    }
    setIsLoadingBranches(false);
  };

  const handleCloneSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.append("targetBranchId", branch.id);
    
    setIsCloning(true);
    const toastId = toast.loading("Sedang menduplikasi konfigurasi...");
    const result = await cloneBranchConfigAction(null, formData);
    
    if (result.error) {
      toast.error(result.error, { id: toastId });
    } else if (result.success) {
      toast.success(result.message, { id: toastId });
      setIsCloneModalOpen(false);
    }
    setIsCloning(false);
  };

  const handlePeriodChange = (month: number, year: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", month.toString());
    params.set("year", year.toString());
    
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const payrollAddon           = addons.find((a: any) => a.addon_key === 'payroll');
  const isPayrollEnabled       = payrollAddon?.is_enabled                                        ?? false;
  const allowOwnerInput        = Boolean((payrollAddon?.settings as any)?.allow_owner_input);
  const allowAdminInput        = Boolean((payrollAddon?.settings as any)?.allow_admin_input);
  const isAbsensiEnabled       = addons.find((a: any) => a.addon_key === 'absensi_shift')?.is_enabled ?? false;
  const isProductFokusEnabled  = addons.find((a: any) => a.addon_key === 'produk_fokus')?.is_enabled  ?? false;

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 10 }, (_, i) => y - 2 + i);
  }, []);

  const currentTabs = [
    { id: "info",       label: "Executive Overview",         icon: Info      },
    { id: "tim",        label: "Tim & Akses",                icon: Users     },
    { id: "kpi",        label: "Target, KPI & Produk Fokus", icon: Target    },
    { id: "addons",     label: "Fitur & Add-on",             icon: Puzzle    },
    { id: "operasional",label: "Shift, Absensi & Payroll",   icon: Clock     },
    { id: "activity",   label: "Log Aktivitas",              icon: ScrollText},
  ];

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* HEADER PAGE */}
      <GlassCard className="p-4 sm:p-5 shrink-0 w-full" variant="light">
        {/* Row 1: back button + branch name + clone icon */}
        <div className="flex items-center gap-3">
          <Link
            href="/bba/branches"
            className="w-9 h-9 shrink-0 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-sky-600 hover:text-white transition-all duration-300 shadow-sm border border-slate-100 group"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
          </Link>

          <h1 className="flex-1 text-xl md:text-2xl font-black text-slate-800 uppercase tracking-tight leading-none truncate">
            {branch.name}
          </h1>

          <button
            type="button"
            onClick={openCloneModal}
            disabled={!canCloneBranch}
            title="Salin Aturan Cabang"
            className="w-9 h-9 shrink-0 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200 transition-all shadow-sm disabled:opacity-40 disabled:pointer-events-none"
          >
            <Wand2 size={15} />
          </button>
        </div>

        {/* Row 2: status · code · location | period selector */}
        <div className="flex items-center gap-x-2.5 mt-2.5 ml-12 flex-wrap gap-y-1.5">
          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
            branch.status === "active"
              ? "text-emerald-600 bg-emerald-50 border-emerald-100"
              : "text-slate-500 bg-slate-100 border-slate-200"
          }`}>
            {branch.status}
          </span>

          <span className="text-slate-200 select-none">·</span>

          <span className="inline-flex items-center gap-1 text-[10px] font-black text-sky-600 uppercase tracking-widest">
            <Hash size={10} />{branch.code}
          </span>

          <span className="text-slate-200 select-none">·</span>

          <span className="text-[10px] font-medium text-slate-400 flex items-center gap-1 truncate">
            <MapPin size={10} />{branch.location || "Lokasi belum diatur"}
          </span>

          <div className="w-px h-3.5 bg-slate-200 mx-0.5 shrink-0" />

          {/* Period selector — inline, no container box */}
          <div className="flex items-center gap-1.5">
            <CalendarDays size={11} className="text-slate-400 shrink-0" />
            <select
              value={currentMonth}
              onChange={(e) => handlePeriodChange(parseInt(e.target.value), currentYear)}
              disabled={isPending}
              className="bg-transparent text-[11px] font-black text-slate-600 outline-none cursor-pointer hover:text-sky-600 transition-colors disabled:opacity-50"
            >
              {["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"].map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={currentYear}
              onChange={(e) => handlePeriodChange(currentMonth, parseInt(e.target.value))}
              disabled={isPending}
              className="bg-transparent text-[11px] font-black text-slate-600 outline-none cursor-pointer hover:text-sky-600 transition-colors disabled:opacity-50"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {isPending && <Loader2 size={11} className="animate-spin text-sky-500" />}
          </div>
        </div>
      </GlassCard>

      {/* TAB NAVIGATION */}
      <div className="flex overflow-x-auto hide-scrollbar gap-1 p-1.5 bg-white rounded-2xl border border-slate-100 shadow-lg shadow-slate-200/40 shrink-0 w-full relative z-20">
        {currentTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative shrink-0 whitespace-nowrap px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all duration-300 group ${isActive ? 'text-sky-600' : 'text-slate-400 hover:text-slate-700'}`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-sky-50 rounded-xl border border-sky-100 shadow-sm"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <div className={`relative z-10 w-5 h-5 rounded-md flex items-center justify-center transition-all duration-300 ${isActive ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30' : 'bg-slate-50 text-slate-400 group-hover:bg-slate-100'}`}>
                <Icon size={12} />
              </div>
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>


      {/* TAB CONTENT AREA */}
      <div className="flex-1 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            {activeTab === "info" && <TabOverview branch={branch} users={users} kpi={kpi} addons={addons} shifts={shifts} products={products} productFokus={productFokus} roster={roster} availableOwners={availableOwners} currentMonth={currentMonth} currentYear={currentYear} onNavigateToTab={setActiveTab} />}
            {activeTab === "tim" && <TabTimAkses branch={branch} users={users} />}
            {activeTab === "kpi" && (
              <TabTargetKpi
                branchId={branch.id}
                currentMonth={currentMonth}
                currentYear={currentYear}
                users={users}
                kpiConfigV2={kpiConfigV2}
                products={products}
                productFokus={productFokus}
                canEditKpi={canEditKpi}
                isProductFokusEnabled={isProductFokusEnabled}
              />
            )}

            {activeTab === "operasional" && (
              <TabOperasional
                branchId={branch.id}
                shifts={shifts}
                users={users}
                roster={roster}
                shiftDefaults={shiftDefaults}
                payrollConfigs={payrollConfigs}
                currentMonth={currentMonth}
                currentYear={currentYear}
                isAbsensiEnabled={isAbsensiEnabled}
                isPayrollEnabled={isPayrollEnabled}
                allowOwnerInput={allowOwnerInput}
                allowAdminInput={allowAdminInput}
              />
            )}
            {activeTab === "addons" && (
              <TabAddons
                branchId={branch.id}
                addons={addons}
                products={products}
                productFokus={productFokus}
                currentMonth={currentMonth}
                currentYear={currentYear}
                onNavigateToTab={setActiveTab}
              />
            )}
            {activeTab === "activity" && <TabActivity logs={activityLogs} users={users} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* CLONE CONFIG MODAL */}
      <AnimatePresence>
        {isCloneModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div>
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <Wand2 size={20} className="text-purple-600" /> Duplikasi Aturan Cabang
                  </h3>
                  <p className="text-xs text-slate-500 font-bold mt-1">Salin konfigurasi dari cabang lain (Timpa Bersih).</p>
                </div>
                <button onClick={() => setIsCloneModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-500 transition-colors">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCloneSubmit} className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase">Pilih Cabang Sumber</label>
                  {isLoadingBranches ? (
                    <div className="flex items-center gap-2 text-slate-500 text-sm p-3 border rounded-xl bg-slate-50">
                      <Loader2 size={16} className="animate-spin" /> Memuat daftar cabang...
                    </div>
                  ) : (
                    <select name="sourceBranchId" required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all">
                      <option value="">-- Pilih Cabang --</option>
                      {otherBranches.map(b => (
                        <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black text-slate-500 uppercase">Apa yang ingin disalin?</label>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-start gap-3 p-3 border rounded-xl hover:bg-slate-50 cursor-pointer transition-colors has-[:checked]:border-purple-300 has-[:checked]:bg-purple-50/30">
                      <input type="checkbox" name="cloneShifts" value="true" className="mt-0.5 rounded text-purple-600 focus:ring-purple-500" defaultChecked />
                      <div>
                        <p className="text-xs font-bold text-slate-700">Master Shift</p>
                        <p className="text-[10px] text-slate-500">Jam kerja pagi, siang, malam.</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 border rounded-xl hover:bg-slate-50 cursor-pointer transition-colors has-[:checked]:border-purple-300 has-[:checked]:bg-purple-50/30">
                      <input type="checkbox" name="cloneAddons" value="true" className="mt-0.5 rounded text-purple-600 focus:ring-purple-500" defaultChecked />
                      <div>
                        <p className="text-xs font-bold text-slate-700">Aturan Add-on</p>
                        <p className="text-[10px] text-slate-500">Status aktif/tidak fitur tambahan.</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 border rounded-xl hover:bg-slate-50 cursor-pointer transition-colors has-[:checked]:border-purple-300 has-[:checked]:bg-purple-50/30">
                      <input type="checkbox" name="cloneKpi" value="true" className="mt-0.5 rounded text-purple-600 focus:ring-purple-500" defaultChecked />
                      <div>
                        <p className="text-xs font-bold text-slate-700">Target KPI Global</p>
                        <p className="text-[10px] text-slate-500">Omzet, bobot, mode bonus.</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 border rounded-xl hover:bg-slate-50 cursor-pointer transition-colors has-[:checked]:border-purple-300 has-[:checked]:bg-purple-50/30">
                      <input type="checkbox" name="cloneProdukFokus" value="true" className="mt-0.5 rounded text-purple-600 focus:ring-purple-500" defaultChecked />
                      <div>
                        <p className="text-xs font-bold text-slate-700">Produk Fokus</p>
                        <p className="text-[10px] text-slate-500">Daftar item & nominal insentif.</p>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 text-xs text-rose-800 font-medium">
                  <strong>Peringatan (Timpa Bersih):</strong> Data modul yang dicentang di cabang ini akan <strong className="font-black text-rose-900">DIHAPUS</strong> dan digantikan secara permanen oleh data dari cabang sumber. Data gaji (Payroll) tidak ikut disalin.
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                  <button type="button" onClick={() => setIsCloneModalOpen(false)} className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-100 transition-colors">Batal</button>
                  <button type="submit" disabled={isCloning} className="px-6 py-2.5 rounded-xl font-black text-xs text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-200 transition-all active:scale-95 disabled:opacity-70 flex items-center gap-2">
                    {isCloning ? <Loader2 size={16} className="animate-spin" /> : <CheckSquare size={16} />}
                    Mulai Duplikasi
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
