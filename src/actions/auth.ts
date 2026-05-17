"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDefaultPortalPath } from "@/lib/portal";
import {
  buildSessionCacheValue,
  SESSION_CACHE_COOKIE,
  SESSION_CACHE_TTL_S,
  SESSION_COOKIE_OPTS,
  parseSessionCache,
} from "@/lib/auth-context";
import type { SessionContext, TenantMembership } from "@/lib/auth-context";

export async function loginAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "User not found" };

  const [{ data: membershipRows }, { data: appProfile }] = await Promise.all([
    supabase
      .from("tenant_memberships")
      .select("tenant_apotek_id, role, tenant_apotek:tenant_apotek_id(name, code)")
      .eq("user_id", user.id)
      .eq("is_active", true),
    supabase
      .from("app_users")
      .select("is_global_admin, full_name, bba_portal_staff_role, is_branch_desk_account")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const rows = membershipRows ?? [];
  const cookieStore = await cookies();
  const opts = SESSION_COOKIE_OPTS;

  const isGlobalSuperAdmin = !!appProfile?.is_global_admin;

  if (rows.length === 0) {
    if (!isGlobalSuperAdmin) redirect("/waiting");

    cookieStore.set("bba_active_role", "super_admin_bba", opts);

    const { data: firstTenant } = await supabase
      .from("tenant_apotek")
      .select("id")
      .eq("status", "active")
      .order("name", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (firstTenant?.id) {
      cookieStore.set("bba_tenant_id", firstTenant.id, opts);
    }

    // Global admin: tulis cache minimal (tanpa memberships)
    const gsaSession: SessionContext = {
      userId: user.id,
      userEmail: user.email ?? "",
      userFullName: appProfile?.full_name ?? undefined,
      memberships: [],
      isGlobalSuperAdmin: true,
    };
    cookieStore.set(SESSION_CACHE_COOKIE, buildSessionCacheValue(gsaSession), {
      ...opts,
      maxAge: SESSION_CACHE_TTL_S,
    });

    redirect(getDefaultPortalPath("super_admin_bba"));
  }

  // Bangun daftar membership dengan nama tenant
  const memberships: TenantMembership[] = rows
    .map((r) => {
      const t = Array.isArray(r.tenant_apotek) ? r.tenant_apotek[0] : r.tenant_apotek;
      if (!t) return null;
      return { tenantId: r.tenant_apotek_id, tenantName: t.name, tenantCode: t.code, role: r.role } as TenantMembership;
    })
    .filter((m): m is TenantMembership => m !== null);

  if (memberships.length > 1) redirect("/pilih-cabang");

  const primaryMembership = memberships[0];
  cookieStore.set("bba_active_role", primaryMembership.role, opts);
  cookieStore.set("bba_tenant_id", primaryMembership.tenantId, opts);

  const session: SessionContext = {
    userId: user.id,
    userEmail: user.email ?? "",
    userFullName: appProfile?.full_name ?? undefined,
    ...(appProfile?.is_branch_desk_account ? { isBranchDeskAccount: true as const } : {}),
    memberships,
    activeMembership: primaryMembership,
  };
  cookieStore.set(SESSION_CACHE_COOKIE, buildSessionCacheValue(session), {
    ...opts,
    maxAge: SESSION_CACHE_TTL_S,
  });

  redirect(getDefaultPortalPath(primaryMembership.role));
}

export async function forgotPasswordAction(formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  if (!email) {
    return { error: "Email wajib diisi." };
  }

  const supabase = await createClient();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const redirectTo = `${appUrl.replace(/\/$/, "")}/update-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    // Keep message generic to avoid account enumeration.
    return { success: true, message: "Jika email terdaftar, link reset password akan segera dikirim." };
  }

  return { success: true, message: "Jika email terdaftar, link reset password akan segera dikirim." };
}

export async function selectTenantAction(formData: FormData) {
  const tenantId = formData.get("tenantId")?.toString();
  const role = formData.get("role")?.toString();

  if (!tenantId || !role) redirect("/pilih-cabang");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("tenant_apotek_id", tenantId)
    .eq("role", role)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership) redirect("/pilih-cabang");

  const cookieStore = await cookies();
  const opts = SESSION_COOKIE_OPTS;
  cookieStore.set("bba_active_role", role, opts);
  cookieStore.set("bba_tenant_id", tenantId, opts);

  // Perbarui active membership di cache yang ada (tanpa DB query)
  const existingCache = parseSessionCache(cookieStore.get(SESSION_CACHE_COOKIE)?.value, user.id);
  if (existingCache) {
    const newActive = existingCache.memberships.find(
      (m) => m.tenantId === tenantId && m.role === role,
    );
    if (newActive) {
      const updated: SessionContext = { ...existingCache, activeMembership: newActive };
      cookieStore.set(SESSION_CACHE_COOKIE, buildSessionCacheValue(updated), {
        ...opts,
        maxAge: SESSION_CACHE_TTL_S,
      });
    }
  }

  redirect(getDefaultPortalPath(role as Parameters<typeof getDefaultPortalPath>[0]));
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete("bba_tenant_id");
  cookieStore.delete("bba_active_role");
  cookieStore.delete(SESSION_CACHE_COOKIE);
  redirect("/login");
}
