"use client";

import { motion } from "framer-motion";
import { useId, useMemo } from "react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BarChartBar = {
  /** X-axis label (month abbrev, user name, etc.) */
  label: string;
  /** Numeric value for bar height */
  value: number;
  /** Optional secondary label rendered below the main label */
  sublabel?: string;
};

type ColorTheme = "indigo" | "emerald" | "amber" | "sky" | "rose";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAxisIdr(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
  return String(Math.round(n));
}

function formatTopLabel(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
  return String(Math.round(n));
}

const THEME_COLORS: Record<ColorTheme, { bar: string; highlight: string; gradient: [string, string]; label: string }> = {
  indigo: {
    bar: "rgb(99 102 241 / 0.55)",
    highlight: "rgb(79 70 229)",
    gradient: ["rgb(99 102 241 / 0.8)", "rgb(99 102 241 / 0.3)"],
    label: "rgb(67 56 202)",
  },
  emerald: {
    bar: "rgb(16 185 129 / 0.50)",
    highlight: "rgb(5 150 105)",
    gradient: ["rgb(16 185 129 / 0.75)", "rgb(16 185 129 / 0.25)"],
    label: "rgb(4 120 87)",
  },
  amber: {
    bar: "rgb(245 158 11 / 0.50)",
    highlight: "rgb(217 119 6)",
    gradient: ["rgb(245 158 11 / 0.75)", "rgb(245 158 11 / 0.25)"],
    label: "rgb(180 83 9)",
  },
  sky: {
    bar: "rgb(14 165 233 / 0.50)",
    highlight: "rgb(2 132 199)",
    gradient: ["rgb(14 165 233 / 0.75)", "rgb(14 165 233 / 0.25)"],
    label: "rgb(3 105 161)",
  },
  rose: {
    bar: "rgb(244 63 94 / 0.50)",
    highlight: "rgb(225 29 72)",
    gradient: ["rgb(244 63 94 / 0.75)", "rgb(244 63 94 / 0.25)"],
    label: "rgb(190 18 60)",
  },
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  bars: BarChartBar[];
  className?: string;
  /** Color theme. Default "indigo". */
  color?: ColorTheme;
  /**
   * Index of the bar to visually highlight (e.g., current month, selected user).
   * If undefined, all bars use the same style.
   */
  highlightIndex?: number;
  /** Whether to show the formatted value above each bar. Default true. */
  showValues?: boolean;
  /** Override the Y-axis maximum (useful for fixed comparisons). */
  maxValue?: number;
  /** Custom empty state message. */
  emptyMessage?: string;
  /** aria-label for the SVG. Default "Bar chart". */
  ariaLabel?: string;
}

