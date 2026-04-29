"use server";

import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const candidateStatuses = [
  "new",
  "screening_passed",
  "screening_failed",
  "interview_scheduled",
  "interviewed",
  "hired",
  "rejected",
  "hold",
] as const;

type CandidateStatus = (typeof candidateStatuses)[number];

function isCandidateStatus(value: string): value is CandidateStatus {
  return candidateStatuses.includes(value as CandidateStatus);
}

export async function updateCandidateStatusAction(formData: FormData) {
  const candidateId = formData.get("candidateId")?.toString();
  const status = formData.get("status")?.toString();

  if (!candidateId || !status || !isCandidateStatus(status)) {
    return;
  }

  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role === "owner") {
    return;
  }

  const supabase = await createClient();
  await supabase
    .from("candidates")
    .update({ status })
    .eq("id", candidateId)
    .eq("tenant_apotek_id", active.tenantId);

  revalidatePath("/candidates");
  revalidatePath("/dashboard");
}

export async function submitTaskAction(formData: FormData) {
  const taskId = formData.get("taskId")?.toString();
  if (!taskId) {
    return;
  }

  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role === "owner") {
    return;
  }

  const supabase = await createClient();
  await supabase
    .from("tasks")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("tenant_apotek_id", active.tenantId);

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export async function requestTaskRevisionAction(formData: FormData) {
  const taskId = formData.get("taskId")?.toString();
  if (!taskId) {
    return;
  }

  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || (active.role !== "admin_apotek" && active.role !== "super_admin_bba")) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  await supabase
    .from("task_approvals")
    .insert({
      task_id: taskId,
      action: "revision_required",
      actor_user_id: user.id,
      notes: "Perlu revisi dari reviewer.",
    });

  await supabase
    .from("tasks")
    .update({ status: "revision_required" })
    .eq("id", taskId)
    .eq("tenant_apotek_id", active.tenantId);

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export async function approveTaskAction(formData: FormData) {
  const taskId = formData.get("taskId")?.toString();
  if (!taskId) {
    return;
  }

  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  await supabase
    .from("task_approvals")
    .insert({
      task_id: taskId,
      action: "approved",
      actor_user_id: user.id,
      notes: "Final approval oleh Super Admin BBA.",
    });

  await supabase
    .from("tasks")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("tenant_apotek_id", active.tenantId);

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}
