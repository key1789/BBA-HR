import { AnimatedPage } from "@/components/shared/animated-page";
import { OwnerPortalShell } from "@/components/owner/owner-portal-shell";
import { getOwnerPortalContext } from "@/app/owner/_lib/owner-portal-context";
import { fetchAuditBranchDashboardData } from "@/lib/audit-branch-dashboard-data";
import { AuditDetailClient } from "@/app/bba/audit/[id]/audit-detail-client";
import { Building2 } from "lucide-react";

export default async function OwnerRingkasanBonusPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; date?: string; tenant?: string; verifiedOnly?: string }>;
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
  const auditPayload = await fetchAuditBranchDashboardData(
    ctx.supabase,
    ctx.activeOwnerMembership.tenantId,
    ctx.month,
    ctx.year,
    {
      selectedDateRaw: ctx.dateParam,
      bootstrapMonthlyAudit: false,
      verifiedOnly: ctx.verifiedOnly,
    },
  );

  if (!auditPayload) {
    return (
      <AnimatedPage>
        <p className="text-sm text-slate-600">Data cabang tidak dapat dimuat. Pastikan Anda masih memiliki akses.</p>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage>
      <OwnerPortalShell
        ctx={ctx}
        basePath="/owner/ringkasan-bonus"
        title={
          <>
            Ringkasan & <span className="text-amber-600">bonus</span>
          </>
        }
        dateForNav={auditPayload.selectedDate}
      >
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
          month={ctx.month}
          year={ctx.year}
          selectedDate={auditPayload.selectedDate}
          approvedProductRows={auditPayload.approvedProductRows}
          attendanceLogs={auditPayload.attendanceLogs}
          leaveRequestsApproved={auditPayload.leaveRequestsApproved}
          monthlyAddonAppraisals={auditPayload.monthlyAddonAppraisals}
          activeCrewCount={auditPayload.activeCrewCount}
          portalMode="owner"
          ownerSurface="ringkasan"
          ownerVerifiedOnly={ctx.verifiedOnly}
          ownerNavBasePath="/owner/ringkasan-bonus"
        />
      </OwnerPortalShell>
    </AnimatedPage>
  );
}
