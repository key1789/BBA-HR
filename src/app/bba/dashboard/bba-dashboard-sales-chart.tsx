"use client";

import { useState, useMemo, useId } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { SalesMonthlyPoint } from "@/lib/bba-dashboard-metrics";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];

function fmtAxis(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
  return String(Math.round(n));
}

type Metric = "omzet" | "atv" | "atu";

const CFG = {
  omzet: {
    label: "Omzet",
    gradTop: "rgb(99 102 241 / 0.85)",
    gradBot: "rgb(99 102 241 / 0.38)",
    hlTop: "rgb(55 48 163)",
    lineColor: "rgb(30 27 75)",
    fAxis: fmtAxis,
    fTip: (n: number) => `Rp ${n.toLocaleString("id-ID")}`,
    getValue: (p: SalesMonthlyPoint) => p.omzet,
    getTarget: (p: SalesMonthlyPoint) => p.targetOmzet,
    getCapaian: (p: SalesMonthlyPoint) => p.omzetCapaian,
  },
  atv: {
    label: "ATV",
    gradTop: "rgb(16 185 129 / 0.82)",
    gradBot: "rgb(16 185 129 / 0.35)",
    hlTop: "rgb(4 120 87)",
    lineColor: "rgb(2 60 45)",
    fAxis: fmtAxis,
    fTip: (n: number) => `Rp ${n.toLocaleString("id-ID")}`,
    getValue: (p: SalesMonthlyPoint) => p.atv,
    getTarget: (p: SalesMonthlyPoint) => p.targetAtv,
    getCapaian: (p: SalesMonthlyPoint) => p.atvCapaian,
  },
  atu: {
    label: "ATU",
    gradTop: "rgb(14 165 233 / 0.82)",
    gradBot: "rgb(14 165 233 / 0.35)",
    hlTop: "rgb(3 105 161)",
    lineColor: "rgb(2 75 120)",
    fAxis: (n: number) => n.toFixed(1),
    fTip: (n: number) => `${n.toFixed(2)} item`,
    getValue: (p: SalesMonthlyPoint) => p.atu,
    getTarget: (p: SalesMonthlyPoint) => p.targetAtu,
    getCapaian: (p: SalesMonthlyPoint) => p.atuCapaian,
  },
} as const satisfies Record<Metric, object>;

// ─── Component ────────────────────────────────────────────────────────────────

