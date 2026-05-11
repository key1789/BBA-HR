import { Role } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { cache } from "react";

export type TenantMembership = {
  tenantId: string;
  tenantName: string;
  tenantCode: string;
  role: Role;
};

export type SessionContext = {
  userId: string;
  userEmail: string;
  userFullName?: string;
  memberships: TenantMembership[];
  activeMembership?: TenantMembership;
  /** True when app_users.is_global_admin — akses BBA ke seluruh cabang tanpa baris membership per tenant */
  isGlobalSuperAdmin?: boolean;
  /** Role portal BBA non-global; null = staff BBA penuh (legacy) atau tidak berlaku */
  bbaPortalStaffRole?: "analyst" | null;
  /** Daftar menu_key untuk analyst; null = semua menu (global / legacy) */
  bbaPortalMenuKeys?: string[] | null;
};

type MembershipRow = {
  tenant_apotek_id: string;
  role: Role;
  tenant_apotek: { name: string; code: string } | { name: string; code: string }[] | null;
};

function normalizeTenant(
  tenant: MembershipRow["tenant_apotek"],
): { name: string; code: string } | null {
  if (!tenant) {
    return null;
  }

  if (Array.isArray(tenant)) {
    return tenant[0] ?? null;
  }

  return tenant;
}

export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const cookieStore = await cookies();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const [{ data: membershipRows, error: memError }, { data: appUserRow }] = await Promise.all([
    supabase
      .from("tenant_memberships")
      .select("tenant_apotek_id, role, tenant_apotek:tenant_apotek_id(name, code)")
      .eq("user_id", user.id)
      .eq("is_active", true),
    supabase.from("app_users").select("is_global_admin, full_name, bba_portal_staff_role").eq("id", user.id).maybeSingle(),
  ]);

  let memberships: TenantMembership[] = [];

  if (!memError && membershipRows) {
    memberships = ((membershipRows ?? []) as MembershipRow[])
      .map((item) => {
        const tenant = normalizeTenant(item.tenant_apotek);
        if (!tenant) {
          return null;
        }

        return {
          tenantId: item.tenant_apotek_id,
          tenantName: tenant.name,
          tenantCode: tenant.code,
          role: item.role,
        } satisfies TenantMembership;
      })
      .filter((item): item is TenantMembership => item !== null);
  }

  const isGlobalSuperAdmin = !!appUserRow?.is_global_admin;

  const rawStaffRole = appUserRow?.bba_portal_staff_role as string | null | undefined;
  let bbaPortalStaffRole: "analyst" | null = rawStaffRole === "analyst" ? "analyst" : null;
  let bbaPortalMenuKeys: string[] | null = null;

  if (isGlobalSuperAdmin) {
    bbaPortalStaffRole = null;
    bbaPortalMenuKeys = null;
  } else if (bbaPortalStaffRole === "analyst") {
    const { data: menuRows } = await supabase
      .from("bba_portal_user_menus")
      .select("menu_key")
      .eq("user_id", user.id);
    bbaPortalMenuKeys = (menuRows ?? []).map((r) => r.menu_key as string).filter(Boolean);
  } else {
    bbaPortalStaffRole = null;
    bbaPortalMenuKeys = null;
  }

  if (isGlobalSuperAdmin) {
    const { data: tenants } = await supabase
      .from("tenant_apotek")
      .select("id, name, code")
      .eq("status", "active")
      .order("name", { ascending: true });

    const covered = new Set(memberships.map((m) => m.tenantId));
    for (const t of tenants ?? []) {
      if (!covered.has(t.id)) {
        memberships.push({
          tenantId: t.id,
          tenantName: t.name,
          tenantCode: t.code,
          role: "super_admin_bba",
        });
      }
    }

    memberships.sort((a, b) =>
      a.tenantName.localeCompare(b.tenantName, "id", { sensitivity: "base" }),
    );
  }

  const activeTenantId = cookieStore.get("bba_tenant_id")?.value;
  const activeRole = cookieStore.get("bba_active_role")?.value as Role | undefined;
  let activeMembership =
    memberships.find(
      (item) => item.tenantId === activeTenantId && (!activeRole || item.role === activeRole),
    ) ?? memberships[0];

  if (!activeMembership && isGlobalSuperAdmin) {
    activeMembership = {
      tenantId: "",
      tenantName: "Semua cabang",
      tenantCode: "BBA",
      role: "super_admin_bba",
    };
  }

  return {
    userId: user.id,
    userEmail: user.email ?? "",
    userFullName: appUserRow?.full_name ?? undefined,
    memberships,
    activeMembership,
    ...(isGlobalSuperAdmin ? { isGlobalSuperAdmin: true } : {}),
    ...(bbaPortalStaffRole === "analyst"
      ? { bbaPortalStaffRole: "analyst" as const, bbaPortalMenuKeys }
      : {}),
  };
});
