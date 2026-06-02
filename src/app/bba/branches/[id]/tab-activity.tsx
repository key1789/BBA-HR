"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo, useState } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import {
  History, User as UserIcon, Calendar, Clock, Banknote, Target,
  ChevronDown, X, Plus, RefreshCw, Trash2, Package, Settings,
  FileText, Search, SlidersHorizontal,
} from "lucide-react";
import { InfoTooltip } from "@/components/shared/info-tooltip";
import { motion, AnimatePresence } from "framer-motion";

// ─── Action config ────────────────────────────────────────────────────────────
const ACTION_CONFIG: Record<string, {
  label: string;
  filterLabel: string;
  badgeClass: string;
  dotClass: string;
  Icon: React.ElementType;
}> = {
  CREATE: {
    label: "Dibuat",
    filterLabel: "Baru Dibuat",
    badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    dotClass: "bg-emerald-500 shadow-emerald-200",
    Icon: Plus,
  },
  UPDATE: {
    label: "Diperbarui",
    filterLabel: "Diperbarui",
    badgeClass: "bg-sky-50 text-sky-700 border border-sky-200",
    dotClass: "bg-sky-500 shadow-sky-200",
    Icon: RefreshCw,
  },
  DELETE: {
    label: "Dihapus",
    filterLabel: "Dihapus",
    badgeClass: "bg-rose-50 text-rose-700 border border-rose-200",
    dotClass: "bg-rose-500 shadow-rose-200",
    Icon: Trash2,
  },
};

// ─── Entity config ────────────────────────────────────────────────────────────
const ENTITY_CONFIG: Record<string, {
  label: string;
  Icon: React.ElementType;
  iconClass: string;
}> = {
  payroll_configs: { label: "Konfigurasi Gaji",  Icon: Banknote,  iconClass: "text-emerald-600 bg-emerald-50" },
  kpi_configs:     { label: "Target KPI",         Icon: Target,    iconClass: "text-rose-600 bg-rose-50"     },
  shift_schedules: { label: "Jadwal Shift",        Icon: Clock,     iconClass: "text-sky-600 bg-sky-50"      },
  master_shifts:   { label: "Master Shift",        Icon: Clock,     iconClass: "text-sky-600 bg-sky-50"      },
  addon_settings:  { label: "Pengaturan Add-on",   Icon: Settings,  iconClass: "text-purple-600 bg-purple-50"},
  product_focus:   { label: "Produk Fokus",        Icon: Package,   iconClass: "text-teal-600 bg-teal-50"   },
};

function getEntityCfg(type: string) {
  return ENTITY_CONFIG[type] ?? { label: type.replace(/_/g, " "), Icon: FileText, iconClass: "text-slate-500 bg-slate-50" };
}

// ─── Human-readable summary ───────────────────────────────────────────────────
function getSummary(action: string, entityType: string, targetName: string | null): string {
  const entity = getEntityCfg(entityType).label;
  switch (action) {
    case "CREATE": return targetName ? `${entity} untuk ${targetName} ditambahkan` : `${entity} baru dibuat`;
    case "UPDATE": return targetName ? `${entity} milik ${targetName} diperbarui`  : `${entity} diperbarui`;
    case "DELETE": return targetName ? `${entity} milik ${targetName} dihapus`     : `${entity} dihapus`;
    default:       return `${entity} — ${action}`;
  }
}

