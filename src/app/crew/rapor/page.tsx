/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AnimatedPage } from "@/components/shared/animated-page";
import { AlertCircle } from "lucide-react";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
import { CrewRaporClient } from "./crew-rapor-client";
import type { KpiConfigV2 } from "@/lib/types/kpi-v2";
import { calculateMonthlyBonusFromInputs } from "@/lib/kpi-v2/calculator";
import type { DailyAchievementRow, CrewAchievementRow } from "@/lib/kpi-v2/calculator";

export const dynamic = "force-dynamic";

const MONTHS_ID = [
  "", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export default async function CrewRaporPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const reminderWindow = getOperationalReminderWindow();
  const [wibYear, wibMonth] = reminderWindow.dateKey.split("-").map(Number);

  // Validate URL params — clamp to sensible bounds, never allow future dates
  const rawMonth = parseInt(sp.month ?? "");
  const rawYear  = parseInt(sp.year  ?? "");
  let year  = Number.isFinite(rawYear)  && rawYear  >= 2020 ? rawYear  : wibYear!;
  let month = Number.isFinite(rawMonth) && rawMonth >= 1 && rawMonth <= 12 ? rawMonth : wibMonth!;
  if (year > wibYear! || (year === wibYear! && month > wibMonth!)) {
    year  = wibYear!;
    month = wibMonth!;
  }

  const initialTab = sp.tab === "rapor" ? "rapor" : "penilaian";

  const session = await getSessionContext();
  const active  = session?.activeMembership;

  if (!active || active.role !== "crew") {
    return (
      <AnimatedPage className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="h-12 w-12 text-slate-300 mb-4" />
        <p className="text-slate-500">Halaman ini hanya untuk crew.</p>
      </AnimatedPage>
    );
  }

  const supabase      = await createClient();
  const supabaseAdmin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId   = user?.id ?? "";
  const tenantId = active.tenantId;

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const startDate = `${year}-${pad2(month)}-01`;
  const endDate   = `${year}-${pad2(month)}-${new Date(year, month, 0).getDate()}`;

  // Period options — 6 bulan sebelum dan 6 bulan sesudah bulan WIB saat ini (total 13)
  const periodOptions: { month: number; year: number; label: string }[] = [];
  for (let i = -6; i <= 6; i++) {
    const d = new Date(wibYear!, wibMonth! - 1 + i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    periodOptions.push({ month: m, year: y, label: `${MONTHS_ID[m]} ${y}` });
  }

  // Cek addon
  const { data: addons } = await supabase
    .from("addon_settings")
    .select("addon_key, is_enabled")
    .eq("tenant_apotek_id", tenantId)
    .in("addon_key", ["review_internal", "review_pelanggan", "produk_fokus"]);

  const addonReviewInternal  = addons?.find(a => a.addon_key === "review_internal")?.is_enabled  ?? false;
  const addonReviewPelanggan = addons?.find(a => a.addon_key === "review_pelanggan")?.is_enabled ?? false;
  const addonProdukFokus     = addons?.find(a => a.addon_key === "produk_fokus")?.is_enabled      ?? false;

  // Semua query paralel
  const [
    appraisalResult,
    mySnapshotResult,
    peerReviewsResult,
    kpiConfigResult,
    allSubmissionsResult,
    crewMembershipsResult,
    attendanceResult,
    leaveResult,
  ] = await Promise.all([
    // supabaseAdmin: monthly_appraisals RLS tidak expose ke crew, butuh service role
    supabaseAdmin
      .from("monthly_appraisals")
      .select("is_published, published_at, approved_submission_count, approved_omzet_total, auto_bonus_accountability, addon_manual_total, bba_adjustment, calc_breakdown")
      .eq("tenant_apotek_id", tenantId)
      .eq("crew_user_id", userId)
      .eq("period_month", month)
      .eq("period_year", year)
      .maybeSingle(),

    supabase
      .from("leaderboard_snapshots")
      .select("omzet_value, atv_value, atu_value, sarp_percent, late_flag_count")
      .eq("tenant_apotek_id", tenantId)
      .eq("user_id", userId)
      .eq("period_month", month)
      .eq("period_year", year)
      .maybeSingle(),

    supabase
      .from("peer_reviews")
      .select("rating")
      .eq("tenant_apotek_id", tenantId)
      .eq("reviewee_user_id", userId)
      .eq("period_month", month)
      .eq("period_year", year),

    // KPI config untuk target
    supabase
      .from("kpi_configs")
      .select("target_omzet, bonus_config_v2")
      .eq("tenant_apotek_id", tenantId)
      .eq("period_month", month)
      .eq("period_year", year)
      .maybeSingle(),

    // Semua submission bulan ini (running data + leaderboard berjalan)
    supabase
      .from("daily_submissions")
      .select("user_id, omzet_total, transaction_total, product_total, rejected_customer_total, submission_date")
      .eq("tenant_apotek_id", tenantId)
      .in("status", ["approved", "edited_by_admin"])
      .gte("submission_date", startDate)
      .lte("submission_date", endDate),

    // Active crew members (for correct target distribution denominator)
    supabaseAdmin
      .from("tenant_memberships")
      .select("user_id")
      .eq("tenant_apotek_id", tenantId)
      .eq("is_active", true)
      .eq("role", "crew"),

    // Absensi: clock-in bulan ini — supabaseAdmin karena RLS tidak expose ke crew
    supabaseAdmin
      .from("attendance_logs")
      .select("id, is_late, clock_in_time")
      .eq("tenant_apotek_id", tenantId)
      .eq("user_id", userId)
      .gte("clock_in_time", `${startDate}T00:00:00.000Z`)
      .lte("clock_in_time", `${endDate}T23:59:59.999Z`),

    // Izin: leave requests yang approved di bulan ini — supabaseAdmin karena RLS
    supabaseAdmin
      .from("leave_requests")
      .select("start_date, end_date")
      .eq("tenant_apotek_id", tenantId)
      .eq("user_id", userId)
      .eq("status", "approved")
      .lte("start_date", endDate)
      .gte("end_date", startDate),
  ]);

  // Crew audit (sequential)
  let crewAuditData: any = null;
  if (addonReviewInternal || addonReviewPelanggan) {
    const { data: auditRow } = await supabaseAdmin
      .from("monthly_audits")
      .select("id")
      .eq("tenant_apotek_id", tenantId)
      .eq("period_month", month)
      .eq("period_year", year)
      .maybeSingle();

    if (auditRow?.id) {
      const { data: ca } = await supabaseAdmin
        .from("monthly_crew_audits")
        .select("analyst_score, analyst_feedback, internal_review_score, customer_review_score")
        .eq("monthly_audit_id", auditRow.id)
        .eq("user_id", userId)
        .maybeSingle();
      crewAuditData = ca ?? null;
    }
  }

  // ── Histori 1 tahun (parallel) ──
  const historyYearMin = (wibYear! - 1);
  const [historySnapshotsResult, historyAppraisalsResult] = await Promise.all([
    supabase
      .from("leaderboard_snapshots")
      .select("period_month, period_year, omzet_value, atv_value")
      .eq("tenant_apotek_id", tenantId)
      .eq("user_id", userId)
      .gte("period_year", historyYearMin)
      .lte("period_year", wibYear!),

    supabaseAdmin
      .from("monthly_appraisals")
      .select("period_month, period_year, is_published, auto_bonus_accountability, addon_manual_total, bba_adjustment, approved_omzet_total")
      .eq("tenant_apotek_id", tenantId)
      .eq("crew_user_id", userId)
      .gte("period_year", historyYearMin)
      .lte("period_year", wibYear!),
  ]);

  // ── Produk fokus ──
  let produkFokusData: any[] = [];
  if (addonProdukFokus) {
    const { data: fokusConfigs } = await supabase
      .from("product_fokus_configs")
      .select("id, product_id, target_value, target_type, bonus_type, bonus_value, bonus_step, master_products(product_name)")
      .eq("tenant_apotek_id", tenantId)
      .eq("period_month", month)
      .eq("period_year", year);

    if (fokusConfigs && fokusConfigs.length > 0) {
      const { data: userSubs } = await supabase
        .from("daily_submissions")
        .select("id")
        .eq("tenant_apotek_id", tenantId)
        .eq("user_id", userId)
        .in("status", ["approved", "edited_by_admin"])
        .gte("submission_date", startDate)
        .lte("submission_date", endDate);

      const subIds = (userSubs ?? []).map((s: any) => s.id as string);
      let salesByProduct = new Map<string, number>();

      if (subIds.length > 0) {
        const { data: salesData } = await supabase
          .from("daily_submission_products")
          .select("product_id, quantity_sold")
          .eq("tenant_apotek_id", tenantId)
          .in("submission_id", subIds);

        for (const sale of (salesData ?? [])) {
          salesByProduct.set(
            sale.product_id as string,
            (salesByProduct.get(sale.product_id as string) ?? 0) + Number(sale.quantity_sold ?? 0),
          );
        }
      }

      produkFokusData = fokusConfigs.map((cfg: any) => {
        const sold   = salesByProduct.get(cfg.product_id) ?? 0;
        const target = Number(cfg.target_value ?? 0);
        const progressPct = target > 0 ? Math.min(100, (sold / target) * 100) : 0;
        let bonusEarned = 0;
        if (cfg.bonus_type === "flat") {
          bonusEarned = sold >= target ? Number(cfg.bonus_value ?? 0) : 0;
        } else if (cfg.bonus_type === "kelipatan") {
          const step = Number(cfg.bonus_step ?? 1);
          bonusEarned = step > 0 ? Math.floor(sold / step) * Number(cfg.bonus_value ?? 0) : 0;
        }
        const productName = (Array.isArray(cfg.master_products)
          ? cfg.master_products[0]?.product_name
          : (cfg.master_products as any)?.product_name) ?? "Produk";
        return { productId: cfg.product_id, productName, sold, target, progressPct, bonusType: cfg.bonus_type, bonusValue: Number(cfg.bonus_value ?? 0), bonusStep: Number(cfg.bonus_step ?? 0), bonusEarned };
      });
    }
  }

  // ── Derived: snapshot data ──
  const appraisal      = appraisalResult.data;
  const mySnapshot     = mySnapshotResult.data;
  const peerReviews    = peerReviewsResult.data ?? [];
  const allSubmissions = (allSubmissionsResult.data ?? []) as any[];
  const crewUserIds    = new Set(
    (crewMembershipsResult.data ?? []).map((m: any) => m.user_id as string).filter(Boolean),
  );

  const isPublished = Boolean(appraisal?.is_published);
  const totalBonus  = appraisal !== null
    ? Number(appraisal.auto_bonus_accountability ?? 0)
      + Number(appraisal.addon_manual_total      ?? 0)
      + Number(appraisal.bba_adjustment          ?? 0)
    : null;

  const peerRatingAvg = peerReviews.length > 0
    ? peerReviews.reduce((s: number, r: any) => s + Number(r.rating ?? 0), 0) / peerReviews.length
    : null;

  // ── Derived: running personal data dari daily_submissions ──
  const personalRows = allSubmissions.filter((r: any) => r.user_id === userId);
  const runningOmzet = personalRows.reduce((s: number, r: any) => s + Number(r.omzet_total ?? 0), 0);
  const runningTrx   = personalRows.reduce((s: number, r: any) => s + Number(r.transaction_total ?? 0), 0);
  const runningProd  = personalRows.reduce((s: number, r: any) => s + Number(r.product_total ?? 0), 0);
  const runningDays  = personalRows.length;
  const runningATV   = runningTrx  > 0 ? runningOmzet / runningTrx  : 0;
  const runningATU   = runningTrx  > 0 ? runningProd  / runningTrx  : 0;

  const runningPersonal = runningDays > 0 ? {
    omzet: runningOmzet,
    trx:   runningTrx,
    prod:  runningProd,
    days:  runningDays,
    atv:   runningATV,
    atu:   runningATU,
  } : null;

  // ── Derived: pelanggan tertolak ──
  const pelangganTertolak     = personalRows.reduce((s: number, r: any) => s + Number(r.rejected_customer_total ?? 0), 0);
  const perkiraanOmzetTertolak = runningTrx > 0 ? (runningOmzet / runningTrx) * pelangganTertolak : 0;

  // ── Derived: kontribusi omzet % terhadap seluruh tim bulan ini ──
  const teamTotalOmzet = allSubmissions.reduce((s: number, r: any) => s + Number(r.omzet_total ?? 0), 0);
  const kontribusiPct  = teamTotalOmzet > 0 && runningOmzet > 0
    ? (runningOmzet / teamTotalOmzet) * 100
    : null;

  // ── Derived: absensi (hadir / telat / izin) ──
  const attendanceLogs  = (attendanceResult.data ?? []) as any[];
  const leaveRows       = (leaveResult.data ?? []) as any[];

  // Group clock-ins by calendar day (Jakarta TZ)
  const clockByDay = new Map<string, { isLate: boolean }>();
  for (const log of attendanceLogs) {
    const dk = new Date(log.clock_in_time as string)
      .toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" }); // YYYY-MM-DD
    const prev = clockByDay.get(dk);
    clockByDay.set(dk, { isLate: prev?.isLate || Boolean(log.is_late) });
  }
  const hadirCount = clockByDay.size;
  const telatCount = Array.from(clockByDay.values()).filter(v => v.isLate).length;

  // Expand leave date ranges → unique days within the selected month
  const izinDays = new Set<string>();
  for (const lr of leaveRows) {
    const cur = new Date(lr.start_date as string);
    const end = new Date(lr.end_date   as string);
    while (cur <= end) {
      const dk = cur.toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
      if (dk >= startDate && dk <= endDate) izinDays.add(dk);
      cur.setDate(cur.getDate() + 1);
    }
  }
  const izinCount = izinDays.size;

  const absensiData = {
    hadir: hadirCount,
    telat: telatCount,
    izin:  izinCount,
  };

  // ── Derived: target dari KPI config ──
  const kpiConfig  = kpiConfigResult.data;
  const kpiV2      = kpiConfig?.bonus_config_v2 as KpiConfigV2 | null | undefined;
  const teamTarget = Number(kpiConfig?.target_omzet ?? 0);

  const activeCrew = crewUserIds.size || 1;
  let personalTarget = teamTarget;
  if (kpiV2 && teamTarget > 0) {
    const indMonthly = kpiV2.individual_monthly;
    const indDaily   = kpiV2.individual_daily;

    if (indMonthly?.enabled) {
      // individual_monthly: per-user monthly target
      if (indMonthly.target_distribution === "manual") {
        const userCfg = indMonthly.user_configs?.[userId];
        personalTarget = userCfg?.target_omzet
          ? Number(userCfg.target_omzet)
          : teamTarget / activeCrew;  // fallback fair-share jika tidak ada config manual
      } else {
        personalTarget = teamTarget / activeCrew;
      }
    } else if (indDaily?.enabled) {
      // individual_daily: target harian → konversi ke bulanan supaya konsisten
      const wdGlobal = Number((kpiV2 as any).global?.default_working_days) || 26;
      if (indDaily.target_distribution === "manual") {
        const userCfg = indDaily.user_configs?.[userId];
        if (userCfg?.target_omzet_daily != null) {
          const workingDays = (userCfg as any).working_days ?? wdGlobal;
          personalTarget = Number(userCfg.target_omzet_daily) * workingDays;
        } else {
          personalTarget = teamTarget / activeCrew;
        }
      } else {
        personalTarget = teamTarget / activeCrew;
      }
    }
  }


  // ── Live KPI bonus estimate (ketika monthly_appraisals belum ada) ──
  // Sumber sama seperti owner portal: daily_submissions → calculateMonthlyBonusFromInputs
  let liveKpiBonus: number | null = null;
  let liveBreakdownPerUser: any = null;

  if (kpiV2 && totalBonus === null && allSubmissions.length > 0) {
    const dailyMap = new Map<string, { omzet: number; trx: number; items: number }>();
    const liveCrewRows: CrewAchievementRow[] = [];
    for (const row of allSubmissions) {
      const dk = String(row.submission_date ?? "").slice(0, 10);
      if (!dk) continue;
      const prev = dailyMap.get(dk) ?? { omzet: 0, trx: 0, items: 0 };
      dailyMap.set(dk, {
        omzet: prev.omzet + Number(row.omzet_total      ?? 0),
        trx:   prev.trx   + Number(row.transaction_total ?? 0),
        items: prev.items  + Number(row.product_total    ?? 0),
      });
      liveCrewRows.push({
        user_id:          String(row.user_id ?? ""),
        achievement_date: dk,
        omzet:            Number(row.omzet_total      ?? 0),
        transactions:     Number(row.transaction_total ?? 0),
        items:            Number(row.product_total    ?? 0),
      });
    }
    const liveDailyRows: DailyAchievementRow[] = Array.from(dailyMap.entries()).map(([dk, v]) => ({
      achievement_date:   dk,
      total_omzet:        v.omzet,
      total_transactions: v.trx,
      total_items:        v.items,
    }));

    try {
      const results = calculateMonthlyBonusFromInputs(kpiV2, liveDailyRows, liveCrewRows);
      const mine = results.find(r => r.user_id === userId);
      if (mine) {
        liveKpiBonus = mine.total_bonus;
        liveBreakdownPerUser = {
          teamMonthlyBonus:       mine.team_monthly_bonus,
          teamDailyBonus:         mine.team_daily_bonus,
          individualMonthlyBonus: mine.individual_monthly_bonus,
          individualDailyBonus:   mine.individual_daily_bonus,
        };
      }
    } catch {
      // Kalkulasi gagal (config tidak valid) — abaikan
    }
  }

  const liveProdukBonus     = produkFokusData.reduce((s, p) => s + p.bonusEarned, 0);
  const isLiveEstimate      = totalBonus === null && liveKpiBonus !== null;
  const effectiveTotalBonus = totalBonus ?? (liveKpiBonus !== null ? liveKpiBonus + liveProdukBonus : null);
  const effectiveAutoBonus  = appraisal ? Number(appraisal.auto_bonus_accountability ?? 0) : liveKpiBonus;
  // effectiveCalcBreakdown computed below, after safeCalcBreakdown is available

  // ── THP: hanya dari payroll_items yang sudah diproses ──
  let payrollItem: any = null;
  let payrollPeriodStatus: string | null = null;

  const { data: payPeriod } = await supabaseAdmin
    .from("payroll_periods")
    .select("id, status")
    .eq("tenant_apotek_id", tenantId)
    .eq("period_start", startDate)
    .eq("period_end", endDate)
    .maybeSingle();

  if (payPeriod) {
    payrollPeriodStatus = payPeriod.status;
    const { data: payItem } = await supabaseAdmin
      .from("payroll_items")
      .select("base_salary, allowance, deduction, days_worked, config_snapshot")
      .eq("payroll_period_id", payPeriod.id)
      .eq("user_id", userId)  // payroll_items uses user_id (auth UUID), not employee_profile_id
      .maybeSingle();
    payrollItem = (payItem as any) ?? null;
  }

  // THP: hanya dari payroll_run yang sudah diproses (tidak tampilkan estimasi dari config)
  let thpData: any = null;
  if (payrollItem) {
    const snap     = (payrollItem as any).config_snapshot as any ?? null;
    const snapAudit = snap?.bonus_from_audit ?? null;

    // Bonus: dari config_snapshot (dibuat saat payroll di-save) atau fallback ke monthly_appraisals
    const bonusKpi    = Number(snapAudit?.kpi          ?? 0);
    const bonusProduk = Number(snapAudit?.produk_fokus ?? 0);
    const bonusAdj    = Number(snapAudit?.adjustment   ?? 0);
    const bonusTotal  = snapAudit != null
      ? bonusKpi + bonusProduk + bonusAdj
      : (totalBonus ?? 0);

    // Net salary (sebelum bonus) dari config_snapshot.totals, atau hitung manual
    const netSalaryPreBonus =
      snap?.totals?.net_salary != null
        ? Number(snap.totals.net_salary) - bonusTotal          // config_snapshot.totals.net_salary sudah termasuk bonus
        : Number(payrollItem.base_salary) + Number(payrollItem.allowance) - Number(payrollItem.deduction);

    // BPJS = total deduction - custom deductions (non-BPJS)
    const customAdjs: any[] = snap?.custom_adjustments ?? [];
    const customDedTotal = customAdjs
      .filter((a: any) => a.type === "deduction")
      .reduce((s: number, a: any) => s + Math.abs(Number(a.amount ?? 0)), 0);
    const bpjsDeduction = Math.max(0, Number(payrollItem.deduction) - customDedTotal);

    thpData = {
      source:              "payroll_run" as const,
      periodStatus:        payrollPeriodStatus,
      daysWorked:          (payrollItem as any).days_worked ?? null,
      // Salary components
      base:                Number(payrollItem.base_salary),
      posAllowance:        Number(snap?.position_allowance          ?? 0),
      mealAllowanceTotal:  Number(snap?.meal_allowance_total        ?? 0),
      transAllowanceTotal: Number(snap?.transport_allowance_total   ?? 0),
      allowance:           Number(payrollItem.allowance),
      deduction:           Number(payrollItem.deduction),
      bpjsDeduction,
      customAdjustments:   customAdjs,
      // Bonus
      bonusKpi,
      bonusProduk,
      bonusAdj,
      bonusTotal,
      // Net
      netSalaryPreBonus,
      netPay: netSalaryPreBonus + bonusTotal,
    };
  }

  // ── Histori 1 tahun: build 12-month array ──
  const historySnapMap = new Map<string, any>();
  for (const s of (historySnapshotsResult.data ?? [])) {
    historySnapMap.set(`${s.period_year}-${s.period_month}`, s);
  }
  const historyApprMap = new Map<string, any>();
  for (const a of (historyAppraisalsResult.data ?? [])) {
    historyApprMap.set(`${a.period_year}-${a.period_month}`, a);
  }
  const histori = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(wibYear!, wibMonth! - 1 - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    const key  = `${y}-${m}`;
    const snap = historySnapMap.get(key);
    const appr = historyApprMap.get(key);
    const bonus = appr
      ? Number(appr.auto_bonus_accountability ?? 0) + Number(appr.addon_manual_total ?? 0) + Number(appr.bba_adjustment ?? 0)
      : null;
    return {
      month: m, year: y,
      omzet: snap ? Number(snap.omzet_value) : (appr ? Number(appr.approved_omzet_total ?? 0) : null),
      bonus: appr ? bonus : null,
      isPublished: Boolean(appr?.is_published),
    };
  });

  // Strip kpiV2.perUser (contains all crew bonuses) — never send to individual crew browser
  const safeCalcBreakdown = (() => {
    const bd = appraisal?.calc_breakdown as any;
    if (!bd?.kpiV2?.perUser) return bd ?? null;
    const { perUser: _stripped, ...kpiV2Safe } = bd.kpiV2;
    return { ...bd, kpiV2: kpiV2Safe };
  })();

  // Merge live breakdown when no appraisal yet
  const effectiveCalcBreakdown = safeCalcBreakdown ?? (liveBreakdownPerUser ? { perUserBonus: liveBreakdownPerUser } : null);

  return (
    <AnimatedPage className="pb-10">
      <CrewRaporClient
        month={month}
        year={year}
        periodOptions={periodOptions}
        initialTab={initialTab}
        // Snapshot bonus data
        isPublished={isPublished}
        publishedAt={appraisal?.published_at ?? null}
        totalBonus={effectiveTotalBonus}
        autoBonus={effectiveAutoBonus}
        addonManual={appraisal ? Number(appraisal.addon_manual_total ?? 0) : null}
        bbaAdj={appraisal      ? Number(appraisal.bba_adjustment     ?? 0) : null}
        calcBreakdown={effectiveCalcBreakdown}
        isLiveEstimate={isLiveEstimate}
        approvedCount={Number(appraisal?.approved_submission_count ?? 0)}
        // Snapshot performa
        mySnapshot={mySnapshot ? {
          omzet:    Number(mySnapshot.omzet_value    ?? 0),
          atv:      Number(mySnapshot.atv_value      ?? 0),
          atu:      Number(mySnapshot.atu_value      ?? 0),
          sarpPct:  Number(mySnapshot.sarp_percent   ?? 0),
          lateFlag: Number(mySnapshot.late_flag_count ?? 0),
        } : null}
        // Running data
        runningPersonal={runningPersonal}
        personalTarget={personalTarget > 0 ? personalTarget : null}
        teamTarget={teamTarget > 0 ? teamTarget : null}
        // Reviews
        crewAudit={crewAuditData}
        peerRatingAvg={peerRatingAvg}
        peerReviewCount={peerReviews.length}
        addonReviewInternal={addonReviewInternal}
        addonReviewPelanggan={addonReviewPelanggan}
        // Operasional tambahan
        pelangganTertolak={pelangganTertolak}
        perkiraanOmzetTertolak={perkiraanOmzetTertolak}
        kontribusiPct={kontribusiPct}
        absensi={absensiData}
        // THP
        thpData={thpData}
        // Histori + Produk fokus
        histori={histori}
        produkFokus={produkFokusData}
        addonProdukFokus={addonProdukFokus}
      />
    </AnimatedPage>
  );
}
