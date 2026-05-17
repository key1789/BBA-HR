"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { triggerUnreadCriticalReminderAction } from "./actions";

function TriggerButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
    >
      {pending ? "Memproses..." : "Trigger Reminder Unread >24h"}
    </button>
  );
}

export function ReminderTrigger() {
  const [state, action] = useActionState(triggerUnreadCriticalReminderAction, null);
  return (
    <form action={action} className="space-y-2">
      <TriggerButton />
      {state?.error ? <p className="text-xs text-rose-700">{state.error}</p> : null}
      {state?.success ? <p className="text-xs text-emerald-700">{state.message}</p> : null}
    </form>
  );
}
