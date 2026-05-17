import type { SessionContext } from "@/lib/auth-context";

/** Role logika izin (bisa dipetakan dari sesi BBA / portal tenant). */
export type AppPermissionRole = "super_admin" | "analyst" | "admin" | "owner" | "crew";

export const PERMISSIONS = {
  kpi_view: ["super_admin", "analyst", "admin", "owner", "crew"],
  kpi_edit: ["super_admin", "analyst"],
  kpi_approve: ["admin"],
  branch_view: ["super_admin", "analyst", "admin", "owner"],
  branch_edit: ["super_admin", "analyst"],
  branch_clone: ["super_admin", "analyst"],
  submission_create: ["crew"],
  submission_view_own: ["crew"],
  submission_view_all: ["super_admin", "analyst", "admin", "owner"],
  submission_approve: ["admin", "super_admin", "analyst"],
  addon_view: ["super_admin", "analyst", "admin", "owner"],
  addon_edit: ["super_admin", "analyst"],
  appraisal_view_own: ["crew"],
  appraisal_view_all: ["super_admin", "analyst", "admin", "owner"],
  appraisal_edit: ["super_admin", "analyst"],
  appraisal_lock: ["super_admin", "analyst"],
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export function hasPermission(role: AppPermissionRole, permission: PermissionKey): boolean {
  const allowed = PERMISSIONS[permission] as readonly string[];
  return allowed.includes(role);
}

export function requirePermission(role: AppPermissionRole, permission: PermissionKey): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Unauthorized: ${permission} requires one of: ${PERMISSIONS[permission].join(", ")}`);
  }
}

/**
 * Pemetaan sesi layout BBA (/bba/*) ke role izin fitur cabang.
 * Global super admin & staf BBA penuh diperlakukan setara super_admin; analyst terbatas menu tetap dapat KPI penuh sesuai kebijakan produk.
 */
export function mapBbaSessionToAppPermissionRole(session: SessionContext | null): AppPermissionRole {
  if (!session) return "crew";
  if (session.isGlobalSuperAdmin) return "super_admin";
  if (session.bbaPortalStaffRole === "analyst") return "analyst";
  return "super_admin";
}