// ─── Date grouping ────────────────────────────────────────────────────────────
function getDateLabel(dateStr: string): string {
  const date  = new Date(dateStr);
  const today = new Date();
  const yday  = new Date(today); yday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return "Hari ini";
  if (sameDay(date, yday))  return "Kemarin";
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
  if (date >= weekStart)    return "Minggu ini";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

// ─── Field labels + formatting (unchanged logic) ─────────────────────────────
const SKIP_FIELDS = new Set([
  "id", "tenant_apotek_id", "user_id", "created_at", "updated_at",
  "updated_by_user_id", "created_by_user_id", "payroll_period_id",
]);

const FIELD_LABELS: Record<string, string> = {
  base_salary:          "Gaji Pokok",
  position_allowance:   "Tunjangan Jabatan",
  meal_allowance:       "Uang Makan / Hari",
  transport_allowance:  "Transport / Hari",
  bpjs_deduction:       "Potongan BPJS",
  custom_adjustments:   "Penyesuaian Kustom",
  target_omzet:         "Target Omzet",
  target_atv:           "Target ATV",
  target_atu:           "Target ATU",
  shift_name:           "Nama Shift",
  start_time:           "Jam Mulai",
  end_time:             "Jam Selesai",
  is_off:               "Status OFF",
  is_enabled:           "Status Aktif",
  addon_key:            "Add-on",
  schedule_date:        "Tanggal Jadwal",
  shift_id:             "Shift",
  status:               "Status",
  period_month:         "Bulan",
  period_year:          "Tahun",
  bonus_config:         "Konfigurasi Bonus",
  settings:             "Pengaturan",
  bonus_config_v2:      "Skema Bonus",
};

const CURRENCY_FIELDS = new Set([
  "base_salary", "position_allowance", "meal_allowance", "transport_allowance",
  "bpjs_deduction", "target_omzet", "target_atv", "target_atu",
]);

function labelFor(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, " ");
}

