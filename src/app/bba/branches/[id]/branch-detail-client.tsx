"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useTransition, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/shared/glass-card";
import { Info, Users, Target, Puzzle, ArrowLeft, Clock, CalendarDays, Loader2, Banknote, Wand2, CheckSquare, Hash, MapPin, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { TabOverview } from "./tab-overview";
import { TabPegawai } from "./tab-pegawai";
import { TabKpiV2 } from "@/components/kpi-v2/TabKpiV2";
import type { KpiConfigV2 } from "@/lib/types/kpi-v2";
import { TabAddon } from "@/components/branch/tab-addon";
import { TabShift } from "./tab-shift";
import { TabPayroll } from "./tab-payroll";
import { TabJadwalAbsensi } from "./tab-jadwal-absensi";
import { TabActivity } from "./tab-activity";
import { TabBranchDeskAdmin } from "./tab-branch-desk-admin";
import { ScrollText, X } from "lucide-react";
import { getOtherBranchesAction, cloneBranchConfigAction } from "./actions";
import { toast } from "sonner";


export function BranchDetailClient({
  branch, users, kpi, kpiConfigV2, addons, shifts, products, productFokus, roster, shiftDefaults, attendanceLogs, payrollConfigs, activityLogs, availableOwners, currentMonth, currentYear,
  canEditKpi = true,
  canCloneBranch = true,
}: {
  branch: any, users: any[], kpi: any, kpiConfigV2: KpiConfigV2, addons: any[], shifts: any[], products: any[], productFokus: any[], roster: any[], shiftDefaults: any[], attendanceLogs: any[], payrollConfigs: any[], activityLogs: any[], availableOwners: any[], currentMonth: number, currentYear: number,
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

  const isPayrollEnabled = addons.find(a => a.addon_key === 'payroll')?.is_enabled ?? false;
  const isAbsensiEnabled = addons.find(a => a.addon_key === 'absensi_shift')?.is_enabled ?? false;

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 10 }, (_, i) => y - 2 + i);
  }, []);

  const currentTabs = [
    { id: "info", label: "Executive Overview", icon: Info },
    { id: "desk-admin", label: "Akun admin cabang", icon: KeyRound },
    { id: "shift", label: "Pengaturan shift", icon: Clock },
    { id: "pegawai", label: "Manajemen crew", icon: Users },
    { id: "kpi", label: "Target dan KPI", icon: Target },
    { id: "addon", label: "Add-on rules", icon: Puzzle },
    ...(isAbsensiEnabled ? [{ id: "jadwal", label: "Jadwal & Absensi", icon: CalendarDays }] : []),
    ...(isPayrollEnabled ? [{ id: "payroll", label: "Setup Payroll", icon: Banknote }] : []),
    { id: "activity", label: "Log aktivitas", icon: ScrollText },
  ];

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* HEADER PAGE — compact single-row on desktop */}
      <GlassCard className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 shrink-0 w-full bg-white/80 backdrop-blur-xl border-slate-200/60 shadow-xl shadow-slate-200/50" variant="light">
        {/* Left: back + branch info */}
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/bba/branches" className="w-9 h-9 shrink-0 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-sky-600 hover:text-white transition-all duration-300 shadow-sm border border-slate-100 group">
            <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg md:text-xl font-black text-slate-800 uppercase tracking-tight leading-none truncate">{branch.name}</h1>
              <span className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${branch.status === 'active' ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-slate-500 bg-slate-100 border-slate-200'}`}>
                {branch.status}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-sky-50 text-sky-600 rounded-md border border-sky-100 text-[10px] font-black uppercase tracking-widest">
                <Hash size={10} />{branch.code}
              </span>
              <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 truncate">
                <MapPin size={10} />{branch.location || 'Lokasi belum diatur'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: actions + period selector */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
          {/* Salin Aturan — icon + short label */}
          <button
            type="button"
            onClick={openCloneModal}
            disabled={!canCloneBranch}
            title="Salin Aturan Cabang"
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-black text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-slate-900/20 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:pointer-events-none group"
          >
            <Wand2 size={13} className="text-sky-400 group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline">Salin Aturan</span>
          </button>

          {/* Period selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-sm">
            <CalendarDays size={13} className="text-slate-400 shrink-0" />
            <select
              value={currentMonth}
              onChange={(e) => handlePeriodChange(parseInt(e.target.value), currentYear)}
              disabled={isPending}
              className="bg-transparent text-[11px] font-black text-slate-700 outline-none cursor-pointer hover:text-sky-600 transition-colors disabled:opacity-50"
            >
              {['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'].map((m, i) => (
                <option key={i+1} value={i+1}>{m}</option>
              ))}
            </select>
            <div className="w-px h-4 bg-slate-200 shrink-0" />
            <select
              value={currentYear}
              onChange={(e) => handlePeriodChange(currentMonth, parseInt(e.target.value))}
              disabled={isPending}
              className="bg-transparent text-[11px] font-black text-slate-700 outline-none cursor-pointer hover:text-sky-600 transition-colors disabled:opacity-50"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {isPending && <Loader2 size={12} className="animate-spin text-sky-500 ml-1" />}
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
            {activeTab === "info" && <TabOverview branch={branch} users={users} kpi={kpi} addons={addons} shifts={shifts} products={products} productFokus={productFokus} roster={roster} payrollConfigs={payrollConfigs} availableOwners={availableOwners} />}
            {activeTab === "pegawai" && <TabPegawai branch={branch} users={users} />}
            {activeTab === "desk-admin" && <TabBranchDeskAdmin branch={branch} users={users} />}
            {activeTab === "kpi" && (
              <TabKpiV2
                branchId={branch.id}
                currentMonth={currentMonth}
                currentYear={currentYear}
                users={users}
                initialConfig={kpiConfigV2}
                canEditKpi={canEditKpi}
              />
            )}

            {activeTab === "shift" && <TabShift branchId={branch.id} shifts={shifts} />}
            {activeTab === "addon" && <TabAddon branchId={branch.id} addons={addons} products={products} productFokus={productFokus} currentMonth={currentMonth} currentYear={currentYear} onNavigateToTab={setActiveTab} />}
            {activeTab === "jadwal" && <TabJadwalAbsensi branchId={branch.id} users={users} shifts={shifts} roster={roster} shiftDefaults={shiftDefaults} attendanceLogs={attendanceLogs} currentMonth={currentMonth} currentYear={currentYear} />}
            {activeTab === "payroll" && <TabPayroll branchId={branch.id} users={users} payrollConfigs={payrollConfigs} />}
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
