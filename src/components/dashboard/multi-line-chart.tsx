"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type MultiLineSeries = {
  id: string;
  name: string;
  color: string;
  points: { dateKey: string; value: number }[];
};

function shortDayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00+07:00`);
  return d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric" });
}

/**
 * Multi-line chart untuk perbandingan antar karyawan.
 * - Satu garis per karyawan, warna berbeda
 * - Klik nama di legend untuk hide/show garis
 * - Y-axis disesuaikan dengan metrik yang ditampilkan
 * - Highlight vertical line di tanggal terpilih
 */
export function MultiLineChart({
  series,
  formatValue,
  formatAxisValue,
  highlightDateKey,
  metricLabel,
  className,
}: {
  series: MultiLineSeries[];
  /** Format nilai untuk tooltip per titik (mis. formatIDR, toFixed(1)+'%') */
  formatValue?: (n: number) => string;
  /** Format nilai untuk label sumbu Y — boleh lebih pendek dari formatValue */
  formatAxisValue?: (n: number) => string;
  highlightDateKey?: string;
  /** Label metrik ditampilkan di pojok kiri atas chart */
  metricLabel?: string;
  className?: string;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const chart = useMemo(() => {
    if (!series.length || !series[0]?.points.length) return null;

    const dateKeys = series[0].points.map((p) => p.dateKey);
    const n = dateKeys.length;

    const w = 720;
    const h = 200;
    const padL = 54;
    const padR = 12;
    const padT = 16;
    const padB = 50;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const baseY = padT + innerH;

    // Scale uses ALL series (including hidden) so scale stays stable on toggle
    const allValues = series.flatMap((s) => s.points.map((p) => p.value));
    const rawMax = Math.max(...allValues, 1);
    const maxY = rawMax * 1.14;

    const xAt = (i: number) =>
      n === 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW;
    const yAt = (v: number) => padT + innerH - (v / maxY) * innerH;

    // Y-axis ticks
    const tickCount = 4;
    const ticks: { y: number; label: string }[] = [];
    const fAxis = formatAxisValue ?? formatValue ?? ((v: number) => {
      if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}M`;
      if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}jt`;
      if (v >= 1_000) return `${(v / 1_000).toFixed(0)}rb`;
      return String(Math.round(v));
    });
    for (let t = 0; t <= tickCount; t++) {
      const v = (maxY * t) / tickCount;
      ticks.push({ y: yAt(v), label: fAxis(v) });
    }

    const highlightIdx = highlightDateKey
      ? dateKeys.findIndex((dk) => dk === highlightDateKey)
      : -1;
    const highlightX = highlightIdx >= 0 ? xAt(highlightIdx) : null;

    // Geometry per series
    const geom = series.map((s) => {
      const path = s.points
        .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)} ${yAt(p.value).toFixed(2)}`)
        .join(" ");
      const dots = s.points.map((p, i) => ({
        cx: xAt(i),
        cy: yAt(p.value),
        value: p.value,
        dateKey: p.dateKey,
        isHighlight: i === highlightIdx,
      }));
      return { ...s, path, dots };
    });

    return { w, h, padL, padR, padT, padB, baseY, innerH, innerW, ticks, highlightX, highlightIdx, geom, n, dateKeys, xAt };
  }, [series, highlightDateKey, formatAxisValue, formatValue]);

  if (!chart) {
    return (
      <div className={cn("w-full", className)}>
        <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-slate-100 bg-slate-50/60 text-[13px] font-medium text-slate-500">
          Belum ada data untuk ditampilkan.
        </div>
      </div>
    );
  }

  const {
    w, h, padL, padR, padT, baseY, innerH, ticks,
    highlightX, geom, n, dateKeys, xAt,
  } = chart;

  const fmt = formatValue ?? ((v: number) => v.toLocaleString("id-ID"));

  return (
    <div className={cn("w-full", className)}>
      {/* ── Legend (toggle per user) ── */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {geom.map((s) => {
          const isHidden = hidden.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              title={isHidden ? `Tampilkan ${s.name}` : `Sembunyikan ${s.name}`}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-all select-none",
                isHidden
                  ? "border-slate-200 bg-slate-50 text-slate-400"
                  : "border-slate-200 bg-white text-slate-700 shadow-sm",
              )}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full transition-colors"
                style={{ backgroundColor: isHidden ? "rgb(203 213 225)" : s.color }}
              />
              <span className={isHidden ? "line-through" : ""}>{s.name}</span>
            </button>
          );
        })}
      </div>

      {/* ── SVG chart ── */}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="min-w-[min(100%,720px)] w-full h-auto"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Grafik perbandingan karyawan"
        >
          {/* Metric label */}
          {metricLabel && (
            <text x={padL + 4} y={padT + 10} fontSize={9} fill="rgb(148 163 184)" fontWeight={700}>
              {metricLabel}
            </text>
          )}

          {/* Grid lines + Y-axis labels */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={padL} x2={w - padR}
                y1={t.y} y2={t.y}
                stroke="rgb(148 163 184)" strokeOpacity={0.15} strokeWidth={1}
              />
              <text x={4} y={t.y + 4} fontSize={9} fill="rgb(148 163 184)" fontWeight={600}>
                {t.label}
              </text>
            </g>
          ))}

          {/* Vertical highlight line */}
          {highlightX !== null && (
            <line
              x1={highlightX} x2={highlightX}
              y1={padT} y2={baseY}
              stroke="rgb(99 102 241)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              strokeOpacity={0.45}
            />
          )}

          {/* Lines + dots — draw hidden series first (behind visible ones) */}
          {[...geom].reverse().map((s, revIdx) => {
            const si = geom.length - 1 - revIdx;
            const isHidden = hidden.has(s.id);
            return (
              <g
                key={s.id}
                style={{
                  opacity: isHidden ? 0.07 : 1,
                  transition: "opacity 0.25s ease",
                  pointerEvents: isHidden ? "none" : "auto",
                }}
              >
                {/* Line */}
                <motion.path
                  d={s.path}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={isHidden ? 1 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.75, delay: si * 0.07, ease: "easeInOut" }}
                />
                {/* Dots */}
                {s.dots.map((dot) =>
                  dot.value > 0 ? (
                    <motion.circle
                      key={dot.dateKey}
                      cx={dot.cx}
                      cy={dot.cy}
                      r={dot.isHighlight ? 4.5 : 2.5}
                      fill={dot.isHighlight ? s.color : "white"}
                      stroke={s.color}
                      strokeWidth={dot.isHighlight ? 0 : 1.5}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5 + si * 0.07, duration: 0.2 }}
                    >
                      <title>{`${s.name} — ${dot.dateKey}: ${fmt(dot.value)}`}</title>
                    </motion.circle>
                  ) : null,
                )}
              </g>
            );
          })}

          {/* X-axis labels — 1 per hari, rotated -45° */}
          {dateKeys.map((dk, i) => (
            <text
              key={`xl-${dk}`}
              x={xAt(i)}
              y={baseY + 5}
              transform={`rotate(-45, ${xAt(i)}, ${baseY + 5})`}
              textAnchor="end"
              fontSize={8}
              fontWeight={dk === highlightDateKey ? 900 : 600}
              fill={dk === highlightDateKey ? "rgb(79 70 229)" : "rgb(148 163 184)"}
            >
              {shortDayLabel(dk)}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
