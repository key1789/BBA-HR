"use server";

import { getSessionContext } from "@/lib/auth-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function markAnnouncementViewedAction(announcementId: string) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!session || !active || (active.role !== "admin_apotek" && active.role !== "crew")) return;

  const supabase = createAdminClient();
  await supabase
    .from("announcement_receipts")
    .update({ viewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("announcement_id", announcementId)
    .eq("user_id", session.userId)
    .is("viewed_at", null);
}

export async function acknowledgeAnnouncementAction(formData: FormData) {
  const announcementId = (formData.get("announcementId") as string | null) ?? "";
  if (!announcementId) return;

  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!session || !active || (active.role !== "admin_apotek" && active.role !== "crew")) {
    return;
  }

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("announcement_receipts")
    .update({
      viewed_at: nowIso,
      acknowledged_at: nowIso,
      updated_at: nowIso,
    })
    .eq("announcement_id", announcementId)
    .eq("user_id", session.userId);

  if (error) return;

  revalidatePath("/admin/pengumuman");
  revalidatePath("/crew/pengumuman");
}
