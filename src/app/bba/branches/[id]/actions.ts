"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth-context";
import { assertBbaAccess } from "@/lib/bba-portal-guard";
import { createDefaultKpiV2Config, mergeKpiConfigs } from "@/lib/kpi-v2/utils";
import type { KpiConfigV2 } from "@/lib/types/kpi-v2";
import { getAppUrl } from "@/lib/app-url";
import { revalidatePath } from "next/cache";
import crypto from "crypto";

async function logActivity(supabase: any, tenantId: string, actorId: string, entityType: string, entityId: string, action: 'CREATE'|'UPDATE'|'DELETE', oldValue: any, newValue: any) {
  try {
    await supabase.from('activity_logs').insert({
      tenant_apotek_id: tenantId,
      actor_user_id: actorId,
      entity_type: entityType,
      entity_id: entityId,
      action,
      old_value: oldValue,
      new_value: newValue
    });
  } catch (e) {
    console.error("Failed to log activity:", e);
  }
}

export async function createCrewAction(prevState: any, formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const fullName = formData.get("fullName") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const tenantId = formData.get("tenantId") as string;
  const role = "crew" as const;

  if (!fullName || !email || !password || !tenantId) {
    return { error: "Semua kolom wajib diisi." };
  }

  const supabaseAdmin = createAdminClient();

  // 1. Create user in auth.users
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });

  if (authError) {
    if (authError.message.includes("already registered")) {
      return { error: "Email ini sudah terdaftar di sistem." };
    }
    return { error: `Gagal membuat akun Auth: ${authError.message}` };
  }

  const userId = authData.user?.id;
  if (!userId) {
    return { error: "Gagal membuat akun: tidak ada ID pengguna." };
  }

  const now = new Date().toISOString();

  // 2. Insert into app_users
  const { error: appUserError } = await supabaseAdmin
    .from("app_users")
    .insert({
      id: userId,
      full_name: fullName,
      email: email,
      is_active: true,
      is_branch_desk_account: false,
      created_at: now,
      updated_at: now
    });

  if (appUserError) {
    return { error: `Gagal menyimpan profil: ${appUserError.message}` };
  }

  // 3. Insert into tenant_memberships
  const { error: membershipError } = await supabaseAdmin
    .from("tenant_memberships")
    .insert({
      user_id: userId,
      tenant_apotek_id: tenantId,
      role: role,
      is_active: true,
    });

  if (membershipError) {
    return { error: `Gagal menempatkan cabang: ${membershipError.message}` };
  }

  revalidatePath(`/bba/branches/${tenantId}`);
  return { success: true, message: "Crew berhasil ditambahkan ke cabang ini!" };
}

export async function getAvailableUsersForBranch(tenantId: string) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return [];

  const supabaseAdmin = createAdminClient();

  const { data: inThisBranch } = await supabaseAdmin
    .from("tenant_memberships")
    .select("user_id")
    .eq("tenant_apotek_id", tenantId);

  const alreadyInBranch = new Set((inThisBranch ?? []).map((m) => m.user_id));

  // Hanya pegawai operasional: pernah menjadi crew atau admin_apotek (aktif) di mana pun —
  // bukan purely super_admin_bba atau owner-only.
  const { data: staffMemberships } = await supabaseAdmin
    .from("tenant_memberships")
    .select("user_id")
    .eq("is_active", true)
    .in("role", ["crew", "admin_apotek"]);

  const eligibleUserIds = [
    ...new Set(
      (staffMemberships ?? [])
        .map((m) => m.user_id)
        .filter((id) => !alreadyInBranch.has(id))
    ),
  ];

  if (eligibleUserIds.length === 0) return [];

  const { data: availableUsers, error } = await supabaseAdmin
    .from("app_users")
    .select("id, full_name, email, is_branch_desk_account")
    .eq("is_active", true)
    .in("id", eligibleUserIds)
    .order("full_name", { ascending: true });

  if (error) {
    console.error("Error fetching available users:", error);
    return [];
  }

  return (availableUsers || []).filter((u: { is_branch_desk_account?: boolean }) => !u.is_branch_desk_account);
}

export async function assignExistingCrewAction(formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const userId = formData.get("userId") as string;
  const tenantId = formData.get("tenantId") as string;

  if (!userId || !tenantId) {
    return { error: "Semua kolom wajib diisi." };
  }

  const role = "crew" as const;

  const supabaseAdmin = createAdminClient();

  const { error: membershipError } = await supabaseAdmin
    .from("tenant_memberships")
    .insert({
      user_id: userId,
      tenant_apotek_id: tenantId,
      role: role,
      is_active: true,
    });

  if (membershipError) {
    // Check if already exists just in case
    if (membershipError.code === "23505") {
      return { error: "Pegawai ini sudah ditugaskan ke cabang ini." };
    }
    return { error: `Gagal menugaskan pegawai: ${membershipError.message}` };
  }

  revalidatePath(`/bba/branches/${tenantId}`);
  return { success: true, message: "Crew berhasil ditugaskan ke cabang ini!" };
}

export async function createStaffInvitationAction(prevState: any, formData: FormData) {
  void prevState;
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const tenantId = formData.get("tenantId") as string;
  const fullName = formData.get("fullName") as string;
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const role = formData.get("role") as string;

  if (!tenantId || !fullName || !email || !role) {
    return { error: "Data undangan tidak lengkap." };
  }

  if (role !== "crew" && role !== "admin_apotek") {
    return { error: "Role tidak valid." };
  }

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user: admin } } = await supabase.auth.getUser();

  if (!admin) return { error: "Sesi admin tidak valid." };

  // If account already exists, do not invite to avoid duplicate onboarding.
  const { data: existingAppUser } = await supabaseAdmin
    .from("app_users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingAppUser) {
    return { error: "Email sudah terdaftar. Gunakan metode assign pegawai terdaftar." };
  }

  const token = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setHours(expiresAt.getHours() + 48);

  const { error } = await supabaseAdmin
    .from("staff_invitations")
    .insert({
      tenant_apotek_id: tenantId,
      email,
      full_name: fullName,
      role,
      token,
      status: "pending",
      expires_at: expiresAt.toISOString(),
      invited_by_user_id: admin.id,
      updated_at: now.toISOString(),
    });

  if (error) {
    if (error.message?.toLowerCase().includes("unique")) {
      return { error: "Undangan untuk email ini sudah ada. Gunakan salin/regenerate link." };
    }
    return { error: `Gagal membuat undangan: ${error.message}` };
  }

  const appUrl = getAppUrl();
  const inviteLink = `${appUrl}/accept-staff-invitation/${token}`;

  revalidatePath(`/bba/branches/${tenantId}`);
  return { success: true, message: "Undangan berhasil dibuat.", inviteLink };
}

