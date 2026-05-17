import { createAdminClient } from "@/lib/supabase/admin";

interface NotifyAdminsPayload {
  type: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}

export async function notifyAdmins(tenantId: string, event: NotifyAdminsPayload) {
  try {
    const admin = createAdminClient();

    const { data: admins, error: fetchError } = await admin
      .from("tenant_memberships")
      .select("user_id")
      .eq("tenant_apotek_id", tenantId)
      .eq("role", "admin_apotek")
      .eq("is_active", true);

    if (fetchError || !admins || admins.length === 0) return;

    const rows = admins.map((a) => ({
      tenant_apotek_id: tenantId,
      recipient_user_id: a.user_id,
      event_type: event.type,
      title: event.title,
      body: event.body,
      payload: event.payload ?? {},
    }));

    const { error } = await admin.from("notifications").insert(rows);
    if (error) {
      console.error("[notifications] insert failed:", error.message);
    }
  } catch (err) {
    console.error("[notifications] unexpected error:", err);
  }
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_user_id", userId)
      .eq("is_read", false);

    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
