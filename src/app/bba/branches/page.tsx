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
  
  const { data: branches } = await supabaseAdmin
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
    .order("created_at", { ascending: false });


  // Map branches with actual crew count and addons
  const displayData = branches?.map(branch => {
    const activeCrewCount =
      branch.tenant_memberships?.filter((m: any) => {
        if (!m.is_active) return false;
        const au = Array.isArray(m.app_users) ? m.app_users[0] : m.app_users;
        return isBranchOperationalPersonnel({ role: m.role, app_users: au });
      }).length || 0;

    const isAddonEnabled = (key: string) => branch.addon_settings?.some((a: any) => a.addon_key === key && a.is_enabled);

    const owner = branch.tenant_memberships?.find((m: any) => m.role === 'owner')?.app_users;
    const ownerName = owner ? (Array.isArray(owner) ? owner[0]?.full_name : owner.full_name) : "Tanpa Owner";

    return {
      ...branch,
      ownerName,
      crewCount: activeCrewCount,
      addon_produk: isAddonEnabled('produk_fokus'),
      addon_payroll: isAddonEnabled('payroll'),
      addon_review_p: isAddonEnabled('review_pelanggan'),
      addon_review_i: isAddonEnabled('review_internal'),
      addon_absensi: isAddonEnabled('absensi_shift')
    };

  }) || [];

  return (
    <AnimatedPage className="space-y-6">
      {/* HEADER PAGE */}
      <GlassCard className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6" variant="light">
        <div>
          <h1 className="text-xl font-black text-slate-800">Master Apotek (Cabang)</h1>
          <p className="text-sm text-slate-500 mt-1">Kelola data tenant, target KPI, dan konfigurasi cabang.</p>
        </div>
        <AddBranchButton />
      </GlassCard>

      {/* QUICK STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <GlassCard className="p-4 flex items-center gap-4" variant="light">
          <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center shadow-sm border border-sky-200/50">
            <Store size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Cabang</p>
            <p className="text-2xl font-black text-slate-800">{branches?.length || 0}</p>
          </div>
        </GlassCard>
        <GlassCard className="p-4 flex items-center gap-4" variant="light">
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-sm border border-indigo-200/50">
            <Users size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Crew</p>
            <p className="text-2xl font-black text-slate-800">
              {displayData.reduce((acc, curr) => acc + curr.crewCount, 0)}
            </p>
          </div>
        </GlassCard>
        <GlassCard className="p-4 flex items-center gap-4" variant="light">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-sm border border-emerald-200/50">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Add-on Aktif</p>
            <p className="text-2xl font-black text-slate-800">
              {displayData.reduce((acc, curr) => {
                let count = 0;
                if (curr.addon_produk) count++;
                if (curr.addon_payroll) count++;
                if (curr.addon_review_p) count++;
                if (curr.addon_review_i) count++;
                if (curr.addon_absensi) count++;
                return acc + count;
              }, 0)}
            </p>
          </div>
        </GlassCard>
      </div>


      {/* CLIENT COMPONENT (SEARCH & GRID CARDS) */}
      <BranchListClient initialData={displayData} />
    </AnimatedPage>
  );
}
