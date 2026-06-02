"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/app-url";
import { revalidatePath } from "next/cache";
import crypto from "crypto";
import {
  isKnownBbaPortalMenuKey,
  type BbaPortalMenuKey,
} from "@/lib/bba-portal-menus";
import { assertGlobalBbaPortalManager } from "@/lib/bba-portal-guard";
import { isValidEmail } from "@/lib/validation";
import { AUDIT_PAGE_SIZE, AUDIT_EXPORT_MAX, parseAuditDateRange, toAuditDisplayRow, escapeCsvField } from "./bba-portal-audit-shared";

async function logPortalAudit(
  supabase: ReturnType<typeof createAdminClient>,
  row: {
    actorId: string | null;
    action: string;
    targetUserId?: string | null;
    targetInvitationId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.from("bba_portal_admin_audit").insert({
    actor_user_id: row.actorId,
    action: row.action,
    target_user_id: row.targetUserId ?? null,
    target_invitation_id: row.targetInvitationId ?? null,
    metadata: row.metadata ?? {},
  });
  if (error) console.error("bba_portal_admin_audit insert failed", error);
}

export async function toggleAdminStatusAction(userId: string, currentStatus: boolean) {
  const gate = await assertGlobalBbaPortalManager();
  if (!gate.ok) return { success: false, error: gate.error };

  const supabase = createAdminClient();

  if (currentStatus) {
    const { data: target } = await supabase
      .from("app_users")
      .select("is_global_admin")
      .eq("id", userId)
      .maybeSingle();
    if (target?.is_global_admin) {
      const { data: otherGlobals } = await supabase
        .from("app_users")
        .select("id")
        .eq("is_global_admin", true)
        .eq("is_active", true)
        .neq("id", userId);
      if (!otherGlobals?.length) {
        return {
          success: false,
          error: "Tidak dapat menonaktifkan super admin global terakhir yang aktif. Angkat admin global lain dulu.",
        };
      }
    }
  }

  const { error } = await supabase.from("app_users").update({ is_active: !currentStatus }).eq("id", userId);

  if (error) {
    console.error("Error toggling admin status:", error);
    return { success: false, error: error.message };
  }

  await logPortalAudit(supabase, {
    actorId: gate.session.userId,
    action: currentStatus ? "deactivate_account" : "activate_account",
    targetUserId: userId,
    metadata: { next_active: !currentStatus },
  });

  revalidatePath("/bba/admins");
  return { success: true };
}

/** Angkat user yang sudah ada menjadi super admin global (tanpa undangan). */
export async function promoteToGlobalAdminAction(email: string) {
  const gate = await assertGlobalBbaPortalManager();
  if (!gate.ok) return { success: false, error: gate.error };

  const trimmed = email.trim().toLowerCase();
  if (!isValidEmail(trimmed)) {
    return { success: false, error: "Email tidak valid." };
  }

  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from("app_users")
    .select("id, is_global_admin")
    .eq("email", trimmed)
    .maybeSingle();
  if (error || !row?.id) {
    return { success: false, error: "User dengan email tersebut tidak ditemukan di sistem." };
  }
  if (row.is_global_admin) {
    return { success: false, error: "User ini sudah super admin global." };
  }

  const { error: upErr } = await supabase
    .from("app_users")
    .update({
      is_global_admin: true,
      bba_portal_staff_role: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (upErr) {
    return { success: false, error: upErr.message };
  }

  await supabase.from("bba_portal_user_menus").delete().eq("user_id", row.id);

  await logPortalAudit(supabase, {
    actorId: gate.session.userId,
    action: "promote_global",
    targetUserId: row.id,
    metadata: { email: trimmed },
  });

  revalidatePath("/bba/admins");
  return { success: true };
}

/** Cabut status super admin global (minimal harus ada satu global aktif lain). */
export async function demoteGlobalAdminAction(targetUserId: string) {
  const gate = await assertGlobalBbaPortalManager();
  if (!gate.ok) return { success: false, error: gate.error };

  const supabase = createAdminClient();

  const { data: others } = await supabase
    .from("app_users")
    .select("id")
    .eq("is_global_admin", true)
    .eq("is_active", true)
    .neq("id", targetUserId);
  if (!others?.length) {
    return {
      success: false,
      error: "Harus ada minimal satu super admin global aktif lain sebelum mencabut status ini.",
    };
  }

  const { data: target, error: tErr } = await supabase
    .from("app_users")
    .select("id, is_global_admin")
    .eq("id", targetUserId)
    .maybeSingle();
  if (tErr || !target?.is_global_admin) {
    return { success: false, error: "User bukan super admin global." };
  }

  const { error: upErr } = await supabase
    .from("app_users")
    .update({ is_global_admin: false, updated_at: new Date().toISOString() })
    .eq("id", targetUserId);

  if (upErr) return { success: false, error: upErr.message };

  await logPortalAudit(supabase, {
    actorId: gate.session.userId,
    action: "demote_global",
    targetUserId,
    metadata: {},
  });

  revalidatePath("/bba/admins");
  return { success: true };
}

export async function cancelBbaPortalStaffInvitationAction(invitationId: string) {
  const gate = await assertGlobalBbaPortalManager();
  if (!gate.ok) return { success: false, error: gate.error };

  const supabase = createAdminClient();
  const { data: inv, error: fErr } = await supabase
    .from("bba_portal_staff_invitations")
    .select("id, status, email")
    .eq("id", invitationId)
    .maybeSingle();
  if (fErr || !inv) return { success: false, error: "Undangan tidak ditemukan." };
  if (inv.status !== "pending") {
    return { success: false, error: "Hanya undangan berstatus pending yang dapat dibatalkan." };
  }

  const { error } = await supabase
    .from("bba_portal_staff_invitations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("status", "pending");

  if (error) return { success: false, error: error.message };

  await logPortalAudit(supabase, {
    actorId: gate.session.userId,
    action: "cancel_invitation",
    targetInvitationId: invitationId,
    metadata: { email: inv.email },
  });

  revalidatePath("/bba/admins");
  return { success: true };
}

export async function getBbaPortalInvitationLinkAction(invitationId: string) {
  const gate = await assertGlobalBbaPortalManager();
  if (!gate.ok) return { success: false as const, error: gate.error };

  const supabase = createAdminClient();
  const { data: inv, error } = await supabase
    .from("bba_portal_staff_invitations")
    .select("id, token, status")
    .eq("id", invitationId)
    .maybeSingle();
  if (error || !inv) return { success: false as const, error: "Undangan tidak ditemukan." };
  if (inv.status !== "pending") {
    return { success: false as const, error: "Link hanya tersedia untuk undangan pending." };
  }
  const inviteLink = `${getAppUrl()}/accept-bba-portal-invitation/${inv.token}`;
  return { success: true as const, inviteLink };
}

export async function updateAnalystPortalAccessAction(input: {
  userId: string;
  tenantApotekIds: string[];
  menuKeys: string[];
}) {
  const gate = await assertGlobalBbaPortalManager();
  if (!gate.ok) return { success: false, error: gate.error };

  const menuKeys = input.menuKeys.filter((k): k is BbaPortalMenuKey => isKnownBbaPortalMenuKey(k));
  if (input.tenantApotekIds.length === 0) return { success: false, error: "Pilih minimal satu cabang." };
  if (menuKeys.length === 0) return { success: false, error: "Pilih minimal satu modul menu." };

  const supabase = createAdminClient();
  const { data: userRow, error: uErr } = await supabase
    .from("app_users")
    .select("id, bba_portal_staff_role, is_global_admin")
    .eq("id", input.userId)
    .maybeSingle();
  if (uErr || !userRow) return { success: false, error: "User tidak ditemukan." };
  if (userRow.is_global_admin) {
    return { success: false, error: "Tidak dapat mengubah cakupan super admin global lewat form analyst." };
  }
  if (userRow.bba_portal_staff_role !== "analyst") {
    return { success: false, error: "Hanya akun analyst yang dapat diedit di sini." };
  }

  // Insert new menus first; only delete stale rows after success so a failed
  // insert never leaves the user with zero menu access.
  const menuRows = menuKeys.map((menu_key) => ({ user_id: input.userId, menu_key }));
  const { error: insMenu } = await supabase
    .from("bba_portal_user_menus")
    .upsert(menuRows, { onConflict: "user_id,menu_key" });
  if (insMenu) return { success: false, error: insMenu.message };

  // Fetch existing menu keys to compute stale set — avoids string-concatenation in filter.
  const { data: existingMenuRows, error: fetchMenuErr } = await supabase
    .from("bba_portal_user_menus")
    .select("menu_key")
    .eq("user_id", input.userId);
  if (fetchMenuErr) return { success: false, error: fetchMenuErr.message };
  const staleMenuKeys = (existingMenuRows ?? [])
    .map((r) => r.menu_key as string)
    .filter((k) => !menuKeys.includes(k as BbaPortalMenuKey));
  if (staleMenuKeys.length > 0) {
    const { error: delMenu } = await supabase
      .from("bba_portal_user_menus")
      .delete()
      .eq("user_id", input.userId)
      .in("menu_key", staleMenuKeys);
    if (delMenu) return { success: false, error: delMenu.message };
  }

  // Same pattern for memberships: upsert first, then delete stale tenants.
  const membershipRows = input.tenantApotekIds.map((tenant_apotek_id) => ({
    user_id: input.userId,
    tenant_apotek_id,
    role: "super_admin_bba" as const,
    is_active: true,
  }));
  const { error: memErr } = await supabase.from("tenant_memberships").upsert(membershipRows, {
    onConflict: "tenant_apotek_id,user_id,role",
  });
  if (memErr) return { success: false, error: memErr.message };

  // Fetch existing ACTIVE memberships to compute stale set — avoids touching already-inactive rows.
  const { data: existingMemRows, error: fetchMemErr } = await supabase
    .from("tenant_memberships")
    .select("tenant_apotek_id")
    .eq("user_id", input.userId)
    .eq("role", "super_admin_bba")
    .eq("is_active", true);
  if (fetchMemErr) return { success: false, error: fetchMemErr.message };
  const staleTenantIds = (existingMemRows ?? [])
    .map((r) => r.tenant_apotek_id as string)
    .filter((id) => !input.tenantApotekIds.includes(id));
  if (staleTenantIds.length > 0) {
    const { error: delMem } = await supabase
      .from("tenant_memberships")
      .delete()
      .eq("user_id", input.userId)
      .eq("role", "super_admin_bba")
      .eq("is_active", true)
      .in("tenant_apotek_id", staleTenantIds);
    if (delMem) return { success: false, error: delMem.message };
  }

  await logPortalAudit(supabase, {
    actorId: gate.session.userId,
    action: "update_analyst_access",
    targetUserId: input.userId,
    metadata: { tenant_count: input.tenantApotekIds.length, menu_keys: menuKeys },
  });

  revalidatePath("/bba/admins");
  return { success: true };
}

export async function inviteBbaPortalAnalystAction(input: {
  fullName: string;
  email: string;
  tenantApotekIds: string[];
  menuKeys: string[];
}) {
  const gate = await assertGlobalBbaPortalManager();
  if (!gate.ok) return { success: false, error: gate.error };

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const {
    data: { user: admin },
  } = await supabase.auth.getUser();
  if (!admin) return { success: false, error: "Sesi tidak valid." };

  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  if (!fullName || !isValidEmail(email)) {
    return { success: false, error: "Nama dan email wajib diisi." };
  }
  if (input.tenantApotekIds.length === 0) {
    return { success: false, error: "Pilih minimal satu cabang." };
  }
  const menuKeys = input.menuKeys.filter((k): k is BbaPortalMenuKey => isKnownBbaPortalMenuKey(k));
  if (menuKeys.length === 0) {
    return { success: false, error: "Pilih minimal satu modul menu." };
  }

  const { data: existing } = await supabaseAdmin.from("app_users").select("id, is_global_admin").eq("email", email).maybeSingle();
  if (existing?.is_global_admin) {
    return { success: false, error: "Akun ini sudah super admin global." };
  }
  if (existing?.id) {
    return { success: false, error: "Email sudah terdaftar. Untuk analyst gunakan akun baru lewat undangan." };
  }

  const token = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setHours(expiresAt.getHours() + 48);

  const { data: inserted, error } = await supabaseAdmin
    .from("bba_portal_staff_invitations")
    .insert({
      email,
      full_name: fullName,
      token,
      staff_role: "analyst",
      tenant_apotek_ids: input.tenantApotekIds,
      menu_keys: menuKeys,
      status: "pending",
      expires_at: expiresAt.toISOString(),
      created_by_user_id: admin.id,
      updated_at: now.toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error) {
    const msg = error.message?.toLowerCase() ?? "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return {
        success: false,
        error: "Sudah ada undangan pending untuk email ini. Batalkan atau tunggu kadaluarsa.",
      };
    }
    return { success: false, error: error.message };
  }

  const inviteLink = `${getAppUrl()}/accept-bba-portal-invitation/${token}`;
  if (inserted?.id) {
    await logPortalAudit(supabaseAdmin, {
      actorId: admin.id,
      action: "invite_analyst",
      targetInvitationId: inserted.id,
      metadata: { email, full_name: fullName },
    });
  }

  revalidatePath("/bba/admins");
  return { success: true, inviteLink };
}

export async function completeBbaPortalStaffInvitationAction(prevState: unknown, formData: FormData) {
  void prevState;
  const token = formData.get("token") as string;
  const password = formData.get("password") as string;

  if (!token || !password || password.length < 8) {
    return { error: "Password minimal 8 karakter." };
  }

  const supabaseAdmin = createAdminClient();

  const { data: inv, error: invError } = await supabaseAdmin
    .from("bba_portal_staff_invitations")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .maybeSingle();

  if (invError || !inv) {
    return { error: "Link undangan tidak valid atau sudah digunakan." };
  }

  if (new Date(inv.expires_at) < new Date()) {
    await supabaseAdmin
      .from("bba_portal_staff_invitations")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", inv.id);
    return { error: "Undangan sudah kadaluwarsa." };
  }

  const tenantIds = (inv.tenant_apotek_ids as string[] | null)?.filter(Boolean) ?? [];
  const menuKeys = (inv.menu_keys as string[] | null)?.filter(isKnownBbaPortalMenuKey) ?? [];
  if (tenantIds.length === 0 || menuKeys.length === 0) {
    return { error: "Undangan tidak lengkap (cabang/menu)." };
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: inv.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: inv.full_name, role: "super_admin_bba" },
  });

  if (authError || !authData.user?.id) {
    return { error: `Gagal membuat akun: ${authError?.message ?? "unknown"}` };
  }

  const userId = authData.user.id;
  const nowIso = new Date().toISOString();

  const { error: appErr } = await supabaseAdmin.from("app_users").insert({
    id: userId,
    full_name: inv.full_name,
    email: inv.email,
    is_active: true,
    is_global_admin: false,
    bba_portal_staff_role: "analyst",
    created_at: nowIso,
    updated_at: nowIso,
  });

  if (appErr) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return { error: `Gagal menyimpan profil: ${appErr.message}` };
  }

  const menuRows = menuKeys.map((menu_key) => ({ user_id: userId, menu_key }));
  const { error: menuErr } = await supabaseAdmin.from("bba_portal_user_menus").insert(menuRows);
  if (menuErr) {
    await supabaseAdmin.from("app_users").delete().eq("id", userId);
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return { error: `Gagal menyimpan izin menu: ${menuErr.message}` };
  }

  const membershipRows = tenantIds.map((tenant_apotek_id) => ({
    user_id: userId,
    tenant_apotek_id,
    role: "super_admin_bba" as const,
    is_active: true,
  }));

  const { error: memErr } = await supabaseAdmin.from("tenant_memberships").upsert(membershipRows, {
    onConflict: "tenant_apotek_id,user_id,role",
  });

  if (memErr) {
    await supabaseAdmin.from("bba_portal_user_menus").delete().eq("user_id", userId);
    await supabaseAdmin.from("app_users").delete().eq("id", userId);
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return { error: `Gagal menautkan cabang: ${memErr.message}` };
  }

  await supabaseAdmin
    .from("bba_portal_staff_invitations")
    .update({
      status: "accepted",
      accepted_at: nowIso,
      accepted_by_user_id: userId,
      updated_at: nowIso,
    })
    .eq("id", inv.id);

  await logPortalAudit(supabaseAdmin, {
    actorId: (inv.created_by_user_id as string | null) ?? null,
    action: "analyst_invite_accepted",
    targetUserId: userId,
    targetInvitationId: inv.id as string,
    metadata: { email: inv.email },
  });

  revalidatePath("/bba/admins");
  return { success: true, message: "Akun analyst berhasil diaktifkan. Silakan login." };
}

