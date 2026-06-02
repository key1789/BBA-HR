/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/auth-context";
import { AuditDetailClient } from "./audit-detail-client";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { AnimatedPage } from "@/components/shared/animated-page";
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

  // After tenantId is resolved, fetch is_trial
  const { data: tenantRow } = await supabase
    .from("tenant_apotek")
    .select("is_trial")
    .eq("id", tenantId)
    .maybeSingle();
  const isTrialBranch = tenantRow?.is_trial === true;

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

  const kpiMissing = !payload.kpi?.bonus_config_v2;

  return (
    <AnimatedPage className="space-y-4">
      {kpiMissing && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4">
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <p className="text-sm font-bold text-amber-800 flex-1">
            KPI belum dikonfigurasi untuk periode ini — bonus tidak akan terhitung otomatis.
          </p>
          <Link
            href={`/bba/branches/${tenantId}?tab=kpi&month=${month}&year=${year}`}
            className="shrink-0 text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-xl px-3 py-1.5 transition-colors"
          >
            Konfigurasi →
          </Link>
        </div>
      )}
      <AuditDetailClient
        branch={payload.branch}
      kpi={payload.kpi}
      achievements={payload.achievements}
      crewAchievements={payload.crewAchievements}
      audit={payload.audit}
      isGlobalSuperAdmin={Boolean(session?.isGlobalSuperAdmin)}
      isTrialBranch={isTrialBranch}
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
      branchOmzetHistori={payload.branchOmzetHistori}
      payrollPeriod={payload.payrollPeriod}
      payrollItems={payload.payrollItems}
      />
    </AnimatedPage>
  );
}
