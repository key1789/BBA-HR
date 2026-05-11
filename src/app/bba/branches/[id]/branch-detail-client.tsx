"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/shared/glass-card";
import { Info, Users, Target, Puzzle, ArrowLeft, Clock, CalendarDays, Loader2, Banknote, Wand2, CheckSquare, Hash, MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { TabOverview } from "./tab-overview";
import { TabPegawai } from "./tab-pegawai";
import { TabKpi } from "./tab-kpi";
import { TabAddon } from "./tab-addon";
import { TabShift } from "./tab-shift";
import { TabPayroll } from "./tab-payroll";
import { TabActivity } from "./tab-activity";
import { ScrollText, X } from "lucide-react";
import { getOtherBranchesAction, cloneBranchConfigAction } from "./actions";
import { toast } from "sonner";


export function BranchDetailClient({ 
  branch, users, kpi, addons, shifts, products, productFokus, roster, payrollConfigs, activityLogs, availableOwners, currentMonth, currentYear 
}: { 
  branch: any, users: any[], kpi: any, addons: any[], shifts: any[], products: any[], productFokus: any[], roster: any[], payrollConfigs: any[], activityLogs: any[], availableOwners: any[], currentMonth: number, currentYear: number 
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

  const currentTabs = [
    { id: "info", label: "Executive Overview", icon: Info },
    { id: "pegawai", label: "Manajemen Pegawai", icon: Users },
    { id: "kpi", label: "Target & KPI", icon: Target },
    { id: "shift", label: "Pengaturan Shift", icon: Clock },
    { id: "addon", label: "Add-on Rules", icon: Puzzle },
    ...(isPayrollEnabled ? [{ id: "payroll", label: "Setup Payroll", icon: Banknote }] : []),
    { id: "activity", label: "Log Aktivitas", icon: ScrollText },
  ];

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* HEADER PAGE */}
      <GlassCard className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 p-5 md:p-8 shrink-0 w-full bg-white/80 backdrop-blur-xl border-slate-200/60 shadow-xl shadow-slate-200/50" variant="light">
        <div className="flex items-start md:items-center gap-4 md:gap-6 w-full md:w-auto">
          <Link href="/bba/branches" className="w-12 h-12 shrink-0 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-sky-600 hover:text-white transition-all duration-500 shadow-sm border border-slate-100 group">
            <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          </Link>
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-black text-slate-800 uppercase tracking-tight leading-none">{branch.name}</h1>
              <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border shadow-sm ${branch.status === 'active' ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-slate-500 bg-slate-100 border-slate-200'}`}>
                {branch.status}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-sky-50 text-sky-600 rounded-lg border border-sky-100 shadow-sm">
                <Hash size={12} className="font-black" />
                <span className="text-[11px] font-black uppercase tracking-widest">{branch.code}</span>
              </div>
              <div className="w-1 h-1 rounded-full bg-slate-300 mx-1"></div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <MapPin size={12} /> {branch.location || 'Lokasi Belum Diatur'}
              </p>
            </div>
          </div>
        </div>

        {/* ACTIONS & PERIOD SELECTOR */}
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <button
            onClick={openCloneModal}
            className="w-full md:w-auto px-6 py-3 bg-slate-900 hover:bg-black text-white rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-slate-900/20 transition-all hover:-translate-y-0.5 active:scale-95 group"
          >
            <div className="w-6 h-6 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-400 group-hover:scale-110 transition-transform">
              <Wand2 size={14} />
            </div>
            Salin Aturan Cabang
          </button>

          {/* GLOBAL PERIOD SELECTOR */}
          <div className="bg-slate-50 p-1.5 rounded-2xl border border-slate-100 flex items-center gap-2 w-full md:w-auto shadow-inner">
            <div className="px-3 flex items-center gap-2 shrink-0 border-r border-slate-200 py-1.5">
              <CalendarDays size={16} className="text-slate-400" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest hidden lg:inline">Periode</span>
            </div>
            
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl shadow-sm border border-slate-100 flex-1 md:flex-initial">
              <select 
                value={currentMonth}
                onChange={(e) => handlePeriodChange(parseInt(e.target.value), currentYear)}
                disabled={isPending}
                className="bg-transparent text-xs font-black text-slate-700 px-3 py-1.5 outline-none cursor-pointer hover:text-sky-600 transition-colors disabled:opacity-50 min-w-[100px]"
              >
                {['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].map((m, i) => (
                  <option key={i+1} value={i+1}>{m}</option>
                ))}
              </select>
              <div className="w-px h-5 bg-slate-100 shrink-0 mx-1" />
              <select 
                value={currentYear}
                onChange={(e) => handlePeriodChange(currentMonth, parseInt(e.target.value))}
                disabled={isPending}
                className="bg-transparent text-xs font-black text-slate-700 px-3 py-1.5 outline-none cursor-pointer hover:text-sky-600 transition-colors disabled:opacity-50"
              >
                {[2024, 2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              {isPending && <Loader2 size={14} className="animate-spin text-sky-500 mx-2" />}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* TAB NAVIGATION */}
      <div className="flex overflow-x-auto hide-scrollbar gap-2 p-2 bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40 shrink-0 w-full relative z-20">
        {currentTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative shrink-0 whitespace-nowrap px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 transition-all duration-500 group ${isActive ? 'text-sky-600' : 'text-slate-400 hover:text-slate-800'}`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-sky-50 rounded-2xl border border-sky-100 shadow-sm"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <div className={`relative z-10 w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-500 ${isActive ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/30 rotate-3' : 'bg-slate-50 text-slate-400 group-hover:bg-slate-100'}`}>
                <Icon size={14} />
              </div>
              <span className="relative z-10 font-black tracking-widest">{tab.label}</span>
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
            {activeTab === "kpi" && <TabKpi branchId={branch.id} currentKpi={kpi} currentMonth={currentMonth} currentYear={currentYear} users={users} />}

            {activeTab === "shift" && <TabShift branchId={branch.id} shifts={shifts} />}
            {activeTab === "addon" && <TabAddon branchId={branch.id} addons={addons} users={users} shifts={shifts} products={products} productFokus={productFokus} roster={roster} currentMonth={currentMonth} currentYear={currentYear} />}
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
