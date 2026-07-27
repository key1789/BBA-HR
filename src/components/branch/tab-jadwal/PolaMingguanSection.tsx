"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, AlertCircle } from "lucide-react";
import { saveCrewShiftDefaultAction } from "@/app/sa/branches/[id]/actions";
import { isBranchOperationalPersonnel } from "@/lib/branch-personnel";

// Urutan tampil: Senin-pertama. value = JS getDay() (0=Min..6=Sab).
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
  shiftDefaults: any[]; // crew_shift_defaults rows (per-hari): {user_id, weekday, shift_id, is_off}
}

export function PolaMingguanSection({ branchId, users, shifts, shiftDefaults }: PolaMingguanSectionProps) {
  const crew = users.filter((u) => isBranchOperationalPersonnel(u) && u.app_users?.id);

  // values[userId][weekday] = shiftId | "OFF" | "" (kosong)
  const [values, setValues] = useState<Record<string, Record<number, string>>>(() => {
    const map: Record<string, Record<number, string>> = {};
    for (const d of shiftDefaults ?? []) {
      const uid = String(d.user_id);
      (map[uid] ??= {})[d.weekday as number] = d.is_off ? "OFF" : (d.shift_id ?? "");
    }
    return map;
  });
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());

  const cellKey = (userId: string, weekday: number) => `${userId}|${weekday}`;
  const getVal = (userId: string, weekday: number) => values[userId]?.[weekday] ?? "";

  const handleChange = async (userId: string, weekday: number, value: string) => {
    setValues((prev) => ({ ...prev, [userId]: { ...(prev[userId] ?? {}), [weekday]: value } }));
    const key = cellKey(userId, weekday);
    setSavingCells((prev) => new Set([...prev, key]));
    const fd = new FormData();
    fd.append("tenantId", branchId);
    fd.append("userId", userId);
    fd.append("weekday", String(weekday));
    fd.append("value", value);
    const res = await saveCrewShiftDefaultAction(null, fd);
    setSavingCells((prev) => {
      const n = new Set(prev);
      n.delete(key);
      return n;
    });
    if (res?.error) toast.error(res.error);
  };

  const configuredCount = useMemo(
    () => crew.filter((u) => Object.values(values[u.app_users.id] ?? {}).some((v) => v !== "")).length,
    [crew, values],
  );

  if (shifts.length === 0) {
    return (
      <div className="py-12 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 mx-auto">
          <AlertCircle size={24} />
        </div>
        <p className="text-sm font-black text-slate-700">Belum ada shift yang dibuat</p>
        <p className="text-xs text-slate-500 font-medium">
          Tambahkan shift kerja terlebih dahulu di segmen <span className="font-black text-sky-600">Master Shift</span>.
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

  const cellClass = (v: string) =>
    v === ""
      ? "text-slate-300"
      : v === "OFF"
        ? "bg-rose-50 text-rose-600"
        : "bg-sky-50 text-sky-700";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-slate-500 font-bold">
          {configuredCount} dari {crew.length} crew sudah punya pola
        </p>
        <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
          <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
          Tersimpan otomatis
        </div>
      </div>

      <p className="px-1 text-[11px] text-slate-400 leading-relaxed">
        Atur shift tiap crew per hari (boleh rotasi). Pilih <span className="font-black text-rose-500">OFF</span> untuk hari libur,
        atau kosongkan (<span className="font-black">—</span>) bila tak diatur. Jadwal bulanan dibuat dari pola ini.
      </p>

      <div className="border border-slate-100 rounded-3xl overflow-hidden bg-white shadow-lg shadow-slate-200/40 overflow-x-auto custom-scrollbar">
        <table className="w-full text-left border-separate border-spacing-0 min-w-[720px]">
          <thead>
            <tr className="bg-slate-50/80">
              <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest sticky left-0 bg-slate-50 z-10 w-44 border-b border-r border-slate-100">
                Crew
              </th>
              {WEEKDAYS.map(({ label, value }) => (
                <th
                  key={value}
                  className={`p-3 text-center text-[10px] font-black uppercase tracking-widest border-b border-r border-slate-100 last:border-r-0 ${
                    value === 0 || value === 6 ? "text-rose-500 bg-rose-50/40" : "text-slate-400"
                  }`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {crew.map((u) => {
              const userId = u.app_users.id as string;
              return (
                <tr key={userId} className="hover:bg-slate-50/40 transition-colors">
                  <td className="p-4 sticky left-0 bg-white z-10 border-b border-r border-slate-100">
                    <p className="font-black text-slate-800 text-xs uppercase tracking-tight truncate max-w-[150px]">
                      {u.app_users.full_name}
                    </p>
                  </td>
                  {WEEKDAYS.map(({ value }) => {
                    const v = getVal(userId, value);
                    const saving = savingCells.has(cellKey(userId, value));
                    return (
                      <td key={value} className="p-0 border-b border-r border-slate-100 last:border-r-0 relative">
                        <select
                          value={v}
                          disabled={saving}
                          onChange={(e) => handleChange(userId, value, e.target.value)}
                          className={`w-full h-12 px-1 bg-transparent text-[10px] font-black uppercase text-center cursor-pointer outline-none appearance-none transition-all disabled:opacity-50 ${cellClass(v)}`}
                        >
                          <option value="">—</option>
                          <option value="OFF" className="bg-white text-rose-600">OFF</option>
                          {shifts.map((s: any) => (
                            <option key={s.id} value={s.id} className="bg-white text-slate-800">
                              {s.shift_name}
                            </option>
                          ))}
                        </select>
                        {saving && (
                          <span className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
