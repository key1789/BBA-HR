/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";

export const AUDIT_COUNTED_SUBMISSION_STATUSES = ["approved", "edited_by_admin"] as const;

/** Owner: tampilkan semua input yang sudah masuk ke alur verifikasi (belum harus disetujui admin). */
export const OWNER_PORTAL_SUBMISSION_STATUSES = ["submitted", "approved", "edited_by_admin", "reject"] as const;

/** Default owner portal: hanya laporan terverifikasi (selaras audit BBA). */
export function parseOwnerVerifiedOnlyParam(raw: string | undefined): boolean {
  return raw !== "false";
}

export function resolveAuditDashboardSubmissionStatuses(options?: {
  /** Default true — hanya `approved` + `edited_by_admin`. Set false untuk preview alur verifikasi owner. */
  verifiedOnly?: boolean;
  submissionStatuses?: readonly string[];
}): readonly string[] {
  if (options?.submissionStatuses?.length) {
    return options.submissionStatuses;
  }
  const verifiedOnly = options?.verifiedOnly !== false;
  return verifiedOnly ? [...AUDIT_COUNTED_SUBMISSION_STATUSES] : [...OWNER_PORTAL_SUBMISSION_STATUSES];
}

export type BranchOmzetHistoriItem = { month: number; year: number; omzet: number };

export type AuditBranchDashboardPayload = {
  branch: any;
  kpi: any;
  achievements: any[];
  crewAchievements: any[];
  audit: any;
  crewAudits: any[];
  payrollConfigs: any[];
  productFokusConfigs: any[];
  internalReviews: any[];
  customerReviews: any[];
  addons: any[];
  selectedDate: string;
  approvedProductRows: any[];
  attendanceLogs: any[];
  leaveRequestsApproved: any[];
  monthlyAddonAppraisals: any[];
  activeCrewCount: number;
  /** true bila semua baris monthly_appraisals periode ini is_published */
  raportPeriodPublished: boolean;
  /** 12-month branch omzet trend, aggregated from leaderboard_snapshots, oldest-first */
  branchOmzetHistori: BranchOmzetHistoriItem[];
  /** payroll_periods row untuk bulan ini (null jika belum ada draft) */
  payrollPeriod: any | null;
  /** payroll_items rows untuk periode ini, tiap baris includes employee_profiles */
  payrollItems: any[];
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function normalizeRouteId(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].trim();
  return "";
}

/**
 * Route `/bba/audit/[id]` memakai tenant_apotek.id; terima juga monthly_audits.id (deep link lama).
 */
export async function resolveBranchRouteTenantId(
  supabase: SupabaseClient,
  routeIdRaw: unknown,
): Promise<string | null> {
  const routeId = normalizeRouteId(routeIdRaw);
  if (!UUID_RE.test(routeId)) return null;

  const { data: branch } = await supabase
    .from("tenant_apotek")
    .select("id")
    .eq("id", routeId)
    .maybeSingle();
  if (branch?.id) return branch.id;

  const { data: auditRow } = await supabase
    .from("monthly_audits")
    .select("tenant_apotek_id")
    .eq("id", routeId)
    .maybeSingle();

  return auditRow?.tenant_apotek_id ?? null;
}

/**
 * Muat data yang sama dengan halaman audit cabang (BBA / owner).
 * `bootstrapMonthlyAudit`: true untuk admin (insert DRAFT bila belum ada); false untuk owner (read-only).
 */
