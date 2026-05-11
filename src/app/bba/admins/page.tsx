/* eslint-disable @typescript-eslint/no-explicit-any */
import { Suspense } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/auth-context";
import { redirect } from "next/navigation";
import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { Shield } from "lucide-react";
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

  return (
    <AnimatedPage className="mx-auto max-w-6xl space-y-6 pb-10">
      <GlassCard className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between" variant="light">
        <div className="flex min-w-0 items-start gap-4 sm:items-center">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-900/20">
            <Shield size={26} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Kelola Super Admin</h1>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-600">
              Undang <strong className="font-semibold text-slate-800">analyst</strong> dengan cabang & modul terbatas, atau{" "}
              <strong className="font-semibold text-slate-800">promote</strong> user ke global. Menonaktifkan akun mematikan login di semua portal.
            </p>
          </div>
        </div>
        <div className="shrink-0 sm:pt-1">
          <AddAdminButton branches={allBranches || []} menuCatalog={BBA_PORTAL_MENU_REGISTRY} />
        </div>
      </GlassCard>

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
