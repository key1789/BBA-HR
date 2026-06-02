import { AnimatedPage } from "@/components/shared/animated-page";
import { getOwnerPortalContext } from "@/app/owner/_lib/owner-portal-context";
import { fetchAuditBranchDashboardData } from "@/lib/audit-branch-dashboard-data";
import { AuditDetailClient } from "@/app/bba/audit/[id]/audit-detail-client";
import { Building2 } from "lucide-react";
import { OwnerPortalShell } from "@/components/owner/owner-portal-shell";
import { OwnerPerformaTabs } from "./owner-performa-client";

export const dynamic = "force-dynamic";

export default async function OwnerPerformaPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    year?: string;
    date?: string;
    tenant?: string;
    tab?: string;
  }>;
}) {
  const params = await searchParams;
  const ctxResult = await getOwnerPortalContext(params);

  if (!ctxResult.ok) {
    if (ctxResult.reason === "no_owner") {
      return (
        <AnimatedPage className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="h-16 w-16 text-slate-300 mb-4" />
          <h1 className="text-xl font-black text-slate-800 uppercase">Belum ada cabang</h1>
          <p className="text-slate-500 mt-2">Akun Anda belum ditugaskan sebagai owner apotek manapun.</p>
        </AnimatedPage>
      );
    }
    return <p className="text-sm text-slate-600">Halaman ini khusus owner.</p>;
  }

  const { data: ctx } = ctxResult;
  const tenantId = ctx.activeOwnerMembership.tenantId;
  const { month, year } = ctx;

  // Tab is driven purely by ?tab= param. Shell navigation explicitly preserves it.
  const activeTab: "bulanan" | "harian" = params.tab === "harian" ? "harian" : "bulanan";

  const auditPayload = await fetchAuditBranchDashboardData(
    ctx.supabase,
    tenantId,
    month,
    year,
    {
      selectedDateRaw: activeTab === "harian" ? ctx.dateParam : "",
      bootstrapMonthlyAudit: false,
    },
  );

  if (!auditPayload) {
    return (
      <AnimatedPage>
        <p className="text-sm text-slate-600">
          Data cabang tidak dapat dimuat. Pastikan Anda masih memiliki akses.
        </p>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage>
      <OwnerPortalShell
        ctx={ctx}
        basePath="/owner/performa"
        title="PERFORMA APOTEK"
        subtitle={`Data harian dan bulanan ${ctx.activeOwnerMembership.tenantName}`}
        dateForNav={activeTab === "harian" ? auditPayload.selectedDate : undefined}
        activeTabParam={activeTab === "harian" ? "harian" : undefined}
      >
        <OwnerPerformaTabs activeTab={activeTab} />

        <AuditDetailClient
          branch={auditPayload.branch}
          kpi={auditPayload.kpi}
          achievements={auditPayload.achievements}
          crewAchievements={auditPayload.crewAchievements}
          audit={auditPayload.audit}
          isGlobalSuperAdmin={false}
          crewAudits={auditPayload.crewAudits}
          payrollConfigs={auditPayload.payrollConfigs}
          productFokusConfigs={auditPayload.productFokusConfigs}
          internalReviews={auditPayload.internalReviews}
          customerReviews={auditPayload.customerReviews}
          addons={auditPayload.addons}
          month={month}
          year={year}
          selectedDate={auditPayload.selectedDate}
          approvedProductRows={auditPayload.approvedProductRows}
          attendanceLogs={auditPayload.attendanceLogs}
          leaveRequestsApproved={auditPayload.leaveRequestsApproved}
          monthlyAddonAppraisals={auditPayload.monthlyAddonAppraisals}
          activeCrewCount={auditPayload.activeCrewCount}
          raportPeriodPublished={auditPayload.raportPeriodPublished}
          branchOmzetHistori={auditPayload.branchOmzetHistori}
          portalMode="owner"
          ownerSurface={activeTab}
        />
      </OwnerPortalShell>
    </AnimatedPage>
  );
}