/** Paginasi log audit (offset berbasis baris terurut created_at desc). */
export async function fetchBbaPortalAuditLogsAction(
  offset: number,
  limit: number = AUDIT_PAGE_SIZE,
  filters?: { from?: string | null; to?: string | null },
) {
  const gate = await assertGlobalBbaPortalManager();
  if (!gate.ok) return { success: false as const, error: gate.error };

  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));

  const { fromIso, toIso, error: dateErr } = parseAuditDateRange(filters?.from, filters?.to);
  if (dateErr) return { success: false as const, error: dateErr };

  const supabase = createAdminClient();
  let q = supabase
    .from("bba_portal_admin_audit")
    .select("id, action, actor_user_id, target_user_id, metadata, created_at")
    .order("created_at", { ascending: false });
  if (fromIso) q = q.gte("created_at", fromIso);
  if (toIso) q = q.lte("created_at", toIso);
  const { data: rows, error } = await q.range(safeOffset, safeOffset + safeLimit - 1);

  if (error) return { success: false as const, error: error.message };

  const actorIds = [...new Set((rows ?? []).map((r: { actor_user_id?: string | null }) => r.actor_user_id).filter(Boolean))];
  let actorNameById = new Map<string, string>();
  if (actorIds.length) {
    const { data: actors } = await supabase.from("app_users").select("id, full_name").in("id", actorIds as string[]);
    actorNameById = new Map((actors ?? []).map((a: { id: string; full_name: string | null }) => [a.id, a.full_name ?? a.id]));
  }

  const mapped = (rows ?? []).map((r: Record<string, unknown>) => toAuditDisplayRow(r, actorNameById));
  return {
    success: true as const,
    rows: mapped,
    hasMore: (rows?.length ?? 0) === safeLimit,
  };
}