export async function fetchAuditBranchDashboardData(
  supabase: SupabaseClient,
  tenantId: string,
  month: number,
  year: number,
  options?: {
    selectedDateRaw?: string;
    bootstrapMonthlyAudit?: boolean;
    /** Default: hanya approved + edited (audit BBA). Owner: `verifiedOnly=false` → `OWNER_PORTAL_SUBMISSION_STATUSES`. */
    verifiedOnly?: boolean;
    submissionStatuses?: readonly string[];
  },
): Promise<AuditBranchDashboardPayload | null> {
  const bootstrapMonthlyAudit = options?.bootstrapMonthlyAudit ?? true;
  const submissionStatuses = resolveAuditDashboardSubmissionStatuses(options);

  const resolvedTenantId = await resolveBranchRouteTenantId(supabase, tenantId);
  if (!resolvedTenantId) return null;
  const branchId = resolvedTenantId;

  const { data: branch } = await supabase
    .from("tenant_apotek")
    .select("*")
    .eq("id", branchId)
    .maybeSingle();

  if (!branch) return null;

  const { data: kpi } = await supabase
    .from("kpi_configs")
    .select("*")
    .eq("tenant_apotek_id", branchId)
    .eq("period_month", month)
    .eq("period_year", year)
    .maybeSingle();

  const startDate = `${year}-${pad2(month)}-01`;
  const monthEndDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${pad2(month)}-${pad2(monthEndDay)}`;
  const today = new Date();
  const todayDateKey = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const selectedDateRaw = options?.selectedDateRaw?.slice(0, 10) ?? "";
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(selectedDateRaw)
    ? selectedDateRaw < startDate
      ? startDate
      : selectedDateRaw > endDate
        ? endDate
        : selectedDateRaw
    : isCurrentMonth
      ? todayDateKey > endDate
        ? endDate
        : todayDateKey
      : endDate;

  const { data: approvedRows } = await supabase
    .from("daily_submissions")
    .select(
      "id, submission_date, user_id, omzet_total, transaction_total, product_total, rejected_customer_total, user:app_users!user_id(full_name)",
    )
    .eq("tenant_apotek_id", branchId)
    .in("status", submissionStatuses as unknown as string[])
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
    .eq("tenant_apotek_id", branchId)
    .eq("role", "crew")
    .eq("is_active", true);

  let { data: audit } = await supabase
    .from("monthly_audits")
    .select("*")
    .eq("tenant_apotek_id", branchId)
    .eq("period_month", month)
    .eq("period_year", year)
    .maybeSingle();

  if (!audit && bootstrapMonthlyAudit) {
    const nowIso = new Date().toISOString();
    const { data: inserted, error: insertAuditError } = await supabase
      .from("monthly_audits")
      .insert({
        tenant_apotek_id: branchId,
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
        .eq("tenant_apotek_id", branchId)
        .eq("period_month", month)
        .eq("period_year", year)
        .maybeSingle();
      audit = again ?? audit;
    }
  }

  const { data: crewAudits } = audit
    ? await supabase
        .from("monthly_crew_audits")
        .select("*, app_users(full_name)")
        .eq("monthly_audit_id", audit.id)
    : { data: [] };

  const { data: payrollConfigs } = await supabase.from("payroll_configs").select("*").eq("tenant_apotek_id", branchId);

  const { data: productFokusConfigs } = await supabase
    .from("product_fokus_configs")
    .select("*, master_products(product_name)")
    .eq("tenant_apotek_id", branchId)
    .eq("period_month", month)
    .eq("period_year", year);

  const { data: internalReviews } = await supabase
    .from("peer_reviews")
    .select(
      "id, reviewer_user_id, reviewee_user_id, rating, comment, period_month, period_year, created_at, reviewer:reviewer_user_id(full_name)",
    )
    .eq("tenant_apotek_id", branchId)
    .eq("period_month", month)
    .eq("period_year", year);

  const { data: customerReviews } = await supabase
    .from("customer_review_logs")
    .select("*")
    .eq("tenant_apotek_id", branchId)
    .gte("created_at", startDate)
    .lte("created_at", endDate + "T23:59:59Z");

  const { data: addons } = await supabase
    .from("addon_settings")
    .select("*")
    .eq("tenant_apotek_id", branchId)
    .eq("is_enabled", true);

  const attendanceFrom = `${startDate}T00:00:00.000Z`;
  const attendanceTo = `${endDate}T23:59:59.999Z`;
  // 12-month start year for branch trend
  const histStartYear = new Date(year, month - 1 - 11, 1).getFullYear();

  const [
    { data: attendanceLogs },
    { data: leaveRequestsApproved },
    { data: monthlyAddonAppraisals },
    { data: monthlyAppraisalPublishRows },
    { data: snapshotRows },
    { data: payrollPeriodData },
  ] = await Promise.all([
      supabase
        .from("attendance_logs")
        .select(
          `id, user_id, shift_schedule_id, clock_in_time, clock_out_time, photo_url, is_late, notes,
          shift_schedule:shift_schedules!shift_schedule_id (
            schedule_date, is_off, master_shifts ( shift_name, start_time, end_time )
          )`,
        )
        .eq("tenant_apotek_id", branchId)
        .gte("clock_in_time", attendanceFrom)
        .lte("clock_in_time", attendanceTo),
      supabase
        .from("leave_requests")
        .select("user_id, start_date, end_date, status, leave_type, reason")
        .eq("tenant_apotek_id", branchId)
        .eq("status", "approved")
        .lte("start_date", endDate)
        .gte("end_date", startDate),
      supabase
        .from("monthly_addon_appraisals")
        .select("*")
        .eq("tenant_apotek_id", branchId)
        .eq("period_month", month)
        .eq("period_year", year),
      supabase
        .from("monthly_appraisals")
        .select("is_published")
        .eq("tenant_apotek_id", branchId)
        .eq("period_month", month)
        .eq("period_year", year),
      supabase
        .from("leaderboard_snapshots")
        .select("period_month, period_year, omzet_value")
        .eq("tenant_apotek_id", branchId)
        .gte("period_year", histStartYear)
        .lte("period_year", year),
      supabase
        .from("payroll_periods")
        .select("*")
        .eq("tenant_apotek_id", branchId)
        .eq("period_start", startDate)
        .eq("period_end", endDate)
        .maybeSingle(),
    ]);

  // Aggregate snapshots → branch omzet by (month, year)
  const omzetByPeriod = new Map<string, number>();
  for (const s of snapshotRows ?? []) {
    const key = `${s.period_year}-${s.period_month}`;
    omzetByPeriod.set(key, (omzetByPeriod.get(key) ?? 0) + Number(s.omzet_value ?? 0));
  }
  // Build exactly 12 months ending at current period, oldest-first
  const branchOmzetHistori: BranchOmzetHistoriItem[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    branchOmzetHistori.push({ month: m, year: y, omzet: omzetByPeriod.get(`${y}-${m}`) ?? 0 });
  }

  const raportPeriodPublished =
    (monthlyAppraisalPublishRows?.length ?? 0) > 0 &&
    (monthlyAppraisalPublishRows ?? []).every((r) => Boolean(r.is_published));

  // Fetch payroll_items setelah kita tahu payroll_period-nya (sequential — items depends on period id)
  const payrollPeriod = payrollPeriodData ?? null;
  const { data: payrollItemsData } = payrollPeriod
    ? await supabase
        .from("payroll_items")
        .select("*, employee_profiles(*)")
        .eq("payroll_period_id", payrollPeriod.id)
        .order("created_at", { ascending: true })
    : { data: [] as any[] };
  const payrollItems = payrollItemsData ?? [];

  return {
    branch,
    kpi,
    achievements: achievements || [],
    crewAchievements: crewAchievements || [],
    audit,
    crewAudits: crewAudits || [],
    payrollConfigs: payrollConfigs || [],
    productFokusConfigs: productFokusConfigs || [],
    internalReviews: internalReviews || [],
    customerReviews: customerReviews || [],
    addons: addons || [],
    selectedDate,
    approvedProductRows: approvedProductRows || [],
    attendanceLogs: attendanceLogs ?? [],
    leaveRequestsApproved: leaveRequestsApproved ?? [],
    monthlyAddonAppraisals: monthlyAddonAppraisals ?? [],
    activeCrewCount: Number(activeCrewCount ?? 0),
    raportPeriodPublished,
    branchOmzetHistori,
    payrollPeriod,
    payrollItems,
  };
}