export async function getPendingStaffInvitationsAction(tenantId: string) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  if (!tenantId) return { error: "Cabang tidak valid." };

  const supabaseAdmin = createAdminClient();
  const nowIso = new Date().toISOString();

  // Auto-mark expired invitations.
  await supabaseAdmin
    .from("staff_invitations")
    .update({ status: "expired", updated_at: nowIso })
    .eq("tenant_apotek_id", tenantId)
    .eq("status", "pending")
    .lt("expires_at", nowIso);

  const { data, error } = await supabaseAdmin
    .from("staff_invitations")
    .select("id, full_name, email, role, token, status, expires_at, created_at")
    .eq("tenant_apotek_id", tenantId)
    .in("status", ["pending", "expired"])
    .order("created_at", { ascending: false });

  if (error) return { error: `Gagal mengambil daftar undangan: ${error.message}` };

  const appUrl = getAppUrl();
  const mapped = (data || []).map((inv) => ({
    ...inv,
    inviteLink: `${appUrl}/accept-staff-invitation/${inv.token}`,
  }));
  return { success: true, data: mapped };
}

export async function regenerateStaffInvitationAction(invitationId: string) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  if (!invitationId) return { error: "Undangan tidak valid." };

  const supabaseAdmin = createAdminClient();
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setHours(expiresAt.getHours() + 48);
  const token = crypto.randomUUID();

  const { data: inv, error: fetchError } = await supabaseAdmin
    .from("staff_invitations")
    .select("id, tenant_apotek_id, status")
    .eq("id", invitationId)
    .maybeSingle();

  if (fetchError || !inv) return { error: "Data undangan tidak ditemukan." };
  if (inv.status === "accepted" || inv.status === "cancelled") {
    return { error: "Undangan ini tidak bisa diregenerate lagi." };
  }

  const { error } = await supabaseAdmin
    .from("staff_invitations")
    .update({
      token,
      status: "pending",
      expires_at: expiresAt.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", invitationId);

  if (error) return { error: `Gagal regenerate link: ${error.message}` };

  const appUrl = getAppUrl();
  const inviteLink = `${appUrl}/accept-staff-invitation/${token}`;

  revalidatePath(`/bba/branches/${inv.tenant_apotek_id}`);
  return { success: true, message: "Link undangan berhasil diperbarui.", inviteLink };
}

export async function completeStaffInvitationAction(prevState: any, formData: FormData) {
  void prevState;
  const token = formData.get("token") as string;
  const password = formData.get("password") as string;

  if (!token || !password || password.length < 6) {
    return { error: "Token atau password tidak valid." };
  }

  const supabaseAdmin = createAdminClient();

  const { data: inv, error: invError } = await supabaseAdmin
    .from("staff_invitations")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .maybeSingle();

  if (invError || !inv) {
    return { error: "Link undangan tidak valid atau sudah tidak aktif." };
  }

  if (new Date(inv.expires_at) < new Date()) {
    await supabaseAdmin
      .from("staff_invitations")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", inv.id);
    return { error: "Link undangan sudah kadaluwarsa." };
  }

  const isDeskAdmin = inv.role === "admin_apotek";

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: inv.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: inv.full_name, role: inv.role, branch_desk_admin: isDeskAdmin },
  });

  if (authError) {
    if (authError.message?.includes("already registered")) {
      return { error: "Email ini sudah terdaftar. Hubungi admin untuk assign ke cabang." };
    }
    return { error: `Gagal membuat akun: ${authError.message}` };
  }

  const userId = authData.user?.id;
  if (!userId) {
    return { error: "Gagal membuat akun: tidak ada ID pengguna." };
  }

  const now = new Date().toISOString();

  const { error: appUserError } = await supabaseAdmin
    .from("app_users")
    .insert({
      id: userId,
      full_name: inv.full_name,
      email: inv.email,
      is_active: true,
      is_branch_desk_account: isDeskAdmin,
      created_at: now,
      updated_at: now,
    });

  if (appUserError) {
    return { error: `Gagal menyimpan profil user: ${appUserError.message}` };
  }

  const { error: membershipError } = await supabaseAdmin
    .from("tenant_memberships")
    .insert({
      tenant_apotek_id: inv.tenant_apotek_id,
      user_id: userId,
      role: inv.role,
      is_active: true,
    });

  if (membershipError) {
    return { error: `Gagal menyimpan penugasan cabang: ${membershipError.message}` };
  }

  await supabaseAdmin
    .from("staff_invitations")
    .update({
      status: "accepted",
      accepted_by_user_id: userId,
      accepted_at: now,
      updated_at: now,
    })
    .eq("id", inv.id);

  return { success: true, message: "Akun berhasil diaktifkan. Silakan login." };
}

async function requireBbaSuperAdminActor(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await getSessionContext();
  if (!session?.userId) return { ok: false, error: "Tidak terautentikasi." };
  const active = session.activeMembership;
  if (!session.isGlobalSuperAdmin && active?.role !== "super_admin_bba") {
    return { ok: false, error: "Hanya super admin BBA yang dapat melakukan aksi ini." };
  }
  return { ok: true, userId: session.userId };
}

export type BranchDeskAdminActionState =
  | undefined
  | { error: string }
  | { success: true; message: string };

export async function createBranchDeskAdminAccountAction(
  _prev: BranchDeskAdminActionState,
  formData: FormData,
): Promise<BranchDeskAdminActionState> {
  const gate = await requireBbaSuperAdminActor();
  if (!gate.ok) return { error: gate.error };

  const tenantId = formData.get("tenantId")?.toString()?.trim();
  const email = formData.get("email")?.toString()?.trim().toLowerCase();
  const password = formData.get("password")?.toString() ?? "";

  if (!tenantId || !email || password.length < 8) {
    return { error: "Lengkapi email dan password (minimal 8 karakter)." };
  }

  const supabaseAdmin = createAdminClient();

  const { data: branchRow } = await supabaseAdmin
    .from("tenant_apotek")
    .select("name, code")
    .eq("id", tenantId)
    .maybeSingle();
  const branchLabel = (branchRow?.name || branchRow?.code || "Cabang").trim();
  const fullName = `Admin cabang — ${branchLabel}`.slice(0, 120);

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: "admin_apotek", branch_desk_admin: true },
  });

  if (authError || !authData.user?.id) {
    if (authError?.message?.includes("already registered")) {
      return { error: "Email ini sudah terdaftar." };
    }
    return { error: `Gagal membuat akun: ${authError?.message ?? "unknown"}` };
  }

  const userId = authData.user.id;
  const now = new Date().toISOString();

  const { error: appUserError } = await supabaseAdmin.from("app_users").insert({
    id: userId,
    full_name: fullName,
    email,
    is_active: true,
    is_branch_desk_account: true,
    created_at: now,
    updated_at: now,
  });

  if (appUserError) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return { error: `Gagal menyimpan profil: ${appUserError.message}` };
  }

  const { error: membershipError } = await supabaseAdmin.from("tenant_memberships").insert({
    user_id: userId,
    tenant_apotek_id: tenantId,
    role: "admin_apotek",
    is_active: true,
  });

  if (membershipError) {
    await supabaseAdmin.from("app_users").delete().eq("id", userId);
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return { error: `Gagal menempatkan cabang: ${membershipError.message}` };
  }

  await logActivity(supabaseAdmin, tenantId, gate.userId, "app_users", userId, "CREATE", null, {
    branch_desk_admin: true,
    email,
  });

  revalidatePath(`/bba/branches/${tenantId}`);
  return { success: true, message: "Akun portal admin cabang berhasil dibuat." };
}

