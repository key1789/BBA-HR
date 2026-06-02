/* eslint-disable @typescript-eslint/no-explicit-any */
import { Suspense } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/auth-context";
import { redirect } from "next/navigation";
import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { Shield, Users, Globe, Clock } from "lucide-react";
import { AddAdminButton } from "./add-admin-button";
import { BBA_PORTAL_MENU_REGISTRY } from "@/lib/bba-portal-menus";
import { AdminsMainTabs } from "./admins-main-tabs";
import type { PendingInviteRow } from "./pending-invites-client";
import type { AdminStaffRowVm } from "./admins-staff-types";
import { AUDIT_PAGE_SIZE, parseAuditDateRange, toAuditDisplayRow } from "./bba-portal-audit-shared";

function buildStaffRows(adminsData: any[], menusByUser: Map<string, string[]>): AdminStaffRowVm[] {
  return adminsData.map((admin) => {
    const portalMenuKeys = [...new Set(menusByUser.get(admin.id) ?? [])];
    const branchNames: string[] = (admin.memberships ?? [])
      .map((m: any) => (typeof m.tenant_apotek?.name === "string" ? m.tenant_apotek.name : ""))
      .filter((n: string) => Boolean(n));
    const analystTenantIds: string[] =
      admin.bba_portal_staff_role === "analyst"
        ? Array.from(
            new Set(
              (admin.memberships ?? [])
                .map((m: any) => (m.tenant_apotek_id != null ? String(m.tenant_apotek_id) : ""))
                .filter((id: string) => id.length > 0),
            ),
          )
        : [];
    let legacyPermissionLabels: string[] = [];
    if (!admin.is_global_admin && admin.bba_portal_staff_role !== "analyst") {
      const m = (admin.memberships ?? []).find((x: any) => x.role === "super_admin_bba");
      const perms = m?.permissions;
      if (perms && typeof perms === "object") {
        const o = perms as Record<string, boolean>;
        legacyPermissionLabels = ["kpi", "payroll", "audit", "users"].filter((k) => !!o[k]);
      }
      if (legacyPermissionLabels.length === 0) legacyPermissionLabels = ["legacy BBA"];
    }
    const canDemoteGlobal =
      !!admin.is_global_admin &&
      adminsData.some((a) => a.id !== admin.id && a.is_global_admin && a.is_active);
    const kind = admin.is_global_admin
      ? "global"
      : admin.bba_portal_staff_role === "analyst"
        ? "analyst"
        : "legacy";
    return {
      id: admin.id,
      full_name: admin.full_name,
      email: admin.email,
      is_active: admin.is_active,
      is_global_admin: admin.is_global_admin,
      bba_portal_staff_role: admin.bba_portal_staff_role,
      kind,
      analystTenantIds,
      portalMenuKeys,
      legacyPermissionLabels,
      branchNames,
      memberships: admin.memberships ?? [],
      canDemoteGlobal,
    };
  });
}

