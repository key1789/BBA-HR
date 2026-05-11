"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDefaultPortalPath } from "@/lib/portal";

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

  const [{ data: memberships }, { data: appProfile }] = await Promise.all([
    supabase
      .from("tenant_memberships")
      .select("tenant_apotek_id, role")
      .eq("user_id", user.id)
      .eq("is_active", true),
    supabase.from("app_users").select("is_global_admin").eq("id", user.id).maybeSingle(),
  ]);

  const rows = memberships ?? [];
  const cookieStore = await cookies();

  if (rows.length === 0) {
    if (!appProfile?.is_global_admin) {
      redirect("/waiting");
    }

    cookieStore.set("bba_active_role", "super_admin_bba", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    const { data: firstTenant } = await supabase
      .from("tenant_apotek")
      .select("id")
      .eq("status", "active")
      .order("name", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (firstTenant?.id) {
      cookieStore.set("bba_tenant_id", firstTenant.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
    }

    redirect(getDefaultPortalPath("super_admin_bba"));
  }

  const primaryMembership = rows[0];

  cookieStore.set("bba_active_role", primaryMembership.role, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  cookieStore.set("bba_tenant_id", primaryMembership.tenant_apotek_id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
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

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete("bba_tenant_id");
  cookieStore.delete("bba_active_role");
  redirect("/login");
}
