import { getSessionContext } from "@/lib/auth-context";
import type { SessionContext } from "@/lib/auth-context";

export function bbaPortalHasFullMenuAccess(session: SessionContext | null): boolean {
  if (!session) return false;
  if (session.isGlobalSuperAdmin) return true;
  if (!session.bbaPortalStaffRole) return true;
  return false;
}

export async function assertGlobalBbaPortalManager() {
  const session = await getSessionContext();
  if (!session?.isGlobalSuperAdmin) {
    console.warn("[auth] assertGlobalBbaPortalManager denied", {
      userId: session?.userId ?? null,
      role: session?.activeMembership?.role ?? null,
    });
    return { ok: false as const, error: "Hanya super admin global yang dapat melakukan aksi ini." };
  }
  return { ok: true as const, session };
}

/** Allows both global super admin and tenant-level super_admin_bba. */
export async function assertBbaAccess() {
  const session = await getSessionContext();
  const role = session?.activeMembership?.role;
  if (!session?.isGlobalSuperAdmin && role !== "super_admin_bba") {
    console.warn("[auth] assertBbaAccess denied", {
      userId: session?.userId ?? null,
      role: role ?? null,
    });
    return { ok: false as const, error: "Akses ditolak." };
  }
  return { ok: true as const, session };
}
