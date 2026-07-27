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

/**
 * Apakah sesi berwenang atas cabang `tenantId`?
 * - Global super admin: semua cabang.
 * - super_admin_bba non-global (mis. analyst): hanya cabang yang di-assign
 *   (punya membership super_admin_bba untuk tenantId tsb).
 */
export function bbaCanAccessTenant(session: SessionContext | null, tenantId: string): boolean {
  if (!session) return false;
  if (session.isGlobalSuperAdmin) return true;
  return (session.memberships ?? []).some(
    (m) => m.tenantId === tenantId && m.role === "super_admin_bba",
  );
}

/**
 * Cek scope cabang + kapabilitas analyst untuk aksi SA yang menargetkan satu cabang.
 * Dipakai SETELAH assertBbaAccess (yang sudah memastikan role SA). Return pesan error
 * (string) bila ditolak, atau `null` bila boleh. Global admin selalu lolos.
 */
export function assertBranchScope(
  session: SessionContext | null,
  tenantId: string,
  opts?: { blockAnalyst?: boolean },
): string | null {
  if (opts?.blockAnalyst && session?.bbaPortalStaffRole === "analyst") {
    return "Analyst tidak dapat melakukan aksi ini.";
  }
  if (!bbaCanAccessTenant(session, tenantId)) {
    return "Anda tidak berwenang atas cabang ini.";
  }
  return null;
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
