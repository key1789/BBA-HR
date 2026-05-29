/* eslint-disable @typescript-eslint/no-explicit-any */
import { AnimatedPage } from "@/components/shared/animated-page";
import { OwnerPortalShell } from "@/components/owner/owner-portal-shell";
import { getOwnerPortalContext } from "@/app/owner/_lib/owner-portal-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { Building2 } from "lucide-react";
import { OwnerPayrollClient } from "./owner-payroll-client";

export default async function OwnerPayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; tenant?: string }>;
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

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const startDate = `${year}-${pad2(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${pad2(month)}-${pad2(lastDay)}`;

  const supabaseAdmin = createAdminClient();

  // Fetch payroll period for current month
  const { data: period } = await supabaseAdmin
    .from("payroll_periods")
    .select("id, period_start, period_end, status, notes, submitted_at, approved_at")
    .eq("tenant_apotek_id", tenantId)
    .eq("period_start", startDate)
    .eq("period_end", endDate)
    .maybeSingle();

  // Fetch payroll items with employee names
  let payrollItems: any[] = [];
  if (period) {
    const { data: rawItems } = await supabaseAdmin
      .from("payroll_items")
      .select("employee_profile_id, base_salary, allowance, deduction, net_salary")
      .eq("payroll_period_id", period.id);

    if (rawItems && rawItems.length > 0) {
      const userIds = rawItems.map((i: any) => i.employee_profile_id);
      const { data: users } = await supabaseAdmin
        .from("app_users")
        .select("id, full_name")
        .in("id", userIds);

      const nameMap = new Map((users ?? []).map((u: any) => [u.id, u.full_name ?? "—"]));
      payrollItems = rawItems.map((item: any) => ({
        ...item,
        name: nameMap.get(item.employee_profile_id) ?? "—",
      }));
    }
  }

  // Fetch recent 6 months summary
  const recentPeriods: any[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(year, month - 1 - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    const s = `${y}-${pad2(m)}-01`;
    const e = `${y}-${pad2(m)}-${pad2(new Date(y, m, 0).getDate())}`;
    recentPeriods.push({ month: m, year: y, period_start: s, period_end: e });
  }

  const startDates = recentPeriods.map((p) => p.period_start);
  const { data: summaryPeriods } = await supabaseAdmin
    .from("payroll_periods")
    .select("id, period_start, status, notes")
    .eq("tenant_apotek_id", tenantId)
    .in("period_start", startDates);

  const summaryMap = new Map((summaryPeriods ?? []).map((p: any) => [p.period_start, p]));
  const recentSummary = recentPeriods.map((p) => ({
    ...p,
    dbPeriod: summaryMap.get(p.period_start) ?? null,
  }));

  return (
    <AnimatedPage>
      <OwnerPortalShell
        ctx={ctx}
        basePath="/owner/payroll"
        title={
          <>
            Payroll & <span className="text-amber-600">Gaji</span>
          </>
        }
        subtitle="Review dan setujui rekap gaji pegawai sebelum dikunci."
      >
        <OwnerPayrollClient
          currentMonth={month}
          currentYear={year}
          period={period ?? null}
          payrollItems={payrollItems}
          recentSummary={recentSummary}
        />
      </OwnerPortalShell>
    </AnimatedPage>
  );
}
