/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/auth-context";
import { AuditDetailClient } from "./audit-detail-client";
import { notFound } from "next/navigation";

const AUDIT_COUNTED_SUBMISSION_STATUSES = ["approved", "edited_by_admin"] as const;

export default async function AuditDetailPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<any> }) {
  const p = await params;
  const sp = await searchParams;
  const month = parseInt(sp.month) || new Date().getMonth() + 1;
  const year = parseInt(sp.year) || new Date().getFullYear();
  const id = p.id;
  const pad2 = (n: number) => String(n).padStart(2, "0");

  const supabase = createAdminClient();
  const session = await getSessionContext();

  // 1. Fetch Branch Info
  const { data: branch } = await supabase
    .from("tenant_apotek")
    .select("*")
    .eq("id", id)
    .single();

  if (!branch) return notFound();

  // 2. Fetch KPI Config for this period
  const { data: kpi } = await supabase
    .from("kpi_configs")
    .select("*")
    .eq("tenant_apotek_id", id)
    .eq("period_month", month)
    .eq("period_year", year)
    .maybeSingle();

  // 3. Base period
  const startDate = `${year}-${pad2(month)}-01`;
  const monthEndDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${pad2(month)}-${pad2(monthEndDay)}`;
  const today = new Date();
  const todayDateKey = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const selectedDateRaw = typeof sp.date === "string" ? sp.date.slice(0, 10) : "";
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(selectedDateRaw)
    ? selectedDateRaw < startDate
      ? startDate
      : selectedDateRaw > endDate
        ? endDate
        : selectedDateRaw
    : isCurrentMonth
      ? (todayDateKey > endDate ? endDate : todayDateKey)
      : endDate;

  // 4. Fetch Approved Submissions (single source of truth output)
  const { data: approvedRows } = await supabase
    .from("daily_submissions")
    .select("id, submission_date, user_id, omzet_total, transaction_total, product_total, rejected_customer_total, user:app_users!user_id(full_name)")
    .eq("tenant_apotek_id", id)
    .in("status", [...AUDIT_COUNTED_SUBMISSION_STATUSES])
    .gte("submission_date", startDate)
    .lte("submission_date", endDate);
  const approvedSubmissionIds = (approvedRows ?? []).map((r: any) => r.id).filter(Boolean);
  const { data: approvedProductRows } =
    approvedSubmissionIds.length > 0
      ? await supabase
          .from("daily_submission_products")
          .select("submission_id, product_id, quantity_sold, submission:daily_submissions!submission_id(user_id, submission_date)")
          .in("submission_id", approvedSubmissionIds)
      : { data: [] as any[] };

  const byDate = new Map<
    string,
    { total_omzet: number; total_transactions: number; total_items: number; rejected_count: number }
  >();
  for (const row of approvedRows ?? []) {
    const dateKey = String(row.submission_date).slice(0, 10);
    const current = byDate.get(dateKey) ?? {
      total_omzet: 0,
      total_transactions: 0,
      total_items: 0,
      rejected_count: 0,
    };
    current.total_omzet += Number(row.omzet_total ?? 0);
    current.total_transactions += Number(row.transaction_total ?? 0);
    current.total_items += Number(row.product_total ?? 0);
    current.rejected_count += Number(row.rejected_customer_total ?? 0);
    byDate.set(dateKey, current);
  }
  const achievements = Array.from(byDate.entries())
    .map(([achievement_date, val]) => {
      const atv = val.total_transactions > 0 ? val.total_omzet / val.total_transactions : 0;
      return {
        achievement_date,
        total_omzet: val.total_omzet,
        total_transactions: val.total_transactions,
        total_items: val.total_items,
        rejected_count: val.rejected_count,
        rejected_omzet_est: atv * val.rejected_count,
      };
    })
    .sort((a, b) => a.achievement_date.localeCompare(b.achievement_date));

  const crewAchievements = (approvedRows ?? []).map((row: any) => ({
    id: row.id,
    user_id: row.user_id,
    achievement_date: String(row.submission_date).slice(0, 10),
    omzet: Number(row.omzet_total ?? 0),
    transactions: Number(row.transaction_total ?? 0),
    items: Number(row.product_total ?? 0),
    rejected_customer_total: Number(row.rejected_customer_total ?? 0),
    app_users: row.user,
  }));

  const { count: activeCrewCount = 0 } = await supabase
    .from("tenant_memberships")
    .select("*", { count: "exact", head: true })
    .eq("tenant_apotek_id", id)
    .eq("role", "crew")
    .eq("is_active", true);

  // 5. Fetch or bootstrap Monthly Audit record (idempotent)
  let { data: audit } = await supabase
    .from("monthly_audits")
    .select("*")
    .eq("tenant_apotek_id", id)
    .eq("period_month", month)
    .eq("period_year", year)
    .maybeSingle();

  if (!audit) {
    const nowIso = new Date().toISOString();
    const { data: inserted, error: insertAuditError } = await supabase
      .from("monthly_audits")
      .insert({
        tenant_apotek_id: id,
        period_month: month,
        period_year: year,
        status: "DRAFT",
        updated_at: nowIso,
      })
      .select("*")
      .maybeSingle();

    if (!insertAuditError && inserted) {
      audit = inserted;
    } else if (insertAuditError?.code === "23505") {
      const { data: again } = await supabase
        .from("monthly_audits")
        .select("*")
        .eq("tenant_apotek_id", id)
        .eq("period_month", month)
        .eq("period_year", year)
        .maybeSingle();
      audit = again ?? audit;
    }
  }

  // 5b. Fetch Individual Crew Audits
  const { data: crewAudits } = audit ? await supabase
    .from("monthly_crew_audits")
    .select("*, app_users(full_name)")
    .eq("monthly_audit_id", audit.id)
    : { data: [] };

  // 5c. Payroll display aligns with cabang: payroll_configs (not employee_salary_configs)
  const { data: payrollConfigs } = await supabase
    .from("payroll_configs")
    .select("*")
    .eq("tenant_apotek_id", id);

  // 6. Fetch Product Fokus Configs
  const { data: productFokusConfigs } = await supabase
    .from("product_fokus_configs")
    .select("*, master_products(product_name)")
    .eq("tenant_apotek_id", id)
    .eq("period_month", month)
    .eq("period_year", year);

  // 7. Peer reviews (review internal crew) untuk periode audit
  const { data: internalReviews } = await supabase
    .from("peer_reviews")
    .select(
      "id, reviewer_user_id, reviewee_user_id, rating, comment, period_month, period_year, created_at, reviewer:reviewer_user_id(full_name)",
    )
    .eq("tenant_apotek_id", id)
    .eq("period_month", month)
    .eq("period_year", year);

  // 8. Ulasan pelanggan — sumber row di DB: customer_riview_logs (bukan customer_reviews)
  const { data: customerReviews } = await supabase
    .from("customer_riview_logs")
    .select("*")
    .eq("tenant_apotek_id", id)
    .gte("created_at", startDate)
    .lte("created_at", endDate + "T23:59:59Z");

  // 9. Fetch Active Addons
  const { data: addons } = await supabase
    .from("addon_settings")
    .select("*")
    .eq("tenant_apotek_id", id)
    .eq("is_enabled", true);

  // 10. Attendance + izin + penilaian add-on (audit Super Admin)
  const attendanceFrom = `${startDate}T00:00:00.000Z`;
  const attendanceTo = `${endDate}T23:59:59.999Z`;
  const [{ data: attendanceLogs }, { data: leaveRequestsApproved }, { data: monthlyAddonAppraisals }] =
    await Promise.all([
      supabase
        .from("attendance_logs")
        .select(
          `id, user_id, shift_schedule_id, clock_in_time, clock_out_time, photo_url, is_late, notes,
          shift_schedule:shift_schedules!shift_schedule_id (
            schedule_date, is_off, master_shifts ( shift_name, start_time, end_time )
          )`,
        )
        .eq("tenant_apotek_id", id)
        .gte("clock_in_time", attendanceFrom)
        .lte("clock_in_time", attendanceTo),
      supabase
        .from("leave_requests")
        .select("user_id, start_date, end_date, status, leave_type, reason")
        .eq("tenant_apotek_id", id)
        .eq("status", "approved")
        .lte("start_date", endDate)
        .gte("end_date", startDate),
      supabase
        .from("monthly_addon_appraisals")
        .select("*")
        .eq("tenant_apotek_id", id)
        .eq("period_month", month)
        .eq("period_year", year),
    ]);

  return (
    <AuditDetailClient 
      branch={branch}
      kpi={kpi}
      achievements={achievements || []}
      crewAchievements={crewAchievements || []}
      audit={audit}
      isGlobalSuperAdmin={Boolean(session?.isGlobalSuperAdmin)}
      crewAudits={crewAudits || []}
      payrollConfigs={payrollConfigs || []}
      productFokusConfigs={productFokusConfigs || []}
      internalReviews={internalReviews || []}
      customerReviews={customerReviews || []}
      addons={addons || []}
      month={month}
      year={year}
      selectedDate={selectedDate}
      approvedProductRows={approvedProductRows || []}
      attendanceLogs={attendanceLogs ?? []}
      leaveRequestsApproved={leaveRequestsApproved ?? []}
      monthlyAddonAppraisals={monthlyAddonAppraisals ?? []}
      activeCrewCount={Number(activeCrewCount ?? 0)}
    />
  );
}
