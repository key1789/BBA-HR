import { Role } from "@/lib/types";

const routeAccess: Record<string, Role[]> = {
  "/dashboard": ["super_admin_bba", "crew", "admin_apotek", "owner"],
  "/requests": ["super_admin_bba", "crew", "admin_apotek"],
  "/candidates": ["super_admin_bba", "crew", "admin_apotek", "owner"],
  "/tasks": ["super_admin_bba", "crew", "admin_apotek", "owner"],
};

export function canAccessPath(pathname: string, role: Role): boolean {
  const match = Object.entries(routeAccess).find(([route]) =>
    pathname.startsWith(route),
  );

  if (!match) {
    return true;
  }

  const [, allowedRoles] = match;
  return allowedRoles.includes(role);
}
