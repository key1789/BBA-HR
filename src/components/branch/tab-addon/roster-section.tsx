"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Clock, CalendarDays, Save, Loader2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { copyRosterAction, saveRosterAction } from "@/app/sa/branches/[id]/actions";
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
  hasApprovedLeave,
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
      {hasApprovedLeave && !isPending && (
        <span
          title="Izin disetujui hari ini"
          className="absolute top-0.5 right-0.5 flex items-center gap-0.5 rounded-md bg-violet-100 px-1 text-[7px] font-black uppercase tracking-tight text-violet-700 ring-1 ring-violet-200 pointer-events-none"
        >
          Izin
        </span>
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
  /** Kunci `${user_id}|${YYYY-MM-DD}` untuk hari izin disetujui — overlay penanda di sel roster. */
  approvedLeaveKeys?: string[];
  /** Memberi tahu parent saat ada penyimpanan roster berjalan (untuk blok penutup modal). */
  onBusyChange?: (busy: boolean) => void;
}

const MOBILE_WEEKDAY = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/** Baris crew di editor per-hari (HP): nama + dropdown shift. Simpan via onApply. */
function MobileShiftSelect({ schedule, shifts, branchId, userId, dateStr, day, userName, onApply, hasApprovedLeave }: any) {
  const [isPending, startTransition] = useTransition();
  const [val, setVal] = useState(schedule?.is_off ? "OFF" : schedule?.shift_id || "");

  useEffect(() => {
    queueMicrotask(() => setVal(schedule?.is_off ? "OFF" : schedule?.shift_id || ""));
  }, [schedule]);

  const apply = (v: string) => {
    setVal(v);
    startTransition(async () => {
      await onApply({ branchId, userId, dateStr, shiftId: v, day, userName, silent: false });
    });
  };

  const hasShiftOption = !!(val && val !== "OFF" && shifts.some((s: any) => s.id === val));

  return (
    <div className="flex items-center gap-2.5 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-[9px] font-black uppercase text-sky-600">
        {String(userName).slice(0, 2)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-bold text-slate-800">{userName}</p>
        {hasApprovedLeave && (
          <span className="mt-0.5 inline-flex rounded-md bg-violet-100 px-1.5 text-[8px] font-black uppercase tracking-tight text-violet-700 ring-1 ring-violet-200">
            Izin disetujui
          </span>
        )}
      </div>
      <div className="relative shrink-0">
        <select
          value={val}
          disabled={isPending}
          onChange={(e) => apply(e.target.value)}
          className={`h-9 w-[116px] rounded-xl border px-2 text-[11px] font-black uppercase outline-none transition-all disabled:opacity-50 ${
            val === ""
              ? "border-slate-200 bg-white text-slate-400"
              : val === "OFF"
                ? "border-rose-200 bg-rose-50 text-rose-600"
                : "border-sky-200 bg-sky-50 text-sky-700"
          }`}
        >
          <option value="">— Kosong</option>
          <option value="OFF">OFF (Libur)</option>
          {val && val !== "OFF" && !hasShiftOption ? (
            <option value={val}>Shift lama (hilang)</option>
          ) : null}
          {shifts.map((s: any) => (
            <option key={s.id} value={s.id}>{s.shift_name}</option>
          ))}
        </select>
        {isPending && (
          <span className="absolute -right-1 -top-1 h-2 w-2 animate-ping rounded-full bg-sky-500" />
        )}
      </div>
    </div>
  );
}

/** Kartu hari yang bisa dilipat di editor per-hari (HP). */
function MobileDayRow({ day, dateStr, weekday, isWeekend, monthLabel, crewSchedules, shifts, branchId, onApply }: any) {
  const [open, setOpen] = useState(false);
  let kerja = 0;
  let off = 0;
  for (const cs of crewSchedules) {
    if (cs.schedule?.is_off) off++;
    else if (cs.schedule?.shift_id) kerja++;
  }
  const kosong = crewSchedules.length - kerja - off;

  return (
    <div className={`overflow-hidden rounded-2xl border bg-white ${isWeekend ? "border-rose-100" : "border-slate-200"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black ${isWeekend ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-700"}`}>
          {day}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-black uppercase tracking-widest ${isWeekend ? "text-rose-500" : "text-slate-600"}`}>
            {weekday}, {monthLabel}
          </p>
          <p className="mt-0.5 text-[10px] font-bold text-slate-400">
            {kerja === 0 && off === 0 ? (
              "Belum diatur"
            ) : (
              <>
                {kerja > 0 && <span className="text-sky-600">{kerja} kerja</span>}
                {kerja > 0 && (off > 0 || kosong > 0) && " · "}
                {off > 0 && <span className="text-rose-500">{off} off</span>}
                {off > 0 && kosong > 0 && " · "}
                {kosong > 0 && <span className="text-slate-400">{kosong} kosong</span>}
              </>
            )}
          </p>
        </div>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="divide-y divide-slate-50 border-t border-slate-100 px-3">
          {crewSchedules.length === 0 ? (
            <p className="py-3 text-[11px] text-slate-400">Belum ada crew.</p>
          ) : (
            crewSchedules.map((cs: any) => (
              <MobileShiftSelect
                key={cs.userId}
                schedule={cs.schedule}
                shifts={shifts}
                branchId={branchId}
                userId={cs.userId}
                dateStr={dateStr}
                day={day}
                userName={cs.userName}
                onApply={onApply}
                hasApprovedLeave={cs.hasApprovedLeave}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function RosterSection({
  branchId,
  currentMonth,
  currentYear,
  users,
  shifts,
  roster,
  approvedLeaveKeys,
  onBusyChange,
}: RosterSectionProps) {
  const [pendingRosterSaves, setPendingRosterSaves] = useState(0);
  const [localRosterByUserDate, setLocalRosterByUserDate] = useState<Record<string, any>>({});
  const leaveSet = useMemo(() => new Set(approvedLeaveKeys ?? []), [approvedLeaveKeys]);
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

  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const monthShort = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][currentMonth - 1];

  // Ringkasan per crew (Kerja / OFF / Kosong) sebulan — update saat sel diubah.
  const summaryFor = (userId: string) => {
    let kerja = 0;
    let off = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const sch =
        localRosterByUserDate[`${userId}|${dateStr}`] ??
        roster.find((r) => r.user_id === userId && scheduleDateKey(r.schedule_date) === dateStr);
      if (sch?.is_off) off++;
      else if (sch?.shift_id) kerja++;
    }
    return { kerja, off, kosong: daysInMonth - kerja - off };
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-start gap-3 rounded-2xl border border-cyan-100/50 bg-gradient-to-br from-cyan-50 to-sky-50 p-4 sm:gap-5 sm:rounded-[24px] sm:p-6">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-cyan-600 shadow-sm sm:h-10 sm:w-10">
          <Clock size={18} />
        </div>
        <p className="text-[11px] font-semibold leading-relaxed text-slate-600 sm:text-xs">
          Atur jadwal shift kerja karyawan untuk satu bulan penuh. Pastikan{" "}
          <span className="text-[10px] font-black uppercase tracking-widest text-cyan-600">Roster Terisi</span> dengan
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

      {/* Mobile: editor per-hari (tap satu hari → atur shift tiap crew) */}
      <div className="space-y-2 md:hidden">
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const dateStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dow = new Date(currentYear, currentMonth - 1, day).getDay();
          const crewSchedules = users
            .filter((u) => isBranchOperationalPersonnel(u))
            .map((user) => {
              const uid = user.app_users.id;
              const schedule =
                localRosterByUserDate[`${uid}|${dateStr}`] ??
                roster.find((r) => r.user_id === uid && scheduleDateKey(r.schedule_date) === dateStr);
              return {
                userId: uid,
                userName: user.app_users.full_name,
                schedule,
                hasApprovedLeave: leaveSet.has(`${uid}|${dateStr}`),
              };
            });
          return (
            <MobileDayRow
              key={day}
              day={day}
              dateStr={dateStr}
              weekday={MOBILE_WEEKDAY[dow]}
              isWeekend={dow === 0 || dow === 6}
              monthLabel={monthShort}
              crewSchedules={crewSchedules}
              shifts={shifts}
              branchId={branchId}
              onApply={applyRosterChange}
            />
          );
        })}
      </div>

      {/* Desktop: matriks roster penuh */}
      <div className="hidden border border-slate-100 rounded-[28px] overflow-hidden bg-white shadow-xl shadow-slate-200/50 overflow-x-auto custom-scrollbar relative border-separate border-spacing-0 md:block">
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
              <th className="p-3 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest sticky right-0 bg-slate-50/95 backdrop-blur-md z-20 min-w-[136px] border-b border-l border-slate-100 shadow-[-2px_0_10px_-2px_rgba(0,0,0,0.05)]">
                Ringkasan
              </th>
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
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
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
                      hasApprovedLeave={leaveSet.has(`${user.app_users.id}|${dateStr}`)}
                    />
                  );
                })}
                {(() => {
                  const s = summaryFor(user.app_users.id);
                  return (
                    <td className="p-3 sticky right-0 bg-white group-hover:bg-slate-50 z-10 border-b border-l border-slate-100 transition-colors shadow-[-2px_0_10px_-2px_rgba(0,0,0,0.05)]">
                      <div className="flex items-center justify-center gap-2 text-[10px] font-black">
                        <span className="flex flex-col items-center px-1.5 py-1 rounded-lg bg-sky-50 text-sky-700 min-w-[34px]">
                          <span className="text-sm leading-none">{s.kerja}</span>
                          <span className="text-[8px] font-bold opacity-70 mt-0.5">KERJA</span>
                        </span>
                        <span className="flex flex-col items-center px-1.5 py-1 rounded-lg bg-rose-50 text-rose-600 min-w-[34px]">
                          <span className="text-sm leading-none">{s.off}</span>
                          <span className="text-[8px] font-bold opacity-70 mt-0.5">OFF</span>
                        </span>
                        <span className="flex flex-col items-center px-1.5 py-1 rounded-lg bg-slate-50 text-slate-400 min-w-[34px]">
                          <span className="text-sm leading-none">{s.kosong}</span>
                          <span className="text-[8px] font-bold opacity-70 mt-0.5">KOSONG</span>
                        </span>
                      </div>
                    </td>
                  );
                })()}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
