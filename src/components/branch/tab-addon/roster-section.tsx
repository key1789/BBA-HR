"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Clock, CalendarDays, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { copyRosterAction, saveRosterAction } from "@/app/bba/branches/[id]/actions";
import { isBranchOperationalPersonnel } from "@/lib/branch-personnel";

/** Supabase/pg mengembalikan date sebagai "YYYY-MM-DD" atau ISO; bandingkan aman untuk roster. */
export function scheduleDateKey(d: string | null | undefined): string {
  if (d == null || d === "") return "";
  const s = String(d);
  const head = s.includes("T") ? (s.split("T")[0] ?? "") : s;
  return head.length >= 10 ? head.slice(0, 10) : head;
}

export function RosterCell({
  schedule,
  shifts,
  branchId,
  userId,
  dateStr,
  day,
  userName,
  onApply,
  shiftColorById,
}: any) {
  const [isPending, startTransition] = useTransition();
  const [val, setVal] = useState(schedule?.is_off ? "OFF" : schedule?.shift_id || "");

  useEffect(() => {
    queueMicrotask(() => setVal(schedule?.is_off ? "OFF" : schedule?.shift_id || ""));
  }, [schedule]);

  const applyValue = (v: string, silent: boolean) => {
    setVal(v);
    startTransition(async () => {
      await onApply({
        branchId,
        userId,
        dateStr,
        shiftId: v,
        day,
        userName,
        silent,
      });
    });
  };

  const hasShiftOption = !!(val && val !== "OFF" && shifts.some((s: any) => s.id === val));
  const shiftColor =
    val && val !== "OFF"
      ? hasShiftOption
        ? (shiftColorById?.[val] ?? "bg-sky-50 text-sky-700 hover:bg-sky-100")
        : "bg-amber-50 text-amber-700 hover:bg-amber-100"
      : "";

  return (
    <td
      className={`p-0 border-r border-slate-100 last:border-0 relative h-full min-w-[75px] transition-all duration-500 ${isPending ? "bg-slate-50" : ""}`}
    >
      <select
        value={val}
        disabled={isPending}
        onChange={(e) => {
          const v = e.target.value;
          applyValue(v, false);
        }}
        className={`w-full h-12 p-0 bg-transparent text-[10px] font-black uppercase text-center cursor-pointer outline-none transition-all duration-300 appearance-none flex items-center justify-center ${
          val === ""
            ? "text-slate-300 hover:bg-slate-50/50"
            : val === "OFF"
              ? "bg-rose-50 text-rose-600 hover:bg-rose-100"
              : shiftColor
        }`}
      >
        <option value="">--</option>
        <option value="OFF" className="text-rose-600 font-bold bg-white">
          OFF
        </option>
        {val && val !== "OFF" && !hasShiftOption ? (
          <option value={val} className="bg-white text-amber-700">
            SHIFT LAMA (tidak ditemukan)
          </option>
        ) : null}
        {shifts.map((s: any) => (
          <option key={s.id} value={s.id} className="bg-white text-slate-800">
            {s.shift_name}
          </option>
        ))}
      </select>
      {isPending && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-white/40 backdrop-blur-[1px] animate-in fade-in duration-300">
          <div className="w-1.5 h-1.5 rounded-full bg-sky-600 animate-bounce"></div>
        </div>
      )}
      {val !== "" && !isPending && (
        <div
          className={`absolute bottom-1 right-1 w-1 h-1 rounded-full ${val === "OFF" ? "bg-rose-400" : "bg-sky-400"} animate-in zoom-in duration-500`}
        ></div>
      )}
    </td>
  );
}

export interface RosterSectionProps {
  branchId: string;
  currentMonth: number;
  currentYear: number;
  users: any[];
  shifts: any[];
  roster: any[];
  /** Memberi tahu parent saat ada penyimpanan roster berjalan (untuk blok penutup modal). */
  onBusyChange?: (busy: boolean) => void;
}

