/* eslint-disable @typescript-eslint/no-explicit-any */

import { eachDateKeyInRangeInclusive } from "@/lib/bba-dashboard-metrics";
import { cn } from "@/lib/utils";
import {
  calculateMonthlyBonusFromInputs,
  pickPrimaryKpiDisplayFromBonusResult,
  type BonusResult,
} from "@/lib/kpi-v2/calculator";
import { getKpiV2SchemesEnabledForPeriod, isKpiConfigV2, type KpiV2SchemeId } from "@/lib/kpi-v2/utils";

export const ADDON_KEY_ABSENSI = "absensi_shift";
export const ADDON_KEY_REVIEW_INTERNAL = "review_internal";
export const ADDON_KEY_REVIEW_PELANGGAN = "review_pelanggan";

export const KPI_V2_SCHEME_TABLE_LABELS: Record<KpiV2SchemeId, string> = {
  team_monthly: "Tim (bulanan)",
  team_daily: "Tim (harian)",
  individual_monthly: "Individu (bulanan)",
  individual_daily: "Individu (harian)",
};

export function customerReviewTaggedUserId(r: any): string {
  return String(r.user_id ?? r.tagged_user_id ?? "").trim();
}

/** Teks ulasan: kolom di customer_review_logs biasanya review_text; fallback comment. */
export function customerReviewBody(r: any): string {
  const t = r.comment ?? r.review_text ?? "";
  return String(t).trim();
}

export function customerReviewEventIso(r: any): string {
  return String(r.reviewed_at ?? r.created_at ?? "");
}

export function customerReviewSourceLabel(r: any): string {
  const s = String(r.customer_name ?? r.reviewer_name ?? r.source_name ?? "").trim();
  return s || "Pelanggan";
}

export function jakartaDateKeyFromIso(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

export function jakartaTimeLabel(iso: string) {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "-";
  }
}

/** Parse tanggal + jam shift (WIB, +07:00) ke UNIX ms UTC */
export function jakartaScheduleStartToUtcMs(dateStr: string, timeStr: string): number | null {
  const tm = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!tm) return null;
  const hh = Math.min(23, parseInt(tm[1], 10));
  const mm = Math.min(59, parseInt(tm[2], 10));
  const ss = tm[3] ? Math.min(59, parseInt(tm[3], 10)) : 0;
  const iso = `${dateStr}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}+07:00`;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Durasi dalam bahasa Indonesia untuk keterlambatan */
