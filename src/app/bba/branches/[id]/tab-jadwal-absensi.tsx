"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useTransition } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import {
  CalendarDays,
  Wand2,
  Loader2,
  Clock,
  CheckCircle2,
  AlertCircle,
  CalendarClock,
  ClipboardList,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { PolaMingguanSection } from "@/components/branch/tab-jadwal/PolaMingguanSection";
import { RosterSection } from "@/components/branch/tab-addon";
import { generateRosterFromDefaultsAction } from "./actions";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

type Segment = "pola" | "jadwal" | "rekap";

const SEGMENTS: { id: Segment; label: string; icon: React.ElementType }[] = [
  { id: "pola", label: "Pola Mingguan", icon: CalendarClock },
  { id: "jadwal", label: "Jadwal Bulan Ini", icon: CalendarDays },
  { id: "rekap", label: "Rekap Kehadiran", icon: ClipboardList },
];

// ─────────────────────────────────────────────────────────
// Rekap Kehadiran section (inline)
// ─────────────────────────────────────────────────────────

function RekapKehadiranSection({
  users,
  attendanceLogs,
  roster,
  currentMonth,
  currentYear,
}: {
  users: any[];
  attendanceLogs: any[];
  roster: any[];
  currentMonth: number;
  currentYear: number;
}) {
  const [filterUserId, setFilterUserId] = useState<string>("");

  const userById: Record<string, string> = {};
  users.forEach((u) => {
    if (u.app_users?.id) userById[u.app_users.id] = u.app_users.full_name;
  });

  // Set of scheduled user+date keys
  const scheduledKeys = new Set(
    roster.map((r) => `${r.user_id}|${String(r.schedule_date).slice(0, 10)}`),
  );

  const filtered = filterUserId
    ? attendanceLogs.filter((l) => l.user_id === filterUserId)
    : attendanceLogs;

  const crewWithLogs = Array.from(new Set(attendanceLogs.map((l) => l.user_id)));

  const formatTime = (ts: string | null) => {
    if (!ts) return "—";
    return new Date(ts).toLocaleTimeString("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (ts: string) =>
    new Date(ts).toLocaleDateString("id-ID", {
      timeZone: "Asia/Jakarta",
      weekday: "short",
      day: "numeric",
      month: "short",
    });

  const getDuration = (clockIn: string, clockOut: string | null) => {
    if (!clockOut) return "—";
    const diff = new Date(clockOut).getTime() - new Date(clockIn).getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}j ${m}m`;
  };

  const monthNames = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];

  if (attendanceLogs.length === 0) {
    return (
      <div className="py-16 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300 mx-auto">
          <ClipboardList size={24} />
        </div>
        <p className="text-sm font-black text-slate-400 uppercase tracking-widest">
          Belum ada data kehadiran
        </p>
        <p className="text-xs text-slate-400 font-medium">
          {monthNames[currentMonth - 1]} {currentYear}
        </p>
      </div>
    );
  }

  const unscheduledCount = filtered.filter((l) => {
    const dateKey = new Date(l.clock_in_time)
      .toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    return !scheduledKeys.has(`${l.user_id}|${dateKey}`);
  }).length;

  return (
    <div className="space-y-5">
      {/* Summary + filter */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-sm font-black text-slate-800">
            {filtered.length} absensi
          </div>
          {unscheduledCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1 rounded-lg">
              <AlertCircle size={10} /> {unscheduledCount} di luar jadwal
            </span>
          )}
        </div>
        <select
          value={filterUserId}
          onChange={(e) => setFilterUserId(e.target.value)}
          className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black text-slate-700 outline-none focus:border-sky-300 transition-all"
        >
          <option value="">Semua Crew</option>
          {crewWithLogs.map((uid) => (
            <option key={uid} value={uid}>
              {userById[uid] ?? uid}
            </option>
          ))}
        </select>
      </div>

      {/* Log list */}
      <div className="space-y-2">
        {filtered.map((log) => {
          const dateKey = new Date(log.clock_in_time)
            .toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
          const isUnscheduled = !scheduledKeys.has(`${log.user_id}|${dateKey}`);
          const crewName = userById[log.user_id] ?? "Crew tidak dikenal";

          return (
            <div
              key={log.id}
              className={`p-4 rounded-2xl border transition-all ${
                isUnscheduled
                  ? "bg-amber-50/50 border-amber-100"
                  : "bg-white border-slate-100"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      isUnscheduled ? "bg-amber-100 text-amber-600" : "bg-emerald-50 text-emerald-600"
                    }`}
                  >
                    <Clock size={14} />
                  </div>
                  <div>
                    <p className="font-black text-slate-800 text-sm uppercase tracking-tight">
                      {crewName}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                      {formatDate(log.clock_in_time)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 pl-11 sm:pl-0">
                  <div className="text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Masuk</p>
                    <p className="text-sm font-black text-slate-800">{formatTime(log.clock_in_time)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Keluar</p>
                    <p className="text-sm font-black text-slate-500">{formatTime(log.clock_out_time)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Durasi</p>
                    <p className="text-sm font-black text-slate-500">
                      {getDuration(log.clock_in_time, log.clock_out_time)}
                    </p>
                  </div>
                  <div>
                    {isUnscheduled ? (
                      <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-2 py-1 rounded-lg">
                        Di luar jadwal
                      </span>
                    ) : (
                      <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                        Sesuai jadwal
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {isUnscheduled && log.notes && (
                <p className="mt-2 pl-11 text-xs text-amber-700 font-medium bg-amber-50 rounded-xl px-3 py-2 border border-amber-100">
                  📋 {log.notes}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Main Tab Component
// ─────────────────────────────────────────────────────────

export function TabJadwalAbsensi({
  branchId,
  users,
  shifts,
  roster,
  shiftDefaults,
  attendanceLogs,
  currentMonth,
  currentYear,
}: {
  branchId: string;
  users: any[];
  shifts: any[];
  roster: any[];
  shiftDefaults: any[];
  attendanceLogs: any[];
  currentMonth: number;
  currentYear: number;
}) {
  const [activeSegment, setActiveSegment] = useState<Segment>("jadwal");
  const [isGenerating, startGenerateTransition] = useTransition();

  const monthNames = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  const hasRoster = roster.length > 0;
  const hasDefaults = shiftDefaults.length > 0;

  const handleGenerate = () => {
    startGenerateTransition(async () => {
      const fd = new FormData();
      fd.append("tenantId", branchId);
      fd.append("month", currentMonth.toString());
      fd.append("year", currentYear.toString());
      const res = await generateRosterFromDefaultsAction(null, fd);
      if (res.success) toast.success(res.message);
      else toast.error(res.error ?? "Gagal membuat jadwal.");
    });
  };

  return (
    <div className="space-y-5 pb-10">
      <GlassCard variant="light" className="p-5 sm:p-7 bg-white border-slate-200/60 shadow-xl shadow-slate-200/50">
        {/* Header */}
        <div className="flex items-center gap-3 mb-7">
          <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-lg shadow-slate-900/20 rotate-3 shrink-0">
            <CalendarDays size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight leading-none">
              Jadwal & Absensi
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Kelola pola kerja, jadwal bulanan, dan rekap kehadiran crew.
            </p>
          </div>
        </div>

        {/* Segmented control */}
        <div className="flex gap-1 p-1 bg-slate-50 rounded-2xl border border-slate-100 mb-7">
          {SEGMENTS.map((seg) => {
            const Icon = seg.icon;
            const isActive = activeSegment === seg.id;
            return (
              <button
                key={seg.id}
                type="button"
                onClick={() => setActiveSegment(seg.id)}
                className={`relative flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                  isActive ? "text-sky-600" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="jadwalSegment"
                    className="absolute inset-0 bg-white rounded-xl border border-sky-100 shadow-sm"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                  />
                )}
                <Icon size={13} className="relative z-10 shrink-0" />
                <span className="relative z-10 hidden sm:inline">{seg.label}</span>
              </button>
            );
          })}
        </div>

        {/* Segment content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSegment}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {/* ── POLA MINGGUAN ── */}
            {activeSegment === "pola" && (
              <div className="space-y-5">
                <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl flex gap-3 items-start">
                  <CalendarClock size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-700 font-medium leading-relaxed">
                    Atur <span className="font-black text-indigo-700">shift dan hari kerja default</span> masing-masing crew.
                    Jadwal bulan ini akan otomatis dibuat dari pola ini. Bisa diubah kapan saja.
                  </p>
                </div>
                <PolaMingguanSection
                  branchId={branchId}
                  users={users}
                  shifts={shifts}
                  shiftDefaults={shiftDefaults}
                />
              </div>
            )}

            {/* ── JADWAL BULAN INI ── */}
            {activeSegment === "jadwal" && (
              <div className="space-y-6">
                {/* Status bar + action button */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {hasRoster ? (
                      <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-xl">
                        <CheckCircle2 size={11} />
                        {roster.length} jadwal tersimpan — {monthNames[currentMonth - 1]} {currentYear}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                        <AlertCircle size={11} />
                        Jadwal bulan ini belum ada
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={isGenerating || !hasDefaults}
                    title={!hasDefaults ? "Atur pola mingguan crew terlebih dahulu" : undefined}
                    className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-sky-600/20 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-60 disabled:pointer-events-none shrink-0"
                  >
                    {isGenerating ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Wand2 size={13} />
                    )}
                    {isGenerating ? "Sedang membuat…" : "Buat Jadwal Otomatis"}
                  </button>
                </div>

                {!hasDefaults && (
                  <div className="p-4 bg-amber-50/60 border border-amber-100 rounded-2xl flex gap-3 items-start">
                    <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 font-medium leading-relaxed">
                      Tombol <span className="font-black">"Buat Jadwal Otomatis"</span> aktif setelah pola mingguan crew diatur di tab{" "}
                      <button
                        type="button"
                        onClick={() => setActiveSegment("pola")}
                        className="font-black text-amber-700 underline underline-offset-2 hover:no-underline"
                      >
                        Pola Mingguan
                      </button>
                      .
                    </p>
                  </div>
                )}

                <RosterSection
                  branchId={branchId}
                  currentMonth={currentMonth}
                  currentYear={currentYear}
                  users={users}
                  shifts={shifts}
                  roster={roster}
                />
              </div>
            )}

            {/* ── REKAP KEHADIRAN ── */}
            {activeSegment === "rekap" && (
              <RekapKehadiranSection
                users={users}
                attendanceLogs={attendanceLogs}
                roster={roster}
                currentMonth={currentMonth}
                currentYear={currentYear}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </GlassCard>
    </div>
  );
}
