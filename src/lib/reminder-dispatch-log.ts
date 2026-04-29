import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReminderPhase } from "@/lib/reminder-windows";

type ReminderScope = "crew_dashboard" | "admin_dashboard" | "admin_verifikasi";
type ReminderReason =
  | "missing_submission"
  | "pending_submission"
  | "verification_backlog"
  | "overdue_verification";

type ReminderDispatchPayload = {
  tenantApotekId: string;
  actorUserId: string | null;
  reminderDate: string;
  phase: ReminderPhase;
  scope: ReminderScope;
  reasonCode: ReminderReason;
  payload?: Record<string, unknown>;
};

export async function recordReminderDispatch(
  supabase: SupabaseClient,
  input: ReminderDispatchPayload,
) {
  if (input.phase === "normal") return;

  try {
    await supabase.from("reminder_dispatch_logs").upsert(
      {
        tenant_apotek_id: input.tenantApotekId,
        actor_user_id: input.actorUserId,
        reminder_date: input.reminderDate,
        phase: input.phase,
        scope: input.scope,
        reason_code: input.reasonCode,
        payload: input.payload ?? {},
      },
      {
        onConflict: "tenant_apotek_id,reminder_date,phase,scope,reason_code",
        ignoreDuplicates: true,
      },
    );
  } catch {
    // Reminder persistence must not block core operational pages.
  }
}