export async function resetBranchDeskAdminPasswordAction(
  _prev: BranchDeskAdminActionState,
  formData: FormData,
): Promise<BranchDeskAdminActionState> {
  const gate = await requireBbaSuperAdminActor();
  if (!gate.ok) return { error: gate.error };

  const tenantId = formData.get("tenantId")?.toString()?.trim();
  const userId = formData.get("userId")?.toString()?.trim();
  const password = formData.get("password")?.toString() ?? "";

  if (!tenantId || !userId || password.length < 8) {
    return { error: "Data tidak valid (password minimal 8 karakter)." };
  }

  const supabaseAdmin = createAdminClient();

  const [{ data: profile }, { data: mem }] = await Promise.all([
    supabaseAdmin.from("app_users").select("is_branch_desk_account").eq("id", userId).maybeSingle(),
    supabaseAdmin
      .from("tenant_memberships")
      .select("id")
      .eq("tenant_apotek_id", tenantId)
      .eq("user_id", userId)
      .eq("role", "admin_apotek")
      .maybeSingle(),
  ]);

  if (!profile?.is_branch_desk_account || !mem?.id) {
    return { error: "Akun bukan admin meja cabang di tenant ini." };
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
  if (error) return { error: error.message };

  revalidatePath(`/bba/branches/${tenantId}`);
  return { success: true, message: "Password akun admin cabang telah diperbarui." };
}

export async function saveAddonAction(prevState: any, formData: FormData) {
  void prevState;
  const session = await getSessionContext();
  const activeRole = session?.activeMembership?.role;
  if (activeRole !== "admin_apotek" && activeRole !== "super_admin_bba") {
    return { error: "Hanya akun admin yang dapat mengubah pengaturan add-on." };
  }

  const tenantId = formData.get("tenantId") as string;
  const produkFokus = formData.get("produk_fokus") === "on";
  const payroll = formData.get("payroll") === "on";
  const reviewPelanggan = formData.get("review_pelanggan") === "on";
  const reviewInternal = formData.get("review_internal") === "on";
  const absensiShift = formData.get("absensi_shift") === "on";

  if (!tenantId) return { error: "Cabang tidak valid." };

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const now = new Date().toISOString();
  
  // Need current user
  const { data: { user } } = await supabase.auth.getUser();

  const addonsToSet = [
    { key: "produk_fokus", enabled: produkFokus },
    { key: "payroll", enabled: payroll },
    { key: "review_pelanggan", enabled: reviewPelanggan },
    { key: "review_internal", enabled: reviewInternal },
    { key: "absensi_shift", enabled: absensiShift }
  ];

  // We need to upsert each one. 
  // Get existing
  const { data: existing } = await supabaseAdmin
    .from("addon_settings")
    .select("id, addon_key")
    .eq("tenant_apotek_id", tenantId);

  for (const addon of addonsToSet) {
    const existingAddon = existing?.find(a => a.addon_key === addon.key);
    if (existingAddon) {
      await supabaseAdmin
        .from("addon_settings")
        .update({ is_enabled: addon.enabled, updated_at: now, updated_by_user_id: user?.id })
        .eq("id", existingAddon.id);
    } else {
      await supabaseAdmin
        .from("addon_settings")
        .insert({
          tenant_apotek_id: tenantId,
          addon_key: addon.key,
          is_enabled: addon.enabled,
          settings: {},
          updated_by_user_id: user?.id,
          updated_at: now
        });
    }
  }

  revalidatePath(`/bba/branches/${tenantId}`);
  revalidatePath(`/bba/branches`);
  return { success: true, message: "Pengaturan Add-on berhasil diperbarui!" };
}

export async function updateBranchAction(prevState: any, formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const tenantId = formData.get("tenantId") as string;
  const name = formData.get("name") as string;
  const code = formData.get("code") as string;
  const status = formData.get("status") as string;
  const address = formData.get("address") as string;
  const phone = formData.get("phone") as string;

  if (!tenantId || !name || !code) return { error: "Nama dan Kode wajib diisi." };

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const now = new Date().toISOString();

  const { data: oldBranch } = await supabaseAdmin
    .from("tenant_apotek")
    .select("id, name, code, status, address, phone")
    .eq("id", tenantId)
    .maybeSingle();

  const payload = {
    name,
    code,
    status,
    address: address || null,
    phone: phone || null,
    updated_at: now
  };

  const { error } = await supabaseAdmin
    .from("tenant_apotek")
    .update(payload)
    .eq("id", tenantId);

  if (error) return { error: `Gagal memperbarui cabang: ${error.message}` };

  if (user) {
    await logActivity(supabaseAdmin, tenantId, user.id, "tenant_apotek", tenantId, "UPDATE", oldBranch, payload);
  }

  revalidatePath(`/bba/branches/${tenantId}`);
  revalidatePath(`/bba/branches`);
  return { success: true, message: "Profil cabang berhasil diperbarui!" };
}

export async function transferBranchOwnershipAction(prevState: any, formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const tenantId = formData.get("tenantId") as string;
  const newOwnerId = formData.get("newOwnerId") as string;

  if (!tenantId || !newOwnerId) return { error: "Data tidak lengkap." };

  const supabaseAdmin = createAdminClient();

  // Ensure selected user is an active user and has owner role in memberships.
  const { data: ownerCandidate, error: ownerCandidateError } = await supabaseAdmin
    .from("tenant_memberships")
    .select(`
      id,
      app_users!inner (
        id,
        is_active
      )
    `)
    .eq("user_id", newOwnerId)
    .eq("role", "owner")
    .eq("is_active", true)
    .eq("app_users.is_active", true)
    .limit(1)
    .maybeSingle();

  if (ownerCandidateError) {
    return { error: `Gagal memvalidasi owner terpilih: ${ownerCandidateError.message}` };
  }

  if (!ownerCandidate) {
    return { error: "User yang dipilih bukan owner aktif yang valid." };
  }

  // 1. Ensure new owner exists in target branch as owner first (upsert-style via insert/update fallback).
  const { error } = await supabaseAdmin
    .from("tenant_memberships")
    .insert({
      tenant_apotek_id: tenantId,
      user_id: newOwnerId,
      role: "owner",
      is_active: true
    });

  if (error) {
    // If unique constraint violation (already assigned as something else), try update instead
    if (error.code === '23505') {
       const { error: updateError } = await supabaseAdmin
        .from("tenant_memberships")
        .update({ role: "owner", is_active: true })
        .eq("tenant_apotek_id", tenantId)
        .eq("user_id", newOwnerId);
        
       if (updateError) return { error: `Gagal memindahkan kepemilikan (update): ${updateError.message}` };
    } else {
       return { error: `Gagal memindahkan kepemilikan: ${error.message}` };
    }
  }

  // 2. Remove previous owners in target branch, but keep the selected owner.
  const { error: cleanupError } = await supabaseAdmin
    .from("tenant_memberships")
    .delete()
    .eq("tenant_apotek_id", tenantId)
    .eq("role", "owner")
    .neq("user_id", newOwnerId);

  if (cleanupError) {
    return { error: `Owner baru sudah diset, tetapi gagal membersihkan owner lama: ${cleanupError.message}` };
  }

  revalidatePath(`/bba/branches/${tenantId}`);
  revalidatePath(`/bba/branches`);
  return { success: true, message: "Kepemilikan cabang berhasil dipindahkan!" };
}


export async function toggleMembershipStatusAction(formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const membershipId = formData.get("membershipId") as string;
  const currentStatus = formData.get("currentStatus") === "true";
  const branchId = formData.get("branchId") as string;

  if (!membershipId) return { error: "Pegawai tidak ditemukan." };

  const newStatus = !currentStatus;

  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin
    .from("tenant_memberships")
    .update({ is_active: newStatus })
    .eq("id", membershipId);

  if (error) {
    return { error: `Gagal mengubah status pegawai: ${error.message}` };
  }

  revalidatePath(`/bba/branches/${branchId}`);
  return { success: true, message: `Status pegawai berhasil di${newStatus ? 'aktifkan' : 'nonaktifkan'}!` };
}

export async function editCrewAction(prevState: any, formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const membershipId = formData.get("membershipId") as string;
  const userId = formData.get("userId") as string;
  const branchId = formData.get("tenantId") as string;
  const fullName = formData.get("fullName") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const role = formData.get("role") as string;

  if (!membershipId || !userId || !fullName || !role || !email) {
    return { error: "Semua data profil wajib diisi." };
  }

  const supabaseAdmin = createAdminClient();

  // 1. Update app_users
  const { error: appUserError } = await supabaseAdmin
    .from("app_users")
    .update({ 
      full_name: fullName, 
      email: email,
      updated_at: new Date().toISOString() 
    })
    .eq("id", userId);

  if (appUserError) return { error: `Gagal memperbarui profil: ${appUserError.message}` };

  // 2. Update auth user (metadata, email, password if provided)
  const authUpdates: any = {
    email: email,
    user_metadata: { full_name: fullName, role }
  };
  
  if (password && password.trim() !== "") {
    authUpdates.password = password;
  }

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, authUpdates);
  if (authError) {
    // If email already exists, it might throw here
    if (authError.message.includes("already registered")) {
      return { error: "Email ini sudah digunakan oleh akun lain." };
    }
    return { error: `Gagal memperbarui autentikasi: ${authError.message}` };
  }

  // 3. Update tenant_memberships role
  const { error: membershipError } = await supabaseAdmin
    .from("tenant_memberships")
    .update({ role: role })
    .eq("id", membershipId);

  if (membershipError) return { error: `Gagal memperbarui role: ${membershipError.message}` };

  revalidatePath(`/bba/branches/${branchId}`);
  return { success: true, message: "Data pegawai berhasil diperbarui!" };
}

