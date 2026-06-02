import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AnimatedPage } from "@/components/shared/animated-page";
import { fetchAuditBranchDashboardData } from "@/lib/audit-branch-dashboard-data";
import { AuditDetailClient } from "@/app/bba/audit/[id]/audit-detail-client";
import { FileBarChart2 } from "lucide-react";

export default async function AdminRingkasanBulananPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; date?: string }>;
}) {
  const session = await getSessionContext();
  const active = session?.activeMembership;

  if (!active || active.role !== "admin_apotek") {
    redirect("/admin/dashboard");
  }

  const params = await searchParams;
  const now = new Date();
  const monthRaw = Number(params.month ?? NaN);
  const yearRaw = Number(params.year ?? NaN);
  const month = Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : now.getMonth() + 1;
  const year = Number.isInteger(yearRaw) && yearRaw >= 2000 ? yearRaw : now.getFullYear();

  const supabase = await createClient();

  const auditPayload = await fetchAuditBranchDashboardData(
    supabase,
    active.tenantId,
    month,
    year,
    {
      selectedDateRaw: params.date,
      bootstrapMonthlyAudit: false, // Admin hanya bisa lihat, tidak bisa buat record baru
      verifiedOnly: true,
    },
  );

  if (!auditPayload) {
    return (
      <AnimatedPage className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-violet-50 flex items-center justify-center">
          <FileBarChart2 size={28} className="text-violet-400" />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-800">Laporan Belum Tersedia</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            BBA belum memulai proses audit untuk periode{" "}
            <strong>
              {month}/{year}
            </strong>
            . Data akan muncul setelah BBA membuka periode audit.
          </p>
        </div>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage>
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
        ownerSurface="bulanan"
        ownerVerifiedOnly={true}
        ownerNavBasePath="/admin/ringkasan-bulanan"
      />
    </AnimatedPage>
  );
}