/** Export CSV hingga AUDIT_EXPORT_MAX baris (filter tanggal & aksi di server). */
export async function exportBbaPortalAuditCsvAction(input: {
  from?: string | null;
  to?: string | null;
  actionKey?: string | null;
}) {
  const gate = await assertGlobalBbaPortalManager();
  if (!gate.ok) return { success: false as const, error: gate.error };

  const { fromIso, toIso, error: dateErr } = parseAuditDateRange(input.from, input.to);
  if (dateErr) return { success: false as const, error: dateErr };

  const supabase = createAdminClient();
  let q = supabase
    .from("bba_portal_admin_audit")
    .select("id, action, actor_user_id, target_user_id, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(AUDIT_EXPORT_MAX);
  if (fromIso) q = q.gte("created_at", fromIso);
  if (toIso) q = q.lte("created_at", toIso);
  const ak = input.actionKey?.trim();
  if (ak) q = q.eq("action", ak);

  const { data: rows, error } = await q;
  if (error) return { success: false as const, error: error.message };

  const actorIds = [...new Set((rows ?? []).map((r: { actor_user_id?: string | null }) => r.actor_user_id).filter(Boolean))];
  let actorNameById = new Map<string, string>();
  if (actorIds.length) {
    const { data: actors } = await supabase.from("app_users").select("id, full_name").in("id", actorIds as string[]);
    actorNameById = new Map((actors ?? []).map((a: { id: string; full_name: string | null }) => [a.id, a.full_name ?? a.id]));
  }

  const mapped = (rows ?? []).map((r: Record<string, unknown>) => toAuditDisplayRow(r, actorNameById));
  const header = ["waktu_iso", "aktor", "aksi", "detail", "target_user_id", "metadata_json", "action_key"];
  const lines = [
    header,
    ...mapped.map((r) => [
      r.created_at,
      r.actorName,
      r.actionLabel,
      r.detail,
      r.targetUserId ?? "",
      r.metadata == null ? "" : JSON.stringify(r.metadata),
      r.actionKey,
    ]),
  ];
  const csv = lines.map((line) => line.map((c) => escapeCsvField(String(c))).join(",")).join("\r\n");
  return {
    success: true as const,
    csv,
    truncated: (rows?.length ?? 0) >= AUDIT_EXPORT_MAX,
    rowCount: rows?.length ?? 0,
  };
}
