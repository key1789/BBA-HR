/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient } from "@/lib/supabase/admin";
import { AuditListClient } from "./audit-list-client";
import { ClipboardCheck } from "lucide-react";

export default async function AuditPage({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const month = parseInt(sp.month) || new Date().getMonth() + 1;
  const year = parseInt(sp.year) || new Date().getFullYear();

  const supabase = createAdminClient();

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const startDate = `${year}-${pad2(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEndDate = `${year}-${pad2(month)}-${pad2(lastDay)}`;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  const isSelectedCurrentMonth =
    today.getFullYear() === year && today.getMonth() + 1 === month;
  const effectiveEndDate = isSelectedCurrentMonth ? (todayKey > monthEndDate ? monthEndDate : todayKey) : monthEndDate;

  // 1. Fetch Branches
  const { data: branches } = await supabase
    .from("tenant_apotek")
    .select("id, name, code, status")
    .order("name", { ascending: true });

  const branchIds = (branches ?? []).map((b: any) => b.id).filter(Boolean);

  // 2. Fetch Audits for this period
  const { data: audits } = await supabase
    .from("monthly_audits")
    .select("*")
    .eq("period_month", month)
    .eq("period_year", year);

  const [{ data: kpiConfigs }, { data: submissionRows }, { data: membershipRows }] = await Promise.all([
    branchIds.length
      ? supabase
          .from("kpi_configs")
          .select("tenant_apotek_id, target_omzet")
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
          .select("tenant_apotek_id")
          .in("tenant_apotek_id", branchIds)
          .eq("is_active", true)
          .in("role", ["crew", "admin_apotek"])
      : Promise.resolve({ data: [] as { tenant_apotek_id: string }[] }),
  ]);

  const targetByBranch = new Map<string, number>();
  for (const row of kpiConfigs ?? []) {
    const id = row.tenant_apotek_id as string;
    if (!id) continue;
    targetByBranch.set(id, Number((row as any).target_omzet ?? 0));
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
    crewAdminCountByBranch.set(id, (crewAdminCountByBranch.get(id) ?? 0) + 1);
  }

  const branchMetrics: Record<string, { targetOmzet: number; omzetAchieved: number; crewAdminCount: number }> = {};
  for (const id of branchIds) {
    branchMetrics[id] = {
      targetOmzet: targetByBranch.get(id) ?? 0,
      omzetAchieved: omzetByBranch.get(id) ?? 0,
      crewAdminCount: crewAdminCountByBranch.get(id) ?? 0,
    };
  }

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/20">
              <ClipboardCheck className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Approval & Audit</h1>
              <p className="text-slate-500 font-bold text-sm uppercase tracking-widest flex items-center gap-2">
                Pusat Kendali Performa Cabang <span className="w-1 h-1 bg-slate-300 rounded-full"></span> {branches?.length || 0} Cabang
              </p>
            </div>
          </div>
        </div>
      </div>

      <AuditListClient
        branches={branches || []}
        audits={audits || []}
        branchMetrics={branchMetrics}
        currentMonth={month}
        currentYear={year}
        periodLabel={{
          mtdNote: isSelectedCurrentMonth,
          effectiveEndDate,
        }}
      />
    </div>
  );
}
