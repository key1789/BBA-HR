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

export function CustomLineChart({
  points,
  className,
}: {
  points: LineChartPoint[];
  className?: string;
}) {
  const fillGradientId = useId().replace(/:/g, "");

  const chart = useMemo(() => {
    const n = points.length;
    if (n === 0) return null;

    const w = 720;
    const h = 220;
    const padL = 52;
    const padR = 12;
    const padT = 16;
    const padB = 36;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const amounts = points.map((p) => p.amount);
    const rawMax = Math.max(...amounts, 1);
    const maxY = rawMax * 1.08;
    const xAt = (i: number) => padL + (n === 1 ? innerW / 2 : (i / Math.max(1, n - 1)) * innerW);
    const yAt = (v: number) => padT + innerH - (v / maxY) * innerH;

    const lineParts: string[] = [];
    points.forEach((p, i) => {
      const x = xAt(i);
      const y = yAt(p.amount);
      lineParts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
    });
    const pathD = lineParts.join(" ");

    const firstX = xAt(0);
    const lastX = xAt(n - 1);
    const baseY = padT + innerH;
    const areaD = `${pathD} L ${lastX.toFixed(2)} ${baseY} L ${firstX.toFixed(2)} ${baseY} Z`;

    const tickCount = 4;
    const ticks: { y: number; label: string }[] = [];
    for (let t = 0; t <= tickCount; t++) {
      const v = (maxY * t) / tickCount;
      ticks.push({ y: yAt(v), label: formatAxisIdr(v) });
    }

    const dotPositions = points.map((p, i) => ({
      cx: xAt(i),
      cy: yAt(p.amount),
      dateKey: p.dateKey,
      amount: p.amount,
    }));

    return { pathD, areaD, ticks, dotPositions, w, h, padL, innerW, n };
  }, [points]);

  if (!chart) {
    return (
      <div className={cn("w-full", className)}>
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-slate-100 bg-slate-50/60 text-[13px] font-medium text-slate-500">
          Belum ada titik omzet untuk periode ini.
        </div>
      </div>
    );
  }

  const { pathD, areaD, ticks, dotPositions, w, h, padL, innerW, n } = chart;
  const xLabelEvery = n <= 14 ? 1 : n <= 21 ? 2 : 3;

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="min-w-[min(100%,720px)] w-full h-auto text-slate-500"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Grafik omzet harian"
      >
        <defs>
          <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(79 70 229)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="rgb(79 70 229)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={w - 12}
              y1={t.y}
              y2={t.y}
              stroke="currentColor"
              strokeOpacity={0.12}
              strokeWidth={1}
            />
            <text x={4} y={t.y + 4} fontSize={10} className="fill-slate-400 font-semibold">
              {t.label}
            </text>
          </g>
        ))}

        <motion.path
          d={areaD}
          fill={`url(#${fillGradientId})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
        />
        <motion.path
          d={pathD}
          fill="none"
          stroke="rgb(79 70 229)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
        />

        {dotPositions.map((d, i) => (
          <motion.circle
            key={d.dateKey}
            cx={d.cx}
            cy={d.cy}
            r={3.5}
            className="fill-white stroke-indigo-600"
            strokeWidth={2}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 + i * 0.012, duration: 0.2 }}
          >
            <title>{`${d.dateKey}: ${d.amount.toLocaleString("id-ID")}`}</title>
          </motion.circle>
        ))}

        {points.map((p, i) => {
          if (i % xLabelEvery !== 0 && i !== n - 1) return null;
          const x = padL + (n === 1 ? innerW / 2 : (i / Math.max(1, n - 1)) * innerW);
          return (
            <text
              key={`xl-${p.dateKey}`}
              x={x}
              y={h - 8}
              textAnchor="middle"
              fontSize={9}
              className="fill-slate-400 font-bold uppercase"
            >
              {shortDayLabel(p.dateKey)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
