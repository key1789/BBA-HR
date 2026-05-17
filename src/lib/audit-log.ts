import type { SupabaseClient } from "@supabase/supabase-js";

type AuditPayload = {
  tenantApotekId: string | null;
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
};

export async function writeAuditLog(
  supabase: SupabaseClient,
  payload: AuditPayload,
) {
  try {
    const { error } = await supabase.from("activity_logs").insert({
      tenant_apotek_id: payload.tenantApotekId,
      actor_user_id: payload.actorUserId,
      entity_type: payload.entityType,
      entity_id: payload.entityId,
      action: payload.action,
      old_value: payload.oldValue ?? null,
      new_value: payload.newValue ?? null,
    });
    if (error) {
      console.error("[audit-log] insert failed:", payload.action, error.message);
    }
  } catch (err) {
    console.error("[audit-log] unexpected error:", payload.action, err);
  }
}
