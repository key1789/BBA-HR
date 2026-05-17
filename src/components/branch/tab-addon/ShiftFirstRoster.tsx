"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useMemo, useTransition, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, ChevronDown, Clock, Users, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { applyShiftTemplateAction } from "@/app/bba/branches/[id]/actions";
import { isBranchOperationalPersonnel } from "@/lib/branch-personnel";

// ─── Types ────────────────────────────────────────────────────────────────────

type DateOverride = { date: string; include: boolean };
type EmployeeAssignment = { userId: string; weekdays: boolean[]; overrides: DateOverride[] };
type ShiftAssignment = { shiftId: string; employees: EmployeeAssignment[] };
type ConflictEntry = { userId: string; date: string; shiftIds: string[] };

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const MONTH_NAMES = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

const SHIFT_COLORS = [
  { bg: "bg-sky-600",    light: "bg-sky-50",    border: "border-sky-200",    text: "text-sky-600",    badge: "bg-sky-100 text-sky-700"    },
  { bg: "bg-amber-500",  light: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-600",  badge: "bg-amber-100 text-amber-700"  },
  { bg: "bg-emerald-600",light: "bg-emerald-50",border: "border-emerald-200",text: "text-emerald-600",badge: "bg-emerald-100 text-emerald-700"},
  { bg: "bg-violet-600", light: "bg-violet-50", border: "border-violet-200", text: "text-violet-600", badge: "bg-violet-100 text-violet-700" },
  { bg: "bg-rose-600",   light: "bg-rose-50",   border: "border-rose-200",   text: "text-rose-600",   badge: "bg-rose-100 text-rose-700"   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toWeekdayIdx(dateStr: string) {
  return (new Date(dateStr).getDay() + 6) % 7; // Mon=0, Sun=6
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function dateStr(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function generateSchedule(
  assignments: ShiftAssignment[],
  month: number,
  year: number
): { userId: string; date: string; shiftId: string }[] {
  const days = getDaysInMonth(year, month);
  const entries: { userId: string; date: string; shiftId: string }[] = [];

  for (const sa of assignments) {
    for (const emp of sa.employees) {
      for (let d = 1; d <= days; d++) {
        const date = dateStr(year, month, d);
        const wd = toWeekdayIdx(date);
        const override = emp.overrides.find((o) => o.date === date);
        const isOn = override ? override.include : emp.weekdays[wd];
        if (isOn) entries.push({ userId: emp.userId, date, shiftId: sa.shiftId });
      }
    }
  }
  return entries;
}

function inferTemplateFromRoster(
  roster: any[],
  month: number,
  year: number
): ShiftAssignment[] {
  const days = getDaysInMonth(year, month);

  // Count how many of each weekday exist in this month
  const wdTotals = Array(7).fill(0);
  for (let d = 1; d <= days; d++) {
    wdTotals[toWeekdayIdx(dateStr(year, month, d))]++;
  }

  // Group: shift_id → user_id → dates[]
  const byShift = new Map<string, Map<string, string[]>>();
  for (const entry of roster) {
    if (!entry.shift_id || entry.is_off) continue;
    if (!byShift.has(entry.shift_id)) byShift.set(entry.shift_id, new Map());
    const byUser = byShift.get(entry.shift_id)!;
    if (!byUser.has(entry.user_id)) byUser.set(entry.user_id, []);
    byUser.get(entry.user_id)!.push(entry.schedule_date);
  }

  return Array.from(byShift.entries()).map(([shiftId, byUser]) => ({
    shiftId,
    employees: Array.from(byUser.entries()).map(([userId, dates]) => {
      const wdCounts = Array(7).fill(0);
      for (const d of dates) wdCounts[toWeekdayIdx(d)]++;
      // Weekday ON if ≥50% of that weekday's occurrences in month are covered
      const weekdays = wdCounts.map((c, wd) => wdTotals[wd] > 0 && c / wdTotals[wd] >= 0.5);
      // Overrides: dates that deviate from the inferred pattern
      const overrides: DateOverride[] = [];
      for (let d = 1; d <= days; d++) {
        const date = dateStr(year, month, d);
        const baseline = weekdays[toWeekdayIdx(date)];
        const actual = dates.includes(date);
        if (baseline !== actual) overrides.push({ date, include: actual });
      }
      return { userId, weekdays, overrides };
    }),
  }));
}

// ─── AddOverrideRow ───────────────────────────────────────────────────────────

function AddOverrideRow({
  month,
  year,
  onAdd,
}: {
  month: number;
  year: number;
  onAdd: (date: string, include: boolean) => void;
}) {
  const [date, setDate] = useState("");
  const [include, setInclude] = useState(true);
  const min = dateStr(year, month, 1);
  const max = dateStr(year, month, getDaysInMonth(year, month));

  return (
    <div className="flex items-center gap-2 pt-1 flex-wrap">
      <input
        type="date"
        value={date}
        min={min}
        max={max}
        onChange={(e) => setDate(e.target.value)}
        className="text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-sky-400"
      />
      <select
        value={include ? "include" : "exclude"}
        onChange={(e) => setInclude(e.target.value === "include")}
        className="text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none"
      >
        <option value="include">+ Tambah masuk</option>
        <option value="exclude">− Libur hari ini</option>
      </select>
      <button
        type="button"
        onClick={() => { if (!date) return; onAdd(date, include); setDate(""); }}
        disabled={!date}
        className="px-2.5 py-1.5 bg-sky-600 text-white rounded-lg text-[10px] font-black disabled:opacity-40 hover:bg-sky-700 transition-colors"
      >
        Tambah
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ShiftFirstRoster({
  branchId,
  shifts,
  users,
  roster,
  currentMonth,
  currentYear,
  onBusyChange,
}: {
  branchId: string;
  shifts: any[];
  users: any[];
  roster: any[];
  currentMonth: number;
  currentYear: number;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [assignments, setAssignments] = useState<ShiftAssignment[]>(() =>
    inferTemplateFromRoster(roster, currentMonth, currentYear)
  );

  useEffect(() => {
    setAssignments(inferTemplateFromRoster(roster, currentMonth, currentYear));
  }, [roster, currentMonth, currentYear]);

  const [expandedOverrides, setExpandedOverrides] = useState<Set<string>>(new Set());
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const operationalUsers = useMemo(
    () => users.filter((u: any) => isBranchOperationalPersonnel(u) && u.app_users?.id),
    [users],
  );

  // ── Derived state ───────────────────────────────────────────────────────────

  const schedule = useMemo(
    () => generateSchedule(assignments, currentMonth, currentYear),
    [assignments, currentMonth, currentYear],
  );

  const conflicts = useMemo<ConflictEntry[]>(() => {
    const seen = new Map<string, string[]>();
    for (const e of schedule) {
      const key = `${e.userId}__${e.date}`;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key)!.push(e.shiftId);
    }
    return Array.from(seen.entries())
      .filter(([, s]) => s.length > 1)
      .map(([key, shiftIds]) => {
        const [userId, date] = key.split("__");
        return { userId, date, shiftIds };
      });
  }, [schedule]);

  const employeeWorkDays = useMemo(() => {
    const counts: Record<string, number> = {};
    const seen = new Set<string>();
    for (const e of schedule) {
      const key = `${e.userId}__${e.date}`;
      if (!seen.has(key)) {
        seen.add(key);
        counts[e.userId] = (counts[e.userId] ?? 0) + 1;
      }
    }
    return counts;
  }, [schedule]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const getAssignment = (shiftId: string) => assignments.find((a) => a.shiftId === shiftId);
  const getEmpAssignment = (shiftId: string, userId: string) =>
    getAssignment(shiftId)?.employees.find((e) => e.userId === userId);

  const setEmpField = <K extends keyof EmployeeAssignment>(
    shiftId: string, userId: string, key: K, value: EmployeeAssignment[K],
  ) => {
    setAssignments((prev) =>
      prev.map((a) =>
        a.shiftId !== shiftId ? a : {
          ...a,
          employees: a.employees.map((e) => e.userId !== userId ? e : { ...e, [key]: value }),
        },
      ),
    );
  };

  const addEmployee = (shiftId: string, userId: string) => {
    setAssignments((prev) => {
      const newEmp: EmployeeAssignment = {
        userId,
        weekdays: [true, true, true, true, true, false, false], // Mon–Fri default
        overrides: [],
      };
      const existing = prev.find((a) => a.shiftId === shiftId);
      if (existing) {
        return prev.map((a) =>
          a.shiftId === shiftId ? { ...a, employees: [...a.employees, newEmp] } : a,
        );
      }
      return [...prev, { shiftId, employees: [newEmp] }];
    });
    setAddingTo(null);
  };

  const removeEmployee = (shiftId: string, userId: string) => {
    setAssignments((prev) =>
      prev.map((a) =>
        a.shiftId !== shiftId ? a : { ...a, employees: a.employees.filter((e) => e.userId !== userId) },
      ),
    );
  };

  const toggleWeekday = (shiftId: string, userId: string, wdIdx: number) => {
    const emp = getEmpAssignment(shiftId, userId);
    if (!emp) return;
    const next = [...emp.weekdays];
    next[wdIdx] = !next[wdIdx];
    setEmpField(shiftId, userId, "weekdays", next);
  };

  const addOverride = (shiftId: string, userId: string, date: string, include: boolean) => {
    const emp = getEmpAssignment(shiftId, userId);
    if (!emp) return;
    setEmpField(shiftId, userId, "overrides", [
      ...emp.overrides.filter((o) => o.date !== date),
      { date, include },
    ]);
  };

  const removeOverride = (shiftId: string, userId: string, date: string) => {
    const emp = getEmpAssignment(shiftId, userId);
    if (!emp) return;
    setEmpField(shiftId, userId, "overrides", emp.overrides.filter((o) => o.date !== date));
  };

  const toggleOverrideExpand = (key: string) => {
    setExpandedOverrides((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // ── Apply ───────────────────────────────────────────────────────────────────

  const handleApply = () => {
    if (conflicts.length > 0) {
      toast.error(`Ada ${conflicts.length} konflik jadwal. Selesaikan dulu sebelum menerapkan.`);
      return;
    }
    const fd = new FormData();
    fd.set("branchId", branchId);
    fd.set("month", String(currentMonth));
    fd.set("year", String(currentYear));
    fd.set("entriesJson", JSON.stringify(schedule));

    onBusyChange?.(true);
    startTransition(async () => {
      const result = await applyShiftTemplateAction(null, fd);
      onBusyChange?.(false);
      if ("error" in result && result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${schedule.length} jadwal shift berhasil diterapkan!`);
      }
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-black text-slate-800 text-base uppercase tracking-tight">Roster Jadwal Shift</h3>
          <p className="text-[11px] text-slate-500 font-bold mt-0.5">
            {MONTH_NAMES[currentMonth - 1]} {currentYear} · Assign shift per karyawan
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {conflicts.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-[10px] font-black uppercase tracking-widest">
              <AlertTriangle size={12} /> {conflicts.length} konflik
            </div>
          )}
          <button
            type="button"
            onClick={handleApply}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-sky-700 transition-colors disabled:opacity-60 shadow-lg shadow-sky-600/20"
          >
            {isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            Terapkan ke Bulan Ini
          </button>
        </div>
      </div>

      {/* Conflicts banner */}
      {conflicts.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-1.5">
          <p className="text-[10px] font-black text-rose-700 uppercase tracking-widest">Konflik Jadwal — Selesaikan Sebelum Terapkan</p>
          {conflicts.slice(0, 5).map((c) => {
            const user = operationalUsers.find((u: any) => u.app_users.id === c.userId);
            const shiftNames = c.shiftIds.map((sid) => shifts.find((s) => s.id === sid)?.shift_name ?? sid).join(" & ");
            return (
              <p key={`${c.userId}_${c.date}`} className="text-[10px] text-rose-600 font-bold">
                • {user?.app_users?.full_name ?? "Karyawan"} · {c.date} · di {shiftNames} sekaligus
              </p>
            );
          })}
          {conflicts.length > 5 && (
            <p className="text-[10px] text-rose-400 font-bold">+{conflicts.length - 5} konflik lainnya…</p>
          )}
        </div>
      )}

      {/* Shift panels */}
      {shifts.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl">
          <Clock size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="font-black text-slate-600 text-sm uppercase">Belum Ada Shift</p>
          <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider">
            Buat master shift dulu di tab "Pengaturan Shift"
          </p>
        </div>
      ) : (
        shifts.map((shift, shiftIdx) => {
          const color = SHIFT_COLORS[shiftIdx % SHIFT_COLORS.length];
          const assignment = getAssignment(shift.id);
          const assignedEmps = assignment?.employees ?? [];
          const availableUsers = operationalUsers.filter(
            (u: any) => !assignedEmps.find((e) => e.userId === u.app_users.id),
          );

          // Duration
          const [sh, sm] = (shift.start_time as string).split(":").map(Number);
          const [eh, em] = (shift.end_time as string).split(":").map(Number);
          let endMins = eh * 60 + em;
          if (endMins <= sh * 60 + sm) endMins += 24 * 60;
          const totalMins = endMins - (sh * 60 + sm);
          const durLabel = `${Math.floor(totalMins / 60)}j${totalMins % 60 > 0 ? ` ${totalMins % 60}m` : ""}`;

          return (
            <div key={shift.id} className={`rounded-2xl border-2 ${color.border} overflow-hidden`}>
              {/* Shift header */}
              <div className={`px-5 py-4 ${color.light} flex items-center justify-between`}>
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl ${color.bg} text-white flex items-center justify-center shrink-0`}>
                    <Clock size={16} />
                  </div>
                  <div>
                    <p className="font-black text-slate-800 text-sm">{shift.shift_name}</p>
                    <p className={`text-[10px] font-bold ${color.text}`}>
                      {(shift.start_time as string).slice(0, 5)} – {(shift.end_time as string).slice(0, 5)} · {durLabel}
                    </p>
                  </div>
                </div>
                <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg ${color.badge}`}>
                  {assignedEmps.length} karyawan
                </span>
              </div>

              {/* Employee rows */}
              <div className="divide-y divide-slate-100">
                {assignedEmps.map((emp) => {
                  const user = operationalUsers.find((u: any) => u.app_users.id === emp.userId);
                  if (!user) return null;
                  const overrideKey = `${shift.id}_${emp.userId}`;
                  const isExpanded = expandedOverrides.has(overrideKey);
                  const hasConflict = conflicts.some(
                    (c) => c.userId === emp.userId && c.shiftIds.includes(shift.id),
                  );
                  const workDays = employeeWorkDays[emp.userId] ?? 0;
                  const activeDays = emp.weekdays.filter(Boolean).length;

                  return (
                    <div key={emp.userId} className={`px-5 py-4 ${hasConflict ? "bg-rose-50/40" : "bg-white"}`}>
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          {/* Name row */}
                          <div className="flex items-center gap-2 mb-3">
                            <p className="font-black text-slate-800 text-sm truncate">{user.app_users.full_name}</p>
                            <span className="text-[9px] font-bold text-slate-400 uppercase shrink-0">
                              {user.role.replace("_", " ")}
                            </span>
                            {hasConflict && <AlertTriangle size={12} className="text-rose-500 shrink-0" />}
                          </div>

                          {/* Weekday toggles */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {WEEKDAY_LABELS.map((label, wdIdx) => (
                              <button
                                key={wdIdx}
                                type="button"
                                onClick={() => toggleWeekday(shift.id, emp.userId, wdIdx)}
                                className={`w-9 h-9 rounded-xl text-[10px] font-black transition-all ${
                                  emp.weekdays[wdIdx]
                                    ? `${color.bg} text-white shadow-sm`
                                    : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                            <span className="text-[10px] font-bold text-slate-400 ml-1">
                              ~{activeDays}×/minggu
                            </span>
                          </div>

                          {/* Override section */}
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => toggleOverrideExpand(overrideKey)}
                              className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-sky-600 uppercase tracking-widest transition-colors"
                            >
                              <ChevronDown
                                size={11}
                                className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                              />
                              Override tanggal
                              {emp.overrides.length > 0 && (
                                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-black ${color.badge}`}>
                                  {emp.overrides.length}
                                </span>
                              )}
                            </button>

                            <AnimatePresence initial={false}>
                              {isExpanded && (
                                <motion.div
                                  key="overrides"
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="mt-2 space-y-2 pl-4 border-l-2 border-slate-100">
                                    {emp.overrides.length === 0 && (
                                      <p className="text-[10px] text-slate-400 italic">Belum ada override.</p>
                                    )}
                                    {emp.overrides
                                      .slice()
                                      .sort((a, b) => a.date.localeCompare(b.date))
                                      .map((ov) => (
                                        <div key={ov.date} className="flex items-center gap-2">
                                          <span
                                            className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md ${
                                              ov.include
                                                ? "bg-emerald-100 text-emerald-700"
                                                : "bg-rose-100 text-rose-700"
                                            }`}
                                          >
                                            {ov.include ? "+ Masuk" : "− Libur"}
                                          </span>
                                          <span className="text-[10px] font-bold text-slate-600">{ov.date}</span>
                                          <button
                                            type="button"
                                            onClick={() => removeOverride(shift.id, emp.userId, ov.date)}
                                            className="ml-auto text-slate-300 hover:text-rose-500 transition-colors"
                                          >
                                            <X size={12} />
                                          </button>
                                        </div>
                                      ))}
                                    <AddOverrideRow
                                      month={currentMonth}
                                      year={currentYear}
                                      onAdd={(date, include) => addOverride(shift.id, emp.userId, date, include)}
                                    />
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>

                        {/* Right: work days count + remove button */}
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => removeEmployee(shift.id, emp.userId)}
                            className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-rose-50 text-slate-300 hover:text-rose-500 flex items-center justify-center transition-colors"
                          >
                            <X size={13} />
                          </button>
                          <div className="text-right">
                            <p className="text-sm font-black text-slate-700">{workDays}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">hari/bln</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Add employee row */}
                <div className={`px-5 py-3 ${color.light}/30`}>
                  {addingTo === shift.id ? (
                    <div className="flex items-center gap-2">
                      <select
                        autoFocus
                        className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-sky-400"
                        defaultValue=""
                        onChange={(e) => { if (e.target.value) addEmployee(shift.id, e.target.value); }}
                      >
                        <option value="" disabled>Pilih karyawan…</option>
                        {availableUsers.map((u: any) => (
                          <option key={u.app_users.id} value={u.app_users.id}>
                            {u.app_users.full_name} ({u.role.replace("_", " ")})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setAddingTo(null)}
                        className="text-slate-400 hover:text-rose-500 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : availableUsers.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setAddingTo(shift.id)}
                      className={`flex items-center gap-1.5 text-[10px] font-black ${color.text} hover:opacity-70 uppercase tracking-widest transition-opacity`}
                    >
                      <Plus size={12} /> Tambah Karyawan ke Shift Ini
                    </button>
                  ) : (
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Users size={11} /> Semua karyawan sudah di-assign
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* Summary footer */}
      {schedule.length > 0 && (
        <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
          <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
          <p className="text-[10px] text-slate-600 font-bold leading-relaxed">
            <span className="font-black text-slate-800">{schedule.length} jadwal</span> akan diterapkan bulan{" "}
            {MONTH_NAMES[currentMonth - 1]} {currentYear}. Hari tanpa jadwal otomatis dianggap libur (OFF).
          </p>
        </div>
      )}
    </div>
  );
}
