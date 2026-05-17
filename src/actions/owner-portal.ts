"use server";

import { getSessionContext } from "@/lib/auth-context";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export async function selectOwnerTenantAction(formData: FormData) {
  const tenantId = formData.get("tenantId")?.toString()?.trim();
  if (!tenantId) return;

  const session = await getSessionContext();
  if (!session) return;

  const allowed = session.memberships.some((m) => m.tenantId === tenantId && m.role === "owner");
  if (!allowed) return;

  const cookieStore = await cookies();
  cookieStore.set("bba_tenant_id", tenantId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
    httpOnly: true,
  });
  cookieStore.set("bba_active_role", "owner", {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
    httpOnly: true,
  });
  revalidatePath("/owner", "layout");
}
