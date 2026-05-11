"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { GlassCard } from "@/components/shared/glass-card";
import { 
  ArrowLeft, TrendingUp, 
  ClipboardCheck, CheckCircle2,
  Calendar, Target,
  Calculator, User, Users, Wallet, Receipt,
  Loader2, X, MessageSquare, Star, Camera, FileText
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { finalizeAuditAction, reopenApprovedAuditAsGlobalAdminAction, upsertMonthlyAddonAppraisalAction } from "./actions";
import { toast } from "sonner";
import { getAuditStatusBadgeClass, getAuditStatusLabel } from "@/lib/labels";

const ADDON_KEY_ABSENSI = "absensi_shift";
const ADDON_KEY_REVIEW_INTERNAL = "review_internal";
const ADDON_KEY_REVIEW_PELANGGAN = "review_pelanggan";

function customerReviewTaggedUserId(r: any): string {
  return String(r.user_id ?? r.tagged_user_id ?? "").trim();
}

/** Teks ulasan: kolom di customer_riview_logs biasanya review_text; fallback comment. */
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

/** Net dari payroll_configs.custom_adjustments (JSON: addition / deduction). */
function netFromCustomAdjustments(raw: unknown): number {
  let net = 0;
  for (const o of parseCustomAdjustmentsArray(raw)) {
    const amt = Math.abs(Number(o.amount ?? 0));
    const type = String(o.type ?? "addition").toLowerCase();
    if (type === "deduction") net -= amt;
    else net += amt;
  }
  return net;
}

/** Satu baris per item untuk tabel payroll (nilai bertanda: + tambahan, − pengurangan). */
function customAdjustmentTableRows(raw: unknown): { key: string; label: string; val: number; tone: string }[] {
  return parseCustomAdjustmentsArray(raw).map((o, idx) => {
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

/**
 * Bonus KPI dari `kpi_configs.bonus_config`: capaian komposit berbobot (omzet, optional ATV/ATU)
 * harus ≥ 100% baru bonus dihitung — flat nominal atau kelipatan kelebihan omzet vs target individu.
 */
function computeKpiBonusFromConfig(
  u: { id: string; omzet: number; transactions: number; items: number },
  kpi: any,
  crewCount: number,
): { kpiBonus: number; kpiAchievement: number; targetAssigned: number } {
  if (!kpi) {
    return { kpiBonus: 0, kpiAchievement: 0, targetAssigned: 0 };
  }
  const omzet = Number(u.omzet || 0);
  const transactions = Number(u.transactions || 0);
  const items = Number(u.items || 0);
  const atv = transactions > 0 ? omzet / transactions : 0;
  const atu = transactions > 0 ? items / transactions : 0;

  const bonusConfig = kpi.bonus_config || {};
  const targetDistribution = bonusConfig.target_distribution || "rata";
  const userConfigs = bonusConfig.user_configs || {};
  const globalTargetOmzet = Number(kpi.target_omzet || 0);
  const globalTargetAtv = Number(kpi.target_atv || 0);
  const globalTargetAtu = Number(kpi.target_atu || 0);

  const targetOmzetPerson =
    targetDistribution === "manual"
      ? Number(userConfigs?.[u.id]?.targetOmzet || 0)
      : globalTargetOmzet / crewCount;
  const targetAtvPerson =
    targetDistribution === "manual"
      ? Number(userConfigs?.[u.id]?.targetAtv || 0)
      : globalTargetAtv / crewCount;
  const targetAtuPerson =
    targetDistribution === "manual"
      ? Number(userConfigs?.[u.id]?.targetAtu || 0)
      : globalTargetAtu / crewCount;

  const isAtv = bonusConfig.is_atv_enabled === true;
  const isAtu = bonusConfig.is_atu_enabled === true;
  const bonusDistribution = bonusConfig.bonus_distribution || "global";

  let wO = 100;
  let wA = 0;
  let wU = 0;
  let bonusType = "flat";
  let flatNominal = 0;
  let kelipatanStep = 0;
  let kelipatanReward = 0;

  if (bonusDistribution === "global") {
    wO = Number(bonusConfig.weight_omzet ?? 100);
    wA = isAtv ? Number(bonusConfig.weight_atv ?? 0) : 0;
    wU = isAtu ? Number(bonusConfig.weight_atu ?? 0) : 0;
    bonusType = bonusConfig.bonus_type === "kelipatan" ? "kelipatan" : "flat";
    flatNominal = Number(bonusConfig.flat_nominal ?? 0);
    kelipatanStep = Number(bonusConfig.kelipatan_step ?? 0);
    kelipatanReward = Number(bonusConfig.kelipatan_reward ?? 0);
  } else {
    const ucs = userConfigs?.[u.id] || {};
    wO = Number(ucs.weightOmzet ?? 100);
    wA = isAtv ? Number(ucs.weightAtv ?? 0) : 0;
    wU = isAtu ? Number(ucs.weightAtu ?? 0) : 0;
    bonusType = ucs.bonusType === "kelipatan" ? "kelipatan" : "flat";
    flatNominal = Number(ucs.flatNominal ?? 0);
    kelipatanStep = Number(ucs.kelipatanStep ?? 0);
    kelipatanReward = Number(ucs.kelipatanReward ?? 0);
  }

  const wSum = wO + wA + wU;
  if (wSum <= 0) {
    return { kpiBonus: 0, kpiAchievement: 0, targetAssigned: targetOmzetPerson };
  }
  const nO = wO / wSum;
  const nA = wA / wSum;
  const nU = wU / wSum;

  const rO = nO <= 0 ? 1 : targetOmzetPerson > 0 ? omzet / targetOmzetPerson : 0;
  const rA = nA <= 0 ? 1 : !isAtv ? 1 : targetAtvPerson > 0 ? atv / targetAtvPerson : 0;
  const rU = nU <= 0 ? 1 : !isAtu ? 1 : targetAtuPerson > 0 ? atu / targetAtuPerson : 0;

  const composite = nO * rO + nA * rA + nU * rU;
  const kpiAchievement = composite * 100;
  const eligible = composite >= 1;

  let kpiBonus = 0;
  if (eligible) {
    if (bonusType === "flat") {
      kpiBonus = flatNominal;
    } else {
      const excess = Math.max(0, omzet - targetOmzetPerson);
      kpiBonus = kelipatanStep > 0 ? Math.floor(excess / kelipatanStep) * kelipatanReward : 0;
    }
  }

  return {
    kpiBonus,
    kpiAchievement,
    targetAssigned: targetOmzetPerson,
  };
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

export function AuditDetailClient({ 
  branch, kpi, achievements, crewAchievements, audit, isGlobalSuperAdmin = false, crewAudits, payrollConfigs, productFokusConfigs, internalReviews, customerReviews, addons, month, year, selectedDate, approvedProductRows, attendanceLogs = [], leaveRequestsApproved = [], monthlyAddonAppraisals = [], activeCrewCount = 0
}: { 
  branch: any, kpi: any, achievements: any[], crewAchievements: any[], audit: any, isGlobalSuperAdmin?: boolean, crewAudits: any[], payrollConfigs: any[], productFokusConfigs: any[], internalReviews: any[], customerReviews: any[], addons: any[], month: number, year: number, selectedDate: string, approvedProductRows: any[], attendanceLogs?: any[], leaveRequestsApproved?: any[], monthlyAddonAppraisals?: any[], activeCrewCount?: number
}) {
  const [activeTab, setActiveTab] = useState("ringkasan");
  const [selectedDateKey, setSelectedDateKey] = useState(selectedDate);
  const [leaderboardSortBy, setLeaderboardSortBy] = useState<"sales" | "atv" | "atu">("sales");
  const [kpiDetailTab, setKpiDetailTab] = useState<"mtd" | "daily" | "payroll">("mtd");
  const [isMounted, setIsMounted] = useState(false);
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

  const router = useRouter();

  useEffect(() => {
    setIsMounted(true);
  }, []);

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
  const todayKey = today.toISOString().slice(0, 10);
  const clampedSelectedDate =
    selectedDateKey < monthStartKey
      ? monthStartKey
      : selectedDateKey > monthEndKey
        ? monthEndKey
        : selectedDateKey;
  const effectiveEndDateKey =
    isCurrentMonth && clampedSelectedDate > todayKey ? todayKey : clampedSelectedDate;
  const scopedAchievements = achievements.filter((row) => {
    const key = String(row.achievement_date ?? "").slice(0, 10);
    if (key < monthStartKey || key > monthEndKey) return false;
    if (!isCurrentMonth) return true;
    return key <= effectiveEndDateKey;
  });
  const dailyAchievement = achievements.find(
    (row) => String(row.achievement_date ?? "").slice(0, 10) === clampedSelectedDate,
  );
  const dailyOmzet = Number(dailyAchievement?.total_omzet ?? 0);

  const accumulatedOmzet = scopedAchievements.reduce((acc, curr) => acc + Number(curr.total_omzet), 0);
  const totalTransactions = scopedAchievements.reduce((acc, curr) => acc + Number(curr.total_transactions), 0);
  const totalItems = scopedAchievements.reduce((acc, curr) => acc + Number(curr.total_items), 0);
  const totalRejected = scopedAchievements.reduce((acc, curr) => acc + Number(curr.rejected_count), 0);
  const totalRejectedOmzet = scopedAchievements.reduce((acc, curr) => acc + Number(curr.rejected_omzet_est), 0);

  const targetOmzet = kpi?.target_omzet || 0;
  const achievementPercent = targetOmzet > 0 ? (accumulatedOmzet / targetOmzet) * 100 : 0;
  const dailyTarget = targetOmzet > 0 ? targetOmzet / totalDaysInMonth : 0;
  const dailyAchievementPercent = dailyTarget > 0 ? (dailyOmzet / dailyTarget) * 100 : 0;

  const atv = totalTransactions > 0 ? accumulatedOmzet / totalTransactions : 0;
  const atu = totalTransactions > 0 ? totalItems / totalTransactions : 0;

  const scopedCrewAchievements = crewAchievements.filter((row) => {
    const key = String(row.achievement_date ?? "").slice(0, 10);
    if (key < monthStartKey || key > monthEndKey) return false;
    if (!isCurrentMonth) return true;
    return key <= effectiveEndDateKey;
  });

  // --- INDIVIDUAL STATS & BONUS ---
  const getUserStats = () => {
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

    return Object.values(stats).map((u: any) => {
      const crewCount = Math.max(activeCrewCount, Object.keys(stats).length, 1);
      const { kpiBonus, kpiAchievement, targetAssigned } = computeKpiBonusFromConfig(
        u,
        kpi,
        crewCount,
      );

      const baseSalary = Number(u.config?.base_salary || 0);

      const posAllowance = Number(u.config?.position_allowance || 0);
      const mealAllowance = Number(u.config?.meal_allowance || 0);
      const transAllowance = Number(u.config?.transport_allowance || 0);
      const bpjsDeduction = Number(u.config?.bpjs_deduction || 0);
      
      const productBonus = 0; // Implementation pipeline pending
      const adjustment = Number(u.audit?.bba_adjustment || 0);
      const payrollCustomNet = netFromCustomAdjustments(u.config?.custom_adjustments);

      const thp =
        baseSalary +
        posAllowance +
        mealAllowance +
        transAllowance -
        bpjsDeduction +
        kpiBonus +
        productBonus +
        adjustment +
        payrollCustomNet;

      return {
        ...u,
        targetAssigned,
        atv: u.transactions > 0 ? u.omzet / u.transactions : 0,
        atu: u.transactions > 0 ? u.items / u.transactions : 0,
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
        thp
      };
    });
  };

  const userStats = getUserStats();
  const userStatsSortedByName = [...userStats].sort((a: any, b: any) =>
    String(a.name || "").localeCompare(String(b.name || ""), "id", { sensitivity: "base" }),
  );
  const [selectedUserId, setSelectedUserId] = useState<string>(userStatsSortedByName[0]?.id ?? "");
  useEffect(() => {
    if (!selectedUserId && userStatsSortedByName[0]?.id) {
      setSelectedUserId(userStatsSortedByName[0].id);
      return;
    }
    if (selectedUserId && !userStatsSortedByName.some((u: any) => u.id === selectedUserId)) {
      setSelectedUserId(userStatsSortedByName[0]?.id ?? "");
    }
  }, [selectedUserId, userStatsSortedByName]);

  useEffect(() => {
    setAbsensiAddonModalOpen(false);
    setInternalReviewAddonModalOpen(false);
    setCustomerReviewAddonModalOpen(false);
  }, [selectedUserId]);

  useEffect(() => {
    if (!absensiAddonModalOpen || !selectedUserId) return;
    const row = (monthlyAddonAppraisals ?? []).find(
      (r: any) => String(r.crew_user_id) === String(selectedUserId) && r.addon_key === ADDON_KEY_ABSENSI,
    );
    const sc = row?.score_manual;
    if (sc != null && sc !== "" && !Number.isNaN(Number(sc))) {
      const n = Math.min(100, Math.max(0, Math.round(Number(sc))));
      setAbsensiScoreDraft(String(n));
    } else {
      setAbsensiScoreDraft("");
    }
    const nom = Number(row?.nominal_manual ?? 0);
    if (Number.isFinite(nom) && nom !== 0) {
      setAbsensiBonusDirection(nom > 0 ? "add" : "subtract");
      setAbsensiNominalDraft(formatThousandsDotFromDigits(String(Math.abs(Math.round(nom)))));
    } else {
      setAbsensiBonusDirection(null);
      setAbsensiNominalDraft("");
    }
    setAbsensiNotesDraft(typeof row?.notes === "string" ? row.notes : "");
  }, [absensiAddonModalOpen, selectedUserId, monthlyAddonAppraisals]);

  useEffect(() => {
    if (!internalReviewAddonModalOpen || !selectedUserId) return;
    const row = (monthlyAddonAppraisals ?? []).find(
      (r: any) => String(r.crew_user_id) === String(selectedUserId) && r.addon_key === ADDON_KEY_REVIEW_INTERNAL,
    );
    const sc = row?.score_manual;
    if (sc != null && sc !== "" && !Number.isNaN(Number(sc))) {
      const n = Math.min(100, Math.max(0, Math.round(Number(sc))));
      setInternalScoreDraft(String(n));
    } else {
      setInternalScoreDraft("");
    }
    const nom = Number(row?.nominal_manual ?? 0);
    if (Number.isFinite(nom) && nom !== 0) {
      setInternalBonusDirection(nom > 0 ? "add" : "subtract");
      setInternalNominalDraft(formatThousandsDotFromDigits(String(Math.abs(Math.round(nom)))));
    } else {
      setInternalBonusDirection(null);
      setInternalNominalDraft("");
    }
    setInternalNotesDraft(typeof row?.notes === "string" ? row.notes : "");
  }, [internalReviewAddonModalOpen, selectedUserId, monthlyAddonAppraisals]);

  useEffect(() => {
    if (!customerReviewAddonModalOpen || !selectedUserId) return;
    const row = (monthlyAddonAppraisals ?? []).find(
      (r: any) => String(r.crew_user_id) === String(selectedUserId) && r.addon_key === ADDON_KEY_REVIEW_PELANGGAN,
    );
    const sc = row?.score_manual;
    if (sc != null && sc !== "" && !Number.isNaN(Number(sc))) {
      const n = Math.min(100, Math.max(0, Math.round(Number(sc))));
      setCustomerScoreDraft(String(n));
    } else {
      setCustomerScoreDraft("");
    }
    const nom = Number(row?.nominal_manual ?? 0);
    if (Number.isFinite(nom) && nom !== 0) {
      setCustomerBonusDirection(nom > 0 ? "add" : "subtract");
      setCustomerNominalDraft(formatThousandsDotFromDigits(String(Math.abs(Math.round(nom)))));
    } else {
      setCustomerBonusDirection(null);
      setCustomerNominalDraft("");
    }
    setCustomerNotesDraft(typeof row?.notes === "string" ? row.notes : "");
  }, [customerReviewAddonModalOpen, selectedUserId, monthlyAddonAppraisals]);

  const selectedUser =
    userStatsSortedByName.find((u: any) => String(u.id) === String(selectedUserId)) ??
    userStatsSortedByName[0] ??
    null;
  const fullMonthOmzet = achievements.reduce((acc, curr) => acc + Number(curr.total_omzet), 0);
  const selectedContributionPct =
    selectedUser && fullMonthOmzet > 0 ? (Number(selectedUser.omzet || 0) / fullMonthOmzet) * 100 : 0;
  const selectedDailyPoints = achievements.map((d: any) => {
    const dayKey = String(d.achievement_date ?? "").slice(8, 10);
    const totalForUser = scopedCrewAchievements
      .filter((r: any) => String(r.user_id) === String(selectedUser?.id || ""))
      .filter((r: any) => String(r.achievement_date ?? "").slice(0, 10) === String(d.achievement_date ?? "").slice(0, 10))
      .reduce((acc: number, r: any) => acc + Number(r.omzet || 0), 0);
    return { x: dayKey, y: totalForUser };
  });
  const selectedMaxPoint = Math.max(1, ...selectedDailyPoints.map((p: any) => p.y));
  const selectedProductRows = (approvedProductRows ?? []).filter((row: any) => {
    const submission = Array.isArray(row.submission) ? row.submission[0] : row.submission;
    const uid = String(submission?.user_id ?? "");
    const dateKey = String(submission?.submission_date ?? "").slice(0, 10);
    if (!selectedUser?.id || uid !== String(selectedUser.id)) return false;
    if (!dateKey) return false;
    if (!isCurrentMonth) return dateKey >= monthStartKey && dateKey <= monthEndKey;
    return dateKey >= monthStartKey && dateKey <= effectiveEndDateKey;
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
  const selectedAbsensiAddonRow = (monthlyAddonAppraisals ?? []).find(
    (r: any) => String(r.crew_user_id) === String(selectedUser?.id) && r.addon_key === ADDON_KEY_ABSENSI,
  );
  const selectedInternalAddonRow = (monthlyAddonAppraisals ?? []).find(
    (r: any) => String(r.crew_user_id) === String(selectedUser?.id) && r.addon_key === ADDON_KEY_REVIEW_INTERNAL,
  );
  const selectedCustomerAddonRow = (monthlyAddonAppraisals ?? []).find(
    (r: any) => String(r.crew_user_id) === String(selectedUser?.id) && r.addon_key === ADDON_KEY_REVIEW_PELANGGAN,
  );
  const mergedAttendanceForSelected = mergeAttendanceByDay(
    attendanceLogs,
    selectedUser?.id ?? "",
    monthStartKey,
    effectiveEndDateKey,
  );
  const leaveDaysSelected = leaveDaySetForUser(
    leaveRequestsApproved,
    selectedUser?.id ?? "",
    monthStartKey,
    effectiveEndDateKey,
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
    return dk <= effectiveEndDateKey;
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
    return dk <= effectiveEndDateKey;
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
      return key <= effectiveEndDateKey;
    })
    .sort((a: any, b: any) => String(a.achievement_date).localeCompare(String(b.achievement_date)));
  const selectedAvgDailyOmzet =
    dailyDetailRowsForSelected.length > 0
      ? dailyDetailRowsForSelected.reduce((acc: number, r: any) => acc + Number(r.omzet ?? 0), 0) /
        dailyDetailRowsForSelected.length
      : 0;

  const manualAttendanceBonus = Number(selectedAbsensiAddonRow?.nominal_manual ?? 0);
  const manualInternalReviewBonus = Number(selectedInternalAddonRow?.nominal_manual ?? 0);
  const manualCustomerReviewBonus = Number(selectedCustomerAddonRow?.nominal_manual ?? 0);
  const totalManualBonus = manualAttendanceBonus + manualInternalReviewBonus + manualCustomerReviewBonus;

  const payrollVariableBonusEarn = totalAutoProductBonus + totalManualBonus;
  const payrollDasarTakeHome = selectedUser
    ? Number(selectedUser.baseSalary || 0) +
      Number(selectedUser.posAllowance || 0) +
      Number(selectedUser.mealAllowance || 0) +
      Number(selectedUser.transAllowance || 0) -
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
        { key: "tunj-makan", label: "Tunjangan makan", val: Number(selectedUser.mealAllowance || 0), tone: "" },
        { key: "tunj-transport", label: "Tunjangan transport", val: Number(selectedUser.transAllowance || 0), tone: "" },
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
          label: "Bonus KPI omzet",
          val: Number(selectedUser.kpiBonus || 0),
          tone: "text-indigo-700",
        },
        {
          key: "bonus-produk",
          label: "Bonus produk fokus",
          val: totalAutoProductBonus,
          tone: "text-emerald-700",
        },
        {
          key: "bonus-addon",
          label: "Bonus add-on (auditor)",
          val: totalManualBonus,
          tone: "text-emerald-700",
        },
        {
          key: "bba-adj",
          label: "Penyesuaian BBA",
          val: Number(selectedUser.adjustment ?? 0),
          tone: Number(selectedUser.adjustment ?? 0) < 0 ? "text-rose-700" : "text-slate-800",
        },
      ]
    : [];

  const payrollBonusPeriodSubtotal = selectedUser
    ? Number(selectedUser.kpiBonus || 0) + payrollVariableBonusEarn + Number(selectedUser.adjustment || 0)
    : 0;

  const activeAddonAppraisalSummaries = selectedUser
    ? (addons ?? [])
        .filter((a: any) =>
          [ADDON_KEY_ABSENSI, ADDON_KEY_REVIEW_INTERNAL, ADDON_KEY_REVIEW_PELANGGAN].includes(String(a.addon_key)),
        )
        .map((a: any) => {
          const addonKey = String(a.addon_key);
          const row = (monthlyAddonAppraisals ?? []).find(
            (r: any) =>
              String(r.crew_user_id) === String(selectedUser.id) && String(r.addon_key) === addonKey,
          );
          const label =
            addonKey === ADDON_KEY_ABSENSI
              ? "Absensi & shift"
              : addonKey === ADDON_KEY_REVIEW_INTERNAL
                ? "Review internal"
                : addonKey === ADDON_KEY_REVIEW_PELANGGAN
                  ? "Review pelanggan"
                  : addonKey;
          let scoreLabel = "—";
          if (row != null) {
            const sm = row.score_manual;
            if (sm !== null && sm !== undefined && String(sm).trim() !== "") {
              scoreLabel = String(sm);
            }
          }
          const bonusNum = row != null ? Number(row.nominal_manual ?? 0) : 0;
          const notesText =
            row?.notes != null && String(row.notes).trim() !== "" ? String(row.notes).trim() : null;
          const locked = Boolean(row?.is_locked);
          return { addonKey, label, row, scoreLabel, bonusNum, notesText, locked };
        })
    : [];

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
  const addonAbsensiLocked =
    audit?.status === "APPROVED" ||
    Boolean(selectedAbsensiAddonRow?.is_locked) ||
    crewRowLockedForSelected;
  const addonInternalLocked =
    audit?.status === "APPROVED" ||
    Boolean(selectedInternalAddonRow?.is_locked) ||
    crewRowLockedForSelected;
  const addonCustomerLocked =
    audit?.status === "APPROVED" ||
    Boolean(selectedCustomerAddonRow?.is_locked) ||
    crewRowLockedForSelected;

  const status = audit?.status || 'DRAFT';
  const [isPending, startTransition] = useTransition();

  const handleFinalize = () => {
    if (!audit?.id) return;
    if (status === 'APPROVED') {
       toast.error("Audit sudah difinalisasi.");
       return;
    }
    if (!confirm("Setujui audit ini sekarang? Status akan menjadi Approved, data audit dikunci, dan sinkronisasi payroll dijalankan.")) return;
    
    startTransition(async () => {
      const result = await finalizeAuditAction(audit.id);
      if (result.error) toast.error(result.error);
      else {
        toast.success(result.message);
        router.refresh();
      }
    });
  };

  const handleReopenAsGlobalAdmin = () => {
    if (!audit?.id || !isGlobalSuperAdmin) return;
    if (
      !confirm(
        "Buka kembali audit APPROVED? Hanya untuk super admin global. Baris karyawan akan tidak terkunci; rapor payroll yang sudah dipublish tidak diubah otomatis.",
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

  const persistAddonAbsensi = async () => {
    if (!branch?.id || !selectedUser) {
      toast.error("Data cabang atau karyawan tidak ditemukan.");
      return;
    }
    if (addonAbsensiLocked) {
      toast.error("Penilaian terkunci.");
      return;
    }
    let scoreParsed: number | null = null;
    if (absensiScoreDraft.trim() !== "") {
      const n = parseInt(stripToDigits(absensiScoreDraft), 10);
      if (Number.isNaN(n) || n < 0 || n > 100) {
        toast.error("Skor penilaian: isi angka 0–100 atau kosongkan.");
        return;
      }
      scoreParsed = n;
    }
    const amountAbs = parseDotThousandsToPositiveInt(absensiNominalDraft);
    let nominalParsed: number | null = null;
    if (amountAbs > 0) {
      if (absensiBonusDirection === null) {
        toast.error("Pilih dulu penambahan atau pengurangan bonus.");
        return;
      }
      nominalParsed = absensiBonusDirection === "add" ? amountAbs : -amountAbs;
    } else {
      nominalParsed = null;
    }
    setAbsensiSaving(true);
    try {
      const res = await upsertMonthlyAddonAppraisalAction({
        tenantApotekId: branch.id,
        periodMonth: month,
        periodYear: year,
        crewUserId: selectedUser.id,
        addonKey: ADDON_KEY_ABSENSI,
        scoreManual: scoreParsed,
        nominalManual: nominalParsed,
        notes: absensiNotesDraft.trim() === "" ? null : absensiNotesDraft.trim(),
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Penilaian Absensi & Roster disimpan.");
        router.refresh();
      }
    } finally {
      setAbsensiSaving(false);
    }
  };

  const persistAddonInternalReview = async () => {
    if (!branch?.id || !selectedUser) {
      toast.error("Data cabang atau karyawan tidak ditemukan.");
      return;
    }
    if (addonInternalLocked) {
      toast.error("Penilaian terkunci.");
      return;
    }
    let scoreParsed: number | null = null;
    if (internalScoreDraft.trim() !== "") {
      const n = parseInt(stripToDigits(internalScoreDraft), 10);
      if (Number.isNaN(n) || n < 0 || n > 100) {
        toast.error("Skor penilaian: isi angka 0–100 atau kosongkan.");
        return;
      }
      scoreParsed = n;
    }
    const amountAbs = parseDotThousandsToPositiveInt(internalNominalDraft);
    let nominalParsed: number | null = null;
    if (amountAbs > 0) {
      if (internalBonusDirection === null) {
        toast.error("Pilih dulu penambahan atau pengurangan bonus.");
        return;
      }
      nominalParsed = internalBonusDirection === "add" ? amountAbs : -amountAbs;
    } else {
      nominalParsed = null;
    }
    setInternalSaving(true);
    try {
      const res = await upsertMonthlyAddonAppraisalAction({
        tenantApotekId: branch.id,
        periodMonth: month,
        periodYear: year,
        crewUserId: selectedUser.id,
        addonKey: ADDON_KEY_REVIEW_INTERNAL,
        scoreManual: scoreParsed,
        nominalManual: nominalParsed,
        notes: internalNotesDraft.trim() === "" ? null : internalNotesDraft.trim(),
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Penilaian Review Internal disimpan.");
        router.refresh();
      }
    } finally {
      setInternalSaving(false);
    }
  };

  const persistAddonCustomerReview = async () => {
    if (!branch?.id || !selectedUser) {
      toast.error("Data cabang atau karyawan tidak ditemukan.");
      return;
    }
    if (addonCustomerLocked) {
      toast.error("Penilaian terkunci.");
      return;
    }
    let scoreParsed: number | null = null;
    if (customerScoreDraft.trim() !== "") {
      const n = parseInt(stripToDigits(customerScoreDraft), 10);
      if (Number.isNaN(n) || n < 0 || n > 100) {
        toast.error("Skor penilaian: isi angka 0–100 atau kosongkan.");
        return;
      }
      scoreParsed = n;
    }
    const amountAbs = parseDotThousandsToPositiveInt(customerNominalDraft);
    let nominalParsed: number | null = null;
    if (amountAbs > 0) {
      if (customerBonusDirection === null) {
        toast.error("Pilih dulu penambahan atau pengurangan bonus.");
        return;
      }
      nominalParsed = customerBonusDirection === "add" ? amountAbs : -amountAbs;
    } else {
      nominalParsed = null;
    }
    setCustomerSaving(true);
    try {
      const res = await upsertMonthlyAddonAppraisalAction({
        tenantApotekId: branch.id,
        periodMonth: month,
        periodYear: year,
        crewUserId: selectedUser.id,
        addonKey: ADDON_KEY_REVIEW_PELANGGAN,
        scoreManual: scoreParsed,
        nominalManual: nominalParsed,
        notes: customerNotesDraft.trim() === "" ? null : customerNotesDraft.trim(),
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Penilaian Review Pelanggan disimpan.");
        router.refresh();
      }
    } finally {
      setCustomerSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* HEADER */}
      <GlassCard className="p-3 md:p-4" variant="light">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 md:gap-x-4">
          <div className="flex min-w-0 items-start gap-2.5 md:gap-3">
            <Link
              href={`/bba/audit?month=${month}&year=${year}`}
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 shadow-sm transition-all hover:bg-white hover:text-emerald-600 md:h-9 md:w-9"
            >
              <ArrowLeft size={15} className="md:w-[17px]" />
            </Link>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-x-2">
                <h1 className="min-w-0 truncate text-base font-black uppercase tracking-tight text-slate-800 md:text-lg" title={branch.name}>
                  {branch.name}
                </h1>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-widest md:px-2.5 md:text-[9px] ${getAuditStatusBadgeClass(
                    status,
                  )}`}
                >
                  {getAuditStatusLabel(status)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[8px] font-bold uppercase tracking-widest text-slate-400 md:text-[9px]">
                Periode audit: Bulan {month} - {year}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-1.5 self-start justify-self-end sm:flex-row sm:items-center sm:gap-2">
            <Link
              href={`/bba/branches/${branch.id}?month=${month}&year=${year}`}
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-100 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-slate-600 shadow-sm transition hover:bg-white md:px-3 md:py-2 md:text-[10px]"
            >
              <Calculator size={12} className="md:h-[13px] md:w-[13px]" /> Edit konfigurasi KPI
            </Link>
            {status !== "APPROVED" && (
              <button
                type="button"
                onClick={handleFinalize}
                disabled={isPending || !audit?.id}
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 md:px-3.5 md:py-2 md:text-[10px]"
              >
                {isPending ? <Loader2 size={12} className="animate-spin md:h-[13px] md:w-[13px]" /> : <CheckCircle2 size={12} className="md:h-[13px] md:w-[13px]" />}
                Setujui audit
              </button>
            )}
            {status === "APPROVED" && isGlobalSuperAdmin && (
              <button
                type="button"
                onClick={handleReopenAsGlobalAdmin}
                disabled={isPending}
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:opacity-50 md:px-3.5 md:py-2 md:text-[10px]"
              >
                {isPending ? <Loader2 size={12} className="animate-spin md:h-[13px] md:w-[13px]" /> : null}
                Buka kembali (global)
              </button>
            )}
          </div>
        </div>
      </GlassCard>

      {/* TABS */}
      <div className="flex gap-2 p-1.5 bg-slate-100/50 rounded-2xl border border-slate-200/50 max-w-full overflow-x-auto custom-scrollbar">
        {[
          { id: 'ringkasan', label: 'Ringkasan & Bonus', icon: ClipboardCheck },
          { id: 'kpi', label: 'Data per Karyawan', icon: Users },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative px-4 md:px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all whitespace-nowrap shrink-0 ${
              activeTab === tab.id ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {activeTab === tab.id && (
              <motion.div layoutId="auditTab" className="absolute inset-0 bg-white shadow-sm border border-emerald-100 rounded-xl" />
            )}
            <span className="relative z-10 flex items-center gap-2">
              <tab.icon size={14} /> {tab.label}
            </span>
          </button>
        ))}
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-10">
        <AnimatePresence mode="wait">
          {activeTab === 'ringkasan' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-10">
              {/* 1. FILTER HARIAN */}
              <GlassCard className="rounded-xl border border-slate-100 bg-white p-2.5 shadow-sm md:rounded-2xl md:p-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <label htmlFor="audit-daily-date" className="flex cursor-pointer items-center gap-2 text-[9px] font-black uppercase tracking-widest text-indigo-600 md:text-[10px]">
                    Tanggal harian
                  </label>
                  <input
                    id="audit-daily-date"
                    type="date"
                    value={clampedSelectedDate}
                    min={monthStartKey}
                    max={monthEndKey}
                    onChange={(e) => setSelectedDateKey(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-800 sm:max-w-[11.5rem] sm:flex-initial md:px-2.5 md:py-1.5 md:text-sm"
                    title="Leaderboard tetap MTD; ini hanya untuk highlight harian."
                  />
                </div>
              </GlassCard>

              {/* 2. HERO SUMMARY */}
              <GlassCard className="p-5 md:p-6 bg-slate-950 border border-slate-800 shadow-xl shadow-slate-900/30 space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr]">
                  <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-600/20 via-slate-900 to-emerald-500/10 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Omzet Harian ({clampedSelectedDate})</p>
                    <p className="mt-2 text-3xl md:text-4xl font-black tracking-tight text-white">{formatIDR(dailyOmzet)}</p>
                    <p className="mt-1 text-xs font-semibold text-emerald-100/90">
                      Target harian: <span className="font-black text-emerald-200">{formatIDR(dailyTarget)}</span>
                    </p>
                    <div className="mt-3 h-2 w-full rounded-full bg-emerald-950/70 border border-emerald-600/30">
                      <div
                        className="h-2 rounded-full bg-emerald-400 transition-all shadow-[0_0_10px_rgba(74,222,128,0.8)]"
                        style={{ width: `${Math.max(0, Math.min(100, dailyAchievementPercent))}%` }}
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-600/20 via-slate-900 to-indigo-500/10 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Capaian Target Harian</p>
                    <p className="mt-2 text-3xl md:text-4xl font-black tracking-tight text-indigo-200">
                      {dailyAchievementPercent.toFixed(1)}%
                    </p>
                    <p className="mt-1 text-xs font-semibold text-indigo-100/90">
                      Gap: <span className="font-black text-white">{formatIDR(dailyOmzet - dailyTarget)}</span>
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Omzet Bulan {String(month).padStart(2, "0")}/{year} {isCurrentMonth ? `(MTD s/d ${effectiveEndDateKey})` : "(Full Month)"}
                  </p>
                  <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total Omzet</p>
                      <p className="text-xl font-black tracking-tight text-white">{formatIDR(accumulatedOmzet)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Target Total</p>
                      <p className="text-xl font-black tracking-tight text-white">{formatIDR(targetOmzet)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Pencapaian</p>
                      <p className="text-xl font-black tracking-tight text-emerald-300">{achievementPercent.toFixed(1)}%</p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 w-full rounded-full bg-slate-800 border border-slate-700">
                    <div
                      className="h-2 rounded-full bg-indigo-400 transition-all shadow-[0_0_10px_rgba(129,140,248,0.8)]"
                      style={{ width: `${Math.max(0, Math.min(100, achievementPercent))}%` }}
                    />
                  </div>
                </div>
              </GlassCard>

              {/* 3. METRICS FLOW (NON-CARD) */}
              <GlassCard className="p-4 md:p-5 bg-slate-900 border border-slate-800 shadow-xl shadow-slate-900/20">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Basis Transaksi (MTD)</p>
                    <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="flex items-start justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs font-semibold text-slate-300">Total Nota</span>
                        <span className="text-base font-black text-white">{formatNumber(totalTransactions)}</span>
                      </div>
                      <div className="flex items-start justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs font-semibold text-slate-300">Total Produk Terjual</span>
                        <span className="text-base font-black text-white">{formatNumber(totalItems)}</span>
                      </div>
                      <div className="flex items-start justify-between">
                        <span className="text-xs font-semibold text-slate-300">ATV (Omzet / Nota)</span>
                        <span className="text-base font-black text-indigo-300">{formatIDR(atv)}</span>
                      </div>
                      <div className="flex items-start justify-between">
                        <span className="text-xs font-semibold text-slate-300">ATU (Produk / Nota)</span>
                        <span className="text-base font-black text-indigo-300">{atu.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-rose-900/40 bg-rose-950/20 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-rose-300">Risiko Penolakan (MTD)</p>
                    <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="flex items-start justify-between border-b border-rose-900/30 pb-2">
                        <span className="text-xs font-semibold text-rose-100">Jumlah Pelanggan Tertolak</span>
                        <span className="text-base font-black text-white">{formatNumber(totalRejected)}</span>
                      </div>
                      <div className="flex items-start justify-between border-b border-rose-900/30 pb-2">
                        <span className="text-xs font-semibold text-rose-100">Perkiraan Omzet Tertolak</span>
                        <span className="text-base font-black text-rose-300">{formatIDR(totalRejectedOmzet)}</span>
                      </div>
                      <p className="md:col-span-2 text-[11px] font-semibold text-rose-100/80">
                        Rumus: <span className="font-black text-rose-200">Pelanggan tertolak × ATV</span>
                      </p>
                    </div>
                  </div>
                </div>
              </GlassCard>

              {/* 4. LEADERBOARD TABLE */}
              <GlassCard className="p-4 md:p-5 bg-white border border-slate-100 shadow-sm">
                <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Leaderboard MTD</h3>
                    <p className="text-[11px] font-semibold text-slate-500">
                      Default sort by sales. Bonus sementara placeholder.
                    </p>
                  </div>
                  <label className="text-xs font-bold text-slate-600">
                    Sort by
                    <select
                      value={leaderboardSortBy}
                      onChange={(e) => setLeaderboardSortBy(e.target.value as "sales" | "atv" | "atu")}
                      className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                    >
                      <option value="sales">Peringkat penjualan</option>
                      <option value="atv">Rank by ATV</option>
                      <option value="atu">Rank by ATU</option>
                    </select>
                  </label>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="min-w-[980px] w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/90">
                        <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Rank</th>
                        <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Nama Karyawan</th>
                        <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Total Nota</th>
                        <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Total Produk</th>
                        <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Total Omzet</th>
                        <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">ATV</th>
                        <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">ATU</th>
                        <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Total Bonus Earn</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {[...userStats]
                        .sort((a: any, b: any) => {
                          if (leaderboardSortBy === "atv") return Number(b.atv) - Number(a.atv);
                          if (leaderboardSortBy === "atu") return Number(b.atu) - Number(a.atu);
                          return Number(b.omzet) - Number(a.omzet);
                        })
                        .map((u: any, idx: number) => (
                          <tr key={u.id} className="border-b border-slate-100 hover:bg-indigo-50/30">
                            <td className="px-3 py-2 font-black text-slate-700">{idx + 1}</td>
                            <td className="px-3 py-2 font-semibold text-slate-800">{u.name}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatNumber(u.transactions)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatNumber(u.items)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatIDR(u.omzet)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatIDR(u.atv)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-700">{u.atu.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-black text-slate-400">-</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {activeTab === 'kpi' && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <GlassCard className="p-4 md:p-5 bg-white border border-slate-100 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Data per karyawan (MTD, harian, payroll &amp; raport)</h3>
                    <p className="text-[11px] font-semibold text-slate-500">
                      Periode otomatis: {isCurrentMonth ? `MTD s/d ${effectiveEndDateKey}` : `Full Month ${String(month).padStart(2, "0")}/${year}`}
                    </p>
                  </div>
                  <label className="text-xs font-bold text-slate-600">
                    Filter Nama Karyawan
                    <select
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      className="mt-1 block min-w-[240px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold"
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

              <GlassCard className="p-4 md:p-5 bg-white border border-slate-100 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Grafik Omzet Harian ({selectedUser?.name || "-"})</p>
                <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
                  <div className="h-44 w-full">
                    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full">
                      <polyline
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth="2.2"
                        points={selectedDailyPoints
                          .map((p: any, idx: number) => `${(idx / Math.max(1, selectedDailyPoints.length - 1)) * 100},${40 - (p.y / selectedMaxPoint) * 36}`)
                          .join(" ")}
                      />
                    </svg>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-semibold text-slate-500">
                    {selectedDailyPoints.map((p: any) => (
                      <span key={`x-${p.x}`}>Tgl {p.x}: {formatIDR(p.y)}</span>
                    ))}
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="p-2 bg-slate-50 border border-slate-100">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setKpiDetailTab("mtd")}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${kpiDetailTab === "mtd" ? "bg-white text-indigo-700 border border-indigo-100" : "text-slate-500"}`}
                  >
                    Bulanan / MTD
                  </button>
                  <button
                    type="button"
                    onClick={() => setKpiDetailTab("daily")}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${kpiDetailTab === "daily" ? "bg-white text-indigo-700 border border-indigo-100" : "text-slate-500"}`}
                  >
                    Rincian Harian
                  </button>
                  <button
                    type="button"
                    onClick={() => setKpiDetailTab("payroll")}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${kpiDetailTab === "payroll" ? "bg-white text-emerald-800 border border-emerald-100" : "text-slate-500"}`}
                  >
                    <Wallet size={14} className="shrink-0" />
                    <FileText size={14} className="shrink-0" />
                    Payroll &amp; Rapor
                  </button>
                </div>
              </GlassCard>

              {kpiDetailTab === "mtd" && (
                <div className="space-y-4">
                  <GlassCard className="overflow-hidden border border-slate-100 bg-white shadow-sm rounded-[2rem]">
                    <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Performa Utama (KPI + Operasional)</p>
                      <div className="flex items-center gap-3">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          {isCurrentMonth ? `Mode MTD` : `Mode Full Month`}
                        </p>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                          Denominator KPI: {Math.max(activeCrewCount, 0)} crew aktif
                        </p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700">
                          Bonus Performa Utama: {formatIDR(selectedUser?.kpiBonus || 0)}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 space-y-4">
                      <div className="rounded-xl border border-slate-100">
                        <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Blok KPI Utama</p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-2 lg:grid-cols-4">
                          <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Omzet</p><p className="text-xl font-black text-slate-900">{formatIDR(selectedUser?.omzet || 0)}</p></div>
                          <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target ({isCurrentMonth ? "MTD" : "Full"})</p><p className="text-xl font-black text-slate-900">{formatIDR(selectedUser?.targetAssigned || 0)}</p></div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">% Capaian KPI</p>
                            <p className="text-xl font-black text-emerald-700">{(selectedUser?.kpiAchievement || 0).toFixed(1)}%</p>
                            <p className="mt-1 text-[9px] font-medium text-slate-500">Komposit berbobot (sesuai Target &amp; KPI); bonus bila ≥ 100%</p>
                          </div>
                          <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Kontribusi Omzet (Full)</p><p className="text-xl font-black text-indigo-700">{selectedContributionPct.toFixed(1)}%</p></div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-100">
                        <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Blok Operasional & Risiko</p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-2 lg:grid-cols-4">
                          <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Nota</p><p className="text-xl font-black text-slate-900">{formatNumber(selectedUser?.transactions || 0)}</p></div>
                          <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Produk</p><p className="text-xl font-black text-slate-900">{formatNumber(selectedUser?.items || 0)}</p></div>
                          <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">ATV</p><p className="text-xl font-black text-slate-900">{formatIDR(selectedUser?.atv || 0)}</p></div>
                          <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">ATU</p><p className="text-xl font-black text-slate-900">{Number(selectedUser?.atu || 0).toFixed(2)}</p></div>
                        </div>
                        <div className="grid grid-cols-1 gap-3 border-t border-slate-100 bg-rose-50/30 px-4 py-3 md:grid-cols-2">
                          <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pelanggan Tertolak</p><p className="text-xl font-black text-rose-700">{formatNumber(totalRejected)}</p></div>
                          <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Perkiraan Omzet Tertolak</p><p className="text-xl font-black text-rose-700">{formatIDR(totalRejected * (selectedUser?.atv || 0))}</p></div>
                        </div>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-4 md:p-5 bg-white border border-slate-100 shadow-sm">
                    <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Produk Fokus (Auto Bonus)</p>
                      <p className="text-xs font-black uppercase tracking-widest text-emerald-700">
                        Bonus Produk Fokus: {formatIDR(totalAutoProductBonus)}
                      </p>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-slate-100">
                      <table className="min-w-[760px] w-full border-collapse text-sm">
                        <thead>
                          <tr className="bg-slate-50/70 border-b border-slate-200">
                            <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Produk Fokus</th>
                            <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Realisasi</th>
                            <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Target</th>
                            <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Pencapaian</th>
                            <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Bonus Earn</th>
                          </tr>
                        </thead>
                        <tbody>
                          {autoProductBonusRows.length > 0 ? autoProductBonusRows.map((r: any) => (
                            <tr key={r.id} className="border-b border-slate-100">
                              <td className="px-3 py-2 font-semibold text-slate-800">{r.productName}</td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatNumber(r.sold)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatNumber(r.targetValue)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-indigo-700">{r.progressPct.toFixed(1)}%</td>
                              <td className="px-3 py-2 text-right font-black text-emerald-700">{formatIDR(r.bonusEarned)}</td>
                            </tr>
                          )) : (
                            <tr>
                              <td colSpan={5} className="px-3 py-5 text-center text-xs font-semibold text-slate-500">
                                Belum ada konfigurasi produk fokus pada periode ini.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-4 md:p-5 bg-white border border-slate-100 shadow-sm">
                    <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Add-on Lain (Manual Bonus)</p>
                      <div className="text-left md:text-right">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Total Bonus Earn</p>
                        <p className="text-base font-black text-emerald-700 tabular-nums">
                          {formatIDR((selectedUser?.kpiBonus || 0) + totalAutoProductBonus + totalManualBonus)}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div
                        className={`rounded-xl border p-3 flex flex-col gap-2 ${
                          addonAbsensiEnabled ? "border-slate-200 bg-slate-50" : "border-slate-100 bg-slate-100/50 opacity-75"
                        }`}
                      >
                        <p className="text-xs font-black text-slate-700">Absensi &amp; Roster</p>
                        {addonAbsensiEnabled ? (
                          <>
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
                            <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 px-2 py-1.5 text-[11px] text-slate-600 space-y-1">
                              <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">Penilaian BBA (sinkron modal)</p>
                              <div className="flex justify-between gap-2">
                                <span className="font-semibold text-slate-500">Skor</span>
                                <span className="font-black text-slate-800">
                                  {selectedAbsensiAddonRow == null ||
                                  selectedAbsensiAddonRow.score_manual === null ||
                                  selectedAbsensiAddonRow.score_manual === ""
                                    ? "—"
                                    : String(selectedAbsensiAddonRow.score_manual)}
                                </span>
                              </div>
                              <div className="flex justify-between gap-2">
                                <span className="font-semibold text-slate-500">Tambah / kurang bonus</span>
                                <span className={`font-black ${manualAttendanceBonus < 0 ? "text-rose-600" : manualAttendanceBonus > 0 ? "text-emerald-700" : "text-slate-500"}`}>
                                  {manualAttendanceBonus === 0 ? "—" : formatIDR(manualAttendanceBonus)}
                                </span>
                              </div>
                              {selectedAbsensiAddonRow?.notes ? (
                                <p className="line-clamp-2 text-[11px] font-medium leading-snug text-slate-600" title={String(selectedAbsensiAddonRow.notes)}>
                                  <span className="font-semibold text-slate-500">Catatan: </span>
                                  {String(selectedAbsensiAddonRow.notes).trim()}
                                </p>
                              ) : (
                                <p className="text-[10px] font-medium text-slate-400 italic">Catatan auditor belum diisi.</p>
                              )}
                            </div>
                            <button
                              type="button"
                              disabled={addonAbsensiLocked || !selectedUser}
                              onClick={() => setAbsensiAddonModalOpen(true)}
                              className="mt-1 rounded-xl bg-indigo-600 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Rincian &amp; penilaian
                            </button>
                            {addonAbsensiLocked ? (
                              <p className="text-[10px] font-semibold text-amber-600">Terkunci untuk perubahan.</p>
                            ) : null}
                          </>
                        ) : (
                          <p className="text-[11px] font-semibold text-slate-500">Addon absensi &amp; shift tidak aktif untuk cabang ini.</p>
                        )}
                      </div>
                      <div
                        className={`rounded-xl border p-3 flex flex-col gap-2 ${
                          addonInternalReviewEnabled
                            ? "border-slate-200 bg-slate-50"
                            : "border-slate-100 bg-slate-100/50 opacity-75"
                        }`}
                      >
                        <p className="text-xs font-black text-slate-700">Review Internal</p>
                        {addonInternalReviewEnabled ? (
                          <>
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
                            <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 px-2 py-1.5 text-[11px] text-slate-600 space-y-1">
                              <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">Penilaian BBA (sinkron modal)</p>
                              <div className="flex justify-between gap-2">
                                <span className="font-semibold text-slate-500">Skor</span>
                                <span className="font-black text-slate-800">
                                  {selectedInternalAddonRow == null ||
                                  selectedInternalAddonRow.score_manual === null ||
                                  selectedInternalAddonRow.score_manual === ""
                                    ? "—"
                                    : String(selectedInternalAddonRow.score_manual)}
                                </span>
                              </div>
                              <div className="flex justify-between gap-2">
                                <span className="font-semibold text-slate-500">Tambah / kurang bonus</span>
                                <span
                                  className={`font-black ${manualInternalReviewBonus < 0 ? "text-rose-600" : manualInternalReviewBonus > 0 ? "text-emerald-700" : "text-slate-500"}`}
                                >
                                  {manualInternalReviewBonus === 0 ? "—" : formatIDR(manualInternalReviewBonus)}
                                </span>
                              </div>
                              {selectedInternalAddonRow?.notes ? (
                                <p className="line-clamp-2 text-[11px] font-medium leading-snug text-slate-600" title={String(selectedInternalAddonRow.notes)}>
                                  <span className="font-semibold text-slate-500">Catatan: </span>
                                  {String(selectedInternalAddonRow.notes).trim()}
                                </p>
                              ) : (
                                <p className="text-[10px] font-medium text-slate-400 italic">Catatan auditor belum diisi.</p>
                              )}
                            </div>
                            <button
                              type="button"
                              disabled={addonInternalLocked || !selectedUser}
                              onClick={() => setInternalReviewAddonModalOpen(true)}
                              className="mt-1 rounded-xl bg-sky-600 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Rincian &amp; penilaian
                            </button>
                            {addonInternalLocked ? (
                              <p className="text-[10px] font-semibold text-amber-600">Terkunci untuk perubahan.</p>
                            ) : null}
                          </>
                        ) : (
                          <p className="text-[11px] font-semibold text-slate-500">Addon review internal tidak aktif untuk cabang ini.</p>
                        )}
                      </div>
                      <div
                        className={`rounded-xl border p-3 flex flex-col gap-2 ${
                          addonCustomerReviewEnabled
                            ? "border-slate-200 bg-slate-50"
                            : "border-slate-100 bg-slate-100/50 opacity-75"
                        }`}
                      >
                        <p className="text-xs font-black text-slate-700">Bonus Review Pelanggan</p>
                        {addonCustomerReviewEnabled ? (
                          <>
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
                            <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 px-2 py-1.5 text-[11px] text-slate-600 space-y-1">
                              <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">Penilaian BBA (sinkron modal)</p>
                              <div className="flex justify-between gap-2">
                                <span className="font-semibold text-slate-500">Skor</span>
                                <span className="font-black text-slate-800">
                                  {selectedCustomerAddonRow == null ||
                                  selectedCustomerAddonRow.score_manual === null ||
                                  selectedCustomerAddonRow.score_manual === ""
                                    ? "—"
                                    : String(selectedCustomerAddonRow.score_manual)}
                                </span>
                              </div>
                              <div className="flex justify-between gap-2">
                                <span className="font-semibold text-slate-500">Tambah / kurang bonus</span>
                                <span
                                  className={`font-black ${manualCustomerReviewBonus < 0 ? "text-rose-600" : manualCustomerReviewBonus > 0 ? "text-emerald-700" : "text-slate-500"}`}
                                >
                                  {manualCustomerReviewBonus === 0 ? "—" : formatIDR(manualCustomerReviewBonus)}
                                </span>
                              </div>
                              {selectedCustomerAddonRow?.notes ? (
                                <p className="line-clamp-2 text-[11px] font-medium leading-snug text-slate-600" title={String(selectedCustomerAddonRow.notes)}>
                                  <span className="font-semibold text-slate-500">Catatan: </span>
                                  {String(selectedCustomerAddonRow.notes).trim()}
                                </p>
                              ) : (
                                <p className="text-[10px] font-medium text-slate-400 italic">Catatan auditor belum diisi.</p>
                              )}
                            </div>
                            <button
                              type="button"
                              disabled={addonCustomerLocked || !selectedUser}
                              onClick={() => setCustomerReviewAddonModalOpen(true)}
                              className="mt-1 rounded-xl bg-indigo-600 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Rincian &amp; penilaian
                            </button>
                            {addonCustomerLocked ? (
                              <p className="text-[10px] font-semibold text-amber-600">Terkunci untuk perubahan.</p>
                            ) : null}
                          </>
                        ) : (
                          <p className="text-[11px] font-semibold text-slate-500">Addon review pelanggan tidak aktif untuk cabang ini.</p>
                        )}
                      </div>
                    </div>
                  </GlassCard>
                </div>
              )}

              {kpiDetailTab === "daily" && (
                <GlassCard className="p-4 md:p-5 bg-white border border-slate-100 shadow-sm">
                  <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rincian Harian per Karyawan</p>
                      <p className="text-sm font-black text-slate-800">{selectedUser?.name || "—"}</p>
                    </div>
                    <p className="text-[11px] font-semibold text-slate-500">
                      {isCurrentMonth ? `MTD s/d ${effectiveEndDateKey}` : `Full month ${String(month).padStart(2, "0")}/${year}`}
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
                            ATV
                          </th>
                          <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                            ATU
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
                            return (
                              <tr
                                key={String(row.id ?? dateKey)}
                                className={`border-b border-slate-100 ${isOutlier ? "bg-rose-50/40" : ""}`}
                              >
                                <td className="sticky left-0 z-[1] bg-white px-3 py-2 text-[11px] font-semibold text-slate-800 shadow-[2px_0_8px_-2px_rgba(0,0,0,0.06)]">
                                  {new Date(`${dateKey}T12:00:00`).toLocaleDateString("id-ID", {
                                    weekday: "short",
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                  {isOutlier ? (
                                    <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-rose-700">
                                      Outlier
                                    </span>
                                  ) : null}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatNumber(tx)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatNumber(items)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-slate-800">{formatIDR(omzet)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatIDR(atvRow)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-slate-700">{atuRow.toFixed(2)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-rose-700">{formatNumber(rej)}</td>
                                <td className="px-3 py-2 text-right font-black text-rose-700">{formatIDR(rejOmzet)}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>
              )}

              {kpiDetailTab === "payroll" && (
                <div className="space-y-4">
                  <GlassCard className="overflow-hidden rounded-2xl border-2 border-slate-200/90 bg-white p-0 shadow-xl shadow-slate-300/30">
                    <div
                      className="h-1.5 bg-[repeating-linear-gradient(90deg,rgb(226,232,240)_0px,rgb(226,232,240)_6px,transparent_6px,transparent_12px)]"
                      aria-hidden
                    />

                    <div className="border-b-2 border-dashed border-slate-200 bg-gradient-to-b from-slate-50/95 to-white px-5 py-5 md:px-8 md:py-6">
                      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-lg shadow-sky-700/25">
                            <Receipt size={22} strokeWidth={2.25} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                              Slip gaji perkiraan
                            </p>
                            <h3 className="mt-1 text-lg font-black tracking-tight text-slate-900 md:text-xl">
                              Ringkasan pembayaran
                            </h3>
                            <p className="mt-1.5 max-w-md text-[11px] font-medium leading-relaxed text-slate-500">
                              Dasar dari Setup Payroll; lalu bonus dan penyesuaian menurut capaian periode audit.
                            </p>
                            <p className="mt-1 text-[10px] font-semibold text-amber-700">
                              Ini simulasi UI audit. Data final payroll mengikuti periode yang sudah dipublish.
                            </p>
                          </div>
                        </div>
                        <div className="grid w-full gap-3 rounded-2xl border border-slate-200/90 bg-white/90 px-4 py-3 text-[11px] shadow-sm backdrop-blur-sm sm:w-auto sm:min-w-[200px] sm:text-right">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400">Cabang</span>
                            <span className="mt-0.5 block font-black text-slate-900">{branch?.name ?? "—"}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400">Periode</span>
                            <span className="mt-0.5 block font-black text-slate-900">
                              {String(month).padStart(2, "0")}/{year}
                            </span>
                            {isCurrentMonth ? (
                              <span className="mt-1 block text-[10px] font-semibold text-sky-600">
                                MTD s/d {effectiveEndDateKey}
                              </span>
                            ) : (
                              <span className="mt-1 block text-[10px] font-semibold text-slate-500">
                                Bulan penuh
                              </span>
                            )}
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400">Karyawan</span>
                            <span className="mt-0.5 block font-black text-slate-900">{selectedUser?.name ?? "—"}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-10 px-5 py-7 md:px-8 md:py-9">
                      <section>
                        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
                          <Wallet className="text-sky-600" size={18} aria-hidden />
                          <h4 className="text-[11px] font-black uppercase tracking-widest text-sky-950">
                            A. Dasar — Setup Payroll
                          </h4>
                        </div>
                        <p className="mb-4 text-[10px] font-medium leading-relaxed text-slate-500">
                          Konfigurasi cabang: gaji pokok, tunjangan, penambahan/pengurangan kustom, dan potongan BPJS.
                          Belum termasuk bonus atau penyesuaian audit periode.
                        </p>
                        <div className="space-y-2.5">
                          {payrollSlipDasarRows.map((row) => (
                            <div key={row.key} className="flex items-end gap-2 text-[12px] leading-tight">
                              <span className="min-w-0 shrink font-semibold text-slate-800">{row.label}</span>
                              <span
                                className="mb-[6px] min-h-[1px] min-w-[1rem] flex-1 border-b border-dotted border-slate-300"
                                aria-hidden
                              />
                              <span className={`shrink-0 font-bold tabular-nums ${row.tone || "text-slate-900"}`}>
                                {formatIDR(row.val)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-5 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                              Subtotal THP dasar
                            </p>
                            <p className="text-[10px] font-medium text-slate-500">Setara ringkasan di menu Setup Payroll</p>
                          </div>
                          <p className="text-right text-xl font-black tabular-nums text-slate-900 md:text-2xl">
                            {formatIDR(payrollDasarTakeHome)}
                          </p>
                        </div>
                      </section>

                      <section>
                        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
                          <TrendingUp className="text-indigo-600" size={18} aria-hidden />
                          <h4 className="text-[11px] font-black uppercase tracking-widest text-indigo-950">
                            B. Bonus dan penyesuaian periode
                          </h4>
                        </div>
                        <p className="mb-4 text-[10px] font-medium leading-relaxed text-slate-500">
                          Bonus KPI memakai konfigurasi Target &amp; KPI (flat / kelipatan) setelah capaian komposit (omzet dan
                          ATV/ATU jika aktif) ≥ 100%. Ditambah produk fokus, add-on auditor, dan penyesuaian BBA.
                        </p>
                        <div className="space-y-2.5">
                          {payrollSlipBonusRows.map((row) => (
                            <div key={row.key} className="flex items-end gap-2 text-[12px] leading-tight">
                              <span className="min-w-0 shrink font-semibold text-slate-800">{row.label}</span>
                              <span
                                className="mb-[6px] min-h-[1px] min-w-[1rem] flex-1 border-b border-dotted border-slate-300"
                                aria-hidden
                              />
                              <span className={`shrink-0 font-bold tabular-nums ${row.tone || "text-slate-900"}`}>
                                {formatIDR(row.val)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-5 flex flex-col gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-[9px] font-black uppercase tracking-widest text-indigo-900">
                            Subtotal bonus dan penyesuaian
                          </p>
                          <p className="text-right text-lg font-black tabular-nums text-indigo-950 md:text-xl">
                            {formatIDR(payrollBonusPeriodSubtotal)}
                          </p>
                        </div>
                      </section>

                      <div className="rounded-2xl bg-gradient-to-r from-sky-700 via-sky-600 to-sky-700 p-[1px] shadow-lg shadow-sky-600/25">
                        <div className="rounded-2xl bg-gradient-to-br from-sky-600 to-sky-900 px-5 py-6 text-white sm:flex sm:items-end sm:justify-between sm:gap-8">
                          <div className="min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-sky-100/95">
                              Perkiraan take home pay (akhir)
                            </p>
                            <p className="mt-2 text-xs font-medium leading-snug text-sky-100/90">
                              Dasar (A) + bonus dan penyesuaian periode (B)
                            </p>
                          </div>
                          <p className="mt-4 text-right text-3xl font-black tabular-nums tracking-tight text-white sm:mt-0 md:text-4xl">
                            {formatIDR(payrollEstimatedTakeHomeSelected)}
                          </p>
                        </div>
                      </div>

                      <p className="text-center text-[9px] font-medium leading-relaxed text-slate-400">
                        Angka bersifat indikatif untuk audit internal; finalisasi keuangan dapat memakai aturan di luar modul ini.
                      </p>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-4 md:p-5 bg-white border border-slate-100 shadow-sm">
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                          <FileText size={22} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ringkasan eksekutif (raport)</p>
                          <p className="text-sm font-black text-slate-800">{selectedUser?.name || "—"}</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            {branch?.name ? `${branch.name} · ` : ""}
                            {isCurrentMonth ? `MTD s/d ${effectiveEndDateKey}` : `Full month ${String(month).padStart(2, "0")}/${year}`}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`inline-flex w-fit shrink-0 items-center rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest ${
                          selectedUser?.audit?.is_locked ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {selectedUser?.audit?.is_locked ? "Baris audit terkunci" : "Baris audit terbuka"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Produktivitas penjualan</p>
                        <p className="mt-1 text-lg font-black text-slate-900">{formatIDR(selectedUser?.omzet ?? 0)}</p>
                        <p className="mt-2 text-[11px] font-semibold text-slate-600">
                          ATV {formatIDR(selectedUser?.atv ?? 0)} · ATU {Number(selectedUser?.atu ?? 0).toFixed(2)} · Nota{" "}
                          {formatNumber(selectedUser?.transactions ?? 0)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                        <p className="text-[9px] font-black uppercase tracking-widest text-indigo-600">Pencapaian KPI (komposit)</p>
                        <p className="mt-1 text-lg font-black text-indigo-900">{(selectedUser?.kpiAchievement ?? 0).toFixed(1)}%</p>
                        <p className="mt-2 text-[11px] font-semibold text-indigo-800/90">
                          Target omzet individu {formatIDR(selectedUser?.targetAssigned ?? 0)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-rose-100 bg-rose-50/35 p-4">
                        <p className="text-[9px] font-black uppercase tracking-widest text-rose-700">Penolakan pelanggan (agregasi harian)</p>
                        <p className="mt-1 text-lg font-black text-rose-900">{formatNumber(raportUserRejectedCount)}</p>
                        <p className="mt-2 text-[11px] font-semibold text-rose-800/90">
                          Perkiraan dampak omzet ± {formatIDR(raportUserRejectedOmzetEst)} (disamakan dengan kolom perkiraan rincian harian).
                        </p>
                      </div>
                    </div>

                    {(productFokusConfigs ?? []).length > 0 ? (
                      <div className="mt-4 rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 to-white p-4">
                        <div className="flex items-start gap-2.5">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                            <Target size={18} aria-hidden />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-900">
                              Pencapaian produk fokus
                            </p>
                            <p className="mt-1 text-[10px] font-medium leading-snug text-slate-600">
                              Realisasi penjualan per produk dari submission disetujui (jendela MTD / bulan penuh sama dengan audit).
                              Besaran bonus pembayaran ada pada slip payroll di atas.
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 space-y-3">
                          {autoProductBonusRows.map((r: any) => (
                            <div
                              key={`raport-pf-${r.id}`}
                              className="rounded-lg border border-emerald-100/90 bg-white/95 px-3 py-2.5 shadow-sm"
                            >
                              <p className="text-[11px] font-black text-slate-900">{r.productName}</p>
                              <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2 text-[10px] font-semibold text-slate-600">
                                <span>
                                  Terjual{" "}
                                  <span className="font-black text-slate-900">{formatNumber(r.sold)}</span>
                                  {" · "}
                                  Target <span className="font-black text-slate-900">{formatNumber(r.targetValue)}</span>
                                  {r.targetType === "item" ? (
                                    <span className="font-medium text-slate-500"> item</span>
                                  ) : (
                                    <span className="font-medium text-slate-500"> (nilai target)</span>
                                  )}
                                </span>
                                <span className="font-black text-emerald-800">{r.progressPct.toFixed(1)}%</span>
                              </div>
                              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-emerald-500"
                                  style={{ width: `${Math.min(100, Number(r.progressPct) || 0)}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {activeAddonAppraisalSummaries.length > 0 ? (
                      <div className="mt-4 rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-white p-4">
                        <p className="text-[9px] font-black uppercase tracking-widest text-violet-800">
                          Penilaian auditor — add-on aktif
                        </p>
                        <p className="mt-1 text-[10px] font-medium text-slate-500">
                          Skor penilaian auditor dan komentar (nominal bonus pembayaran pada slip payroll di atas).
                        </p>
                        <div className="mt-3 space-y-3">
                          {activeAddonAppraisalSummaries.map((addon) => (
                            <div
                              key={`raport-${addon.addonKey}`}
                              className="rounded-lg border border-violet-100/80 bg-white/90 px-3 py-2.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-[11px] font-black text-violet-950">{addon.label}</span>
                                {addon.locked ? (
                                  <span className="text-[8px] font-black uppercase text-amber-700">Terkunci</span>
                                ) : null}
                              </div>
                              <div className="mt-2 text-[11px] text-slate-600">
                                <span className="font-semibold text-slate-400">Skor </span>
                                <span className="font-black text-slate-900">{addon.scoreLabel}</span>
                              </div>
                              {addon.notesText ? (
                                <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] font-medium leading-snug text-slate-700">
                                  <span className="font-bold text-slate-500">Komentar: </span>
                                  {addon.notesText}
                                </p>
                              ) : (
                                <p className="mt-2 text-[10px] font-medium italic text-slate-400">Belum ada komentar auditor.</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </GlassCard>
                </div>
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
                  onClick={() => {
                    setAbsensiAddonModalOpen(false);
                    setPhotoPreviewUrl(null);
                  }}
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
                          Absensi &amp; Roster
                        </h3>
                        <p className="mt-1 truncate text-[11px] font-black uppercase tracking-widest text-slate-500">
                          {selectedUser.name} · {isCurrentMonth ? `MTD s/d ${effectiveEndDateKey}` : `Full ${String(month).padStart(2, "0")}/${year}`}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAbsensiAddonModalOpen(false);
                        setPhotoPreviewUrl(null);
                      }}
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
                                      {row.isLate ? "Terlambat" : "On time"}
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

                  <div className="flex-shrink-0 border-t border-slate-800 bg-slate-900 px-3 py-2 md:px-4 md:py-2.5">
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Penilaian BBA</p>
                      <p className="text-[9px] font-semibold text-slate-600">Skor 0–100 angka saja · nominal per seribu pakai titik</p>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="min-w-[4.5rem] flex-1 shrink-0 text-[10px] font-bold text-slate-400">
                        Skor (0–100)
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={absensiScoreDraft}
                          onChange={(e) => {
                            const d = stripToDigits(e.target.value);
                            if (d === "") {
                              setAbsensiScoreDraft("");
                              return;
                            }
                            let n = parseInt(d, 10);
                            if (Number.isNaN(n)) return;
                            if (n > 100) n = 100;
                            setAbsensiScoreDraft(String(n));
                          }}
                          disabled={addonAbsensiLocked}
                          placeholder="—"
                          className="mt-0.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-bold text-white placeholder:text-slate-600 disabled:opacity-50"
                        />
                      </label>
                      <div className="min-w-[12rem] flex-[1.5] text-[10px] font-bold text-slate-400">
                        <span className="block">Tambah / kurang bonus</span>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            disabled={addonAbsensiLocked}
                            onClick={() => setAbsensiBonusDirection("add")}
                            className={`rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wide transition disabled:opacity-50 ${
                              absensiBonusDirection === "add"
                                ? "bg-emerald-600 text-white"
                                : "border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
                            }`}
                          >
                            + Tambah
                          </button>
                          <button
                            type="button"
                            disabled={addonAbsensiLocked}
                            onClick={() => setAbsensiBonusDirection("subtract")}
                            className={`rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wide transition disabled:opacity-50 ${
                              absensiBonusDirection === "subtract"
                                ? "bg-rose-600 text-white"
                                : "border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
                            }`}
                          >
                            − Kurang
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={absensiNominalDraft}
                            onChange={(e) => {
                              const digits = stripToDigits(e.target.value);
                              const fmt = formatThousandsDotFromDigits(digits);
                              setAbsensiNominalDraft(fmt);
                              if (digits === "") setAbsensiBonusDirection(null);
                            }}
                            disabled={addonAbsensiLocked || absensiBonusDirection === null}
                            placeholder={absensiBonusDirection === null ? "Pilih +/−" : "Nominal"}
                            title="Hanya angka; tampilan ribuan dengan titik (1.000)"
                            className="min-w-[6rem] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-bold text-white placeholder:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </div>
                      </div>
                      <label className="min-w-[140px] flex-[2] text-[10px] font-bold text-slate-400">
                        Catatan
                        <textarea
                          value={absensiNotesDraft}
                          onChange={(e) => setAbsensiNotesDraft(e.target.value)}
                          disabled={addonAbsensiLocked}
                          rows={1}
                          className="mt-0.5 max-h-14 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] font-medium leading-snug text-slate-100 placeholder:text-slate-600 disabled:opacity-50"
                          placeholder="Opsional"
                        />
                      </label>
                      <div className="ml-auto flex shrink-0 gap-1.5 pb-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setAbsensiAddonModalOpen(false);
                            setPhotoPreviewUrl(null);
                          }}
                          className="rounded-lg border border-slate-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-200 hover:bg-slate-800"
                        >
                          Tutup
                        </button>
                        <button
                          type="button"
                          disabled={addonAbsensiLocked || absensiSaving}
                          onClick={() => void persistAddonAbsensi()}
                          className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {absensiSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                          Simpan
                        </button>
                      </div>
                    </div>
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
                  onClick={() => setInternalReviewAddonModalOpen(false)}
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
                        <h3 className="text-lg font-black uppercase tracking-tight text-slate-900 md:text-xl">Review Internal</h3>
                        <p className="mt-1 truncate text-[11px] font-black uppercase tracking-widest text-slate-500">
                          {selectedUser.name} · {isCurrentMonth ? `MTD s/d ${effectiveEndDateKey}` : `Full ${String(month).padStart(2, "0")}/${year}`}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInternalReviewAddonModalOpen(false)}
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

                  <div className="flex-shrink-0 border-t border-slate-800 bg-slate-900 px-3 py-2 md:px-4 md:py-2.5">
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Penilaian BBA</p>
                      <p className="text-[9px] font-semibold text-slate-600">Skor 0–100 angka saja · nominal per seribu pakai titik</p>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="min-w-[4.5rem] flex-1 shrink-0 text-[10px] font-bold text-slate-400">
                        Skor (0–100)
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={internalScoreDraft}
                          onChange={(e) => {
                            const d = stripToDigits(e.target.value);
                            if (d === "") {
                              setInternalScoreDraft("");
                              return;
                            }
                            let n = parseInt(d, 10);
                            if (Number.isNaN(n)) return;
                            if (n > 100) n = 100;
                            setInternalScoreDraft(String(n));
                          }}
                          disabled={addonInternalLocked}
                          placeholder="—"
                          className="mt-0.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-bold text-white placeholder:text-slate-600 disabled:opacity-50"
                        />
                      </label>
                      <div className="min-w-[12rem] flex-[1.5] text-[10px] font-bold text-slate-400">
                        <span className="block">Tambah / kurang bonus</span>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            disabled={addonInternalLocked}
                            onClick={() => setInternalBonusDirection("add")}
                            className={`rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wide transition disabled:opacity-50 ${
                              internalBonusDirection === "add"
                                ? "bg-emerald-600 text-white"
                                : "border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
                            }`}
                          >
                            + Tambah
                          </button>
                          <button
                            type="button"
                            disabled={addonInternalLocked}
                            onClick={() => setInternalBonusDirection("subtract")}
                            className={`rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wide transition disabled:opacity-50 ${
                              internalBonusDirection === "subtract"
                                ? "bg-rose-600 text-white"
                                : "border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
                            }`}
                          >
                            − Kurang
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={internalNominalDraft}
                            onChange={(e) => {
                              const digits = stripToDigits(e.target.value);
                              const fmt = formatThousandsDotFromDigits(digits);
                              setInternalNominalDraft(fmt);
                              if (digits === "") setInternalBonusDirection(null);
                            }}
                            disabled={addonInternalLocked || internalBonusDirection === null}
                            placeholder={internalBonusDirection === null ? "Pilih +/−" : "Nominal"}
                            title="Hanya angka; tampilan ribuan dengan titik (1.000)"
                            className="min-w-[6rem] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-bold text-white placeholder:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </div>
                      </div>
                      <label className="min-w-[140px] flex-[2] text-[10px] font-bold text-slate-400">
                        Catatan
                        <textarea
                          value={internalNotesDraft}
                          onChange={(e) => setInternalNotesDraft(e.target.value)}
                          disabled={addonInternalLocked}
                          rows={1}
                          className="mt-0.5 max-h-14 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] font-medium leading-snug text-slate-100 placeholder:text-slate-600 disabled:opacity-50"
                          placeholder="Opsional"
                        />
                      </label>
                      <div className="ml-auto flex shrink-0 gap-1.5 pb-0.5">
                        <button
                          type="button"
                          onClick={() => setInternalReviewAddonModalOpen(false)}
                          className="rounded-lg border border-slate-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-200 hover:bg-slate-800"
                        >
                          Tutup
                        </button>
                        <button
                          type="button"
                          disabled={addonInternalLocked || internalSaving}
                          onClick={() => void persistAddonInternalReview()}
                          className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {internalSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                          Simpan
                        </button>
                      </div>
                    </div>
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
                  onClick={() => setCustomerReviewAddonModalOpen(false)}
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
                        <h3 className="text-lg font-black uppercase tracking-tight text-slate-900 md:text-xl">Review Pelanggan</h3>
                        <p className="mt-1 truncate text-[11px] font-black uppercase tracking-widest text-slate-500">
                          {selectedUser.name} · {isCurrentMonth ? `MTD s/d ${effectiveEndDateKey}` : `Full ${String(month).padStart(2, "0")}/${year}`}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCustomerReviewAddonModalOpen(false)}
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

                  <div className="flex-shrink-0 border-t border-slate-800 bg-slate-900 px-3 py-2 md:px-4 md:py-2.5">
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Penilaian BBA</p>
                      <p className="text-[9px] font-semibold text-slate-600">Skor 0–100 angka saja · nominal per seribu pakai titik</p>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="min-w-[4.5rem] flex-1 shrink-0 text-[10px] font-bold text-slate-400">
                        Skor (0–100)
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={customerScoreDraft}
                          onChange={(e) => {
                            const d = stripToDigits(e.target.value);
                            if (d === "") {
                              setCustomerScoreDraft("");
                              return;
                            }
                            let n = parseInt(d, 10);
                            if (Number.isNaN(n)) return;
                            if (n > 100) n = 100;
                            setCustomerScoreDraft(String(n));
                          }}
                          disabled={addonCustomerLocked}
                          placeholder="—"
                          className="mt-0.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-bold text-white placeholder:text-slate-600 disabled:opacity-50"
                        />
                      </label>
                      <div className="min-w-[12rem] flex-[1.5] text-[10px] font-bold text-slate-400">
                        <span className="block">Tambah / kurang bonus</span>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            disabled={addonCustomerLocked}
                            onClick={() => setCustomerBonusDirection("add")}
                            className={`rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wide transition disabled:opacity-50 ${
                              customerBonusDirection === "add"
                                ? "bg-emerald-600 text-white"
                                : "border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
                            }`}
                          >
                            + Tambah
                          </button>
                          <button
                            type="button"
                            disabled={addonCustomerLocked}
                            onClick={() => setCustomerBonusDirection("subtract")}
                            className={`rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wide transition disabled:opacity-50 ${
                              customerBonusDirection === "subtract"
                                ? "bg-rose-600 text-white"
                                : "border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
                            }`}
                          >
                            − Kurang
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={customerNominalDraft}
                            onChange={(e) => {
                              const digits = stripToDigits(e.target.value);
                              const fmt = formatThousandsDotFromDigits(digits);
                              setCustomerNominalDraft(fmt);
                              if (digits === "") setCustomerBonusDirection(null);
                            }}
                            disabled={addonCustomerLocked || customerBonusDirection === null}
                            placeholder={customerBonusDirection === null ? "Pilih +/−" : "Nominal"}
                            title="Hanya angka; tampilan ribuan dengan titik (1.000)"
                            className="min-w-[6rem] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-bold text-white placeholder:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </div>
                      </div>
                      <label className="min-w-[140px] flex-[2] text-[10px] font-bold text-slate-400">
                        Catatan
                        <textarea
                          value={customerNotesDraft}
                          onChange={(e) => setCustomerNotesDraft(e.target.value)}
                          disabled={addonCustomerLocked}
                          rows={1}
                          className="mt-0.5 max-h-14 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] font-medium leading-snug text-slate-100 placeholder:text-slate-600 disabled:opacity-50"
                          placeholder="Opsional"
                        />
                      </label>
                      <div className="ml-auto flex shrink-0 gap-1.5 pb-0.5">
                        <button
                          type="button"
                          onClick={() => setCustomerReviewAddonModalOpen(false)}
                          className="rounded-lg border border-slate-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-200 hover:bg-slate-800"
                        >
                          Tutup
                        </button>
                        <button
                          type="button"
                          disabled={addonCustomerLocked || customerSaving}
                          onClick={() => void persistAddonCustomerReview()}
                          className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {customerSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                          Simpan
                        </button>
                      </div>
                    </div>
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
    </div>
  );
}