export function RosterSection({
  branchId,
  currentMonth,
  currentYear,
  users,
  shifts,
  roster,
  onBusyChange,
}: RosterSectionProps) {
  const [pendingRosterSaves, setPendingRosterSaves] = useState(0);
  const [localRosterByUserDate, setLocalRosterByUserDate] = useState<Record<string, any>>({});
  const [isCopyPending, startCopyTransition] = useTransition();

  useEffect(() => {
    onBusyChange?.(pendingRosterSaves > 0);
  }, [pendingRosterSaves, onBusyChange]);

  const applyRosterChange = useCallback(
    async ({
      branchId: bId,
      userId,
      dateStr,
      shiftId,
      day,
      userName,
      silent,
    }: {
      branchId: string;
      userId: string;
      dateStr: string;
      shiftId: string;
      day: number;
      userName: string;
      silent: boolean;
    }) => {
      const formData = new FormData();
      formData.append("tenantId", bId);
      formData.append("userId", userId);
      formData.append("date", dateStr);
      formData.append("shiftId", shiftId);

      setPendingRosterSaves((c) => c + 1);
      try {
        const res = await saveRosterAction(formData);
        if (res?.error) {
          toast.error(res.error);
        } else if (!silent) {
          toast.success(`Tgl ${day}: ${userName} OK`, { duration: 800 });
        }
        if (!res?.error) {
          setLocalRosterByUserDate((prev) => ({
            ...prev,
            [`${userId}|${dateStr}`]: {
              user_id: userId,
              schedule_date: dateStr,
              shift_id: shiftId === "" || shiftId === "OFF" ? null : shiftId,
              is_off: shiftId === "OFF",
            },
          }));
        }
      } finally {
        setPendingRosterSaves((c) => Math.max(0, c - 1));
      }
    },
    [],
  );

  const shiftColorById = useMemo(() => {
    const palette = [
      "bg-sky-50 text-sky-700 hover:bg-sky-100",
      "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
      "bg-amber-50 text-amber-700 hover:bg-amber-100",
      "bg-violet-50 text-violet-700 hover:bg-violet-100",
      "bg-cyan-50 text-cyan-700 hover:bg-cyan-100",
    ];
    const map: Record<string, string> = {};
    shifts.forEach((s: any) => {
      const raw = String(s.id ?? "");
      let hash = 0;
      for (let i = 0; i < raw.length; i++) hash = (hash * 31 + raw.charCodeAt(i)) | 0;
      const idx = Math.abs(hash) % palette.length;
      map[s.id] = palette[idx] ?? palette[0];
    });
    return map;
  }, [shifts]);

  useEffect(() => {
    queueMicrotask(() => {
      const next: Record<string, any> = {};
      for (const r of roster ?? []) {
        const d = scheduleDateKey(r.schedule_date);
        if (!r.user_id || !d) continue;
        next[`${r.user_id}|${d}`] = r;
      }
      setLocalRosterByUserDate(next);
    });
  }, [branchId, roster]);

  return (
    <div className="space-y-8 pb-10">
      <div className="p-6 bg-gradient-to-br from-cyan-50 to-sky-50 border border-cyan-100/50 rounded-[24px] flex gap-5 items-start">
        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-cyan-600 shadow-sm shrink-0">
          <Clock size={20} />
        </div>
        <p className="text-xs text-slate-600 leading-relaxed font-semibold">
          Atur jadwal shift kerja karyawan untuk satu bulan penuh. Pastikan{" "}
          <span className="text-cyan-600 font-black text-[10px] uppercase tracking-widest">Roster Terisi</span> dengan
          benar agar operasional apotek berjalan lancar.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <CalendarDays size={14} /> Penjadwalan Roster
        </h4>
        <button
          type="button"
          disabled={isCopyPending}
          onClick={() => {
            const formData = new FormData();
            formData.append("tenantId", branchId);
            formData.append("month", currentMonth.toString());
            formData.append("year", currentYear.toString());
            startCopyTransition(async () => {
              const res = await copyRosterAction(formData);
              if (res.success) toast.success(res.message);
              else toast.error(res.error);
            });
          }}
          className="group flex items-center gap-2 px-4 py-2 bg-white hover:bg-sky-50 text-sky-600 border border-sky-100 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all duration-300 shadow-sm hover:shadow-sky-100 w-full sm:w-auto disabled:opacity-50 disabled:pointer-events-none"
        >
          {isCopyPending
            ? <Loader2 size={12} className="animate-spin" />
            : <Save size={12} className="group-hover:rotate-12 transition-transform" />}
          {isCopyPending ? "Menyalin…" : "Salin dari Bulan Lalu"}
        </button>
      </div>

      <div className="border border-slate-100 rounded-[28px] overflow-hidden bg-white shadow-xl shadow-slate-200/50 overflow-x-auto custom-scrollbar relative border-separate border-spacing-0">
        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
          <thead>
            <tr className="bg-slate-50/80 backdrop-blur-sm">
              <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest sticky left-0 bg-slate-50/90 backdrop-blur-md z-20 w-56 border-b border-r border-slate-100 shadow-[2px_0_10px_-2px_rgba(0,0,0,0.05)]">
                Karyawan
              </th>
              {Array.from({ length: new Date(currentYear, currentMonth, 0).getDate() }).map((_, i) => (
                <th
                  key={i}
                  className={`p-3 text-center text-[10px] font-black uppercase min-w-[65px] border-b border-r border-slate-100 last:border-r-0 ${
                    [0, 6].includes(new Date(currentYear, currentMonth - 1, i + 1).getDay())
                      ? "bg-rose-50/50 text-rose-500"
                      : "text-slate-400"
                  }`}
                >
                  <div className="flex flex-col items-center">
                    <span className="text-[8px] opacity-50 mb-0.5">
                      {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"][new Date(currentYear, currentMonth - 1, i + 1).getDay()]}
                    </span>
                    <span>{i + 1}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.filter((u) => isBranchOperationalPersonnel(u)).map((user) => (
              <tr key={user.id} className="group hover:bg-slate-50/50 transition-colors">
                <td className="p-5 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-b border-r border-slate-100 transition-colors shadow-[2px_0_10px_-2px_rgba(0,0,0,0.05)]">
                  <p className="font-black text-slate-800 text-xs truncate max-w-[200px] uppercase tracking-tight">
                    {user.app_users.full_name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${user.role === "admin_apotek" ? "bg-sky-500" : "bg-emerald-500"}`}
                    ></div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                      {user.role.replace("_", " ")}
                    </p>
                  </div>
                </td>
                {Array.from({ length: new Date(currentYear, currentMonth, 0).getDate() }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const schedule =
                    localRosterByUserDate[`${user.app_users.id}|${dateStr}`] ??
                    roster.find(
                      (r) => r.user_id === user.app_users.id && scheduleDateKey(r.schedule_date) === dateStr,
                    );

                  return (
                    <RosterCell
                      key={i}
                      schedule={schedule}
                      shifts={shifts}
                      branchId={branchId}
                      userId={user.app_users.id}
                      dateStr={dateStr}
                      day={day}
                      userName={user.app_users.full_name}
                      onApply={applyRosterChange}
                      shiftColorById={shiftColorById}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
