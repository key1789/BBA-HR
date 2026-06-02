/* eslint-disable @typescript-eslint/no-explicit-any */
import { AnimatedPage } from "@/components/shared/animated-page";
import { OwnerPortalShell } from "@/components/owner/owner-portal-shell";
import { getOwnerPortalContext } from "@/app/owner/_lib/owner-portal-context";
import { fetchAuditBranchDashboardData } from "@/lib/audit-branch-dashboard-data";
import { AuditDetailClient } from "@/app/bba/audit/[id]/audit-detail-client";
import { Building2 } from "lucide-react";
import { OwnerKompensasiTabs } from "./owner-kompensasi-tabs";

export const dynamic = "force-dynamic";

type OwnerSurface = "per-karyawan" | "payroll";

export default async function OwnerKompensasiPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    month?: string;
    year?: string;
    date?: string;
    tenant?: string;
  }>;
}) {
  const params = await searchParams;

  // Mirror the audit portal's tab ids directly:
  // "per-karyawan" → "Karyawan & Penilaian" (default)
  // "payroll"      → "Rapor & Payroll"
  const activeTab: OwnerSurface = params.tab === "payroll" ? "payroll" : "per-karyawan";

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

  // Both tabs use the same audit dashboard data — one fetch covers both surfaces.
  const auditPayload = await fetchAuditBranchDashboardData(
    ctx.supabase,
    tenantId,
    month,
    year,
    {
      selectedDateRaw: ctx.dateParam,
      bootstrapMonthlyAudit: false,
    },
  );

  const payrollAddonEnabled = (auditPayload?.addons ?? []).some(
    (a: any) => a.addon_key === "payroll",
  );

  // If payroll tab is requested but addon is disabled, fall back to per-karyawan
  const resolvedTab: OwnerSurface =
    activeTab === "payroll" && !payrollAddonEnabled ? "per-karyawan" : activeTab;

  return (
    <AnimatedPage>
      <OwnerPortalShell
        ctx={ctx}
        basePath="/owner/kompensasi"
        title="PERFORMA KARYAWAN"
        subtitle={`Kinerja & rekap payroll karyawan ${ctx.activeOwnerMembership.tenantName}`}
        activeTabParam={resolvedTab}
      >
        {/* ── Tab switcher — mirrors audit portal tabs ── */}
        <OwnerKompensasiTabs activeTab={resolvedTab} showPayrollTab={payrollAddonEnabled} />

        {/* ── Content: same AuditDetailClient, different ownerSurface ── */}
        {auditPayload ? (
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
            ownerSurface={resolvedTab}
          />
        ) : (
          <p className="text-sm text-slate-600 py-6">
            Data tidak dapat dimuat. Pastikan Anda masih memiliki akses.
          </p>
        )}
      </OwnerPortalShell>
    </AnimatedPage>
  );
}
