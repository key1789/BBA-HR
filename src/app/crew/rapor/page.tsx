/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AnimatedPage } from "@/components/shared/animated-page";
import { AlertCircle } from "lucide-react";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
import { CrewRaporClient } from "./crew-rapor-client";
import type { KpiConfigV2 } from "@/lib/types/kpi-v2";

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
  const month = parseInt(sp.month ?? "") || wibMonth!;
  const year  = parseInt(sp.year  ?? "") || wibYear!;
  const initialTab = sp.tab === "peringkat" ? "peringkat" : "rapor";

  const session = await getSessionContext();
  const active  = session?.activeMembership;

  if (!active || (active.role !== "crew" && active.role !== "admin_apotek")) {
    return (
      <AnimatedPage className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="h-12 w-12 text-slate-300 mb-4" />
        <p className="text-slate-500">Halaman ini hanya untuk crew atau admin apotek.</p>
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

  // Period options
  const periodOptions: { month: number; year: number; label: string }[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(year, month - 1 - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    periodOptions.push({ month: m, year: y, label: `${MONTHS_ID[m]} ${y}` });
  }

  // Cek addon
  const { data: addons } = await supabase
    .from("addon_settings")
    .select("addon_key, is_enabled")
    .eq("tenant_apotek_id", tenantId)
    .in("addon_key", ["review_internal", "review_pelanggan"]);

  const addonReviewInternal  = addons?.find(a => a.addon_key === "review_internal")?.is_enabled  ?? false;
  const addonReviewPelanggan = addons?.find(a => a.addon_key === "review_pelanggan")?.is_enabled ?? false;

  // Semua query paralel
  const [
    appraisalResult,
    mySnapshotResult,
    teamSnapshotsResult,
    peerReviewsResult,
    payrollConfigResult,
    kpiConfigResult,
    allSubmissionsResult,
  ] = await Promise.all([
    supabase
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
      .from("leaderboard_snapshots")
      .select("user_id, omzet_value, atv_value, atu_value, sarp_percent, late_flag_count, user:user_id(full_name)")
      .eq("tenant_apotek_id", tenantId)
      .eq("period_month", month)
      .eq("period_year", year)
      .order("omzet_value", { ascending: false }),

    supabase
      .from("peer_reviews")
      .select("rating")
      .eq("tenant_apotek_id", tenantId)
      .eq("reviewee_user_id", userId)
      .eq("period_month", month)
      .eq("period_year", year),

    supabaseAdmin
      .from("payroll_configs")
      .select("base_salary, position_allowance, meal_allowance, transport_allowance, bpjs_deduction, custom_adjustments")
      .eq("tenant_apotek_id", tenantId)
      .eq("user_id", userId)
      .maybeSingle(),

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

  // ── Derived: snapshot data ──
  const appraisal     = appraisalResult.data;
  const mySnapshot    = mySnapshotResult.data;
  const teamRows      = (teamSnapshotsResult.data ?? []) as any[];
  const peerReviews   = peerReviewsResult.data ?? [];
  const payrollConfig = payrollConfigResult.data;
  const allSubmissions = (allSubmissionsResult.data ?? []) as any[];

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

  // ── Derived: target dari KPI config ──
  const kpiConfig  = kpiConfigResult.data;
  const kpiV2      = kpiConfig?.bonus_config_v2 as KpiConfigV2 | null | undefined;
  const teamTarget = Number(kpiConfig?.target_omzet ?? 0);

  let personalTarget = teamTarget;
  if (kpiV2 && teamTarget > 0) {
    const indMonthly = kpiV2.individual_monthly;
    if (indMonthly?.enabled) {
      if (indMonthly.target_distribution === "manual") {
        const userCfg = indMonthly.user_configs?.[userId];
        if (userCfg?.target_omzet) personalTarget = Number(userCfg.target_omzet);
      } else {
        const activeCrew = new Set(allSubmissions.map((r: any) => r.user_id)).size || 1;
        personalTarget = teamTarget / activeCrew;
      }
    }
  }

  // ── Derived: running leaderboard dari submissions ──
  const byUser = new Map<string, { omzet: number; trx: number; prod: number; days: number }>();
  for (const row of allSubmissions) {
    const prev = byUser.get(row.user_id) ?? { omzet: 0, trx: 0, prod: 0, days: 0 };
    prev.omzet += Number(row.omzet_total      ?? 0);
    prev.trx   += Number(row.transaction_total ?? 0);
    prev.prod  += Number(row.product_total     ?? 0);
    prev.days  += 1;
    byUser.set(row.user_id, prev);
  }

  // Fetch user names for running leaderboard (only if snapshot kosong)
  let runningLeaderboard: { userId: string; name: string; omzet: number; atv: number; atu: number; days: number }[] = [];
  if (teamRows.length === 0 && byUser.size > 0) {
    const submissionUserIds = Array.from(byUser.keys());
    const { data: userRows } = await supabaseAdmin
      .from("app_users")
      .select("id, full_name")
      .in("id", submissionUserIds);

    const nameById = new Map((userRows ?? []).map((u: any) => [u.id, u.full_name ?? "—"]));
    runningLeaderboard = Array.from(byUser.entries())
      .map(([uid, v]) => ({
        userId: uid,
        name:   nameById.get(uid) ?? "—",
        omzet:  v.omzet,
        atv:    v.trx  > 0 ? v.omzet / v.trx  : 0,
        atu:    v.prod > 0 ? v.trx   / v.prod  : 0,
        days:   v.days,
      }))
      .sort((a, b) => b.omzet - a.omzet);
  }

  // ── Derived: snapshot leaderboard ──
  const teamLeaderboard = teamRows.map((row: any) => ({
    userId:   String(row.user_id),
    name:     (Array.isArray(row.user) ? row.user[0]?.full_name : row.user?.full_name) ?? "—",
    omzet:    Number(row.omzet_value    ?? 0),
    atv:      Number(row.atv_value      ?? 0),
    atu:      Number(row.atu_value      ?? 0),
    sarpPct:  Number(row.sarp_percent   ?? 0),
    lateFlag: Number(row.late_flag_count ?? 0),
  }));

  // ── Derived: THP ──
  let thpData: any = null;
  if (payrollConfig && totalBonus !== null) {
    const base           = Number(payrollConfig.base_salary         ?? 0);
    const posAllowance   = Number(payrollConfig.position_allowance  ?? 0);
    const mealAllowance  = Number(payrollConfig.meal_allowance      ?? 0);
    const transAllowance = Number(payrollConfig.transport_allowance ?? 0);
    const bpjsTotal      = Number(payrollConfig.bpjs_deduction      ?? 0);
    const customAdj      = Array.isArray(payrollConfig.custom_adjustments) ? payrollConfig.custom_adjustments as any[] : [];
    const customNet      = customAdj.reduce((s: number, a: any) =>
      s + (a.type === "addition" ? Number(a.amount ?? 0) : -Number(a.amount ?? 0)), 0);
    const grossPay = base + posAllowance + mealAllowance + transAllowance + totalBonus + customNet;
    const netPay   = grossPay - bpjsTotal;
    thpData = { base, posAllowance, mealAllowance, transAllowance, bonus: totalBonus, bpjsTotal, customAdj, grossPay, netPay };
  }

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
        totalBonus={totalBonus}
        autoBonus={appraisal   ? Number(appraisal.auto_bonus_accountability ?? 0) : null}
        addonManual={appraisal ? Number(appraisal.addon_manual_total        ?? 0) : null}
        bbaAdj={appraisal      ? Number(appraisal.bba_adjustment            ?? 0) : null}
        calcBreakdown={appraisal?.calc_breakdown ?? null}
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
        // THP
        thpData={thpData}
        // Leaderboard
        teamLeaderboard={teamLeaderboard}
        runningLeaderboard={runningLeaderboard}
        currentUserId={userId}
      />
    </AnimatedPage>
  );
}
