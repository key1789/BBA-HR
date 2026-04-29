import { canAccessPortalPath, getDefaultPortalPath } from "@/lib/portal";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { Role } from "@/lib/types";

const publicPaths = ["/login", "/"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let role = request.cookies.get("bba_active_role")?.value as Role | undefined;

  if (user && !role) {
    const { data: memberships } = await supabase
      .from("tenant_memberships")
      .select("role, tenant_apotek_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1);

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

  if (user && !role && pathname !== "/") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
