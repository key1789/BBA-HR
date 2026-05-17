/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/auth-context";
import { AuditDetailClient } from "./audit-detail-client";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import {
  fetchAuditBranchDashboardData,
  resolveBranchRouteTenantId,
} from "@/lib/audit-branch-dashboard-data";

export const dynamic = "force-dynamic";

function routeIdFromPathname(pathname: string): string {
  const match = pathname.match(/\/bba\/audit\/([^/?#]+)/i);
  return match?.[1]?.trim() ?? "";
}

export default async function AuditDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id?: string | string[] }>;
  searchParams: Promise<any>;
}) {
  const p = await params;
  const sp = await searchParams;
  const month = parseInt(sp.month) || new Date().getMonth() + 1;
  const year = parseInt(sp.year) || new Date().getFullYear();

  const paramId =
    typeof p.id === "string" ? p.id.trim() : Array.isArray(p.id) ? String(p.id[0] ?? "").trim() : "";
  const headerPath = (await headers()).get("x-pathname") ?? "";
  const routeId = paramId || routeIdFromPathname(headerPath);

  const supabase = createAdminClient();
  const session = await getSessionContext();

  const tenantId = await resolveBranchRouteTenantId(supabase, routeId);
  if (!tenantId) return notFound();

  // Analyst hanya boleh akses apotek yang di-assign ke mereka
  if (session?.bbaPortalStaffRole === "analyst") {
    const assignedIds = new Set(
      (session.memberships ?? [])
        .filter((m) => m.role === "super_admin_bba")
        .map((m) => m.tenantId),
    );
    if (!assignedIds.has(tenantId)) return notFound();
  }

  const selectedDateRaw = typeof sp.date === "string" ? sp.date : "";
  const payload = await fetchAuditBranchDashboardData(supabase, tenantId, month, year, {
    selectedDateRaw,
    bootstrapMonthlyAudit: true,
  });

  if (!payload) return notFound();

  return (
    <AuditDetailClient
      branch={payload.branch}
      kpi={payload.kpi}
      achievements={payload.achievements}
      crewAchievements={payload.crewAchievements}
      audit={payload.audit}
      isGlobalSuperAdmin={Boolean(session?.isGlobalSuperAdmin)}
      crewAudits={payload.crewAudits}
      payrollConfigs={payload.payrollConfigs}
      productFokusConfigs={payload.productFokusConfigs}
      internalReviews={payload.internalReviews}
      customerReviews={payload.customerReviews}
      addons={payload.addons}
      month={month}
      year={year}
      selectedDate={payload.selectedDate}
      approvedProductRows={payload.approvedProductRows}
      attendanceLogs={payload.attendanceLogs}
      leaveRequestsApproved={payload.leaveRequestsApproved}
      monthlyAddonAppraisals={payload.monthlyAddonAppraisals}
      activeCrewCount={payload.activeCrewCount}
      raportPeriodPublished={payload.raportPeriodPublished}
    />
  );
}
