/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AnimatedPage } from "@/components/shared/animated-page";
import { AlertCircle } from "lucide-react";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
import { CrewRaporClient } from "./crew-rapor-client";

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

  // Period options: bulan berjalan + 2 bulan ke belakang
  const periodOptions: { month: number; year: number; label: string }[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(year, month - 1 - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    periodOptions.push({ month: m, year: y, label: `${MONTHS_ID[m]} ${y}` });
  }

  // Cek addon review
  const { data: addons } = await supabase
    .from("addon_settings")
    .select("addon_key, is_enabled")
    .eq("tenant_apotek_id", tenantId)
    .in("addon_key", ["review_internal", "review_pelanggan"]);

  const addonReviewInternal  = addons?.find(a => a.addon_key === "review_internal")?.is_enabled  ?? false;
  const addonReviewPelanggan = addons?.find(a => a.addon_key === "review_pelanggan")?.is_enabled ?? false;

  // Query paralel
  const [
    appraisalResult,
    mySnapshotResult,
    teamSnapshotsResult,
    peerReviewsResult,
    payrollConfigResult,
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
  ]);

  // Crew audit (sequential — butuh monthly_audit_id dulu)
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

  // Derived
  const appraisal     = appraisalResult.data;
  const mySnapshot    = mySnapshotResult.data;
  const teamRows      = (teamSnapshotsResult.data ?? []) as any[];
  const peerReviews   = peerReviewsResult.data ?? [];
  const payrollConfig = payrollConfigResult.data;

  const isPublished = Boolean(appraisal?.is_published);
  const totalBonus  = appraisal !== null
    ? Number(appraisal.auto_bonus_accountability ?? 0)
      + Number(appraisal.addon_manual_total      ?? 0)
      + Number(appraisal.bba_adjustment          ?? 0)
    : null;

  const peerRatingAvg = peerReviews.length > 0
    ? peerReviews.reduce((s: number, r: any) => s + Number(r.rating ?? 0), 0) / peerReviews.length
    : null;

  // THP (hanya kalau payroll_config ada)
  let thpData: any = null;
  if (payrollConfig && totalBonus !== null) {
    const base           = Number(payrollConfig.base_salary          ?? 0);
    const posAllowance   = Number(payrollConfig.position_allowance   ?? 0);
    const mealAllowance  = Number(payrollConfig.meal_allowance       ?? 0);
    const transAllowance = Number(payrollConfig.transport_allowance  ?? 0);
    const bpjsTotal      = Number(payrollConfig.bpjs_deduction       ?? 0);
    const customAdj      = Array.isArray(payrollConfig.custom_adjustments)
      ? (payrollConfig.custom_adjustments as any[])
      : [];
    const customNet = customAdj.reduce((s: number, a: any) =>
      s + (a.type === "addition" ? Number(a.amount ?? 0) : -Number(a.amount ?? 0)), 0);

    const grossPay = base + posAllowance + mealAllowance + transAllowance + totalBonus + customNet;
    const netPay   = grossPay - bpjsTotal;

    thpData = { base, posAllowance, mealAllowance, transAllowance, bonus: totalBonus, bpjsTotal, customAdj, grossPay, netPay };
  }

  // Team leaderboard
  const teamLeaderboard = teamRows.map((row: any) => ({
    userId:   String(row.user_id),
    name:     (Array.isArray(row.user) ? row.user[0]?.full_name : row.user?.full_name) ?? "—",
    omzet:    Number(row.omzet_value    ?? 0),
    atv:      Number(row.atv_value      ?? 0),
    atu:      Number(row.atu_value      ?? 0),
    sarpPct:  Number(row.sarp_percent   ?? 0),
    lateFlag: Number(row.late_flag_count ?? 0),
  }));

  return (
    <AnimatedPage className="pb-10">
      <CrewRaporClient
        month={month}
        year={year}
        periodOptions={periodOptions}
        initialTab={initialTab}
        isPublished={isPublished}
        publishedAt={appraisal?.published_at ?? null}
        totalBonus={totalBonus}
        autoBonus={appraisal    ? Number(appraisal.auto_bonus_accountability ?? 0) : null}
        addonManual={appraisal  ? Number(appraisal.addon_manual_total        ?? 0) : null}
        bbaAdj={appraisal       ? Number(appraisal.bba_adjustment            ?? 0) : null}
        calcBreakdown={appraisal?.calc_breakdown ?? null}
        approvedCount={Number(appraisal?.approved_submission_count ?? 0)}
        approvedOmzet={Number(appraisal?.approved_omzet_total      ?? 0)}
        mySnapshot={mySnapshot ? {
          omzet:    Number(mySnapshot.omzet_value    ?? 0),
          atv:      Number(mySnapshot.atv_value      ?? 0),
          atu:      Number(mySnapshot.atu_value      ?? 0),
          sarpPct:  Number(mySnapshot.sarp_percent   ?? 0),
          lateFlag: Number(mySnapshot.late_flag_count ?? 0),
        } : null}
        crewAudit={crewAuditData}
        peerRatingAvg={peerRatingAvg}
        peerReviewCount={peerReviews.length}
        addonReviewInternal={addonReviewInternal}
        addonReviewPelanggan={addonReviewPelanggan}
        thpData={thpData}
        teamLeaderboard={teamLeaderboard}
        currentUserId={userId}
      />
    </AnimatedPage>
  );
}
