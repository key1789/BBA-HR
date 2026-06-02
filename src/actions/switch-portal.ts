"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type SwitchState = { error: string } | null;

export async function switchPortalAction(
  _prevState: SwitchState,
  formData: FormData,
): Promise<{ error: string }> {
  const email = ((formData.get("email") as string | null) ?? "").trim();
  const password = (formData.get("password") as string | null) ?? "";
  const target = (formData.get("target") as string | null) ?? "crew";

  if (!email || !password) {
    return { error: "Email dan password wajib diisi." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Email atau password salah." };
  }

  redirect(target === "admin" ? "/admin/dashboard" : "/crew/dashboard");
}
