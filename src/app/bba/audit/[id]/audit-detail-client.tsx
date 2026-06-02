"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useState, useEffect, useTransition, useSyncExternalStore, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { GlassCard } from "@/components/shared/glass-card";
import {
  ArrowLeft, TrendingUp, ChevronLeft, ChevronRight,
  ClipboardCheck, CheckCircle2,
  Calendar, Target,
  Calculator, User, Users, Wallet, Receipt,
  Loader2, X, MessageSquare, Star, Camera, FileText, Lock, Unlock, Save, AlertTriangle, FlaskConical
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  finalizeAuditAction,
  publishAuditAppraisalPeriodAction,
  unpublishAuditAppraisalPeriodAction,
  recalculateAuditAppraisalAction,
  reopenApprovedAuditAsGlobalAdminAction,
  savePayrollDraftAction,
  submitAuditForReviewAction,
  toggleCrewLockAction,
  updateCrewAuditAction,
  upsertMonthlyAddonAppraisalAction,
} from "./actions";
import { toast } from "sonner";
import { getAuditStatusBadgeClass, getAuditStatusLabel } from "@/lib/labels";
import { eachDateKeyInRangeInclusive } from "@/lib/bba-dashboard-metrics";
import { cn } from "@/lib/utils";
import { CustomLineChart } from "@/components/dashboard/custom-line-chart";
import { MultiLineChart, type MultiLineSeries } from "@/components/dashboard/multi-line-chart";
import { InfoTooltip } from "@/components/shared/info-tooltip";
import {
  calculateMonthlyBonusFromInputs,
  pickPrimaryKpiDisplayFromBonusResult,
  type BonusResult,
} from "@/lib/kpi-v2/calculator";
import { getKpiV2SchemesEnabledForPeriod, isKpiConfigV2, type KpiV2SchemeId } from "@/lib/kpi-v2/utils";
import {
  EmployeeKpiBonusSection,
  EmployeeUnifiedPerformanceCard,
} from "@/components/kpi-v2/audit/employee-kpi-detail";

const ADDON_KEY_ABSENSI = "absensi_shift";
const ADDON_KEY_REVIEW_INTERNAL = "review_internal";
const ADDON_KEY_REVIEW_PELANGGAN = "review_pelanggan";
const ADDON_KEY_PAYROLL = "payroll";

const KPI_V2_SCHEME_TABLE_LABELS: Record<KpiV2SchemeId, string> = {
  team_monthly: "Tim (bulanan)",
  team_daily: "Tim (harian)",
  individual_monthly: "Individu (bulanan)",
  individual_daily: "Individu (harian)",
};

function customerReviewTaggedUserId(r: any): string {
  return String(r.user_id ?? r.tagged_user_id ?? "").trim();
}

/** Teks ulasan: kolom di customer_review_logs biasanya review_text; fallback comment. */
function customerReviewBody(r: any): string {
  const t = r.comment ?? r.review_text ?? "";
  return String(t).trim();
}

function customerReviewEventIso(r: any): string {
  return String(r.reviewed_at ?? r.created_at ?? "");
}

function customerReviewSourceLabel(r: any): string {
  const s = String(r.customer_name ?? r.reviewer_name ?? r.source_name ?? "").trim();
  return s || "Pelanggan";
}

