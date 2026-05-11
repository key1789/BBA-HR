import { canAccessPortalPath, getDefaultPortalPath } from "@/lib/portal";
import { bbaPathnameToMenuKey, firstAllowedBbaPath } from "@/lib/bba-portal-menus";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { Role } from "@/lib/types";

const publicPaths = [
  "/login",
  "/",
  "/waiting",
  "/accept-invitation",
  "/accept-bba-portal-invitation",
  "/accept-staff-invitation",
  "/forgot-password",
  "/update-password",
  "/set-password",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Keep landing page lightweight: no auth roundtrip needed.
  if (pathname === "/") {
    return NextResponse.next();
  }

  const isPublicPath = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const hasAuthCookies = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token"));
  const {
    data: { user },
  } = hasAuthCookies ? await supabase.auth.getUser() : { data: { user: null } };

  if (!user && !isPublicPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let role = request.cookies.get("bba_active_role")?.value as Role | undefined;

  if (user && !role) {
    const [{ data: memberships }, { data: appProfile }] = await Promise.all([
      supabase
        .from("tenant_memberships")
        .select("role, tenant_apotek_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1),
      supabase.from("app_users").select("is_global_admin, bba_portal_staff_role").eq("id", user.id).maybeSingle(),
    ]);

    const firstMembership = memberships?.[0] as
      | { role?: Role; tenant_apotek_id?: string }
      | undefined;

    if (firstMembership?.role && firstMembership?.tenant_apotek_id) {
      role = firstMembership.role;
      response.cookies.set("bba_active_role", firstMembership.role, {
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        sameSite: "lax",
      });
      response.cookies.set("bba_tenant_id", firstMembership.tenant_apotek_id, {
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        sameSite: "lax",
      });
    } else if (appProfile?.is_global_admin) {
      role = "super_admin_bba";
      response.cookies.set("bba_active_role", "super_admin_bba", {
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        sameSite: "lax",
      });
      const { data: firstTenant } = await supabase
        .from("tenant_apotek")
        .select("id")
        .eq("status", "active")
        .order("name", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (firstTenant?.id) {
        response.cookies.set("bba_tenant_id", firstTenant.id, {
          path: "/",
          maxAge: 60 * 60 * 24 * 30,
          sameSite: "lax",
        });
      }
    }
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL(role ? getDefaultPortalPath(role) : "/", request.url));
  }

  if (
    pathname === "/dashboard" ||
    pathname === "/requests" ||
    pathname === "/candidates" ||
    pathname === "/tasks"
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (user && role && !canAccessPortalPath(pathname, role)) {
    return NextResponse.redirect(new URL(getDefaultPortalPath(role), request.url));
  }

  if (
    user &&
    role === "super_admin_bba" &&
    pathname.startsWith("/bba/")
  ) {
    const { data: profile } = await supabase
      .from("app_users")
      .select("is_global_admin, bba_portal_staff_role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile && !profile.is_global_admin && profile.bba_portal_staff_role === "analyst") {
      const { data: menuRows } = await supabase
        .from("bba_portal_user_menus")
        .select("menu_key")
        .eq("user_id", user.id);
      const keys = new Set(
        (menuRows ?? []).map((m: { menu_key?: string }) => m.menu_key).filter(Boolean) as string[],
      );
      if (keys.size === 0) {
        return NextResponse.redirect(new URL("/waiting", request.url));
      }
      const needed = bbaPathnameToMenuKey(pathname);
      if (needed && !keys.has(needed)) {
        const fallback = firstAllowedBbaPath(keys);
        if (fallback) {
          return NextResponse.redirect(new URL(fallback, request.url));
        }
        return NextResponse.redirect(new URL("/waiting", request.url));
      }
    }
  }

  if (user && !role && pathname !== "/" && pathname !== "/waiting") {
    return NextResponse.redirect(new URL("/waiting", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
