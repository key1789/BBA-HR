"use client";

import { motion } from "framer-motion";
import { useId, useMemo } from "react";
import { cn } from "@/lib/utils";

export type LineChartPoint = { dateKey: string; amount: number };

function formatAxisIdr(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
  return String(Math.round(n));
}

function shortDayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00+07:00`);
  return d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric" });
}

/**
 * Bar chart with optional reference lines (target / average).
 *
 * Props:
 *   points          — daily data points (dateKey + amount)
 *   highlightDateKey — selected date; bar is rendered brighter with a top dot
 *   targetLine      — optional horizontal amber dashed line (daily target omzet)
 *   averageLine     — optional horizontal indigo dashed line (employee MTD avg)
 *   onDateClick     — click/tap a bar to change the selected date
 */
export function CustomLineChart({
  points,
  highlightDateKey,
  targetLine,
  averageLine,
  onDateClick,
  className,
}: {
  points: LineChartPoint[];
  highlightDateKey?: string;
  targetLine?: number;
  averageLine?: number;
  onDateClick?: (dateKey: string) => void;
  className?: string;
}) {
  const barGradId = useId().replace(/:/g, "");
  const hlGradId = useId().replace(/:/g, "");

  const chart = useMemo(() => {
    const n = points.length;
    if (n === 0) return null;

    const w = 720;
    const h = 220;
    const padL = 52;
    const padR = 58; // room for "Target" / "Avg" labels
    const padT = 18;
    const padB = 50;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const baseY = padT + innerH;

    const amounts = points.map((p) => p.amount);
    const refMax = Math.max(targetLine ?? 0, averageLine ?? 0);
    const rawMax = Math.max(...amounts, refMax, 1);
    const maxY = rawMax * 1.14; // 14% headroom so top bar isn't flush

    const yAt = (v: number) => padT + innerH - (v / maxY) * innerH;

    // Bar geometry
    const cellW = innerW / n;
    const barW = Math.min(Math.max(cellW * 0.68, 3), 34);
    const barXLeft = (i: number) => padL + i * cellW + (cellW - barW) / 2;
    const barCx = (i: number) => padL + i * cellW + cellW / 2;

    // Y-axis ticks
    const tickCount = 4;
    const ticks: { y: number; label: string }[] = [];
    for (let t = 0; t <= tickCount; t++) {
      const v = (maxY * t) / tickCount;
      ticks.push({ y: yAt(v), label: formatAxisIdr(v) });
    }

    const targetY = targetLine != null && targetLine > 0 ? yAt(targetLine) : null;
    const avgY = averageLine != null && averageLine > 0 ? yAt(averageLine) : null;

    const highlightIdx = highlightDateKey
      ? points.findIndex((p) => p.dateKey === highlightDateKey)
      : -1;

    const bars = points.map((p, i) => {
      const isHighlight = i === highlightIdx;
      const isZero = p.amount <= 0;
      const barHeight = isZero ? 2 : Math.max((p.amount / maxY) * innerH, 2);
      const barTop = isZero ? baseY - 2 : baseY - barHeight;
      // Exact y for trend line (amount=0 → baseY, no stub offset)
      const lineY = yAt(p.amount);
      return {
        dateKey: p.dateKey,
        amount: p.amount,
        xl: barXLeft(i),
        y: barTop,
        w: barW,
        h: barHeight,
        cx: barCx(i),
        cy: barTop,
        lineY,
        isHighlight,
        isZero,
      };
    });

    // Trend line path connecting bar top-centres
    const trendPath = bars
      .map((b, i) => `${i === 0 ? "M" : "L"} ${b.cx.toFixed(2)} ${b.lineY.toFixed(2)}`)
      .join(" ");

    return { w, h, padL, padR, padT, padB, baseY, innerH, innerW, cellW, ticks, targetY, avgY, bars, n, highlightIdx, trendPath };
  }, [points, highlightDateKey, targetLine, averageLine]);

  if (!chart) {
    return (
      <div className={cn("w-full", className)}>
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-slate-100 bg-slate-50/60 text-[13px] font-medium text-slate-500">
          Belum ada titik omzet untuk periode ini.
        </div>
      </div>
    );
  }

  const { w, h, padL, padR, padT, baseY, innerH, cellW, ticks, targetY, avgY, bars, n, trendPath } = chart;
  const hasClick = !!onDateClick;

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="min-w-[min(100%,720px)] w-full h-auto text-slate-500"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Grafik omzet harian per karyawan"
      >
        <defs>
          {/* Normal bar — soft indigo */}
          <linearGradient id={barGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(99 102 241)" stopOpacity="0.82" />
            <stop offset="100%" stopColor="rgb(99 102 241)" stopOpacity="0.42" />
          </linearGradient>
          {/* Highlighted bar — vivid indigo */}
          <linearGradient id={hlGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(55 48 163)" stopOpacity="1" />
            <stop offset="100%" stopColor="rgb(79 70 229)" stopOpacity="0.88" />
          </linearGradient>
        </defs>

        {/* ── Grid lines + Y-axis labels ── */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL} x2={w - padR}
              y1={t.y} y2={t.y}
              stroke="currentColor" strokeOpacity={0.1} strokeWidth={1}
            />
            <text x={4} y={t.y + 4} fontSize={10} className="fill-slate-400" fontWeight={600}>
              {t.label}
            </text>
          </g>
        ))}

        {/* ── Target reference line (amber dashed) ── */}
        {targetY !== null && (
          <g>
            <line
              x1={padL} x2={w - padR}
              y1={targetY} y2={targetY}
              stroke="rgb(251 146 60)"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              strokeOpacity={0.9}
            />
            {/* Value on Y-axis left */}
            <text
              x={padL - 3} y={targetY + 3.5}
              textAnchor="end"
              fontSize={8.5}
              fill="rgb(217 119 6)"
              fontWeight={800}
            >
              {targetLine != null ? formatAxisIdr(targetLine) : ""}
            </text>
            {/* Label on right */}
            <text
              x={w - padR + 5} y={targetY + 3.5}
              fontSize={8.5}
              fill="rgb(217 119 6)"
              fontWeight={800}
            >
              Target
            </text>
          </g>
        )}

        {/* ── Average reference line (indigo dashed) ── */}
        {avgY !== null && (
          <g>
            <line
              x1={padL} x2={w - padR}
              y1={avgY} y2={avgY}
              stroke="rgb(99 102 241)"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              strokeOpacity={0.65}
            />
            {/* Value on Y-axis left */}
            <text
              x={padL - 3} y={avgY + 3.5}
              textAnchor="end"
              fontSize={8.5}
              fill="rgb(99 102 241)"
              fontWeight={800}
            >
              {averageLine != null ? formatAxisIdr(averageLine) : ""}
            </text>
            {/* Label on right */}
            <text
              x={w - padR + 5} y={avgY + 3.5}
              fontSize={8.5}
              fill="rgb(99 102 241)"
              fontWeight={800}
            >
              Avg
            </text>
          </g>
        )}

        {/* ── Bars ── */}
        {bars.map((bar, i) => (
          <g key={bar.dateKey}>
            {/* Transparent wider hit-area for click / touch */}
            {hasClick && (
              <rect
                x={padL + i * cellW}
                y={padT}
                width={cellW}
                height={innerH}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onClick={() => onDateClick?.(bar.dateKey)}
              />
            )}

            {bar.isZero ? (
              /* Zero stub — light gray, 2 px */
              <rect
                x={bar.xl} y={baseY - 2}
                width={bar.w} height={2}
                fill="rgb(203 213 225)"
                rx={1}
              />
            ) : (
              /* Animated bar */
              <motion.rect
                x={bar.xl}
                y={bar.y}
                width={bar.w}
                height={bar.h}
                fill={bar.isHighlight ? `url(#${hlGradId})` : `url(#${barGradId})`}
                rx={Math.min(bar.w * 0.28, 5)}
                style={{ transformOrigin: `${bar.xl + bar.w / 2}px ${baseY}px` }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: 0.04 + i * 0.018, duration: 0.38, ease: "easeOut" }}
              >
                <title>{`${bar.dateKey}: ${bar.amount.toLocaleString("id-ID")}`}</title>
              </motion.rect>
            )}

            {/* Top dot for highlighted bar */}
            {bar.isHighlight && !bar.isZero && (
              <motion.circle
                cx={bar.xl + bar.w / 2}
                cy={bar.y}
                r={3.5}
                fill="white"
                stroke="rgb(55 48 163)"
                strokeWidth={2}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.42, duration: 0.22 }}
              />
            )}
          </g>
        ))}

        {/* ── Trend line — connects bar tops to show omzet movement ── */}
        {bars.length > 1 && (
          <motion.path
            d={trendPath}
            fill="none"
            stroke="rgb(255 255 255)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={0.6}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: "easeInOut", delay: 0.3 }}
          />
        )}
        {bars.length > 1 && (
          <motion.path
            d={trendPath}
            fill="none"
            stroke="rgb(30 27 75)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={0.55}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: "easeInOut", delay: 0.3 }}
          />
        )}

        {/* ── X-axis labels — 1 per bar, rotated -45° ── */}
        {bars.map((bar) => (
          <text
            key={`xl-${bar.dateKey}`}
            x={bar.cx}
            y={baseY + 5}
            transform={`rotate(-45, ${bar.cx}, ${baseY + 5})`}
            textAnchor="end"
            fontSize={8}
            fontWeight={bar.isHighlight ? 900 : 600}
            fill={bar.isHighlight ? "rgb(79 70 229)" : "rgb(148 163 184)"}
          >
            {shortDayLabel(bar.dateKey)}
          </text>
        ))}
      </svg>
    </div>
  );
}
