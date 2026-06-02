"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowLeftRight,
  CalendarDays,
  ClipboardList,
  AlertCircle,
  UserCheck,
} from "lucide-react";
import { reviewLeaveRequestAction, reviewShiftSwapRequestAction } from "@/actions/attendance";
import { cn } from "@/lib/utils";
import type { ScheduleEntry, PendingLeave, PendingSwap } from "./page";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const LEAVE_TYPE_LABEL: Record<string, string> = {
  sakit:    "Sakit",
  izin:     "Izin",
  cuti:     "Cuti",
  dinas:    "Dinas",
  lainnya:  "Lainnya",
};

// Simple string-hash → pick from a palette of soft bg/text pairs
const SHIFT_COLORS = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
];

function shiftColor(name: string | null): string {
  if (!name) return "bg-slate-100 text-slate-500";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return SHIFT_COLORS[h % SHIFT_COLORS.length];
}

const fmtDate = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  schedulesByDate: Record<string, ScheduleEntry[]>;
  pendingLeaves: PendingLeave[];
  pendingSwaps: PendingSwap[];
  month: number;
  year: number;
  today: string; // YYYY-MM-DD
}

// ─── Leave approval card ──────────────────────────────────────────────────────

function LeaveApprovalCard({ leave }: { leave: PendingLeave }) {
  const [showReject, setShowReject] = useState(false);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  function approve() {
    startTransition(async () => {
      const fd = new FormData();
      await reviewLeaveRequestAction(leave.id, "approved", fd);
    });
  }

  function reject() {
    if (!note.trim()) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("adminNote", note.trim());
      await reviewLeaveRequestAction(leave.id, "rejected", fd);
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-800">{leave.userName}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {LEAVE_TYPE_LABEL[leave.leave_type] ?? leave.leave_type} ·{" "}
            {fmtDate.format(new Date(leave.start_date + "T00:00:00"))}
            {leave.start_date !== leave.end_date &&
              ` – ${fmtDate.format(new Date(leave.end_date + "T00:00:00"))}`}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-700">
          {LEAVE_TYPE_LABEL[leave.leave_type] ?? leave.leave_type}
        </span>
      </div>

      {/* Alasan */}
      {leave.reason && (
        <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-xl px-3 py-2">
          "{leave.reason}"
        </p>
      )}

      {/* Lampiran */}
      {leave.attachment_url && (
        <a
          href={leave.attachment_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-sky-600 hover:underline"
        >
          <ClipboardList size={12} /> Lihat lampiran
        </a>
      )}

      {/* Actions */}
      {!showReject ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={approve}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black uppercase text-white shadow-sm transition-all hover:bg-emerald-700 disabled:opacity-50"
          >
            {isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            Setujui
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setShowReject(true)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black uppercase text-rose-600 transition-all hover:bg-rose-100 disabled:opacity-50"
          >
            <XCircle size={13} /> Tolak
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600">
              Catatan penolakan <span className="text-rose-500">*</span>
            </span>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tulis alasan penolakan..."
              className="mt-1 w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending || !note.trim()}
              onClick={reject}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-black uppercase text-white shadow-sm transition-all hover:bg-rose-700 disabled:opacity-50"
            >
              {isPending ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
              Konfirmasi Tolak
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => { setShowReject(false); setNote(""); }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            >
              Batal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shift swap approval card ─────────────────────────────────────────────────

function SwapApprovalCard({ swap }: { swap: PendingSwap }) {
  const [showReject, setShowReject] = useState(false);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const isPendingCrew = swap.status === "pending_crew";

  function approve() {
    startTransition(async () => {
      const fd = new FormData();
      await reviewShiftSwapRequestAction(swap.id, "approved", fd);
    });
  }

  function reject() {
    if (!note.trim()) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("adminNote", note.trim());
      await reviewShiftSwapRequestAction(swap.id, "rejected", fd);
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-800">
            {swap.requesterName}{" "}
            <span className="font-normal text-slate-400">→</span>{" "}
            {swap.targetName}
          </p>
          {swap.requesterDate && (
            <p className="text-[11px] text-slate-400 mt-0.5">
              {fmtDate.format(new Date(swap.requesterDate + "T00:00:00"))}
              {swap.requesterShift && (
                <span className="ml-1">· {swap.requesterShift}</span>
              )}
            </p>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase",
            isPendingCrew
              ? "bg-slate-100 text-slate-500"
              : "bg-sky-100 text-sky-700",
          )}
        >
          {isPendingCrew ? "Menunggu target" : "Siap diputuskan"}
        </span>
      </div>

      {/* Info pending crew */}
      {isPendingCrew && (
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
          <AlertCircle size={13} className="shrink-0 text-slate-400" />
          <p className="text-[11px] text-slate-500">
            Menunggu konfirmasi dari <span className="font-semibold">{swap.targetName}</span>.
            Anda tetap dapat menolak.
          </p>
        </div>
      )}

      {/* Alasan */}
      {swap.reason && (
        <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-xl px-3 py-2">
          "{swap.reason}"
        </p>
      )}

      {/* Actions */}
      {!showReject ? (
        <div className="flex gap-2">
          {!isPendingCrew && (
            <button
              type="button"
              disabled={isPending}
              onClick={approve}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black uppercase text-white shadow-sm transition-all hover:bg-emerald-700 disabled:opacity-50"
            >
              {isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              Setujui
            </button>
          )}
          <button
            type="button"
            disabled={isPending}
            onClick={() => setShowReject(true)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black uppercase text-rose-600 transition-all hover:bg-rose-100 disabled:opacity-50",
              isPendingCrew ? "flex-1" : "flex-1",
            )}
          >
            <XCircle size={13} /> Tolak
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600">
              Catatan penolakan <span className="text-rose-500">*</span>
            </span>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tulis alasan penolakan..."
              className="mt-1 w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending || !note.trim()}
              onClick={reject}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-black uppercase text-white shadow-sm transition-all hover:bg-rose-700 disabled:opacity-50"
            >
              {isPending ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
              Konfirmasi Tolak
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => { setShowReject(false); setNote(""); }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            >
              Batal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

type Tab = "kalender" | "izin" | "tukar";

export function AbsensiClient({
  schedulesByDate,
  pendingLeaves,
  pendingSwaps,
  month,
  year,
  today,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("kalender");

  // ── Month navigation ─────────────────────────────────────────────────────
  function navigate(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    router.push(`/admin/absensi?month=${m}&year=${y}`);
  }

  // ── Calendar helpers ──────────────────────────────────────────────────────
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const lastDayNum = new Date(year, month, 0).getDate();
  const days: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: lastDayNum }, (_, i) => i + 1),
  ];
  // pad to full weeks
  while (days.length % 7 !== 0) days.push(null);

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const dateKey = (d: number) => `${year}-${pad2(month)}-${pad2(d)}`;
  const todayDay = today.startsWith(`${year}-${pad2(month)}-`)
    ? Number(today.slice(8, 10))
    : null;

  const tabs: { id: Tab; label: string; count?: number; Icon: React.ElementType }[] = [
    { id: "kalender", label: "Kalender", Icon: CalendarDays },
    { id: "izin",     label: "Izin",     Icon: UserCheck,   count: pendingLeaves.length },
    { id: "tukar",    label: "Tukar Shift", Icon: ArrowLeftRight, count: pendingSwaps.length },
  ];

  return (
    <div className="space-y-4">

      {/* ── Tab bar ──────────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-2xl border border-slate-100 bg-white p-1 shadow-sm">
        {tabs.map(({ id, label, count, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[10px] font-black uppercase tracking-widest transition-all",
              activeTab === id
                ? "bg-sky-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-600",
            )}
          >
            <Icon size={13} />
            {label}
            {count !== undefined && count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[9px] font-black leading-none",
                  activeTab === id
                    ? "bg-white/20 text-white"
                    : "bg-slate-200 text-slate-500",
                )}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── KALENDER TAB ─────────────────────────────────────────────── */}
      {activeTab === "kalender" && (
        <div className="space-y-3">
          {/* Month nav */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-black uppercase tracking-widest text-slate-800">
              {MONTH_NAMES[month - 1]} {year}
            </p>
            <button
              type="button"
              onClick={() => navigate(1)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Desktop: full grid calendar */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-slate-100">
              {DAY_NAMES.map((d) => (
                <div
                  key={d}
                  className="py-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-400"
                >
                  {d}
                </div>
              ))}
            </div>
            {/* Weeks */}
            <div className="grid grid-cols-7">
              {days.map((d, idx) => {
                const key = d ? dateKey(d) : `empty-${idx}`;
                const entries = d ? (schedulesByDate[dateKey(d)] ?? []) : [];
                const isToday = d !== null && d === todayDay;
                const isSun = idx % 7 === 0;
                const isSat = idx % 7 === 6;

                return (
                  <div
                    key={key}
                    className={cn(
                      "min-h-[90px] border-b border-r border-slate-50 p-1.5",
                      !d && "bg-slate-50/50",
                      isSun && "bg-rose-50/20",
                      isSat && "bg-slate-50/40",
                    )}
                  >
                    {d !== null && (
                      <>
                        <p
                          className={cn(
                            "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black",
                            isToday
                              ? "bg-sky-600 text-white"
                              : isSun
                                ? "text-rose-500"
                                : "text-slate-700",
                          )}
                        >
                          {d}
                        </p>
                        <div className="space-y-0.5">
                          {entries.slice(0, 4).map((e, i) => (
                            <div
                              key={`${e.userId}-${i}`}
                              className={cn(
                                "truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                                e.isOff
                                  ? "bg-slate-100 text-slate-400 line-through"
                                  : shiftColor(e.shiftName),
                              )}
                              title={`${e.userName}${e.shiftName ? ` · ${e.shiftName}` : ""}`}
                            >
                              {e.userName}
                            </div>
                          ))}
                          {entries.length > 4 && (
                            <p className="pl-1 text-[9px] text-slate-400">
                              +{entries.length - 4} lagi
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile: day-card list */}
          <div className="md:hidden space-y-2">
            {Array.from({ length: lastDayNum }, (_, i) => i + 1).map((d) => {
              const key = dateKey(d);
              const entries = schedulesByDate[key] ?? [];
              const isToday = d === todayDay;
              const dayDate = new Date(year, month - 1, d);
              const dayName = DAY_NAMES[dayDate.getDay()];
              const isSun = dayDate.getDay() === 0;

              // Hari biasa tanpa jadwal disembunyikan; today tanpa jadwal tetap tampil
              // agar admin tahu bahwa jadwal hari ini belum di-set
              if (entries.length === 0 && !isToday) return null;

              return (
                <div
                  key={key}
                  className={cn(
                    "overflow-hidden rounded-2xl border bg-white",
                    isToday ? "border-sky-200" : "border-slate-200",
                  )}
                >
                  {/* Date header */}
                  <div
                    className={cn(
                      "flex items-center gap-2 px-3 py-2",
                      isToday ? "bg-sky-50" : "bg-slate-50",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-black",
                        isToday
                          ? "bg-sky-600 text-white"
                          : isSun
                            ? "bg-rose-50 text-rose-600"
                            : "bg-white text-slate-700",
                      )}
                    >
                      {d}
                    </div>
                    <p
                      className={cn(
                        "text-[11px] font-black uppercase tracking-widest",
                        isToday
                          ? "text-sky-700"
                          : isSun
                            ? "text-rose-500"
                            : "text-slate-500",
                      )}
                    >
                      {dayName}, {MONTH_NAMES[month - 1]}
                    </p>
                  </div>

                  {/* Entries */}
                  {entries.length === 0 ? (
                    <p className="px-3 py-2.5 text-[11px] text-amber-600">
                      Jadwal belum di-set untuk hari ini.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-50 px-3">
                      {entries.map((e, i) => (
                        <div key={`${e.userId}-${i}`} className="flex items-center gap-2 py-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-[9px] font-black text-sky-600">
                            {e.userName.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "truncate text-[12px] font-semibold",
                                e.isOff ? "text-slate-400 line-through" : "text-slate-800",
                              )}
                            >
                              {e.userName}
                            </p>
                            {e.shiftName && (
                              <p className="text-[10px] text-slate-400">
                                {e.shiftName}
                                {e.startTime && ` · ${e.startTime.slice(0, 5)}`}
                              </p>
                            )}
                          </div>
                          {e.isOff ? (
                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-400">
                              Libur
                            </span>
                          ) : (
                            e.shiftName && (
                              <span
                                className={cn(
                                  "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase",
                                  shiftColor(e.shiftName),
                                )}
                              >
                                {e.shiftName}
                              </span>
                            )
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Empty month */}
            {Object.keys(schedulesByDate).length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-12 text-center">
                <CalendarDays size={28} className="mb-2 text-slate-300" />
                <p className="text-sm text-slate-400">
                  Belum ada jadwal untuk {MONTH_NAMES[month - 1]} {year}.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── IZIN TAB ─────────────────────────────────────────────────── */}
      {activeTab === "izin" && (
        <div className="space-y-3">
          {pendingLeaves.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-14 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100">
                <CheckCircle2 size={20} className="text-emerald-600" />
              </div>
              <p className="text-sm font-semibold text-slate-600">Tidak ada pengajuan izin</p>
              <p className="mt-1 text-[11px] text-slate-400">
                Semua pengajuan izin sudah diproses.
              </p>
            </div>
          ) : (
            <>
              <p className="text-[11px] text-slate-400">
                {pendingLeaves.length} pengajuan menunggu keputusan
              </p>
              {pendingLeaves.map((leave) => (
                <LeaveApprovalCard key={leave.id} leave={leave} />
              ))}
            </>
          )}
        </div>
      )}

      {/* ── TUKAR SHIFT TAB ──────────────────────────────────────────── */}
      {activeTab === "tukar" && (
        <div className="space-y-3">
          {pendingSwaps.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-14 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100">
                <CheckCircle2 size={20} className="text-emerald-600" />
              </div>
              <p className="text-sm font-semibold text-slate-600">Tidak ada pengajuan tukar shift</p>
              <p className="mt-1 text-[11px] text-slate-400">
                Semua pengajuan tukar shift sudah diproses.
              </p>
            </div>
          ) : (
            <>
              <p className="text-[11px] text-slate-400">
                {pendingSwaps.length} pengajuan menunggu keputusan
              </p>
              {pendingSwaps.map((swap) => (
                <SwapApprovalCard key={swap.id} swap={swap} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