export function CustomBarChart({
  bars,
  className,
  color = "indigo",
  highlightIndex,
  showValues = true,
  maxValue,
  emptyMessage = "Belum ada data untuk periode ini.",
  ariaLabel = "Bar chart",
}: Props) {
  const gradId = useId().replace(/:/g, "");
  const gradHlId = `${gradId}hl`;

  const theme = THEME_COLORS[color];

  const chart = useMemo(() => {
    const n = bars.length;
    if (n === 0) return null;

    // Canvas dimensions
    const w = 720;
    const h = 240;
    const padL = 52;
    const padR = 16;
    const padT = showValues ? 30 : 16; // extra top space for value labels
    const padB = bars.some((b) => b.sublabel) ? 48 : 36;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;

    const values = bars.map((b) => b.value);
    const rawMax = maxValue ?? Math.max(...values, 1);
    const yMax = rawMax * 1.1; // 10% headroom

    // X positions: center of each bar slot
    const slotW = innerW / n;
    const barW = Math.min(slotW * 0.55, 56); // cap at 56px wide

    const xCenter = (i: number) => padL + slotW * i + slotW / 2;
    const yTop = (v: number) => padT + innerH - (v / yMax) * innerH;
    const barHeight = (v: number) => Math.max((v / yMax) * innerH, 2); // min 2px

    // Y-axis ticks (5 levels)
    const tickCount = 4;
    const ticks: { y: number; label: string }[] = [];
    for (let t = 0; t <= tickCount; t++) {
      const v = (yMax * t) / tickCount;
      ticks.push({ y: yTop(v), label: formatAxisIdr(v) });
    }

    const baseY = padT + innerH;

    return { n, w, h, padL, padB, padT, innerW, innerH, slotW, barW, xCenter, yTop, barHeight, baseY, ticks, yMax };
  }, [bars, maxValue, showValues]);

  if (!chart) {
    return (
      <div className={cn("w-full", className)}>
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-slate-100 bg-slate-50/60 text-[13px] font-medium text-slate-500">
          {emptyMessage}
        </div>
      </div>
    );
  }

  const { n, w, h, padL, innerW, barW, xCenter, yTop, barHeight, baseY, ticks } = chart;

  const hasHighlight = highlightIndex !== undefined && highlightIndex >= 0 && highlightIndex < n;

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="min-w-[min(100%,720px)] w-full h-auto text-slate-500"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          {/* Normal bar gradient */}
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.gradient[0]} />
            <stop offset="100%" stopColor={theme.gradient[1]} />
          </linearGradient>
          {/* Highlight bar gradient (more saturated) */}
          <linearGradient id={gradHlId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.highlight} stopOpacity="0.95" />
            <stop offset="100%" stopColor={theme.highlight} stopOpacity="0.65" />
          </linearGradient>
        </defs>

        {/* Y-axis gridlines + labels */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={w - 16}
              y1={t.y}
              y2={t.y}
              stroke="currentColor"
              strokeOpacity={i === 0 ? 0.0 : 0.10}
              strokeWidth={1}
              strokeDasharray={i === 0 ? "0" : "4 3"}
            />
            <text x={4} y={t.y + 4} fontSize={9.5} className="fill-slate-400 font-semibold">
              {t.label}
            </text>
          </g>
        ))}

        {/* Baseline */}
        <line
          x1={padL}
          x2={w - 16}
          y1={baseY}
          y2={baseY}
          stroke="currentColor"
          strokeOpacity={0.18}
          strokeWidth={1.5}
        />

        {/* Bars */}
        {bars.map((bar, i) => {
          const cx = xCenter(i);
          const bh = barHeight(bar.value);
          const by = yTop(bar.value);
          const isHighlighted = hasHighlight ? i === highlightIndex : true;
          const fillId = isHighlighted ? gradHlId : gradId;
          const opacity = hasHighlight && !isHighlighted ? 0.55 : 1;

          return (
            <g key={i} opacity={opacity}>
              {/* Bar rect */}
              <motion.rect
                x={cx - barW / 2}
                y={by}
                width={barW}
                height={bh}
                rx={Math.min(6, barW / 4)}
                fill={`url(#${fillId})`}
                initial={{ scaleY: 0, originY: 1 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.45, delay: 0.05 + i * 0.035, ease: "easeOut" }}
                style={{ transformOrigin: `${cx}px ${baseY}px` }}
              />

              {/* Value label on top */}
              {showValues && bar.value > 0 && (
                <motion.text
                  x={cx}
                  y={by - 5}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight="700"
                  fill={isHighlighted ? theme.label : "rgb(100 116 139)"}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.3 + i * 0.035 }}
                >
                  {formatTopLabel(bar.value)}
                </motion.text>
              )}

              {/* X-axis main label */}
              <text
                x={cx}
                y={baseY + 14}
                textAnchor="middle"
                fontSize={9.5}
                fontWeight={isHighlighted && hasHighlight ? "800" : "600"}
                fill={isHighlighted && hasHighlight ? theme.label : "rgb(100 116 139)"}
              >
                {bar.label}
              </text>

              {/* X-axis sublabel (e.g., year for monthly charts) */}
              {bar.sublabel && (
                <text
                  x={cx}
                  y={baseY + 27}
                  textAnchor="middle"
                  fontSize={8.5}
                  fontWeight="500"
                  fill="rgb(148 163 184)"
                >
                  {bar.sublabel}
                </text>
              )}

              {/* Tooltip on hover (SVG title) */}
              <title>{`${bar.label}${bar.sublabel ? ` ${bar.sublabel}` : ""}: ${bar.value.toLocaleString("id-ID")}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Convenience helper: build monthly bars from histori array ─────────────────

const MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function buildMonthlyBars(
  histori: { month: number; year: number; omzet: number | null }[],
  currentMonth: number,
  currentYear: number,
): { bars: BarChartBar[]; highlightIndex: number | undefined } {
  const sorted = [...histori].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month,
  );

  const bars: BarChartBar[] = sorted.map((h) => {
    const name = MONTH_NAMES_SHORT[(h.month - 1) % 12] ?? String(h.month);
    return {
      label: name,
      value: h.omzet ?? 0,
      sublabel: String(h.year),
    };
  });

  const hlIdx = sorted.findIndex((h) => h.month === currentMonth && h.year === currentYear);
  return { bars, highlightIndex: hlIdx >= 0 ? hlIdx : undefined };
}
