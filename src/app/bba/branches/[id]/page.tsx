import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { AnimatedPage } from "@/components/shared/animated-page";
import { BranchDetailClient } from "./branch-detail-client";

export default async function BranchDetailPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<{ month?: string, year?: string }> }) {
  const { id } = await params;
  const { month, year } = await searchParams;
  const supabase = await createClient();
  const supabaseAdmin = createAdminClient();
  const now = new Date();
  
  const monthNum = month ? Number(month) : NaN;
  const yearNum = year ? Number(year) : NaN;
  const currentMonth = Number.isInteger(monthNum) && monthNum >= 1 && monthNum <= 12 ? monthNum : now.getMonth() + 1;
  const currentYear = Number.isInteger(yearNum) && yearNum >= 2000 ? yearNum : now.getFullYear();

  // 1. Fetch Branch Info
  const { data: branch, error: branchError } = await supabase
    .from("tenant_apotek")
    .select("*")
    .eq("id", id)
    .single();

  if (branchError || !branch) {
    notFound();
  }

  // 2. Memberships + profil: superadmin global tidak selalu share tenant dengan owner/crew via RLS app_users.
  // Halaman /bba/* hanya untuk super_admin_bba (layout) — service read aman & konsisten.
  const { data: users } = await supabaseAdmin
    .from("tenant_memberships")
    .select(`
      id,
      role,
      is_active,
      app_users (id, full_name, email, phone, is_active)
    `)
    .eq("tenant_apotek_id", id)
    .order("assigned_at", { ascending: false });

  // 3. Fetch KPI Config for specific period
  const { data: kpi } = await supabase
    .from("kpi_configs")
    .select("*")
    .eq("tenant_apotek_id", id)
    .eq("period_month", currentMonth)
    .eq("period_year", currentYear)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // 4. Fetch Addon Settings
  const { data: addons } = await supabase
    .from("addon_settings")
    .select("*")
    .eq("tenant_apotek_id", id);

  // 5. Fetch Master Shifts
  const { data: shifts } = await supabase
    .from("master_shifts")
    .select("*")
    .eq("tenant_apotek_id", id)
    .order("start_time", { ascending: true });

  // 6. Fetch Master Products
  const { data: products } = await supabaseAdmin
    .from("master_products")
    .select("*")
    .order("product_name", { ascending: true });

  // 7. Fetch Product Fokus Configs (Specific Period)
  const { data: productFokus } = await supabaseAdmin
    .from("product_fokus_configs")
    .select(`
      *,
      master_products (product_name)
    `)
    .eq("tenant_apotek_id", id)
    .eq("period_month", currentMonth)
    .eq("period_year", currentYear);

  // 8. Fetch Roster (Specific Period)
  // schedule_date adalah tipe DATE; gunakan batas YYYY-MM-DD agar tidak miss karena timezone/ISO timestamp.
  const startDate = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
  const endDate = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(
    new Date(currentYear, currentMonth, 0).getDate()
  ).padStart(2, "0")}`;

  // Gunakan admin read agar roster tidak kosong karena variasi RLS/session context.
  const { data: roster } = await supabaseAdmin
    .from("shift_schedules")
    .select("*")
    .eq("tenant_apotek_id", id)
    .gte("schedule_date", startDate)
    .lte("schedule_date", endDate)
    .order("schedule_date", { ascending: true });

  // 9. Fetch Payroll Configs
  const { data: payrollConfigs } = await supabaseAdmin
    .from("payroll_configs")
    .select("*")
    .eq("tenant_apotek_id", id);

  // 10. Fetch Activity Logs
  const { data: activityLogs } = await supabase
    .from("activity_logs")
    .select("*")
    .eq("tenant_apotek_id", id)
    .order("created_at", { ascending: false })
    .limit(100);

  // 11. Fetch Available Owners (only users who actually have owner role somewhere)
  const { data: ownerMemberships } = await supabaseAdmin
    .from("tenant_memberships")
    .select(`
      user_id,
      app_users!inner (
        id,
        full_name,
        email,
        is_active
      )
    `)
    .eq("role", "owner")
    .eq("is_active", true)
    .eq("app_users.is_active", true);

  const availableOwnersData = Array.from(
    new Map(
      (ownerMemberships || [])
        .map((membership) => {
          const appUser = Array.isArray(membership.app_users)
            ? membership.app_users[0]
            : membership.app_users;
          if (!appUser?.id) return null;
          return [
            appUser.id,
            {
              id: appUser.id,
              full_name: appUser.full_name,
              email: appUser.email,
            },
          ] as const;
        })
        .filter(Boolean) as Array<
        readonly [
          string,
          { id: string; full_name: string; email: string },
        ]
      >
    ).values()
  ).sort((a, b) => a.full_name.localeCompare(b.full_name, "id"));

  return (
    <AnimatedPage>
      <BranchDetailClient 
        branch={branch} 
        users={users || []} 
        kpi={kpi || null} 
        addons={addons || []}
        shifts={shifts || []}
        products={products || []}
        productFokus={productFokus || []}
        roster={roster || []}
        payrollConfigs={payrollConfigs || []}
        activityLogs={activityLogs || []}
        availableOwners={availableOwnersData || []}
        currentMonth={currentMonth}
        currentYear={currentYear}
      />
    </AnimatedPage>

  );
}
