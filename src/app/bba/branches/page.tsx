/* eslint-disable @typescript-eslint/no-explicit-any */
import { isBranchOperationalPersonnel } from "@/lib/branch-personnel";
import { createAdminClient } from "@/lib/supabase/admin";
import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { AddBranchButton } from "./add-branch-button";
import { BranchListClient } from "./branch-list-client";
import { Store, Users, Activity } from "lucide-react";


export default async function BbaBranchesPage() {
  const supabaseAdmin = createAdminClient();

  // Ambil semua owner IDs: dari auth metadata + dari memberships (owner tanpa apotek juga masuk)
  const [{ data: branches }, { data: authUsers }, { data: assignedOwners }] = await Promise.all([
    supabaseAdmin
      .from("tenant_apotek")
      .select(`
        *,
        tenant_memberships(
          id,
          role,
          is_active,
          user_id,
          app_users(full_name, is_branch_desk_account)
        ),
        addon_settings(addon_key, is_enabled)
      `)
      .order("created_at", { ascending: false }),

    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),

    supabaseAdmin
      .from("tenant_memberships")
      .select("user_id")
      .eq("role", "owner"),
  ]);

  const authOwnerIds = (authUsers?.users ?? [])
    .filter((u) => u.user_metadata?.role === "owner")
    .map((u) => u.id);
  const assignedOwnerIds = (assignedOwners ?? []).map((m) => m.user_id);
  const allOwnerIds = Array.from(new Set([...authOwnerIds, ...assignedOwnerIds]));

  // Untuk trial modal: hanya owner yang is_demo = true
  const { data: trialOwnerProfiles } = allOwnerIds.length > 0
    ? await supabaseAdmin
        .from("app_users")
        .select("id, full_name")
        .in("id", allOwnerIds)
        .eq("is_active", true)
        .eq("is_demo", true)
        .order("full_name")
    : { data: [] as { id: string; full_name: string }[] };

  const trialOwners = trialOwnerProfiles ?? [];

  // Completeness data: KPI configs + master shifts per branch
  const branchIds = branches?.map(b => b.id) ?? [];
  const [{ data: kpiConfigs }, { data: masterShiftsAll }] = branchIds.length > 0
    ? await Promise.all([
        supabaseAdmin.from("kpi_configs").select("tenant_apotek_id").in("tenant_apotek_id", branchIds),
        supabaseAdmin.from("master_shifts").select("tenant_apotek_id").in("tenant_apotek_id", branchIds),
      ])
    : [{ data: [] as { tenant_apotek_id: string }[] }, { data: [] as { tenant_apotek_id: string }[] }];

  const branchesWithKpi = new Set((kpiConfigs ?? []).map(k => k.tenant_apotek_id));
  const branchShiftCounts = (masterShiftsAll ?? []).reduce<Record<string, number>>((acc, s) => {
    acc[s.tenant_apotek_id] = (acc[s.tenant_apotek_id] || 0) + 1;
    return acc;
  }, {});

  // Map branches dengan crew count + addon flags
  const displayData = branches?.map(branch => {
    const activeCrewCount =
      branch.tenant_memberships?.filter((m: any) => {
        if (!m.is_active) return false;
        const au = Array.isArray(m.app_users) ? m.app_users[0] : m.app_users;
        return isBranchOperationalPersonnel({ role: m.role, app_users: au });
      }).length || 0;

    const isAddonEnabled = (key: string) =>
      branch.addon_settings?.some((a: any) => a.addon_key === key && a.is_enabled);

    const owner = branch.tenant_memberships?.find((m: any) => m.role === "owner")?.app_users;
    const ownerName = owner
      ? Array.isArray(owner) ? owner[0]?.full_name : owner.full_name
      : "Tanpa Owner";

    return {
      ...branch,
      ownerName,
      crewCount: activeCrewCount,
      addon_produk:    isAddonEnabled("produk_fokus"),
      addon_payroll:   isAddonEnabled("payroll"),
      addon_review_p:  isAddonEnabled("review_pelanggan"),
      addon_review_i:  isAddonEnabled("review_internal"),
      addon_absensi:   isAddonEnabled("absensi_shift"),
      hasKpi:          branchesWithKpi.has(branch.id),
      shiftCount:      branchShiftCounts[branch.id] ?? 0,
    };
  }) || [];

  return (
    <AnimatedPage className="space-y-6">
      {/* HEADER PAGE */}
      <GlassCard className="p-4 sm:p-5" variant="light">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-sky-600/25">
              <Store size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase leading-tight">
                Master Apotek (Cabang)
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">Kelola data tenant, target KPI, dan konfigurasi cabang.</p>
            </div>
          </div>
          <div className="shrink-0">
            <AddBranchButton />
          </div>
        </div>
      </GlassCard>

      {/* QUICK STATS — compact chips */}
      {(() => {
        const prodData = displayData.filter(b => !b.is_trial);
        const totalCrew   = prodData.reduce((acc, curr) => acc + curr.crewCount, 0);
        const totalAddons = prodData.reduce((acc, curr) => {
          let n = 0;
          if (curr.addon_produk)   n++;
          if (curr.addon_payroll)  n++;
          if (curr.addon_review_p) n++;
          if (curr.addon_review_i) n++;
          if (curr.addon_absensi)  n++;
          return acc + n;
        }, 0);

        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <GlassCard className="p-3.5 border-l-4 border-l-sky-500" variant="light">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                  <Store size={18} />
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Cabang</p>
                  <p className="text-2xl font-black text-slate-900 leading-none">{prodData.length}</p>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-3.5 border-l-4 border-l-indigo-500" variant="light">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Users size={18} />
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Crew</p>
                  <p className="text-2xl font-black text-slate-900 leading-none">{totalCrew}</p>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-3.5 border-l-4 border-l-emerald-500" variant="light">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Activity size={18} />
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Add-on Aktif</p>
                  <p className="text-2xl font-black text-slate-900 leading-none">{totalAddons}</p>
                </div>
              </div>
            </GlassCard>
          </div>
        );
      })()}

      {/* CLIENT COMPONENT */}
      <BranchListClient initialData={displayData} trialOwners={trialOwners} />
    </AnimatedPage>
  );
}
