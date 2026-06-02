"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/auth-context";
import {
  ANNOUNCEMENT_PRIORITIES,
  ANNOUNCEMENT_TARGET_ROLES,
  inferRequireAck,
  type AnnouncementPriority,
  type AnnouncementTargetRole,
} from "@/lib/announcements";
import { revalidatePath } from "next/cache";

type TargetRow = {
  target_role: AnnouncementTargetRole;
  tenant_apotek_id: string | null;
};

function parseTargets(raw: string): TargetRow[] {
  try {
    const parsed = JSON.parse(raw) as TargetRow[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        !!item &&
        ANNOUNCEMENT_TARGET_ROLES.includes(item.target_role) &&
        (item.tenant_apotek_id === null || typeof item.tenant_apotek_id === "string"),
    );
  } catch {
    return [];
  }
}

async function ensureBbaPublisher() {
  const session = await getSessionContext();
  const role = session?.activeMembership?.role;
  const isAllowed =
    session?.isGlobalSuperAdmin ||
    role === "super_admin_bba";
  if (!session || !isAllowed) {
    return { error: "Akses ditolak.", userId: null as string | null };
  }
  return { error: null, userId: session.userId };
}

export async function publishDueAnnouncementsAction() {
  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data: dueRows } = await supabase
    .from("announcements")
    .select("id")
    .eq("status", "scheduled")
    .lte("publish_at", nowIso);

  if (!dueRows || dueRows.length === 0) return;

  await supabase
    .from("announcements")
    .update({ status: "published", published_at: nowIso, updated_at: nowIso })
    .eq("status", "scheduled")
    .lte("publish_at", nowIso);

  for (const row of dueRows) {
    await hydrateAnnouncementReceiptsAction(row.id);
  }
}

export async function hydrateAnnouncementReceiptsAction(announcementId: string) {
  const supabase = createAdminClient();
  const { data: targetRows } = await supabase
    .from("announcement_targets")
    .select("target_role, tenant_apotek_id")
    .eq("announcement_id", announcementId);

  const targets = (targetRows ?? []) as TargetRow[];
  if (targets.length === 0) return;

  const targetByRole = new Map<AnnouncementTargetRole, Set<string | null>>();
  for (const role of ANNOUNCEMENT_TARGET_ROLES) targetByRole.set(role, new Set<string | null>());
  for (const target of targets) {
    targetByRole.get(target.target_role)?.add(target.tenant_apotek_id ?? null);
  }

  const rowsToInsert: Array<{
    announcement_id: string;
    user_id: string;
    tenant_apotek_id: string;
    role: AnnouncementTargetRole;
    delivery_status: "delivered";
  }> = [];

  for (const role of ANNOUNCEMENT_TARGET_ROLES) {
    const tenantSet = targetByRole.get(role);
    if (!tenantSet || tenantSet.size === 0) continue;

    let query = supabase
      .from("tenant_memberships")
      .select("user_id, tenant_apotek_id")
      .eq("role", role)
      .eq("is_active", true);

    const tenantIds = [...tenantSet].filter((item): item is string => !!item);
    const hasGlobal = tenantSet.has(null);
    if (!hasGlobal && tenantIds.length > 0) {
      query = query.in("tenant_apotek_id", tenantIds);
    }

    const { data: members } = await query;
    for (const member of members ?? []) {
      if (!hasGlobal && tenantIds.length > 0 && !tenantIds.includes(member.tenant_apotek_id)) continue;
      rowsToInsert.push({
        announcement_id: announcementId,
        user_id: member.user_id,
        tenant_apotek_id: member.tenant_apotek_id,
        role,
        delivery_status: "delivered",
      });
    }
  }

  if (rowsToInsert.length > 0) {
    await supabase.from("announcement_receipts").upsert(rowsToInsert, { onConflict: "announcement_id,user_id" });
  }
}