export function formatLatenessMinutesLabel(minutes: number) {
  if (minutes <= 0) return "";
  if (minutes < 60) return `${minutes} menit`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} jam`;
  return `${h} jam ${m} menit`;
}

export type PayrollCustomAdj = { id?: string; name?: string; type?: string; amount?: unknown };

export function parseCustomAdjustmentsArray(raw: unknown): PayrollCustomAdj[] {
  if (raw == null || raw === "") return [];
  let arr: unknown[] = [];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      arr = Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  } else if (Array.isArray(raw)) {
    arr = raw;
  } else {
    return [];
  }
  return arr.filter((x) => x && typeof x === "object") as PayrollCustomAdj[];
}

/** Net dari payroll_configs.custom_adjustments (JSON: addition / deduction). */
/** Total bonus produk fokus otomatis per karyawan (selaras tab payroll). */
export function computeProductFokusBonusTotalForUser(
  userId: string,
  productFokusConfigs: any[],
  approvedProductRows: any[],
  bounds: { monthStartKey: string; mtdThroughDateKey: string },
): number {
  const soldByProductId = new Map<string, number>();
  for (const row of approvedProductRows ?? []) {
    const submission = Array.isArray(row.submission) ? row.submission[0] : row.submission;
    const uid = String(submission?.user_id ?? "");
    const dateKey = String(submission?.submission_date ?? "").slice(0, 10);
    if (!userId || uid !== String(userId)) continue;
    if (!dateKey || dateKey < bounds.monthStartKey || dateKey > bounds.mtdThroughDateKey) continue;
    const pid = String(row.product_id ?? "");
    if (!pid) continue;
    soldByProductId.set(pid, (soldByProductId.get(pid) ?? 0) + Number(row.quantity_sold ?? 0));
  }

  let total = 0;
  for (const cfg of productFokusConfigs ?? []) {
    const productId = String(cfg.product_id ?? "");
    const sold = soldByProductId.get(productId) ?? 0;
    const targetValue = Number(cfg.target_value ?? 0);
    const bonusValue = Number(cfg.bonus_value ?? 0);
    const step = Number(cfg.bonus_step ?? 1) || 1;
    const excess = Math.max(0, sold - targetValue);
    if (cfg.bonus_type === "kelipatan") {
      total += sold >= targetValue ? Math.floor(excess / step) * bonusValue : 0;
    } else {
      total += sold >= targetValue ? bonusValue : 0;
    }
  }
  return total;
}

/**
 * Type identifier BPJS di custom_adjustments.
 * Item ini sudah diperhitungkan via field `bpjs_deduction` tersendiri —
 * HARUS diexclude dari net/rows calculation agar tidak double-count.
 */
const BPJS_CUSTOM_ADJ_TYPES = new Set(['bpjs_employee', 'bpjs_employer']);

export function netFromCustomAdjustments(raw: unknown): number {
  let net = 0;
  for (const o of parseCustomAdjustmentsArray(raw)) {
    if (BPJS_CUSTOM_ADJ_TYPES.has(String(o.type ?? "").toLowerCase())) continue;
    const amt = Math.abs(Number(o.amount ?? 0));
    const type = String(o.type ?? "addition").toLowerCase();
    if (type === "deduction") net -= amt;
    else net += amt;
  }
  return net;
}

/** Satu baris per item untuk tabel payroll (nilai bertanda: + tambahan, − pengurangan).
 *  Item BPJS (bpjs_employee / bpjs_employer) diexclude — sudah masuk via bpjsDeduction. */
export function customAdjustmentTableRows(raw: unknown): { key: string; label: string; val: number; tone: string }[] {
  return parseCustomAdjustmentsArray(raw)
    .filter((o) => !BPJS_CUSTOM_ADJ_TYPES.has(String(o.type ?? "").toLowerCase()))
    .map((o, idx) => {
    const amt = Math.abs(Number(o.amount ?? 0));
    const type = String(o.type ?? "addition").toLowerCase();
    const val = type === "deduction" ? -amt : amt;
    const name = String(o.name ?? "").trim() || "Penyesuaian";
    return {
      key: `payroll-adj-${String(o.id ?? idx)}-${idx}`,
      label: type === "deduction" ? `${name} (pengurangan)` : `${name} (tambahan)`,
      val,
      tone: val < 0 ? "text-rose-700" : "text-emerald-800",
    };
  });
}


export function mergeAttendanceByDay(rows: any[], userId: string, scopeStart: string, scopeEnd: string) {
  const byDay = new Map<string, any[]>();
  for (const r of rows ?? []) {
    if (String(r.user_id) !== String(userId)) continue;
    const dk = jakartaDateKeyFromIso(r.clock_in_time);
    if (dk < scopeStart || dk > scopeEnd) continue;
    const arr = byDay.get(dk) ?? [];
    arr.push(r);
    byDay.set(dk, arr);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, list]) => {
      const sorted = [...list].sort(
        (a, b) => new Date(a.clock_in_time).getTime() - new Date(b.clock_in_time).getTime(),
      );
      const first = sorted[0];
      let clockOutMax: string | null = null;
      for (const s of sorted) {
        if (!s.clock_out_time) continue;
        if (!clockOutMax || new Date(s.clock_out_time) > new Date(clockOutMax)) clockOutMax = s.clock_out_time;
      }
      const isLate = sorted.some((s) => s.is_late);
      const urls = [...new Set(sorted.map((s: any) => String(s.photo_url ?? "").trim()).filter(Boolean))];
      const photoUrl = urls[0] ?? null;
      const notesJoined = [...new Set(sorted.map((s: any) => String(s.notes ?? "").trim()).filter(Boolean))].join(" · ");

      let shiftLabel: string | null = null;
      const srRaw = first.shift_schedule;
      const sr = srRaw ? (Array.isArray(srRaw) ? srRaw[0] : srRaw) : null;
      let ms: any = null;
      if (sr) {
        const msRaw = sr.master_shifts;
        ms = msRaw ? (Array.isArray(msRaw) ? msRaw[0] : msRaw) : null;
        if (sr.is_off) shiftLabel = ms?.shift_name ? `Libur (${ms.shift_name})` : "Libur (roster)";
        else if (ms?.shift_name)
          shiftLabel = `${ms.shift_name}${sr.schedule_date ? ` · ${sr.schedule_date}` : ""}`;
        else if (sr.schedule_date) shiftLabel = `Shift · ${sr.schedule_date}`;
      }

      let lateMinutes: number | null = null;
      if (isLate && first.clock_in_time && !sr?.is_off) {
        const scheduleDateStr =
          sr?.schedule_date != null ? String(sr.schedule_date).slice(0, 10) : dateKey;
        const startWall = ms?.start_time ?? null;
        if (scheduleDateStr && startWall != null && String(startWall).trim() !== "") {
          const schedMs = jakartaScheduleStartToUtcMs(scheduleDateStr, String(startWall));
          const inMs = new Date(first.clock_in_time).getTime();
          if (schedMs != null && !Number.isNaN(inMs)) {
            const diffMin = Math.floor((inMs - schedMs) / 60000);
            if (diffMin > 0) lateMinutes = diffMin;
          }
        }
      }

      return {
        dateKey,
        clockInIso: first.clock_in_time,
        clockOutIso: clockOutMax,
        isLate,
        lateMinutes,
        photoUrl,
        notes: notesJoined || null,
        shiftLabel,
        mergedFrom: sorted.length,
      };
    });
}

export function leaveDaySetForUser(leaves: any[], userId: string, scopeStart: string, scopeEnd: string) {
  const set = new Set<string>();
  for (const L of leaves ?? []) {
    if (String(L.user_id) !== String(userId)) continue;
    const ls = String(L.start_date).slice(0, 10);
    const le = String(L.end_date).slice(0, 10);
    const start = ls > scopeStart ? ls : scopeStart;
    const end = le < scopeEnd ? le : scopeEnd;
    if (start > end) continue;
    const cur = new Date(`${start}T12:00:00`);
    const last = new Date(`${end}T12:00:00`);
    while (cur <= last) {
      set.add(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
  }
  return set;
}

export function stripToDigits(s: string) {
  return s.replace(/\D/g, "");
}

/** Format angka penuh dengan pemisah ribuan titik (contoh: 1000 → 1.000) */
export function formatThousandsDotFromDigits(digits: string) {
  if (!digits) return "";
  const noLeadingZeros = digits.replace(/^0+(?=\d)/, "");
  const core = noLeadingZeros === "" ? "0" : noLeadingZeros;
  return core.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function parseDotThousandsToPositiveInt(formatted: string) {
  const d = stripToDigits(formatted);
  if (d === "") return 0;
  const n = parseInt(d, 10);
  return Number.isNaN(n) ? 0 : n;
}

export function parseSignedDotThousands(formatted: string) {
  const trimmed = formatted.trim();
  const neg = trimmed.startsWith("-");
  const d = stripToDigits(trimmed);
  if (d === "") return 0;
  const n = parseInt(d, 10);
  if (Number.isNaN(n)) return 0;
  return neg ? -n : n;
}

// Re-export passthrough so consumers of this file can use these without importing separately
export { eachDateKeyInRangeInclusive, cn, calculateMonthlyBonusFromInputs, pickPrimaryKpiDisplayFromBonusResult, getKpiV2SchemesEnabledForPeriod, isKpiConfigV2 };
export type { BonusResult, KpiV2SchemeId };
