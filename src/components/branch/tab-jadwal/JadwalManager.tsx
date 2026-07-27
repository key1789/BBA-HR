"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/shared/glass-card";
import { CalendarClock, CalendarDays, Wand2, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { PolaMingguanSection } from "@/components/branch/tab-jadwal/PolaMingguanSection";
import { RosterSection } from "@/components/branch/tab-addon";
import { generateRosterFromDefaultsAction } from "@/app/sa/branches/[id]/actions";
import { toast } from "sonner";

type JadwalSub = "pola" | "jadwal";

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/**
 * UI pengelolaan jadwal (Pola Mingguan + Roster bulan ini + generate/copy).
 * KOMPONEN BERSAMA: dipakai portal SA, Admin, dan Owner. Akses tulis ditentukan
 * server (resolveScheduleWriteAccess) — komponen ini tak melakukan cek peran.
 * Toggle delegasi (ScheduleAccessSection) SENGAJA di luar komponen ini (SA-only).
 */
export function JadwalManager({
  branchId, users, shifts, roster, shiftDefaults, currentMonth, currentYear,
}: {
  branchId: string;
  users: any[];
  shifts: any[];
  roster: any[];
  shiftDefaults: any[];
  currentMonth: number;
  currentYear: number;
}) {
  const [jadwalSub, setJadwalSub] = useState<JadwalSub>("jadwal");
  const [isGenerating, startGenerate] = useTransition();
  const [showGenChoice, setShowGenChoice] = useState(false);

  const hasRoster = roster.length > 0;
  const hasDefaults = shiftDefaults.length > 0;

  const runGenerate = (mode: "overwrite" | "fill_empty") => {
    setShowGenChoice(false);
    startGenerate(async () => {
      const fd = new FormData();
      fd.append("tenantId", branchId);
      fd.append("month", currentMonth.toString());
      fd.append("year", currentYear.toString());
      fd.append("mode", mode);
      const res = await generateRosterFromDefaultsAction(null, fd);
      if (res.success) toast.success(res.message);
      else toast.error(res.error ?? "Gagal membuat jadwal.");
    });
  };

  const handleGenerate = () => {
    if (hasRoster) setShowGenChoice(true);
    else runGenerate("overwrite");
  };

  const SUBS: { id: JadwalSub; label: string; Icon: React.ElementType }[] = [
    { id: "pola", label: "Pola Mingguan", Icon: CalendarClock },
    { id: "jadwal", label: "Jadwal Bulan Ini", Icon: CalendarDays },
  ];

  return (
    <GlassCard variant="light" className="p-5 sm:p-7 bg-white border-slate-200/60 shadow-xl shadow-slate-200/50">

      {/* Sub-control */}
      <div className="flex gap-1 p-1 bg-slate-50 rounded-2xl border border-slate-100 mb-7">
        {SUBS.map(({ id, label, Icon }) => {
          const isActive = jadwalSub === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setJadwalSub(id)}
              className={`relative flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                isActive ? "text-sky-600" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="jadwalSubSeg"
                  className="absolute inset-0 bg-white rounded-xl border border-sky-100 shadow-sm"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                />
              )}
              <Icon size={13} className="relative z-10 shrink-0" />
              <span className="relative z-10 hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={jadwalSub}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {/* ── POLA MINGGUAN ── */}
          {jadwalSub === "pola" && (
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
          {jadwalSub === "jadwal" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {hasRoster ? (
                    <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-xl">
                      <CheckCircle2 size={11} />
                      {roster.length} jadwal tersimpan — {MONTH_NAMES[currentMonth - 1]} {currentYear}
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
                  {isGenerating ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                  {isGenerating ? "Sedang membuat…" : "Buat Jadwal Otomatis"}
                </button>
              </div>

              {!hasDefaults && (
                <div className="p-4 bg-amber-50/60 border border-amber-100 rounded-2xl flex gap-3 items-start">
                  <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 font-medium leading-relaxed">
                    Tombol <span className="font-black">&quot;Buat Jadwal Otomatis&quot;</span> aktif setelah pola mingguan
                    crew diatur di{" "}
                    <button
                      type="button"
                      onClick={() => setJadwalSub("pola")}
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
        </motion.div>
      </AnimatePresence>

      {/* Pilihan mode generate (saat jadwal sudah ada) */}
      {showGenChoice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowGenChoice(false)} />
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-sky-50 flex items-center justify-center shrink-0">
                <Wand2 size={22} className="text-sky-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-base">Buat Jadwal dari Pola</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Jadwal {MONTH_NAMES[currentMonth - 1]} {currentYear} sudah ada ({roster.length} entri). Pilih cara mengisi.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => runGenerate("fill_empty")}
              className="w-full text-left p-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 transition-all"
            >
              <p className="text-sm font-black text-emerald-700">Isi yang kosong saja</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Editan manual yang sudah ada dipertahankan. Hanya hari kosong yang diisi dari pola.</p>
            </button>

            <button
              type="button"
              onClick={() => runGenerate("overwrite")}
              className="w-full text-left p-4 rounded-2xl border-2 border-slate-200 bg-white hover:border-rose-200 hover:bg-rose-50/40 transition-all"
            >
              <p className="text-sm font-black text-slate-700">Timpa semua</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Hapus seluruh jadwal bulan ini lalu buat ulang dari pola. Editan manual hilang.</p>
            </button>

            <button
              type="button"
              onClick={() => setShowGenChoice(false)}
              className="w-full py-2.5 rounded-xl font-bold text-sm text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Batal
            </button>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