export default async function AdminsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const session = await getSessionContext();
  if (!session?.isGlobalSuperAdmin) {
    redirect("/bba/dashboard");
  }

  const supabase = createAdminClient();

  const { data: memberships } = await supabase
    .from("tenant_memberships")
    .select(
      `
      user_id,
      role,
      permissions,
      is_active,
      app_users(*),
      tenant_apotek(id, name)
    `,
    )
    .eq("role", "super_admin_bba")
    .eq("is_active", true);

  const adminsMap = new Map();
  memberships?.forEach((m: any) => {
    if (!m.app_users) return;
    const uid = m.user_id;
    if (!adminsMap.has(uid)) {
      adminsMap.set(uid, {
        ...m.app_users,
        memberships: [],
      });
    }
    adminsMap.get(uid).memberships.push(m);
  });

  const { data: globalFlagUsers } = await supabase.from("app_users").select("*").eq("is_global_admin", true);

  globalFlagUsers?.forEach((u: any) => {
    if (adminsMap.has(u.id)) return;
    adminsMap.set(u.id, { ...u, memberships: [] });
  });

  const adminsData = Array.from(adminsMap.values());

  const analystIds = adminsData.filter((a: any) => a.bba_portal_staff_role === "analyst").map((a: any) => a.id);
  const menusByUser = new Map<string, string[]>();
  if (analystIds.length) {
    const { data: menuRows } = await supabase
      .from("bba_portal_user_menus")
      .select("user_id, menu_key")
      .in("user_id", analystIds);
    for (const r of menuRows ?? []) {
      const id = r.user_id as string;
      const mk = r.menu_key as string;
      if (!menusByUser.has(id)) menusByUser.set(id, []);
      menusByUser.get(id)!.push(mk);
    }
  }

  const staffRows = buildStaffRows(adminsData, menusByUser);

  const { data: allBranches } = await supabase.from("tenant_apotek").select("id, name").eq("status", "active");

  const { data: pendingInvites } = await supabase
    .from("bba_portal_staff_invitations")
    .select("id, email, full_name, created_at, expires_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const dateRange = parseAuditDateRange(sp.from, sp.to);
  if (dateRange.error) {
    console.warn("audit date range:", dateRange.error);
  }

  let auditQuery = supabase
    .from("bba_portal_admin_audit")
    .select("id, action, actor_user_id, target_user_id, metadata, created_at")
    .order("created_at", { ascending: false });

  if (!dateRange.error) {
    if (dateRange.fromIso) auditQuery = auditQuery.gte("created_at", dateRange.fromIso);
    if (dateRange.toIso) auditQuery = auditQuery.lte("created_at", dateRange.toIso);
  }

  const { data: auditRows, error: auditErr } = await auditQuery.limit(AUDIT_PAGE_SIZE);

  if (auditErr) {
    console.warn("bba_portal_admin_audit:", auditErr.message);
  }

  const auditAvailable = !auditErr;
  const actorIds = [...new Set((auditRows ?? []).map((r: any) => r.actor_user_id).filter(Boolean))];
  let actorNameById = new Map<string, string>();
  if (actorIds.length) {
    const { data: actors } = await supabase.from("app_users").select("id, full_name").in("id", actorIds);
    actorNameById = new Map((actors ?? []).map((a: any) => [a.id, a.full_name ?? a.id]));
  }

  const auditDisplayRows = (auditRows ?? []).map((row: any) => toAuditDisplayRow(row, actorNameById));
  const initialAuditHasMore = auditAvailable && auditDisplayRows.length === AUDIT_PAGE_SIZE;

  // Quick stats
  const statTotal   = staffRows.length;
  const statGlobal  = staffRows.filter(r => r.kind === "global").length;
  const statPending = (pendingInvites ?? []).length;

  return (
    <AnimatedPage className="space-y-6 pb-10">
      {/* HEADER */}
      <GlassCard className="p-4 sm:p-5" variant="light">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-sky-600/25">
              <Shield size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase leading-tight">
                Kelola Super Admin
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Undang <strong className="font-semibold text-slate-700">analyst</strong> dengan cabang &amp; modul terbatas, atau{" "}
                <strong className="font-semibold text-slate-700">promote</strong> user ke global.
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <AddAdminButton branches={allBranches || []} menuCatalog={BBA_PORTAL_MENU_REGISTRY} />
          </div>
        </div>
      </GlassCard>

      {/* QUICK STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <GlassCard className="p-3.5 border-l-4 border-l-sky-500" variant="light">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
              <Users size={18} />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Staff</p>
              <p className="text-2xl font-black text-slate-900 leading-none">{statTotal}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-3.5 border-l-4 border-l-emerald-500" variant="light">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Globe size={18} />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Global Admin</p>
              <p className="text-2xl font-black text-slate-900 leading-none">{statGlobal}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-3.5 border-l-4 border-l-amber-400" variant="light">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
              <Clock size={18} />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Undangan Pending</p>
              <p className="text-2xl font-black text-slate-900 leading-none">{statPending}</p>
            </div>
          </div>
        </GlassCard>
      </div>

      <Suspense
        fallback={
          <GlassCard variant="light" className="min-h-[200px] animate-pulse p-8 text-center text-sm text-slate-500">
            Memuat…
          </GlassCard>
        }
      >
        <AdminsMainTabs
          staffRows={staffRows}
          branches={allBranches || []}
          menuCatalog={BBA_PORTAL_MENU_REGISTRY}
          pendingInvites={(pendingInvites ?? []) as PendingInviteRow[]}
          initialAuditRows={auditDisplayRows}
          initialAuditHasMore={initialAuditHasMore}
          auditAvailable={auditAvailable}
          auditRangeError={dateRange.error}
        />
      </Suspense>
    </AnimatedPage>
  );
}
