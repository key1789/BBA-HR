import type { SessionContext } from "@/lib/auth-context";

export function bbaPortalHasFullMenuAccess(session: SessionContext | null): boolean {
  if (!session) return false;
  if (session.isGlobalSuperAdmin) return true;
  if (!session.bbaPortalStaffRole) return true;
  return false;
}