export async function saveShiftAction(prevState: any, formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const tenantId = formData.get("tenantId") as string;
  const shiftId = formData.get("shiftId") as string;
  const shiftName = formData.get("shiftName") as string;
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;

  if (!tenantId || !shiftName || !startTime || !endTime) {
    return { error: "Semua data shift wajib diisi." };
  }

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const now = new Date().toISOString();

  const payload = {
    tenant_apotek_id: tenantId,
    shift_name: shiftName,
    start_time: startTime,
    end_time: endTime,
    updated_at: now
  };

  let error;
  let oldShift: any = null;
  if (shiftId) {
    const { data } = await supabaseAdmin
      .from("master_shifts")
      .select("*")
      .eq("id", shiftId)
      .maybeSingle();
    oldShift = data ?? null;

    const { error: updateError } = await supabaseAdmin
      .from("master_shifts")
      .update(payload)
      .eq("id", shiftId);
    error = updateError;
  } else {
    const { error: insertError } = await supabaseAdmin
      .from("master_shifts")
      .insert({ ...payload, created_at: now });
    error = insertError;
  }

  if (error) return { error: `Gagal menyimpan shift: ${error.message}` };

  if (user) {
    await logActivity(
      supabaseAdmin,
      tenantId,
      user.id,
      "master_shifts",
      shiftId || `${tenantId}:${shiftName}:${startTime}`,
      shiftId ? "UPDATE" : "CREATE",
      oldShift,
      payload
    );
  }

  revalidatePath(`/bba/branches/${tenantId}`);
  return { success: true, message: "Data shift berhasil disimpan!" };
}

export async function deleteShiftAction(formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const shiftId = formData.get("shiftId") as string;
  const tenantId = formData.get("tenantId") as string;

  if (!shiftId) return { error: "ID Shift tidak ditemukan." };

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Block deletion if shift is still used in upcoming or current-month roster entries
  const today = new Date().toISOString().slice(0, 10);
  const { count: futureCount } = await supabaseAdmin
    .from("shift_schedules")
    .select("id", { count: "exact", head: true })
    .eq("shift_id", shiftId)
    .gte("schedule_date", today);

  if (futureCount && futureCount > 0) {
    return {
      error: `Shift ini masih digunakan di ${futureCount} jadwal ke depan. Hapus atau ubah jadwal tersebut terlebih dahulu sebelum menghapus shift ini.`,
    };
  }

  const { data: oldShift } = await supabaseAdmin
    .from("master_shifts")
    .select("*")
    .eq("id", shiftId)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("master_shifts")
    .delete()
    .eq("id", shiftId);

  if (error) return { error: `Gagal menghapus shift: ${error.message}` };

  if (user) {
    await logActivity(supabaseAdmin, tenantId, user.id, "master_shifts", shiftId, "DELETE", oldShift, null);
  }

  revalidatePath(`/bba/branches/${tenantId}`);
  return { success: true, message: "Shift berhasil dihapus!" };
}

