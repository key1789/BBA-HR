import { Role } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export type TenantMembership = {
  tenantId: string;
  tenantName: string;
  tenantCode: string;
  role: Role;
};

type SessionContext = {
  userId: string;
  userEmail: string;
  memberships: TenantMembership[];
  activeMembership?: TenantMembership;
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

export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("tenant_memberships")
    .select("tenant_apotek_id, role, tenant_apotek:tenant_apotek_id(name, code)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (error) {
    return {
      userId: user.id,
      userEmail: user.email ?? "",
      memberships: [],
    };
  }

  const memberships = ((data ?? []) as MembershipRow[])
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

  const cookieStore = await cookies();
  const activeTenantId = cookieStore.get("bba_tenant_id")?.value;
  const activeRole = cookieStore.get("bba_active_role")?.value as Role | undefined;
  const activeMembership =
    memberships.find(
      (item) => item.tenantId === activeTenantId && (!activeRole || item.role === activeRole),
    ) ?? memberships[0];

  return {
    userId: user.id,
    userEmail: user.email ?? "",
    memberships,
    activeMembership,
  };
}
