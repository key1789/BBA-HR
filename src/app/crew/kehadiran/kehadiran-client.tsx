"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera, FileText, ArrowLeftRight, X,
  CalendarDays, Clock, Loader2, CheckCircle2, AlertCircle,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  clockInAction, requestLeaveAction, requestShiftSwapAction,
  cancelLeaveRequestAction, cancelShiftSwapAction,
} from "@/actions/attendance";
import { toast } from "sonner";

type Props = {
  metrics: { hariKerja: number; terlambat: number; izin: number };
  attendances: any[];
  leaves: any[];
  swaps: any[];
  crewList: any[];
  schedules: any[];
  swapCandidateUserIdsByDate: Record<string, string[]>;
  addonAbsensi: boolean;
  todayDateKey: string;   // Real WIB today (YYYY-MM-DD) — for banner & today highlight
  calMonthKey: string;    // Viewed month (YYYY-MM) — may differ from today's month
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert ISO timestamp to WIB date string (YYYY-MM-DD), avoiding browser timezone issues */
function toWIBDate(isoString: string): string {
  const ms = new Date(isoString).getTime() + 7 * 3600 * 1000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Convert ISO timestamp to WIB time string (HH:MM) */
function toWIBTime(isoString: string): string {
  const ms = new Date(isoString).getTime() + 7 * 3600 * 1000;
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** Parse a YYYY-MM-DD string as a local date (avoids UTC-midnight off-by-one) */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/** Compress an image file, downscaling if wider than maxWidth */
function compressImage(
  file: File,
  maxWidth: number,
  quality: number,
  onDone: (dataUrl: string) => void,
) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      onDone(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = ev.target?.result as string;
  };
  reader.readAsDataURL(file);
}

const LEAVE_TYPE_LABEL: Record<string, string> = {
  sakit: "Sakit",
  cuti_tahunan: "Cuti Tahunan",
  izin_lainnya: "Keperluan Lainnya",
};

// ── Shift color palette — hex values to bypass Tailwind purge ────────────────
// (Dynamic Tailwind class names built via template literals get purged by JIT.
//  Using inline style={{ }} is the safe alternative for runtime-computed colors.)

const SHIFT_COLOR_PALETTE = [
  { bgHex: "#fff7ed", borderHex: "#fed7aa", dayColor: "#c2410c", shiftColor: "#ea580c" }, // orange
  { bgHex: "#ecfeff", borderHex: "#a5f3fc", dayColor: "#0e7490", shiftColor: "#06b6d4" }, // cyan
  { bgHex: "#f0fdf4", borderHex: "#bbf7d0", dayColor: "#15803d", shiftColor: "#16a34a" }, // green
  { bgHex: "#eef2ff", borderHex: "#c7d2fe", dayColor: "#4338ca", shiftColor: "#6366f1" }, // indigo
  { bgHex: "#fdf2f8", borderHex: "#f9a8d4", dayColor: "#be185d", shiftColor: "#ec4899" }, // pink
  { bgHex: "#eff6ff", borderHex: "#bfdbfe", dayColor: "#1d4ed8", shiftColor: "#3b82f6" }, // blue
];

function getShiftColor(shiftId: string) {
  let hash = 0;
  for (let i = 0; i < shiftId.length; i++) {
    hash = ((hash * 31) + shiftId.charCodeAt(i)) >>> 0;
  }
  return SHIFT_COLOR_PALETTE[hash % SHIFT_COLOR_PALETTE.length]!;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LegendItem({
  bgCls, bgHex, borderHex, label,
}: {
  bgCls?: string;
  bgHex?: string;
  borderHex?: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <div
        className={cn("w-3 h-3 rounded-sm border flex-shrink-0", bgCls)}
        style={bgHex ? { backgroundColor: bgHex, borderColor: borderHex } : undefined}
      />
      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wide">{label}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg =
    status === "approved"      ? { cls: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "Disetujui"      } :
    status === "rejected"      ? { cls: "bg-red-100 text-red-700 border-red-200",             label: "Ditolak"        } :
    status === "pending_admin" ? { cls: "bg-sky-100 text-sky-700 border-sky-200",             label: "Review Admin"   } :
    status === "pending_crew"  ? { cls: "bg-amber-100 text-amber-700 border-amber-200",       label: "Menunggu Rekan" } :
                                 { cls: "bg-amber-100 text-amber-700 border-amber-200",       label: "Menunggu"       };
  return (
    <span className={cn(
      "inline-flex shrink-0 rounded-xl border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide",
      cfg.cls,
    )}>
      {cfg.label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function KehadiranClient({
  metrics, attendances, leaves, swaps, crewList, schedules,
  swapCandidateUserIdsByDate, addonAbsensi, todayDateKey, calMonthKey,
}: Props) {
  const router = useRouter();

  // Compute dynamic tab default before useState (valid — only hooks have ordering constraints)
  const _todayAtt = addonAbsensi
    ? attendances.find((a: any) => toWIBDate(a.clock_in_time) === todayDateKey)
    : undefined;

  const [activeTab, setActiveTab] = useState<"kalender" | "log" | "pengajuan">(
    addonAbsensi && !!_todayAtt ? "log" : "kalender",
  );

  // Modal visibility
  const [showAbsenModal, setShowAbsenModal]   = useState(false);
  const [showIzinModal, setShowIzinModal]     = useState(false);
  const [showTukarModal, setShowTukarModal]   = useState(false);

  // Pending state for each modal form
  const [isAbsenPending, setIsAbsenPending]   = useState(false);
  const [isIzinPending, setIsIzinPending]     = useState(false);
  const [isTukarPending, setIsTukarPending]   = useState(false);

  // Photo states
  const [photoData, setPhotoData]               = useState<string | null>(null);
  const [isCompressing, setIsCompressing]       = useState(false);
  const [leavePhotoData, setLeavePhotoData]     = useState<string | null>(null);
  const [isCompressingLeave, setIsCompressingLeave] = useState(false);

  // Izin form — track start date so end_date can enforce min
  const [izinStartDate, setIzinStartDate] = useState("");

  // Cancel state — tracks which request ID is being deleted
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  // Swap schedule selection
  const [selectedRequesterScheduleId, setSelectedRequesterScheduleId] = useState("");

  // ── Calendar computation ─────────────────────────────────────────────────
  // calYear/calMonth: derived from calMonthKey (the viewed month, may ≠ today)
  // todayDateKey: used only for "today" highlight and banner state
  const [calYear, calMonth] = calMonthKey.split("-").map(Number);
  const daysInMonth     = new Date(calYear!, calMonth!, 0).getDate();
  const firstDayOfMonth = new Date(calYear!, calMonth! - 1, 1).getDay();
  const monthName = new Date(calYear!, calMonth! - 1, 1).toLocaleDateString("id-ID", {
    month: "long", year: "numeric",
  });
  const scheduleByDate = new Map<string, any>(
    schedules.map((s: any) => [String(s.schedule_date).slice(0, 10), s]),
  );
  // Dates where the crew has a clock-in record this month (converted to WIB date)
  const attendedDates = new Set<string>(
    attendances.map((a: any) => toWIBDate(a.clock_in_time)),
  );
  const lateDates = new Set<string>(
    attendances.filter((a: any) => a.is_late).map((a: any) => toWIBDate(a.clock_in_time)),
  );
  const approvedLeaveDateKeys = new Set<string>();
  for (const leave of leaves) {
    if ((leave as any).status !== "approved") continue;
    const startRaw = (leave as any).start_date;
    const endRaw   = (leave as any).end_date;
    if (!startRaw || !endRaw) continue;
    const start = parseLocalDate(String(startRaw));
    const end   = parseLocalDate(String(endRaw));
    for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
      approvedLeaveDateKeys.add(
        `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`,
      );
    }
  }

  // ── Swap candidate helpers ────────────────────────────────────────────────
  const selectedRequesterSchedule = schedules.find((s: any) => s.id === selectedRequesterScheduleId);
  const selectedRequesterDate = selectedRequesterSchedule?.schedule_date
    ? String(selectedRequesterSchedule.schedule_date).slice(0, 10) : "";
  const eligibleTargetIds = new Set(
    selectedRequesterDate ? (swapCandidateUserIdsByDate[selectedRequesterDate] ?? []) : [],
  );
  const availableSwapTargets = selectedRequesterDate
    ? crewList.filter((c: any) => eligibleTargetIds.has(c.id))
    : crewList;

  // ── Today-focused derived values ──────────────────────────────────────────
  const todaySchedule   = schedules.find((s: any) => String(s.schedule_date).slice(0, 10) === todayDateKey);
  const todayAttendance = attendances.find((a: any) => toWIBDate(a.clock_in_time) === todayDateKey);

  // Collect unique shift IDs/names for the legend (skip off-days and missing shift_id)
  const uniqueShifts: { id: string; name: string }[] = [];
  const seenShiftIds = new Set<string>();
  for (const s of schedules) {
    if ((s as any).is_off || !(s as any).shift_name || !(s as any).shift_id) continue;
    if (!seenShiftIds.has((s as any).shift_id)) {
      seenShiftIds.add((s as any).shift_id);
      uniqueShifts.push({ id: (s as any).shift_id, name: (s as any).shift_name });
    }
  }

  // Banner shown at top of page (only when addon is active and there's a schedule today)
  type BannerState = "libur" | "hadir" | "terlambat" | "belum_absen" | null;
  const bannerState: BannerState =
    !addonAbsensi || !todaySchedule                ? null :
    (todaySchedule as any).is_off                  ? "libur" :
    !todayAttendance                               ? "belum_absen" :
    (todayAttendance as any).is_late               ? "terlambat" :
                                                     "hadir";
  const todayClockIn = todayAttendance
    ? toWIBTime((todayAttendance as any).clock_in_time)
    : null;

  // ── Photo handlers ────────────────────────────────────────────────────────
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCompressing(true);
    compressImage(file, 800, 0.7, (url) => { setPhotoData(url); setIsCompressing(false); });
  };

  const handleLeavePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCompressingLeave(true);
    compressImage(file, 1200, 0.7, (url) => { setLeavePhotoData(url); setIsCompressingLeave(false); });
  };

  // ── Cancel handlers ───────────────────────────────────────────────────────
  const handleCancelLeave = async (leaveId: string) => {
    setCancelingId(leaveId);
    try {
      const res = await cancelLeaveRequestAction(leaveId);
      if (res?.error) { toast.error(res.error); return; }
      toast.success("Pengajuan izin berhasil dibatalkan.");
      router.refresh();
    } finally {
      setCancelingId(null);
    }
  };

  const handleCancelSwap = async (swapId: string) => {
    setCancelingId(swapId);
    try {
      const res = await cancelShiftSwapAction(swapId);
      if (res?.error) { toast.error(res.error); return; }
      toast.success("Pengajuan tukar shift berhasil dibatalkan.");
      router.refresh();
    } finally {
      setCancelingId(null);
    }
  };

  // ── Tab definitions (Log Absen only shown when absensi addon is active) ──
  const TABS: { key: "kalender" | "log" | "pengajuan"; label: string; Icon: any }[] = [
    { key: "kalender", label: "Kalender",  Icon: CalendarDays },
    ...(addonAbsensi ? [{ key: "log" as const, label: "Log Absen", Icon: Clock }] : []),
    { key: "pengajuan", label: "Pengajuan", Icon: FileText },
  ];

  // ── Calendar cell — pure schedule view (no attendance state) ────────────────
  // Attendance data (hadir/terlambat/izin) belongs in the Log tab, not here.
  // This cell only shows: which shift is scheduled, OFF days, and today's ring.
  function CalendarCell({ day }: { day: number }) {
    const dateKey = `${calYear}-${String(calMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const sch     = scheduleByDate.get(dateKey);
    const isToday = dateKey === todayDateKey;
    const isOff   = sch?.is_off === true;

    // Shift color via inline style (bypasses Tailwind JIT purge for dynamic classes)
    const sc = (sch && !isOff)
      ? getShiftColor((sch as any).shift_id ?? (sch as any).shift_name ?? "")
      : null;

    const hasApprovedLeave = approvedLeaveDateKeys.has(dateKey);

    return (
      <div
        className={cn(
          "relative h-14 sm:h-16 rounded-xl border p-1 flex flex-col justify-between",
          // Today ring — sits on top of any background color
          isToday && "ring-2 ring-sky-400 ring-offset-1",
          // Fallback classes for off / no-schedule cells
          isOff        ? "bg-slate-100 border-slate-200" :
          !sch         ? "bg-white border-slate-100" :
          /* shift cell with inline style below */ "border",
        )}
        style={sc ? { backgroundColor: sc.bgHex, borderColor: sc.borderHex } : undefined}
      >
        {/* Approved leave indicator dot — top-right corner */}
        {hasApprovedLeave && (
          <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-violet-400 shadow-sm" />
        )}

        {/* Day number */}
        <span
          className={cn(
            "text-[10px] font-black leading-none",
            isOff ? "text-slate-400" : !sch ? "text-slate-300" : "",
          )}
          style={sc ? { color: sc.dayColor } : undefined}
        >
          {day}
        </span>

        {/* Shift label */}
        {sch && (
          <span
            className={cn(
              "text-[8px] sm:text-[9px] font-black uppercase truncate leading-none",
              isOff ? "text-slate-400" : "",
            )}
            style={sc ? { color: sc.shiftColor } : undefined}
          >
            {isOff ? "OFF" : (sch.shift_name ?? "-")}
          </span>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-4">

      {/* ── TODAY STATUS BANNER ── */}
      {bannerState && (
        <div className={cn(
          "rounded-2xl border px-4 py-3 flex items-center justify-between gap-3",
          bannerState === "libur"       && "bg-slate-50 border-slate-200",
          bannerState === "hadir"       && "bg-emerald-50 border-emerald-200",
          bannerState === "terlambat"   && "bg-rose-50 border-rose-200",
          bannerState === "belum_absen" && "bg-amber-50 border-amber-200",
        )}>
          <div>
            <p className={cn(
              "text-[9px] font-black uppercase tracking-widest mb-0.5",
              bannerState === "libur"       && "text-slate-400",
              bannerState === "hadir"       && "text-emerald-500",
              bannerState === "terlambat"   && "text-rose-400",
              bannerState === "belum_absen" && "text-amber-500",
            )}>
              Hari Ini
            </p>
            <p className={cn(
              "font-black text-sm",
              bannerState === "libur"       && "text-slate-600",
              bannerState === "hadir"       && "text-emerald-700",
              bannerState === "terlambat"   && "text-rose-700",
              bannerState === "belum_absen" && "text-amber-700",
            )}>
              {bannerState === "libur"       ? "Hari Ini Libur" :
               bannerState === "hadir"       ? `Sudah Hadir · ${todayClockIn} WIB` :
               bannerState === "terlambat"   ? `Terlambat · ${todayClockIn} WIB` :
                                              "Belum Absen Hari Ini"}
            </p>
          </div>
          {bannerState === "belum_absen" && (
            <button
              type="button"
              onClick={() => setShowAbsenModal(true)}
              className="shrink-0 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-[9px] font-black uppercase tracking-widest px-3 py-2 transition-colors"
            >
              Absen Sekarang
            </button>
          )}
        </div>
      )}

      {/* ── METRICS ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-slate-100">
          <div className="px-3 py-3 text-center">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Hadir</p>
            <p className="text-2xl font-black text-sky-600">{metrics.hariKerja}</p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Terlambat</p>
            <p className="text-2xl font-black text-amber-500">{metrics.terlambat}</p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Total Izin</p>
            <p className="text-2xl font-black text-slate-700">{metrics.izin}</p>
          </div>
        </div>
      </div>

      {/* ── QUICK ACTIONS ── */}
      {addonAbsensi ? (
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setShowAbsenModal(true)}
            className="bg-white border border-slate-200/60 rounded-[2rem] p-4 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 hover:border-sky-200 hover:shadow-md transition-all group"
          >
            <div className="w-11 h-11 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Camera size={22} />
            </div>
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-600 text-center leading-tight">
              Absen Foto
            </span>
          </button>
          <button
            onClick={() => setShowIzinModal(true)}
            className="bg-white border border-slate-200/60 rounded-[2rem] p-4 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 hover:border-amber-200 hover:shadow-md transition-all group"
          >
            <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <FileText size={22} />
            </div>
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-600 text-center leading-tight">
              Pengajuan Izin
            </span>
          </button>
          <button
            onClick={() => setShowTukarModal(true)}
            className="bg-white border border-slate-200/60 rounded-[2rem] p-4 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 hover:border-emerald-200 hover:shadow-md transition-all group"
          >
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <ArrowLeftRight size={22} />
            </div>
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-600 text-center leading-tight">
              Tukar Shift
            </span>
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowIzinModal(true)}
          className="bg-white border border-slate-200/60 rounded-2xl px-4 py-3 flex items-center gap-3 w-full hover:bg-amber-50 hover:border-amber-100 hover:shadow-sm transition-all group"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <FileText size={18} />
          </div>
          <span className="font-black text-sm text-slate-700">Pengajuan Izin / Cuti</span>
        </button>
      )}

      {/* ── TABS ── */}
      <div className="flex bg-white border border-slate-100 p-1 rounded-2xl shadow-sm">
        {TABS.map(({ key, label, Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all",
                isActive ? "bg-sky-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-600",
              )}
            >
              <Icon size={12} />
              <span className="hidden xs:inline sm:inline">{label}</span>
              <span className="xs:hidden sm:hidden">{label.split(" ")[0]}</span>
            </button>
          );
        })}
      </div>

      {/* ── TAB: KALENDER ── */}
      {activeTab === "kalender" && (
        <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-100 shadow-sm animate-in fade-in duration-300">

          {/* Calendar nav header */}
          {(() => {
            // Compute boundary keys for prev/next
            const [todayY, todayM] = todayDateKey.split("-").map(Number);
            const pad = (n: number) => String(n).padStart(2, "0");

            const prevDate = new Date(calYear!, calMonth! - 2, 1);
            const nextDate = new Date(calYear!, calMonth!, 1);
            const prevKey  = `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}`;
            const nextKey  = `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}`;
            const minKey   = `${new Date(todayY!, todayM! - 2, 1).getFullYear()}-${pad(new Date(todayY!, todayM! - 2, 1).getMonth() + 1)}`;
            const maxKey   = `${new Date(todayY!, todayM! + 1, 1).getFullYear()}-${pad(new Date(todayY!, todayM! + 1, 1).getMonth() + 1)}`;
            const todayKey = `${todayY}-${pad(todayM!)}`;

            const canGoPrev = prevKey >= minKey;
            const canGoNext = nextKey <= maxKey;
            const isCurrentMonth = calMonthKey === todayKey;

            const navigate = (key: string) => {
              router.push(key === todayKey ? "/crew/kehadiran" : `/crew/kehadiran?month=${key}`);
            };

            return (
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-slate-800 text-sm uppercase tracking-wide">Kalender Shift</h3>
                  {!isCurrentMonth && (
                    <button
                      type="button"
                      onClick={() => navigate(todayKey)}
                      className="text-[9px] font-black uppercase tracking-wide text-sky-600 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full hover:bg-sky-100 transition-colors"
                    >
                      Bulan Ini
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={!canGoPrev}
                    onClick={() => navigate(prevKey)}
                    className="w-7 h-7 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span className="text-[11px] font-black text-slate-600 min-w-[90px] text-center">{monthName}</span>
                  <button
                    type="button"
                    disabled={!canGoNext}
                    onClick={() => navigate(nextKey)}
                    className="w-7 h-7 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Legend — hanya jadwal, bukan status absensi */}
          <div className="flex items-center gap-x-3 gap-y-1.5 mb-3 flex-wrap">
            {/* OFF */}
            <LegendItem bgCls="bg-slate-100 border-slate-200" label="Libur" />
            {/* Hari Ini — ring indicator */}
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-white border border-slate-200 ring-2 ring-sky-400 ring-offset-[1.5px]" />
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wide">Hari Ini</span>
            </div>
            {/* Izin approved — dot indicator */}
            <div className="flex items-center gap-1.5">
              <div className="relative w-3 h-3 rounded-sm bg-slate-50 border border-slate-200">
                <div className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-violet-400" />
              </div>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wide">Izin</span>
            </div>
            {/* Per-shift colors (inline hex, not dynamic Tailwind) */}
            {uniqueShifts.map(({ id, name }) => {
              const c = getShiftColor(id);
              return <LegendItem key={id} bgHex={c.bgHex} borderHex={c.borderHex} label={name} />;
            })}
          </div>

          {/* Day-of-week header */}
          <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-black uppercase text-slate-400 mb-1.5">
            {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`e-${i}`} className="h-14 sm:h-16 rounded-xl bg-slate-50/40 border border-slate-100/50" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => (
              <CalendarCell key={i} day={i + 1} />
            ))}
          </div>

          {schedules.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6 font-bold">
              Belum ada jadwal bulan ini.
            </p>
          )}
        </div>
      )}

      {/* ── TAB: LOG ABSEN ── */}
      {activeTab === "log" && (
        <div className="space-y-3 animate-in fade-in duration-300">
          {attendances.length === 0 && (
            <div className="bg-white rounded-3xl border border-slate-100 p-10 text-center shadow-sm">
              <Clock size={32} className="text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-black text-slate-400 uppercase tracking-wide">Belum ada data absen bulan ini</p>
            </div>
          )}
          {attendances.map((log: any) => {
            // Normalize nested shift data (Supabase may return array or object)
            const sr = log.shift_schedules;
            const schedule = Array.isArray(sr) ? sr[0] : sr;
            const mr = schedule?.master_shifts;
            const shift = Array.isArray(mr) ? mr[0] : mr;
            const shiftName = shift?.shift_name ?? null;
            const clockIn = toWIBTime(log.clock_in_time);
            const wibDate = toWIBDate(log.clock_in_time);
            return (
              <div key={log.id} className="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm">
                <div className="flex items-center gap-3">
                  {/* Photo thumbnail */}
                  {log.photo_url ? (
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={log.photo_url} alt="Absen" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 shrink-0 flex items-center justify-center border border-slate-200">
                      <Camera size={20} className="text-slate-300" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      {parseLocalDate(wibDate).toLocaleDateString("id-ID", {
                        weekday: "long", day: "numeric", month: "long",
                      })}
                    </p>
                    {shiftName && (
                      <p className="text-[10px] font-black text-sky-600 uppercase mt-0.5">{shiftName}</p>
                    )}
                    <p className="font-black text-slate-800 text-sm mt-0.5">
                      {clockIn} WIB
                    </p>
                    {log.is_late && (
                      <span className="inline-flex items-center gap-1 mt-1.5 bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase">
                        <AlertCircle size={9} />
                        Terlambat
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TAB: PENGAJUAN ── */}
      {activeTab === "pengajuan" && (
        <div className="space-y-3 animate-in fade-in duration-300">
          {[...leaves, ...swaps].length === 0 && (
            <div className="bg-white rounded-3xl border border-slate-100 p-10 text-center shadow-sm">
              <FileText size={32} className="text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-black text-slate-400 uppercase tracking-wide">Belum ada pengajuan bulan ini</p>
            </div>
          )}
          {[...leaves, ...swaps]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map((req: any, i) => {
              const isLeave = Boolean(req.leave_type);
              // Swap-specific fields
              const targetName = req.target_user?.full_name ?? null;
              const swapSchedule = req.requester_schedule;
              const swapScheduleDate = swapSchedule?.schedule_date
                ? String(swapSchedule.schedule_date).slice(0, 10) : null;
              const swapShiftMr = swapSchedule?.master_shifts;
              const swapShift = Array.isArray(swapShiftMr) ? swapShiftMr[0] : swapShiftMr;
              const swapShiftName = swapShift?.shift_name ?? null;

              return (
                <div key={i} className="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <p className="font-black text-sm text-slate-800">
                        {isLeave
                          ? (LEAVE_TYPE_LABEL[req.leave_type] ?? req.leave_type)
                          : "Tukar Shift"}
                      </p>
                      {/* Swap: show target name + schedule info */}
                      {!isLeave && targetName && (
                        <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                          Dengan: {targetName}
                        </p>
                      )}
                      {!isLeave && swapScheduleDate && (
                        <p className="text-[10px] font-bold text-sky-600 mt-0.5">
                          {parseLocalDate(swapScheduleDate).toLocaleDateString("id-ID", {
                            day: "numeric", month: "short",
                          })}
                          {swapShiftName && ` · ${swapShiftName}`}
                        </p>
                      )}
                      {/* Leave: show date range */}
                      {isLeave && req.start_date && (
                        <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                          {parseLocalDate(req.start_date).toLocaleDateString("id-ID", {
                            day: "numeric", month: "short",
                          })}
                          {req.end_date && req.end_date !== req.start_date ? (
                            ` — ${parseLocalDate(req.end_date).toLocaleDateString("id-ID", {
                              day: "numeric", month: "short", year: "numeric",
                            })}`
                          ) : (
                            `, ${parseLocalDate(req.start_date).toLocaleDateString("id-ID", {
                              year: "numeric",
                            })}`
                          )}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={req.status} />
                  </div>

                  {req.reason && (
                    <p className="text-xs text-slate-500 font-medium line-clamp-2 bg-slate-50 rounded-xl px-3 py-2 mt-1">
                      {req.reason}
                    </p>
                  )}

                  <div className="flex items-center justify-between mt-2.5 gap-2">
                    <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">
                      {new Date(req.created_at).toLocaleDateString("id-ID", {
                        day: "numeric", month: "long", year: "numeric",
                      })}
                    </p>

                    {/* Batalkan — hanya untuk pengajuan yang masih pending */}
                    {isLeave && req.status === "pending" && (
                      <button
                        type="button"
                        disabled={cancelingId === req.id}
                        onClick={() => handleCancelLeave(req.id)}
                        className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-rose-500 hover:text-rose-700 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                      >
                        {cancelingId === req.id
                          ? <Loader2 size={10} className="animate-spin" />
                          : <X size={10} />
                        }
                        Batalkan
                      </button>
                    )}
                    {!isLeave && (req.status === "pending_crew" || req.status === "pending_admin") && (
                      <button
                        type="button"
                        disabled={cancelingId === req.id}
                        onClick={() => handleCancelSwap(req.id)}
                        className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-rose-500 hover:text-rose-700 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                      >
                        {cancelingId === req.id
                          ? <Loader2 size={10} className="animate-spin" />
                          : <X size={10} />
                        }
                        Batalkan
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: ABSEN FOTO                                                     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {showAbsenModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300 p-3 sm:p-4 flex items-end md:items-center justify-center overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-[2rem] animate-in slide-in-from-bottom-10 duration-300 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-black text-slate-800 tracking-tight">Absen Masuk</h2>
              <button
                onClick={() => { setShowAbsenModal(false); setPhotoData(null); }}
                className="w-8 h-8 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <form action={async (formData) => {
                if (!photoData) { toast.error("Ambil foto selfie terlebih dahulu."); return; }
                setIsAbsenPending(true);
                try {
                  formData.append("photoBase64", photoData);
                  const res = await clockInAction(formData);
                  if (res?.error) { toast.error(res.error); return; }
                  toast.success("Absen berhasil direkam.");
                  setShowAbsenModal(false);
                  setPhotoData(null);
                  router.refresh();
                } finally {
                  setIsAbsenPending(false);
                }
              }}>
                {/* Selfie area */}
                <div className="relative w-full h-52 bg-slate-100 rounded-3xl overflow-hidden border-2 border-dashed border-slate-300 flex flex-col items-center justify-center">
                  {isCompressing ? (
                    <div className="flex flex-col items-center gap-2.5">
                      <Loader2 size={32} className="text-slate-400 animate-spin" />
                      <p className="text-sm font-bold text-slate-500">Memproses foto…</p>
                    </div>
                  ) : photoData ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoData} alt="Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setPhotoData(null)}
                        className="absolute top-3 right-3 bg-white/80 backdrop-blur-md p-2 rounded-full text-slate-700 shadow-sm hover:bg-white transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <Camera size={36} className="text-slate-300 mb-2" />
                      <p className="text-sm font-bold text-slate-500">Ambil Foto Selfie</p>
                      <p className="text-[10px] text-slate-400 mt-1">Tap untuk buka kamera</p>
                      <input
                        type="file"
                        accept="image/*"
                        capture="user"
                        onChange={handlePhotoCapture}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </>
                  )}
                </div>

                <p className="text-[10px] text-slate-400 font-medium text-center leading-relaxed px-2">
                  Pastikan wajah terlihat jelas. Waktu absen dicatat otomatis oleh server.
                </p>

                <button
                  type="submit"
                  disabled={!photoData || isCompressing || isAbsenPending}
                  className="w-full py-4 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-sky-200/60 transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
                >
                  {isAbsenPending ? (
                    <><Loader2 size={14} className="animate-spin" />Menyimpan…</>
                  ) : (
                    <><CheckCircle2 size={14} />Submit Kehadiran</>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: PENGAJUAN IZIN                                                 */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {showIzinModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300 p-3 sm:p-4 flex items-end md:items-center justify-center overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-[2rem] animate-in slide-in-from-bottom-10 duration-300 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-black text-slate-800 tracking-tight">Pengajuan Izin</h2>
              <button
                onClick={() => { setShowIzinModal(false); setLeavePhotoData(null); setIzinStartDate(""); }}
                className="w-8 h-8 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto max-h-[calc(100dvh-8rem)]">
              <form action={async (formData) => {
                setIsIzinPending(true);
                try {
                  if (leavePhotoData) formData.append("photoBase64", leavePhotoData);
                  const res = await requestLeaveAction(formData);
                  if (res?.error) { toast.error(res.error); return; }
                  toast.success(res?.message || "Pengajuan izin berhasil dikirim.");
                  setShowIzinModal(false);
                  setLeavePhotoData(null);
                  setIzinStartDate("");
                  router.refresh();
                } finally {
                  setIsIzinPending(false);
                }
              }} className="space-y-4">

                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Jenis Izin
                  <div className="relative mt-1.5">
                    <select
                      name="leaveType"
                      required
                      className="w-full appearance-none rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-800 bg-slate-50 focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all outline-none"
                    >
                      <option value="sakit">Sakit</option>
                      <option value="cuti_tahunan">Cuti Tahunan</option>
                      <option value="izin_lainnya">Keperluan Lainnya</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Mulai
                    <input
                      type="date"
                      name="startDate"
                      required
                      value={izinStartDate}
                      onChange={(e) => setIzinStartDate(e.target.value)}
                      className="mt-1.5 rounded-2xl bg-slate-50 border border-slate-200 px-3 py-3 text-sm font-bold w-full focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all outline-none"
                    />
                  </label>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Selesai
                    <input
                      type="date"
                      name="endDate"
                      required
                      min={izinStartDate || undefined}
                      className="mt-1.5 rounded-2xl bg-slate-50 border border-slate-200 px-3 py-3 text-sm font-bold w-full focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all outline-none"
                    />
                  </label>
                </div>

                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Alasan Lengkap
                  <textarea
                    name="reason"
                    required
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all resize-none h-20 outline-none"
                  />
                </label>

                {/* Attachment */}
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
                    Lampiran Bukti{" "}
                    <span className="text-slate-300 font-bold normal-case tracking-normal">(opsional)</span>
                  </span>
                  <div className="relative h-28 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center overflow-hidden">
                    {isCompressingLeave ? (
                      <div className="flex items-center gap-2">
                        <Loader2 size={18} className="text-slate-400 animate-spin" />
                        <p className="text-sm font-bold text-slate-400">Memproses…</p>
                      </div>
                    ) : leavePhotoData ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={leavePhotoData} alt="Bukti" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setLeavePhotoData(null)}
                          className="absolute top-2 right-2 bg-white/80 backdrop-blur-md p-1.5 rounded-full text-slate-700 shadow-sm hover:bg-white transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </>
                    ) : (
                      <>
                        <Camera size={22} className="text-slate-300 mb-1.5" />
                        <p className="text-xs font-bold text-slate-400">Foto surat dokter / dokumen</p>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLeavePhotoCapture}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </>
                    )}
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1.5 font-medium">
                    Sangat disarankan untuk pengajuan sakit.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isCompressingLeave || isIzinPending}
                  className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-amber-200/60 transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
                >
                  {isIzinPending ? (
                    <><Loader2 size={14} className="animate-spin" />Mengirim…</>
                  ) : (
                    "Kirim Pengajuan"
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: TUKAR SHIFT                                                    */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {showTukarModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300 p-3 sm:p-4 flex items-end md:items-center justify-center overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-[2rem] animate-in slide-in-from-bottom-10 duration-300 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-black text-slate-800 tracking-tight">Tukar Shift</h2>
              <button
                onClick={() => { setShowTukarModal(false); setSelectedRequesterScheduleId(""); }}
                className="w-8 h-8 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto max-h-[calc(100dvh-8rem)]">
              <form action={async (formData) => {
                setIsTukarPending(true);
                try {
                  const res = await requestShiftSwapAction(formData);
                  if (res?.error) { toast.error(res.error); return; }
                  toast.success(res?.message || "Pengajuan tukar shift berhasil dikirim.");
                  setShowTukarModal(false);
                  setSelectedRequesterScheduleId("");
                  router.refresh();
                } finally {
                  setIsTukarPending(false);
                }
              }} className="space-y-4">

                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Jadwal Saya yang Ingin Ditukar
                  <div className="relative mt-1.5">
                    <select
                      name="requesterScheduleId"
                      required
                      value={selectedRequesterScheduleId}
                      onChange={(e) => setSelectedRequesterScheduleId(e.target.value)}
                      className="w-full appearance-none rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 transition-all outline-none"
                    >
                      <option value="">— Pilih Jadwal —</option>
                      {schedules.map((s: any) => {
                        // Use parseLocalDate to avoid UTC off-by-one
                        const d = parseLocalDate(String(s.schedule_date).slice(0, 10));
                        const label = d.toLocaleDateString("id-ID", {
                          weekday: "short", day: "numeric", month: "short",
                        });
                        return (
                          <option key={s.id} value={s.id}>
                            {label} — {s.is_off ? "OFF" : (s.shift_name ?? "-")}
                          </option>
                        );
                      })}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </label>

                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Tukar Dengan
                  <div className="relative mt-1.5">
                    <select
                      name="targetUserId"
                      required
                      className="w-full appearance-none rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 transition-all outline-none"
                    >
                      <option value="">— Pilih Kru —</option>
                      {availableSwapTargets.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </label>

                {selectedRequesterDate && availableSwapTargets.length === 0 && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 font-bold">
                    Tidak ada kru lain yang memiliki jadwal pada tanggal ini.
                  </p>
                )}

                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Alasan Tukar
                  <textarea
                    name="reason"
                    required
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 transition-all resize-none h-20 outline-none"
                  />
                </label>

                <button
                  type="submit"
                  disabled={isTukarPending}
                  className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-200/60 transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
                >
                  {isTukarPending ? (
                    <><Loader2 size={14} className="animate-spin" />Mengirim…</>
                  ) : (
                    "Ajukan Tukar Shift"
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