export async function saveAddonSettingsAction(prevState: any, formData: FormData) {
  void prevState;
  const session = await getSessionContext();
  const activeRole = session?.activeMembership?.role;
  if (activeRole !== "admin_apotek" && activeRole !== "super_admin_bba") {
    return { error: "Hanya akun admin yang dapat mengubah konfigurasi add-on." };
  }

  const tenantId = formData.get("tenantId") as string;
  const addonKey = formData.get("addonKey") as string;
  let patch: Record<string, unknown>;
  try {
    patch = JSON.parse(formData.get("settings") as string) as Record<string, unknown>;
  } catch {
    return { error: "Format konfigurasi tidak valid." };
  }

  if (!tenantId || !addonKey) return { error: "Data tidak valid." };
  if (addonKey === "review_pelanggan") {
    return {
      error: "Review pelanggan tidak perlu diset manual lagi. Akses input mengikuti akun admin.",
    };
  }

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const now = new Date().toISOString();

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from("addon_settings")
    .select("id, settings")
    .eq("tenant_apotek_id", tenantId)
    .eq("addon_key", addonKey)
    .maybeSingle();

  if (fetchErr) return { error: `Gagal membaca konfigurasi: ${fetchErr.message}` };
  if (!existing) {
    return {
      error:
        "Baris add-on untuk cabang ini belum ada. Tekan tombol “Simpan Perubahan Aturan” di atas dulu untuk menyimpan on/off.",
    };
  }

  const prevPlain =
    existing.settings !== null &&
    typeof existing.settings === "object" &&
    !Array.isArray(existing.settings)
      ? (existing.settings as Record<string, unknown>)
      : {};
  const merged = { ...prevPlain, ...patch };

  const { error } = await supabaseAdmin
    .from("addon_settings")
    .update({
      settings: merged,
      updated_at: now,
      ...(user?.id ? { updated_by_user_id: user.id } : {}),
    })
    .eq("id", existing.id);

  if (error) return { error: `Gagal menyimpan konfigurasi: ${error.message}` };

  if (user) {
    await logActivity(
      supabaseAdmin,
      tenantId,
      user.id,
      "addon_settings",
      existing.id,
      "UPDATE",
      { settings: prevPlain },
      { settings: merged }
    );
  }

  revalidatePath(`/bba/branches/${tenantId}`);
  return { success: true, message: "Konfigurasi berhasil disimpan!" };
}

export async function saveProductFokusAction(prevState: any, formData: FormData) {
  void prevState;
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const tenantId = formData.get("tenantId") as string;
  const productId = formData.get("productId") as string;
  const targetType = formData.get("targetType") as string; // 'item' or 'nominal'
  const targetValue = parseFloat(formData.get("targetValue") as string);
  const bonusType = formData.get("bonusType") as string; // 'flat' or 'kelipatan'
  const bonusValue = parseFloat(formData.get("bonusValue") as string);
  const bonusStep = formData.get("bonusStep") ? parseFloat(formData.get("bonusStep") as string) : null;
  const periodMonth = parseInt(formData.get("periodMonth") as string, 10);
  const periodYear = parseInt(formData.get("periodYear") as string, 10);

  if (!tenantId || !productId || isNaN(targetValue) || isNaN(bonusValue)) {
    return { error: "Semua data wajib diisi dengan benar." };
  }
  if (!["item", "nominal"].includes(targetType)) return { error: "Jenis target tidak valid." };
  if (!["flat", "kelipatan"].includes(bonusType)) return { error: "Mode bonus tidak valid." };
  if (targetValue <= 0 || bonusValue <= 0) return { error: "Target dan bonus harus lebih dari 0." };
  if (bonusType === "kelipatan" && (!bonusStep || bonusStep <= 0)) {
    return { error: "Kelipatan bonus wajib diisi dan harus lebih dari 0." };
  }
  if (!Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12) {
    return { error: "Periode bulan tidak valid." };
  }
  if (!Number.isInteger(periodYear) || periodYear < 2000) {
    return { error: "Periode tahun tidak valid." };
  }

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: oldConfig } = await supabaseAdmin
    .from("product_fokus_configs")
    .select("*")
    .eq("tenant_apotek_id", tenantId)
    .eq("product_id", productId)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear)
    .maybeSingle();

  const payload = {
    tenant_apotek_id: tenantId,
    product_id: productId,
    period_month: periodMonth,
    period_year: periodYear,
    target_type: targetType,
    target_value: targetValue,
    bonus_type: bonusType,
    bonus_value: bonusValue,
    bonus_step: bonusType === "kelipatan" ? bonusStep : null
  };

  const { error } = await supabaseAdmin
    .from("product_fokus_configs")
    .upsert(payload, { onConflict: 'tenant_apotek_id,product_id,period_month,period_year' });

  if (error) return { error: `Gagal menyimpan produk fokus: ${error.message}` };

  if (user) {
    await logActivity(
      supabaseAdmin,
      tenantId,
      user.id,
      "product_fokus_configs",
      `${productId}:${periodMonth}:${periodYear}`,
      oldConfig ? "UPDATE" : "CREATE",
      oldConfig,
      payload
    );
  }

  revalidatePath(`/bba/branches/${tenantId}`);
  return { success: true, message: "Produk fokus berhasil ditambahkan!" };
}

export async function deleteProductFokusAction(formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const configId = formData.get("configId") as string;
  const tenantId = formData.get("tenantId") as string;

  if (!configId || !tenantId) return { error: "ID atau tenant tidak ditemukan." };

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: oldConfig } = await supabaseAdmin
    .from("product_fokus_configs")
    .select("*")
    .eq("id", configId)
    .eq("tenant_apotek_id", tenantId)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("product_fokus_configs")
    .delete()
    .eq("id", configId)
    .eq("tenant_apotek_id", tenantId);

  if (error) return { error: `Gagal menghapus: ${error.message}` };

  if (user && oldConfig) {
    await logActivity(
      supabaseAdmin,
      tenantId,
      user.id,
      "product_fokus_configs",
      configId,
      "DELETE",
      oldConfig,
      null
    );
  }

  revalidatePath(`/bba/branches/${tenantId}`);
  return { success: true, message: "Produk fokus dihapus." };
}