function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Aktif" : "Nonaktif";
  if (CURRENCY_FIELDS.has(key)) return `Rp ${Number(value).toLocaleString("id-ID")}`;
  if (key === "start_time" || key === "end_time") return String(value).slice(0, 5);
  if (key === "custom_adjustments" && Array.isArray(value)) {
    const items = value as any[];
    if (items.length === 0) return "Kosong";
    return items
      .map((c) => {
        const sign = c.type === "addition" ? "+" : c.type === "bpjs_employer" ? "(Perusahaan)" : "−";
        return `${c.name ?? "?"}: ${sign}Rp ${Number(c.amount).toLocaleString("id-ID")}`;
      })
      .join(" · ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// ─── Diff renderer ────────────────────────────────────────────────────────────
function renderDiff(oldVal: any, newVal: any) {
  if (!oldVal && !newVal) return null;

  const old = oldVal && typeof oldVal === "object" && !Array.isArray(oldVal) ? oldVal : {};
  const nw  = newVal && typeof newVal === "object" && !Array.isArray(newVal) ? newVal : {};

  const allKeys = Array.from(new Set([...Object.keys(old), ...Object.keys(nw)])).filter(
    (k) => !SKIP_FIELDS.has(k),
  );

  if (oldVal && newVal) {
    const changed = allKeys.filter((k) => JSON.stringify(old[k]) !== JSON.stringify(nw[k]));
    if (changed.length === 0)
      return <p className="text-xs text-slate-400 italic mt-2">Tidak ada perubahan data terdeteksi.</p>;
    return (
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 overflow-hidden mt-3">
        {changed.map((k) => (
          <div key={k} className="grid grid-cols-[140px_1fr_16px_1fr] items-center gap-2 px-4 py-2.5 text-xs bg-white hover:bg-slate-50">
            <span className="font-bold text-slate-500 truncate">{labelFor(k)}</span>
            <span className="text-rose-500 line-through opacity-60 truncate">{formatFieldValue(k, old[k])}</span>
            <span className="text-slate-300 text-center">→</span>
            <span className="text-emerald-600 font-bold truncate">{formatFieldValue(k, nw[k])}</span>
          </div>
        ))}
      </div>
    );
  }

  const isCreate = !!newVal;
  const data = isCreate ? nw : old;
  const keys = allKeys.filter((k) => data[k] !== null && data[k] !== undefined);
  if (keys.length === 0) return null;

  return (
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 overflow-hidden mt-3">
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
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function TabActivity({ logs, users }: { logs: any[]; users: any[] }) {
  const [actionFilter, setActionFilter] = useState("ALL");
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [showFilters,  setShowFilters]  = useState(false);

  const hasActiveFilter =
    actionFilter !== "ALL" || entityFilter !== "ALL" || dateFrom !== "" || dateTo !== "";

  const clearAllFilters = () => {
    setActionFilter("ALL");
    setEntityFilter("ALL");
    setDateFrom("");
    setDateTo("");
  };

  const toggleLog = (id: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const entityOptions = useMemo(() => {
    const base = Array.from(new Set((logs ?? []).map((l) => l.entity_type).filter(Boolean)));
    return ["ALL", ...base];
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return (logs ?? []).filter((l) => {
      if (actionFilter !== "ALL" && l.action !== actionFilter) return false;
      if (entityFilter !== "ALL" && l.entity_type !== entityFilter) return false;
      if (dateFrom && new Date(l.created_at) < new Date(dateFrom)) return false;
      if (dateTo) {
        const toEnd = new Date(dateTo);
        toEnd.setHours(23, 59, 59, 999);
        if (new Date(l.created_at) > toEnd) return false;
      }
      return true;
    });
  }, [logs, actionFilter, entityFilter, dateFrom, dateTo]);

  // Group by date label
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const log of filteredLogs) {
      const label = getDateLabel(log.created_at);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(log);
    }
    return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
  }, [filteredLogs]);

  return (
    <div className="space-y-5 pb-10">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <History size={20} className="text-slate-500" /> Log Aktivitas
            <InfoTooltip content="Menampilkan 100 aktivitas terbaru. Setiap perubahan data dicatat secara otomatis." side="right" width="w-64" />
          </h2>
          <p className="text-xs text-slate-400 font-bold mt-0.5">
            Rekaman setiap perubahan konfigurasi di cabang ini
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* result count */}
          <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">
            {filteredLogs.length} entri
          </span>
          {/* filter toggle */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              hasActiveFilter || showFilters
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/20"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            <SlidersHorizontal size={12} />
            Filter
            {hasActiveFilter && (
              <span className="w-4 h-4 rounded-full bg-white text-sky-600 text-[9px] font-black flex items-center justify-center">
                {[actionFilter !== "ALL", entityFilter !== "ALL", dateFrom !== "" || dateTo !== ""].filter(Boolean).length}
              </span>
            )}
          </button>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 text-[10px] font-black uppercase tracking-widest transition-colors"
            >
              <X size={11} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Filter panel ── */}
      <AnimatePresence initial={false}>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col sm:flex-row flex-wrap gap-3">
              {/* Action filter */}
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  Jenis Perubahan
                  <InfoTooltip content="INSERT = data baru ditambahkan. UPDATE = data diubah. DELETE = data dihapus." side="right" width="w-60" />
                </span>
                <div className="flex gap-1.5">
                  {["ALL", "CREATE", "UPDATE", "DELETE"].map((act) => (
                    <button
                      key={act}
                      type="button"
                      onClick={() => setActionFilter(act)}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        actionFilter === act
                          ? "bg-slate-900 text-white shadow-md"
                          : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {act === "ALL" ? "Semua" : ACTION_CONFIG[act]?.filterLabel ?? act}
                    </button>
                  ))}
                </div>
              </div>

              {/* Entity filter */}
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Modul</span>
                <select
                  value={entityFilter}
                  onChange={(e) => setEntityFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 outline-none focus:border-sky-400"
                >
                  {entityOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt === "ALL" ? "Semua Modul" : getEntityCfg(opt).label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date range */}
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  Rentang Tanggal
                  <InfoTooltip content="Filter berdasarkan tanggal kejadian aktivitas. Timezone: WIB (Asia/Jakarta)." side="right" width="w-60" />
                </span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2">
                    <Calendar size={11} className="text-slate-400 shrink-0" />
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="text-xs font-bold text-slate-600 bg-transparent outline-none cursor-pointer"
                    />
                  </div>
                  <span className="text-slate-300 text-xs">—</span>
                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2">
                    <Calendar size={11} className="text-slate-400 shrink-0" />
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="text-xs font-bold text-slate-600 bg-transparent outline-none cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Log list ── */}
      {grouped.length === 0 ? (
        <GlassCard variant="light" className="p-0 border-slate-100">
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
            <div className="w-20 h-20 rounded-[32px] bg-slate-50 text-slate-300 flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-slate-200">
              <Search size={36} />
            </div>
            <h3 className="font-black text-slate-700 uppercase tracking-tight">
              {hasActiveFilter ? "Tidak Ada Hasil" : "Belum Ada Rekaman"}
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-2 max-w-xs">
              {hasActiveFilter
                ? "Coba ubah atau hapus filter untuk melihat lebih banyak log."
                : "Sistem akan otomatis mencatat setiap perubahan konfigurasi cabang ini."}
            </p>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="mt-4 px-4 py-2 bg-sky-50 text-sky-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-sky-100 transition-colors"
              >
                Hapus Filter
              </button>
            )}
          </div>
        </GlassCard>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ label, items }) => (
            <div key={label}>
              {/* Date group header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl">
                  <Calendar size={11} className="text-slate-500" />
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{label}</span>
                </div>
                <div className="flex-1 h-px bg-slate-100" />
                <span className="text-[9px] font-bold text-slate-400">{items.length} perubahan</span>
              </div>

              {/* Log entries for this date group */}
              <div className="relative border-l-2 border-slate-100 ml-5 space-y-4 pb-2">
                {items.map((log, idx) => {
                  const actorName =
                    users.find((u) => u.app_users?.id === log.actor_user_id)?.app_users?.full_name ??
                    "Sistem / Admin";
                  const targetUser = users.find((u) => u.app_users?.id === log.entity_id);
                  const targetName = targetUser ? targetUser.app_users?.full_name ?? null : null;
                  const isExpanded = expandedLogs.has(log.id);
                  const hasDiff    = log.old_value || log.new_value;

                  const actionCfg = ACTION_CONFIG[log.action] ?? {
                    label: log.action, filterLabel: log.action,
                    badgeClass: "bg-slate-100 text-slate-600 border border-slate-200",
                    dotClass: "bg-slate-400 shadow-slate-200",
                    Icon: FileText,
                  };
                  const entityCfg = getEntityCfg(log.entity_type);
                  const ActionIcon = actionCfg.Icon;
                  const EntityIcon = entityCfg.Icon;

                  return (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className="relative pl-10"
                    >
                      {/* Timeline dot — action-colored */}
                      <div className={`absolute -left-3.5 top-3.5 w-7 h-7 rounded-full flex items-center justify-center shadow-lg ${actionCfg.dotClass} border-2 border-white`}>
                        <ActionIcon size={12} className="text-white" />
                      </div>

                      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">

                        {/* Main row */}
                        <button
                          type="button"
                          onClick={() => hasDiff && toggleLog(log.id)}
                          className={`w-full text-left px-5 py-4 flex items-start gap-3 transition-colors ${
                            hasDiff ? "cursor-pointer hover:bg-slate-50/60" : "cursor-default"
                          }`}
                        >
                          {/* Entity icon */}
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${entityCfg.iconClass}`}>
                            <EntityIcon size={17} />
                          </div>

                          {/* Summary + meta */}
                          <div className="flex-1 min-w-0">
                            {/* Summary sentence */}
                            <p className="text-sm font-black text-slate-800 leading-snug">
                              {getSummary(log.action, log.entity_type, targetName)}
                            </p>

                            {/* Meta row */}
                            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5">
                              {/* Action badge */}
                              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${actionCfg.badgeClass}`}>
                                {actionCfg.label}
                              </span>

                              {/* Actor */}
                              <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                                <div className="w-4 h-4 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[8px] font-black shrink-0">
                                  {actorName.charAt(0).toUpperCase()}
                                </div>
                                {actorName}
                              </span>

                              {/* Timestamp */}
                              <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                                <Clock size={10} className="text-slate-300 shrink-0" />
                                {new Intl.DateTimeFormat("id-ID", {
                                  hour: "2-digit", minute: "2-digit",
                                  day: "2-digit", month: "short",
                                }).format(new Date(log.created_at))}
                              </span>
                            </div>
                          </div>

                          {/* Expand chevron */}
                          {hasDiff && (
                            <div className="shrink-0 flex items-center gap-1 text-[9px] font-bold text-slate-400 mt-1">
                              <span className="hidden sm:inline">{isExpanded ? "Sembunyikan" : "Lihat detail"}</span>
                              <ChevronDown
                                size={14}
                                className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                              />
                            </div>
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
                              transition={{ duration: 0.18 }}
                              className="overflow-hidden"
                            >
                              <div className="px-5 pb-5 pt-1 border-t border-slate-100">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
                                  {log.action === "UPDATE" ? "Perubahan Data" : log.action === "CREATE" ? "Data yang Dibuat" : "Data yang Dihapus"}
                                </p>
                                {log.action === "UPDATE" && renderDiff(log.old_value, log.new_value)}
                                {log.action === "CREATE" && renderDiff(null, log.new_value)}
                                {log.action === "DELETE" && renderDiff(log.old_value, null)}
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
          ))}
        </div>
      )}
    </div>
  );
}
