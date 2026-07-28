"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, CalendarDays, Wallet } from "lucide-react";
import { TabShift } from "./tab-shift";
import { TabPayroll } from "./tab-payroll";
import { ScheduleAccessSection } from "@/components/branch/tab-jadwal/ScheduleAccessSection";
import { JadwalManager } from "@/components/branch/tab-jadwal/JadwalManager";

type TopSeg = "shift" | "jadwal" | "gaji";

export function TabOperasional({
  branchId,
  shifts,
  users,
  roster,
  approvedLeaveKeys,
  payrollConfigs,
  currentMonth,
  currentYear,
  isAbsensiEnabled,
  isPayrollEnabled,
  allowOwnerInput,
  allowAdminInput,
  allowOwnerSchedule,
  allowAdminSchedule,
  defaultWorkingDays,
}: {
  branchId: string;
  shifts: any[];
  users: any[];
  roster: any[];
  approvedLeaveKeys?: string[];
  payrollConfigs: any[];
  currentMonth: number;
  currentYear: number;
  isAbsensiEnabled: boolean;
  isPayrollEnabled: boolean;
  allowOwnerInput: boolean;
  allowAdminInput: boolean;
  allowOwnerSchedule: boolean;
  allowAdminSchedule: boolean;
  defaultWorkingDays: number;
}) {
  const segments: { id: TopSeg; label: string; Icon: React.ElementType }[] = [
    { id: "shift", label: "Master Shift", Icon: Clock },
    ...(isAbsensiEnabled ? [{ id: "jadwal" as TopSeg, label: "Jadwal", Icon: CalendarDays }] : []),
    ...(isPayrollEnabled ? [{ id: "gaji" as TopSeg, label: "Setup Gaji", Icon: Wallet }] : []),
  ];

  const [activeTop, setActiveTop] = useState<TopSeg>("shift");
  // if the active segment was removed (addon toggled off), fall back to shift
  const resolvedTop: TopSeg = segments.some(s => s.id === activeTop) ? activeTop : "shift";

  return (
    <div className="space-y-5 pb-10">

      {/* ── Top segment control ── */}
      <div className="flex gap-1 p-1.5 bg-white rounded-2xl border border-slate-100 shadow-lg shadow-slate-200/40">
        {segments.map(({ id, label, Icon }) => {
          const isActive = resolvedTop === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTop(id)}
              className={`relative flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                isActive ? "text-sky-600" : "text-slate-400 hover:text-slate-700"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="operasionalSeg"
                  className="absolute inset-0 bg-sky-50 rounded-xl border border-sky-100 shadow-sm"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                />
              )}
              <div className={`relative z-10 w-5 h-5 rounded-md flex items-center justify-center transition-all duration-300 ${
                isActive ? "bg-sky-600 text-white shadow-md shadow-sky-600/30" : "bg-slate-50 text-slate-400"
              }`}>
                <Icon size={12} />
              </div>
              <span className="relative z-10 hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Segment content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={resolvedTop}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {resolvedTop === "shift" && (
            <TabShift branchId={branchId} shifts={shifts} />
          )}
          {resolvedTop === "jadwal" && (
            <JadwalSection
              branchId={branchId}
              users={users}
              shifts={shifts}
              roster={roster}
              approvedLeaveKeys={approvedLeaveKeys}
              currentMonth={currentMonth}
              currentYear={currentYear}
              allowOwnerSchedule={allowOwnerSchedule}
              allowAdminSchedule={allowAdminSchedule}
            />
          )}
          {resolvedTop === "gaji" && (
            <TabPayroll
              branchId={branchId}
              users={users}
              payrollConfigs={payrollConfigs}
              allowOwnerInput={allowOwnerInput}
              allowAdminInput={allowAdminInput}
              defaultWorkingDays={defaultWorkingDays}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Jadwal Section
// Extracted from TabJadwalAbsensi — Pola + Jadwal only, no Rekap Kehadiran.
// Rekap Kehadiran lives in /owner/data-karyawan (modal Jadwal & Absensi per karyawan).
// ─────────────────────────────────────────────────────────


function JadwalSection({
  branchId, users, shifts, roster, approvedLeaveKeys, currentMonth, currentYear,
  allowOwnerSchedule, allowAdminSchedule,
}: {
  branchId: string;
  users: any[];
  shifts: any[];
  roster: any[];
  approvedLeaveKeys?: string[];
  currentMonth: number;
  currentYear: number;
  allowOwnerSchedule: boolean;
  allowAdminSchedule: boolean;
}) {
  return (
    <div className="space-y-5">
      {/* Delegasi kelola jadwal ke admin/owner (izin SA) — SA-only, di luar JadwalManager */}
      <ScheduleAccessSection
        branchId={branchId}
        allowAdminSchedule={allowAdminSchedule}
        allowOwnerSchedule={allowOwnerSchedule}
      />
      <JadwalManager
        branchId={branchId}
        users={users}
        shifts={shifts}
        roster={roster}
        approvedLeaveKeys={approvedLeaveKeys}
        currentMonth={currentMonth}
        currentYear={currentYear}
      />
    </div>
  );
}