export async function saveRosterAction(formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const tenantId = formData.get("tenantId") as string;
  const userId = formData.get("userId") as string;
  const date = formData.get("date") as string;
  const shiftId = formData.get("shiftId") as string; // can be 'OFF' or UUID

  if (!tenantId || !userId || !date) return { error: "Data tidak valid." };

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: oldRoster } = await supabaseAdmin
    .from("shift_schedules")
    .select("*")
    .eq("tenant_apotek_id", tenantId)
    .eq("user_id", userId)
    .eq("schedule_date", date)
    .maybeSingle();

  const normalizedShiftId = shiftId === "OFF" || shiftId === "" ? null : shiftId;
  const payload = {
    tenant_apotek_id: tenantId,
    user_id: userId,
    schedule_date: date,
    shift_id: normalizedShiftId,
    is_off: shiftId === "OFF",
  };

  const { error } = await supabaseAdmin
    .from("shift_schedules")
    .upsert(payload, { onConflict: 'tenant_apotek_id,user_id,schedule_date' });

  if (error) return { error: `Gagal menyimpan roster: ${error.message}` };

  if (user) {
    await logActivity(
      supabaseAdmin,
      tenantId,
      user.id,
      "shift_schedules",
      `${userId}:${date}`,
      oldRoster ? "UPDATE" : "CREATE",
      oldRoster,
      payload
    );
  }

  revalidatePath(`/bba/branches/${tenantId}`);
  return { success: true };
}