export function BbaDashboardSalesChart({
  points,
  className,
}: {
  points: SalesMonthlyPoint[];
  className?: string;
}) {
  const [metric, setMetric] = useState<Metric>("omzet");
  const uid = useId().replace(/:/g, "");

  const cfg = CFG[metric];

  const chart = useMemo(() => {
    if (points.length === 0) return null;

    const values = points.map(cfg.getValue);
    const rawTargets = points.map(cfg.getTarget).filter((t) => t > 0);
    const avgTarget = rawTargets.length
      ? rawTargets.reduce((a, b) => a + b, 0) / rawTargets.length
      : 0;

    // Canvas
    const W = 720, H = 240;
    const PL = 58, PR = 66, PT = 20, PB = 52;
    const IW = W - PL - PR;
    const IH = H - PT - PB;
    const baseY = PT + IH;

    const rawMax = Math.max(...values, avgTarget, 1);
    const yMax = rawMax * 1.15;

    const n = points.length;
    const slotW = IW / n;
    const barW = Math.min(slotW * 0.6, 50);

    const xCx = (i: number) => PL + slotW * i + slotW / 2;
    const yAt = (v: number) => PT + IH - (v / yMax) * IH;
    const bH = (v: number) => Math.max((v / yMax) * IH, 2);

    const ticks = Array.from({ length: 5 }, (_, t) => {
      const v = (yMax * t) / 4;
      return { y: yAt(v), label: cfg.fAxis(v) };
    });

    const bars = points.map((p, i) => {
      const v = cfg.getValue(p);
      return {
        i,
        v,
        capaian: cfg.getCapaian(p),
        cx: xCx(i),
        bTop: yAt(v),
        bH: bH(v),
        bW: barW,
        label: MONTH_SHORT[(p.month - 1) % 12] ?? "",
        sub: `'${String(p.year).slice(2)}`,
        ym: p.yearMonth,
        tip: `${MONTH_SHORT[(p.month - 1) % 12]} ${p.year}: ${cfg.fTip(v)}${cfg.getCapaian(p) > 0 ? ` (${cfg.getCapaian(p)}%)` : ""}`,
        isZero: v <= 0,
      };
    });

    const trendPath = bars
      .map((b, i) => `${i === 0 ? "M" : "L"} ${b.cx.toFixed(2)} ${(b.isZero ? baseY : b.bTop).toFixed(2)}`)
      .join(" ");

    const targetY = avgTarget > 0 ? yAt(avgTarget) : null;

    return { W, H, PL, PR, PT, PB, baseY, ticks, bars, trendPath, targetY, avgTarget, barW };
  }, [points, cfg]);

  if (!chart) {
    return (
      <div className={cn("w-full", className)}>
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-slate-100 bg-slate-50/60 text-[13px] font-medium text-slate-500">
          Belum ada data untuk periode ini.
        </div>
      </div>
    );
  }

  const { W, H, PL, PR, PT, baseY, ticks, bars, trendPath, targetY, avgTarget } = chart;

  return (
    <div className={cn("w-full space-y-3", className)}>
      {/* Metric toggle + legend */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5">
          {(["omzet", "atv", "atu"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={cn(
                "px-3.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wide transition-all",
                metric === m
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              {CFG[m].label}
            </button>
          ))}
        </div>

        {targetY !== null && (
          <span className="text-[9px] font-bold text-amber-600 flex items-center gap-1.5 ml-auto">
            <svg width={18} height={6}>
              <line
                x1={0} y1={3} x2={18} y2={3}
                stroke="rgb(251 146 60)"
                strokeWidth={2}
                strokeDasharray="4 2"
              />
            </svg>
            Avg target {cfg.fAxis(avgTarget)}
          </span>
        )}
      </div>

      {/* Chart */}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="min-w-[min(100%,720px)] w-full h-auto"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Grafik ${cfg.label} per bulan`}
        >
          <defs>
            <linearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cfg.gradTop} />
              <stop offset="100%" stopColor={cfg.gradBot} />
            </linearGradient>
          </defs>

          {/* Grid + Y-axis labels */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={PL} x2={W - PR}
                y1={t.y} y2={t.y}
                stroke="rgb(148 163 184)"
                strokeOpacity={i === 0 ? 0 : 0.12}
                strokeWidth={1}
              />
              <text x={4} y={t.y + 4} fontSize={9} fill="rgb(148 163 184)" fontWeight={600}>
                {t.label}
              </text>
            </g>
          ))}

          {/* Baseline */}
          <line
            x1={PL} x2={W - PR}
            y1={baseY} y2={baseY}
            stroke="rgb(148 163 184)" strokeOpacity={0.2} strokeWidth={1.5}
          />

          {/* Target line */}
          {targetY !== null && (
            <>
              <line
                x1={PL} x2={W - PR}
                y1={targetY} y2={targetY}
                stroke="rgb(251 146 60)"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                strokeOpacity={0.85}
              />
              <text
                x={W - PR + 5} y={targetY + 3.5}
                fontSize={8.5} fill="rgb(217 119 6)" fontWeight={800}
              >
                Target
              </text>
              <text
                x={PL - 3} y={targetY + 3.5}
                textAnchor="end"
                fontSize={8.5} fill="rgb(217 119 6)" fontWeight={800}
              >
                {cfg.fAxis(avgTarget)}
              </text>
            </>
          )}

          {/* Bars */}
          {bars.map((bar) => (
            <g key={bar.ym}>
              {bar.isZero ? (
                <rect
                  x={bar.cx - bar.bW / 2} y={baseY - 2}
                  width={bar.bW} height={2}
                  fill="rgb(203 213 225)" rx={1}
                />
              ) : (
                <motion.rect
                  x={bar.cx - bar.bW / 2} y={bar.bTop}
                  width={bar.bW} height={bar.bH}
                  fill={`url(#${uid}g)`}
                  rx={Math.min(5, bar.bW * 0.28)}
                  style={{ transformOrigin: `${bar.cx}px ${baseY}px` }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: 0.04 + bar.i * 0.028, duration: 0.42, ease: "easeOut" }}
                >
                  <title>{bar.tip}</title>
                </motion.rect>
              )}

              {/* X-axis month label */}
              <text
                x={bar.cx} y={baseY + 14}
                textAnchor="middle" fontSize={9.5} fontWeight={600}
                fill="rgb(100 116 139)"
              >
                {bar.label}
              </text>
              {/* X-axis year sublabel */}
              <text
                x={bar.cx} y={baseY + 26}
                textAnchor="middle" fontSize={8.5} fontWeight={500}
                fill="rgb(148 163 184)"
              >
                {bar.sub}
              </text>
            </g>
          ))}

          {/* Trend line — white outline + colored stroke */}
          {bars.length > 1 && (
            <>
              <motion.path
                d={trendPath}
                fill="none" stroke="white"
                strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
                strokeOpacity={0.7}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.85, ease: "easeInOut", delay: 0.2 }}
              />
              <motion.path
                d={trendPath}
                fill="none" stroke={cfg.lineColor}
                strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
                strokeOpacity={0.65}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.85, ease: "easeInOut", delay: 0.2 }}
              />
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