export async function saveAnnouncementAction(_prev: unknown, formData: FormData) {
  const auth = await ensureBbaPublisher();
  if (auth.error) return { error: auth.error };

  const id = (formData.get("id") as string | null) ?? "";
  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const body = (formData.get("body") as string | null)?.trim() ?? "";
  const priorityRaw = (formData.get("priority") as string | null) ?? "info";
  const action = (formData.get("actionType") as string | null) ?? "save_draft";
  const publishAtRaw = (formData.get("publishAt") as string | null)?.trim() ?? "";
  const expireAtRaw = (formData.get("expireAt") as string | null)?.trim() ?? "";
  const targetsRaw = (formData.get("targets") as string | null) ?? "[]";

  if (!title || !body) return { error: "Judul dan isi pengumuman wajib diisi." };
  if (!ANNOUNCEMENT_PRIORITIES.includes(priorityRaw as AnnouncementPriority)) {
    return { error: "Prioritas pengumuman tidak valid." };
  }

  const priority = priorityRaw as AnnouncementPriority;
  const targets = parseTargets(targetsRaw);
  if (targets.length === 0) return { error: "Pilih minimal satu target penerima." };

  let status: "draft" | "scheduled" | "published" | "archived" = "draft";
  if (action === "schedule") status = "scheduled";
  if (action === "publish") status = "published";
  if (action === "archive") status = "archived";

  const nowIso = new Date().toISOString();
  const publishAt = publishAtRaw ? new Date(publishAtRaw).toISOString() : null;
  const expireAt = expireAtRaw ? new Date(expireAtRaw).toISOString() : null;
  const requireAck = inferRequireAck(priority);

  if (status === "scheduled" && !publishAt) {
    return { error: "Tanggal publish wajib diisi untuk status terjadwal." };
  }

  const payload = {
    title,
    body,
    priority,
    require_ack: requireAck,
    status,
    publish_at: status === "scheduled" ? publishAt : null,
    published_at: status === "published" ? nowIso : null,
    archived_at: status === "archived" ? nowIso : null,
    expire_at: expireAt,
    updated_at: nowIso,
    updated_by_user_id: auth.userId,
  };

  const supabase = createAdminClient();
  let announcementId = id || "";
  let oldValue: Record<string, unknown> = {};

  if (announcementId) {
    const { data: existing } = await supabase
      .from("announcements")
      .select("id, title, status, priority, publish_at, expire_at")
      .eq("id", announcementId)
      .maybeSingle();
    oldValue = existing ?? {};

    const { error } = await supabase.from("announcements").update(payload).eq("id", announcementId);
    if (error) return { error: `Gagal menyimpan pengumuman: ${error.message}` };
  } else {
    const { data: inserted, error } = await supabase
      .from("announcements")
      .insert({
        ...payload,
        created_by_user_id: auth.userId,
      })
      .select("id")
      .single();
    if (error || !inserted?.id) return { error: `Gagal membuat pengumuman: ${error?.message ?? "unknown"}` };
    announcementId = inserted.id;
  }

  // Insert/upsert new targets first — user always has recipients even if delete step fails.
  const targetRows = targets.map((target) => ({ announcement_id: announcementId, ...target }));
  await supabase
    .from("announcement_targets")
    .upsert(targetRows, { onConflict: "announcement_id,target_role,tenant_apotek_id" });

  // Fetch all existing targets to compute stale set, then remove them.
  const { data: existingTargets } = await supabase
    .from("announcement_targets")
    .select("id, target_role, tenant_apotek_id")
    .eq("announcement_id", announcementId);

  const newSet = new Set(
    targetRows.map((t) => `${t.target_role}::${t.tenant_apotek_id ?? "null"}`)
  );
  const staleIds = (existingTargets ?? [])
    .filter((t) => !newSet.has(`${t.target_role}::${t.tenant_apotek_id ?? "null"}`))
    .map((t) => t.id);
  if (staleIds.length > 0) {
    await supabase.from("announcement_targets").delete().in("id", staleIds);
  }

  if (status === "published") {
    await hydrateAnnouncementReceiptsAction(announcementId);
  }

  await supabase.from("announcement_audit_logs").insert({
    announcement_id: announcementId,
    actor_user_id: auth.userId,
    action: id ? `update_${status}` : `create_${status}`,
    old_value: oldValue,
    new_value: { ...payload, targets },
  });

  revalidatePath("/bba/broadcast");
  revalidatePath("/admin/pengumuman");
  revalidatePath("/crew/pengumuman");

  return {
    success: true,
    message:
      status === "published"
        ? "Pengumuman berhasil dipublikasikan."
        : status === "scheduled"
          ? "Pengumuman berhasil dijadwalkan."
          : status === "archived"
            ? "Pengumuman berhasil diarsipkan."
            : "Draft pengumuman berhasil disimpan.",
  };
}

export async function triggerUnreadCriticalReminderAction() {
  const auth = await ensureBbaPublisher();
  if (auth.error) return { error: auth.error };

  const supabase = createAdminClient();
  const threshold = new Date();
  threshold.setHours(threshold.getHours() - 24);

  const { data: rows, error } = await supabase
    .from("announcement_receipts")
    .select("tenant_apotek_id, role, announcement:announcement_id(priority)")
    .is("acknowledged_at", null)
    .not("viewed_at", "is", null)
    .lte("created_at", threshold.toISOString())
    .eq("announcement.status", "published")
    .in("announcement.priority", ["required", "urgent"]);

  if (error) return { error: `Gagal mengambil data unread kritis: ${error.message}` };

  const grouped = new Map<string, { tenantId: string; adminCount: number; crewCount: number }>();
  for (const row of rows ?? []) {
    if (!row.tenant_apotek_id) continue;
    const current = grouped.get(row.tenant_apotek_id) ?? {
      tenantId: row.tenant_apotek_id,
      adminCount: 0,
      crewCount: 0,
    };
    if (row.role === "admin_apotek") current.adminCount += 1;
    if (row.role === "crew") current.crewCount += 1;
    grouped.set(row.tenant_apotek_id, current);
  }

  const now = new Date().toISOString();
  const inserts = [...grouped.values()].map((item) => ({
    tenant_apotek_id: item.tenantId,
    actor_user_id: auth.userId,
    reminder_date: now.slice(0, 10),
    phase: "post_cutoff",
    scope: "broadcast_center",
    reason_code: "announcement_unread_critical",
    payload: {
      unreadAdmin: item.adminCount,
      unreadCrew: item.crewCount,
      thresholdHours: 24,
    },
  }));

  if (inserts.length > 0) {
    const { error: insertError } = await supabase.from("reminder_dispatch_logs").insert(inserts);
    if (insertError) return { error: `Gagal mencatat reminder: ${insertError.message}` };
  }

  revalidatePath("/bba/broadcast");
  return {
    success: true,
    message:
      inserts.length === 0
        ? "Tidak ada backlog unread kritis >24 jam."
        : `Reminder backlog tercatat untuk ${inserts.length} cabang.`,
  };
}