export async function copyRosterAction(formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const tenantId = formData.get("tenantId") as string;
  const month = parseInt(formData.get("month") as string);
  const year = parseInt(formData.get("year") as string);

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  // 1. Fetch prev month roster
  const prevStart = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  const prevEnd = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(new Date(prevYear, prevMonth, 0).getDate()).padStart(2, "0")}`;
  const { data: prevRoster } = await supabaseAdmin
    .from("shift_schedules")
    .select("*")
    .eq("tenant_apotek_id", tenantId)
    .gte("schedule_date", prevStart)
    .lte("schedule_date", prevEnd);

  if (!prevRoster || prevRoster.length === 0) {
    return { error: "Data bulan sebelumnya tidak ditemukan." };
  }

  // 2. Map and Insert (Simple day-to-day mapping)
  const newRoster = prevRoster.map(r => {
    const d = new Date(r.schedule_date);
    const newDate = new Date(year, month - 1, d.getDate());
    // Ensure the day is valid for the target month
    if (newDate.getMonth() + 1 !== month) return null;

    return {
      tenant_apotek_id: tenantId,
      user_id: r.user_id,
      schedule_date: newDate.toISOString().split('T')[0],
      shift_id: r.shift_id,
      is_off: r.is_off
    };
  }).filter(Boolean);

  const { error } = await supabaseAdmin
    .from("shift_schedules")
    .upsert(newRoster, { onConflict: 'tenant_apotek_id,user_id,schedule_date' });

  if (error) return { error: `Gagal menyalin roster: ${error.message}` };

  if (user) {
    await logActivity(
      supabaseAdmin,
      tenantId,
      user.id,
      "shift_schedules",
      tenantId,
      "UPDATE",
      null,
      { action: "COPY_PREV_MONTH", sourceMonth: prevMonth, sourceYear: prevYear, copiedRows: newRoster.length, targetMonth: month, targetYear: year }
    );
  }

  revalidatePath(`/bba/branches/${tenantId}`);
  return { success: true, message: "Roster berhasil disalin!" };
}

export async function applyShiftTemplateAction(prevState: any, formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const branchId = formData.get("branchId") as string;
  const month = parseInt(formData.get("month") as string);
  const year = parseInt(formData.get("year") as string);
  const entriesJson = formData.get("entriesJson") as string;

  if (!branchId || !month || !year) return { error: "Data tidak valid." };

  const entries: { userId: string; date: string; shiftId: string }[] = JSON.parse(entriesJson);

  const supabase = createAdminClient();
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  // Delete existing shift_schedules for this month at this branch
  const { error: deleteError } = await supabase
    .from("shift_schedules")
    .delete()
    .eq("tenant_apotek_id", branchId)
    .gte("schedule_date", firstDay)
    .lte("schedule_date", lastDay);

  if (deleteError) return { error: `Gagal reset jadwal: ${deleteError.message}` };

  // Bulk insert new entries
  if (entries.length > 0) {
    const rows = entries.map((e) => ({
      tenant_apotek_id: branchId,
      user_id: e.userId,
      schedule_date: e.date,
      shift_id: e.shiftId,
      is_off: false,
    }));
    const { error: insertError } = await supabase.from("shift_schedules").insert(rows);
    if (insertError) return { error: `Gagal menyimpan jadwal: ${insertError.message}` };
  }

  revalidatePath(`/bba/branches/${branchId}`);
  return { success: true, message: `${entries.length} jadwal shift berhasil diterapkan.` };
}

export async function savePayrollConfigAction(prevState: any, formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const tenantId = formData.get("tenantId") as string;
  const userId = formData.get("userId") as string;
  const baseSalary = parseFloat(formData.get("baseSalary") as string) || 0;
  const positionAllowance = parseFloat(formData.get("positionAllowance") as string) || 0;
  const mealAllowance = parseFloat(formData.get("mealAllowance") as string) || 0;
  const transportAllowance = parseFloat(formData.get("transportAllowance") as string) || 0;
  const bpjsDeduction = parseFloat(formData.get("bpjsDeduction") as string) || 0;
  const customAdjustmentsStr = formData.get("customAdjustments") as string;
  const customAdjustments = customAdjustmentsStr ? JSON.parse(customAdjustmentsStr) : [];

  if (!tenantId || !userId) return { error: "Data tidak valid." };

  const supabase = createAdminClient();
  const supabaseClient = await createClient();
  const { data: { user } } = await supabaseClient.auth.getUser();
  const now = new Date().toISOString();

  // Get old config for diff
  const { data: oldConfig } = await supabase
    .from("payroll_configs")
    .select("*")
    .eq("tenant_apotek_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();

  const payload = {
    tenant_apotek_id: tenantId,
    user_id: userId,
    base_salary: baseSalary,
    position_allowance: positionAllowance,
    meal_allowance: mealAllowance,
    transport_allowance: transportAllowance,
    bpjs_deduction: bpjsDeduction,
    custom_adjustments: customAdjustments,
    updated_at: now
  };

  const { error } = await supabase
    .from("payroll_configs")
    .upsert(payload, { onConflict: 'user_id, tenant_apotek_id' });

  if (error) return { error: `Gagal menyimpan konfigurasi payroll: ${error.message}` };

  if (user) {
    await logActivity(supabase, tenantId, user.id, 'payroll_configs', userId, oldConfig ? 'UPDATE' : 'CREATE', oldConfig, payload);
  }

  revalidatePath(`/bba/branches/${tenantId}`);
  return { success: true, message: "Konfigurasi gaji pegawai berhasil disimpan!" };
}

export async function resetCrewPasswordAction(prevState: any, formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const userId = formData.get("userId") as string;
  const newPassword = formData.get("password") as string;

  if (!userId || !newPassword) {
    return { error: "User ID dan Password baru wajib diisi." };
  }

  const supabaseAdmin = createAdminClient();
  
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword
  });

  if (error) {
    return { error: `Gagal mereset password: ${error.message}` };
  }

  return { success: true, message: "Password berhasil direset." };
}

export async function createStaffPasswordResetLinkAction(formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const userId = formData.get("userId") as string;
  const tenantId = formData.get("tenantId") as string;
  if (!userId || !tenantId) return { error: "Data user/cabang tidak valid." };

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user: admin } } = await supabase.auth.getUser();
  if (!admin) return { error: "Sesi admin tidak valid." };

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setHours(expiresAt.getHours() + 24);
  const token = crypto.randomUUID();

  // Expire previous pending tokens for same user in same branch.
  await supabaseAdmin
    .from("staff_password_reset_links")
    .update({ status: "expired", updated_at: now.toISOString() })
    .eq("user_id", userId)
    .eq("tenant_apotek_id", tenantId)
    .eq("status", "pending");

  const { error } = await supabaseAdmin
    .from("staff_password_reset_links")
    .insert({
      user_id: userId,
      tenant_apotek_id: tenantId,
      token,
      status: "pending",
      expires_at: expiresAt.toISOString(),
      created_by_user_id: admin.id,
      updated_at: now.toISOString(),
    });

  if (error) return { error: `Gagal membuat link reset: ${error.message}` };

  const inviteLink = `${getAppUrl()}/set-password/${token}`;
  return { success: true, message: "Link reset password berhasil dibuat.", inviteLink };
}

export async function completeStaffPasswordResetWithTokenAction(prevState: any, formData: FormData) {
  void prevState;
  const token = formData.get("token") as string;
  const password = formData.get("password") as string;

  if (!token || !password || password.length < 6) {
    return { error: "Token atau password tidak valid." };
  }

  const supabaseAdmin = createAdminClient();
  const now = new Date();

  const { data: link, error: linkError } = await supabaseAdmin
    .from("staff_password_reset_links")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .maybeSingle();

  if (linkError || !link) {
    return { error: "Link reset tidak valid atau sudah digunakan." };
  }

  if (new Date(link.expires_at) < now) {
    await supabaseAdmin
      .from("staff_password_reset_links")
      .update({ status: "expired", updated_at: now.toISOString() })
      .eq("id", link.id);
    return { error: "Link reset sudah kadaluwarsa." };
  }

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(link.user_id, {
    password,
  });
  if (authError) {
    return { error: `Gagal memperbarui password: ${authError.message}` };
  }

  await supabaseAdmin
    .from("staff_password_reset_links")
    .update({ status: "used", used_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("id", link.id);

  return { success: true, message: "Password berhasil diperbarui. Silakan login." };
}

/** KPI V2 untuk cabang tujuan: salin skema, kosongkan user_configs individu, sinkronkan target kolom numerik. */
function buildClonedBonusConfigV2(sourceKpi: {
  target_omzet?: unknown;
  target_atv?: unknown;
  target_atu?: unknown;
  bonus_config_v2?: unknown;
}): KpiConfigV2 {
  const base = createDefaultKpiV2Config();
  const raw = sourceKpi.bonus_config_v2;
  let merged = base;
  if (raw && typeof raw === "object" && (raw as KpiConfigV2).version === "2.0") {
    merged = mergeKpiConfigs(base, raw as Partial<KpiConfigV2>);
  }
  const g = merged.global;
  const next = mergeKpiConfigs(merged, {
    global: {
      ...g,
      target_omzet: Number(sourceKpi.target_omzet) || g.target_omzet,
      target_atv: Number(sourceKpi.target_atv) || g.target_atv,
      target_atu: Number(sourceKpi.target_atu) || g.target_atu,
    },
    individual_monthly: {
      ...merged.individual_monthly,
      user_configs: {},
    },
    individual_daily: {
      ...merged.individual_daily,
      user_configs: {},
    },
  });
  const active_schemes: KpiConfigV2["active_schemes"] = [];
  if (next.team_monthly.enabled) active_schemes.push("team_monthly");
  if (next.team_daily.enabled) active_schemes.push("team_daily");
  if (next.individual_monthly.enabled) active_schemes.push("individual_monthly");
  if (next.individual_daily.enabled) active_schemes.push("individual_daily");
  return { ...next, active_schemes };
}

export async function getOtherBranchesAction(currentBranchId: string) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin
    .from("tenant_apotek")
    .select("id, name, code")
    .neq("id", currentBranchId)
    .eq("status", "active")
    .order("name");

  if (error) return { error: "Gagal mengambil daftar cabang." };
  return { success: true, data };
}

export async function cloneBranchConfigAction(prevState: any, formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const targetBranchId = formData.get("targetBranchId") as string;
  const sourceBranchId = formData.get("sourceBranchId") as string;
  
  const cloneShifts = formData.get("cloneShifts") === "true";
  const cloneAddons = formData.get("cloneAddons") === "true";
  const cloneKpi = formData.get("cloneKpi") === "true";
  const cloneProdukFokus = formData.get("cloneProdukFokus") === "true";

  if (!targetBranchId || !sourceBranchId) {
    return { error: "Cabang asal dan tujuan harus dipilih." };
  }

  const supabaseAdmin = createAdminClient();
  const now = new Date().toISOString();
  
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  try {
    // 1. CLONE MASTER SHIFTS
    if (cloneShifts) {
      await supabaseAdmin.from("master_shifts").delete().eq("tenant_apotek_id", targetBranchId);
      const { data: sourceShifts } = await supabaseAdmin.from("master_shifts").select("*").eq("tenant_apotek_id", sourceBranchId);
      
      if (sourceShifts && sourceShifts.length > 0) {
        const newShifts = sourceShifts.map(s => ({
          tenant_apotek_id: targetBranchId,
          shift_name: s.shift_name,
          start_time: s.start_time,
          end_time: s.end_time,
          created_at: now,
          updated_at: now
        }));
        await supabaseAdmin.from("master_shifts").insert(newShifts);
      }
    }

    // 2. CLONE ADDON SETTINGS
    if (cloneAddons) {
      await supabaseAdmin.from("addon_settings").delete().eq("tenant_apotek_id", targetBranchId);
      const { data: sourceAddons } = await supabaseAdmin.from("addon_settings").select("*").eq("tenant_apotek_id", sourceBranchId);
      
      if (sourceAddons && sourceAddons.length > 0) {
        const newAddons = sourceAddons.map(a => {
          // Remove pic_user_ids from review addons if they exist, because users are different
          let settings = a.settings;
          if (settings && typeof settings === 'object') {
             if ('pic_user_ids' in settings) {
               settings = { ...settings, pic_user_ids: [] };
             }
          }
          return {
            tenant_apotek_id: targetBranchId,
            addon_key: a.addon_key,
            is_enabled: a.is_enabled,
            settings: settings,
            updated_by_user_id: user?.id,
            updated_at: now
          };
        });
        await supabaseAdmin.from("addon_settings").insert(newAddons);
      }
    }

    // 3. CLONE KPI GLOBAL (LATEST)
    if (cloneKpi) {
      // Find the latest KPI config from source
      const { data: sourceKpi } = await supabaseAdmin.from("kpi_configs")
        .select("*")
        .eq("tenant_apotek_id", sourceBranchId)
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sourceKpi) {
        // Find existing KPI for target in the same period to replace
        await supabaseAdmin.from("kpi_configs")
          .delete()
          .eq("tenant_apotek_id", targetBranchId)
          .eq("period_month", sourceKpi.period_month)
          .eq("period_year", sourceKpi.period_year);

        const bonusConfigV2 = buildClonedBonusConfigV2(sourceKpi);

        let bonusConfig = sourceKpi.bonus_config || {};
        if (typeof bonusConfig === "object" && "user_configs" in bonusConfig) {
          bonusConfig = { ...bonusConfig, user_configs: {} };
        }

        await supabaseAdmin.from("kpi_configs").insert({
          tenant_apotek_id: targetBranchId,
          period_month: sourceKpi.period_month,
          period_year: sourceKpi.period_year,
          target_omzet: sourceKpi.target_omzet,
          target_atv: sourceKpi.target_atv,
          target_atu: sourceKpi.target_atu,
          bonus_config: bonusConfig,
          bonus_config_v2: bonusConfigV2,
          created_by_user_id: user?.id,
          created_at: now,
          updated_at: now,
        });
      }
    }

    // 4. CLONE PRODUK FOKUS
    if (cloneProdukFokus) {
      await supabaseAdmin.from("product_fokus_configs").delete().eq("tenant_apotek_id", targetBranchId);
      const { data: sourceProduk } = await supabaseAdmin.from("product_fokus_configs").select("*").eq("tenant_apotek_id", sourceBranchId);
      
      if (sourceProduk && sourceProduk.length > 0) {
        const newProduk = sourceProduk.map(p => ({
          tenant_apotek_id: targetBranchId,
          product_id: p.product_id,
          period_month: p.period_month,
          period_year: p.period_year,
          target_type: p.target_type,
          target_value: p.target_value,
          bonus_type: p.bonus_type,
          bonus_value: p.bonus_value,
          bonus_step: p.bonus_step,
          created_at: now
        }));
        await supabaseAdmin.from("product_fokus_configs").insert(newProduk);
      }
    }

    if (user) {
      await logActivity(supabaseAdmin, targetBranchId, user.id, 'addon_settings', targetBranchId, 'UPDATE', null, { action: "CLONED_FROM", sourceBranchId });
    }

    revalidatePath(`/bba/branches/${targetBranchId}`);
    return { success: true, message: "Konfigurasi cabang berhasil diduplikasi!" };

  } catch (err: any) {
    console.error("Clone error:", err);
    return { error: `Terjadi kesalahan saat menyalin data: ${err.message}` };
  }
}

// ─── PAYROLL RUN ────────────────────────────────────────────────────────────

export type PayrollRunItem = {
  userId: string;
  hariMasuk: number;
  baseSalary: number;
  positionAllowance: number;
  mealRate: number;
  mealTotal: number;
  transport: number;
  bpjs: number;
  customAdditions: number;
  customDeductions: number;
  netTotal: number;
};

export async function getPayrollRunDataAction(
  branchId: string,
  month: number,
  year: number,
): Promise<
  | { error: string }
  | {
      isAbsensiEnabled: boolean;
      attendanceCounts: Record<string, number>;
      existingPeriod: { id: string; status: string; submitted_at: string | null } | null;
    }
> {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const supabaseAdmin = createAdminClient();

  const { data: addon } = await supabaseAdmin
    .from("addon_settings")
    .select("is_enabled")
    .eq("tenant_apotek_id", branchId)
    .eq("addon_key", "absensi_shift")
    .maybeSingle();

  const isAbsensiEnabled = addon?.is_enabled ?? false;

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const attendanceCounts: Record<string, number> = {};
  if (isAbsensiEnabled) {
    const { data: logs } = await supabaseAdmin
      .from("attendance_logs")
      .select("user_id")
      .eq("tenant_apotek_id", branchId)
      .gte("clock_in_time", `${startDate}T00:00:00`)
      .lte("clock_in_time", `${endDate}T23:59:59`)
      .not("clock_in_time", "is", null);

    for (const log of logs || []) {
      attendanceCounts[log.user_id] = (attendanceCounts[log.user_id] || 0) + 1;
    }
  }

  const { data: period } = await supabaseAdmin
    .from("payroll_periods")
    .select("id, status, submitted_at")
    .eq("tenant_apotek_id", branchId)
    .eq("period_start", startDate)
    .eq("period_end", endDate)
    .maybeSingle();

  return {
    isAbsensiEnabled,
    attendanceCounts,
    existingPeriod: period ?? null,
  };
}

export async function savePayrollRunAction(
  _prev: { success?: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ success?: boolean; error?: string; message?: string }> {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Tidak terautentikasi." };

  const supabaseAdmin = createAdminClient();

  const branchId = (formData.get("branchId") as string)?.trim();
  const month = Number(formData.get("month"));
  const year = Number(formData.get("year"));
  const itemsJson = formData.get("itemsJson") as string;

  if (!branchId || !month || !year || !itemsJson) return { error: "Data tidak lengkap." };

  let items: PayrollRunItem[];
  try {
    items = JSON.parse(itemsJson);
  } catch {
    return { error: "Data payroll tidak valid." };
  }

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const now = new Date().toISOString();

  const { data: period, error: periodError } = await supabaseAdmin
    .from("payroll_periods")
    .upsert(
      {
        tenant_apotek_id: branchId,
        period_start: startDate,
        period_end: endDate,
        status: "draft",
        submitted_by_user_id: user.id,
        submitted_at: now,
      },
      { onConflict: "tenant_apotek_id,period_start,period_end" },
    )
    .select("id")
    .single();

  if (periodError) return { error: `Gagal membuat periode: ${periodError.message}` };

  for (const item of items) {
    const { error: itemError } = await supabaseAdmin
      .from("payroll_items")
      .upsert(
        {
          payroll_period_id: period.id,
          employee_profile_id: item.userId,
          base_salary: item.baseSalary,
          allowance: item.positionAllowance + item.mealTotal + item.transport + item.customAdditions,
          deduction: item.bpjs + item.customDeductions,
        },
        { onConflict: "payroll_period_id,employee_profile_id" },
      );

    if (itemError) return { error: `Gagal menyimpan data pegawai: ${itemError.message}` };
  }

  revalidatePath(`/bba/branches/${branchId}`);
  return { success: true, message: "Data payroll bulanan berhasil disimpan." };
}