function jakartaDateKeyFromIso(iso: string) {
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

function jakartaTimeLabel(iso: string) {
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
function jakartaScheduleStartToUtcMs(dateStr: string, timeStr: string): number | null {
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
function formatLatenessMinutesLabel(minutes: number) {
  if (minutes <= 0) return "";
  if (minutes < 60) return `${minutes} menit`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} jam`;
  return `${h} jam ${m} menit`;
}

type PayrollCustomAdj = { id?: string; name?: string; type?: string; amount?: unknown };

function parseCustomAdjustmentsArray(raw: unknown): PayrollCustomAdj[] {
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

/**
 * Type identifier untuk item BPJS di custom_adjustments.
 * Item ini sudah diperhitungkan melalui field `bpjs_deduction` tersendiri,
 * sehingga HARUS diexclude dari kalkulasi custom net / display rows
 * agar tidak terjadi double-count.
 */
const BPJS_CUSTOM_ADJ_TYPES = new Set(['bpjs_employee', 'bpjs_employer']);

/** Net dari payroll_configs.custom_adjustments (JSON: addition / deduction). */
/** Total bonus produk fokus otomatis per karyawan (selaras tab payroll). */
function computeProductFokusBonusTotalForUser(
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

function netFromCustomAdjustments(raw: unknown): number {
  let net = 0;
  for (const o of parseCustomAdjustmentsArray(raw)) {
    // Lewati item BPJS — sudah diperhitungkan via field bpjs_deduction
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
function customAdjustmentTableRows(raw: unknown): { key: string; label: string; val: number; tone: string }[] {
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


function mergeAttendanceByDay(rows: any[], userId: string, scopeStart: string, scopeEnd: string) {
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

function leaveDaySetForUser(leaves: any[], userId: string, scopeStart: string, scopeEnd: string) {
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

function stripToDigits(s: string) {
  return s.replace(/\D/g, "");
}

/** Format angka penuh dengan pemisah ribuan titik (contoh: 1000 → 1.000) */
function formatThousandsDotFromDigits(digits: string) {
  if (!digits) return "";
  const noLeadingZeros = digits.replace(/^0+(?=\d)/, "");
  const core = noLeadingZeros === "" ? "0" : noLeadingZeros;
  return core.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function parseDotThousandsToPositiveInt(formatted: string) {
  const d = stripToDigits(formatted);
  if (d === "") return 0;
  const n = parseInt(d, 10);
  return Number.isNaN(n) ? 0 : n;
}

function parseSignedDotThousands(formatted: string) {
  const trimmed = formatted.trim();
  const neg = trimmed.startsWith("-");
  const d = stripToDigits(trimmed);
  if (d === "") return 0;
  const n = parseInt(d, 10);
  if (Number.isNaN(n)) return 0;
  return neg ? -n : n;
}

export function AuditDetailClient({
  branch, kpi, achievements, crewAchievements, audit, isGlobalSuperAdmin = false, isTrialBranch = false, crewAudits, payrollConfigs, productFokusConfigs, internalReviews, customerReviews, addons, month, year, selectedDate, approvedProductRows, attendanceLogs = [], leaveRequestsApproved = [], monthlyAddonAppraisals = [], activeCrewCount = 0, raportPeriodPublished = false,
  branchOmzetHistori = [],
  payrollPeriod = null,
  payrollItems = [],
  portalMode = "audit",
  ownerSurface,
  ownerVerifiedOnly = true,
  ownerNavBasePath,
}: {
  branch: any, kpi: any, achievements: any[], crewAchievements: any[], audit: any, isGlobalSuperAdmin?: boolean, isTrialBranch?: boolean, crewAudits: any[], payrollConfigs: any[], productFokusConfigs: any[], internalReviews: any[], customerReviews: any[], addons: any[], month: number, year: number, selectedDate: string, approvedProductRows: any[], attendanceLogs?: any[], leaveRequestsApproved?: any[], monthlyAddonAppraisals?: any[], activeCrewCount?: number, raportPeriodPublished?: boolean,
  branchOmzetHistori?: { month: number; year: number; omzet: number }[],
  payrollPeriod?: any | null,
  payrollItems?: any[],
  portalMode?: "audit" | "owner",
  ownerSurface?: "harian" | "bulanan" | "per-karyawan" | "payroll" | "penilaian",
  ownerVerifiedOnly?: boolean,
  ownerNavBasePath?: string,
}) {
  const [auditPortalTab, setAuditPortalTab] = useState<"harian" | "bulanan" | "per-karyawan" | "payroll" | "penilaian">("bulanan");
  // Safety: jika tab "payroll" dipilih tapi add-on payroll tidak aktif → fallback ke "bulanan"
  // (payrollAddonEnabled dihitung inline di sini agar tidak ada temporal dead zone)
  const activeTab = (() => {
    if (portalMode === "owner" && ownerSurface) return ownerSurface;
    const _payrollOn = (addons ?? []).some((a: any) => a.addon_key === ADDON_KEY_PAYROLL);
    if (auditPortalTab === "payroll" && !_payrollOn) return "bulanan" as const;
    return auditPortalTab;
  })();
  const [selectedDateKey, setSelectedDateKey] = useState(selectedDate);
  const [leaderboardSortBy, setLeaderboardSortBy] = useState<"sales" | "atv" | "atu" | "sarp">("sales");
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [selectedUserForDetail, setSelectedUserForDetail] = useState<any>(null);
  const [selectedUserForInternalDetail, setSelectedUserForInternalDetail] = useState<any>(null);
  const [selectedUserForCustomerDetail, setSelectedUserForCustomerDetail] = useState<any>(null);
  const [absensiAddonModalOpen, setAbsensiAddonModalOpen] = useState(false);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [absensiSaving, setAbsensiSaving] = useState(false);
  const [absensiScoreDraft, setAbsensiScoreDraft] = useState("");
  const [absensiNominalDraft, setAbsensiNominalDraft] = useState("");
  const [absensiBonusDirection, setAbsensiBonusDirection] = useState<"add" | "subtract" | null>(null);
  const [absensiNotesDraft, setAbsensiNotesDraft] = useState("");
  const [internalReviewAddonModalOpen, setInternalReviewAddonModalOpen] = useState(false);
  const [internalSaving, setInternalSaving] = useState(false);
  const [internalScoreDraft, setInternalScoreDraft] = useState("");
  const [internalBonusDirection, setInternalBonusDirection] = useState<"add" | "subtract" | null>(null);
  const [internalNominalDraft, setInternalNominalDraft] = useState("");
  const [internalNotesDraft, setInternalNotesDraft] = useState("");
  const [customerReviewAddonModalOpen, setCustomerReviewAddonModalOpen] = useState(false);
  const [customerSaving, setCustomerSaving] = useState(false);
  const [customerScoreDraft, setCustomerScoreDraft] = useState("");
  const [customerBonusDirection, setCustomerBonusDirection] = useState<"add" | "subtract" | null>(null);
  const [customerNominalDraft, setCustomerNominalDraft] = useState("");
  const [customerNotesDraft, setCustomerNotesDraft] = useState("");
  const [crewAnalystScoreDraft, setCrewAnalystScoreDraft] = useState("");
  const [crewBbaAdjustmentDraft, setCrewBbaAdjustmentDraft] = useState("");
  const [crewAnalystFeedbackDraft, setCrewAnalystFeedbackDraft] = useState("");
  // Dirty-state refs — true if user edited draft without saving
  const absensiDirtyRef = useRef(false);
  const internalDirtyRef = useRef(false);
  const customerDirtyRef = useRef(false);
  const [crewAuditSaving, setCrewAuditSaving] = useState(false);
  const [crewAuditDirty, setCrewAuditDirty] = useState(false);
  const [overrideActive, setOverrideActive] = useState(false);
  const [crewLockToggling, setCrewLockToggling] = useState(false);
  /** hari masuk per karyawan (keyed by userId) — local state, disimpan ke DB saat Simpan Draft */
  const [daysWorkedMap, setDaysWorkedMap] = useState<Record<string, string>>({});
  /** userId yang sedang dibuka modal payroll detailnya; null = modal tertutup */
  const [payrollModalUserId, setPayrollModalUserId] = useState<string | null>(null);
  /** mode edit di dalam modal payroll */
  const [payrollModalEditMode, setPayrollModalEditMode] = useState(false);
  /** draft field edit di dalam modal (key = field name, value = string input) */
  const [payrollModalDraft, setPayrollModalDraft] = useState<Record<string, string>>({});
  /** apakah dialog pilihan simpan (bulan ini saja / jadikan default) ditampilkan */
  const [payrollSaveChoiceOpen, setPayrollSaveChoiceOpen] = useState(false);
  // BPJS modal state (4 components matching branch management form)
  const [payrollModalBpjsKesK, setPayrollModalBpjsKesK] = useState(0);
  const [payrollModalBpjsTkK,  setPayrollModalBpjsTkK]  = useState(0);
  const [payrollModalBpjsKesP, setPayrollModalBpjsKesP] = useState(0);
  const [payrollModalBpjsTkP,  setPayrollModalBpjsTkP]  = useState(0);
  const [payrollModalCustomAdj, setPayrollModalCustomAdj] = useState<Array<{id: string; name: string; type: 'addition' | 'deduction'; amount: number}>>([]);
  /** override config lokal per userId (bulan ini saja) — dipakai sampai page reload */
  const [payrollConfigOverrides, setPayrollConfigOverrides] = useState<Record<string, {
    baseSalary: number; posAllowance: number; mealAllowance: number;
    transAllowance: number; bpjsDeduction: number; customAdjustments: any[];
  }>>({});
  /** userId yang dipilih di card Rapor Kinerja (tab payroll) — terpisah dari selectedUserId */
  const [payrollRaportUserId, setPayrollRaportUserId] = useState<string>("");
  const [publishReason, setPublishReason] = useState("");
  const [unpublishReason, setUnpublishReason] = useState("");
  const [recalcReason, setRecalcReason] = useState("");

  const router = useRouter();

  useEffect(() => {
    queueMicrotask(() => setSelectedDateKey(selectedDate));
  }, [selectedDate]);

  // --- FORMATTER HELPERS ---
  const formatIDR = (val: number | null | undefined) => {
    const value = val || 0;
    if (!isMounted) return `Rp ${value.toFixed(0)}`;
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
  };

  const formatNumber = (val: number | null | undefined) => {
    const value = val || 0;
    if (!isMounted) return value.toFixed(0);
    return new Intl.NumberFormat('id-ID').format(value);
  };

  // --- CALCULATIONS ---
  const today = new Date();
  const isCurrentMonth = today.getMonth() + 1 === month && today.getFullYear() === year;
  const totalDaysInMonth = new Date(year, month, 0).getDate();
  const monthStartKey = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEndKey = `${year}-${String(month).padStart(2, "0")}-${String(totalDaysInMonth).padStart(2, "0")}`;
  const todayKey = jakartaDateKeyFromIso(today.toISOString());
  const clampedSelectedDate =
    selectedDateKey < monthStartKey
      ? monthStartKey
      : selectedDateKey > monthEndKey
        ? monthEndKey
        : selectedDateKey;
  /** Batas atas agregat MTD cabang & leaderboard: bulan berjalan = s/d hari ini; bulan lampau = full bulan. */
  const mtdThroughDateKey =
    !isCurrentMonth
      ? monthEndKey
      : todayKey < monthStartKey
        ? monthStartKey
        : todayKey > monthEndKey
          ? monthEndKey
          : todayKey;
  const scopedAchievements = achievements.filter((row) => {
    const key = String(row.achievement_date ?? "").slice(0, 10);
    if (key < monthStartKey || key > monthEndKey) return false;
    if (!isCurrentMonth) return true;
    return key <= mtdThroughDateKey;
  });
  const dailyAchievement = achievements.find(
    (row) => String(row.achievement_date ?? "").slice(0, 10) === clampedSelectedDate,
  );
  const dailyOmzet = Number(dailyAchievement?.total_omzet ?? 0);
  const dailyTrx = Number(dailyAchievement?.total_transactions ?? 0);
  const dailyItems = Number(dailyAchievement?.total_items ?? 0);
  const dailyRejected = Number(dailyAchievement?.rejected_count ?? 0);
  const dailyRejectedEst = Number(dailyAchievement?.rejected_omzet_est ?? 0);
  /** True jika tanggal yang dipilih melampaui batas MTD (tanggal masa depan — belum ada data). */
  const dailyIsFuture = clampedSelectedDate > mtdThroughDateKey;

  const accumulatedOmzet = scopedAchievements.reduce((acc, curr) => acc + Number(curr.total_omzet), 0);
  const totalTransactions = scopedAchievements.reduce((acc, curr) => acc + Number(curr.total_transactions), 0);
  const totalItems = scopedAchievements.reduce((acc, curr) => acc + Number(curr.total_items), 0);
  const totalRejected = scopedAchievements.reduce((acc, curr) => acc + Number(curr.rejected_count), 0);
  const totalRejectedOmzet = scopedAchievements.reduce((acc, curr) => acc + Number(curr.rejected_omzet_est), 0);

  /** Hari kalender inklusif dari awal bulan s/d batas MTD (untuk proyeksi run-rate). */
  const mtdDaysElapsedInclusive = (() => {
    const s = new Date(`${monthStartKey}T12:00:00`);
    const e = new Date(`${mtdThroughDateKey}T12:00:00`);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 1;
    if (e < s) return 1;
    return Math.floor((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  })();
  /** Proyeksi omzet jika rata-rata harian MTD dipertahankan sampai akhir bulan (linear). */
  const projectedMonthEndOmzet =
    mtdDaysElapsedInclusive > 0 ? (accumulatedOmzet / mtdDaysElapsedInclusive) * totalDaysInMonth : accumulatedOmzet;
  const avgDailyMtdOmzet = mtdDaysElapsedInclusive > 0 ? accumulatedOmzet / mtdDaysElapsedInclusive : 0;

  const targetOmzet = kpi?.target_omzet || 0;
  // Use configured working days for all daily-target calculations so they match the KPI calculator.
  // Falls back to calendar days only when the config is absent.
  const effectiveWorkDays: number =
    Number((kpi?.bonus_config_v2 as any)?.global?.default_working_days) || totalDaysInMonth;
  const achievementPercent = targetOmzet > 0 ? (accumulatedOmzet / targetOmzet) * 100 : 0;
  const projectedVsTargetPercent =
    targetOmzet > 0 ? (projectedMonthEndOmzet / targetOmzet) * 100 : 0;
  const dailyTarget = targetOmzet > 0 ? targetOmzet / effectiveWorkDays : 0;
  const dailyAchievementPercent = dailyTarget > 0 ? (dailyOmzet / dailyTarget) * 100 : 0;

  const atv = totalTransactions > 0 ? accumulatedOmzet / totalTransactions : 0;
  const atu = totalTransactions > 0 ? totalItems / totalTransactions : 0;

  const scopedCrewAchievements = crewAchievements.filter((row) => {
    const key = String(row.achievement_date ?? "").slice(0, 10);
    if (key < monthStartKey || key > monthEndKey) return false;
    if (!isCurrentMonth) return true;
    return key <= mtdThroughDateKey;
  });

  // --- INDIVIDUAL STATS & BONUS ---
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const userStats = useMemo(() => {
    const stats: Record<string, any> = {};
    
    if (!scopedCrewAchievements || scopedCrewAchievements.length === 0) return [];

    scopedCrewAchievements.forEach(a => {
      const uid = a.user_id;
      if (!stats[uid]) {
        const config = payrollConfigs?.find((pc: any) => String(pc.user_id) === String(uid));
        const crewAudit = crewAudits?.find((ca: any) => ca.user_id === uid);
        
        // Handle different join structures for user name
        let name = "Unknown Employee";
        if (a.app_users) {
          name = Array.isArray(a.app_users) ? a.app_users[0]?.full_name : a.app_users?.full_name;
        }

        stats[uid] = { 
          id: uid,
          name: name || "User " + uid.substring(0, 4), 
          omzet: 0, transactions: 0, items: 0,
          config,
          audit: crewAudit || { status: 'DRAFT', is_locked: false }
        };
      }
      stats[uid].omzet += Number(a.omzet || 0);
      stats[uid].transactions += Number(a.transactions || 0);
      stats[uid].items += Number(a.items || 0);
    });

    // Team-level averages for SARP (formula selaras sync-leaderboard-snapshots.ts)
    let _teamOmzet = 0, _teamTrx = 0, _teamItems = 0;
    for (const u of Object.values(stats) as any[]) {
      _teamOmzet += u.omzet;
      _teamTrx   += u.transactions;
      _teamItems += u.items;
    }
    const teamAvgAtv = _teamTrx > 0 ? _teamOmzet / _teamTrx : 0;
    const teamAvgAtu = _teamTrx > 0 ? _teamItems / _teamTrx : 0;

    const crewCount = Math.max(activeCrewCount, Object.keys(stats).length, 1);
    const configV2Raw = kpi?.bonus_config_v2;
    const configV2 = isKpiConfigV2(configV2Raw) ? configV2Raw : null;

    const dailyRows = scopedAchievements.map((row) => ({
      achievement_date: String(row.achievement_date ?? "").slice(0, 10),
      total_omzet: Number(row.total_omzet ?? 0),
      total_transactions: Number(row.total_transactions ?? 0),
      total_items: Number(row.total_items ?? 0),
    }));

    const crewRows = scopedCrewAchievements.map((a) => ({
      user_id: String(a.user_id),
      achievement_date: String(a.achievement_date ?? "").slice(0, 10),
      omzet: Number(a.omzet ?? 0),
      transactions: Number(a.transactions ?? 0),
      items: Number(a.items ?? 0),
    }));

    const bonusV2ByUser = new Map<
      string,
      { kpiBonus: number; kpiAchievement: number; targetAssigned: number }
    >();
    const bonusV2FullByUser = new Map<string, BonusResult>();

    if (configV2) {
      const results = calculateMonthlyBonusFromInputs(configV2, dailyRows, crewRows);
      for (const br of results) {
        bonusV2FullByUser.set(br.user_id, br);
        const { achievement_percent, target_omzet_display } = pickPrimaryKpiDisplayFromBonusResult(
          br,
          configV2,
          crewCount,
        );
        bonusV2ByUser.set(br.user_id, {
          kpiBonus: br.total_bonus,
          kpiAchievement: achievement_percent,
          targetAssigned: target_omzet_display,
        });
      }
    }

    return Object.values(stats).map((u: any) => {
      const { kpiBonus, kpiAchievement, targetAssigned } = bonusV2ByUser.get(u.id) ?? {
        kpiBonus: 0,
        kpiAchievement: 0,
        targetAssigned: crewCount > 0 ? (Number(kpi?.target_omzet) || 0) / crewCount : 0,
      };

      const baseSalary = Number(u.config?.base_salary || 0);

      const posAllowance = Number(u.config?.position_allowance || 0);
      const mealAllowance = Number(u.config?.meal_allowance || 0);
      const transAllowance = Number(u.config?.transport_allowance || 0);
      const bpjsDeduction = Number(u.config?.bpjs_deduction || 0);

      // Tunjangan makan & transport adalah tarif harian — estimasi THP pakai default_working_days
      // (hari aktual baru diketahui setelah diisi di tab Payroll)
      const defaultWorkingDays: number =
        Number((kpi?.bonus_config_v2 as any)?.global?.default_working_days) || 26;
      const mealTotal  = mealAllowance  * defaultWorkingDays;
      const transTotal = transAllowance * defaultWorkingDays;

      const productBonus = computeProductFokusBonusTotalForUser(u.id, productFokusConfigs, approvedProductRows, {
        monthStartKey,
        mtdThroughDateKey,
      });
      const adjustment = Number(u.audit?.bba_adjustment || 0);
      const payrollCustomNet = netFromCustomAdjustments(u.config?.custom_adjustments);

      const thp =
        baseSalary +
        posAllowance +
        mealTotal +
        transTotal -
        bpjsDeduction +
        kpiBonus +
        productBonus +
        adjustment +
        payrollCustomNet;

      const _uAtv = u.transactions > 0 ? u.omzet / u.transactions : 0;
      const _uAtu = u.transactions > 0 ? u.items / u.transactions : 0;
      const _atvPct = teamAvgAtv > 0 ? (_uAtv / teamAvgAtv) * 100 : 0;
      const _atuPct = teamAvgAtu > 0 ? (_uAtu / teamAvgAtu) * 100 : 0;
      const _sarpPct = (_atvPct + _atuPct) / 2;

      return {
        ...u,
        targetAssigned,
        atv: _uAtv,
        atu: _uAtu,
        atvPct: _atvPct,
        atuPct: _atuPct,
        sarpPct: _sarpPct,
        kpiAchievement,
        baseSalary,
        posAllowance,
        mealAllowance,
        transAllowance,
        bpjsDeduction,
        kpiBonus,
        productBonus,
        adjustment,
        payrollCustomNet,
        thp,
        v2BonusRow: configV2 ? bonusV2FullByUser.get(u.id) ?? null : null,
      };
    });
  }, [scopedCrewAchievements, scopedAchievements, payrollConfigs, crewAudits, kpi, activeCrewCount, productFokusConfigs, approvedProductRows, monthStartKey, mtdThroughDateKey]);
  const userStatsSortedByName = [...userStats].sort((a: any, b: any) =>
    String(a.name || "").localeCompare(String(b.name || ""), "id", { sensitivity: "base" }),
  );
  const kpiV2ConfigRaw = kpi?.bonus_config_v2;
  const kpiV2ForTable = isKpiConfigV2(kpiV2ConfigRaw) ? kpiV2ConfigRaw : null;
  const kpiV2EnabledSchemes: KpiV2SchemeId[] =
    portalMode === "owner" && kpiV2ForTable ? getKpiV2SchemesEnabledForPeriod(kpiV2ForTable) : [];
  const auditFinalizeUsesKpiV2 =
    portalMode === "audit" && kpiV2ForTable != null && getKpiV2SchemesEnabledForPeriod(kpiV2ForTable).length > 0;

  const buildOwnerVerifiedNavHref = (verifiedOnly: boolean) => {
    if (!ownerNavBasePath || !branch?.id) return ownerNavBasePath ?? "#";
    const p = new URLSearchParams();
    p.set("month", String(month));
    p.set("year", String(year));
    p.set("tenant", String(branch.id));
    if (selectedDate) p.set("date", selectedDate);
    if (!verifiedOnly) p.set("verifiedOnly", "false");
    return `${ownerNavBasePath}?${p.toString()}`;
  };
  const payrollRoleLabel = (u: any) =>
    String(u.config?.job_title ?? u.config?.position_title ?? u.config?.jabatan ?? "").trim();
  const showPayrollRoleCol =
    portalMode === "owner" && userStatsSortedByName.some((u: any) => payrollRoleLabel(u) !== "");
  const [selectedUserId, setSelectedUserId] = useState<string>(userStatsSortedByName[0]?.id ?? "");
  useEffect(() => {
    queueMicrotask(() => {
      if (!selectedUserId && userStatsSortedByName[0]?.id) {
        setSelectedUserId(userStatsSortedByName[0].id);
        return;
      }
      if (selectedUserId && !userStatsSortedByName.some((u: any) => u.id === selectedUserId)) {
        setSelectedUserId(userStatsSortedByName[0]?.id ?? "");
      }
    });
  }, [selectedUserId, userStatsSortedByName]);

  useEffect(() => {
    queueMicrotask(() => {
      // Close all addon modals when switching crew
      setAbsensiAddonModalOpen(false);
      setInternalReviewAddonModalOpen(false);
      setCustomerReviewAddonModalOpen(false);
      // Reset all draft values so the next crew opens to a clean form
      setAbsensiScoreDraft("");
      setAbsensiNominalDraft("");
      setAbsensiBonusDirection(null);
      setAbsensiNotesDraft("");
      setInternalScoreDraft("");
      setInternalBonusDirection(null);
      setInternalNominalDraft("");
      setInternalNotesDraft("");
      setCustomerScoreDraft("");
      setCustomerBonusDirection(null);
      setCustomerNominalDraft("");
      setCustomerNotesDraft("");
    });
  }, [selectedUserId]);

  useEffect(() => {
    if (!absensiAddonModalOpen) return;
    absensiDirtyRef.current = false;
  }, [absensiAddonModalOpen]);

  useEffect(() => {
    if (!internalReviewAddonModalOpen) return;
    internalDirtyRef.current = false;
  }, [internalReviewAddonModalOpen]);

  useEffect(() => {
    if (!customerReviewAddonModalOpen) return;
    customerDirtyRef.current = false;
  }, [customerReviewAddonModalOpen]);

  useEffect(() => {
    queueMicrotask(() => {
      const auditRow = (crewAudits ?? []).find((c: any) => String(c.user_id) === String(selectedUserId));
      const sc = auditRow?.analyst_score;
      if (sc != null && sc !== "" && !Number.isNaN(Number(sc))) {
        const n = Math.min(100, Math.max(0, Math.round(Number(sc))));
        setCrewAnalystScoreDraft(String(n));
      } else {
        setCrewAnalystScoreDraft("");
      }
      const adj = auditRow?.bba_adjustment;
      if (adj != null && adj !== "" && !Number.isNaN(Number(adj)) && Number(adj) !== 0) {
        const rounded = Math.round(Number(adj));
        const prefix = rounded < 0 ? "-" : "";
        setCrewBbaAdjustmentDraft(prefix + formatThousandsDotFromDigits(String(Math.abs(rounded))));
      } else {
        setCrewBbaAdjustmentDraft("");
      }
      setCrewAnalystFeedbackDraft(
        typeof auditRow?.analyst_feedback === "string" ? auditRow.analyst_feedback : "",
      );
      // Reset dirty flag and override mode when switching users
      setCrewAuditDirty(false);
      setOverrideActive(false);
    });
  }, [selectedUserId, crewAudits]);

  const selectedUser =
    userStatsSortedByName.find((u: any) => String(u.id) === String(selectedUserId)) ??
    userStatsSortedByName[0] ??
    null;
  const selectedContributionPct =
    selectedUser && accumulatedOmzet > 0
      ? (Number(selectedUser.omzet || 0) / accumulatedOmzet) * 100
      : 0;
  const kpiPeriodLabel = isCurrentMonth
    ? `MTD s/d ${mtdThroughDateKey}`
    : `Bulan penuh ${String(month).padStart(2, "0")}/${year}`;
  const scopedCrewRowsForBonus = scopedCrewAchievements.map((a) => ({
    user_id: String(a.user_id),
    achievement_date: String(a.achievement_date ?? "").slice(0, 10),
    omzet: Number(a.omzet ?? 0),
  }));
  const scopedDailyRowsForBonus = scopedAchievements.map((row) => ({
    achievement_date: String(row.achievement_date ?? "").slice(0, 10),
    total_omzet: Number(row.total_omzet ?? 0),
  }));

  // ── Leaderboard multi-line chart series ──────────────────────────────────
  const CHART_PALETTE = [
    "rgb(79 70 229)",   // indigo
    "rgb(16 185 129)",  // emerald
    "rgb(245 158 11)",  // amber
    "rgb(239 68 68)",   // red
    "rgb(59 130 246)",  // blue
    "rgb(168 85 247)",  // purple
    "rgb(236 72 153)",  // pink
    "rgb(20 184 166)",  // teal
  ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const leaderboardChartSeries: MultiLineSeries[] = useMemo(() => {
    // Grup crewAchievements per (user_id, tanggal)
    const byUserDate = new Map<string, Map<string, { omzet: number; tx: number; items: number }>>();
    for (const r of scopedCrewAchievements) {
      const uid = String(r.user_id ?? "");
      const dk = String(r.achievement_date ?? "").slice(0, 10);
      if (!uid || !dk) continue;
      if (!byUserDate.has(uid)) byUserDate.set(uid, new Map());
      const uMap = byUserDate.get(uid)!;
      const cur = uMap.get(dk) ?? { omzet: 0, tx: 0, items: 0 };
      cur.omzet += Number(r.omzet ?? 0);
      cur.tx    += Number(r.transactions ?? 0);
      cur.items += Number(r.items ?? 0);
      uMap.set(dk, cur);
    }
    // Team daily pool ATV/ATU — sama metodologi dengan SARP bulanan di tabel
    // pool ATV = totalOmzetTim / totalTxTim (bukan simple mean of individual ATVs)
    const teamByDate = new Map<string, { sumOmzet: number; sumTx: number; sumItems: number }>();
    for (const [, uMap] of byUserDate) {
      for (const [dk, d] of uMap) {
        if (d.tx <= 0) continue;
        const t = teamByDate.get(dk) ?? { sumOmzet: 0, sumTx: 0, sumItems: 0 };
        t.sumOmzet += d.omzet;
        t.sumTx    += d.tx;
        t.sumItems += d.items;
        teamByDate.set(dk, t);
      }
    }
    const dateKeys = eachDateKeyInRangeInclusive(monthStartKey, mtdThroughDateKey);
    // Warna tetap berdasarkan urutan nama (userStatsSortedByName) agar konsisten saat sort berubah
    return userStatsSortedByName.map((u: any, idx: number) => {
      const uMap = byUserDate.get(String(u.id)) ?? new Map();
      const points = dateKeys.map((dk) => {
        const d = uMap.get(dk);
        if (!d || d.tx <= 0) return { dateKey: dk, value: 0 };
        const atv = d.omzet / d.tx;
        const atu = d.items / d.tx;
        let value = 0;
        if (leaderboardSortBy === "sales") {
          value = d.omzet;
        } else if (leaderboardSortBy === "atv") {
          value = atv;
        } else if (leaderboardSortBy === "atu") {
          value = atu;
        } else {
          // SARP harian — pool ATV/ATU tim hari itu (selaras formula tabel bulanan)
          const team = teamByDate.get(dk);
          const tAtv = team && team.sumTx > 0 ? team.sumOmzet / team.sumTx : 0;
          const tAtu = team && team.sumTx > 0 ? team.sumItems / team.sumTx : 0;
          const atvPct = tAtv > 0 ? (atv / tAtv) * 100 : 0;
          const atuPct = tAtu > 0 ? (atu / tAtu) * 100 : 0;
          value = (atvPct + atuPct) / 2;
        }
        return { dateKey: dk, value };
      });
      return { id: String(u.id), name: u.name, color: CHART_PALETTE[idx % CHART_PALETTE.length], points };
    })
    // Hilangkan user yang semua nilainya 0 agar tidak muncul di legend sebagai garis invisible
    .filter(s => s.points.some(p => p.value > 0));
  }, [scopedCrewAchievements, leaderboardSortBy, userStatsSortedByName, monthStartKey, mtdThroughDateKey]);

  const leaderboardChartFormat = useMemo(() => {
    if (leaderboardSortBy === "sarp") return (n: number) => `${n.toFixed(1)}%`;
    if (leaderboardSortBy === "atu")  return (n: number) => n.toFixed(2);
    // sales & atv → IDR compact
    return (n: number) => {
      if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
      if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}jt`;
      if (n >= 1_000)         return `${(n / 1_000).toFixed(0)}rb`;
      return String(Math.round(n));
    };
  }, [leaderboardSortBy]);

  const leaderboardChartLabel = leaderboardSortBy === "sales" ? "Omzet harian (Rp)"
    : leaderboardSortBy === "atv"  ? "ATV harian (Rp)"
    : leaderboardSortBy === "atu"  ? "ATU harian"
    : "SARP harian (%)";
  // ─────────────────────────────────────────────────────────────────────────

  /** Satu titik per hari kalender bulan ini (1…N); omzet 0 bila belum ada entri crew. */
  const selectedOmzetLinePoints = (() => {
    const uid = String(selectedUser?.id ?? "");
    const byDate = new Map<string, number>();
    for (const r of scopedCrewAchievements) {
      if (!uid || String(r.user_id) !== uid) continue;
      const dk = String(r.achievement_date ?? "").slice(0, 10);
      if (!dk) continue;
      byDate.set(dk, (byDate.get(dk) ?? 0) + Number(r.omzet || 0));
    }
    // Hanya s/d hari ini (bulan berjalan) atau s/d akhir bulan (bulan lampau)
    return eachDateKeyInRangeInclusive(monthStartKey, mtdThroughDateKey).map((dateKey) => ({
      dateKey,
      amount: byDate.get(dateKey) ?? 0,
    }));
  })();
  const selectedProductRows = (approvedProductRows ?? []).filter((row: any) => {
    const submission = Array.isArray(row.submission) ? row.submission[0] : row.submission;
    const uid = String(submission?.user_id ?? "");
    const dateKey = String(submission?.submission_date ?? "").slice(0, 10);
    if (!selectedUser?.id || uid !== String(selectedUser.id)) return false;
    if (!dateKey) return false;
    if (!isCurrentMonth) return dateKey >= monthStartKey && dateKey <= monthEndKey;
    return dateKey >= monthStartKey && dateKey <= mtdThroughDateKey;
  });
  const soldByProductId = new Map<string, number>();
  for (const row of selectedProductRows) {
    const pid = String(row.product_id ?? "");
    if (!pid) continue;
    soldByProductId.set(pid, (soldByProductId.get(pid) ?? 0) + Number(row.quantity_sold ?? 0));
  }
  const autoProductBonusRows = (productFokusConfigs ?? []).map((cfg: any) => {
    const productId = String(cfg.product_id ?? "");
    const sold = soldByProductId.get(productId) ?? 0;
    const targetValue = Number(cfg.target_value ?? 0);
    const bonusValue = Number(cfg.bonus_value ?? 0);
    const step = Number(cfg.bonus_step ?? 1) || 1;
    const progressPct = targetValue > 0 ? (sold / targetValue) * 100 : 0;
    const excess = Math.max(0, sold - targetValue);
    let earned = 0;
    if (cfg.bonus_type === "kelipatan") {
      // Bonus aktif hanya setelah target tercapai; yang dihitung hanya kelebihan dari target.
      earned = sold >= targetValue ? Math.floor(excess / step) * bonusValue : 0;
    } else {
      // Flat bonus diberikan sekali saat target tercapai.
      earned = sold >= targetValue ? bonusValue : 0;
    }
    return {
      id: cfg.id,
      productName: cfg.master_products?.product_name || "Produk",
      bonusType: (cfg.bonus_type ?? "flat") as "flat" | "kelipatan",
      targetType: cfg.target_type,
      targetValue,
      sold,
      progressPct,
      bonusEarned: earned,
    };
  });
  const totalAutoProductBonus = autoProductBonusRows.reduce((acc: number, r: any) => acc + Number(r.bonusEarned || 0), 0);
  const addonAbsensiEnabled = (addons ?? []).some((a: any) => a.addon_key === ADDON_KEY_ABSENSI);
  const addonInternalReviewEnabled = (addons ?? []).some((a: any) => a.addon_key === ADDON_KEY_REVIEW_INTERNAL);
  const addonCustomerReviewEnabled = (addons ?? []).some((a: any) => a.addon_key === ADDON_KEY_REVIEW_PELANGGAN);
  const payrollAddonEnabled = (addons ?? []).some((a: any) => a.addon_key === ADDON_KEY_PAYROLL);
  const payrollConfigured = (payrollConfigs ?? []).length > 0;
  const anyAddonEnabled = addonAbsensiEnabled || addonInternalReviewEnabled || addonCustomerReviewEnabled;
  const activeAddonCount = [addonAbsensiEnabled, addonInternalReviewEnabled, addonCustomerReviewEnabled].filter(Boolean).length;
  const selectedAbsensiAddonRow = (monthlyAddonAppraisals ?? []).find(
    (r: any) => String(r.crew_user_id) === String(selectedUser?.id) && r.addon_key === ADDON_KEY_ABSENSI,
  );
  const selectedInternalAddonRow = (monthlyAddonAppraisals ?? []).find(
    (r: any) => String(r.crew_user_id) === String(selectedUser?.id) && r.addon_key === ADDON_KEY_REVIEW_INTERNAL,
  );
  const selectedCustomerAddonRow = (monthlyAddonAppraisals ?? []).find(
    (r: any) => String(r.crew_user_id) === String(selectedUser?.id) && r.addon_key === ADDON_KEY_REVIEW_PELANGGAN,
  );
  // Quick-nav antar karyawan (alphabetical)
  const currentUserIdx = userStatsSortedByName.findIndex((u: any) => String(u.id) === selectedUserId);
  const prevUser = currentUserIdx > 0 ? userStatsSortedByName[currentUserIdx - 1] : null;
  const nextUser = currentUserIdx < userStatsSortedByName.length - 1 ? userStatsSortedByName[currentUserIdx + 1] : null;

  // Quick-nav tanggal harian (prev / next day)
  const dailyNavMaxKey = isCurrentMonth ? mtdThroughDateKey : monthEndKey;
  const prevDateKey = (() => {
    const d = new Date(`${clampedSelectedDate}T12:00:00+07:00`);
    d.setDate(d.getDate() - 1);
    const k = d.toISOString().slice(0, 10);
    return k >= monthStartKey ? k : null;
  })();
  const nextDateKey = (() => {
    const d = new Date(`${clampedSelectedDate}T12:00:00+07:00`);
    d.setDate(d.getDate() + 1);
    const k = d.toISOString().slice(0, 10);
    return k <= dailyNavMaxKey ? k : null;
  })();
  const selectedDateFormatted = new Date(`${clampedSelectedDate}T12:00:00+07:00`)
    .toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" });
  const mergedAttendanceForSelected = mergeAttendanceByDay(
    attendanceLogs,
    selectedUser?.id ?? "",
    monthStartKey,
    mtdThroughDateKey,
  );
  const leaveDaysSelected = leaveDaySetForUser(
    leaveRequestsApproved,
    selectedUser?.id ?? "",
    monthStartKey,
    mtdThroughDateKey,
  );
  const absensiSummaryPresent = mergedAttendanceForSelected.length;
  const absensiSummaryLate = mergedAttendanceForSelected.filter((r: any) => r.isLate).length;
  const absensiSummaryIzinDays = leaveDaysSelected.size;

  const peerReviewsForSelected = (internalReviews ?? []).filter((r: any) => {
    if (String(r.reviewee_user_id) !== String(selectedUser?.id)) return false;
    const samePeriod =
      Number(r.period_month) === Number(month) && Number(r.period_year) === Number(year);
    const dk = jakartaDateKeyFromIso(String(r.created_at ?? ""));
    const inCalendarMonth = dk >= monthStartKey && dk <= monthEndKey;
    if (!samePeriod && !inCalendarMonth) return false;
    if (!isCurrentMonth) return true;
    return dk <= mtdThroughDateKey;
  });
  const internalSummaryMasukanCount = peerReviewsForSelected.length;
  const internalSummaryAvgRating =
    internalSummaryMasukanCount > 0
      ? peerReviewsForSelected.reduce((acc: number, r: any) => acc + Number(r.rating ?? 0), 0) /
        internalSummaryMasukanCount
      : 0;
  const peerReviewsSortedForModal = [...peerReviewsForSelected].sort(
    (a: any, b: any) =>
      new Date(String(b.created_at ?? 0)).getTime() - new Date(String(a.created_at ?? 0)).getTime(),
  );

  const customerReviewsForSelected = (customerReviews ?? []).filter((r: any) => {
    const tag = customerReviewTaggedUserId(r);
    if (tag && tag !== String(selectedUser?.id)) return false;
    const dk = jakartaDateKeyFromIso(customerReviewEventIso(r));
    if (dk < monthStartKey || dk > monthEndKey) return false;
    if (!isCurrentMonth) return true;
    return dk <= mtdThroughDateKey;
  });
  const customerSummaryMasukanCount = customerReviewsForSelected.length;
  const customerSummaryAvgRating =
    customerSummaryMasukanCount > 0
      ? customerReviewsForSelected.reduce((acc: number, r: any) => acc + Number(r.rating ?? 0), 0) /
        customerSummaryMasukanCount
      : 0;
  const customerReviewsSortedForModal = [...customerReviewsForSelected].sort(
    (a: any, b: any) =>
      new Date(customerReviewEventIso(b)).getTime() - new Date(customerReviewEventIso(a)).getTime(),
  );

  const dailyDetailRowsForSelected = (crewAchievements ?? [])
    .filter((r: any) => String(r.user_id) === String(selectedUser?.id ?? ""))
    .filter((r: any) => {
      const key = String(r.achievement_date ?? "").slice(0, 10);
      if (key < monthStartKey || key > monthEndKey) return false;
      if (!isCurrentMonth) return true;
      return key <= mtdThroughDateKey;
    })
    .sort((a: any, b: any) => String(a.achievement_date).localeCompare(String(b.achievement_date)));
  // Rata-rata omzet per hari KERJA unik (bukan per baris — hindari distorsi jika ada 2 baris satu hari)
  const selectedAvgDailyOmzet = (() => {
    if (dailyDetailRowsForSelected.length === 0) return 0;
    const totalOmzet = dailyDetailRowsForSelected.reduce((acc: number, r: any) => acc + Number(r.omzet ?? 0), 0);
    const uniqueDays = new Set(dailyDetailRowsForSelected.map((r: any) => String(r.achievement_date ?? "").slice(0, 10))).size;
    return uniqueDays > 0 ? totalOmzet / uniqueDays : 0;
  })();
  // Baris karyawan terpilih pada tanggal yang dipilih (untuk highlight & ringkasan)
  const selectedDateRow = dailyDetailRowsForSelected.find(
    (r: any) => String(r.achievement_date ?? "").slice(0, 10) === clampedSelectedDate,
  );
  const sdTx = Number(selectedDateRow?.transactions ?? 0);
  const sdOmzet = Number(selectedDateRow?.omzet ?? 0);
  const sdItems = Number(selectedDateRow?.items ?? 0);
  const sdRej = Number(selectedDateRow?.rejected_customer_total ?? 0);
  const sdAtv = sdTx > 0 ? sdOmzet / sdTx : 0;
  const sdAtu = sdTx > 0 ? sdItems / sdTx : 0;
  const dailyTotals = dailyDetailRowsForSelected.reduce(
    (acc: { tx: number; items: number; omzet: number; rej: number; rejOmzet: number }, r: any) => {
      const tx = Number(r.transactions ?? 0);
      const omzet = Number(r.omzet ?? 0);
      const items = Number(r.items ?? 0);
      const rej = Number(r.rejected_customer_total ?? 0);
      const atv = tx > 0 ? omzet / tx : 0;
      return { tx: acc.tx + tx, items: acc.items + items, omzet: acc.omzet + omzet, rej: acc.rej + rej, rejOmzet: acc.rejOmzet + atv * rej };
    },
    { tx: 0, items: 0, omzet: 0, rej: 0, rejOmzet: 0 },
  );
  const dailyFooterAtv = dailyTotals.tx > 0 ? dailyTotals.omzet / dailyTotals.tx : 0;
  const dailyFooterAtu = dailyTotals.tx > 0 ? dailyTotals.items / dailyTotals.tx : 0;

  const payrollVariableBonusEarn = totalAutoProductBonus;
  // defaultWd: estimasi hari kerja untuk menghitung tunjangan harian di preview per-karyawan.
  // Nilai aktual diinput per-user di tab Payroll; di sini pakai default_working_days dari KPI.
  const defaultWd = Number((kpi?.bonus_config_v2 as any)?.global?.default_working_days) || 26;
  const payrollDasarTakeHome = selectedUser
    ? Number(selectedUser.baseSalary || 0) +
      Number(selectedUser.posAllowance || 0) +
      Number(selectedUser.mealAllowance || 0) * defaultWd +
      Number(selectedUser.transAllowance || 0) * defaultWd -
      Number(selectedUser.bpjsDeduction || 0) +
      Number(selectedUser.payrollCustomNet || 0)
    : 0;

  const payrollEstimatedTakeHomeSelected = selectedUser
    ? payrollDasarTakeHome +
      Number(selectedUser.kpiBonus || 0) +
      payrollVariableBonusEarn +
      Number(selectedUser.adjustment || 0)
    : 0;

  const payrollCustomBreakdownRows = (() => {
    const detailed = customAdjustmentTableRows(selectedUser?.config?.custom_adjustments);
    if (detailed.length > 0) return detailed;
    const net = Number(selectedUser?.payrollCustomNet ?? 0);
    if (net !== 0) {
      return [
        {
          key: "payroll-custom-aggregate",
          label: "Penyesuaian konfigurasi payroll (cabang)",
          val: net,
          tone: net < 0 ? "text-rose-700" : "text-slate-800",
        },
      ];
    }
    return [];
  })();

  const payrollSlipDasarRows = selectedUser
    ? [
        { key: "gaji-pokok", label: "Gaji pokok", val: Number(selectedUser.baseSalary || 0), tone: "" },
        { key: "tunj-jabatan", label: "Tunjangan jabatan", val: Number(selectedUser.posAllowance || 0), tone: "" },
        { key: "tunj-makan", label: `Tunjangan makan (est. ${defaultWd} hari)`, val: Number(selectedUser.mealAllowance || 0) * defaultWd, tone: "" },
        { key: "tunj-transport", label: `Tunjangan transport (est. ${defaultWd} hari)`, val: Number(selectedUser.transAllowance || 0) * defaultWd, tone: "" },
        ...payrollCustomBreakdownRows.map((r) => ({
          key: r.key,
          label: r.label,
          val: r.val,
          tone: r.tone,
        })),
        {
          key: "bpjs",
          label: "Potongan BPJS",
          val: -(Number(selectedUser.bpjsDeduction ?? 0)),
          tone: "text-rose-700",
        },
      ]
    : [];

  const payrollSlipBonusRows = selectedUser
    ? [
        {
          key: "bonus-kpi",
          label: "Bonus KPI (auto)",
          val: Number(selectedUser.kpiBonus || 0),
          tone: "text-indigo-700",
        },
        {
          key: "bonus-produk",
          label: "Produk fokus (auto)",
          val: totalAutoProductBonus,
          tone: "text-emerald-700",
        },
        {
          key: "bba-adj",
          label: "Penyesuaian Bonus",
          val: Number(selectedUser.adjustment ?? 0),
          tone: Number(selectedUser.adjustment ?? 0) < 0 ? "text-rose-700" : "text-slate-800",
        },
      ]
    : [];

  const payrollBonusPeriodSubtotal = selectedUser
    ? Number(selectedUser.kpiBonus || 0) + payrollVariableBonusEarn + Number(selectedUser.adjustment || 0)
    : 0;


  const raportUserRejectedCount = dailyDetailRowsForSelected.reduce(
    (acc: number, r: any) => acc + Number(r.rejected_customer_total ?? 0),
    0,
  );
  const raportUserRejectedOmzetEst = dailyDetailRowsForSelected.reduce((acc: number, r: any) => {
    const tx = Number(r.transactions ?? 0);
    const omzet = Number(r.omzet ?? 0);
    const rej = Number(r.rejected_customer_total ?? 0);
    const atvRow = tx > 0 ? omzet / tx : 0;
    return acc + atvRow * rej;
  }, 0);
  const crewRowLockedForSelected = Boolean((crewAudits ?? []).find((c: any) => String(c.user_id) === String(selectedUser?.id))?.is_locked);
  const raportPublishedLocked = Boolean(raportPeriodPublished);
  const crewAuditInputsLocked = crewRowLockedForSelected || raportPublishedLocked || (audit?.status === "APPROVED" && !overrideActive);
  const crewLockToggleDisabled = raportPublishedLocked;

  // --- PUBLISH WARNINGS ---
  // Warning: not yet end of target month
  const notEndOfMonthYet = (() => {
    const now = new Date();
    const lastDay = new Date(year, month, 0).getDate();
    const isTargetCurrent = now.getMonth() + 1 === month && now.getFullYear() === year;
    return isTargetCurrent && now.getDate() < lastDay;
  })();
  const publishWarningCount = notEndOfMonthYet ? 1 : 0;

  const bonusKpiAuto = Number(selectedUser?.kpiBonus ?? 0);
  const bonusProdukFokusAuto = totalAutoProductBonus;
  const bonusBbaAdjustment = Number(selectedUser?.adjustment ?? 0);
  const bonusVariableTotal = bonusKpiAuto + bonusProdukFokusAuto + bonusBbaAdjustment;

  const bonusSourceSummaryCard = (selectedUser || portalMode === "owner") ? (
    <GlassCard className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
      <p className="mb-3 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
        Ringkasan sumber bonus variabel
        <InfoTooltip side="bottom" width="w-80" content={
          <div className="space-y-1.5">
            <p className="font-black text-slate-700">Ringkasan Bonus Variabel</p>
            <p>Rincian semua komponen bonus yang diterima karyawan ini di luar gaji pokok dan tunjangan tetap.</p>
            <ul className="mt-1 space-y-1 pl-3 text-slate-600">
              <li>• <strong>Bonus KPI</strong> — dari pencapaian target omzet (dihitung otomatis).</li>
              <li>• <strong>Produk fokus</strong> — dari penjualan produk target cabang (dihitung otomatis).</li>
              <li>• <strong>Penyesuaian Bonus</strong> — nominal tambahan/potongan yang diinput auditor di form penilaian.</li>
            </ul>
          </div>
        } />
      </p>
      <div className="space-y-2">
        {[
          { label: "Bonus KPI (auto)", val: bonusKpiAuto, tone: "text-indigo-700" },
          { label: "Produk fokus (auto)", val: bonusProdukFokusAuto, tone: "text-sky-700" },
          { label: "Penyesuaian Bonus", val: bonusBbaAdjustment, tone: "text-amber-800" },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-[12px]">
            <span className="font-semibold text-slate-700">{row.label}</span>
            <span className={cn("font-bold tabular-nums", row.tone)}>{formatIDR(row.val)}</span>
          </div>
        ))}
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-200 pt-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Σ Total bonus variabel
          </span>
          <span className="text-sm font-black tabular-nums text-emerald-700">{formatIDR(bonusVariableTotal)}</span>
        </div>
      </div>
    </GlassCard>
  ) : null;

  const status = audit?.status || 'DRAFT';
  const isTrialReadOnly = isTrialBranch === true;
  const [isPending, startTransition] = useTransition();
  const [isPayrollSavePending, startPayrollSaveTransition] = useTransition();

  /** Satu jalur utama: dari Draft otomatis UNDER_REVIEW lalu finalisasi (server tetap memakai state machine). */
  const handleApproveAndSyncAudit = () => {
    if (!audit?.id) return;
    if (isTrialReadOnly) { toast.info("Mode demo/trial — tindakan ini tidak tersedia."); return; }
    if (status === "APPROVED") {
      toast.error("Audit sudah difinalisasi.");
      return;
    }
    if (status !== "DRAFT" && status !== "UNDER_REVIEW") {
      toast.error("Status audit tidak mendukung persetujuan.");
      return;
    }
    const v2Note = auditFinalizeUsesKpiV2
      ? "\n\nSinkronisasi rapor memakai perhitungan KPI V2 (skema aktif di konfigurasi cabang)."
      : "";
    const upstreamNote =
      "\n\nPastikan submission harian sudah diverifikasi Admin Cabang (portal Admin → Verifikasi).";
    const draftLead =
      "Setujui audit dari Draft? Status menjadi Approved, baris karyawan dikunci, dan rapor bulanan disinkronkan.";
    const reviewLead =
      "Setujui audit sekarang? Status menjadi Approved, baris karyawan dikunci, dan rapor bulanan disinkronkan.";
    if (
      !confirm(
        `${status === "DRAFT" ? draftLead : reviewLead}${upstreamNote}${v2Note}\n\nSetelah APPROVED, gunakan tombol Publish Rapor yang muncul di halaman ini untuk mempublish ke crew & owner.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      if (status === "DRAFT") {
        const submitted = await submitAuditForReviewAction(audit.id);
        if (submitted.error) {
          toast.error(submitted.error);
          return;
        }
      }
      const finalized = await finalizeAuditAction(audit.id);
      if (finalized.error) toast.error(finalized.error);
      else {
        toast.success(finalized.message);
        router.refresh();
      }
    });
  };

  /** Satu-klik publish: chain DRAFT→UNDER_REVIEW→APPROVED→Published dengan warning cerdas. */
  const handlePublishAll = () => {
    if (!audit?.id) { toast.error("Data audit tidak ditemukan."); return; }
    if (isTrialReadOnly) { toast.info("Mode demo/trial — tindakan ini tidak tersedia."); return; }
    if (raportPeriodPublished) { toast.error("Rapor sudah dipublish."); return; }

    const warnings: string[] = [];
    if (notEndOfMonthYet) {
      const now = new Date();
      const lastDay = new Date(year, month, 0).getDate();
      warnings.push(`Bulan ${month}/${year} belum berakhir (hari ini ${now.getDate()}, hari terakhir ${lastDay}).`);
    }
    if (warnings.length > 0) {
      const proceed = confirm(
        `⚠️ Peringatan sebelum publish:\n\n${warnings.map((w, i) => `${i + 1}. ${w}`).join("\n")}\n\nLanjutkan publish?`,
      );
      if (!proceed) return;
    }

    startTransition(async () => {
      if (status === "DRAFT") {
        const r = await submitAuditForReviewAction(audit.id);
        if (r.error) { toast.error(r.error); return; }
      }
      if (status !== "APPROVED") {
        const r = await finalizeAuditAction(audit.id);
        if (r.error) { toast.error(r.error); return; }
      }
      const autoReason = `Publish rapor ${month}/${year}`;
      const r = await publishAuditAppraisalPeriodAction(audit.id, autoReason);
      if (r.error) { toast.error(r.error); return; }
      toast.success("Rapor berhasil dipublish!");
      router.refresh();
    });
  };

  /** Simpan draft payroll (payroll_periods + payroll_items) dari tabel Payroll Preview. */
  const handleSavePayrollDraft = () => {
    if (!audit?.id && !branch?.id) {
      toast.error("Data audit / cabang tidak ditemukan.");
      return;
    }
    if (isTrialReadOnly) { toast.info("Mode demo/trial — tindakan ini tidak tersedia."); return; }
    const tenantId = String(branch?.id ?? "");
    if (!tenantId) { toast.error("ID apotek tidak tersedia."); return; }
    if (userStatsSortedByName.length === 0) {
      toast.error("Tidak ada data karyawan untuk disimpan.");
      return;
    }

    startPayrollSaveTransition(async () => {
      const items = userStatsSortedByName.map((u: any) => {
        const ovr = payrollConfigOverrides[u.id];
        const cfg = ovr ?? u;
        const dwRaw = daysWorkedMap[u.id] ?? "";
        const dw = dwRaw !== "" ? parseInt(dwRaw, 10) : null;
        const productBonus = computeProductFokusBonusTotalForUser(
          u.id, productFokusConfigs, approvedProductRows,
          { monthStartKey, mtdThroughDateKey },
        );
        return {
          userId:            String(u.id),
          daysWorked:        dw !== null && !isNaN(dw) ? dw : null,
          baseSalary:        Number(cfg.baseSalary ?? u.baseSalary ?? 0),
          posAllowance:      Number(cfg.posAllowance ?? u.posAllowance ?? 0),
          mealAllowance:     Number(cfg.mealAllowance ?? u.mealAllowance ?? 0),
          transAllowance:    Number(cfg.transAllowance ?? u.transAllowance ?? 0),
          bpjsDeduction:     Number(cfg.bpjsDeduction ?? u.bpjsDeduction ?? 0),
          customAdjustments: (cfg.customAdjustments ?? u.config?.custom_adjustments ?? []) as any[],
          kpiBonus:          Number(u.kpiBonus ?? 0),
          productBonus,
          adjustment:        Number(u.adjustment ?? 0),
          configSource:      ovr ? ("override" as const) : ("default" as const),
        };
      });

      const result = await savePayrollDraftAction({
        tenantId,
        auditId: audit?.id ?? "",
        month,
        year,
        items,
      });

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(result.message ?? "Draft payroll disimpan.");
      }
    });
  };

  /** Opsi sekunder bila perlu menjeda di UNDER_REVIEW tanpa finalisasi. */
  const handleSubmitForReviewOnly = () => {
    if (!audit?.id) return;
    if (isTrialReadOnly) { toast.info("Mode demo/trial — tindakan ini tidak tersedia."); return; }
    if (status !== "DRAFT") {
      toast.error("Hanya audit berstatus Draft yang dapat dipindahkan ke Under Review saja.");
      return;
    }
    if (
      !confirm(
        "Hanya pindahkan ke Under Review (tanpa finalisasi)? Untuk jalur normal, gunakan tombol utama Setujui & sinkronkan.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await submitAuditForReviewAction(audit.id);
      if (result.error) toast.error(result.error);
      else {
        toast.success(result.message);
        router.refresh();
      }
    });
  };

  const handleToggleCrewLock = () => {
    if (!audit?.id || !selectedUser?.id) {
      toast.error("Pilih karyawan terlebih dahulu.");
      return;
    }
    if (isTrialReadOnly) { toast.info("Mode demo/trial — tindakan ini tidak tersedia."); return; }
    if (crewLockToggleDisabled) {
      toast.error("Rapor sudah dipublish — tidak dapat diubah.");
      return;
    }

    const currentLocked = Boolean(selectedUser?.audit?.is_locked);

    // Konfirmasi khusus: unlock saat audit sudah APPROVED
    if (audit?.status === "APPROVED" && currentLocked) {
      const ok = confirm(
        "⚠️ PERINGATAN — Audit sudah APPROVED\n\n" +
        "Membuka kunci baris ini mengizinkan perubahan penilaian yang sudah disetujui.\n" +
        "Gunakan fitur ini hanya jika ada koreksi yang disengaja.\n\n" +
        "Kunci kembali baris setelah selesai mengedit.\n\n" +
        "Lanjutkan buka kunci?"
      );
      if (!ok) return;
    }

    setCrewLockToggling(true);
    startTransition(async () => {
      try {
        const result = await toggleCrewLockAction(audit.id, selectedUser.id, currentLocked);
        if (result.error) toast.error(result.error);
        else {
          toast.success(result.message);
          // After unlocking in APPROVED state, auto-activate override mode
          if (audit?.status === "APPROVED" && currentLocked) {
            setOverrideActive(true);
          }
          router.refresh();
        }
      } finally {
        setCrewLockToggling(false);
      }
    });
  };

  const persistCrewAudit = async () => {
    if (!audit?.id || !selectedUser?.id) {
      toast.error("Data audit atau karyawan tidak ditemukan.");
      return;
    }
    if (isTrialReadOnly) { toast.info("Mode demo/trial — tindakan ini tidak tersedia."); return; }
    if (crewAuditInputsLocked) {
      toast.error("Data audit terkunci, tidak dapat diubah.");
      return;
    }

    let analystScore: number | undefined;
    if (crewAnalystScoreDraft.trim() !== "") {
      const n = parseInt(stripToDigits(crewAnalystScoreDraft), 10);
      if (Number.isNaN(n) || n < 0 || n > 100) {
        toast.error("Skor analis: isi angka 0–100 atau kosongkan.");
        return;
      }
      analystScore = n;
    }

    const bbaAdjustment = parseSignedDotThousands(crewBbaAdjustmentDraft);

    setCrewAuditSaving(true);
    try {
      const result = await updateCrewAuditAction(audit.id, selectedUser.id, {
        analyst_score: analystScore,
        bba_adjustment: bbaAdjustment,
        analyst_feedback: crewAnalystFeedbackDraft.trim() || undefined,
      });
      if (result.error) toast.error(result.error);
      else {
        toast.success(result.message);
        setCrewAuditDirty(false);
        router.refresh();
      }
    } finally {
      setCrewAuditSaving(false);
    }
  };

  const handleReopenAsGlobalAdmin = () => {
    if (!audit?.id || !isGlobalSuperAdmin) return;
    if (isTrialReadOnly) { toast.info("Mode demo/trial — tindakan ini tidak tersedia."); return; }
    if (
      !confirm(
        "Buka kembali audit APPROVED? Hanya untuk super admin global. Baris karyawan akan tidak terkunci; rapor bulanan yang sudah dipublish tidak diubah otomatis.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await reopenApprovedAuditAsGlobalAdminAction(audit.id);
      if (result.error) toast.error(result.error);
      else {
        toast.success(result.message);
        router.refresh();
      }
    });
  };

  const handlePublishAppraisals = () => {
    if (!audit?.id) return;
    if (isTrialReadOnly) { toast.info("Mode demo/trial — tindakan ini tidak tersedia."); return; }
    if (publishReason.trim().length < 3) {
      toast.error("Isi alasan publish minimal 3 karakter.");
      return;
    }
    if (!confirm(`Publish rapor bulanan ${String(month).padStart(2, "0")}/${year} untuk ${branch?.name}? Data akan terkunci dan terlihat oleh crew & owner.`)) {
      return;
    }
    startTransition(async () => {
      const result = await publishAuditAppraisalPeriodAction(audit.id, publishReason.trim());
      if (result.error) toast.error(result.error);
      else {
        toast.success("Rapor berhasil dipublish!");
        setPublishReason("");
        router.refresh();
      }
    });
  };

  const handleUnpublishAppraisals = () => {
    if (!audit?.id) return;
    if (isTrialReadOnly) { toast.info("Mode demo/trial — tindakan ini tidak tersedia."); return; }
    if (unpublishReason.trim().length < 3) {
      toast.error("Isi alasan unpublish minimal 3 karakter.");
      return;
    }
    if (!confirm(`Unpublish rapor ${String(month).padStart(2, "0")}/${year} untuk ${branch?.name}? Data akan tidak terlihat oleh crew & owner sampai dipublish ulang.`)) return;
    startTransition(async () => {
      const result = await unpublishAuditAppraisalPeriodAction(audit.id, unpublishReason.trim());
      if (result.error) toast.error(result.error);
      else {
        toast.success("Rapor berhasil di-unpublish.");
        setUnpublishReason("");
        router.refresh();
      }
    });
  };

  const handleRecalculateAppraisals = () => {
    if (!audit?.id) return;
    if (isTrialReadOnly) { toast.info("Mode demo/trial — tindakan ini tidak tersedia."); return; }
    if (recalcReason.trim().length < 3) {
      toast.error("Isi alasan recalculate minimal 3 karakter.");
      return;
    }
    if (!confirm(`Recalculate rapor ${String(month).padStart(2, "0")}/${year} untuk ${branch?.name}? Bonus KPI dan add-on akan dihitung ulang dari data terkini.`)) return;
    startTransition(async () => {
      const result = await recalculateAuditAppraisalAction(audit.id, recalcReason.trim());
      if (result.error) toast.error(result.error);
      else {
        toast.success(`Recalculate selesai — ${result.affectedUserCount ?? 0} karyawan diperbarui.`);
        setRecalcReason("");
        router.refresh();
      }
    });
  };

  const handleAbsensiClose = () => {
    absensiDirtyRef.current = false;
    setAbsensiAddonModalOpen(false);
    setPhotoPreviewUrl(null);
  };

  const handleInternalClose = () => {
    internalDirtyRef.current = false;
    setInternalReviewAddonModalOpen(false);
  };

  const handleCustomerClose = () => {
    customerDirtyRef.current = false;
    setCustomerReviewAddonModalOpen(false);
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      {isTrialBranch && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4">
          <FlaskConical size={16} className="text-amber-600 shrink-0" />
          <p className="text-sm font-bold text-amber-800 flex-1">
            Apotek ini berstatus <strong>TRIAL / DEMO</strong> — semua data bersifat read-only. Tindakan approval, publish, dan edit tidak tersedia.
          </p>
        </div>
      )}
      {/* HEADER */}
      {portalMode === "audit" ? (
        <GlassCard className="p-3 md:p-4" variant="light">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 md:gap-x-4">
            <div className="flex min-w-0 items-start gap-2.5 md:gap-3">
              <Link
                href={`/bba/audit?month=${month}&year=${year}`}
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 shadow-sm transition-all hover:bg-white hover:text-sky-600 md:h-9 md:w-9"
              >
                <ArrowLeft size={15} className="md:w-[17px]" />
              </Link>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <h1 className="min-w-0 truncate text-base font-black uppercase tracking-tight text-slate-800 md:text-lg" title={branch.name}>
                    {branch.name}
                  </h1>
                  <span className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-widest md:px-2.5 md:text-[9px]",
                    raportPeriodPublished ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                  )}>
                    {raportPeriodPublished ? "✓ Published" : "Belum Published"}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[8px] font-bold uppercase tracking-widest text-slate-400 md:text-[9px]">
                  Periode: Bulan {month}/{year}
                </p>
              </div>
            </div>

            <div className="flex w-full min-w-0 shrink-0 flex-col items-stretch gap-1.5 self-start sm:w-auto sm:flex-row sm:items-center sm:gap-2">
              <Link
                href={`/bba/branches/${branch.id}?month=${month}&year=${year}`}
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-slate-100 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-slate-600 shadow-sm transition hover:bg-white md:px-3 md:py-2 md:text-[10px]"
              >
                <Calculator size={12} className="md:h-[13px] md:w-[13px]" /> Edit KPI
              </Link>

              {!raportPeriodPublished ? (
                <motion.div layout className="flex flex-col items-stretch gap-1 sm:items-end">
                  <button
                    type="button"
                    onClick={handlePublishAll}
                    disabled={isPending || !audit?.id}
                    className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-sky-600 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50 md:px-3.5 md:py-2 md:text-[10px]"
                  >
                    {isPending ? <Loader2 size={12} className="animate-spin md:h-[13px] md:w-[13px]" /> : <Lock size={12} className="md:h-[13px] md:w-[13px]" />}
                    Publish Rapor
                    {publishWarningCount > 0 && (
                      <span className="ml-0.5 rounded-full bg-amber-400 px-1.5 text-[8px] font-black text-amber-900">
                        {publishWarningCount}
                      </span>
                    )}
                  </button>
                  {publishWarningCount > 0 && (
                    <div className="flex flex-col gap-0.5 text-right">
                      {notEndOfMonthYet && (
                        <p className="text-[8px] font-semibold text-amber-600">⚠ Bulan {month}/{year} belum berakhir</p>
                      )}
                    </div>
                  )}
                </motion.div>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-700 shadow-sm">
                  <CheckCircle2 size={12} /> Rapor Aktif
                </span>
              )}

              {status === "APPROVED" && isGlobalSuperAdmin && (
                <button
                  type="button"
                  onClick={handleReopenAsGlobalAdmin}
                  disabled={isPending}
                  className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:opacity-50 md:px-3.5 md:py-2 md:text-[10px]"
                >
                  {isPending ? <Loader2 size={12} className="animate-spin md:h-[13px] md:w-[13px]" /> : null}
                  Buka kembali
                </button>
              )}
            </div>
          </div>

          {/* Super admin: unpublish + recalculate — disembunyikan di details */}
          {portalMode === "audit" && (raportPeriodPublished || status === "APPROVED") && (
            <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
              {raportPeriodPublished && isGlobalSuperAdmin && (
                <details className="group">
                  <summary className="cursor-pointer text-[9px] font-semibold text-slate-400 underline decoration-dotted hover:text-slate-600">
                    Unpublish rapor (Super Admin)
                  </summary>
                  <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      value={unpublishReason}
                      onChange={(e) => setUnpublishReason(e.target.value)}
                      placeholder="Alasan unpublish (min. 3 karakter)..."
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 placeholder:text-slate-400 focus:border-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
                    />
                    <button
                      type="button"
                      onClick={handleUnpublishAppraisals}
                      disabled={isPending || unpublishReason.trim().length < 3}
                      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-1.5 text-[9px] font-black uppercase tracking-widest text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:opacity-50"
                    >
                      {isPending ? <Loader2 size={11} className="animate-spin" /> : null}
                      Unpublish
                    </button>
                  </div>
                </details>
              )}
              {status === "APPROVED" && !raportPeriodPublished && (
                <details className="group">
                  <summary className="cursor-pointer text-[9px] font-semibold text-slate-400 underline decoration-dotted hover:text-slate-600">
                    Recalculate sebelum publish
                  </summary>
                  <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      value={recalcReason}
                      onChange={(e) => setRecalcReason(e.target.value)}
                      placeholder="Alasan recalculate (min. 3 karakter)..."
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 placeholder:text-slate-400 focus:border-violet-300 focus:outline-none focus:ring-1 focus:ring-violet-400/30"
                    />
                    <button
                      type="button"
                      onClick={handleRecalculateAppraisals}
                      disabled={isPending || recalcReason.trim().length < 3}
                      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-1.5 text-[9px] font-black uppercase tracking-widest text-violet-900 shadow-sm transition hover:bg-violet-100 disabled:opacity-50"
                    >
                      {isPending ? <Loader2 size={11} className="animate-spin" /> : null}
                      Recalculate
                    </button>
                  </div>
                </details>
              )}
            </div>
          )}
        </GlassCard>
      ) : (
        <GlassCard className="p-3 md:p-4" variant="light">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="min-w-0 truncate text-base font-black uppercase tracking-tight text-slate-800 md:text-lg" title={branch.name}>
              {branch.name}
            </h1>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-widest md:px-2.5 md:text-[9px] ${getAuditStatusBadgeClass(status)}`}
            >
              {getAuditStatusLabel(status)}
            </span>
          </div>
          <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">
            Portal owner · Bulan {String(month).padStart(2, "0")}/{year}
          </p>
        </GlassCard>
      )}

      {/* TABS */}
      {portalMode === "audit" ? (
        <div className="flex gap-1 rounded-2xl border border-slate-200/80 bg-slate-100/60 p-1.5 shadow-sm">
          {[
            { id: "harian",       label: "Harian",       icon: Calendar },
            { id: "bulanan",      label: "Bulanan",       icon: TrendingUp },
            { id: "per-karyawan", label: "Karyawan & Penilaian", icon: Users },
            ...(payrollAddonEnabled ? [
              { id: "payroll", label: "Rapor & Payroll", icon: FileText },
            ] : []),
          ].map((tabItem) => (
            <button
              key={tabItem.id}
              type="button"
              title={tabItem.label}
              onClick={() => setAuditPortalTab(tabItem.id as typeof auditPortalTab)}
              className={cn(
                "relative flex flex-1 min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 md:flex-initial md:px-4",
                activeTab === tabItem.id ? "text-emerald-700" : "text-slate-500 hover:text-slate-700",
              )}
            >
              {activeTab === tabItem.id && (
                <motion.div
                  layoutId="auditTab"
                  className="absolute inset-0 rounded-xl border border-emerald-100/90 bg-white shadow-md"
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <tabItem.icon size={15} className="shrink-0" />
                <span className="hidden md:inline whitespace-nowrap">{tabItem.label}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {/* BELUM FINAL BANNER — owner only */}
      {portalMode === "owner" && (
        raportPeriodPublished ? (
          <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
            <p className="text-[11px] font-bold text-emerald-800">
              Data periode ini sudah <span className="font-black">final</span> — rapor telah dipublish oleh tim BBA.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <Calendar size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-amber-800">Belum Final</p>
              <p className="mt-0.5 text-[11px] font-medium leading-snug text-amber-700">
                Data ini masih berjalan dan belum dikunci. Angka bonus dapat berubah sampai rapor dipublish oleh tim BBA.
              </p>
            </div>
          </div>
        )
      )}

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-10">
        <AnimatePresence mode="wait">

          {/* ─ HARIAN ─────────────────────────────── */}
          {activeTab === 'harian' && (
            <motion.div key="harian" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              {/* Daily hero card — Cabang level (date nav embedded) */}
              <GlassCard className="border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  {/* Left: label + tooltip */}
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Omzet Harian Cabang</p>
                    <InfoTooltip
                      side="bottom"
                      width="w-72"
                      content={
                        <span>
                          Ringkasan seluruh karyawan cabang pada <strong>tanggal yang dipilih</strong>.
                          <br /><br />
                          <strong>Sumber data:</strong> laporan harian (status: disetujui / diedit admin). Laporan yang masih pending atau ditolak tidak dihitung.
                          <br /><br />
                          <strong>Target harian</strong> = KPI bulanan ÷ jumlah hari kalender bulan ini (bukan hari kerja).
                          <br /><br />
                          <strong>Pelanggan Tertolak</strong> = pelanggan yang gagal dilayani. Estimasi omzet hilang dihitung dari ATV hari itu × jumlah tertolak.
                        </span>
                      }
                    />
                  </div>

                  {/* Right: date navigator + badge */}
                  <div className="flex items-center gap-2">
                    {/* ← date → navigator */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={!prevDateKey}
                        onClick={() => prevDateKey && setSelectedDateKey(prevDateKey)}
                        title={prevDateKey ?? "Sudah di awal bulan"}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-white hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      {/* Clicking the label (text + calendar icon) opens the native date picker */}
                      <label className="relative cursor-pointer" title="Klik untuk pilih tanggal dari kalender">
                        <span className="flex select-none items-center gap-1 rounded-xl px-2.5 py-1 text-[11px] font-black text-slate-700 hover:bg-slate-100">
                          {selectedDateFormatted}
                          <Calendar size={11} className="text-slate-400" />
                        </span>
                        <input
                          type="date"
                          value={clampedSelectedDate}
                          min={monthStartKey}
                          max={dailyNavMaxKey}
                          onChange={(e) => e.target.value && setSelectedDateKey(e.target.value)}
                          className="absolute inset-0 cursor-pointer opacity-0"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={!nextDateKey}
                        onClick={() => nextDateKey && setSelectedDateKey(nextDateKey)}
                        title={nextDateKey ?? "Sudah di hari terakhir"}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-white hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>

                    {/* Badge: 3 state — future / no-target / normal */}
                    {dailyIsFuture ? (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Belum tersedia
                      </span>
                    ) : targetOmzet === 0 ? (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Target belum diset
                      </span>
                    ) : (
                      <span className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest",
                        dailyAchievementPercent >= 100
                          ? "bg-emerald-50 text-emerald-700"
                          : dailyAchievementPercent >= 75
                            ? "bg-amber-50 text-amber-700"
                            : "bg-rose-50 text-rose-700",
                      )}>
                        {dailyAchievementPercent.toFixed(1)}% capaian
                      </span>
                    )}
                  </div>
                </div>

                {/* Tanggal masa depan: tampilkan pesan netral */}
                {dailyIsFuture ? (
                  <div className="flex min-h-[72px] items-center justify-center rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-5">
                    <p className="text-center text-[11px] font-semibold text-slate-400">
                      Pilih tanggal ≤ {mtdThroughDateKey} untuk melihat data.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Omzet utama + progress bar */}
                    <div className="mb-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total Omzet</p>
                      <p className="mt-1.5 text-2xl md:text-3xl font-black tracking-tight text-slate-900">{formatIDR(dailyOmzet)}</p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">
                        Target:{" "}
                        <span className="font-black text-slate-700">
                          {targetOmzet > 0 ? formatIDR(dailyTarget) : "—"}
                        </span>
                        {targetOmzet > 0 && (
                          <>
                            {" · "}
                            {dailyOmzet >= dailyTarget ? (
                              <span className="font-black text-emerald-600">+{formatIDR(dailyOmzet - dailyTarget)} surplus</span>
                            ) : (
                              <span className="font-black text-rose-600">-{formatIDR(Math.abs(dailyOmzet - dailyTarget))} defisit</span>
                            )}
                          </>
                        )}
                      </p>
                      {targetOmzet > 0 && (
                        <div className="mt-3 h-2 w-full rounded-full bg-slate-200">
                          <div
                            className={cn(
                              "h-2 rounded-full transition-all",
                              dailyAchievementPercent >= 100
                                ? "bg-emerald-500"
                                : dailyAchievementPercent >= 75
                                  ? "bg-amber-400"
                                  : "bg-rose-400",
                            )}
                            style={{ width: `${Math.max(0, Math.min(100, dailyAchievementPercent))}%` }}
                          />
                        </div>
                      )}
                    </div>
                    {/* Metrik sekunder: nota, produk, tertolak */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total Nota</p>
                        <p className="mt-1 text-lg font-black text-slate-900">{formatNumber(dailyTrx)}</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Produk Terjual</p>
                        <p className="mt-1 text-lg font-black text-slate-900">{formatNumber(dailyItems)}</p>
                      </div>
                      <div className={cn(
                        "rounded-xl border p-3",
                        dailyRejected > 0 ? "border-rose-200 bg-rose-50/60" : "border-slate-100 bg-slate-50/60",
                      )}>
                        <p className={cn(
                          "text-[9px] font-black uppercase tracking-widest",
                          dailyRejected > 0 ? "text-rose-500" : "text-slate-400",
                        )}>
                          Pelanggan Tertolak
                        </p>
                        <p className={cn("mt-1 text-lg font-black", dailyRejected > 0 ? "text-rose-700" : "text-slate-400")}>
                          {formatNumber(dailyRejected)}
                        </p>
                        {dailyRejected > 0 && (
                          <p className="mt-0.5 text-[9px] font-semibold text-rose-500">
                            est. {formatIDR(dailyRejectedEst)}
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </GlassCard>

              {/* Line chart — user nav embedded */}
              <GlassCard className="border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  {/* Left: label + tooltip */}
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Grafik Omzet Harian
                    </p>
                    <InfoTooltip
                      side="bottom"
                      width="w-72"
                      content={
                        <span>
                          <strong>Batang (bar)</strong> = omzet karyawan terpilih per hari. Batang abu-abu kecil = hari tanpa laporan (libur / tidak submit).
                          <br /><br />
                          <strong>Garis trend</strong> = menghubungkan puncak setiap batang untuk memperlihatkan naik-turun omzet.
                          <br /><br />
                          <strong>Garis oranye (Target)</strong> = target omzet harian individu karyawan ini.
                          <br /><br />
                          <strong>Garis ungu (Avg)</strong> = rata-rata omzet harian karyawan ini bulan berjalan.
                          <br /><br />
                          <strong>💡 Klik batang</strong> untuk memilih tanggal tersebut — angka harian cabang di card atas ikut berubah.
                        </span>
                      }
                    />
                  </div>

                  {/* Right: user navigator ← select → */}
                  <div className="flex w-full flex-col gap-1 md:w-auto md:min-w-[260px]">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={!prevUser || absensiSaving || internalSaving || customerSaving}
                        onClick={() => prevUser && setSelectedUserId(String(prevUser.id))}
                        title={prevUser ? `Sebelumnya: ${prevUser.name}` : "Sudah di awal"}
                        className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-white hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <select
                        value={selectedUserId}
                        onChange={(e) => setSelectedUserId(e.target.value)}
                        disabled={absensiSaving || internalSaving || customerSaving}
                        className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 shadow-inner focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {userStatsSortedByName.map((u: any) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!nextUser || absensiSaving || internalSaving || customerSaving}
                        onClick={() => nextUser && setSelectedUserId(String(nextUser.id))}
                        title={nextUser ? `Berikutnya: ${nextUser.name}` : "Sudah di akhir"}
                        className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-white hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                    <p className="text-[9px] font-semibold text-slate-400">
                      {currentUserIdx + 1} / {userStatsSortedByName.length} karyawan · {monthStartKey} s/d {mtdThroughDateKey}
                    </p>
                  </div>
                </div>
                <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/40 p-3 md:p-4">
                  <CustomLineChart
                    points={selectedOmzetLinePoints}
                    highlightDateKey={clampedSelectedDate}
                    targetLine={
                      selectedUser?.targetAssigned && effectiveWorkDays > 0
                        ? Number(selectedUser.targetAssigned) / effectiveWorkDays
                        : undefined
                    }
                    averageLine={selectedAvgDailyOmzet > 0 ? selectedAvgDailyOmzet : undefined}
                    onDateClick={(dk) => setSelectedDateKey(dk)}
                  />
                </div>
              </GlassCard>

              {/* Selected-date employee callout */}
              {selectedDateRow ? (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">
                      {selectedUser?.name} — {clampedSelectedDate}
                    </p>
                    <InfoTooltip
                      side="bottom"
                      width="w-72"
                      content={
                        <span>
                          Detail laporan karyawan terpilih pada tanggal yang dipilih.
                          <br /><br />
                          <strong>ATV</strong> (Average Transaction Value) = Omzet ÷ Nota. Nilai rata-rata per transaksi — semakin tinggi berarti karyawan berhasil menjual lebih banyak per pelanggan.
                          <br /><br />
                          <strong>ATU</strong> (Average Transaction Unit) = Produk ÷ Nota. Rata-rata jumlah produk per transaksi — indikator cross-selling.
                        </span>
                      }
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-indigo-300">Omzet</p>
                      <p className="text-sm font-black text-indigo-900">{formatIDR(sdOmzet)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-indigo-300">Nota</p>
                      <p className="text-sm font-black text-indigo-900">{formatNumber(sdTx)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-indigo-300">Produk</p>
                      <p className="text-sm font-black text-indigo-900">{formatNumber(sdItems)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-indigo-300">ATV</p>
                      <p className="text-sm font-black text-indigo-900">{formatIDR(sdAtv)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-indigo-300">ATU</p>
                      <p className="text-sm font-black text-indigo-900">{sdAtu.toFixed(2)}</p>
                    </div>
                  </div>
                  {sdRej > 0 && (
                    <p className="mt-2 text-[10px] font-semibold text-rose-600">
                      {sdRej} pelanggan tertolak · est. {formatIDR(sdAtv * sdRej)} omzet hilang
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-100 bg-slate-50/50 px-4 py-3">
                  <p className="text-[10px] font-medium text-slate-400">
                    Tidak ada data untuk{" "}
                    <span className="font-black text-slate-600">{selectedUser?.name}</span> pada {clampedSelectedDate}.
                  </p>
                </div>
              )}

              {/* Daily detail table */}
              <GlassCard className="p-4 md:p-5 bg-white border border-slate-100 shadow-sm">
                <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">MTD Harian per Karyawan</p>
                      <InfoTooltip
                        side="right"
                        width="w-72"
                        content={
                          <span>
                            Daftar laporan harian karyawan terpilih yang sudah disetujui, dari awal bulan s/d hari ini.
                            <br /><br />
                            <strong>Baris disorot ungu</strong> = tanggal yang dipilih di filter atas.
                            <br /><br />
                            <strong>Badge Outlier</strong> muncul jika: ≥ 3 pelanggan ditolak, atau omzet hari itu &lt; 40% dari rata-rata harian karyawan bulan ini. Hover badge untuk lihat detail.
                            <br /><br />
                            <strong>Perkiraan Omzet Tertolak</strong> = ATV hari itu × jumlah pelanggan yang gagal dilayani.
                          </span>
                        }
                      />
                    </div>
                    <p className="text-sm font-black text-slate-800">{selectedUser?.name || "—"}</p>
                  </div>
                  <p className="text-[11px] font-semibold text-slate-500">
                    {isCurrentMonth ? `MTD s/d ${mtdThroughDateKey}` : `Bulan Penuh ${String(month).padStart(2, "0")}/${year}`}
                  </p>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="min-w-[920px] w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-200">
                        <th className="sticky left-0 z-[1] bg-slate-50/95 px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 shadow-[2px_0_8px_-2px_rgba(0,0,0,0.08)]">
                          Tanggal
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Total Nota
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Total Produk
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Total Omzet
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            ATV
                            <InfoTooltip
                              side="top"
                              width="w-56"
                              content="Average Transaction Value = Omzet ÷ Nota. Nilai rata-rata setiap transaksi dalam rupiah."
                            />
                          </span>
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            ATU
                            <InfoTooltip
                              side="top"
                              width="w-56"
                              content="Average Transaction Unit = Produk ÷ Nota. Rata-rata jumlah produk per transaksi. Indikator cross-selling."
                            />
                          </span>
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Pelanggan Tertolak
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Perkiraan Omzet Tertolak
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyDetailRowsForSelected.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-3 py-8 text-center text-xs font-semibold text-slate-500">
                            Belum ada submission disetujui untuk karyawan ini pada jendela tanggal ini.
                          </td>
                        </tr>
                      ) : (
                        dailyDetailRowsForSelected.map((row: any) => {
                          const dateKey = String(row.achievement_date ?? "").slice(0, 10);
                          const tx = Number(row.transactions ?? 0);
                          const omzet = Number(row.omzet ?? 0);
                          const items = Number(row.items ?? 0);
                          const rej = Number(row.rejected_customer_total ?? 0);
                          const atvRow = tx > 0 ? omzet / tx : 0;
                          const atuRow = tx > 0 ? items / tx : 0;
                          const rejOmzet = atvRow * rej;
                          const isOutlier = rej >= 3 || (selectedAvgDailyOmzet > 0 && omzet < selectedAvgDailyOmzet * 0.4);
                          const isSelectedDate = dateKey === clampedSelectedDate;
                          return (
                            <tr
                              key={String(row.id ?? dateKey)}
                              className={cn(
                                "border-b border-slate-100 transition-colors",
                                isSelectedDate
                                  ? "bg-indigo-50/60"
                                  : isOutlier
                                    ? "bg-rose-50/40"
                                    : "hover:bg-slate-50/40",
                              )}
                            >
                              <td className={cn(
                                "sticky left-0 z-[1] px-3 py-2 text-[11px] shadow-[2px_0_8px_-2px_rgba(0,0,0,0.06)]",
                                isSelectedDate
                                  ? "bg-indigo-50/95 font-black text-indigo-800"
                                  : isOutlier
                                    ? "bg-rose-50/95 font-semibold text-slate-800"
                                    : "bg-white font-semibold text-slate-800",
                              )}>
                                {new Date(`${dateKey}T12:00:00`).toLocaleDateString("id-ID", {
                                  weekday: "short",
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}
                                {isOutlier ? (
                                  <span
                                    title={`Outlier: ≥3 pelanggan tertolak, atau omzet (${formatIDR(omzet)}) < 40% rata-rata harian (${formatIDR(selectedAvgDailyOmzet)})`}
                                    className="ml-2 cursor-help rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-rose-700"
                                  >
                                    Outlier
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatNumber(tx)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatNumber(items)}</td>
                              <td className={cn("px-3 py-2 text-right", isSelectedDate ? "font-black text-indigo-900" : "font-semibold text-slate-800")}>{formatIDR(omzet)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatIDR(atvRow)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-700">{atuRow.toFixed(2)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-rose-700">{formatNumber(rej)}</td>
                              <td className="px-3 py-2 text-right font-black text-rose-700">{formatIDR(rejOmzet)}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {dailyDetailRowsForSelected.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 bg-slate-50/90">
                          <td className="sticky left-0 z-[1] bg-slate-50/95 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 shadow-[2px_0_8px_-2px_rgba(0,0,0,0.06)]">
                            Total MTD
                          </td>
                          <td className="px-3 py-2.5 text-right text-[11px] font-black text-slate-800">{formatNumber(dailyTotals.tx)}</td>
                          <td className="px-3 py-2.5 text-right text-[11px] font-black text-slate-800">{formatNumber(dailyTotals.items)}</td>
                          <td className="px-3 py-2.5 text-right text-[11px] font-black text-slate-900">{formatIDR(dailyTotals.omzet)}</td>
                          <td className="px-3 py-2.5 text-right text-[11px] font-black text-slate-700">{formatIDR(dailyFooterAtv)}</td>
                          <td className="px-3 py-2.5 text-right text-[11px] font-black text-slate-700">{dailyFooterAtu.toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right text-[11px] font-black text-rose-700">{formatNumber(dailyTotals.rej)}</td>
                          <td className="px-3 py-2.5 text-right text-[11px] font-black text-rose-700">{formatIDR(dailyTotals.rejOmzet)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* ─ BULANAN ─────────────────────────────── */}
          {activeTab === 'bulanan' && (
            <motion.div key="bulanan" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              {/* MTD hero card — Cabang level */}
              <GlassCard className="border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Omzet Bulanan Cabang
                      <InfoTooltip
                        side="bottom"
                        width="w-72"
                        content={
                          <div className="space-y-1.5">
                            <p className="font-black text-slate-700">Omzet Bulanan Cabang</p>
                            <p>Total omzet seluruh karyawan cabang ini dalam satu periode bulan.</p>
                            {isCurrentMonth
                              ? <p><span className="font-semibold text-indigo-600">Mode MTD</span> — data real-time s/d {mtdThroughDateKey}. Belum final.</p>
                              : <p><span className="font-semibold text-slate-600">Bulan Penuh</span> — data final bulan lampau.</p>}
                            <p>Target dari KPI yang aktif di periode ini. Capaian = Omzet ÷ Target × 100%.</p>
                          </div>
                        }
                      />
                    </p>
                    <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                      {String(month).padStart(2, "0")}/{year} · {isCurrentMonth ? `MTD s/d ${mtdThroughDateKey}` : "Bulan Penuh"}
                    </p>
                  </div>
                  <span className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest",
                    achievementPercent >= 100
                      ? "bg-emerald-50 text-emerald-700"
                      : achievementPercent >= 75
                        ? "bg-amber-50 text-amber-700"
                        : "bg-rose-50 text-rose-700",
                  )}>
                    {achievementPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr]">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total Omzet</p>
                        <p className="mt-1 text-base font-black tracking-tight text-slate-900">{formatIDR(accumulatedOmzet)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Target</p>
                        <p className="mt-1 text-base font-black tracking-tight text-slate-700">{formatIDR(targetOmzet)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Capaian</p>
                        <p className={cn(
                          "mt-1 text-base font-black tracking-tight",
                          achievementPercent >= 100 ? "text-emerald-600" : achievementPercent >= 75 ? "text-amber-600" : "text-rose-600",
                        )}>
                          {achievementPercent.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 h-2 w-full rounded-full bg-slate-200">
                      <div
                        className={cn(
                          "h-2 rounded-full transition-all",
                          achievementPercent >= 100 ? "bg-emerald-500" : achievementPercent >= 75 ? "bg-amber-400" : "bg-rose-400",
                        )}
                        style={{ width: `${Math.max(0, Math.min(100, achievementPercent))}%` }}
                      />
                    </div>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                    <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-amber-600">
                      {isCurrentMonth && mtdThroughDateKey < monthEndKey
                        ? "Proyeksi Akhir Bulan"
                        : isCurrentMonth
                          ? "Perkiraan Akhir Bulan"
                          : "Realisasi Bulan Penuh"}
                      <InfoTooltip
                        side="bottom"
                        width="w-72"
                        content={
                          <div className="space-y-1.5">
                            <p className="font-black text-slate-700">
                              {isCurrentMonth ? "Proyeksi Akhir Bulan" : "Realisasi Bulan Penuh"}
                            </p>
                            {isCurrentMonth ? (
                              <>
                                <p>Estimasi omzet jika rata-rata harian MTD dipertahankan hingga akhir bulan.</p>
                                <p className="font-mono text-[10px] bg-slate-50 rounded p-1.5 text-slate-600">
                                  Avg harian MTD × total hari bulan ini
                                </p>
                                <p>Semakin sedikit hari tersisa, proyeksi semakin akurat.</p>
                              </>
                            ) : (
                              <p>Bulan sudah selesai — angka ini adalah realisasi omzet aktual bulan penuh.</p>
                            )}
                          </div>
                        }
                      />
                    </p>
                    <p className="mt-1 text-lg font-black tracking-tight text-amber-900">{formatIDR(projectedMonthEndOmzet)}</p>
                    <p className="mt-1.5 text-[10px] font-medium leading-relaxed text-amber-700">
                      {isCurrentMonth ? (
                        <>
                          Avg harian: <span className="font-black text-amber-900">{formatIDR(avgDailyMtdOmzet)}</span>
                          {" "}(hari ke-{mtdDaysElapsedInclusive}/{totalDaysInMonth})
                          {targetOmzet > 0 && (
                            <> · proj. <span className="font-black">{projectedVsTargetPercent.toFixed(1)}%</span> dari target</>
                          )}
                        </>
                      ) : (
                        <>Bulan lampau — angka final.</>
                      )}
                    </p>
                  </div>
                </div>
              </GlassCard>

              {/* Metrics flow */}
              <GlassCard className="border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                    <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Basis Transaksi (MTD)
                      <InfoTooltip
                        side="right"
                        width="w-72"
                        content={
                          <div className="space-y-1.5">
                            <p className="font-black text-slate-700">Basis Transaksi</p>
                            <p>Ringkasan nota, produk, ATV, dan ATU cabang dalam periode MTD ini.</p>
                            <p><span className="font-semibold">Total Nota</span> = jumlah transaksi (invoice) yang berhasil dibuat.</p>
                            <p><span className="font-semibold">Total Produk Terjual</span> = total item/SKU yang tercatat di semua nota.</p>
                          </div>
                        }
                      />
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="flex items-start justify-between border-b border-slate-200 pb-2">
                        <span className="text-xs font-semibold text-slate-600">Total Nota</span>
                        <span className="text-base font-black text-slate-900">{formatNumber(totalTransactions)}</span>
                      </div>
                      <div className="flex items-start justify-between border-b border-slate-200 pb-2">
                        <span className="text-xs font-semibold text-slate-600">Total Produk Terjual</span>
                        <span className="text-base font-black text-slate-900">{formatNumber(totalItems)}</span>
                      </div>
                      <div className="flex items-start justify-between">
                        <span className="flex items-center gap-1 text-xs font-semibold text-slate-600">
                          ATV (Omzet / Nota)
                          <InfoTooltip
                            side="top"
                            width="w-64"
                            content={
                              <div className="space-y-1.5">
                                <p className="font-black text-slate-700">ATV — Average Transaction Value</p>
                                <p className="font-mono text-[10px] bg-slate-50 rounded p-1.5">ATV = Total Omzet ÷ Total Nota</p>
                                <p>Rata-rata nilai omzet per satu nota transaksi. Semakin tinggi, semakin baik kualitas penjualan per nota.</p>
                              </div>
                            }
                          />
                        </span>
                        <span className="text-base font-black text-indigo-700">{formatIDR(atv)}</span>
                      </div>
                      <div className="flex items-start justify-between">
                        <span className="flex items-center gap-1 text-xs font-semibold text-slate-600">
                          ATU (Produk / Nota)
                          <InfoTooltip
                            side="top"
                            width="w-64"
                            content={
                              <div className="space-y-1.5">
                                <p className="font-black text-slate-700">ATU — Average Transaction Unit</p>
                                <p className="font-mono text-[10px] bg-slate-50 rounded p-1.5">ATU = Total Produk ÷ Total Nota</p>
                                <p>Rata-rata jumlah item yang dibeli per nota. Indikator keberhasilan cross-selling dan up-selling.</p>
                              </div>
                            }
                          />
                        </span>
                        <span className="text-base font-black text-indigo-700">{atu.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
                    <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-rose-600">
                      Risiko Penolakan (MTD)
                      <InfoTooltip
                        side="right"
                        width="w-72"
                        content={
                          <div className="space-y-1.5">
                            <p className="font-black text-slate-700">Risiko Penolakan</p>
                            <p>Estimasi dampak finansial dari pelanggan yang ditolak/tidak dilayani (bukan retur) selama periode MTD di seluruh cabang.</p>
                            <p><span className="font-semibold">Jumlah Tertolak</span> = total pelanggan yang tercatat ditolak di laporan harian.</p>
                            <p><span className="font-semibold">Perkiraan Omzet Tertolak</span> = Tertolak × ATV cabang (potensi omzet yang hilang).</p>
                            <p className="text-rose-600 font-semibold">Data ini bersifat estimasi — ATV aktual per pelanggan bisa berbeda.</p>
                          </div>
                        }
                      />
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="flex items-start justify-between border-b border-rose-200 pb-2">
                        <span className="text-xs font-semibold text-rose-700">Jumlah Pelanggan Tertolak</span>
                        <span className="text-base font-black text-rose-900">{formatNumber(totalRejected)}</span>
                      </div>
                      <div className="flex items-start justify-between border-b border-rose-200 pb-2">
                        <span className="text-xs font-semibold text-rose-700">Perkiraan Omzet Tertolak</span>
                        <span className="text-base font-black text-rose-700">{formatIDR(totalRejectedOmzet)}</span>
                      </div>
                      <p className="md:col-span-2 text-[11px] font-semibold text-rose-600">
                        Rumus: <span className="font-black text-rose-800">Pelanggan tertolak × ATV</span>
                      </p>
                    </div>
                  </div>
                </div>
              </GlassCard>

              {/* Leaderboard */}
              <GlassCard className="overflow-hidden border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h3 className="flex items-center gap-1.5 text-sm font-black uppercase tracking-widest text-slate-800">
                      Leaderboard MTD
                      <InfoTooltip
                        side="bottom"
                        width="w-80"
                        content={
                          <div className="space-y-1.5">
                            <p className="font-black text-slate-700">Leaderboard MTD</p>
                            <p>Peringkat karyawan berdasarkan metrik penjualan dalam periode bulan berjalan (MTD).</p>
                            <p><span className="font-semibold">Sort by</span> menentukan urutan ranking — pilih antara Penjualan, SARP, ATV, atau ATU.</p>
                            <p>Grafik di atas tabel menampilkan tren metrik terpilih per hari untuk setiap karyawan. Klik nama di legend untuk sembunyikan/tampilkan garis.</p>
                            <p className="text-indigo-600 font-semibold">SARP dihitung dari pool ATV/ATU seluruh tim hari itu (bukan rata-rata individual).</p>
                          </div>
                        }
                      />
                    </h3>
                    <p className="mt-0.5 text-[11px] font-medium leading-snug text-slate-500">
                      {monthStartKey} s/d {mtdThroughDateKey}
                    </p>
                  </div>
                  <label className="flex w-full flex-col gap-1.5 text-xs font-bold text-slate-600 md:w-auto md:min-w-[12rem]">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sort by</span>
                    <select
                      value={leaderboardSortBy}
                      onChange={(e) => setLeaderboardSortBy(e.target.value as "sales" | "atv" | "atu" | "sarp")}
                      className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 shadow-inner focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 md:w-full"
                    >
                      <option value="sales">Peringkat Penjualan</option>
                      <option value="sarp">Peringkat SARP</option>
                      <option value="atv">Peringkat ATV</option>
                      <option value="atu">Peringkat ATU</option>
                    </select>
                  </label>
                </div>

                {/* Multi-line chart — naik-turun metrik per karyawan per hari */}
                {leaderboardChartSeries.length > 0 && (
                  <div className="mb-5 rounded-xl border border-slate-100 bg-slate-50/40 p-3 md:p-4">
                    <MultiLineChart
                      series={leaderboardChartSeries}
                      formatValue={leaderboardChartFormat}
                      formatAxisValue={leaderboardChartFormat}
                      metricLabel={leaderboardChartLabel}
                      highlightDateKey={clampedSelectedDate}
                    />
                  </div>
                )}

                <div className="relative overflow-hidden rounded-xl border border-slate-100">
                  <div className="max-h-[min(65vh,560px)] overflow-auto overscroll-contain">
                    <table className="min-w-[980px] w-full border-collapse text-sm">
                      <thead>
                        <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 shadow-sm">
                          <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Rank</th>
                          <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Nama Karyawan</th>
                          <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Total Nota</th>
                          <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Total Produk</th>
                          <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Total Omzet</th>
                          <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">ATV</th>
                          <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">ATU</th>
                          <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-indigo-500">
                            <span className="flex items-center justify-end gap-1">
                              SARP
                              <InfoTooltip
                                side="left"
                                width="w-80"
                                content={
                                  <div className="space-y-1.5">
                                    <p className="font-black text-slate-700">SARP — Sales Achievement Ratio Percentage</p>
                                    <p className="font-mono text-[10px] bg-slate-50 rounded p-1.5">SARP = (ATV% + ATU%) ÷ 2</p>
                                    <p><span className="font-semibold">ATV%</span> = ATV karyawan ÷ ATV pool tim × 100</p>
                                    <p><span className="font-semibold">ATU%</span> = ATU karyawan ÷ ATU pool tim × 100</p>
                                    <p><span className="font-semibold">Pool tim</span> = Total omzet tim ÷ total nota tim (bukan rata-rata individual).</p>
                                    <p className="text-indigo-600 font-semibold">≥100% = di atas rata-rata tim · ≥80% = cukup · &lt;80% = perlu perhatian</p>
                                  </div>
                                }
                              />
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {[...userStats]
                          .sort((a: any, b: any) => {
                            if (leaderboardSortBy === "atv")  return Number(b.atv)     - Number(a.atv);
                            if (leaderboardSortBy === "atu")  return Number(b.atu)     - Number(a.atu);
                            if (leaderboardSortBy === "sarp") return Number(b.sarpPct) - Number(a.sarpPct);
                            return Number(b.omzet) - Number(a.omzet);
                          })
                          .map((u: any, idx: number) => (
                            <tr key={u.id} className="transition-colors hover:bg-indigo-50/40">
                              <td className="px-4 py-2.5 font-black tabular-nums text-slate-600">{idx + 1}</td>
                              <td className="px-4 py-2.5 font-semibold text-slate-800">{u.name}</td>
                              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-700">
                                {formatNumber(u.transactions)}
                              </td>
                              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-700">{formatNumber(u.items)}</td>
                              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">{formatIDR(u.omzet)}</td>
                              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-700">{formatIDR(u.atv)}</td>
                              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-700">{u.atu.toFixed(2)}</td>
                              <td className={cn(
                                "px-4 py-2.5 text-right font-black tabular-nums",
                                Number(u.sarpPct) >= 100 ? "text-emerald-600" :
                                Number(u.sarpPct) >= 80  ? "text-amber-600" : "text-rose-600"
                              )}>
                                {Number(u.sarpPct).toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        {userStats.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-xs font-semibold text-slate-400">
                              Belum ada data karyawan untuk periode ini.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </GlassCard>

              {/* [owner only] ringkasan per karyawan table */}
              {portalMode === "owner" ? (
              <GlassCard className="border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-black uppercase tracking-widest text-slate-800">Ringkasan per karyawan</p>
                    <p className="mt-1 text-[11px] font-medium text-slate-500">
                      {"Kolom KPI mengikuti skema yang aktif untuk cabang & periode ini."}
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-100 custom-scrollbar">
                  <table
                    className={`w-full border-collapse text-sm ${kpiV2ForTable && kpiV2EnabledSchemes.length > 0 ? "min-w-[720px]" : "min-w-[560px]"}`}
                  >
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/90">
                        <th
                          rowSpan={kpiV2ForTable && kpiV2EnabledSchemes.length > 0 ? 2 : 1}
                          className="sticky left-0 z-[1] border-r border-slate-100 bg-slate-50 px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.08)]"
                        >
                          Nama
                        </th>
                        {showPayrollRoleCol ? (
                          <th
                            rowSpan={kpiV2ForTable && kpiV2EnabledSchemes.length > 0 ? 2 : 1}
                            className="border-r border-slate-100 bg-slate-50 px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500"
                          >
                            Peran
                          </th>
                        ) : null}
                        <th
                          rowSpan={kpiV2ForTable && kpiV2EnabledSchemes.length > 0 ? 2 : 1}
                          className="border-r border-slate-100 bg-slate-50 px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-slate-500"
                        >
                          Omzet
                        </th>
                        <th
                          rowSpan={kpiV2ForTable && kpiV2EnabledSchemes.length > 0 ? 2 : 1}
                          className="border-r border-slate-100 bg-slate-50 px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-slate-500"
                        >
                          Nota
                        </th>
                        {kpiV2ForTable && kpiV2EnabledSchemes.length > 0 ? (
                          <>
                            {kpiV2EnabledSchemes.map((scheme) => (
                              <th
                                key={scheme}
                                colSpan={3}
                                className="border-l border-slate-200 bg-indigo-50/60 px-2 py-2 text-center text-[10px] font-black uppercase tracking-widest text-indigo-800"
                              >
                                {KPI_V2_SCHEME_TABLE_LABELS[scheme]}
                              </th>
                            ))}
                            <th
                              rowSpan={2}
                              className="border-l border-slate-200 bg-slate-50 px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-slate-600"
                            >
                              Σ Bonus KPI
                            </th>
                          </>
                        ) : (
                          <>
                            <th className="border-l border-slate-200 bg-slate-50 px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                              % KPI
                            </th>
                            <th className="px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                              Target
                            </th>
                            <th className="px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                              Bonus KPI
                            </th>
                          </>
                        )}
                      </tr>
                      {kpiV2ForTable && kpiV2EnabledSchemes.length > 0 ? (
                        <tr className="border-b border-slate-200 bg-slate-50/70">
                          {kpiV2EnabledSchemes.flatMap((scheme) => [
                            <th
                              key={`${scheme}-pct`}
                              className="border-l border-slate-200 px-2 py-1.5 text-right text-[9px] font-bold uppercase tracking-wide text-slate-500"
                            >
                              %
                            </th>,
                            <th
                              key={`${scheme}-tgt`}
                              className="px-2 py-1.5 text-right text-[9px] font-bold uppercase tracking-wide text-slate-500"
                            >
                              Target
                            </th>,
                            <th
                              key={`${scheme}-bon`}
                              className="px-2 py-1.5 text-right text-[9px] font-bold uppercase tracking-wide text-slate-500"
                            >
                              Bonus
                            </th>,
                          ])}
                        </tr>
                      ) : null}
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {userStatsSortedByName.map((u: any) => (
                        <tr key={u.id} className="transition-colors hover:bg-indigo-50/30">
                          <td className="sticky left-0 z-[1] border-r border-slate-100 bg-white px-3 py-2 font-semibold text-slate-800 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.06)]">
                            {u.name}
                          </td>
                          {showPayrollRoleCol ? (
                            <td className="border-r border-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
                              {payrollRoleLabel(u) || "—"}
                            </td>
                          ) : null}
                          <td className="border-r border-slate-100 px-3 py-2 text-right font-semibold tabular-nums text-slate-800">
                            {formatIDR(u.omzet)}
                          </td>
                          <td className="border-r border-slate-100 px-3 py-2 text-right font-semibold tabular-nums text-slate-700">
                            {formatNumber(u.transactions)}
                          </td>
                          {kpiV2ForTable && kpiV2EnabledSchemes.length > 0 ? (
                            <>
                              {kpiV2EnabledSchemes.flatMap((scheme) => {
                                const bd = u.v2BonusRow?.breakdown?.[scheme];
                                const pct = bd != null ? `${bd.achievement_percent.toFixed(1)}%` : "—";
                                const tgt = bd != null ? formatIDR(bd.target) : "—";
                                const bon = bd != null ? formatIDR(bd.bonus_earned) : "—";
                                const title = bd?.notes ? String(bd.notes) : undefined;
                                return [
                                  <td
                                    key={`${u.id}-${scheme}-pct`}
                                    title={title}
                                    className="border-l border-slate-100 px-2 py-2 text-right text-xs font-semibold tabular-nums text-indigo-800"
                                  >
                                    {pct}
                                  </td>,
                                  <td
                                    key={`${u.id}-${scheme}-tgt`}
                                    className="px-2 py-2 text-right text-xs font-semibold tabular-nums text-slate-700"
                                  >
                                    {tgt}
                                  </td>,
                                  <td
                                    key={`${u.id}-${scheme}-bon`}
                                    className="px-2 py-2 text-right text-xs font-black tabular-nums text-emerald-700"
                                  >
                                    {bon}
                                  </td>,
                                ];
                              })}
                              <td className="border-l border-slate-200 bg-slate-50/40 px-3 py-2 text-right text-xs font-black tabular-nums text-slate-900">
                                {formatIDR(u.kpiBonus)}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="border-l border-slate-200 px-3 py-2 text-right text-xs font-black tabular-nums text-indigo-800">
                                {(u.kpiAchievement || 0).toFixed(1)}%
                              </td>
                              <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-slate-700">
                                {formatIDR(u.targetAssigned)}
                              </td>
                              <td className="px-3 py-2 text-right text-xs font-black tabular-nums text-emerald-700">
                                {formatIDR(u.kpiBonus)}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
              ) : null}
            </motion.div>
          )}

          {/* ─ PER KARYAWAN ─────────────────────────── */}
          {activeTab === 'per-karyawan' && (
            <motion.div key="per-karyawan" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              {/* User selector */}
              <GlassCard className="border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-1.5 text-sm font-black uppercase tracking-widest text-slate-800">
                      Data per karyawan (MTD, pratinjau THP &amp; rapor)
                      <InfoTooltip
                        side="bottom"
                        width="w-80"
                        content={
                          <div className="space-y-1.5">
                            <p className="font-black text-slate-700">Karyawan &amp; Penilaian</p>
                            <p>Tampilkan data performa, operasional, dan penilaian auditor untuk satu karyawan dalam satu periode bulan.</p>
                            <p>Pilih nama karyawan dari dropdown untuk beralih antar karyawan — grafik dan semua angka langsung menyesuaikan.</p>
                            <p className="text-amber-600 font-semibold">Angka THP bersifat simulasi — belum tentu sama dengan rapor final yang sudah dipublish.</p>
                          </div>
                        }
                      />
                    </h3>
                    <p className="mt-1 text-[11px] font-medium leading-snug text-slate-500">
                      Periode otomatis: {isCurrentMonth ? `MTD s/d ${mtdThroughDateKey}` : `Bulan Penuh ${String(month).padStart(2, "0")}/${year}`}
                    </p>
                  </div>
                  <div className="flex w-full flex-col gap-1.5 md:w-auto md:min-w-[260px]">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Filter Nama Karyawan</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={!prevUser || absensiSaving || internalSaving || customerSaving}
                        onClick={() => prevUser && setSelectedUserId(String(prevUser.id))}
                        title={prevUser ? `Sebelumnya: ${prevUser.name}` : "Sudah di awal"}
                        className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-white hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <select
                        value={selectedUserId}
                        onChange={(e) => setSelectedUserId(e.target.value)}
                        disabled={absensiSaving || internalSaving || customerSaving}
                        className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 shadow-inner focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {userStatsSortedByName.map((u: any) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!nextUser || absensiSaving || internalSaving || customerSaving}
                        onClick={() => nextUser && setSelectedUserId(String(nextUser.id))}
                        title={nextUser ? `Berikutnya: ${nextUser.name}` : "Sudah di akhir"}
                        className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-white hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                    <p className="text-[9px] font-semibold text-slate-400">
                      {currentUserIdx + 1} / {userStatsSortedByName.length} karyawan
                    </p>
                  </div>
                </div>
              </GlassCard>

              {/* Grafik omzet harian karyawan terpilih */}
              <GlassCard className="border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                  <div className="mb-1 flex flex-wrap items-start justify-between gap-1">
                    <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Grafik Omzet Harian — {selectedUser?.name || "—"}
                      <InfoTooltip
                        side="bottom"
                        width="w-72"
                        content={
                          <div className="space-y-1.5">
                            <p className="font-black text-slate-700">Grafik Omzet Harian</p>
                            <p><span className="font-semibold">Batang</span> = omzet karyawan per hari. Batang abu-abu kecil = hari tanpa laporan.</p>
                            <p><span className="font-semibold">Garis trend</span> = menghubungkan puncak batang untuk melihat naik-turun omzet.</p>
                            <p><span className="font-semibold text-amber-600">Garis oranye (Target)</span> = target omzet harian individu (target bulanan ÷ hari kerja).</p>
                            <p><span className="font-semibold text-indigo-600">Garis ungu (Avg)</span> = rata-rata omzet harian karyawan ini bulan berjalan.</p>
                          </div>
                        }
                      />
                    </p>
                    <p className="text-[10px] font-semibold text-slate-400">
                      {monthStartKey} s/d {mtdThroughDateKey}
                    </p>
                  </div>
                  {selectedOmzetLinePoints.length > 0 ? (
                    <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/40 p-3 md:p-4">
                      <CustomLineChart
                        points={selectedOmzetLinePoints}
                        targetLine={
                          selectedUser?.targetAssigned && effectiveWorkDays > 0
                            ? Number(selectedUser.targetAssigned) / effectiveWorkDays
                            : undefined
                        }
                        averageLine={selectedAvgDailyOmzet > 0 ? selectedAvgDailyOmzet : undefined}
                      />
                    </div>
                  ) : (
                    <div className="mt-3 flex min-h-[80px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-[12px] font-medium text-slate-400">
                      Belum ada data omzet harian untuk karyawan ini pada periode ini.
                    </div>
                  )}
                </GlassCard>

              {/* Performance card + operasional */}
              <div className="space-y-4">
                {portalMode === "audit" ? (
                  <>
                      <EmployeeUnifiedPerformanceCard
                        employeeName={selectedUser?.name || "—"}
                        employeeOmzet={Number(selectedUser?.omzet || 0)}
                        targetAssigned={Number(selectedUser?.targetAssigned || 0)}
                        achievementPercent={Number(selectedUser?.kpiAchievement || 0)}
                        branchMtdOmzet={accumulatedOmzet}
                        contributionPct={selectedContributionPct}
                        periodLabel={kpiPeriodLabel}
                        formatIDR={formatIDR}
                      />

                      <GlassCard className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                        <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3">
                          <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Operasional &amp; risiko
                            <InfoTooltip
                              side="right"
                              width="w-72"
                              content={
                                <div className="space-y-1.5">
                                  <p className="font-black text-slate-700">Operasional & Risiko</p>
                                  <p>Metrik kualitas penjualan karyawan ini dalam periode MTD — nota, produk, ATV, ATU, SARP, dan estimasi risiko penolakan.</p>
                                  <p>Semua angka dihitung dari data submission yang sudah disetujui dalam rentang periode yang aktif.</p>
                                </div>
                              }
                            />
                          </p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 lg:grid-cols-4">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Nota</p>
                            <p className="text-xl font-black text-slate-900">{formatNumber(selectedUser?.transactions || 0)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Produk</p>
                            <p className="text-xl font-black text-slate-900">{formatNumber(selectedUser?.items || 0)}</p>
                          </div>
                          <div>
                            <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                              ATV
                              <InfoTooltip
                                side="top"
                                width="w-64"
                                content={
                                  <div className="space-y-1.5">
                                    <p className="font-black text-slate-700">ATV — Average Transaction Value</p>
                                    <p className="font-mono text-[10px] bg-slate-50 rounded p-1.5">ATV = Omzet ÷ Total Nota</p>
                                    <p>Rata-rata nilai omzet per nota. Semakin tinggi, semakin besar nilai belanja per transaksi.</p>
                                  </div>
                                }
                              />
                            </p>
                            <p className="text-xl font-black text-slate-900">{formatIDR(selectedUser?.atv || 0)}</p>
                          </div>
                          <div>
                            <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                              ATU
                              <InfoTooltip
                                side="top"
                                width="w-64"
                                content={
                                  <div className="space-y-1.5">
                                    <p className="font-black text-slate-700">ATU — Average Transaction Unit</p>
                                    <p className="font-mono text-[10px] bg-slate-50 rounded p-1.5">ATU = Total Produk ÷ Total Nota</p>
                                    <p>Rata-rata item yang dibeli per nota. Indikator keberhasilan cross-selling.</p>
                                  </div>
                                }
                              />
                            </p>
                            <p className="text-xl font-black text-slate-900">{Number(selectedUser?.atu || 0).toFixed(2)}</p>
                          </div>
                        </div>
                        <div className="border-t border-slate-100 px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                SARP
                                <InfoTooltip
                                  side="top"
                                  width="w-80"
                                  content={
                                    <div className="space-y-1.5">
                                      <p className="font-black text-slate-700">SARP — Sales Achievement Ratio Percentage</p>
                                      <p className="font-mono text-[10px] bg-slate-50 rounded p-1.5">SARP = (ATV% + ATU%) ÷ 2</p>
                                      <p><span className="font-semibold">ATV%</span> = ATV karyawan ÷ ATV pool tim × 100</p>
                                      <p><span className="font-semibold">ATU%</span> = ATU karyawan ÷ ATU pool tim × 100</p>
                                      <p className="text-indigo-600 font-semibold">≥100% di atas rata-rata tim · ≥80% cukup · &lt;80% perlu perhatian</p>
                                    </div>
                                  }
                                />
                              </p>
                              <p className="text-[10px] font-medium text-slate-400 mt-0.5">Sales Achievement Ratio Percentage</p>
                            </div>
                            <div className="text-right">
                              <p className={cn(
                                "text-2xl font-black tabular-nums",
                                Number(selectedUser?.sarpPct || 0) >= 100 ? "text-emerald-600" :
                                Number(selectedUser?.sarpPct || 0) >= 80  ? "text-amber-600" : "text-rose-600"
                              )}>
                                {Number(selectedUser?.sarpPct || 0).toFixed(1)}%
                              </p>
                              <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                                ATV {Number(selectedUser?.atvPct || 0).toFixed(1)}% · ATU {Number(selectedUser?.atuPct || 0).toFixed(1)}%
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3 border-t border-slate-100 bg-rose-50/30 px-4 py-3 md:grid-cols-2">
                          <div>
                            <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                              Pelanggan Tertolak
                              <InfoTooltip
                                side="right"
                                width="w-72"
                                content={
                                  <div className="space-y-1.5">
                                    <p className="font-black text-slate-700">Pelanggan Tertolak</p>
                                    <p>Jumlah pelanggan yang tercatat ditolak/tidak dilayani oleh karyawan ini dalam periode MTD (data per submission harian).</p>
                                    <p><span className="font-semibold">Perkiraan Omzet Tertolak</span> = jumlah tertolak × ATV harian karyawan ini (estimasi potensi omzet yang hilang).</p>
                                    <p className="text-rose-600 font-semibold">Angka ini estimasi — ATV aktual per pelanggan bisa berbeda.</p>
                                  </div>
                                }
                              />
                            </p>
                            <p className="text-xl font-black text-rose-700">{formatNumber(raportUserRejectedCount)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Perkiraan Omzet Tertolak</p>
                            <p className="text-xl font-black text-rose-700">
                              {formatIDR(raportUserRejectedOmzetEst)}
                            </p>
                          </div>
                        </div>
                      </GlassCard>

                      {kpiV2ForTable ? (
                        <EmployeeKpiBonusSection
                          config={kpiV2ForTable}
                          v2BonusRow={selectedUser?.v2BonusRow ?? null}
                          userId={String(selectedUser?.id ?? "")}
                          totalKpiBonus={Number(selectedUser?.kpiBonus || 0)}
                          crewRows={scopedCrewRowsForBonus}
                          dailyRows={scopedDailyRowsForBonus}
                          formatIDR={formatIDR}
                        />
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3 text-[11px] font-medium text-slate-400">
                          Konfigurasi KPI V2 belum diatur untuk cabang ini — bonus KPI tidak dapat dihitung.
                        </div>
                      )}
                    </>
                  ) : (
                    <GlassCard className="overflow-hidden border border-slate-100 bg-white shadow-sm">
                      <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/50 px-5 py-4 md:flex-row md:items-center md:justify-between">
                        <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Performa Utama (KPI + Operasional)
                          <InfoTooltip side="bottom" width="w-80" content={
                            <div className="space-y-1.5">
                              <p className="font-black text-slate-700">Performa Utama — KPI V1</p>
                              <p>Ringkasan capaian KPI berbasis omzet vs target dan metrik operasional karyawan ini untuk periode yang dipilih.</p>
                              <p className="text-slate-500">Blok ini menggunakan konfigurasi KPI <strong>V1</strong>. Jika cabang beralih ke KPI V2 (skema tim/individu), blok ini digantikan tampilan V2 secara otomatis.</p>
                            </div>
                          } />
                        </p>
                        <div className="flex items-center gap-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            {isCurrentMonth ? `Mode MTD` : `Mode Bulan Penuh`}
                          </p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700">
                            Bonus Performa Utama: {formatIDR(selectedUser?.kpiBonus || 0)}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-4 p-4">
                        <div className="rounded-xl border border-slate-100">
                          <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-2">
                            <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                              Blok KPI Utama
                              <InfoTooltip side="right" width="w-72" content={
                                <div className="space-y-1.5">
                                  <p className="font-black text-slate-700">Blok KPI Utama</p>
                                  <p>Empat angka inti: total omzet, target yang ditetapkan, persentase capaian, dan kontribusi omzet karyawan ini terhadap total omzet cabang.</p>
                                </div>
                              } />
                            </p>
                          </div>
                          <div className="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-2 lg:grid-cols-4">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Omzet</p>
                              <p className="text-xl font-black text-slate-900">{formatIDR(selectedUser?.omzet || 0)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                Target ({isCurrentMonth ? "MTD" : "Penuh"})
                              </p>
                              <p className="text-xl font-black text-slate-900">{formatIDR(selectedUser?.targetAssigned || 0)}</p>
                            </div>
                            <div>
                              <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                % Capaian KPI
                                <InfoTooltip side="top" width="w-72" content={
                                  <div className="space-y-1.5">
                                    <p className="font-black text-slate-700">% Capaian KPI</p>
                                    <p className="font-mono text-[10px] bg-slate-50 rounded p-1.5">Capaian = Omzet ÷ Target × 100%</p>
                                    <p>Persentase pencapaian target omzet karyawan ini. 100% = tepat target.</p>
                                  </div>
                                } />
                              </p>
                              <p className="text-xl font-black text-emerald-700">
                                {(selectedUser?.kpiAchievement || 0).toFixed(1)}%
                              </p>
                            </div>
                            <div>
                              <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                Kontribusi Omzet ({isCurrentMonth ? "MTD" : "Bulan Penuh"})
                                <InfoTooltip side="top" width="w-72" content={
                                  <div className="space-y-1.5">
                                    <p className="font-black text-slate-700">Kontribusi Omzet</p>
                                    <p className="font-mono text-[10px] bg-slate-50 rounded p-1.5">Kontribusi = Omzet karyawan ÷ Omzet cabang (MTD) × 100%</p>
                                    <p>Porsi omzet karyawan ini dari total omzet seluruh tim cabang dalam periode yang sama.</p>
                                  </div>
                                } />
                              </p>
                              <p className="text-xl font-black text-indigo-700">{selectedContributionPct.toFixed(1)}%</p>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-100">
                          <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-2">
                            <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                              Blok Operasional &amp; Risiko
                              <InfoTooltip
                                side="right"
                                width="w-72"
                                content={
                                  <div className="space-y-1.5">
                                    <p className="font-black text-slate-700">Operasional & Risiko</p>
                                    <p>Metrik kualitas penjualan karyawan ini — nota, produk, ATV, ATU, SARP, dan estimasi risiko penolakan dalam periode ini.</p>
                                  </div>
                                }
                              />
                            </p>
                          </div>
                          <div className="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-2 lg:grid-cols-4">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Nota</p>
                              <p className="text-xl font-black text-slate-900">{formatNumber(selectedUser?.transactions || 0)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Produk</p>
                              <p className="text-xl font-black text-slate-900">{formatNumber(selectedUser?.items || 0)}</p>
                            </div>
                            <div>
                              <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                ATV
                                <InfoTooltip side="top" width="w-64" content={
                                  <div className="space-y-1.5">
                                    <p className="font-black text-slate-700">ATV — Average Transaction Value</p>
                                    <p className="font-mono text-[10px] bg-slate-50 rounded p-1.5">ATV = Omzet ÷ Total Nota</p>
                                    <p>Rata-rata nilai omzet per nota transaksi karyawan ini.</p>
                                  </div>
                                } />
                              </p>
                              <p className="text-xl font-black text-slate-900">{formatIDR(selectedUser?.atv || 0)}</p>
                            </div>
                            <div>
                              <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                ATU
                                <InfoTooltip side="top" width="w-64" content={
                                  <div className="space-y-1.5">
                                    <p className="font-black text-slate-700">ATU — Average Transaction Unit</p>
                                    <p className="font-mono text-[10px] bg-slate-50 rounded p-1.5">ATU = Total Produk ÷ Total Nota</p>
                                    <p>Rata-rata item yang dibeli per nota. Indikator cross-selling.</p>
                                  </div>
                                } />
                              </p>
                              <p className="text-xl font-black text-slate-900">{Number(selectedUser?.atu || 0).toFixed(2)}</p>
                            </div>
                          </div>
                          <div className="border-t border-slate-100 px-4 py-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                  SARP
                                  <InfoTooltip
                                    side="top"
                                    width="w-80"
                                    content={
                                      <div className="space-y-1.5">
                                        <p className="font-black text-slate-700">SARP — Sales Achievement Ratio Percentage</p>
                                        <p className="font-mono text-[10px] bg-slate-50 rounded p-1.5">SARP = (ATV% + ATU%) ÷ 2</p>
                                        <p><span className="font-semibold">ATV%</span> = ATV karyawan ÷ ATV pool tim × 100</p>
                                        <p><span className="font-semibold">ATU%</span> = ATU karyawan ÷ ATU pool tim × 100</p>
                                        <p className="text-indigo-600 font-semibold">≥100% di atas rata-rata tim · ≥80% cukup · &lt;80% perlu perhatian</p>
                                      </div>
                                    }
                                  />
                                </p>
                                <p className="text-[10px] font-medium text-slate-400 mt-0.5">Sales Achievement Ratio Percentage</p>
                              </div>
                              <div className="text-right">
                                <p className={cn(
                                  "text-2xl font-black tabular-nums",
                                  Number(selectedUser?.sarpPct || 0) >= 100 ? "text-emerald-600" :
                                  Number(selectedUser?.sarpPct || 0) >= 80  ? "text-amber-600" : "text-rose-600"
                                )}>
                                  {Number(selectedUser?.sarpPct || 0).toFixed(1)}%
                                </p>
                                <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                                  ATV {Number(selectedUser?.atvPct || 0).toFixed(1)}% · ATU {Number(selectedUser?.atuPct || 0).toFixed(1)}%
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-3 border-t border-slate-100 bg-rose-50/30 px-4 py-3 md:grid-cols-2">
                            <div>
                              <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                Pelanggan Tertolak
                                <InfoTooltip
                                  side="right"
                                  width="w-72"
                                  content={
                                    <div className="space-y-1.5">
                                      <p className="font-black text-slate-700">Pelanggan Tertolak</p>
                                      <p>Jumlah pelanggan yang tercatat ditolak oleh karyawan ini dalam periode MTD.</p>
                                      <p><span className="font-semibold">Perkiraan Omzet Tertolak</span> = tertolak × ATV harian karyawan ini (estimasi potensi omzet yang hilang).</p>
                                    </div>
                                  }
                                />
                              </p>
                              <p className="text-xl font-black text-rose-700">{formatNumber(raportUserRejectedCount)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                Perkiraan Omzet Tertolak
                              </p>
                              <p className="text-xl font-black text-rose-700">
                                {formatIDR(raportUserRejectedOmzetEst)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </GlassCard>
                  )}

                  {/* Produk Fokus — hanya tampil jika ada data */}
                  {autoProductBonusRows.length > 0 && (
                    <GlassCard className="p-4 md:p-5 bg-white border border-slate-100 shadow-sm">
                      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Produk Fokus (Auto Bonus)
                          <InfoTooltip
                            side="bottom"
                            width="w-80"
                            content={
                              <div className="space-y-1.5">
                                <p className="font-black text-slate-700">Produk Fokus — Auto Bonus</p>
                                <p>Daftar produk yang dikonfigurasi cabang ini sebagai target penjualan khusus. Bonus dihitung otomatis berdasarkan realisasi penjualan.</p>
                                <p><span className="font-semibold">Flat</span> — bonus dibayar sekali saat target tercapai.</p>
                                <p><span className="font-semibold">Kelipatan</span> — bonus per kelipatan unit melebihi target.</p>
                                <p className="text-emerald-700 font-semibold">Bonus ini sudah termasuk dalam simulasi THP di tab Payroll.</p>
                              </div>
                            }
                          />
                        </p>
                        <p className="text-xs font-black uppercase tracking-widest text-emerald-700">
                          Bonus Produk Fokus: {formatIDR(totalAutoProductBonus)}
                        </p>
                      </div>
                      <div className="overflow-x-auto rounded-xl border border-slate-100">
                        <table className="min-w-[760px] w-full border-collapse text-sm">
                          <thead>
                            <tr className="bg-slate-50/70 border-b border-slate-200">
                              <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Produk Fokus</th>
                              <th className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">Tipe</th>
                              <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Realisasi</th>
                              <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Target</th>
                              <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Pencapaian</th>
                              <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Bonus</th>
                            </tr>
                          </thead>
                          <tbody>
                            {autoProductBonusRows.map((r: any) => (
                              <tr key={r.id} className="border-b border-slate-100">
                                <td className="px-3 py-2 font-semibold text-slate-800">{r.productName}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${r.bonusType === "flat" ? "bg-indigo-50 text-indigo-700" : "bg-sky-50 text-sky-700"}`}>
                                    {r.bonusType === "flat" ? "Flat" : "Kelipatan"}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatNumber(r.sold)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatNumber(r.targetValue)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-indigo-700">{r.progressPct.toFixed(1)}%</td>
                                <td className="px-3 py-2 text-right font-black text-emerald-700">{formatIDR(r.bonusEarned)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </GlassCard>
                  )}

                  {/* Penilaian audit — portal BBA + owner (read-only untuk owner) */}
                  {(portalMode === "audit" || portalMode === "owner") && (
                    <>
                      {/* Divider */}
                      <div className="flex items-center gap-3 pt-2">
                        <div className="h-px flex-1 bg-slate-200" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Penilaian</span>
                        <div className="h-px flex-1 bg-slate-200" />
                      </div>

                      {/* Data Add-on — hanya jika ada add-on aktif */}
                      {anyAddonEnabled && (
                        <GlassCard className="p-4 md:p-5 bg-white border border-slate-100 shadow-sm">
                          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                              Data Add-on
                              <InfoTooltip side="bottom" width="w-72" content={
                                <div className="space-y-1.5">
                                  <p className="font-black text-slate-700">Data Add-on</p>
                                  <p>Ringkasan data pendukung dari add-on yang aktif: kehadiran, ulasan internal, dan ulasan pelanggan.</p>
                                  <p className="text-slate-500">Data ini menjadi bahan pertimbangan auditor dalam memberikan penilaian final di form "Penilaian Final Karyawan".</p>
                                </div>
                              } />
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            {addonAbsensiEnabled && (
                              <div className="flex-1 min-w-[200px] rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-col gap-2">
                                <p className="flex items-center gap-1 text-xs font-black text-slate-700">
                                  Jadwal &amp; Absensi
                                  <InfoTooltip side="top" width="w-64" content={
                                    <div className="space-y-1">
                                      <p className="font-black text-slate-700">Jadwal &amp; Absensi</p>
                                      <p>Ringkasan kehadiran karyawan: hari hadir, keterlambatan, dan izin untuk periode ini.</p>
                                      <p className="text-slate-500">Klik "Lihat Rincian" untuk melihat detail per hari.</p>
                                    </div>
                                  } />
                                </p>
                                <div className="grid grid-cols-3 gap-2 text-[11px] font-semibold text-slate-600">
                                  <div className="rounded-lg bg-white border border-slate-100 px-2 py-1.5">
                                    <span className="block text-[9px] font-black uppercase tracking-wide text-slate-400">Hadir</span>
                                    <span className="text-sm font-black text-slate-800">{absensiSummaryPresent}</span>
                                  </div>
                                  <div className="rounded-lg bg-white border border-slate-100 px-2 py-1.5">
                                    <span className="block text-[9px] font-black uppercase tracking-wide text-amber-500">Telat</span>
                                    <span className="text-sm font-black text-amber-700">{absensiSummaryLate}</span>
                                  </div>
                                  <div className="rounded-lg bg-white border border-slate-100 px-2 py-1.5">
                                    <span className="block text-[9px] font-black uppercase tracking-wide text-indigo-500">Izin (hari)</span>
                                    <span className="text-sm font-black text-indigo-700">{absensiSummaryIzinDays}</span>
                                  </div>
                                </div>
                                {portalMode !== "owner" && (
                                <button type="button" disabled={!selectedUser} onClick={() => setAbsensiAddonModalOpen(true)}
                                  className="mt-1 rounded-xl bg-indigo-600 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
                                  Lihat Rincian
                                </button>
                                )}
                              </div>
                            )}
                            {addonInternalReviewEnabled && (
                              <div className="flex-1 min-w-[200px] rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-col gap-2">
                                <p className="flex items-center gap-1 text-xs font-black text-slate-700">
                                  Ulasan Internal
                                  <InfoTooltip side="top" width="w-64" content={
                                    <div className="space-y-1">
                                      <p className="font-black text-slate-700">Ulasan Internal</p>
                                      <p>Penilaian oleh rekan kerja dalam satu cabang. Menampilkan jumlah masukan dan rata-rata bintang.</p>
                                      <p className="text-slate-500">Klik "Lihat Rincian" untuk melihat setiap ulasan secara anonim.</p>
                                    </div>
                                  } />
                                </p>
                                <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-600">
                                  <div className="rounded-lg bg-white border border-slate-100 px-2 py-1.5">
                                    <span className="block text-[9px] font-black uppercase tracking-wide text-slate-400">Masukan</span>
                                    <span className="text-sm font-black text-slate-800">{internalSummaryMasukanCount}</span>
                                  </div>
                                  <div className="rounded-lg bg-white border border-slate-100 px-2 py-1.5">
                                    <span className="block text-[9px] font-black uppercase tracking-wide text-sky-600">Rata ★</span>
                                    <span className="text-sm font-black text-sky-800">{internalSummaryMasukanCount > 0 ? internalSummaryAvgRating.toFixed(1) : "—"}</span>
                                  </div>
                                </div>
                                {portalMode !== "owner" && (
                                <button type="button" disabled={!selectedUser} onClick={() => setInternalReviewAddonModalOpen(true)}
                                  className="mt-1 rounded-xl bg-sky-600 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">
                                  Lihat Rincian
                                </button>
                                )}
                              </div>
                            )}
                            {addonCustomerReviewEnabled && (
                              <div className="flex-1 min-w-[200px] rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-col gap-2">
                                <p className="flex items-center gap-1 text-xs font-black text-slate-700">
                                  Ulasan Pelanggan
                                  <InfoTooltip side="top" width="w-64" content={
                                    <div className="space-y-1">
                                      <p className="font-black text-slate-700">Ulasan Pelanggan</p>
                                      <p>Ulasan dari pelanggan eksternal yang dikumpulkan melalui sistem. Menampilkan jumlah masukan dan rata-rata bintang.</p>
                                      <p className="text-slate-500">Klik "Lihat Rincian" untuk melihat detail setiap ulasan.</p>
                                    </div>
                                  } />
                                </p>
                                <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-600">
                                  <div className="rounded-lg bg-white border border-slate-100 px-2 py-1.5">
                                    <span className="block text-[9px] font-black uppercase tracking-wide text-slate-400">Masukan</span>
                                    <span className="text-sm font-black text-slate-800">{customerSummaryMasukanCount}</span>
                                  </div>
                                  <div className="rounded-lg bg-white border border-slate-100 px-2 py-1.5">
                                    <span className="block text-[9px] font-black uppercase tracking-wide text-indigo-600">Rata ★</span>
                                    <span className="text-sm font-black text-indigo-800">{customerSummaryMasukanCount > 0 ? customerSummaryAvgRating.toFixed(1) : "—"}</span>
                                  </div>
                                </div>
                                {portalMode !== "owner" && (
                                <button type="button" disabled={!selectedUser} onClick={() => setCustomerReviewAddonModalOpen(true)}
                                  className="mt-1 rounded-xl bg-indigo-600 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
                                  Lihat Rincian
                                </button>
                                )}
                              </div>
                            )}
                          </div>
                        </GlassCard>
                      )}

                      {/* Penilaian Final Karyawan */}
                      <GlassCard className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="border-b border-violet-100/80 bg-violet-50/40 px-5 py-4"
                        >
                          <motion.div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-violet-700">
                                Penilaian Final Karyawan
                                <InfoTooltip side="right" width="w-72" content={
                                  <div className="space-y-1.5">
                                    <p className="font-black text-slate-700">Penilaian Final Karyawan</p>
                                    <p>Evaluasi keseluruhan oleh auditor setelah semua data (omzet, add-on, produk fokus) ditinjau. Tiga input yang disinkronkan ke <strong>rapor bulanan</strong>:</p>
                                    <ul className="mt-1 space-y-1 pl-3">
                                      <li>• <strong>Skor analis</strong> — nilai kualitatif 0–100 dari auditor.</li>
                                      <li>• <strong>Penyesuaian Bonus</strong> — nominal yang ditambah/dikurang langsung ke THP.</li>
                                      <li>• <strong>Catatan untuk karyawan</strong> — pesan dari auditor yang tampil langsung di rapor bulanan karyawan.</li>
                                    </ul>
                                    <p className="text-slate-500">Kunci baris agar data tidak berubah sebelum finalisasi.</p>
                                  </div>
                                } />
                              </p>
                              <p className="mt-1 text-[11px] font-medium text-slate-500">
                                Evaluasi akhir auditor — tersinkron ke rapor bulanan saat finalisasi.
                              </p>
                            </div>
                            {portalMode === "audit" && (
                            <button
                              type="button"
                              onClick={handleToggleCrewLock}
                              disabled={crewLockToggleDisabled || crewLockToggling || isPending || !selectedUser}
                              className={cn(
                                "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[9px] font-black uppercase tracking-widest shadow-sm transition disabled:opacity-50",
                                selectedUser?.audit?.is_locked
                                  ? audit?.status === "APPROVED"
                                    ? "border border-orange-300 bg-orange-100 text-orange-900 hover:bg-orange-200"
                                    : "border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                              )}
                            >
                              {crewLockToggling || isPending ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : selectedUser?.audit?.is_locked ? (
                                <Unlock size={12} />
                              ) : (
                                <Lock size={12} />
                              )}
                              {selectedUser?.audit?.is_locked
                                ? audit?.status === "APPROVED"
                                  ? "Buka Kunci (Override)"
                                  : "Buka kunci baris"
                                : "Kunci baris"}
                            </button>
                            )}
                          </motion.div>
                        </motion.div>
                        <div className="space-y-4 p-5">
                          {/* Override mode banner */}
                          {audit?.status === "APPROVED" && !crewRowLockedForSelected && !raportPublishedLocked && (
                            overrideActive ? (
                              /* Override already activated — show warning */
                              <div className="flex items-start gap-2.5 rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-3">
                                <span className="mt-0.5 shrink-0 text-base leading-none">⚠️</span>
                                <div>
                                  <p className="text-[11px] font-black text-orange-900">Mode Override Aktif</p>
                                  <p className="mt-0.5 text-[10px] font-medium leading-snug text-orange-800">
                                    Audit sudah <strong>APPROVED</strong>. Perubahan penilaian ini bersifat override — pastikan sudah dikomunikasikan. Kunci kembali baris ini setelah selesai mengedit.
                                  </p>
                                </div>
                              </div>
                            ) : (
                              /* Override not yet activated — show lock state + activation button */
                              <div className="flex items-start gap-2.5 rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-3">
                                <span className="mt-0.5 shrink-0 text-base leading-none">🔒</span>
                                <div className="flex-1">
                                  <p className="text-[11px] font-black text-orange-900">Audit Sudah APPROVED</p>
                                  <p className="mt-0.5 text-[10px] font-medium leading-snug text-orange-800">
                                    Penilaian dikunci karena audit sudah disetujui. Untuk mengedit, aktifkan mode override terlebih dahulu.
                                  </p>
                                  {portalMode === "audit" && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const ok = confirm(
                                        "⚠️ PERINGATAN — Audit sudah APPROVED\n\n" +
                                        "Mengaktifkan mode override mengizinkan perubahan penilaian yang sudah disetujui. " +
                                        "Gunakan hanya jika ada koreksi yang disengaja.\n\n" +
                                        "Kunci kembali baris setelah selesai mengedit.\n\n" +
                                        "Aktifkan override?"
                                      );
                                      if (ok) setOverrideActive(true);
                                    }}
                                    className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-orange-300 bg-orange-100 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-orange-900 transition hover:bg-orange-200"
                                  >
                                    <Unlock size={10} />
                                    Aktifkan Edit (Override)
                                  </button>
                                  )}
                                </div>
                              </div>
                            )
                          )}
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="grid grid-cols-1 gap-4 md:grid-cols-2"
                          >
                            <label className="block space-y-1.5">
                              <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-500">
                                Skor analis (0–100)
                                <InfoTooltip side="top" width="w-64" content={
                                  <div className="space-y-1">
                                    <p className="font-black text-slate-700">Skor Analis</p>
                                    <p>Nilai subjektif auditor (0–100) yang mencerminkan kinerja kualitatif karyawan pada periode ini.</p>
                                    <p className="text-slate-500">Nilai ini akan tampil di rapor bulanan karyawan sebagai skor evaluasi dari auditor.</p>
                                  </div>
                                } />
                              </span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={crewAnalystScoreDraft}
                                onChange={(e) => {
                                  setCrewAuditDirty(true);
                                  const d = stripToDigits(e.target.value).slice(0, 3);
                                  if (!d) { setCrewAnalystScoreDraft(""); return; }
                                  const n = parseInt(d, 10);
                                  setCrewAnalystScoreDraft(Number.isNaN(n) ? "" : String(Math.min(100, n)));
                                }}
                                disabled={portalMode === "owner" || crewAuditInputsLocked || !selectedUser}
                                placeholder="Opsional"
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50 disabled:text-slate-400"
                              />
                            </label>
                            <label className="block space-y-1.5">
                              <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-500">
                                Penyesuaian Bonus (Rp)
                                <InfoTooltip side="top" width="w-72" content={
                                  <div className="space-y-1">
                                    <p className="font-black text-slate-700">Penyesuaian Bonus</p>
                                    <p>Nominal rupiah yang ditambah atau dikurangi <strong>langsung ke THP</strong> karyawan, di luar struktur bonus KPI/omzet.</p>
                                    <p className="mt-1 text-slate-500">Gunakan angka <strong>negatif</strong> (awali dengan &quot;−&quot;) untuk potongan. Contoh: <em>−50.000</em> = potong Rp 50.000.</p>
                                  </div>
                                } />
                              </span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={crewBbaAdjustmentDraft}
                                onChange={(e) => {
                                  setCrewAuditDirty(true);
                                  const raw = e.target.value;
                                  const neg = raw.trim().startsWith("-");
                                  const digits = stripToDigits(raw);
                                  const formatted = digits ? formatThousandsDotFromDigits(digits) : "";
                                  setCrewBbaAdjustmentDraft(neg && formatted ? `-${formatted}` : formatted);
                                }}
                                disabled={portalMode === "owner" || crewAuditInputsLocked || !selectedUser}
                                placeholder="0"
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50 disabled:text-slate-400"
                              />
                            </label>
                          </motion.div>
                          <label className="block space-y-1.5">
                            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-500">
                              Catatan untuk karyawan
                              <span className="ml-0.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[8px] font-black normal-case tracking-normal text-violet-600">tampil di rapor</span>
                              <InfoTooltip side="top" width="w-72" content={
                                <div className="space-y-1.5">
                                  <p className="font-black text-slate-700">Catatan untuk Karyawan</p>
                                  <p>Pesan atau evaluasi dari auditor yang akan <strong>muncul langsung di rapor bulanan</strong> karyawan ini — dapat dibaca oleh karyawan setelah rapor dipublish.</p>
                                  <p className="text-violet-700 font-semibold">Tulis dengan bahasa yang konstruktif dan mudah dipahami.</p>
                                </div>
                              } />
                            </span>
                            <textarea
                              value={crewAnalystFeedbackDraft}
                              onChange={(e) => { setCrewAuditDirty(true); setCrewAnalystFeedbackDraft(e.target.value); }}
                              disabled={portalMode === "owner" || crewAuditInputsLocked || !selectedUser}
                              rows={3}
                              placeholder="Tulis pesan atau catatan untuk karyawan ini — akan muncul di rapor bulanan mereka…"
                              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50 disabled:text-slate-400"
                            />
                          </label>
                          {portalMode === "audit" && crewAuditInputsLocked && !(audit?.status === "APPROVED" && !overrideActive && !crewRowLockedForSelected && !raportPublishedLocked) ? (
                            <p className="text-[10px] font-semibold text-amber-800">
                              {raportPublishedLocked
                                ? "Rapor bulanan sudah dipublish — penilaian dan add-on tidak dapat diubah."
                                : "Baris terkunci — buka kunci atau tunggu reopen audit untuk mengedit."}
                            </p>
                          ) : null}
                          {portalMode === "audit" && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <button
                              type="button"
                              onClick={persistCrewAudit}
                              disabled={crewAuditInputsLocked || crewAuditSaving || !selectedUser || !crewAuditDirty}
                              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50"
                            >
                              {crewAuditSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                              Simpan penilaian final
                            </button>
                          </motion.div>
                          )}
                        </div>
                      </GlassCard>

                      {bonusSourceSummaryCard}
                    </>
                  )}

              </div>
            </motion.div>
          )}

          {/* ─ RAPOR / PAYROLL ──────────────────────────── */}
          {activeTab === 'payroll' && (
            <motion.div key="payroll" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">

              {/* Gate: addon enabled but unconfigured */}
              {payrollAddonEnabled && !payrollConfigured && (
                <GlassCard className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
                    <div>
                      <p className="text-sm font-black text-amber-800">Addon Aktif — Belum Ada Konfigurasi Gaji</p>
                      <p className="mt-1 text-[11px] font-medium leading-snug text-amber-700">
                        Addon payroll sudah diaktifkan, namun belum ada konfigurasi gaji yang disiapkan untuk karyawan di apotek ini.
                        Buat konfigurasi di halaman Setup Gaji terlebih dahulu.
                      </p>
                    </div>
                  </div>
                </GlassCard>
              )}

              {payrollAddonEnabled && payrollConfigured && (
              <div className="space-y-6">

              {/* ── TOP CARD: Payroll Run — Semua Karyawan ── */}
              <GlassCard className="overflow-hidden border border-slate-200 bg-white p-0 shadow-lg shadow-slate-200/50">
                <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4 md:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Payroll Run</p>
                        <InfoTooltip
                          side="bottom"
                          width="w-80"
                          content={
                            <div className="space-y-2">
                              <p className="font-black text-slate-800">Apa itu Payroll Run?</p>
                              <p>Simulasi penggajian satu periode berdasarkan konfigurasi gaji + bonus audit. Data ini bersifat <strong>draft</strong> — belum dikirim ke sistem penggajian sampai kamu klik <strong>Simpan Draft</strong>.</p>
                              <p className="text-slate-500">Perubahan hari masuk atau konfigurasi karyawan langsung mempengaruhi angka di tabel ini secara real-time.</p>
                            </div>
                          }
                        />
                      </div>
                      <h3 className="mt-0.5 text-base font-black text-slate-900">
                        Semua Karyawan — {String(month).padStart(2, "0")}/{year}
                      </h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {payrollPeriod ? (
                        <span className="rounded-full bg-sky-100 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-sky-700">
                          {String(payrollPeriod.status ?? "draft")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500">
                          Belum ada draft
                        </span>
                      )}
                      {raportPeriodPublished && (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-700">
                          Rapor dipublish
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/40">
                        <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">Karyawan</th>
                        <th className="px-3 py-3 text-center text-[9px] font-black uppercase tracking-widest text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            Hari Masuk
                            <InfoTooltip
                              side="bottom"
                              width="w-72"
                              content={<><strong>Hari kerja aktual</strong> di bulan ini. Digunakan untuk menghitung tunjangan makan &amp; transport harian. Jika dikosongkan, tunjangan harian dihitung flat (1× rate). Isi angka ini sebelum klik Simpan Draft.</>}
                            />
                          </span>
                        </th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-slate-400">
                          <span className="inline-flex items-center justify-end gap-1">
                            Pendapatan
                            <InfoTooltip
                              side="bottom"
                              width="w-72"
                              content={<>Gaji pokok + tunjangan jabatan + tunjangan makan (hari masuk × rate) + tunjangan transport (hari masuk × rate) + penambahan kustom.</>}
                            />
                          </span>
                        </th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-slate-400">
                          <span className="inline-flex items-center justify-end gap-1">
                            Potongan
                            <InfoTooltip
                              side="bottom"
                              width="w-72"
                              content={<>Potongan BPJS Kesehatan &amp; Ketenagakerjaan bagian karyawan + pengurangan kustom. <strong>Tanggungan BPJS perusahaan tidak masuk ke sini</strong> — hanya beban karyawan yang dikurangi dari THP.</>}
                            />
                          </span>
                        </th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-slate-400">
                          <span className="inline-flex items-center justify-end gap-1">
                            Bonus
                            <InfoTooltip
                              side="bottom"
                              width="w-72"
                              content={<>Bonus KPI (auto dari target omzet) + bonus produk fokus (auto dari realisasi penjualan) + penyesuaian bonus auditor (manual di tab Karyawan &amp; Penilaian).</>}
                            />
                          </span>
                        </th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-slate-400">
                          <span className="inline-flex items-center justify-end gap-1">
                            THP Bersih
                            <InfoTooltip
                              side="bottom"
                              width="w-72"
                              content={<><strong>Take-Home Pay estimasi</strong> = Pendapatan − Potongan + Bonus. Angka ini bersifat estimasi MTD — belum final sampai bulan berakhir dan rapor dipublish.</>}
                            />
                          </span>
                        </th>
                        <th className="px-3 py-3 text-center text-[9px] font-black uppercase tracking-widest text-slate-400">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {userStatsSortedByName.map((u: any) => {
                        const ovr = payrollConfigOverrides[u.id];
                        const dwRaw = daysWorkedMap[u.id] ?? "";
                        const dw = dwRaw !== "" ? parseInt(dwRaw, 10) : NaN;
                        const hasDw = !isNaN(dw) && dw >= 0;
                        const mealRate = Number(ovr?.mealAllowance ?? u.mealAllowance);
                        const transRate = Number(ovr?.transAllowance ?? u.transAllowance);
                        const meal = hasDw ? mealRate * dw : mealRate;
                        const transport = hasDw ? transRate * dw : transRate;
                        const adjRows = customAdjustmentTableRows(ovr?.customAdjustments ?? u.config?.custom_adjustments);
                        const customAdditionsTotal = adjRows.filter(r => r.val > 0).reduce((s, r) => s + r.val, 0);
                        const customDeductionsTotal = adjRows.filter(r => r.val < 0).reduce((s, r) => s + Math.abs(r.val), 0);
                        const pendapatan = Number(ovr?.baseSalary ?? u.baseSalary) + Number(ovr?.posAllowance ?? u.posAllowance) + meal + transport + customAdditionsTotal;
                        const potongan = Number(ovr?.bpjsDeduction ?? u.bpjsDeduction) + customDeductionsTotal;
                        const productBonus = computeProductFokusBonusTotalForUser(u.id, productFokusConfigs, approvedProductRows, { monthStartKey, mtdThroughDateKey });
                        const bonus = Number(u.kpiBonus ?? 0) + productBonus + Number(u.adjustment ?? 0);
                        const thpBersih = pendapatan - potongan + bonus;
                        const hasOverride = !!payrollConfigOverrides[u.id];
                        return (
                          <tr key={u.id} className="transition-colors hover:bg-slate-50/60">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="min-w-0">
                                  <p className="font-black text-slate-900">{u.name}</p>
                                  {u.config?.position_title && (
                                    <p className="mt-0.5 text-[9px] font-medium text-slate-400">{u.config.position_title}</p>
                                  )}
                                </div>
                                {hasOverride && (
                                  <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-amber-700">
                                    Override
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <input
                                type="number"
                                min={0}
                                max={31}
                                value={daysWorkedMap[u.id] ?? ""}
                                placeholder="—"
                                onChange={(e) => setDaysWorkedMap(prev => ({ ...prev, [u.id]: e.target.value }))}
                                className="w-12 rounded-xl border border-slate-200 bg-slate-50 py-1.5 text-center text-[11px] font-black text-slate-900 shadow-inner focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
                              />
                            </td>
                            <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-800">
                              {formatIDR(pendapatan)}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold tabular-nums text-rose-700">
                              {formatIDR(-potongan)}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold tabular-nums text-indigo-700">
                              {formatIDR(bonus)}
                            </td>
                            <td className="px-3 py-3 text-right font-black tabular-nums text-sky-800">
                              {formatIDR(thpBersih)}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setPayrollModalUserId(String(u.id));
                                  setPayrollModalEditMode(false);
                                  setPayrollSaveChoiceOpen(false);
                                  const src = payrollConfigOverrides[u.id] ?? u;
                                  setPayrollModalDraft({
                                    baseSalary: String(src.baseSalary ?? u.baseSalary ?? 0),
                                    posAllowance: String(src.posAllowance ?? u.posAllowance ?? 0),
                                    mealAllowance: String(src.mealAllowance ?? u.mealAllowance ?? 0),
                                    transAllowance: String(src.transAllowance ?? u.transAllowance ?? 0),
                                  });
                                }}
                                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-slate-600 shadow-sm hover:border-indigo-300 hover:text-indigo-700 transition-colors"
                              >
                                Detail
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50/60">
                        <td className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Total THP semua karyawan
                        </td>
                        <td colSpan={4} />
                        <td className="px-3 py-3 text-right text-sm font-black tabular-nums text-sky-900">
                          {formatIDR(userStatsSortedByName.reduce((acc: number, u: any) => {
                            const ovr = payrollConfigOverrides[u.id];
                            const dwRaw = daysWorkedMap[u.id] ?? "";
                            const dw = dwRaw !== "" ? parseInt(dwRaw, 10) : NaN;
                            const hasDw = !isNaN(dw) && dw >= 0;
                            const mealRate = Number(ovr?.mealAllowance ?? u.mealAllowance);
                            const transRate = Number(ovr?.transAllowance ?? u.transAllowance);
                            const meal = hasDw ? mealRate * dw : mealRate;
                            const transport = hasDw ? transRate * dw : transRate;
                            const adjRows = customAdjustmentTableRows(ovr?.customAdjustments ?? u.config?.custom_adjustments);
                            const customAdditionsTotal = adjRows.filter(r => r.val > 0).reduce((s, r) => s + r.val, 0);
                            const customDeductionsTotal = adjRows.filter(r => r.val < 0).reduce((s, r) => s + Math.abs(r.val), 0);
                            const pendapatan = Number(ovr?.baseSalary ?? u.baseSalary) + Number(ovr?.posAllowance ?? u.posAllowance) + meal + transport + customAdditionsTotal;
                            const potongan = Number(ovr?.bpjsDeduction ?? u.bpjsDeduction) + customDeductionsTotal;
                            const productBonus = computeProductFokusBonusTotalForUser(u.id, productFokusConfigs, approvedProductRows, { monthStartKey, mtdThroughDateKey });
                            const bonus = Number(u.kpiBonus ?? 0) + productBonus + Number(u.adjustment ?? 0);
                            return acc + pendapatan - potongan + bonus;
                          }, 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="border-t border-slate-100 bg-slate-50/40 px-5 py-4 md:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[10px] font-medium text-slate-500">
                      Isi <strong>Hari Masuk</strong> untuk menghitung tunjangan harian (makan &amp; transport) secara akurat.
                      Klik <strong>Detail</strong> untuk rincian lengkap dan edit konfigurasi gaji per karyawan.
                    </p>
                    <div className="flex items-center gap-2">
                      <InfoTooltip
                        side="top"
                        width="w-80"
                        content={
                          <div className="space-y-2">
                            <p className="font-black text-slate-800">Simpan Draft Payroll</p>
                            <p>Menyimpan data gaji semua karyawan ke database sebagai <strong>draft</strong> untuk periode {String(month).padStart(2,"0")}/{year}.</p>
                            <ul className="mt-1 space-y-1 text-slate-500">
                              <li>• Override konfigurasi per karyawan (jika ada) ikut tersimpan</li>
                              <li>• Hari masuk yang sudah diisi ikut tersimpan</li>
                              <li>• Bisa di-<em>simpan ulang</em> kapan saja selama belum published</li>
                            </ul>
                          </div>
                        }
                      />
                      <button
                        type="button"
                        onClick={handleSavePayrollDraft}
                        disabled={isPayrollSavePending}
                        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isPayrollSavePending
                          ? <Loader2 size={13} className="animate-spin" />
                          : <Save size={13} />}
                        Simpan Draft
                      </button>
                    </div>
                  </div>
                </div>
              </GlassCard>

              {/* Payroll detail modal rendered via portal — see payrollModalUserId state */}
              </div>
              )}

              {/* ── Rapor Kinerja per Karyawan ── */}
              {payrollAddonEnabled && userStatsSortedByName.length > 0 && (() => {
                const raportUid = payrollRaportUserId || (userStatsSortedByName[0]?.id ?? "");
                const ru = userStatsSortedByName.find((u: any) => String(u.id) === raportUid) ?? userStatsSortedByName[0];
                if (!ru) return null;

                // MTD achievements for this user
                const ruRows = (crewAchievements ?? []).filter((r: any) => {
                  const dk = String(r.achievement_date ?? "").slice(0, 10);
                  return String(r.user_id) === String(ru.id) && dk >= monthStartKey && dk <= mtdThroughDateKey;
                });
                const ruOmzet = ruRows.reduce((s: number, r: any) => s + Number(r.omzet ?? 0), 0);
                const ruTrx   = ruRows.reduce((s: number, r: any) => s + Number(r.transactions ?? 0), 0);
                const ruItems = ruRows.reduce((s: number, r: any) => s + Number(r.items ?? 0), 0);
                const ruRej   = ruRows.reduce((s: number, r: any) => s + Number(r.rejected_customer_total ?? 0), 0);
                const ruAtv   = ruTrx > 0 ? ruOmzet / ruTrx : 0;
                const ruAtu   = ruTrx > 0 ? ruItems / ruTrx : 0;

                // Penilaian final auditor
                const ruCrewAudit  = (crewAudits ?? []).find((c: any) => String(c.user_id) === String(ru.id));
                const ruScore      = ruCrewAudit?.analyst_score;
                const ruAdj        = Number(ruCrewAudit?.bba_adjustment ?? 0);
                const ruFeedback   = ruCrewAudit?.analyst_feedback;
                const hasPenilaian = ruScore != null || ruAdj !== 0 || (ruFeedback && String(ruFeedback).trim());

                // Produk fokus per user (per-product breakdown)
                const ruSoldMap = new Map<string, number>();
                for (const row of approvedProductRows ?? []) {
                  const sub = Array.isArray(row.submission) ? row.submission[0] : row.submission;
                  const uid = String(sub?.user_id ?? "");
                  const dk  = String(sub?.submission_date ?? "").slice(0, 10);
                  if (uid !== String(ru.id) || dk < monthStartKey || dk > mtdThroughDateKey) continue;
                  const pid = String(row.product_id ?? "");
                  if (pid) ruSoldMap.set(pid, (ruSoldMap.get(pid) ?? 0) + Number(row.quantity_sold ?? 0));
                }
                const ruProductRows = (productFokusConfigs ?? []).map((cfg: any) => {
                  const pid    = String(cfg.product_id ?? "");
                  const sold   = ruSoldMap.get(pid) ?? 0;
                  const target = Number(cfg.target_value ?? 0);
                  const bonus  = Number(cfg.bonus_value ?? 0);
                  const step   = Number(cfg.bonus_step ?? 1) || 1;
                  const pct    = target > 0 ? (sold / target) * 100 : 0;
                  const excess = Math.max(0, sold - target);
                  const earned = cfg.bonus_type === "kelipatan"
                    ? (sold >= target ? Math.floor(excess / step) * bonus : 0)
                    : (sold >= target ? bonus : 0);
                  return { id: cfg.id, productName: cfg.master_products?.product_name || "Produk", targetType: cfg.target_type, target, sold, pct, earned };
                });

                // (monthlyAddonAppraisals tidak dipakai langsung di rapor section —
                // data add-on diambil dari ruAttendance, ruInternalReviews, ruCustomerReviews)

                // Absensi underlying data
                const ruAttendance = mergeAttendanceByDay(attendanceLogs, String(ru.id), monthStartKey, mtdThroughDateKey);
                const ruLeaveDays  = leaveDaySetForUser(leaveRequestsApproved, String(ru.id), monthStartKey, mtdThroughDateKey);
                const ruHadir = ruAttendance.length;
                const ruTelat = ruAttendance.filter((r: any) => r.isLate).length;
                const ruIzin  = ruLeaveDays.size;

                // Review internal underlying data
                const ruInternalReviews = (internalReviews ?? [])
                  .filter((r: any) => {
                    if (String(r.reviewee_user_id) !== String(ru.id)) return false;
                    const samePeriod = Number(r.period_month) === Number(month) && Number(r.period_year) === Number(year);
                    const dk = jakartaDateKeyFromIso(String(r.created_at ?? ""));
                    const inCal = dk >= monthStartKey && dk <= monthEndKey;
                    if (!samePeriod && !inCal) return false;
                    if (!isCurrentMonth) return true;
                    return dk <= mtdThroughDateKey;
                  })
                  .sort((a: any, b: any) => new Date(String(b.created_at ?? 0)).getTime() - new Date(String(a.created_at ?? 0)).getTime());
                const ruInternalAvg = ruInternalReviews.length > 0
                  ? ruInternalReviews.reduce((s: number, r: any) => s + Number(r.rating ?? 0), 0) / ruInternalReviews.length
                  : 0;

                // Review pelanggan underlying data
                const ruCustomerReviews = (customerReviews ?? [])
                  .filter((r: any) => {
                    const tag = customerReviewTaggedUserId(r);
                    if (tag && tag !== String(ru.id)) return false;
                    const dk = jakartaDateKeyFromIso(customerReviewEventIso(r));
                    if (dk < monthStartKey || dk > monthEndKey) return false;
                    if (!isCurrentMonth) return true;
                    return dk <= mtdThroughDateKey;
                  })
                  .sort((a: any, b: any) => new Date(customerReviewEventIso(b)).getTime() - new Date(customerReviewEventIso(a)).getTime());
                const ruCustomerAvg = ruCustomerReviews.length > 0
                  ? ruCustomerReviews.reduce((s: number, r: any) => s + Number(r.rating ?? 0), 0) / ruCustomerReviews.length
                  : 0;

                // Perkiraan omzet tertolak (per-day ATV × rejection count)
                const ruRejOmzetEst = ruRows.reduce((acc: number, r: any) => {
                  const tx = Number(r.transactions ?? 0);
                  const omzet = Number(r.omzet ?? 0);
                  const atv = tx > 0 ? omzet / tx : 0;
                  return acc + atv * Number(r.rejected_customer_total ?? 0);
                }, 0);

                // Bonus summary
                const ruTotalBonus = Number(ru.kpiBonus ?? 0) + Number(ru.productBonus ?? 0) + Number(ru.adjustment ?? 0);

                // Kontribusi omzet ke cabang
                const ruKontribusiPct = accumulatedOmzet > 0 ? (ruOmzet / accumulatedOmzet) * 100 : 0;

                // Ketepatan waktu absensi
                const ruTepatWaktuPct = ruHadir > 0 ? ((ruHadir - ruTelat) / ruHadir) * 100 : null;

                return (
                  <GlassCard className="overflow-hidden border border-slate-200 bg-white p-0 shadow-lg shadow-slate-200/50">
                    {/* Header */}
                    <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4 md:px-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rapor Kinerja</p>
                          <h3 className="mt-0.5 text-base font-black text-slate-900">Ringkasan per Karyawan</h3>
                        </div>
                        <select
                          value={raportUid}
                          onChange={(e) => setPayrollRaportUserId(e.target.value)}
                          className="min-w-[160px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-800 shadow-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                          {userStatsSortedByName.map((u: any) => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-5 p-5 md:p-6">

                      {/* ── Blok 1: Capaian KPI ── */}
                      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white p-4">
                        <div className="mb-3 flex items-center gap-1.5">
                          <p className="text-[9px] font-black uppercase tracking-widest text-indigo-700">Capaian KPI</p>
                          <InfoTooltip
                            side="right"
                            width="w-72"
                            content={<>Perbandingan realisasi omzet MTD karyawan ini terhadap target personal yang ditetapkan. <strong>Bonus KPI</strong> dihitung otomatis dari skema yang aktif di konfigurasi cabang.</>}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Target Personal</p>
                            <p className="mt-0.5 text-sm font-black tabular-nums text-slate-900">{formatIDR(Number(ru.targetAssigned ?? 0))}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Realisasi MTD</p>
                            <p className="mt-0.5 text-sm font-black tabular-nums text-slate-900">{formatIDR(ruOmzet)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">% Capaian</p>
                            <p className={`mt-0.5 text-sm font-black tabular-nums ${Number(ru.kpiAchievement ?? 0) >= 100 ? "text-emerald-700" : "text-slate-900"}`}>
                              {Number(ru.kpiAchievement ?? 0).toFixed(1)}%
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">KPI Bonus</p>
                            <p className="mt-0.5 text-sm font-black tabular-nums text-indigo-700">{formatIDR(Number(ru.kpiBonus ?? 0))}</p>
                          </div>
                        </div>
                        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-indigo-100">
                          <div
                            className="h-full rounded-full bg-indigo-500 transition-[width] duration-500"
                            style={{ width: `${Math.min(100, Number(ru.kpiAchievement ?? 0))}%` }}
                          />
                        </div>
                        <p className="mt-1 text-right text-[9px] font-semibold text-indigo-600">
                          {Math.min(100, Number(ru.kpiAchievement ?? 0)).toFixed(1)}% dari target
                        </p>
                      </div>

                      {/* ── Blok 2: Operasional ── */}
                      <div>
                        <div className="mb-2 flex items-center gap-1.5">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Operasional</p>
                          <InfoTooltip
                            side="right"
                            width="w-80"
                            content={
                              <div className="space-y-1.5">
                                <p className="font-black text-slate-800">Metrik Operasional MTD</p>
                                <p><strong>ATV</strong> — Average Transaction Value: rata-rata nilai per transaksi.</p>
                                <p><strong>ATU</strong> — Average Transaction Unit: rata-rata item per transaksi.</p>
                                <p><strong>SARP</strong> — rata-rata ATV% dan ATU% relatif terhadap rata-rata tim. Di atas 100% = lebih baik dari rata-rata tim.</p>
                                <p><strong>Kontribusi</strong> — porsi omzet karyawan ini dari total omzet cabang MTD.</p>
                              </div>
                            }
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">ATV</p>
                            <p className="mt-1 text-sm font-black tabular-nums text-slate-900">{formatIDR(ruAtv)}</p>
                            {Number(ru.atvPct ?? 0) > 0 && (
                              <p className="mt-0.5 text-[9px] font-semibold text-slate-500">{Number(ru.atvPct ?? 0).toFixed(0)}% vs tim</p>
                            )}
                          </div>
                          <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">ATU</p>
                            <p className="mt-1 text-sm font-black tabular-nums text-slate-900">{ruAtu.toFixed(2)}</p>
                            {Number(ru.atuPct ?? 0) > 0 && (
                              <p className="mt-0.5 text-[9px] font-semibold text-slate-500">{Number(ru.atuPct ?? 0).toFixed(0)}% vs tim</p>
                            )}
                          </div>
                          <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">SARP</p>
                            <p className={`mt-1 text-sm font-black tabular-nums ${Number(ru.sarpPct ?? 0) >= 100 ? "text-emerald-700" : "text-slate-900"}`}>
                              {Number(ru.sarpPct ?? 0).toFixed(1)}%
                            </p>
                            <p className="mt-0.5 text-[9px] font-medium text-slate-400">relatif tim</p>
                          </div>
                          <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Kontribusi</p>
                            <p className="mt-1 text-sm font-black tabular-nums text-slate-900">{ruKontribusiPct.toFixed(1)}%</p>
                            <p className="mt-0.5 text-[9px] font-medium text-slate-400">dari omzet cabang</p>
                          </div>
                        </div>
                        {ruRej > 0 && (
                          <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50/40 px-4 py-3">
                            <p className="text-[9px] font-black uppercase tracking-widest text-rose-500">Pelanggan Tertolak</p>
                            <p className="mt-1 flex flex-wrap items-baseline gap-2">
                              <span className="text-sm font-black tabular-nums text-rose-800">{formatNumber(ruRej)} pelanggan</span>
                              {ruRejOmzetEst > 0 && (
                                <span className="text-[10px] font-semibold text-rose-600">≈ {formatIDR(ruRejOmzetEst)} estimasi omzet hilang</span>
                              )}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* ── Blok 3: Total Bonus ── */}
                      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-white p-4">
                        <div className="mb-3 flex items-center gap-1.5">
                          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Total Bonus Periode Ini</p>
                          <InfoTooltip
                            side="right"
                            width="w-80"
                            content={
                              <div className="space-y-1.5">
                                <p className="font-black text-slate-800">Sumber Bonus</p>
                                <p><strong>KPI (auto)</strong> — dihitung dari skema target omzet yang dikonfigurasi di cabang.</p>
                                <p><strong>Produk fokus (auto)</strong> — dihitung dari realisasi penjualan produk fokus vs target.</p>
                                <p><strong>Penyesuaian auditor</strong> — koreksi manual oleh BBA analyst di tab Karyawan &amp; Penilaian. Bisa positif atau negatif.</p>
                              </div>
                            }
                          />
                        </div>
                        <div className="space-y-1.5 text-[12px]">
                          {([
                            { label: "KPI (auto)",          val: Number(ru.kpiBonus ?? 0),    tone: "text-indigo-700" },
                            { label: "Produk fokus (auto)", val: Number(ru.productBonus ?? 0), tone: "text-emerald-700" },
                            { label: "Penyesuaian auditor", val: Number(ru.adjustment ?? 0),   tone: Number(ru.adjustment ?? 0) < 0 ? "text-rose-700" : "text-slate-700" },
                          ] as { label: string; val: number; tone: string }[]).map(({ label, val, tone }) => (
                            <div key={label} className="flex items-end gap-2 px-1">
                              <span className="min-w-0 shrink font-semibold text-slate-600">{label}</span>
                              <span className="mb-[4px] min-h-[1px] flex-1 border-b border-dotted border-slate-200" />
                              <span className={`shrink-0 font-bold tabular-nums ${tone}`}>{formatIDR(val)}</span>
                            </div>
                          ))}
                          <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-100/80 px-3 py-2">
                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-800">Total Bonus</span>
                            <span className="font-black tabular-nums text-emerald-900">{formatIDR(ruTotalBonus)}</span>
                          </div>
                        </div>
                      </div>

                      {/* ── Blok 4: Penilaian Final (selalu tampil) ── */}
                      <div className={`rounded-2xl border p-4 ${hasPenilaian ? "border-violet-100 bg-violet-50/50" : "border-dashed border-slate-200 bg-slate-50/40"}`}>
                        <div className="mb-3 flex items-center gap-1.5">
                          <p className="text-[9px] font-black uppercase tracking-widest text-violet-700">Penilaian Final Auditor</p>
                          <InfoTooltip
                            side="right"
                            width="w-72"
                            content={<>Skor dan catatan yang diisikan BBA analyst di tab <strong>Karyawan &amp; Penilaian</strong>. Penyesuaian bonus di sini ikut masuk ke kolom <em>Bonus</em> di tabel Payroll Run.</>}
                          />
                        </div>
                        {hasPenilaian ? (
                          <div className="grid grid-cols-3 gap-3 text-[11px]">
                            <div>
                              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Skor</p>
                              <p className="mt-0.5 font-black text-slate-900">{ruScore != null ? `${ruScore}/100` : "—"}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Penyesuaian Bonus</p>
                              <p className={`mt-0.5 font-black tabular-nums ${ruAdj < 0 ? "text-rose-700" : ruAdj > 0 ? "text-emerald-700" : "text-slate-400"}`}>
                                {ruAdj !== 0 ? formatIDR(ruAdj) : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Catatan</p>
                              <p className="mt-0.5 font-medium leading-snug text-slate-700">{ruFeedback && String(ruFeedback).trim() ? String(ruFeedback).trim() : "—"}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[10px] font-medium italic text-slate-400">Belum ada penilaian final dari auditor untuk periode ini.</p>
                        )}
                      </div>

                      {/* ── Blok 5: Produk Fokus ── */}
                      {ruProductRows.length > 0 && (
                        <div>
                          <div className="mb-2 flex items-center gap-1.5">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Produk Fokus</p>
                            <InfoTooltip
                              side="right"
                              width="w-72"
                              content={<>Realisasi penjualan produk yang ditargetkan khusus. Bonus dihitung otomatis: <strong>flat</strong> (dibayar sekali saat target tercapai) atau <strong>kelipatan</strong> (per kelipatan kelebihan dari target).</>}
                            />
                          </div>
                          <div className="space-y-2">
                            {ruProductRows.map((r: any) => (
                              <div key={r.id} className="rounded-xl border border-emerald-100/90 bg-white px-3 py-3 shadow-sm">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[11px] font-black text-slate-900">{r.productName}</p>
                                  <span className={`text-[10px] font-black tabular-nums ${r.earned > 0 ? "text-emerald-700" : "text-slate-400"}`}>
                                    {formatIDR(r.earned)}
                                  </span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[10px] font-semibold text-slate-500">
                                  <span>Terjual <span className="font-black text-slate-800">{formatNumber(r.sold)}</span></span>
                                  <span>/ target <span className="font-black text-slate-800">{formatNumber(r.target)}</span></span>
                                  <span className="ml-auto font-black text-slate-700">{r.pct.toFixed(1)}%</span>
                                </div>
                                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                  <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                                    style={{ width: `${Math.min(100, Number(r.pct) || 0)}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ── Blok 6: Data Add-on ── */}
                      {anyAddonEnabled && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Data Add-on</p>
                            <InfoTooltip
                              side="right"
                              width="w-72"
                              content={<>Data dari add-on yang aktif di apotek ini. Hanya add-on yang diaktifkan di pengaturan apotek yang ditampilkan. Data ini bersifat <strong>informatif</strong> dan tidak secara langsung mempengaruhi perhitungan gaji.</>}
                            />
                          </div>

                          {/* Absensi */}
                          {addonAbsensiEnabled && (
                            <div className="overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-sm">
                              <div className="flex items-center justify-between border-b border-indigo-100 bg-indigo-50/60 px-4 py-3">
                                <div>
                                  <p className="text-[10px] font-black text-indigo-900">Jadwal &amp; Absensi</p>
                                  {ruTepatWaktuPct !== null && (
                                    <p className="text-[9px] font-semibold text-indigo-600">
                                      Ketepatan waktu: <span className="font-black">{ruTepatWaktuPct.toFixed(0)}%</span>
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="space-y-3 px-4 py-3">
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-center">
                                    <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">Hadir</p>
                                    <p className="mt-0.5 text-base font-black text-slate-900">{ruHadir}</p>
                                  </div>
                                  <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-center">
                                    <p className="text-[9px] font-black uppercase tracking-wide text-amber-500">Terlambat</p>
                                    <p className="mt-0.5 text-base font-black text-amber-700">{ruTelat}</p>
                                  </div>
                                  <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-center">
                                    <p className="text-[9px] font-black uppercase tracking-wide text-sky-500">Izin (hari)</p>
                                    <p className="mt-0.5 text-base font-black text-sky-700">{ruIzin}</p>
                                  </div>
                                </div>
                                {ruAttendance.length > 0 && (
                                  <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-100">
                                    <table className="w-full text-[10px]">
                                      <thead className="sticky top-0 bg-slate-50">
                                        <tr className="border-b border-slate-100">
                                          <th className="px-3 py-2 text-left font-black uppercase tracking-widest text-slate-400">Tanggal</th>
                                          <th className="px-3 py-2 text-left font-black uppercase tracking-widest text-slate-400">Shift</th>
                                          <th className="px-3 py-2 text-left font-black uppercase tracking-widest text-slate-400">Jam Masuk</th>
                                          <th className="px-3 py-2 text-left font-black uppercase tracking-widest text-slate-400">Status</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-50">
                                        {ruAttendance.map((att: any) => (
                                          <tr key={att.dateKey} className="hover:bg-slate-50/60">
                                            <td className="px-3 py-2 font-semibold text-slate-700">
                                              {new Date(`${att.dateKey}T12:00:00+07:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                                            </td>
                                            <td className="px-3 py-2 max-w-[100px] truncate font-medium text-slate-500">
                                              {att.shiftLabel ?? "—"}
                                            </td>
                                            <td className="px-3 py-2 tabular-nums font-semibold text-slate-700">
                                              {jakartaTimeLabel(att.clockInIso)}
                                            </td>
                                            <td className="px-3 py-2">
                                              {att.isLate ? (
                                                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-amber-700">
                                                  Telat{att.lateMinutes != null ? ` ${att.lateMinutes}m` : ""}
                                                </span>
                                              ) : (
                                                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-emerald-700">
                                                  Tepat
                                                </span>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Review Internal */}
                          {addonInternalReviewEnabled && (
                            <div className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
                              <div className="flex items-center justify-between border-b border-violet-100 bg-violet-50/60 px-4 py-3">
                                <div>
                                  <p className="text-[10px] font-black text-violet-900">Review Internal</p>
                                  <p className="text-[9px] font-medium text-violet-600">
                                    {ruInternalReviews.length} masukan{ruInternalReviews.length > 0 && ` · rata-rata ${ruInternalAvg.toFixed(1)}/5`}
                                  </p>
                                </div>
                              </div>
                              <div className="space-y-3 px-4 py-3">
                                {ruInternalReviews.length > 0 ? (
                                  <div className="max-h-48 space-y-2 overflow-y-auto">
                                    {ruInternalReviews.map((r: any) => (
                                      <div key={r.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="text-[10px] font-black text-slate-500 italic">Rekan Kerja</p>
                                          <div className="flex items-center gap-0.5">
                                            {Array.from({ length: 5 }).map((_, i) => (
                                              <Star key={i} size={9} className={i < Number(r.rating ?? 0) ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200"} />
                                            ))}
                                            <span className="ml-1 text-[9px] font-black text-slate-500">{Number(r.rating ?? 0).toFixed(0)}/5</span>
                                          </div>
                                        </div>
                                        {r.comment && String(r.comment).trim() && (
                                          <p className="mt-1 text-[10px] font-medium italic leading-snug text-slate-600">"{String(r.comment).trim()}"</p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-[10px] font-medium italic text-slate-400">Belum ada review internal periode ini.</p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Review Pelanggan */}
                          {addonCustomerReviewEnabled && (
                            <div className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
                              <div className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50/60 px-4 py-3">
                                <div>
                                  <p className="text-[10px] font-black text-emerald-900">Review Pelanggan</p>
                                  <p className="text-[9px] font-medium text-emerald-600">
                                    {ruCustomerReviews.length} ulasan{ruCustomerReviews.length > 0 && ` · rata-rata ${ruCustomerAvg.toFixed(1)}/5`}
                                  </p>
                                </div>
                              </div>
                              <div className="space-y-3 px-4 py-3">
                                {ruCustomerReviews.length > 0 ? (
                                  <div className="max-h-48 space-y-2 overflow-y-auto">
                                    {ruCustomerReviews.map((r: any, idx: number) => (
                                      <div key={String(r.id ?? idx)} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="text-[10px] font-black text-slate-700">{customerReviewSourceLabel(r)}</p>
                                          <div className="flex items-center gap-0.5">
                                            {Array.from({ length: 5 }).map((_, i) => (
                                              <Star key={i} size={9} className={i < Number(r.rating ?? 0) ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200"} />
                                            ))}
                                            <span className="ml-1 text-[9px] font-black text-slate-500">{Number(r.rating ?? 0).toFixed(0)}/5</span>
                                          </div>
                                        </div>
                                        {customerReviewBody(r) && (
                                          <p className="mt-1 text-[10px] font-medium italic leading-snug text-slate-600">"{customerReviewBody(r)}"</p>
                                        )}
                                        <p className="mt-0.5 text-[9px] font-medium text-slate-400">{jakartaDateKeyFromIso(customerReviewEventIso(r))}</p>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-[10px] font-medium italic text-slate-400">Belum ada review pelanggan periode ini.</p>
                                )}
                              </div>
                            </div>
                          )}

                        </div>
                      )}

                    </div>
                  </GlassCard>
                );

              })()}
              {payrollAddonEnabled && userStatsSortedByName.length === 0 && (
                <p className="text-center text-sm text-slate-400 py-8">Belum ada data karyawan untuk periode ini.</p>
              )}
            </motion.div>
          )}

          {/* ─ PENILAIAN ────────────────────────────── */}
          {activeTab === 'penilaian' && portalMode === "owner" && (
            <motion.div key="penilaian" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              {/* User selector */}
              <GlassCard className="border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">
                      Penilaian karyawan
                    </h3>
                    <p className="mt-1 text-[11px] font-medium leading-snug text-slate-500">
                      Periode otomatis: {isCurrentMonth ? `MTD s/d ${mtdThroughDateKey}` : `Bulan Penuh ${String(month).padStart(2, "0")}/${year}`}
                    </p>
                  </div>
                  <label className="flex w-full flex-col gap-1.5 text-xs font-bold text-slate-600 md:w-auto md:min-w-[260px]">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Filter Nama Karyawan</span>
                    <select
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      disabled={absensiSaving || internalSaving || customerSaving}
                      className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 shadow-inner focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {userStatsSortedByName.map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </GlassCard>

              {/* Data Add-on — hanya jika ada add-on aktif */}
              {anyAddonEnabled && (
                <GlassCard className="p-4 md:p-5 bg-white border border-slate-100 shadow-sm">
                  <div className="mb-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Data Add-on</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {addonAbsensiEnabled && (
                      <div className="flex-1 min-w-[200px] rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-col gap-2">
                        <p className="text-xs font-black text-slate-700">Jadwal &amp; Absensi</p>
                        <div className="grid grid-cols-3 gap-2 text-[11px] font-semibold text-slate-600">
                          <div className="rounded-lg bg-white border border-slate-100 px-2 py-1.5">
                            <span className="block text-[9px] font-black uppercase tracking-wide text-slate-400">Hadir</span>
                            <span className="text-sm font-black text-slate-800">{absensiSummaryPresent}</span>
                          </div>
                          <div className="rounded-lg bg-white border border-slate-100 px-2 py-1.5">
                            <span className="block text-[9px] font-black uppercase tracking-wide text-amber-500">Telat</span>
                            <span className="text-sm font-black text-amber-700">{absensiSummaryLate}</span>
                          </div>
                          <div className="rounded-lg bg-white border border-slate-100 px-2 py-1.5">
                            <span className="block text-[9px] font-black uppercase tracking-wide text-indigo-500">Izin (hari)</span>
                            <span className="text-sm font-black text-indigo-700">{absensiSummaryIzinDays}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!selectedUser}
                          onClick={() => setAbsensiAddonModalOpen(true)}
                          className="mt-1 rounded-xl bg-indigo-600 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Lihat Rincian
                        </button>
                      </div>
                    )}
                    {addonInternalReviewEnabled && (
                      <div className="flex-1 min-w-[200px] rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-col gap-2">
                        <p className="text-xs font-black text-slate-700">Ulasan Internal</p>
                        <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-600">
                          <div className="rounded-lg bg-white border border-slate-100 px-2 py-1.5">
                            <span className="block text-[9px] font-black uppercase tracking-wide text-slate-400">Masukan</span>
                            <span className="text-sm font-black text-slate-800">{internalSummaryMasukanCount}</span>
                          </div>
                          <div className="rounded-lg bg-white border border-slate-100 px-2 py-1.5">
                            <span className="block text-[9px] font-black uppercase tracking-wide text-sky-600">Rata ★</span>
                            <span className="text-sm font-black text-sky-800">
                              {internalSummaryMasukanCount > 0 ? internalSummaryAvgRating.toFixed(1) : "—"}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!selectedUser}
                          onClick={() => setInternalReviewAddonModalOpen(true)}
                          className="mt-1 rounded-xl bg-sky-600 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Lihat Rincian
                        </button>
                      </div>
                    )}
                    {addonCustomerReviewEnabled && (
                      <div className="flex-1 min-w-[200px] rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-col gap-2">
                        <p className="text-xs font-black text-slate-700">Ulasan Pelanggan</p>
                        <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-600">
                          <div className="rounded-lg bg-white border border-slate-100 px-2 py-1.5">
                            <span className="block text-[9px] font-black uppercase tracking-wide text-slate-400">Masukan</span>
                            <span className="text-sm font-black text-slate-800">{customerSummaryMasukanCount}</span>
                          </div>
                          <div className="rounded-lg bg-white border border-slate-100 px-2 py-1.5">
                            <span className="block text-[9px] font-black uppercase tracking-wide text-indigo-600">Rata ★</span>
                            <span className="text-sm font-black text-indigo-800">
                              {customerSummaryMasukanCount > 0 ? customerSummaryAvgRating.toFixed(1) : "—"}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!selectedUser}
                          onClick={() => setCustomerReviewAddonModalOpen(true)}
                          className="mt-1 rounded-xl bg-indigo-600 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Lihat Rincian
                        </button>
                      </div>
                    )}
                  </div>
                </GlassCard>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
      {/* DAILY DETAIL MODAL */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {selectedUserForDetail && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelectedUserForDetail(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-5xl bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-slate-200/50"
            >
              <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-6">
                   <div className="w-20 h-20 rounded-[2rem] bg-indigo-600 text-white flex items-center justify-center shadow-xl shadow-indigo-600/20">
                      <User size={36} />
                   </div>
                   <div>
                      <h3 className="text-3xl font-black text-slate-800 uppercase tracking-tighter leading-none">{selectedUserForDetail.name}</h3>
                      <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mt-3 flex items-center gap-2">
                         <Calendar size={14} className="text-indigo-500" /> Analisa Performa Harian • {month}/{year}
                      </p>
                   </div>
                </div>
                <button 
                  onClick={() => setSelectedUserForDetail(null)}
                  className="w-14 h-14 rounded-full bg-white border border-slate-100 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all shadow-sm hover:rotate-90 duration-500"
                >
                  <X size={28} />
                </button>
              </div>

              <div className="max-h-[55vh] overflow-y-auto custom-scrollbar p-10">
                <table className="w-full text-left border-separate border-spacing-y-3">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr>
                      <th className="pb-6 px-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">Tanggal Operasional</th>
                      <th className="pb-6 px-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">Omzet Bruto</th>
                      <th className="pb-6 px-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] text-center">Transaksi</th>
                      <th className="pb-6 px-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] text-center">Items</th>
                      <th className="pb-6 px-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] text-right">ATV / ATU Analysis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crewAchievements
                      .filter(a => a.user_id === selectedUserForDetail.id)
                      .sort((a, b) => new Date(a.achievement_date).getTime() - new Date(b.achievement_date).getTime())
                      .map((a, idx) => {
                        const dailyAtv = a.transactions > 0 ? a.omzet / a.transactions : 0;
                        const dailyAtu = a.transactions > 0 ? a.items / a.transactions : 0;
                        return (
                          <tr key={idx} className="group transition-all duration-300">
                            <td className="py-5 px-6 bg-slate-50/50 rounded-l-[1.5rem] border-y border-l border-slate-100 group-hover:bg-indigo-50/50 group-hover:border-indigo-100 transition-all">
                              <p className="text-xs font-black text-slate-700 uppercase tracking-tight">
                                {new Date(a.achievement_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
                              </p>
                            </td>
                            <td className="py-5 px-6 bg-slate-50/50 border-y border-slate-100 group-hover:bg-indigo-50/50 group-hover:border-indigo-100 transition-all">
                               <p className="text-sm font-black text-slate-900 tracking-tighter">{formatIDR(Number(a.omzet))}</p>
                            </td>
                            <td className="py-5 px-6 bg-slate-50/50 border-y border-slate-100 group-hover:bg-indigo-50/50 group-hover:border-indigo-100 transition-all text-center">
                               <span className="px-3 py-1 bg-white rounded-lg border border-slate-200 text-xs font-black text-slate-600">{formatNumber(a.transactions)}</span>
                            </td>
                            <td className="py-5 px-6 bg-slate-50/50 border-y border-slate-100 group-hover:bg-indigo-50/50 group-hover:border-indigo-100 transition-all text-center">
                               <span className="px-3 py-1 bg-white rounded-lg border border-slate-200 text-xs font-black text-slate-600">{formatNumber(a.items)}</span>
                            </td>
                            <td className="py-5 px-6 bg-slate-50/50 rounded-r-[1.5rem] border-y border-r border-slate-100 group-hover:bg-indigo-50/50 group-hover:border-indigo-100 transition-all text-right">
                               <p className="text-sm font-black text-indigo-600 tracking-tighter">{formatIDR(dailyAtv)}</p>
                               <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">ATU: {dailyAtu.toFixed(1)}</p>
                            </td>
                          </tr>
                        );
                      })
                    }
                  </tbody>
                </table>
              </div>

              <div className="p-10 bg-slate-900 border-t border-slate-800 flex justify-between items-center relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2" />
                 <div className="flex gap-16 relative z-10">
                    <div className="space-y-2">
                       <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Total Akumulasi Omzet</p>
                       <p className="text-3xl font-black text-white tracking-tighter">{formatIDR(selectedUserForDetail.omzet)}</p>
                    </div>
                    <div className="space-y-2">
                       <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Rata-rata Capaian</p>
                       <p className="text-3xl font-black text-emerald-400 tracking-tighter">{selectedUserForDetail.kpiAchievement.toFixed(1)}%</p>
                    </div>
                 </div>
                 <button 
                  onClick={() => setSelectedUserForDetail(null)}
                  className="relative z-10 px-14 py-5 bg-white text-slate-900 rounded-[1.5rem] text-[11px] font-black uppercase tracking-[0.2em] hover:bg-indigo-500 hover:text-white transition-all duration-500 shadow-xl shadow-white/5"
                 >
                   Tutup Laporan
                 </button>
              </div>
            </motion.div>
          </div>
        )}
        </AnimatePresence>,
        document.body
      )}

      {/* VOICE OF TEAM MODAL (INTERNAL REVIEW) */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {selectedUserForInternalDetail && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelectedUserForInternalDetail(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-slate-200/50"
            >
              <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50">
                 <div className="flex items-center gap-6">
                    <div className="w-20 h-20 rounded-[2rem] bg-white shadow-xl shadow-indigo-600/5 flex items-center justify-center text-indigo-600 border border-indigo-100">
                       <MessageSquare size={36} />
                    </div>
                    <div>
                       <h3 className="text-3xl font-black text-slate-800 uppercase tracking-tighter leading-none">{selectedUserForInternalDetail.name}</h3>
                       <p className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.2em] mt-3">Suara Tim • Analitik Internal</p>
                    </div>
                 </div>
                 <button onClick={() => setSelectedUserForInternalDetail(null)} className="w-14 h-14 rounded-full bg-white flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all shadow-sm hover:rotate-90 duration-500 border border-slate-100">
                    <X size={28} />
                 </button>
              </div>

              <div className="max-h-[50vh] overflow-y-auto p-10 space-y-8 custom-scrollbar bg-slate-50/30">
                {selectedUserForInternalDetail.reviews?.length > 0 ? selectedUserForInternalDetail.reviews.map((r: any, idx: number) => (
                  <div key={idx} className="p-8 bg-white rounded-[2rem] border border-slate-100 relative group hover:shadow-2xl hover:border-indigo-200 transition-all duration-700">
                     <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-[12px] font-black text-indigo-600 border border-indigo-100">
                              {r.reviewer?.full_name?.substring(0, 2).toUpperCase() || 'AN'}
                           </div>
                           <div>
                              <p className="text-sm font-black text-slate-700 uppercase tracking-tight">{r.reviewer?.full_name || 'Rekan Tim'}</p>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">Periode {month}/{year}</p>
                           </div>
                        </div>
                        <div className="flex gap-1.5 p-1.5 bg-slate-50 rounded-full border border-slate-100">
                           {[...Array(5)].map((_, i) => (
                              <div key={i} className={`w-3 h-3 rounded-full ${i < Number(r.rating ?? 0) ? 'bg-indigo-500 shadow-[0_0_8px_rgba(79,70,229,0.4)]' : 'bg-slate-200'}`} />
                           ))}
                        </div>
                     </div>
                     <div className="relative">
                        <div className="absolute -left-4 top-0 bottom-0 w-1 bg-indigo-500 rounded-full opacity-30" />
                        <p className="text-base font-medium text-slate-600 italic leading-relaxed pl-4">"{r.comment || 'Memberikan feedback positif tanpa catatan tambahan.'}"</p>
                     </div>
                     <div className="flex justify-end mt-6">
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] bg-slate-50 px-4 py-1.5 rounded-full border border-slate-100">
                           {new Date(r.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                     </div>
                  </div>
                )) : (
                  <div className="py-24 text-center space-y-6 bg-white rounded-[3rem] border border-dashed border-slate-200">
                     <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] mx-auto flex items-center justify-center text-slate-200">
                        <MessageSquare size={48} />
                     </div>
                     <p className="text-[11px] font-black text-slate-300 uppercase tracking-[0.2em]">Belum ada data peer-review tersedia</p>
                  </div>
                )}
              </div>

              <div className="p-10 bg-white border-t border-slate-100 flex justify-end">
                 <button onClick={() => setSelectedUserForInternalDetail(null)} className="px-14 py-5 bg-slate-900 text-white rounded-[1.5rem] text-[11px] font-black uppercase tracking-[0.2em] hover:bg-indigo-600 transition-all duration-500 shadow-xl shadow-slate-900/10">
                    Tutup Rincian
                 </button>
              </div>
            </motion.div>
          </div>
        )}
        </AnimatePresence>,
        document.body
      )}

      {/* CUSTOMER RESPONSE MODAL */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {selectedUserForCustomerDetail && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelectedUserForCustomerDetail(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-slate-200/50"
            >
              <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-amber-50/50">
                 <div className="flex items-center gap-6">
                    <div className="w-20 h-20 rounded-[2rem] bg-white shadow-xl shadow-amber-600/5 flex items-center justify-center text-amber-500 border border-amber-100">
                       <Star size={36} className="fill-amber-500" />
                    </div>
                    <div>
                       <h3 className="text-3xl font-black text-slate-800 uppercase tracking-tighter leading-none">{selectedUserForCustomerDetail.name}</h3>
                       <p className="text-[11px] font-black text-amber-500 uppercase tracking-[0.2em] mt-3">Insight Pelanggan • Pelacak CSAT</p>
                    </div>
                 </div>
                 <button onClick={() => setSelectedUserForCustomerDetail(null)} className="w-14 h-14 rounded-full bg-white flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all shadow-sm hover:rotate-90 duration-500 border border-slate-100">
                    <X size={28} />
                 </button>
              </div>

              <div className="max-h-[50vh] overflow-y-auto p-10 space-y-8 custom-scrollbar bg-slate-50/30">
                {selectedUserForCustomerDetail.reviews?.length > 0 ? selectedUserForCustomerDetail.reviews.map((r: any, idx: number) => (
                  <div key={idx} className="p-8 bg-white rounded-[2rem] border border-slate-100 relative group hover:shadow-2xl hover:border-amber-200 transition-all duration-700">
                     <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-[12px] font-black text-amber-600 border border-amber-100">
                              C
                           </div>
                           <div>
                              <p className="text-sm font-black text-slate-700 uppercase tracking-tight">Verified Customer</p>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">Reference ID #00{idx + 1}</p>
                           </div>
                        </div>
                        <div className="flex gap-1.5 p-1.5 bg-slate-50 rounded-full border border-slate-100">
                           {[...Array(5)].map((_, i) => (
                              <Star key={i} size={16} className={i < Number(r.rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} />
                           ))}
                        </div>
                     </div>
                     <div className="relative">
                        <div className="absolute -left-4 top-0 bottom-0 w-1 bg-amber-500 rounded-full opacity-30" />
                        <p className="text-base font-medium text-slate-600 italic leading-relaxed pl-4">"{customerReviewBody(r) || 'Pengalaman berbelanja yang sangat memuaskan, kru sangat ramah.'}"</p>
                     </div>
                     <div className="flex justify-end mt-6">
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] bg-slate-50 px-4 py-1.5 rounded-full border border-slate-100">
                           {new Date(customerReviewEventIso(r)).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                     </div>
                  </div>
                )) : (
                  <div className="py-24 text-center space-y-6 bg-white rounded-[3rem] border border-dashed border-slate-200">
                     <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] mx-auto flex items-center justify-center text-slate-200">
                        <Star size={48} />
                     </div>
                     <p className="text-[11px] font-black text-slate-300 uppercase tracking-[0.2em]">Belum ada testimoni pelanggan terdaftar</p>
                  </div>
                )}
              </div>

              <div className="p-10 bg-white border-t border-slate-100 flex justify-end">
                 <button onClick={() => setSelectedUserForCustomerDetail(null)} className="px-14 py-5 bg-slate-900 text-white rounded-[1.5rem] text-[11px] font-black uppercase tracking-[0.2em] hover:bg-amber-600 transition-all duration-500 shadow-xl shadow-slate-900/10">
                    Tutup Rincian
                 </button>
              </div>
            </motion.div>
          </div>
        )}
        </AnimatePresence>,
        document.body
      )}

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {addonAbsensiEnabled && selectedUser && absensiAddonModalOpen ? (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 md:p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={handleAbsensiClose}
                  className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="relative flex h-[min(92vh,880px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200/50 bg-white shadow-2xl md:rounded-[2rem]"
                >
                  <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 p-4 md:p-5">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/25 md:h-12 md:w-12">
                        <Camera size={22} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg font-black uppercase tracking-tight text-slate-900 md:text-xl">
                          Jadwal &amp; Absensi
                        </h3>
                        <p className="mt-1 truncate text-[11px] font-black uppercase tracking-widest text-slate-500">
                          {selectedUser.name} · {isCurrentMonth ? `MTD s/d ${mtdThroughDateKey}` : `Bulan Penuh ${String(month).padStart(2, "0")}/${year}`}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleAbsensiClose}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:text-rose-500"
                    >
                      <X size={22} />
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-3 md:p-4">
                    <div className="mb-2 grid grid-cols-3 gap-2">
                      {[
                        { label: "Hadir (hari)", val: absensiSummaryPresent },
                        { label: "Telat (hari)", val: absensiSummaryLate, tone: "text-amber-700" },
                        { label: "Izin (hari)", val: absensiSummaryIzinDays, tone: "text-indigo-700" },
                      ].map((c) => (
                        <div key={c.label} className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 md:px-3 md:py-2">
                          <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">{c.label}</p>
                          <p className={`text-base font-black md:text-lg ${c.tone ?? "text-slate-900"}`}>{c.val}</p>
                        </div>
                      ))}
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-slate-100">
                      <table className="min-w-[720px] w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/90">
                            <th className="px-2 py-1.5 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">
                              Tanggal (WIB)
                            </th>
                            <th className="px-2 py-1.5 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">
                              Shift
                            </th>
                            <th className="px-2 py-1.5 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">
                              Masuk
                            </th>
                            <th className="px-2 py-1.5 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">
                              Keluar
                            </th>
                            <th className="px-2 py-1.5 text-center text-[9px] font-black uppercase tracking-wider text-slate-500">
                              Status
                            </th>
                            <th className="px-2 py-1.5 text-right text-[9px] font-black uppercase tracking-wider text-slate-500">
                              Selfie
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white">
                          {mergedAttendanceForSelected.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-10 text-center text-xs font-semibold text-slate-500">
                                Belum ada log absensi di periode ini.
                              </td>
                            </tr>
                          ) : (
                            mergedAttendanceForSelected.map((row: any) => (
                              <tr key={row.dateKey} className="border-b border-slate-100">
                                <td className="px-2 py-1.5 align-top text-xs font-semibold text-slate-800">
                                  <span className="block">
                                    {new Date(row.dateKey + "T12:00:00").toLocaleDateString("id-ID", {
                                      weekday: "short",
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </span>
                                  {row.mergedFrom > 1 ? (
                                    <span className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                      Gabung {row.mergedFrom} rekaman
                                    </span>
                                  ) : null}
                                </td>
                                <td className="max-w-[200px] px-2 py-1.5 align-top text-[11px] font-semibold text-slate-600">
                                  {row.shiftLabel ?? "—"}
                                </td>
                                <td className="whitespace-nowrap px-2 py-1.5 align-top text-[11px] font-bold text-slate-800">{jakartaTimeLabel(row.clockInIso)}</td>
                                <td className="whitespace-nowrap px-2 py-1.5 align-top text-[11px] font-bold text-slate-800">
                                  {row.clockOutIso ? jakartaTimeLabel(row.clockOutIso) : "—"}
                                </td>
                                <td className="px-2 py-1.5 align-middle text-center">
                                  <div className="flex flex-col items-center gap-1">
                                    <span
                                      className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
                                        row.isLate ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                                      }`}
                                    >
                                      {row.isLate ? "Terlambat" : "Tepat Waktu"}
                                    </span>
                                    {row.isLate ? (
                                      <p className="max-w-[148px] text-[9px] font-semibold leading-snug text-amber-900">
                                        {row.lateMinutes != null && row.lateMinutes > 0 ? (
                                          <>Lambat {formatLatenessMinutesLabel(row.lateMinutes)}</>
                                        ) : (
                                          <>Jam mulai shift tidak tersedia</>
                                        )}
                                      </p>
                                    ) : null}
                                  </div>
                                  {row.notes ? (
                                    <p className="mt-1 max-w-[160px] text-left text-[10px] font-medium text-slate-500">{row.notes}</p>
                                  ) : null}
                                </td>
                                <td className="px-2 py-1.5 align-middle text-right">
                                  {row.photoUrl ? (
                                    <button
                                      type="button"
                                      onClick={() => setPhotoPreviewUrl(row.photoUrl)}
                                      className="ml-auto block h-11 w-11 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={row.photoUrl} alt="" className="h-full w-full object-cover" />
                                    </button>
                                  ) : (
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tanpa foto</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex-shrink-0 border-t border-slate-100 bg-slate-50 px-4 py-3 flex justify-end">
                    <button
                      type="button"
                      onClick={handleAbsensiClose}
                      className="rounded-xl border border-slate-200 px-4 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-600 hover:bg-slate-100"
                    >
                      Tutup
                    </button>
                  </div>
                </motion.div>
              </div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )}

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {addonInternalReviewEnabled && selectedUser && internalReviewAddonModalOpen ? (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 md:p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={handleInternalClose}
                  className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="relative flex h-[min(92vh,880px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200/50 bg-white shadow-2xl md:rounded-[2rem]"
                >
                  <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-sky-50/80 p-4 md:p-5">
                    <div className="flex min-w-0 items-center gap-3 md:gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white shadow-md shadow-sky-600/25 md:h-12 md:w-12">
                        <MessageSquare size={22} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg font-black uppercase tracking-tight text-slate-900 md:text-xl">Ulasan Internal</h3>
                        <p className="mt-1 truncate text-[11px] font-black uppercase tracking-widest text-slate-500">
                          {selectedUser.name} · {isCurrentMonth ? `MTD s/d ${mtdThroughDateKey}` : `Bulan Penuh ${String(month).padStart(2, "0")}/${year}`}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleInternalClose}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:text-rose-500"
                    >
                      <X size={22} />
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-3 md:p-4">
                    <div className="mb-2 grid grid-cols-2 gap-2">
                      {[
                        { label: "Jumlah masukan", val: internalSummaryMasukanCount },
                        {
                          label: "Rata rating (1–5)",
                          val: internalSummaryMasukanCount > 0 ? internalSummaryAvgRating.toFixed(1) : "—",
                          tone: "text-sky-800",
                        },
                      ].map((c) => (
                        <div key={c.label} className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 md:px-3 md:py-2">
                          <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">{c.label}</p>
                          <p className={`text-base font-black md:text-lg ${c.tone ?? "text-slate-900"}`}>{c.val}</p>
                        </div>
                      ))}
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-slate-100">
                      <table className="min-w-[640px] w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/90">
                            <th className="px-2 py-1.5 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">Tanggal (WIB)</th>
                            <th className="px-2 py-1.5 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">Reviewer</th>
                            <th className="px-2 py-1.5 text-center text-[9px] font-black uppercase tracking-wider text-slate-500">Rating</th>
                            <th className="px-2 py-1.5 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">Komentar</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white">
                          {peerReviewsSortedForModal.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-4 py-10 text-center text-xs font-semibold text-slate-500">
                                Belum ada review internal untuk karyawan ini pada periode dan jendela tanggal ini.
                              </td>
                            </tr>
                          ) : (
                            peerReviewsSortedForModal.map((r: any) => {
                              const revNode = Array.isArray(r.reviewer) ? r.reviewer[0] : r.reviewer;
                              const reviewerName = revNode?.full_name ?? "—";
                              const ratingNum = Number(r.rating ?? 0);
                              const dk = jakartaDateKeyFromIso(String(r.created_at ?? ""));
                              return (
                                <tr key={String(r.id)} className="border-b border-slate-100">
                                  <td className="whitespace-nowrap px-2 py-1.5 align-top text-[11px] font-semibold text-slate-800">
                                    {new Date(dk + "T12:00:00").toLocaleDateString("id-ID", {
                                      weekday: "short",
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </td>
                                  <td className="max-w-[140px] px-2 py-1.5 align-top text-[11px] font-bold text-slate-700">{reviewerName}</td>
                                  <td className="px-2 py-1.5 align-middle text-center">
                                    <span className="inline-flex justify-center gap-0.5 text-sm leading-none text-sky-500">
                                      {[1, 2, 3, 4, 5].map((i) => (
                                        <Star
                                          key={`${r.id}-${i}`}
                                          size={14}
                                          className={i <= ratingNum ? "fill-sky-500 text-sky-500" : "fill-slate-100 text-slate-200"}
                                        />
                                      ))}
                                    </span>
                                    <span className="mt-1 block text-[9px] font-black text-slate-500">{ratingNum}/5</span>
                                  </td>
                                  <td className="max-w-[240px] px-2 py-1.5 align-top text-[11px] font-medium leading-snug text-slate-600">
                                    <span className="line-clamp-3">{r.comment?.trim() ? String(r.comment) : "—"}</span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex-shrink-0 border-t border-slate-100 bg-slate-50 px-4 py-3 flex justify-end">
                    <button
                      type="button"
                      onClick={handleInternalClose}
                      className="rounded-xl border border-slate-200 px-4 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-600 hover:bg-slate-100"
                    >
                      Tutup
                    </button>
                  </div>
                </motion.div>
              </div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )}

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {addonCustomerReviewEnabled && selectedUser && customerReviewAddonModalOpen ? (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 md:p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={handleCustomerClose}
                  className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="relative flex h-[min(92vh,880px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200/50 bg-white shadow-2xl md:rounded-[2rem]"
                >
                  <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-indigo-50/80 p-4 md:p-5">
                    <div className="flex min-w-0 items-center gap-3 md:gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/25 md:h-12 md:w-12">
                        <Star size={22} className="fill-white text-white" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg font-black uppercase tracking-tight text-slate-900 md:text-xl">Ulasan Pelanggan</h3>
                        <p className="mt-1 truncate text-[11px] font-black uppercase tracking-widest text-slate-500">
                          {selectedUser.name} · {isCurrentMonth ? `MTD s/d ${mtdThroughDateKey}` : `Bulan Penuh ${String(month).padStart(2, "0")}/${year}`}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCustomerClose}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:text-rose-500"
                    >
                      <X size={22} />
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-3 md:p-4">
                    <div className="mb-2 grid grid-cols-2 gap-2">
                      {[
                        { label: "Jumlah masukan", val: customerSummaryMasukanCount },
                        {
                          label: "Rata rating (1–5)",
                          val: customerSummaryMasukanCount > 0 ? customerSummaryAvgRating.toFixed(1) : "—",
                          tone: "text-indigo-800",
                        },
                      ].map((c) => (
                        <div key={c.label} className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 md:px-3 md:py-2">
                          <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">{c.label}</p>
                          <p className={`text-base font-black md:text-lg ${c.tone ?? "text-slate-900"}`}>{c.val}</p>
                        </div>
                      ))}
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-slate-100">
                      <table className="min-w-[640px] w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/90">
                            <th className="px-2 py-1.5 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">Tanggal (WIB)</th>
                            <th className="px-2 py-1.5 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">Sumber</th>
                            <th className="px-2 py-1.5 text-center text-[9px] font-black uppercase tracking-wider text-slate-500">Rating</th>
                            <th className="px-2 py-1.5 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">Komentar</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white">
                          {customerReviewsSortedForModal.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-4 py-10 text-center text-xs font-semibold text-slate-500">
                                Belum ada ulasan pelanggan untuk karyawan ini pada periode dan jendela tanggal ini.
                              </td>
                            </tr>
                          ) : (
                            customerReviewsSortedForModal.map((r: any) => {
                              const src = customerReviewSourceLabel(r);
                              const ratingNum = Number(r.rating ?? 0);
                              const dk = jakartaDateKeyFromIso(customerReviewEventIso(r));
                              return (
                                <tr key={String(r.id ?? `${dk}-${src}`)} className="border-b border-slate-100">
                                  <td className="whitespace-nowrap px-2 py-1.5 align-top text-[11px] font-semibold text-slate-800">
                                    {new Date(dk + "T12:00:00").toLocaleDateString("id-ID", {
                                      weekday: "short",
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </td>
                                  <td className="max-w-[140px] px-2 py-1.5 align-top text-[11px] font-bold text-slate-700">{src}</td>
                                  <td className="px-2 py-1.5 align-middle text-center">
                                    <span className="inline-flex justify-center gap-0.5 text-sm leading-none text-indigo-500">
                                      {[1, 2, 3, 4, 5].map((i) => (
                                        <Star
                                          key={`${String(r.id)}-${i}`}
                                          size={14}
                                          className={i <= ratingNum ? "fill-indigo-500 text-indigo-500" : "fill-slate-100 text-slate-200"}
                                        />
                                      ))}
                                    </span>
                                    <span className="mt-1 block text-[9px] font-black text-slate-500">{ratingNum}/5</span>
                                  </td>
                                  <td className="max-w-[240px] px-2 py-1.5 align-top text-[11px] font-medium leading-snug text-slate-600">
                                    <span className="line-clamp-3">{customerReviewBody(r) || "—"}</span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex-shrink-0 border-t border-slate-100 bg-slate-50 px-4 py-3 flex justify-end">
                    <button
                      type="button"
                      onClick={handleCustomerClose}
                      className="rounded-xl border border-slate-200 px-4 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-600 hover:bg-slate-100"
                    >
                      Tutup
                    </button>
                  </div>
                </motion.div>
              </div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )}

      {typeof document !== "undefined" &&
        photoPreviewUrl &&
        createPortal(
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-black/75 backdrop-blur-sm"
              aria-label="Tutup"
              onClick={() => setPhotoPreviewUrl(null)}
            />
            <div className="relative z-10 max-h-[90vh] max-w-[min(96vw,720px)] overflow-hidden rounded-2xl border border-white/20 bg-black shadow-2xl">
              <button
                type="button"
                onClick={() => setPhotoPreviewUrl(null)}
                className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <X size={20} />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoPreviewUrl} alt="Bukti absensi" className="max-h-[90vh] w-full object-contain" />
            </div>
          </div>,
          document.body,
        )}

      {/* ── PAYROLL DETAIL MODAL ── */}
      {typeof document !== "undefined" && payrollModalUserId && (() => {
        const mu = userStatsSortedByName.find((u: any) => String(u.id) === payrollModalUserId);
        if (!mu) return null;

        const ovr = payrollConfigOverrides[payrollModalUserId];
        const dwRaw = daysWorkedMap[payrollModalUserId] ?? "";
        const dw = dwRaw !== "" ? parseInt(dwRaw, 10) : NaN;
        const hasDw = !isNaN(dw) && dw >= 0;

        // Config values — use override if present, else from userStats (which reads payrollConfigs)
        const cfg = {
          baseSalary:    Number(ovr?.baseSalary    ?? mu.baseSalary    ?? 0),
          posAllowance:  Number(ovr?.posAllowance  ?? mu.posAllowance  ?? 0),
          mealAllowance: Number(ovr?.mealAllowance ?? mu.mealAllowance ?? 0),
          transAllowance:Number(ovr?.transAllowance?? mu.transAllowance?? 0),
          bpjsDeduction: Number(ovr?.bpjsDeduction ?? mu.bpjsDeduction ?? 0),
          customAdjustments: ovr?.customAdjustments ?? (mu.config?.custom_adjustments ?? []),
        };

        const mealTotal      = hasDw ? cfg.mealAllowance  * dw : cfg.mealAllowance;
        const transportTotal = hasDw ? cfg.transAllowance * dw : cfg.transAllowance;

        const adjRows = customAdjustmentTableRows(cfg.customAdjustments);
        const customAdditions  = adjRows.filter(r => r.val > 0);
        const customDeductions = adjRows.filter(r => r.val < 0);
        const totalCustomAdds  = customAdditions.reduce((s, r) => s + r.val, 0);
        const totalCustomDeds  = customDeductions.reduce((s, r) => s + Math.abs(r.val), 0);

        const pendapatan = cfg.baseSalary + cfg.posAllowance + mealTotal + transportTotal + totalCustomAdds;
        const totalPotongan = cfg.bpjsDeduction + totalCustomDeds;

        const kpiBonus      = Number(mu.kpiBonus ?? 0);
        const productBonus  = computeProductFokusBonusTotalForUser(payrollModalUserId, productFokusConfigs, approvedProductRows, { monthStartKey, mtdThroughDateKey });
        const adjustment    = Number(mu.adjustment ?? 0);
        const totalBonus    = kpiBonus + productBonus + adjustment;
        const thpBersih     = pendapatan - totalPotongan + totalBonus;

        // Penilaian final
        const crewAuditRow   = (crewAudits ?? []).find((c: any) => String(c.user_id) === payrollModalUserId);
        const analystScore   = crewAuditRow?.analyst_score;
        const analystAdj     = Number(crewAuditRow?.bba_adjustment ?? 0);
        const analystFeedback= crewAuditRow?.analyst_feedback;

        const closeModal = () => {
          setPayrollModalUserId(null);
          setPayrollModalEditMode(false);
          setPayrollSaveChoiceOpen(false);
        };

        const BPJS_IDS_MODAL = ['__bpjs_kes_k__', '__bpjs_tk_k__', '__bpjs_kes_p__', '__bpjs_tk_p__'];
        const startEdit = () => {
          const allAdj: any[] = Array.isArray(cfg.customAdjustments) ? cfg.customAdjustments : [];
          const bpjsItems = allAdj.filter((a: any) => BPJS_IDS_MODAL.includes(a.id));
          const normalItems = allAdj.filter((a: any) => !BPJS_IDS_MODAL.includes(a.id));
          const getBpjs = (id: string) => (bpjsItems.find((a: any) => a.id === id)?.amount ?? 0) as number;
          setPayrollModalDraft({
            baseSalary:    String(cfg.baseSalary),
            posAllowance:  String(cfg.posAllowance),
            mealAllowance: String(cfg.mealAllowance),
            transAllowance:String(cfg.transAllowance),
          });
          if (bpjsItems.length === 0 && cfg.bpjsDeduction > 0) {
            setPayrollModalBpjsKesK(cfg.bpjsDeduction);
            setPayrollModalBpjsTkK(0);
          } else {
            setPayrollModalBpjsKesK(getBpjs('__bpjs_kes_k__'));
            setPayrollModalBpjsTkK(getBpjs('__bpjs_tk_k__'));
          }
          setPayrollModalBpjsKesP(getBpjs('__bpjs_kes_p__'));
          setPayrollModalBpjsTkP(getBpjs('__bpjs_tk_p__'));
          setPayrollModalCustomAdj(normalItems.map((a: any) => ({
            id: String(a.id ?? `adj_${Date.now()}_${Math.random()}`),
            name: String(a.name ?? ''),
            type: (a.type === 'deduction' ? 'deduction' : 'addition') as 'addition' | 'deduction',
            amount: Number(a.amount ?? 0),
          })));
          setPayrollModalEditMode(true);
          setPayrollSaveChoiceOpen(false);
        };

        const saveBulanIni = () => {
          const bpjsItemsToSave = [
            { id: '__bpjs_kes_k__', name: 'BPJS Kesehatan - Karyawan', type: 'bpjs_employee', amount: payrollModalBpjsKesK },
            { id: '__bpjs_tk_k__',  name: 'BPJS TK - Karyawan',        type: 'bpjs_employee', amount: payrollModalBpjsTkK },
            { id: '__bpjs_kes_p__', name: 'BPJS Kesehatan - Perusahaan',type: 'bpjs_employer', amount: payrollModalBpjsKesP },
            { id: '__bpjs_tk_p__',  name: 'BPJS TK - Perusahaan',       type: 'bpjs_employer', amount: payrollModalBpjsTkP },
          ].filter(b => b.amount > 0);
          setPayrollConfigOverrides(prev => ({
            ...prev,
            [payrollModalUserId]: {
              baseSalary:     parseFloat(payrollModalDraft.baseSalary)    || 0,
              posAllowance:   parseFloat(payrollModalDraft.posAllowance)  || 0,
              mealAllowance:  parseFloat(payrollModalDraft.mealAllowance) || 0,
              transAllowance: parseFloat(payrollModalDraft.transAllowance)|| 0,
              bpjsDeduction:  payrollModalBpjsKesK + payrollModalBpjsTkK,
              customAdjustments: [...bpjsItemsToSave, ...payrollModalCustomAdj],
            },
          }));
          setPayrollModalEditMode(false);
          setPayrollSaveChoiceOpen(false);
        };

        const numDraftField = (key: string, label: string) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</span>
            <input
              type="number"
              min={0}
              value={payrollModalDraft[key] ?? ""}
              onChange={(e) => setPayrollModalDraft(prev => ({ ...prev, [key]: e.target.value }))}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-800 shadow-inner focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
            />
          </label>
        );

        const slipRow = (label: string, val: number, tone: string = "text-slate-800") => (
          <div key={label} className="flex items-end gap-2 rounded-xl px-2 py-1.5 text-[12px] leading-tight hover:bg-slate-50/80">
            <span className="min-w-0 shrink font-semibold text-slate-700">{label}</span>
            <span className="mb-[5px] min-h-[1px] min-w-[1rem] flex-1 border-b border-dotted border-slate-300" aria-hidden />
            <span className={`shrink-0 font-bold tabular-nums ${tone}`}>{formatIDR(val)}</span>
          </div>
        );

        return createPortal(
          <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center">
            {/* Backdrop */}
            <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} aria-label="Tutup" />

            {/* Sheet / Dialog */}
            <div className="relative z-10 flex w-full max-w-lg flex-col rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl max-h-[92vh] overflow-hidden">

              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Rincian Payroll</p>
                  <h3 className="text-base font-black text-slate-900">{mu.name}</h3>
                  {mu.config?.position_title && (
                    <p className="text-[10px] font-medium text-slate-500">{mu.config.position_title}</p>
                  )}
                </div>
                <button type="button" onClick={closeModal} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">
                  <X size={16} />
                </button>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto">
                <div className="space-y-5 p-5">

                  {/* Hari masuk */}
                  <div className="flex items-center gap-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
                    <div className="flex-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-indigo-700">Hari Masuk Bulan Ini</p>
                      <p className="mt-0.5 text-[10px] font-medium text-indigo-600">Mempengaruhi tunjangan makan &amp; transport harian</p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={31}
                      value={dwRaw}
                      placeholder="—"
                      onChange={(e) => setDaysWorkedMap(prev => ({ ...prev, [payrollModalUserId]: e.target.value }))}
                      className="w-16 rounded-xl border border-indigo-200 bg-white px-2 py-2 text-center text-base font-black text-slate-900 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
                    />
                  </div>

                  {/* Edit mode or read-only */}
                  {payrollModalEditMode ? (
                    <div className="space-y-5">
                      {/* Pendapatan Tetap */}
                      <div>
                        <div className="mb-2 flex items-center gap-1.5">
                          <p className="text-[9px] font-black uppercase tracking-widest text-sky-600">Pendapatan Tetap</p>
                          <InfoTooltip side="right" width="w-64" content={<>Komponen gaji yang dibayarkan setiap bulan tanpa memandang hari masuk. Perubahannya bersifat <strong>bulan ini saja</strong> — tidak mengubah konfigurasi default.</>} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {numDraftField("baseSalary",    "Gaji Pokok (Rp)")}
                          {numDraftField("posAllowance",  "Tunjangan Jabatan (Rp)")}
                        </div>
                      </div>
                      {/* Tunjangan Harian */}
                      <div>
                        <div className="mb-2 flex items-center gap-1.5">
                          <p className="text-[9px] font-black uppercase tracking-widest text-sky-600">Tunjangan Harian</p>
                          <InfoTooltip side="right" width="w-64" content={<>Rate per hari kehadiran. Nilai akhir = rate × hari masuk yang diisi di tabel. Jika hari masuk kosong, hanya rate yang tersimpan (belum dikalikan).</>} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {numDraftField("mealAllowance", "Uang Makan / Hari (Rp)")}
                          {numDraftField("transAllowance","Transport / Hari (Rp)")}
                        </div>
                        <p className="mt-1 text-[9px] text-slate-400">Rate per hari — dikalikan hari masuk saat Simpan Draft.</p>
                      </div>
                      {/* Penambahan Kustom */}
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">+ Penambahan Kustom</p>
                            <InfoTooltip side="right" width="w-64" content={<>Tambahan pendapatan di luar komponen standar. Contoh: uang lembur, insentif khusus, bonus operasional. Langsung menambah THP.</>} />
                          </div>
                          <button type="button"
                            onClick={() => setPayrollModalCustomAdj(prev => [...prev, { id: `add_${Date.now()}`, name: '', type: 'addition', amount: 0 }])}
                            className="flex items-center gap-1 text-[9px] font-black text-emerald-600 hover:text-emerald-700">
                            + Tambah
                          </button>
                        </div>
                        {payrollModalCustomAdj.filter(a => a.type === 'addition').length === 0 ? (
                          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-center text-[10px] italic text-slate-400">
                            Belum ada penambahan kustom (Contoh: Uang Bensin Khusus, dll).
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {payrollModalCustomAdj.filter(a => a.type === 'addition').map((item) => (
                              <div key={item.id} className="flex items-center gap-2">
                                <input type="text" placeholder="Nama..."
                                  value={item.name}
                                  onChange={(e) => setPayrollModalCustomAdj(prev => prev.map(a => a.id === item.id ? { ...a, name: e.target.value } : a))}
                                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
                                />
                                <input type="number" min={0} placeholder="0"
                                  value={item.amount || ""}
                                  onChange={(e) => setPayrollModalCustomAdj(prev => prev.map(a => a.id === item.id ? { ...a, amount: parseFloat(e.target.value) || 0 } : a))}
                                  className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-black text-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
                                />
                                <button type="button"
                                  onClick={() => setPayrollModalCustomAdj(prev => prev.filter(a => a.id !== item.id))}
                                  className="text-slate-300 hover:text-rose-500">
                                  <X size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Pengurangan Kustom */}
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[9px] font-black uppercase tracking-widest text-rose-600">× Pengurangan Kustom</p>
                            <InfoTooltip side="right" width="w-64" content={<>Potongan di luar BPJS. Contoh: kasbon, denda keterlambatan, cicilan pinjaman. Langsung mengurangi THP.</>} />
                          </div>
                          <button type="button"
                            onClick={() => setPayrollModalCustomAdj(prev => [...prev, { id: `ded_${Date.now()}`, name: '', type: 'deduction', amount: 0 }])}
                            className="flex items-center gap-1 text-[9px] font-black text-rose-600 hover:text-rose-700">
                            + Tambah
                          </button>
                        </div>
                        {payrollModalCustomAdj.filter(a => a.type === 'deduction').length === 0 ? (
                          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-center text-[10px] italic text-slate-400">
                            Belum ada pengurangan kustom (Contoh: Kasbon, Denda, dll).
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {payrollModalCustomAdj.filter(a => a.type === 'deduction').map((item) => (
                              <div key={item.id} className="flex items-center gap-2">
                                <input type="text" placeholder="Nama..."
                                  value={item.name}
                                  onChange={(e) => setPayrollModalCustomAdj(prev => prev.map(a => a.id === item.id ? { ...a, name: e.target.value } : a))}
                                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-rose-400/40"
                                />
                                <input type="number" min={0} placeholder="0"
                                  value={item.amount || ""}
                                  onChange={(e) => setPayrollModalCustomAdj(prev => prev.map(a => a.id === item.id ? { ...a, amount: parseFloat(e.target.value) || 0 } : a))}
                                  className="w-24 rounded-lg border border-rose-200 bg-rose-50/40 px-2 py-1.5 text-[11px] font-black text-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-400/40"
                                />
                                <button type="button"
                                  onClick={() => setPayrollModalCustomAdj(prev => prev.filter(a => a.id !== item.id))}
                                  className="text-slate-300 hover:text-rose-500">
                                  <X size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* BPJS */}
                      <div>
                        <div className="mb-3 flex items-center gap-1.5">
                          <p className="text-[9px] font-black uppercase tracking-widest text-rose-500">Potongan & Tanggungan BPJS</p>
                          <InfoTooltip
                            side="right"
                            width="w-80"
                            content={
                              <div className="space-y-2">
                                <p className="font-black text-slate-800">BPJS — 2 Kategori</p>
                                <p><strong className="text-rose-600">Potongan Karyawan</strong> (Kes + TK): dikurangi langsung dari THP. Masuk ke kolom Potongan di tabel.</p>
                                <p><strong className="text-slate-600">Tanggungan Perusahaan</strong> (Kes + TK): beban apotek, <strong>tidak mempengaruhi THP karyawan</strong>. Dicatat untuk keperluan HR.</p>
                              </div>
                            }
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest border-b border-rose-100 pb-1">Potongan dari Karyawan</p>
                            <label className="flex flex-col gap-1">
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">BPJS Kesehatan - Karyawan (Rp)</span>
                              <input type="number" min={0}
                                value={payrollModalBpjsKesK || ""}
                                onChange={(e) => setPayrollModalBpjsKesK(parseFloat(e.target.value) || 0)}
                                className="rounded-lg border border-rose-200 bg-rose-50/50 px-3 py-2 text-sm font-black text-rose-700 shadow-inner focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400/30"
                              />
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">BPJS Ketenagakerjaan - Karyawan (Rp)</span>
                              <input type="number" min={0}
                                value={payrollModalBpjsTkK || ""}
                                onChange={(e) => setPayrollModalBpjsTkK(parseFloat(e.target.value) || 0)}
                                className="rounded-lg border border-rose-200 bg-rose-50/50 px-3 py-2 text-sm font-black text-rose-700 shadow-inner focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400/30"
                              />
                            </label>
                            {(payrollModalBpjsKesK + payrollModalBpjsTkK) > 0 && (
                              <div className="flex items-center justify-between rounded-xl bg-rose-50 px-3 py-2 border border-rose-100">
                                <span className="text-[9px] font-bold text-rose-600 uppercase">Total Potongan</span>
                                <span className="font-black text-rose-700 text-sm">−{formatIDR(payrollModalBpjsKesK + payrollModalBpjsTkK)}</span>
                              </div>
                            )}
                          </div>
                          <div className="space-y-3">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">Tanggungan Perusahaan (Info)</p>
                            <label className="flex flex-col gap-1">
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">BPJS Kesehatan - Perusahaan (Rp)</span>
                              <input type="number" min={0}
                                value={payrollModalBpjsKesP || ""}
                                onChange={(e) => setPayrollModalBpjsKesP(parseFloat(e.target.value) || 0)}
                                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-700 shadow-inner focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400/30"
                              />
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">BPJS Ketenagakerjaan - Perusahaan (Rp)</span>
                              <input type="number" min={0}
                                value={payrollModalBpjsTkP || ""}
                                onChange={(e) => setPayrollModalBpjsTkP(parseFloat(e.target.value) || 0)}
                                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-700 shadow-inner focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400/30"
                              />
                            </label>
                            <p className="text-[9px] text-slate-400 font-medium leading-relaxed">Tidak mengurangi take-home karyawan. Dicatat sebagai beban perusahaan.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ── Pendapatan ── */
                    <div className="space-y-1">
                      <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-slate-400">A. Pendapatan</p>
                      {slipRow("Gaji pokok", cfg.baseSalary)}
                      {slipRow("Tunjangan jabatan", cfg.posAllowance)}
                      {hasDw
                        ? slipRow(`Tunjangan makan (${dw} hari × ${formatIDR(cfg.mealAllowance)})`, mealTotal)
                        : slipRow("Tunjangan makan", mealTotal, dwRaw === "" ? "text-slate-400" : "text-slate-800")
                      }
                      {hasDw
                        ? slipRow(`Tunjangan transport (${dw} hari × ${formatIDR(cfg.transAllowance)})`, transportTotal)
                        : slipRow("Tunjangan transport", transportTotal, dwRaw === "" ? "text-slate-400" : "text-slate-800")
                      }
                      {customAdditions.map(r => slipRow(r.label, r.val, "text-emerald-700"))}
                      <div className="mt-2 flex justify-between rounded-xl bg-slate-50 px-3 py-2">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Subtotal pendapatan</span>
                        <span className="font-black tabular-nums text-slate-900">{formatIDR(pendapatan)}</span>
                      </div>
                    </div>
                  )}

                  {!payrollModalEditMode && (
                    <div className="space-y-1">
                      <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-slate-400">B. Potongan</p>
                      {slipRow("Potongan BPJS", -cfg.bpjsDeduction, "text-rose-700")}
                      {customDeductions.map(r => slipRow(r.label, r.val, "text-rose-700"))}
                      <div className="mt-2 flex justify-between rounded-xl bg-rose-50 px-3 py-2">
                        <span className="text-[9px] font-black uppercase tracking-widest text-rose-700">Subtotal potongan</span>
                        <span className="font-black tabular-nums text-rose-800">{formatIDR(-totalPotongan)}</span>
                      </div>
                    </div>
                  )}

                  {!payrollModalEditMode && (
                    <div className="space-y-1">
                      <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-slate-400">C. Bonus &amp; Penyesuaian</p>
                      {slipRow("Bonus KPI (auto)",    kpiBonus,     "text-indigo-700")}
                      {slipRow("Produk fokus (auto)", productBonus, "text-emerald-700")}
                      {slipRow("Penyesuaian bonus",   adjustment,   adjustment < 0 ? "text-rose-700" : "text-slate-800")}
                      <div className="mt-2 flex justify-between rounded-xl bg-indigo-50 px-3 py-2">
                        <span className="text-[9px] font-black uppercase tracking-widest text-indigo-700">Subtotal bonus</span>
                        <span className="font-black tabular-nums text-indigo-900">{formatIDR(totalBonus)}</span>
                      </div>
                    </div>
                  )}

                  {/* THP Bersih */}
                  {!payrollModalEditMode && (
                    <div className="rounded-2xl bg-gradient-to-br from-sky-600 to-sky-800 px-5 py-4 text-white">
                      <div className="flex items-center gap-2">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-sky-100/90">THP Bersih Estimasi</p>
                        <InfoTooltip
                          side="top"
                          width="w-72"
                          content={<>Estimasi take-home pay = <strong>A (Pendapatan)</strong> − <strong>B (Potongan BPJS + kustom)</strong> + <strong>C (Bonus)</strong>. Bersifat estimasi MTD — angka final ditentukan setelah bulan berakhir dan rapor dipublish.</>}
                        />
                      </div>
                      <p className="mt-1 text-3xl font-black tabular-nums">{formatIDR(thpBersih)}</p>
                      <p className="mt-1 text-[9px] font-medium text-sky-200/80">A (Pendapatan) − B (Potongan) + C (Bonus)</p>
                    </div>
                  )}

                  {/* Penilaian final */}
                  {!payrollModalEditMode && (analystScore != null || analystAdj !== 0 || (analystFeedback && String(analystFeedback).trim())) && (
                    <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
                      <p className="mb-3 text-[9px] font-black uppercase tracking-widest text-violet-800">Penilaian Final Auditor</p>
                      <div className="grid grid-cols-3 gap-3 text-[11px]">
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Skor</p>
                          <p className="mt-0.5 font-black text-slate-900">{analystScore != null ? `${analystScore}/100` : "—"}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Penyesuaian</p>
                          <p className={`mt-0.5 font-black tabular-nums ${analystAdj < 0 ? "text-rose-700" : analystAdj > 0 ? "text-emerald-700" : "text-slate-400"}`}>
                            {analystAdj !== 0 ? formatIDR(analystAdj) : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Catatan</p>
                          <p className="mt-0.5 font-medium text-slate-700 leading-snug">
                            {analystFeedback && String(analystFeedback).trim() ? String(analystFeedback).trim() : "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Save choice dialog */}
                  {payrollSaveChoiceOpen && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                      <p className="text-[10px] font-black text-amber-800">Terapkan perubahan konfigurasi ke:</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={saveBulanIni}
                          className="flex flex-col items-start rounded-xl border border-amber-300 bg-white p-3 text-left hover:border-amber-500 hover:bg-amber-50 transition-colors"
                        >
                          <p className="text-[10px] font-black text-amber-900">Bulan ini saja</p>
                          <p className="mt-0.5 text-[9px] font-medium text-slate-500">Hanya berlaku untuk periode {String(month).padStart(2,"0")}/{year}. Konfigurasi default tidak berubah.</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            toast.error("Ubah konfigurasi default di halaman Setup Gaji.");
                            setPayrollSaveChoiceOpen(false);
                          }}
                          className="flex flex-col items-start rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-slate-300 hover:bg-slate-50 transition-colors"
                        >
                          <p className="text-[10px] font-black text-slate-700">Jadikan konfigurasi default</p>
                          <p className="mt-0.5 text-[9px] font-medium text-slate-500">Ubah di halaman Setup Gaji untuk berlaku ke semua bulan berikutnya.</p>
                        </button>
                      </div>
                      <button type="button" onClick={() => setPayrollSaveChoiceOpen(false)} className="text-[9px] font-bold text-slate-400 hover:text-slate-600">
                        Batal
                      </button>
                    </div>
                  )}

                </div>
              </div>

              {/* Footer actions */}
              <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
                {payrollModalEditMode ? (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setPayrollModalEditMode(false); setPayrollSaveChoiceOpen(false); }}
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayrollSaveChoiceOpen(true)}
                      className="flex-1 rounded-xl bg-amber-500 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-600 transition-colors"
                    >
                      Simpan
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Tutup
                    </button>
                    <button
                      type="button"
                      onClick={startEdit}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-indigo-700 transition-colors"
                    >
                      ✏️ Edit Konfigurasi
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>,
          document.body,
        );
      })()}

    </div>
  );
}
