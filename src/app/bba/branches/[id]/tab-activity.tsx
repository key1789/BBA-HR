"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo, useState } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import { History, ArrowRight, User as UserIcon, Calendar, Clock, Database, Banknote, Target, FileText, ChevronDown, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function TabActivity({ logs, users }: { logs: any[], users: any[] }) {
  const [actionFilter, setActionFilter] = useState("ALL");
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  const hasDateFilter = dateFrom !== "" || dateTo !== "";
  const clearDateFilter = () => { setDateFrom(""); setDateTo(""); };

  const toggleLog = (id: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const SKIP_FIELDS = new Set([
    "id", "tenant_apotek_id", "user_id", "created_at", "updated_at",
    "updated_by_user_id", "created_by_user_id", "payroll_period_id",
  ]);

  const FIELD_LABELS: Record<string, string> = {
    base_salary: "Gaji Pokok",
    position_allowance: "Tunjangan Jabatan",
    meal_allowance: "Uang Makan / Hari",
    transport_allowance: "Transport / Hari",
    bpjs_deduction: "Potongan BPJS (total)",
    custom_adjustments: "Penyesuaian Kustom",
    target_omzet: "Target Omzet",
    target_atv: "Target ATV",
    target_atu: "Target ATU",
    shift_name: "Nama Shift",
    start_time: "Jam Mulai",
    end_time: "Jam Selesai",
    is_off: "Status OFF",
    is_enabled: "Status Aktif",
    addon_key: "Add-on",
    schedule_date: "Tanggal Jadwal",
    shift_id: "Shift",
    status: "Status",
    period_month: "Bulan",
    period_year: "Tahun",
    bonus_config: "Konfigurasi Bonus",
    settings: "Pengaturan",
  };

  const CURRENCY_FIELDS = new Set([
    "base_salary", "position_allowance", "meal_allowance", "transport_allowance",
    "bpjs_deduction", "target_omzet", "target_atv", "target_atu",
  ]);

  const formatFieldValue = (key: string, value: unknown): string => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean") return value ? "Aktif" : "Nonaktif";
    if (CURRENCY_FIELDS.has(key)) return `Rp ${Number(value).toLocaleString("id-ID")}`;
    if (key === "start_time" || key === "end_time") return String(value).slice(0, 5);
    if (key === "custom_adjustments" && Array.isArray(value)) {
      const items = value as any[];
      if (items.length === 0) return "Kosong";
      return items.map((c) => {
        const sign = c.type === "addition" ? "+" : c.type === "bpjs_employer" ? "(Perusahaan)" : "−";
        return `${c.name || "?"}: ${sign}Rp ${Number(c.amount).toLocaleString("id-ID")}`;
      }).join(" · ");
    }
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const labelFor = (key: string) => FIELD_LABELS[key] ?? key.replace(/_/g, " ");

  const renderDiff = (oldVal: any, newVal: any) => {
    if (!oldVal && !newVal) return null;

    const old = oldVal && typeof oldVal === "object" && !Array.isArray(oldVal) ? oldVal : {};
    const nw  = newVal && typeof newVal === "object" && !Array.isArray(newVal) ? newVal : {};

    const allKeys = Array.from(new Set([...Object.keys(old), ...Object.keys(nw)]))
      .filter((k) => !SKIP_FIELDS.has(k));

    // UPDATE — show only changed fields
    if (oldVal && newVal) {
      const changed = allKeys.filter((k) => JSON.stringify(old[k]) !== JSON.stringify(nw[k]));
      if (changed.length === 0) {
        return <p className="mt-3 text-xs text-slate-400 italic">Tidak ada perubahan data terdeteksi.</p>;
      }
      return (
        <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100 overflow-hidden">
          {changed.map((k) => (
            <div key={k} className="flex items-center gap-3 px-4 py-2.5 text-xs bg-white hover:bg-slate-50">
              <span className="w-36 shrink-0 font-bold text-slate-500">{labelFor(k)}</span>
              <span className="text-rose-500 line-through opacity-70 flex-1 truncate">{formatFieldValue(k, old[k])}</span>
              <span className="text-slate-300 shrink-0">→</span>
              <span className="text-emerald-600 font-bold flex-1 truncate">{formatFieldValue(k, nw[k])}</span>
            </div>
          ))}
        </div>
      );
    }

    // CREATE or DELETE — show all relevant fields
    const isCreate = !!newVal;
    const data = isCreate ? nw : old;
    const keys = allKeys.filter((k) => data[k] !== null && data[k] !== undefined);
    if (keys.length === 0) return null;

    return (
      <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100 overflow-hidden">
        {keys.map((k) => (
          <div key={k} className="flex items-center gap-3 px-4 py-2.5 text-xs bg-white hover:bg-slate-50">
            <span className="w-36 shrink-0 font-bold text-slate-500">{labelFor(k)}</span>
            <span className={isCreate ? "text-emerald-600 font-bold" : "text-rose-500 line-through opacity-70"}>
              {formatFieldValue(k, data[k])}
            </span>
          </div>
        ))}
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
      if (dateFrom) {
        if (new Date(l.created_at) < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        const toEnd = new Date(dateTo);
        toEnd.setHours(23, 59, 59, 999);
        if (new Date(l.created_at) > toEnd) return false;
      }
      return true;
    });
  }, [logs, actionFilter, entityFilter, dateFrom, dateTo]);

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="space-y-1 shrink-0">
        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
          <History size={20} className="text-slate-500" /> Log Aktivitas & Jejak Audit
        </h2>
        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Rekaman perubahan konfigurasi sistem cabang</p>
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap gap-3">
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

        {/* Date range filter */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2">
            <Calendar size={12} className="text-slate-400 shrink-0" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dari</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-xs font-bold text-slate-600 bg-transparent outline-none cursor-pointer"
            />
          </div>
          <span className="text-slate-300 text-xs">—</span>
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2">
            <Calendar size={12} className="text-slate-400 shrink-0" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sampai</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-xs font-bold text-slate-600 bg-transparent outline-none cursor-pointer"
            />
          </div>
          {hasDateFilter && (
            <button
              type="button"
              onClick={clearDateFilter}
              className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-500 text-[10px] font-black uppercase tracking-widest transition-colors"
            >
              <X size={11} /> Reset
            </button>
          )}
        </div>
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
                const isExpanded = expandedLogs.has(log.id);
                const hasDiff = log.old_value || log.new_value;

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

                    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                      {/* Compact header row — always visible */}
                      <button
                        type="button"
                        onClick={() => hasDiff && toggleLog(log.id)}
                        className={`w-full text-left px-5 py-3.5 flex items-center gap-3 ${hasDiff ? "cursor-pointer hover:bg-slate-50/70" : "cursor-default"}`}
                      >
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md shrink-0 ${getActionColor(log.action)}`}>
                          {log.action}
                        </span>
                        <span className="text-sm font-black text-slate-800 flex items-center gap-1.5 truncate">
                          {getEntityName(log.entity_type)}
                          {targetName && (
                            <>
                              <ArrowRight size={11} className="text-slate-300 shrink-0" />
                              <span className="text-sky-600 truncate">{targetName}</span>
                            </>
                          )}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 ml-auto shrink-0">
                          <UserIcon size={10} className="text-slate-300" />
                          {actorName}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 shrink-0">
                          <Calendar size={10} />
                          {new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(log.created_at))}
                        </span>
                        {hasDiff && (
                          <ChevronDown
                            size={15}
                            className={`shrink-0 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                          />
                        )}
                      </button>

                      {/* Expandable diff */}
                      <AnimatePresence initial={false}>
                        {isExpanded && hasDiff && (
                          <motion.div
                            key="diff"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden border-t border-slate-100"
                          >
                            <div className="px-5 pb-5">
                              {log.action === 'UPDATE' && renderDiff(log.old_value, log.new_value)}
                              {log.action === 'CREATE' && renderDiff(null, log.new_value)}
                              {log.action === 'DELETE' && renderDiff(log.old_value, null)}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
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
