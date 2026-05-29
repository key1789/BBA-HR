"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { saveCrewShiftDefaultAction } from "@/app/bba/branches/[id]/actions";
import { isBranchOperationalPersonnel } from "@/lib/branch-personnel";

// Urutan tampil: Senin-pertama (lebih natural untuk konteks kerja)
const WEEKDAYS = [
  { label: "Sen", value: 1 },
  { label: "Sel", value: 2 },
  { label: "Rab", value: 3 },
  { label: "Kam", value: 4 },
  { label: "Jum", value: 5 },
  { label: "Sab", value: 6 },
  { label: "Min", value: 0 },
];

interface PolaMingguanSectionProps {
  branchId: string;
  users: any[];
  shifts: any[];
  shiftDefaults: any[]; // crew_shift_defaults rows
}

export function PolaMingguanSection({
  branchId,
  users,
  shifts,
  shiftDefaults,
}: PolaMingguanSectionProps) {
  const crew = users.filter((u) => isBranchOperationalPersonnel(u) && u.app_users?.id);

  // Local state: per userId → { shiftId, weekdays }
  const [localDefaults, setLocalDefaults] = useState<Record<string, { shiftId: string; weekdays: number[] }>>(() => {
    const map: Record<string, { shiftId: string; weekdays: number[] }> = {};
    shiftDefaults.forEach((d: any) => {
      map[d.user_id] = { shiftId: d.shift_id ?? "", weekdays: d.working_weekdays ?? [] };
    });
    return map;
  });
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const getDefault = (userId: string) =>
    localDefaults[userId] ?? { shiftId: "", weekdays: [] };

  const persistDefault = async (userId: string, shiftId: string, weekdays: number[]) => {
    if (!shiftId) return; // shift wajib dipilih dulu
    setSavingIds((prev) => new Set([...prev, userId]));
    const fd = new FormData();
    fd.append("tenantId", branchId);
    fd.append("userId", userId);
    fd.append("shiftId", shiftId);
    fd.append("weekdaysJson", JSON.stringify(weekdays));
    const res = await saveCrewShiftDefaultAction(null, fd);
    setSavingIds((prev) => {
      const n = new Set(prev);
      n.delete(userId);
      return n;
    });
    if (!res.success) toast.error(res.error ?? "Gagal menyimpan pola.");
  };

  const handleShiftChange = (userId: string, shiftId: string) => {
    const cur = getDefault(userId);
    const next = { ...cur, shiftId };
    setLocalDefaults((prev) => ({ ...prev, [userId]: next }));
    void persistDefault(userId, shiftId, cur.weekdays);
  };

  const handleWeekdayToggle = (userId: string, day: number) => {
    const cur = getDefault(userId);
    const weekdays = cur.weekdays.includes(day)
      ? cur.weekdays.filter((d) => d !== day)
      : [...cur.weekdays, day];
    const next = { ...cur, weekdays };
    setLocalDefaults((prev) => ({ ...prev, [userId]: next }));
    void persistDefault(userId, cur.shiftId, weekdays);
  };

  const configuredCount = crew.filter((u) => {
    const d = localDefaults[u.app_users.id];
    return d && d.shiftId && d.weekdays.length > 0;
  }).length;

  if (shifts.length === 0) {
    return (
      <div className="py-12 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 mx-auto">
          <AlertCircle size={24} />
        </div>
        <p className="text-sm font-black text-slate-700">Belum ada shift yang dibuat</p>
        <p className="text-xs text-slate-500 font-medium">
          Tambahkan shift kerja terlebih dahulu di tab <span className="font-black text-sky-600">Pengaturan Shift</span>.
        </p>
      </div>
    );
  }

  if (crew.length === 0) {
    return (
      <div className="py-12 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
          <CalendarClock size={24} />
        </div>
        <p className="text-sm font-black text-slate-500 uppercase tracking-widest">Belum ada crew terdaftar</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-slate-500 font-bold">
          {configuredCount} dari {crew.length} crew sudah punya pola
        </p>
        <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
          <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
          Tersimpan otomatis
        </div>
      </div>

      {/* Crew list */}
      <div className="space-y-3">
        {crew.map((u) => {
          const userId = u.app_users.id as string;
          const def = getDefault(userId);
          const isSaving = savingIds.has(userId);
          const isConfigured = !!def.shiftId && def.weekdays.length > 0;
          const initials = (u.app_users.full_name as string)
            ?.split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2) ?? "?";

          return (
            <div
              key={userId}
              className={`rounded-3xl border transition-all duration-300 bg-white ${
                isConfigured ? "border-slate-100 shadow-sm" : "border-amber-100 bg-amber-50/30"
              }`}
            >
              <div className="p-5">
                {/* Crew header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center font-black text-xs text-slate-500">
                      {initials}
                    </div>
                    <div>
                      <p className="font-black text-slate-800 text-sm uppercase tracking-tight">
                        {u.app_users.full_name}
                      </p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                        Crew
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isSaving ? (
                      <Loader2 size={14} className="animate-spin text-sky-500" />
                    ) : isConfigured ? (
                      <div className="flex items-center gap-1 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                        <CheckCircle2 size={10} /> Tersimpan
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                        <AlertCircle size={10} /> Belum lengkap
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Shift selector */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Shift Kerja
                    </label>
                    <select
                      value={def.shiftId}
                      onChange={(e) => handleShiftChange(userId, e.target.value)}
                      disabled={isSaving}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black text-slate-800 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100 transition-all disabled:opacity-50"
                    >
                      <option value="">-- Pilih shift --</option>
                      {shifts.map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.shift_name} ({s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Weekday chips */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Hari Kerja
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {WEEKDAYS.map(({ label, value }) => {
                        const isActive = def.weekdays.includes(value);
                        const isWeekend = value === 0 || value === 6;
                        return (
                          <button
                            key={value}
                            type="button"
                            disabled={isSaving || !def.shiftId}
                            onClick={() => handleWeekdayToggle(userId, value)}
                            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 border disabled:opacity-40 disabled:cursor-not-allowed ${
                              isActive
                                ? isWeekend
                                  ? "bg-rose-500 text-white border-rose-500 shadow-sm"
                                  : "bg-sky-600 text-white border-sky-600 shadow-sm"
                                : isWeekend
                                  ? "bg-rose-50 text-rose-400 border-rose-100 hover:bg-rose-100"
                                  : "bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {!def.shiftId && (
                      <p className="text-[10px] text-amber-600 font-medium">
                        Pilih shift dulu untuk mengatur hari kerja
                      </p>
                    )}
                    {def.shiftId && def.weekdays.length > 0 && (
                      <p className="text-[10px] text-slate-500 font-medium">
                        {def.weekdays.length} hari kerja per minggu
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
