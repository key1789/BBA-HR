import { Role } from "@/lib/types";

export function getDefaultPortalPath(role: Role): string {
  switch (role) {
    case "crew":
      return "/crew/dashboard";
    case "admin_apotek":
      return "/admin/dashboard";
    case "owner":
      return "/owner/dashboard";
    case "super_admin_bba":
      return "/bba/control-dashboard";
    default:
      return "/";
  }
}

export function canAccessPortalPath(pathname: string, role: Role): boolean {
  if (pathname === "/" || pathname === "/login") {
    return true;
  }

  if (pathname.startsWith("/crew/")) {
    return role === "crew";
  }

  if (pathname.startsWith("/admin/")) {
    return role === "admin_apotek";
  }

  if (pathname.startsWith("/owner/")) {
    return role === "owner";
  }

  if (pathname.startsWith("/bba/")) {
    return role === "super_admin_bba";
  }

  return true;
}
