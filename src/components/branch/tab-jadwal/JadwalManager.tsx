"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { GlassCard } from "@/components/shared/glass-card";
import { CalendarDays, AlertCircle, CheckCircle2 } from "lucide-react";
import { RosterSection } from "@/components/branch/tab-addon";

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/**
 * UI pengelolaan roster bulan ini (isi manual per sel). KOMPONEN BERSAMA: dipakai
 * portal SA, Admin, dan Owner. Akses tulis ditentukan server (resolveScheduleWriteAccess) —
 * komponen ini tak melakukan cek peran. Toggle delegasi (ScheduleAccessSection) SENGAJA
 * di luar komponen ini (SA-only).
 */
export function JadwalManager({
  branchId, users, shifts, roster, currentMonth, currentYear, approvedLeaveKeys,
}: {
  branchId: string;
  users: any[];
  shifts: any[];
  roster: any[];
  currentMonth: number;
  currentYear: number;
  /** Kunci `${user_id}|${YYYY-MM-DD}` izin disetujui — overlay penanda "IZIN" di sel roster. */
  approvedLeaveKeys?: string[];
}) {
  const hasRoster = roster.length > 0;

  return (
    <GlassCard variant="light" className="p-5 sm:p-7 bg-white border-slate-200/60 shadow-xl shadow-slate-200/50">
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-sky-600 shrink-0" />
          {hasRoster ? (
            <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-xl">
              <CheckCircle2 size={11} />
              {roster.length} jadwal tersimpan — {MONTH_NAMES[currentMonth - 1]} {currentYear}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
              <AlertCircle size={11} />
              Jadwal bulan ini belum ada — isi shift tiap crew di tabel di bawah
            </span>
          )}
        </div>

        <RosterSection
          branchId={branchId}
          currentMonth={currentMonth}
          currentYear={currentYear}
          users={users}
          shifts={shifts}
          roster={roster}
          approvedLeaveKeys={approvedLeaveKeys}
        />
      </div>
    </GlassCard>
  );
}
