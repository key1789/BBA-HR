"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo, useState } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import { History, ArrowRight, User as UserIcon, Calendar, Clock, Database, Banknote, Target, FileText } from "lucide-react";
import { motion } from "framer-motion";

export function TabActivity({ logs, users }: { logs: any[], users: any[] }) {
  const [actionFilter, setActionFilter] = useState("ALL");
  const [entityFilter, setEntityFilter] = useState("ALL");

  const getEntityIcon = (type: string) => {
    if (type === 'payroll_configs') return <Banknote size={16} className="text-emerald-500" />;
    if (type === 'kpi_configs') return <Target size={16} className="text-rose-500" />;
    if (type === 'shift_schedules' || type === 'master_shifts') return <Clock size={16} className="text-sky-500" />;
    return <Database size={16} className="text-slate-500" />;
  };

  const getEntityName = (type: string) => {
    if (type === 'payroll_configs') return "Konfigurasi Gaji";
    if (type === 'kpi_configs') return "Target KPI";
    if (type === 'shift_schedules') return "Jadwal Shift";
    if (type === 'master_shifts') return "Master Shift";
    if (type === 'addon_settings') return "Add-on Cabang";
    return type;
  };

  const getActionColor = (action: string) => {
    if (action === 'CREATE') return "bg-emerald-100 text-emerald-700";
    if (action === 'UPDATE') return "bg-sky-100 text-sky-700";
    if (action === 'DELETE') return "bg-rose-100 text-rose-700";
    return "bg-slate-100 text-slate-700";
  };

  // Helper for rendering JSON diff
  const renderDiff = (oldVal: any, newVal: any) => {
    if (!oldVal && !newVal) return null;
    
    // Simplistic diff render for object
    const oldStr = oldVal ? JSON.stringify(oldVal, null, 2) : "Kosong / Tidak Ada";
    const newStr = newVal ? JSON.stringify(newVal, null, 2) : "Dihapus";

    return (
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-3 overflow-hidden">
          <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-2 flex items-center gap-1">Data Lama</p>
          <pre className="text-xs text-rose-700 font-mono whitespace-pre-wrap line-through opacity-70">
            {oldStr}
          </pre>
        </div>
        <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 overflow-hidden">
          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2 flex items-center gap-1">Data Baru</p>
          <pre className="text-xs text-emerald-700 font-mono whitespace-pre-wrap">
            {newStr}
          </pre>
        </div>
      </div>
    );
  };

  const entityOptions = useMemo(() => {
    const base = Array.from(new Set((logs || []).map((l) => l.entity_type).filter(Boolean)));
    return ["ALL", ...base];
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return (logs || []).filter((l) => {
      if (actionFilter !== "ALL" && l.action !== actionFilter) return false;
      if (entityFilter !== "ALL" && l.entity_type !== entityFilter) return false;
      return true;
    });
  }, [logs, actionFilter, entityFilter]);

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="space-y-1 shrink-0">
        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
          <History size={20} className="text-slate-500" /> Log Aktivitas & Jejak Audit
        </h2>
        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Rekaman perubahan konfigurasi sistem cabang</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600"
        >
          <option value="ALL">Semua Aksi</option>
          <option value="CREATE">Create</option>
          <option value="UPDATE">Update</option>
          <option value="DELETE">Delete</option>
        </select>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600"
        >
          {entityOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt === "ALL" ? "Semua Entitas" : getEntityName(opt)}
            </option>
          ))}
        </select>
      </div>

      <GlassCard variant="light" className="p-0 overflow-hidden flex-1 flex flex-col border-2 border-slate-100 shadow-sm">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-20 h-20 rounded-[32px] bg-slate-50 text-slate-300 flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-slate-200">
              <FileText size={40} />
            </div>
            <h3 className="font-black text-slate-800 uppercase tracking-tight">Belum Ada Rekaman</h3>
            <p className="text-xs text-slate-400 font-bold mt-2 uppercase tracking-tighter">Sistem akan otomatis mencatat jika ada perubahan gaji, target, atau jadwal di cabang ini.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
            <div className="relative border-l-2 border-slate-100 ml-4 md:ml-8 space-y-8 pb-8">
              {filteredLogs.map((log, index) => {
                const actorName = users.find(u => u.app_users.id === log.actor_user_id)?.app_users.full_name || "Sistem / Admin Super";
                const isTargetUser = users.find(u => u.app_users.id === log.entity_id);
                const targetName = isTargetUser ? isTargetUser.app_users.full_name : null;

                return (
                  <motion.div 
                    key={log.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="relative pl-8 md:pl-12"
                  >
                    {/* Timeline Dot */}
                    <div className="absolute w-10 h-10 bg-white border-4 border-slate-50 rounded-full -left-5 top-0 flex items-center justify-center shadow-sm">
                       {getEntityIcon(log.entity_type)}
                    </div>

                    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow group">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${getActionColor(log.action)}`}>
                              {log.action}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                              <Calendar size={10}/> {new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(log.created_at))}
                            </span>
                          </div>
                          <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                            {getEntityName(log.entity_type)}
                            {targetName && (
                              <>
                                <ArrowRight size={12} className="text-slate-300" />
                                <span className="text-sky-600 underline decoration-sky-200 decoration-2 underline-offset-2">{targetName}</span>
                              </>
                            )}
                          </h4>
                        </div>
                        
                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 shrink-0">
                          <UserIcon size={14} className="text-slate-400" />
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-0.5">Dilakukan oleh</p>
                            <p className="text-xs font-black text-slate-700 truncate max-w-[120px]">{actorName}</p>
                          </div>
                        </div>
                      </div>

                      {/* Details (Diff) */}
                      {log.action === 'UPDATE' && renderDiff(log.old_value, log.new_value)}
                      {log.action === 'CREATE' && renderDiff(null, log.new_value)}
                      {log.action === 'DELETE' && renderDiff(log.old_value, null)}

                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
