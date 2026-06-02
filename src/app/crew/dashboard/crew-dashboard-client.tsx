"use client";

import { useState, useMemo, useId } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { TrendingUp, BarChart2, Trophy } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = "harian" | "bulanan";
type SortKey = "omzet" | "atv" | "atu" | "sarp";

export type ChartBar = { day: number; omzet: number; isToday: boolean };
export type LeaderboardRow = {
  userId: string;
  fullName: string;
  omzet: number;
  atv: number;
  atu: number;
  sarp: number;
  isMe: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

function fmtCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
  return String(Math.round(n));
}

const SORT_CONFIG: { key: SortKey; label: string; fmt: (n: number) => string }[] = [
  { key: "omzet", label: "Omzet", fmt: fmtCompact },
  { key: "atv",   label: "ATV",   fmt: fmtCompact },
  { key: "atu",   label: "ATU",   fmt: (n) => n.toFixed(1) },
  { key: "sarp",  label: "SARP",  fmt: (n) => `${n.toFixed(0)}%` },
];

// ─── Daily Omzet Chart ────────────────────────────────────────────────────────

function DailyOmzetChart({ bars }: { bars: ChartBar[] }) {
  const uid = useId().replace(/:/g, "");

  const chart = useMemo(() => {
    if (bars.length === 0) return null;

    const W = 700, H = 140;
    const PL = 44, PR = 8, PT = 14, PB = 24;
    const IW = W - PL - PR;
    const IH = H - PT - PB;
    const baseY = PT + IH;

    const values = bars.map((b) => b.omzet);
    const rawMax = Math.max(...values, 1);
    const yMax = rawMax * 1.2;

    const slotW = IW / bars.length;
    const bW = Math.min(Math.max(slotW * 0.65, 4), 16);

    const xCx = (i: number) => PL + slotW * i + slotW / 2;
    const yAt = (v: number) => PT + IH - (v / yMax) * IH;

    const ticks = [0.25, 0.5, 0.75, 1.0].map((f) => ({
      y: yAt(yMax * f),
      label: fmtCompact(yMax * f),
    }));

    const barData = bars.map((b, i) => ({
      ...b,
      i,
      cx: xCx(i),
      bTop: b.omzet > 0 ? yAt(b.omzet) : baseY - 2,
      bH: b.omzet > 0 ? Math.max((b.omzet / yMax) * IH, 2) : 2,
    }));

    const labelDays = new Set([1, 5, 10, 15, 20, 25, 30]);

    return { W, H, baseY, ticks, barData, bW, labelDays };
  }, [bars]);

  if (!chart) {
    return (
      <div className="flex h-24 items-center justify-center text-[11px] text-slate-400 font-medium">
        Belum ada data bulan ini.
      </div>
    );
  }

  const { W, H, baseY, ticks, barData, bW, labelDays } = chart;

  return (
    <div className="overflow-x-auto -mx-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="min-w-[min(100%,700px)] w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Grafik omzet harian bulan ini"
      >
        <defs>
          <linearGradient id={`${uid}n`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(56 189 248 / 0.85)" />
            <stop offset="100%" stopColor="rgb(56 189 248 / 0.35)" />
          </linearGradient>
          <linearGradient id={`${uid}h`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(2 132 199)" />
            <stop offset="100%" stopColor="rgb(2 132 199 / 0.65)" />
          </linearGradient>
        </defs>

        {/* Y gridlines + labels */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={44} x2={W - 8} y1={t.y} y2={t.y}
              stroke="rgb(148 163 184)" strokeOpacity={0.13} strokeWidth={1}
            />
            <text
              x={41} y={t.y + 3.5}
              textAnchor="end" fontSize={8} fill="rgb(148 163 184)" fontWeight={600}
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* Baseline */}
        <line
          x1={44} x2={W - 8} y1={baseY} y2={baseY}
          stroke="rgb(148 163 184)" strokeOpacity={0.22} strokeWidth={1.5}
        />

        {/* Bars */}
        {barData.map((bar) => (
          <g key={bar.day}>
            {bar.omzet <= 0 ? (
              <rect
                x={bar.cx - 2} y={baseY - 2} width={4} height={2}
                fill="rgb(203 213 225)" rx={1}
              />
            ) : (
              <motion.rect
                x={bar.cx - bW / 2} y={bar.bTop}
                width={bW} height={bar.bH}
                fill={bar.isToday ? `url(#${uid}h)` : `url(#${uid}n)`}
                rx={2}
                style={{ transformOrigin: `${bar.cx}px ${baseY}px` }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: 0.01 + bar.i * 0.016, duration: 0.3, ease: "easeOut" }}
              />
            )}

            {/* X-axis label for milestone days only */}
            {labelDays.has(bar.day) && (
              <text
                x={bar.cx} y={baseY + 13}
                textAnchor="middle" fontSize={8.5}
                fontWeight={bar.isToday ? 800 : 600}
                fill={bar.isToday ? "rgb(2 132 199)" : "rgb(100 116 139)"}
              >
                {bar.day}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CrewDashboardClient({
  todayOmzet,
  todayTrx,
  todayProd,
  todayRejected,
  dailyTarget,
  runOmzet,
  runTrx,
  runProd,
  runRejected,
  monthlyTarget,
  chartBars,
  leaderboard,
}: {
  todayOmzet: number;
  todayTrx: number;
  todayProd: number;
  todayRejected: number;
  dailyTarget: number | null;
  runOmzet: number;
  runTrx: number;
  runProd: number;
  runRejected: number;
  monthlyTarget: number | null;
  chartBars: ChartBar[];
  leaderboard: LeaderboardRow[];
}) {
  const [view, setView] = useState<ViewMode>("bulanan");
  const [sort, setSort] = useState<SortKey>("omzet");

  // Card 1 values depending on active view
  const activeOmzet   = view === "harian" ? todayOmzet   : runOmzet;
  const activeTrx     = view === "harian" ? todayTrx     : runTrx;
  const activeProd    = view === "harian" ? todayProd    : runProd;
  const activeRejected = view === "harian" ? todayRejected : runRejected;
  const activeTarget  = view === "harian" ? dailyTarget  : monthlyTarget;
  const capaianPct    = activeTarget && activeTarget > 0
    ? Math.min(100, (activeOmzet / activeTarget) * 100)
    : null;

  // Sorted leaderboard
  const sortedLeaderboard = useMemo(
    () => [...leaderboard].sort((a, b) => b[sort] - a[sort]),
    [leaderboard, sort],
  );

  const myRank    = sortedLeaderboard.findIndex((r) => r.isMe) + 1;
  const sortCfg   = SORT_CONFIG.find((s) => s.key === sort)!;

  return (
    <>
      {/* ── Card 1: Omzet & metrics ── */}
      <div className="bg-white rounded-3xl px-5 py-4 border border-slate-100 shadow-sm">
        {/* Header + view toggle */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-sky-600 shrink-0" />
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Performa
            </p>
          </div>
          <div className="flex gap-0.5 bg-slate-100 rounded-xl p-0.5">
            {(["harian", "bulanan"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                  view === v
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-400 hover:text-slate-600",
                )}
              >
                {v === "harian" ? "Hari Ini" : "Bulan Ini"}
              </button>
            ))}
          </div>
        </div>

        {/* Omzet + progress bar */}
        <div className="mb-3">
          <div className="flex items-end justify-between mb-1.5">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                {view === "harian" ? "Omzet Hari Ini" : "Omzet Running"}
              </p>
              <p className="text-xl font-black text-slate-900 leading-none">
                {IDR.format(activeOmzet)}
              </p>
            </div>
            {activeTarget !== null && (
              <div className="text-right">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                  Target
                </p>
                <p className="text-xs font-black text-slate-500">{IDR.format(activeTarget)}</p>
              </div>
            )}
          </div>
          {capaianPct !== null ? (
            <>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    capaianPct >= 100 ? "bg-emerald-500"
                    : capaianPct >= 75  ? "bg-sky-500"
                    : capaianPct >= 50  ? "bg-amber-500"
                    : "bg-rose-400",
                  )}
                  style={{ width: `${capaianPct}%` }}
                />
              </div>
              <p className="text-[9px] font-bold text-slate-400 mt-1">
                {capaianPct.toFixed(1)}% dari target
              </p>
            </>
          ) : (
            <div className="h-1 bg-slate-100 rounded-full" />
          )}
        </div>

        {/* 3 metric chips */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-50 rounded-2xl px-3 py-2">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Nota</p>
            <p className="text-sm font-black text-slate-800 mt-0.5">{activeTrx}</p>
          </div>
          <div className="bg-slate-50 rounded-2xl px-3 py-2">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Produk</p>
            <p className="text-sm font-black text-slate-800 mt-0.5">{activeProd}</p>
          </div>
          <div className="bg-slate-50 rounded-2xl px-3 py-2">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Ditolak</p>
            <p className={cn(
              "text-sm font-black mt-0.5",
              activeRejected > 0 ? "text-rose-600" : "text-slate-800",
            )}>
              {activeRejected}
            </p>
          </div>
        </div>
      </div>

      {/* ── Card 2: Daily omzet chart ── */}
      <div className="bg-white rounded-3xl px-5 py-4 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 size={14} className="text-sky-600 shrink-0" />
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            Omzet Harian Bulan Ini
          </p>
        </div>
        <DailyOmzetChart bars={chartBars} />
      </div>

      {/* ── Card 3: Leaderboard ── */}
      <div className="bg-white rounded-3xl px-5 py-4 border border-slate-100 shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Trophy size={14} className="text-amber-500 shrink-0" />
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Leaderboard Bulan Ini
            </p>
          </div>
          {myRank > 0 && (
            <div className="flex items-center gap-1 bg-sky-50 border border-sky-200 rounded-xl px-2.5 py-1">
              <p className="text-[10px] font-black text-sky-700">
                #{myRank} dari {leaderboard.length}
              </p>
            </div>
          )}
        </div>

        {/* Sort filter pills */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {SORT_CONFIG.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              className={cn(
                "rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest transition-colors",
                sort === s.key
                  ? "bg-sky-600 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Rows */}
        {leaderboard.length === 0 ? (
          <p className="text-[11px] text-slate-400 font-medium text-center py-4">
            Belum ada data leaderboard bulan ini.
          </p>
        ) : (
          <div className="space-y-1.5">
            {sortedLeaderboard.map((row, idx) => (
              <div
                key={row.userId}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-2xl",
                  row.isMe
                    ? "bg-sky-50 border border-sky-100"
                    : "bg-slate-50",
                )}
              >
                {/* Rank badge */}
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[9px] font-black",
                    idx === 0 ? "bg-amber-400 text-amber-950"
                    : idx === 1 ? "bg-slate-300 text-slate-700"
                    : idx === 2 ? "bg-orange-300 text-orange-900"
                    : "bg-slate-100 text-slate-500",
                  )}
                >
                  {idx + 1}
                </div>

                {/* Name */}
                <p
                  className={cn(
                    "flex-1 text-[11px] font-black truncate min-w-0",
                    row.isMe ? "text-sky-800" : "text-slate-700",
                  )}
                >
                  {row.fullName}
                  {row.isMe && (
                    <span className="ml-1 text-[9px] font-bold text-sky-500 normal-case">
                      (Saya)
                    </span>
                  )}
                </p>

                {/* Mobile: active sort metric only */}
                <div className="flex gap-2 md:hidden shrink-0">
                  <div className="text-right">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                      {sortCfg.label}
                    </p>
                    <p className="text-xs font-black text-slate-800">
                      {sortCfg.fmt(row[sort])}
                    </p>
                  </div>
                </div>

                {/* Desktop: all 4 metrics */}
                <div className="hidden md:flex items-center gap-4 shrink-0">
                  {SORT_CONFIG.map((s) => (
                    <div key={s.key} className="text-right w-14">
                      <p
                        className={cn(
                          "text-[8px] font-black uppercase tracking-widest",
                          sort === s.key ? "text-sky-500" : "text-slate-400",
                        )}
                      >
                        {s.label}
                      </p>
                      <p
                        className={cn(
                          "text-xs font-black",
                          sort === s.key ? "text-sky-700" : "text-slate-700",
                        )}
                      >
                        {s.fmt(row[s.key])}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
