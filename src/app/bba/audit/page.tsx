/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/auth-context";
import { AuditListClient } from "./audit-list-client";
import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { ClipboardCheck, Store, Eye, CheckCircle2 } from "lucide-react";
import { isBranchOperationalPersonnel } from "@/lib/branch-personnel";
import { getKpiV2SchemesEnabledForPeriod, isKpiConfigV2 } from "@/lib/kpi-v2/utils";
import type { KpiConfigV2 } from "@/lib/types/kpi-v2";

export default async function AuditPage({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const month = parseInt(sp.month) || new Date().getMonth() + 1;
  const year = parseInt(sp.year) || new Date().getFullYear();

  const supabase = createAdminClient();
  const session = await getSessionContext();
  const isAnalyst = session?.bbaPortalStaffRole === "analyst";

  // Analyst hanya lihat cabang yang di-assign ke mereka
  const analystBranchIds = isAnalyst
    ? (session?.memberships ?? [])
        .filter((m) => m.role === "super_admin_bba")
        .map((m) => m.tenantId)
        .filter(Boolean)
    : null;

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const startDate = `${year}-${pad2(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEndDate = `${year}-${pad2(month)}-${pad2(lastDay)}`;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  const isSelectedCurrentMonth =
    today.getFullYear() === year && today.getMonth() + 1 === month;
  const effectiveEndDate = isSelectedCurrentMonth ? (todayKey > monthEndDate ? monthEndDate : todayKey) : monthEndDate;

  // 1. Fetch Branches — analyst hanya dapat cabang mereka
  const branchQuery = supabase
    .from("tenant_apotek")
    .select("id, name, code, status, is_trial")
    .order("name", { ascending: true });

  if (analystBranchIds !== null) {
    branchQuery.in("id", analystBranchIds.length > 0 ? analystBranchIds : ["00000000-0000-0000-0000-000000000000"]);
  }

  const { data: branches } = await branchQuery;

  const branchIds = (branches ?? []).map((b: any) => b.id).filter(Boolean);

  // 2. Fetch Audits for this period
  const { data: audits } = branchIds.length
    ? await supabase
        .from("monthly_audits")
        .select("id, tenant_apotek_id, status, period_month, period_year")
        .eq("period_month", month)
        .eq("period_year", year)
        .in("tenant_apotek_id", branchIds)
    : { data: [] as { id: string; tenant_apotek_id: string; status: string; period_month: number; period_year: number }[] };

  const [{ data: kpiConfigs }, { data: submissionRows }, { data: membershipRows }] = await Promise.all([
    branchIds.length
      ? supabase
          .from("kpi_configs")
          .select("tenant_apotek_id, target_omzet, bonus_config_v2")
          .eq("period_month", month)
          .eq("period_year", year)
          .in("tenant_apotek_id", branchIds)
      : Promise.resolve({ data: [] as { tenant_apotek_id: string; target_omzet: number }[] }),
    branchIds.length
      ? supabase
          .from("daily_submissions")
          .select("tenant_apotek_id, omzet_total, submission_date")
          .in("status", ["approved", "edited_by_admin"])
          .in("tenant_apotek_id", branchIds)
          .gte("submission_date", startDate)
          .lte("submission_date", effectiveEndDate)
      : Promise.resolve({ data: [] as { tenant_apotek_id: string; omzet_total: number; submission_date: string }[] }),
    branchIds.length
      ? supabase
          .from("tenant_memberships")
          .select("tenant_apotek_id, role, app_users(is_branch_desk_account)")
          .in("tenant_apotek_id", branchIds)
          .eq("is_active", true)
          .in("role", ["crew", "admin_apotek"])
      : Promise.resolve({ data: [] as { tenant_apotek_id: string; role: string; app_users?: unknown }[] }),
  ]);

  const targetByBranch = new Map<string, number>();
  for (const row of kpiConfigs ?? []) {
    const id = row.tenant_apotek_id as string;
    if (!id) continue;
    const legacyTarget = Number((row as any).target_omzet ?? 0);
    const v2Raw = (row as { bonus_config_v2?: unknown }).bonus_config_v2;
    if (isKpiConfigV2(v2Raw)) {
      const v2 = v2Raw as KpiConfigV2;
      targetByBranch.set(id, Number(v2.global?.target_omzet ?? legacyTarget) || legacyTarget);
    } else {
      targetByBranch.set(id, legacyTarget);
    }
  }

  const omzetByBranch = new Map<string, number>();
  for (const row of submissionRows ?? []) {
    const id = row.tenant_apotek_id as string;
    if (!id) continue;
    omzetByBranch.set(id, (omzetByBranch.get(id) ?? 0) + Number((row as any).omzet_total ?? 0));
  }

  const crewAdminCountByBranch = new Map<string, number>();
  for (const row of membershipRows ?? []) {
    const id = row.tenant_apotek_id as string;
    if (!id) continue;
    const au = Array.isArray((row as any).app_users) ? (row as any).app_users[0] : (row as any).app_users;
    if (!isBranchOperationalPersonnel({ role: (row as any).role, app_users: au })) continue;
    crewAdminCountByBranch.set(id, (crewAdminCountByBranch.get(id) ?? 0) + 1);
  }

  const kpiV2ActiveByBranch: Record<string, boolean> = {};
  for (const row of kpiConfigs ?? []) {
    const id = row.tenant_apotek_id as string;
    if (!id) continue;
    const v2Raw = (row as { bonus_config_v2?: unknown }).bonus_config_v2;
    if (isKpiConfigV2(v2Raw) && getKpiV2SchemesEnabledForPeriod(v2Raw as KpiConfigV2).length > 0) {
      kpiV2ActiveByBranch[id] = true;
    }
  }

  const branchMetrics: Record<string, { targetOmzet: number; omzetAchieved: number; crewAdminCount: number }> = {};
  for (const id of branchIds) {
    branchMetrics[id] = {
      targetOmzet: targetByBranch.get(id) ?? 0,
      omzetAchieved: omzetByBranch.get(id) ?? 0,
      crewAdminCount: crewAdminCountByBranch.get(id) ?? 0,
    };
  }

  // Quick stats
  const prodBranches = (branches ?? []).filter((b: any) => !b.is_trial);
  const statTotal       = prodBranches.length;
  const statUnderReview = (audits ?? []).filter((a: any) => a.status === "UNDER_REVIEW").length;
  const statApproved    = (audits ?? []).filter((a: any) => a.status === "APPROVED").length;

  return (
    <AnimatedPage className="space-y-6">
      {/* HEADER */}
      <GlassCard className="p-4 sm:p-5" variant="light">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-sky-600/25">
            <ClipboardCheck size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase leading-tight">
              Approval &amp; Audit
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {isAnalyst ? "Portal Analyst" : "Pusat Kendali Performa Cabang"} · {branches?.length || 0} cabang periode {month}/{year}
            </p>
          </div>
        </div>
      </GlassCard>

      {/* QUICK STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <GlassCard className="p-3.5 border-l-4 border-l-sky-500" variant="light">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
              <Store size={18} />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Cabang</p>
              <p className="text-2xl font-black text-slate-900 leading-none">{statTotal}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-3.5 border-l-4 border-l-amber-400" variant="light">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
              <Eye size={18} />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Under Review</p>
              <p className="text-2xl font-black text-slate-900 leading-none">{statUnderReview}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-3.5 border-l-4 border-l-emerald-500" variant="light">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Approved</p>
              <p className="text-2xl font-black text-slate-900 leading-none">{statApproved}</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* CLIENT COMPONENT */}
      <AuditListClient
        branches={branches || []}
        audits={audits || []}
        branchMetrics={branchMetrics}
        kpiV2ActiveByBranch={kpiV2ActiveByBranch}
        currentMonth={month}
        currentYear={year}
        periodLabel={{
          mtdNote: isSelectedCurrentMonth,
          effectiveEndDate,
        }}
      />
    </AnimatedPage>
  );
}
