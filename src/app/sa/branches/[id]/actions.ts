"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth-context";
import { assertBbaAccess, assertBranchScope, bbaCanAccessTenant } from "@/lib/bba-portal-guard";
import { createDefaultKpiV2Config, mergeKpiConfigs } from "@/lib/kpi-v2/utils";
import type { KpiConfigV2 } from "@/lib/types/kpi-v2";
import { getAppUrl } from "@/lib/app-url";
import { validatePayrollConfigInput } from "@/lib/payroll-validation";
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


export async function getAvailableUsersForBranch(tenantId: string) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return [];
  if (!bbaCanAccessTenant(gate.session, tenantId)) return [];

  const supabaseAdmin = createAdminClient();

  const { data: inThisBranch } = await supabaseAdmin
    .from("tenant_memberships")
    .select("user_id")
    .eq("tenant_apotek_id", tenantId);

  const alreadyInBranch = new Set((inThisBranch ?? []).map((m) => m.user_id));

  // Hanya crew aktif yang pernah terdaftar di tenant mana pun —
  // admin apotek adalah shared desk account, tidak di-assign antar cabang via flow ini.
  // Non-global admins: limit search to the target tenant to prevent cross-tenant leakage.
  let crewQuery = supabaseAdmin
    .from("tenant_memberships")
    .select("user_id")
    .eq("is_active", true)
    .eq("role", "crew");
  if (!gate.session?.isGlobalSuperAdmin) {
    crewQuery = crewQuery.eq("tenant_apotek_id", tenantId);
  }
  const { data: crewMemberships } = await crewQuery;

  const eligibleUserIds = [
    ...new Set(
      (crewMemberships ?? [])
        .map((m) => m.user_id)
        .filter((id) => !alreadyInBranch.has(id))
    ),
  ];

  if (eligibleUserIds.length === 0) return [];

  const { data: availableUsers, error } = await supabaseAdmin
    .from("app_users")
    .select("id, full_name, email")
    .eq("is_active", true)
    .in("id", eligibleUserIds)
    .order("full_name", { ascending: true });

  if (error) {
    console.error("Error fetching available users:", error);
    return [];
  }

  return availableUsers || [];
}

export async function assignExistingCrewAction(formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const userId = formData.get("userId") as string;
  const tenantId = formData.get("tenantId") as string;
  const scopeErr = assertBranchScope(gate.session, tenantId, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };

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

  revalidatePath(`/sa/branches/${tenantId}`);
  return { success: true, message: "Crew berhasil ditugaskan ke cabang ini!" };
}

export async function createStaffInvitationAction(prevState: any, formData: FormData) {
  void prevState;
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const tenantId = formData.get("tenantId") as string;
  const scopeErr = assertBranchScope(gate.session, tenantId, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };
  const fullName = formData.get("fullName") as string;
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const role = formData.get("role") as string;

  if (!tenantId || !fullName || !email || !role) {
    return { error: "Data undangan tidak lengkap." };
  }

  if (role !== "crew") {
    return { error: "Undangan staf hanya bisa dibuat untuk crew." };
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

  revalidatePath(`/sa/branches/${tenantId}`);
  return { success: true, message: "Undangan berhasil dibuat.", inviteLink };
}

export async function getPendingStaffInvitationsAction(tenantId: string) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  if (!tenantId) return { error: "Cabang tidak valid." };
  if (!bbaCanAccessTenant(gate.session, tenantId)) return { error: "Anda tidak berwenang atas cabang ini." };

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
  const token = crypto.randomUUID();

  const { data: inv, error: fetchError } = await supabaseAdmin
    .from("staff_invitations")
    .select("id, tenant_apotek_id, status, role")
    .eq("id", invitationId)
    .maybeSingle();

  if (fetchError || !inv) return { error: "Data undangan tidak ditemukan." };
  const scopeErr = assertBranchScope(gate.session, inv.tenant_apotek_id as string, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };
  if (inv.status === "accepted" || inv.status === "cancelled") {
    return { error: "Undangan ini tidak bisa diregenerate lagi." };
  }

  // Admin apotek: 7 hari · Crew: 48 jam
  if (inv.role === "admin_apotek") {
    expiresAt.setDate(expiresAt.getDate() + 7);
  } else {
    expiresAt.setHours(expiresAt.getHours() + 48);
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

  revalidatePath(`/sa/branches/${inv.tenant_apotek_id}`);
  return { success: true, message: "Link undangan berhasil diperbarui.", inviteLink };
}

/**
 * Soft-delete satu undangan staf: tandai 'cancelled' (jejak audit tetap tersimpan).
 * Undangan yang sudah 'accepted' tidak bisa dihapus.
 */
export async function cancelStaffInvitationAction(invitationId: string) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };
  if (!invitationId) return { error: "Undangan tidak valid." };

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: inv, error: fetchError } = await supabaseAdmin
    .from("staff_invitations")
    .select("id, tenant_apotek_id, status, email, role")
    .eq("id", invitationId)
    .maybeSingle();

  if (fetchError || !inv) return { error: "Data undangan tidak ditemukan." };
  const scopeErr = assertBranchScope(gate.session, inv.tenant_apotek_id as string, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };
  if (inv.status === "accepted") return { error: "Undangan sudah diterima — tidak bisa dihapus." };
  if (inv.status === "cancelled") return { success: true, message: "Undangan sudah dihapus." };

  const { error } = await supabaseAdmin
    .from("staff_invitations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", invitationId);

  if (error) return { error: `Gagal menghapus undangan: ${error.message}` };

  if (user) {
    await logActivity(
      supabaseAdmin, inv.tenant_apotek_id, user.id, "staff_invitations", invitationId, "DELETE",
      { email: inv.email, role: inv.role, status: inv.status },
      { status: "cancelled" },
    );
  }

  revalidatePath(`/sa/branches/${inv.tenant_apotek_id}`);
  return { success: true, message: "Undangan dihapus." };
}

/**
 * Bersihkan sekaligus semua undangan yang sudah kedaluwarsa di satu cabang
 * (tandai 'cancelled'). Menandai dulu yang baru lewat tenggat agar tersapu juga.
 */
export async function clearExpiredStaffInvitationsAction(tenantId: string) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };
  if (!tenantId) return { error: "Cabang tidak valid." };
  const scopeErr = assertBranchScope(gate.session, tenantId, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const nowIso = new Date().toISOString();

  // Tandai pending yang sudah lewat tenggat jadi expired dulu.
  await supabaseAdmin
    .from("staff_invitations")
    .update({ status: "expired", updated_at: nowIso })
    .eq("tenant_apotek_id", tenantId)
    .eq("status", "pending")
    .lt("expires_at", nowIso);

  const { data: cleared, error } = await supabaseAdmin
    .from("staff_invitations")
    .update({ status: "cancelled", updated_at: nowIso })
    .eq("tenant_apotek_id", tenantId)
    .eq("status", "expired")
    .select("id");

  if (error) return { error: `Gagal membersihkan undangan: ${error.message}` };

  const count = cleared?.length ?? 0;
  if (user && count > 0) {
    await logActivity(
      supabaseAdmin, tenantId, user.id, "staff_invitations", tenantId, "DELETE",
      null,
      { action: "clear_expired", count },
    );
  }

  revalidatePath(`/sa/branches/${tenantId}`);
  return { success: true, message: count > 0 ? `${count} undangan kedaluwarsa dibersihkan.` : "Tidak ada undangan kedaluwarsa.", count };
}

export async function completeStaffInvitationAction(prevState: any, formData: FormData) {
  void prevState;
  const token = formData.get("token") as string;
  const password = formData.get("password") as string;

  if (!token || !password || password.length < 8) {
    return { error: "Token atau password tidak valid (minimal 8 karakter)." };
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
  const now = new Date().toISOString();

  // --- Step 1: Create (or recover) auth user ---
  let userId: string;
  let isNewAuthUser = false;

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: inv.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: inv.full_name, role: inv.role, branch_desk_admin: isDeskAdmin },
  });

  if (authError) {
    if (!authError.message?.includes("already registered")) {
      return { error: `Gagal membuat akun: ${authError.message}` };
    }

    // Recovery path: a previous attempt created the auth user but failed before completing
    // DB records. Find the existing auth user and re-use them.
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const existingAuthUser = listData?.users?.find(
      (u) => u.email?.toLowerCase() === inv.email.toLowerCase()
    );
    if (!existingAuthUser) {
      return { error: "Akun dengan email ini sudah terdaftar tetapi tidak dapat ditemukan. Hubungi administrator." };
    }
    userId = existingAuthUser.id;

    // Update password so the new one they just typed is set
    const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
    if (pwError) {
      return { error: `Gagal memperbarui akun: ${pwError.message}` };
    }
  } else {
    if (!authData.user?.id) {
      return { error: "Gagal membuat akun: tidak ada ID pengguna." };
    }
    userId = authData.user.id;
    isNewAuthUser = true;
  }

  // --- Step 2: Upsert app_users (idempotent — safe on retry) ---
  const { error: appUserError } = await supabaseAdmin
    .from("app_users")
    .upsert(
      {
        id: userId,
        full_name: inv.full_name,
        email: inv.email,
        is_active: true,
        is_branch_desk_account: isDeskAdmin,
        updated_at: now,
      },
      { onConflict: "id" }
    );

  if (appUserError) {
    // Rollback the freshly-created auth user to leave no orphaned records
    if (isNewAuthUser) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
    }
    return { error: `Gagal menyimpan profil user: ${appUserError.message}` };
  }

  // --- Step 3: Upsert tenant_memberships (idempotent) ---
  // Unique constraint is (tenant_apotek_id, user_id, role) — all three columns.
  const { error: membershipError } = await supabaseAdmin
    .from("tenant_memberships")
    .upsert(
      {
        tenant_apotek_id: inv.tenant_apotek_id,
        user_id: userId,
        role: inv.role,
        is_active: true,
      },
      { onConflict: "tenant_apotek_id,user_id,role" }
    );

  if (membershipError) {
    return { error: `Gagal menyimpan penugasan cabang: ${membershipError.message}` };
  }

  // --- Step 4: Mark invitation as accepted ---
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

export type BranchDeskAdminActionState =
  | undefined
  | { error: string }
  | { success: true; message: string; inviteLink?: string };

export async function createBranchDeskAdminAccountAction(
  _prev: BranchDeskAdminActionState,
  formData: FormData,
): Promise<BranchDeskAdminActionState> {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };
  if (!gate.session) return { error: "Sesi tidak valid." };

  const tenantId = formData.get("tenantId")?.toString()?.trim();
  const email = formData.get("email")?.toString()?.trim().toLowerCase();

  if (!tenantId || !email) {
    return { error: "Email wajib diisi." };
  }
  const scopeErr = assertBranchScope(gate.session, tenantId, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };

  const supabaseAdmin = createAdminClient();

  const { data: branchRow } = await supabaseAdmin
    .from("tenant_apotek")
    .select("name, code")
    .eq("id", tenantId)
    .maybeSingle();
  const branchLabel = (branchRow?.name || branchRow?.code || "Cabang").trim();
  const fullName = `Admin — ${branchLabel}`.slice(0, 120);

  // Cek duplikat di akun aktif
  const { data: existingUser } = await supabaseAdmin
    .from("app_users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingUser) {
    return { error: "Email ini sudah terdaftar sebagai akun aktif." };
  }

  // Cek duplikat undangan yang masih aktif/expired (belum accepted/cancelled)
  const { data: existingInv } = await supabaseAdmin
    .from("staff_invitations")
    .select("id")
    .eq("tenant_apotek_id", tenantId)
    .eq("email", email)
    .in("status", ["pending", "expired"])
    .maybeSingle();
  if (existingInv) {
    return { error: "Undangan untuk email ini sudah ada. Gunakan 'Perbarui Link' di bagian undangan pending." };
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 hari
  const now = new Date().toISOString();

  const { error: invError } = await supabaseAdmin.from("staff_invitations").insert({
    tenant_apotek_id: tenantId,
    email,
    full_name: fullName,
    role: "admin_apotek",
    token,
    status: "pending",
    expires_at: expiresAt.toISOString(),
    invited_by_user_id: gate.session.userId,
    updated_at: now,
  });

  if (invError) {
    if (invError.message?.toLowerCase().includes("unique")) {
      return { error: "Undangan untuk email ini sudah ada." };
    }
    return { error: `Gagal membuat undangan: ${invError.message}` };
  }

  await logActivity(supabaseAdmin, tenantId, gate.session.userId, "staff_invitations", token, "CREATE", null, {
    email,
    role: "admin_apotek",
  });

  const appUrl = getAppUrl();
  const inviteLink = `${appUrl}/accept-staff-invitation/${token}`;

  revalidatePath(`/sa/branches/${tenantId}`);
  return { success: true, message: "Undangan aktivasi admin cabang berhasil dibuat.", inviteLink };
}


export async function saveAddonAction(prevState: any, formData: FormData) {
  void prevState;
  const session = await getSessionContext();
  const activeRole = session?.activeMembership?.role;
  if (activeRole !== "admin_apotek" && activeRole !== "super_admin_bba") {
    return { error: "Hanya akun admin yang dapat mengubah pengaturan add-on." };
  }

  const tenantId = formData.get("tenantId") as string;

  // Prevent cross-tenant privilege escalation: admin_apotek may only modify their own branch
  if (activeRole === "admin_apotek" && session?.activeMembership?.tenantId !== tenantId) {
    return { error: "Akses ditolak. Anda hanya dapat mengubah pengaturan cabang Anda sendiri." };
  }
  // super_admin_bba (mis. analyst) wajib berwenang atas cabang ini; analyst diblokir.
  if (activeRole === "super_admin_bba") {
    const scopeErr = assertBranchScope(session, tenantId, { blockAnalyst: true });
    if (scopeErr) return { error: scopeErr };
  }
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

  revalidatePath(`/sa/branches/${tenantId}`);
  revalidatePath(`/sa/branches`);
  return { success: true, message: "Pengaturan Add-on berhasil diperbarui!" };
}

export async function updateBranchAction(prevState: any, formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const tenantId = formData.get("tenantId") as string;
  const scopeErr = assertBranchScope(gate.session, tenantId, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };
  const name = formData.get("name") as string;
  const code = formData.get("code") as string;
  const status = formData.get("status") as string;
  const address = formData.get("address") as string;
  const phone = formData.get("phone") as string;

  if (!tenantId || !name || !code) return { error: "Nama dan Kode wajib diisi." };
  if (status && !["active", "inactive"].includes(status)) return { error: "Status tidak valid." };

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

  revalidatePath(`/sa/branches/${tenantId}`);
  revalidatePath(`/sa/branches`);
  return { success: true, message: "Profil cabang berhasil diperbarui!" };
}

export async function updateClosingModeAction(prevState: any, formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const tenantId = formData.get("tenantId") as string;
  const scopeErr = assertBranchScope(gate.session, tenantId, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };
  const mode = formData.get("closingMode") as string;

  if (!tenantId) return { error: "Cabang tidak valid." };
  if (!["berjenjang", "admin_full"].includes(mode)) {
    return { error: "Mode closingan tidak valid." };
  }

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: oldBranch } = await supabaseAdmin
    .from("tenant_apotek")
    .select("id, closing_mode")
    .eq("id", tenantId)
    .maybeSingle();

  if (!oldBranch) return { error: "Cabang tidak ditemukan." };
  if (oldBranch.closing_mode === mode) {
    return { success: true, message: "Mode closingan tidak berubah." };
  }

  // Guard: pindah ke Admin Penuh sementara masih ada closingan menunggu verifikasi.
  // Menu Verifikasi akan tersembunyi di mode admin_full, jadi baris ini bisa menggantung.
  if (mode === "admin_full") {
    const { count } = await supabaseAdmin
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", tenantId)
      .in("status", ["submitted", "edited_by_admin"]);
    if ((count ?? 0) > 0) {
      return {
        error: `Masih ada ${count} closingan menunggu verifikasi. Selesaikan dulu di menu Verifikasi (portal Admin) sebelum mengubah mode.`,
      };
    }
  }

  const { error } = await supabaseAdmin
    .from("tenant_apotek")
    .update({ closing_mode: mode, updated_at: new Date().toISOString() })
    .eq("id", tenantId);

  if (error) return { error: `Gagal mengubah mode closingan: ${error.message}` };

  if (user) {
    await logActivity(
      supabaseAdmin, tenantId, user.id, "tenant_apotek", tenantId, "UPDATE",
      { closing_mode: oldBranch.closing_mode },
      { closing_mode: mode },
    );
  }

  revalidatePath(`/sa/branches/${tenantId}`);
  revalidatePath(`/sa/branches`);
  return {
    success: true,
    message: mode === "admin_full"
      ? "Mode diubah: Admin Penuh. Admin kini mencatat closingan atas nama crew."
      : "Mode diubah: Berjenjang. Crew mencatat, admin memverifikasi.",
  };
}

export async function transferBranchOwnershipAction(prevState: any, formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const tenantId = formData.get("tenantId") as string;
  const scopeErr = assertBranchScope(gate.session, tenantId, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };
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

  // 2. Nonaktifkan owner lama di branch ini (soft deactivate, bukan delete agar bisa di-audit/revert).
  const { error: cleanupError } = await supabaseAdmin
    .from("tenant_memberships")
    .update({ is_active: false })
    .eq("tenant_apotek_id", tenantId)
    .eq("role", "owner")
    .neq("user_id", newOwnerId);

  if (cleanupError) {
    return { error: `Owner baru sudah diset, tetapi gagal menonaktifkan owner lama: ${cleanupError.message}` };
  }

  revalidatePath(`/sa/branches/${tenantId}`);
  revalidatePath(`/sa/branches`);
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

  // Ambil user_id + tenant dari membership agar bisa ban/unban di level Auth + cek scope
  const { data: membership } = await supabaseAdmin
    .from("tenant_memberships")
    .select("user_id, tenant_apotek_id")
    .eq("id", membershipId)
    .maybeSingle();

  if (!membership) return { error: "Data membership tidak ditemukan." };

  const scopeErr = assertBranchScope(gate.session, membership.tenant_apotek_id as string, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };

  // Blokir / buka di level Auth
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(membership.user_id, {
    ban_duration: newStatus ? "none" : "876000h",
  });

  if (authError) {
    return { error: `Gagal mengubah status auth: ${authError.message}` };
  }

  // Update membership
  const { error } = await supabaseAdmin
    .from("tenant_memberships")
    .update({ is_active: newStatus })
    .eq("id", membershipId);

  if (error) {
    return { error: `Gagal mengubah status pegawai: ${error.message}` };
  }

  revalidatePath(`/sa/branches/${branchId}`);
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
  // Role dikunci ke "crew" — tidak diterima dari client untuk mencegah privilege escalation.
  const role = "crew" as const;

  if (!membershipId || !userId || !fullName || !email) {
    return { error: "Semua data profil wajib diisi." };
  }
  const scopeErr = assertBranchScope(gate.session, branchId, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };

  const supabaseAdmin = createAdminClient();

  // Pastikan membership ini benar milik cabang tsb DAN cocok dengan userId — cegah
  // edit profil/email akun user lain (lintas-cabang) lewat membershipId/userId sembarang.
  const { data: targetMembership } = await supabaseAdmin
    .from("tenant_memberships")
    .select("user_id, tenant_apotek_id")
    .eq("id", membershipId)
    .maybeSingle();
  if (
    !targetMembership ||
    targetMembership.tenant_apotek_id !== branchId ||
    targetMembership.user_id !== userId
  ) {
    return { error: "Data pegawai tidak cocok dengan cabang ini." };
  }

  // 1. Update auth user (email + metadata) — dikerjakan dulu agar
  //    jika email sudah dipakai akun lain, app_users tidak terlanjur berubah.
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email,
    user_metadata: { full_name: fullName, role },
  });
  if (authError) {
    if (authError.message.includes("already registered")) {
      return { error: "Email ini sudah digunakan oleh akun lain." };
    }
    return { error: `Gagal memperbarui autentikasi: ${authError.message}` };
  }

  // 2. Update app_users — hanya setelah Auth berhasil
  const { error: appUserError } = await supabaseAdmin
    .from("app_users")
    .update({
      full_name: fullName,
      email: email,
      updated_at: new Date().toISOString()
    })
    .eq("id", userId);

  if (appUserError) return { error: `Gagal memperbarui profil: ${appUserError.message}` };

  // 3. Update tenant_memberships role
  const { error: membershipError } = await supabaseAdmin
    .from("tenant_memberships")
    .update({ role: role })
    .eq("id", membershipId);

  if (membershipError) return { error: `Gagal memperbarui role: ${membershipError.message}` };

  revalidatePath(`/sa/branches/${branchId}`);
  return { success: true, message: "Data pegawai berhasil diperbarui!" };
}

export async function saveShiftAction(prevState: any, formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const tenantId = formData.get("tenantId") as string;
  const scopeErr = assertBranchScope(gate.session, tenantId, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };
  const shiftId = formData.get("shiftId") as string;
  const shiftName = ((formData.get("shiftName") as string) || "").trim();
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;

  if (!tenantId || !shiftName || !startTime || !endTime) {
    return { error: "Semua data shift wajib diisi." };
  }

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const now = new Date().toISOString();

  // Nama shift wajib unik per apotek (case-insensitive) — cegah closingan ambigu.
  const normalized = shiftName.toLowerCase();
  const { data: siblingShifts } = await supabaseAdmin
    .from("master_shifts")
    .select("id, shift_name")
    .eq("tenant_apotek_id", tenantId);
  const duplicate = (siblingShifts ?? []).some(
    (s) => s.id !== shiftId && String(s.shift_name ?? "").trim().toLowerCase() === normalized,
  );
  if (duplicate) {
    return { error: `Sudah ada shift bernama "${shiftName}" di apotek ini. Pakai nama lain.` };
  }

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
    // Cegah ubah/curi shift milik cabang lain via shiftId sembarang.
    if (!oldShift || oldShift.tenant_apotek_id !== tenantId) {
      return { error: "Shift tidak ditemukan di cabang ini." };
    }

    const { error: updateError } = await supabaseAdmin
      .from("master_shifts")
      .update(payload)
      .eq("id", shiftId)
      .eq("tenant_apotek_id", tenantId);
    error = updateError;
  } else {
    const { error: insertError } = await supabaseAdmin
      .from("master_shifts")
      .insert({ ...payload, created_at: now });
    error = insertError;
  }

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { error: `Sudah ada shift bernama "${shiftName}" di apotek ini. Pakai nama lain.` };
    }
    return { error: `Gagal menyimpan shift: ${error.message}` };
  }

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

  revalidatePath(`/sa/branches/${tenantId}`);
  return { success: true, message: "Data shift berhasil disimpan!" };
}

export async function deleteShiftAction(formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const shiftId = formData.get("shiftId") as string;
  const tenantId = formData.get("tenantId") as string;
  const scopeErr = assertBranchScope(gate.session, tenantId, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };

  if (!shiftId) return { error: "ID Shift tidak ditemukan." };

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Verifikasi shift milik cabang ini sebelum cek pemakaian/hapus — cegah hapus shift lintas-cabang.
  const { data: shiftRow } = await supabaseAdmin
    .from("master_shifts")
    .select("id, tenant_apotek_id")
    .eq("id", shiftId)
    .maybeSingle();
  if (!shiftRow || shiftRow.tenant_apotek_id !== tenantId) {
    return { error: "Shift tidak ditemukan di cabang ini." };
  }

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
    .eq("id", shiftId)
    .eq("tenant_apotek_id", tenantId);

  if (error) return { error: `Gagal menghapus shift: ${error.message}` };

  if (user) {
    await logActivity(supabaseAdmin, tenantId, user.id, "master_shifts", shiftId, "DELETE", oldShift, null);
  }

  revalidatePath(`/sa/branches/${tenantId}`);
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

  // Prevent cross-tenant privilege escalation: admin_apotek may only modify their own branch
  if (activeRole === "admin_apotek" && session?.activeMembership?.tenantId !== tenantId) {
    return { error: "Akses ditolak. Anda hanya dapat mengubah konfigurasi cabang Anda sendiri." };
  }
  // super_admin_bba (mis. analyst) wajib berwenang atas cabang ini; analyst diblokir.
  if (activeRole === "super_admin_bba") {
    const scopeErr = assertBranchScope(session, tenantId, { blockAnalyst: true });
    if (scopeErr) return { error: scopeErr };
  }

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

  revalidatePath(`/sa/branches/${tenantId}`);
  return { success: true, message: "Konfigurasi berhasil disimpan!" };
}

// ── Produk Fokus: helper skema bersama (satu-logika-satu-tempat) ──────────────
type ProductFokusScheme = {
  hasMinTarget: boolean;
  targetValue: number;
  bonusType: "flat" | "kelipatan";
  bonusValue: number;
  bonusStep: number | null;
  countBase: "excess" | "full";
};

function readProductFokusScheme(formData: FormData): { error: string } | { scheme: ProductFokusScheme } {
  const bonusType = formData.get("bonusType") as string; // 'flat' | 'kelipatan'
  const bonusValue = parseFloat(formData.get("bonusValue") as string);
  const bonusStep = formData.get("bonusStep") ? parseFloat(formData.get("bonusStep") as string) : null;
  const hasMinTarget = formData.get("hasMinTarget") !== "false"; // default true
  const targetValueRaw = parseFloat(formData.get("targetValue") as string);
  const countBaseRaw = (formData.get("countBase") as string) || "excess";
  const countBase = bonusType === "kelipatan" && hasMinTarget && countBaseRaw === "full" ? "full" : "excess";

  if (!["flat", "kelipatan"].includes(bonusType)) return { error: "Mode bonus tidak valid." };
  if (isNaN(bonusValue) || bonusValue <= 0) return { error: "Nominal bonus harus lebih dari 0." };
  if (hasMinTarget && (isNaN(targetValueRaw) || targetValueRaw <= 0)) {
    return { error: "Nilai target wajib diisi (lebih dari 0) untuk skema dengan target minimal." };
  }
  if (bonusType === "kelipatan" && (!bonusStep || bonusStep <= 0)) {
    return { error: "Kelipatan bonus wajib diisi dan harus lebih dari 0." };
  }
  return {
    scheme: {
      hasMinTarget,
      targetValue: hasMinTarget ? targetValueRaw : 0,
      bonusType: bonusType as "flat" | "kelipatan",
      bonusValue,
      bonusStep: bonusType === "kelipatan" ? bonusStep : null,
      countBase,
    },
  };
}

function buildProductFokusRow(
  scheme: ProductFokusScheme,
  tenantId: string,
  productId: string,
  periodMonth: number,
  periodYear: number,
) {
  return {
    tenant_apotek_id: tenantId,
    product_id: productId,
    period_month: periodMonth,
    period_year: periodYear,
    target_type: "item", // target selalu dalam unit; jalur 'nominal' dihapus
    target_value: scheme.targetValue,
    bonus_type: scheme.bonusType,
    bonus_value: scheme.bonusValue,
    bonus_step: scheme.bonusType === "kelipatan" ? scheme.bonusStep : null,
    has_min_target: scheme.hasMinTarget,
    count_base: scheme.countBase,
  };
}

export async function saveProductFokusAction(prevState: any, formData: FormData) {
  void prevState;
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const tenantId = formData.get("tenantId") as string;
  const scopeErr = assertBranchScope(gate.session, tenantId, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };
  const productId = formData.get("productId") as string;
  const periodMonth = parseInt(formData.get("periodMonth") as string, 10);
  const periodYear = parseInt(formData.get("periodYear") as string, 10);

  if (!tenantId || !productId) return { error: "Produk & cabang wajib diisi." };
  if (!Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12) return { error: "Periode bulan tidak valid." };
  if (!Number.isInteger(periodYear) || periodYear < 2000) return { error: "Periode tahun tidak valid." };

  const parsed = readProductFokusScheme(formData);
  if ("error" in parsed) return { error: parsed.error };

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

  const payload = buildProductFokusRow(parsed.scheme, tenantId, productId, periodMonth, periodYear);

  const { error } = await supabaseAdmin
    .from("product_fokus_configs")
    .upsert(payload, { onConflict: "tenant_apotek_id,product_id,period_month,period_year" });

  if (error) return { error: `Gagal menyimpan produk fokus: ${error.message}` };

  if (user) {
    await logActivity(
      supabaseAdmin, tenantId, user.id, "product_fokus_configs",
      `${productId}:${periodMonth}:${periodYear}`,
      oldConfig ? "UPDATE" : "CREATE", oldConfig, payload,
    );
  }

  revalidatePath(`/sa/branches/${tenantId}`);
  return { success: true, message: oldConfig ? "Produk fokus diperbarui." : "Produk fokus ditambahkan." };
}

/** Terapkan SATU skema ke beberapa produk sekaligus (mode Tambah massal). */
export async function saveProductFokusBatchAction(prevState: any, formData: FormData) {
  void prevState;
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const tenantId = formData.get("tenantId") as string;
  const scopeErr = assertBranchScope(gate.session, tenantId, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };
  const periodMonth = parseInt(formData.get("periodMonth") as string, 10);
  const periodYear = parseInt(formData.get("periodYear") as string, 10);
  const productIds = Array.from(
    new Set(
      (formData.get("productIds") as string || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );

  if (!tenantId) return { error: "Cabang tidak valid." };
  if (productIds.length === 0) return { error: "Pilih minimal satu produk." };
  if (!Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12) return { error: "Periode bulan tidak valid." };
  if (!Number.isInteger(periodYear) || periodYear < 2000) return { error: "Periode tahun tidak valid." };

  const parsed = readProductFokusScheme(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const rows = productIds.map((pid) => buildProductFokusRow(parsed.scheme, tenantId, pid, periodMonth, periodYear));

  const { error } = await supabaseAdmin
    .from("product_fokus_configs")
    .upsert(rows, { onConflict: "tenant_apotek_id,product_id,period_month,period_year" });

  if (error) return { error: `Gagal menyimpan produk fokus: ${error.message}` };

  if (user) {
    await logActivity(
      supabaseAdmin, tenantId, user.id, "product_fokus_configs",
      `batch:${periodMonth}:${periodYear}`, "CREATE", null,
      { count: rows.length, productIds, scheme: parsed.scheme },
    );
  }

  revalidatePath(`/sa/branches/${tenantId}`);
  return { success: true, message: `${rows.length} produk fokus disimpan.`, count: rows.length };
}

/** Salin konfigurasi produk fokus bulan SEBELUMNYA ke periode ini (lewati yang sudah ada). */
export async function copyPreviousProductFokusAction(tenantId: string, month: number, year: number) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };
  if (!tenantId) return { error: "Cabang tidak valid." };
  const scopeErr = assertBranchScope(gate.session, tenantId, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };
  if (!Number.isInteger(month) || month < 1 || month > 12) return { error: "Periode tidak valid." };

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: prevConfigs }, { data: currentConfigs }] = await Promise.all([
    supabaseAdmin
      .from("product_fokus_configs")
      .select("*")
      .eq("tenant_apotek_id", tenantId)
      .eq("period_month", prevMonth)
      .eq("period_year", prevYear),
    supabaseAdmin
      .from("product_fokus_configs")
      .select("product_id")
      .eq("tenant_apotek_id", tenantId)
      .eq("period_month", month)
      .eq("period_year", year),
  ]);

  if (!prevConfigs || prevConfigs.length === 0) {
    return { error: "Tidak ada produk fokus di bulan sebelumnya untuk disalin." };
  }

  const existingIds = new Set((currentConfigs ?? []).map((c) => c.product_id as string));
  const toCopy = prevConfigs.filter((c) => !existingIds.has(c.product_id));
  const skipped = prevConfigs.length - toCopy.length;

  if (toCopy.length === 0) {
    return { success: true, copied: 0, skipped, message: `Semua ${skipped} produk sudah ada bulan ini — tak ada yang disalin.` };
  }

  const rows = toCopy.map((c) => ({
    tenant_apotek_id: tenantId,
    product_id: c.product_id,
    period_month: month,
    period_year: year,
    target_type: c.target_type ?? "item",
    target_value: c.target_value ?? 0,
    bonus_type: c.bonus_type,
    bonus_value: c.bonus_value,
    bonus_step: c.bonus_step ?? null,
    has_min_target: c.has_min_target ?? true,
    count_base: c.count_base ?? "excess",
  }));

  const { error } = await supabaseAdmin.from("product_fokus_configs").insert(rows);
  if (error) return { error: `Gagal menyalin: ${error.message}` };

  if (user) {
    await logActivity(
      supabaseAdmin, tenantId, user.id, "product_fokus_configs",
      `copy:${month}:${year}`, "CREATE", null,
      { copiedFrom: `${prevMonth}/${prevYear}`, copied: rows.length, skipped },
    );
  }

  revalidatePath(`/sa/branches/${tenantId}`);
  return {
    success: true,
    copied: rows.length,
    skipped,
    message: `${rows.length} produk disalin dari ${prevMonth}/${prevYear}${skipped > 0 ? `, ${skipped} dilewati (sudah ada)` : ""}.`,
  };
}

export async function deleteProductFokusAction(formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const configId = formData.get("configId") as string;
  const tenantId = formData.get("tenantId") as string;
  const scopeErr = assertBranchScope(gate.session, tenantId, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };

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

  revalidatePath(`/sa/branches/${tenantId}`);
  return { success: true, message: "Produk fokus dihapus." };
}

/**
 * Resolusi akses TULIS jadwal/roster (delegasi shift ke owner/admin).
 * - Super-admin global / super_admin_bba: akses penuh ke tenant mana pun (paritas assertBbaAccess).
 * - Admin/Owner apotek: hanya bila addon `absensi_shift` aktif DAN flag delegasi
 *   (allow_admin_schedule / allow_owner_schedule) menyala untuk peran mereka di tenant tsb.
 * Master Shift TIDAK memakai ini (tetap SA-only via assertBbaAccess) — jaga integritas closing.
 */
async function resolveScheduleWriteAccess(
  tenantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesi habis, silakan login kembali." };

  if (session.isGlobalSuperAdmin) return { ok: true };
  // super_admin_bba non-global: wajib berwenang atas cabang ini, dan bukan analyst (jadwal = tulis).
  if (session.activeMembership?.role === "super_admin_bba") {
    if (session.bbaPortalStaffRole === "analyst") {
      return { ok: false, error: "Analyst tidak dapat mengatur jadwal." };
    }
    if (!bbaCanAccessTenant(session, tenantId)) {
      return { ok: false, error: "Anda tidak berwenang atas cabang ini." };
    }
    return { ok: true };
  }

  if (!tenantId) return { ok: false, error: "Akses ditolak." };
  const memberships = session.memberships ?? [];
  const isAdmin = memberships.some((m) => m.tenantId === tenantId && m.role === "admin_apotek");
  const isOwner = memberships.some((m) => m.tenantId === tenantId && m.role === "owner");
  if (!isAdmin && !isOwner) return { ok: false, error: "Akses ditolak." };

  const supabaseAdmin = createAdminClient();
  const { data } = await supabaseAdmin
    .from("addon_settings")
    .select("is_enabled, settings")
    .eq("tenant_apotek_id", tenantId)
    .eq("addon_key", "absensi_shift")
    .maybeSingle();
  if (!data?.is_enabled) {
    return { ok: false, error: "Fitur jadwal belum diaktifkan oleh Apotrik untuk apotek ini." };
  }
  const settings = (data.settings as Record<string, unknown>) ?? {};
  const allowed =
    (isAdmin && Boolean(settings.allow_admin_schedule)) ||
    (isOwner && Boolean(settings.allow_owner_schedule));
  if (!allowed) {
    return { ok: false, error: "Anda belum diberi izin mengatur jadwal untuk apotek ini." };
  }
  return { ok: true };
}

/** Revalidate semua halaman yang menampilkan jadwal: portal SA + admin/owner terdelegasi. */
function revalidateSchedulePaths(tenantId: string) {
  revalidatePath(`/sa/branches/${tenantId}`);
  revalidatePath(`/admin/absensi`);
  revalidatePath(`/owner/jadwal`);
}

export async function saveRosterAction(formData: FormData) {
  const tenantId = formData.get("tenantId") as string;
  const access = await resolveScheduleWriteAccess(tenantId);
  if (!access.ok) return { error: access.error };
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

  // "Kosong" (shiftId === "") = tidak dijadwalkan → HAPUS baris. Menyimpan baris
  // shift_id null malah dianggap "terjadwal kerja" oleh resolver kehadiran →
  // hari lampau tanpa absen keliru dihitung ALPHA, dan crew muncul di kalender
  // tanpa shift. OFF tetap baris nyata (is_off=true) agar tercatat sebagai libur.
  if (shiftId === "") {
    if (oldRoster) {
      const { error } = await supabaseAdmin
        .from("shift_schedules")
        .delete()
        .eq("tenant_apotek_id", tenantId)
        .eq("user_id", userId)
        .eq("schedule_date", date);
      if (error) return { error: `Gagal mengosongkan roster: ${error.message}` };
      if (user) {
        await logActivity(
          supabaseAdmin, tenantId, user.id, "shift_schedules",
          `${userId}:${date}`, "DELETE", oldRoster, null,
        );
      }
    }
    revalidateSchedulePaths(tenantId);
    return { success: true };
  }

  const payload = {
    tenant_apotek_id: tenantId,
    user_id: userId,
    schedule_date: date,
    shift_id: shiftId === "OFF" ? null : shiftId,
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

  revalidateSchedulePaths(tenantId);
  return { success: true };
}

export async function copyRosterAction(formData: FormData) {
  const tenantId = formData.get("tenantId") as string;
  const access = await resolveScheduleWriteAccess(tenantId);
  if (!access.ok) return { error: access.error };
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

  // 2. Pemetaan ALIGN-BY-HARI: Senin ke-N bulan lalu → Senin ke-N bulan ini
  //    (bukan tgl→tgl) supaya pola libur/weekend tidak bergeser antar-bulan.
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const prevDays = new Date(prevYear, prevMonth, 0).getDate();
  const targetDays = new Date(year, month, 0).getDate();

  // prev: tanggal → (weekday, occurrence ke-berapa weekday itu dalam bulan)
  const prevMeta = new Map<string, { w: number; occ: number }>();
  const prevCounter: Record<number, number> = {};
  for (let d = 1; d <= prevDays; d++) {
    const w = new Date(prevYear, prevMonth - 1, d).getDay();
    prevCounter[w] = (prevCounter[w] ?? 0) + 1;
    prevMeta.set(`${prevYear}-${pad2(prevMonth)}-${pad2(d)}`, { w, occ: prevCounter[w] });
  }
  // target: (weekday, occurrence) → tanggal
  const targetByWOcc = new Map<string, string>();
  const tCounter: Record<number, number> = {};
  for (let d = 1; d <= targetDays; d++) {
    const w = new Date(year, month - 1, d).getDay();
    tCounter[w] = (tCounter[w] ?? 0) + 1;
    targetByWOcc.set(`${w}|${tCounter[w]}`, `${year}-${pad2(month)}-${pad2(d)}`);
  }

  const newRoster = prevRoster.map((r) => {
    const meta = prevMeta.get(String(r.schedule_date).slice(0, 10));
    if (!meta) return null;
    const targetDate = targetByWOcc.get(`${meta.w}|${meta.occ}`);
    if (!targetDate) return null; // occurrence itu tak ada di bulan target (mis. Jumat ke-5)
    return {
      tenant_apotek_id: tenantId,
      user_id: r.user_id,
      schedule_date: targetDate,
      shift_id: r.shift_id,
      is_off: r.is_off,
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

  revalidateSchedulePaths(tenantId);
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

  // Verify actor has access to this specific branch (non-global admins are branch-scoped).
  if (!gate.session?.isGlobalSuperAdmin) {
    const hasBranchAccess = (gate.session?.memberships ?? []).some(
      (m) => m.tenantId === branchId && m.role === "super_admin_bba",
    );
    if (!hasBranchAccess) return { error: "Akses ditolak untuk cabang ini." };
  }

  let entries: { userId: string; date: string; shiftId: string }[];
  try {
    entries = JSON.parse(entriesJson);
    if (!Array.isArray(entries)) throw new Error("bukan array");
  } catch {
    return { error: "Format data jadwal tidak valid." };
  }

  const supabase = createAdminClient();
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  // Upsert new entries first — if this fails, existing schedules remain intact.
  if (entries.length > 0) {
    const rows = entries.map((e) => ({
      tenant_apotek_id: branchId,
      user_id: e.userId,
      schedule_date: e.date,
      shift_id: e.shiftId,
      is_off: false,
    }));
    const { error: upsertError } = await supabase
      .from("shift_schedules")
      .upsert(rows, { onConflict: "tenant_apotek_id,user_id,schedule_date" });
    if (upsertError) return { error: `Gagal menyimpan jadwal: ${upsertError.message}` };
  }

  // After a successful upsert, remove stale entries for this month that are not in the new set.
  const keepSet = new Set(entries.map((e) => `${e.userId}::${e.date}`));
  const { data: existing } = await supabase
    .from("shift_schedules")
    .select("id, user_id, schedule_date")
    .eq("tenant_apotek_id", branchId)
    .gte("schedule_date", firstDay)
    .lte("schedule_date", lastDay);
  const staleIds = (existing ?? [])
    .filter((r) => !keepSet.has(`${r.user_id}::${r.schedule_date}`))
    .map((r) => r.id);
  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase.from("shift_schedules").delete().in("id", staleIds);
    if (deleteError) return { error: `Gagal menghapus jadwal lama: ${deleteError.message}` };
  }

  revalidatePath(`/sa/branches/${branchId}`);
  return { success: true, message: `${entries.length} jadwal shift berhasil diterapkan.` };
}

export async function savePayrollConfigAction(prevState: any, formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  if (gate.session?.bbaPortalStaffRole === "analyst") {
    return { error: "Akses ditolak. Analyst tidak dapat mengubah konfigurasi payroll." };
  }

  const tenantId = formData.get("tenantId") as string;
  const scopeErr = assertBranchScope(gate.session, tenantId, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };
  const userId = formData.get("userId") as string;
  const baseSalary = parseFloat(formData.get("baseSalary") as string) || 0;
  const positionAllowance = parseFloat(formData.get("positionAllowance") as string) || 0;
  const mealAllowance = parseFloat(formData.get("mealAllowance") as string) || 0;
  const transportAllowance = parseFloat(formData.get("transportAllowance") as string) || 0;
  const bpjsDeduction = parseFloat(formData.get("bpjsDeduction") as string) || 0;
  const customAdjustmentsStr = formData.get("customAdjustments") as string;
  let customAdjustments: unknown[] = [];
  if (customAdjustmentsStr) {
    try {
      customAdjustments = JSON.parse(customAdjustmentsStr);
    } catch {
      return { error: "Format custom adjustments tidak valid." };
    }
  }

  if (!tenantId || !userId) return { error: "Data tidak valid." };

  // Validasi server-side (satu sumber, dipakai SA + admin + owner) — jangan percaya input.
  const validationError = validatePayrollConfigInput({
    baseSalary, positionAllowance, mealAllowance, transportAllowance, bpjsDeduction, customAdjustments,
  });
  if (validationError) return { error: validationError };

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
    .upsert(payload, { onConflict: 'user_id,tenant_apotek_id' });

  if (error) return { error: `Gagal menyimpan konfigurasi payroll: ${error.message}` };

  if (user) {
    await logActivity(supabase, tenantId, user.id, 'payroll_configs', userId, oldConfig ? 'UPDATE' : 'CREATE', oldConfig, payload);
  }

  revalidatePath(`/sa/branches/${tenantId}`);
  return { success: true, message: "Konfigurasi gaji pegawai berhasil disimpan!" };
}

/**
 * Update payroll addon settings — controls whether admin_apotek and/or owner
 * can view and edit payroll configs for their branch.
 */
export async function updatePayrollAddonSettingsAction(prevState: any, formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };
  if (gate.session?.bbaPortalStaffRole === "analyst") {
    return { error: "Akses ditolak. Analyst tidak dapat mengubah pengaturan payroll." };
  }

  const tenantId = formData.get("tenantId") as string;
  if (!tenantId) return { error: "Data tidak valid." };
  const scopeErr = assertBranchScope(gate.session, tenantId, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };

  const allowAdminInput = formData.get("allow_admin_input") === "true";
  const allowOwnerInput = formData.get("allow_owner_input") === "true";

  const supabase = createAdminClient();

  // Fetch existing row by natural key — avoids relying on a DB unique constraint for upsert
  const { data: existing } = await supabase
    .from("addon_settings")
    .select("id, settings")
    .eq("tenant_apotek_id", tenantId)
    .eq("addon_key", "payroll")
    .maybeSingle();

  const currentSettings = ((existing?.settings as Record<string, unknown>) ?? {});
  const newSettings = { ...currentSettings, allow_admin_input: allowAdminInput, allow_owner_input: allowOwnerInput };

  let dbError;
  if (existing?.id) {
    // Row exists — update by primary key (safest path)
    const { error } = await supabase
      .from("addon_settings")
      .update({ settings: newSettings })
      .eq("id", existing.id);
    dbError = error;
  } else {
    // Row doesn't exist yet — insert with is_enabled: false so NOT NULL is satisfied
    const { error } = await supabase
      .from("addon_settings")
      .insert({
        tenant_apotek_id: tenantId,
        addon_key: "payroll",
        is_enabled: false,
        settings: newSettings,
      });
    dbError = error;
  }

  if (dbError) {
    console.error("updatePayrollAddonSettingsAction:", dbError);
    return { error: "Gagal menyimpan pengaturan akses payroll." };
  }

  revalidatePath(`/sa/branches/${tenantId}`);
  revalidatePath(`/admin/konfigurasi-gaji`);
  revalidatePath(`/owner/karyawan`);
  return { success: true, message: "Pengaturan akses payroll berhasil disimpan." };
}

/**
 * Toggle delegasi pengelolaan JADWAL (roster + pola mingguan) ke admin/owner apotek.
 * Flag disimpan di addon_settings `absensi_shift` (allow_admin_schedule / allow_owner_schedule).
 * Master Shift TIDAK termasuk (tetap SA-only). Dibaca oleh resolveScheduleWriteAccess().
 */
export async function updateScheduleAddonSettingsAction(prevState: any, formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };
  if (gate.session?.bbaPortalStaffRole === "analyst") {
    return { error: "Akses ditolak. Analyst tidak dapat mengubah pengaturan jadwal." };
  }

  const tenantId = formData.get("tenantId") as string;
  if (!tenantId) return { error: "Data tidak valid." };
  const scopeErr = assertBranchScope(gate.session, tenantId, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };

  const allowAdminSchedule = formData.get("allow_admin_schedule") === "true";
  const allowOwnerSchedule = formData.get("allow_owner_schedule") === "true";

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("addon_settings")
    .select("id, settings")
    .eq("tenant_apotek_id", tenantId)
    .eq("addon_key", "absensi_shift")
    .maybeSingle();

  const currentSettings = (existing?.settings as Record<string, unknown>) ?? {};
  const newSettings = {
    ...currentSettings,
    allow_admin_schedule: allowAdminSchedule,
    allow_owner_schedule: allowOwnerSchedule,
  };

  let dbError;
  if (existing?.id) {
    const { error } = await supabase
      .from("addon_settings")
      .update({ settings: newSettings })
      .eq("id", existing.id);
    dbError = error;
  } else {
    const { error } = await supabase.from("addon_settings").insert({
      tenant_apotek_id: tenantId,
      addon_key: "absensi_shift",
      is_enabled: false,
      settings: newSettings,
    });
    dbError = error;
  }

  if (dbError) {
    console.error("updateScheduleAddonSettingsAction:", dbError);
    return { error: "Gagal menyimpan pengaturan akses jadwal." };
  }

  revalidatePath(`/sa/branches/${tenantId}`);
  return { success: true, message: "Pengaturan akses jadwal berhasil disimpan." };
}

export async function createStaffPasswordResetLinkAction(formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const userId = formData.get("userId") as string;
  const tenantId = formData.get("tenantId") as string;
  if (!userId || !tenantId) return { error: "Data user/cabang tidak valid." };
  const scopeErr = assertBranchScope(gate.session, tenantId, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };

  const supabaseAdmin = createAdminClient();
  // Pastikan userId benar-benar anggota tenant ini — cegah cetak link reset lintas-cabang
  // (mis. reset akun cabang lain dengan userId sembarang).
  const { data: targetMembership } = await supabaseAdmin
    .from("tenant_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("tenant_apotek_id", tenantId)
    .maybeSingle();
  if (!targetMembership) return { error: "User bukan anggota cabang ini." };

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

  if (!token || !password || password.length < 8) {
    return { error: "Token atau password tidak valid (minimal 8 karakter)." };
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
  const scoped = gate.session?.isGlobalSuperAdmin
    ? (data ?? [])
    : (data ?? []).filter((b) => bbaCanAccessTenant(gate.session, b.id));
  return { success: true, data: scoped };
}

export async function cloneBranchConfigAction(prevState: any, formData: FormData) {
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const targetBranchId = formData.get("targetBranchId") as string;
  const sourceBranchId = formData.get("sourceBranchId") as string;
  const scopeErr = assertBranchScope(gate.session, targetBranchId, { blockAnalyst: true });
  if (scopeErr) return { error: scopeErr };
  if (!bbaCanAccessTenant(gate.session, sourceBranchId)) {
    return { error: "Anda tidak berwenang atas cabang sumber." };
  }
  
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
    // Cek error tiap operasi supabase — jangan lanjut/lapor sukses kalau ada yang gagal.
    const must = <R extends { error: { message?: string } | null }>(res: R, ctx: string): R => {
      if (res.error) throw new Error(`${ctx}: ${res.error.message ?? "gagal"}`);
      return res;
    };

    // 1. CLONE MASTER SHIFTS — baca sumber DULU, baru hapus target, lalu salin.
    if (cloneShifts) {
      const { data: sourceShifts } = must(
        await supabaseAdmin.from("master_shifts").select("*").eq("tenant_apotek_id", sourceBranchId),
        "baca shift sumber",
      );
      must(
        await supabaseAdmin.from("master_shifts").delete().eq("tenant_apotek_id", targetBranchId),
        "hapus shift lama",
      );
      if (sourceShifts && sourceShifts.length > 0) {
        const newShifts = sourceShifts.map((s) => ({
          tenant_apotek_id: targetBranchId,
          shift_name: s.shift_name,
          start_time: s.start_time,
          end_time: s.end_time,
          created_at: now,
          updated_at: now,
        }));
        must(await supabaseAdmin.from("master_shifts").insert(newShifts), "salin shift");
      }
    }

    // 2. CLONE ADDON SETTINGS
    if (cloneAddons) {
      const { data: sourceAddons } = must(
        await supabaseAdmin.from("addon_settings").select("*").eq("tenant_apotek_id", sourceBranchId),
        "baca add-on sumber",
      );
      must(
        await supabaseAdmin.from("addon_settings").delete().eq("tenant_apotek_id", targetBranchId),
        "hapus add-on lama",
      );
      if (sourceAddons && sourceAddons.length > 0) {
        const newAddons = sourceAddons.map((a) => {
          // Remove pic_user_ids from review addons if they exist, because users are different
          let settings = a.settings;
          if (settings && typeof settings === "object") {
            if ("pic_user_ids" in settings) {
              settings = { ...settings, pic_user_ids: [] };
            }
          }
          return {
            tenant_apotek_id: targetBranchId,
            addon_key: a.addon_key,
            is_enabled: a.is_enabled,
            settings: settings,
            updated_by_user_id: user?.id,
            updated_at: now,
          };
        });
        must(await supabaseAdmin.from("addon_settings").insert(newAddons), "salin add-on");
      }
    }

    // 3. CLONE KPI GLOBAL (LATEST)
    if (cloneKpi) {
      const { data: sourceKpi } = must(
        await supabaseAdmin.from("kpi_configs")
          .select("*")
          .eq("tenant_apotek_id", sourceBranchId)
          .order("period_year", { ascending: false })
          .order("period_month", { ascending: false })
          .limit(1)
          .maybeSingle(),
        "baca KPI sumber",
      );

      if (sourceKpi) {
        must(
          await supabaseAdmin.from("kpi_configs")
            .delete()
            .eq("tenant_apotek_id", targetBranchId)
            .eq("period_month", sourceKpi.period_month)
            .eq("period_year", sourceKpi.period_year),
          "hapus KPI lama",
        );

        const bonusConfigV2 = buildClonedBonusConfigV2(sourceKpi);

        let bonusConfig = sourceKpi.bonus_config || {};
        if (typeof bonusConfig === "object" && "user_configs" in bonusConfig) {
          bonusConfig = { ...bonusConfig, user_configs: {} };
        }

        must(
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
          }),
          "salin KPI",
        );
      }
    }

    // 4. CLONE PRODUK FOKUS
    if (cloneProdukFokus) {
      const { data: sourceProduk } = must(
        await supabaseAdmin.from("product_fokus_configs").select("*").eq("tenant_apotek_id", sourceBranchId),
        "baca produk fokus sumber",
      );
      must(
        await supabaseAdmin.from("product_fokus_configs").delete().eq("tenant_apotek_id", targetBranchId),
        "hapus produk fokus lama",
      );
      if (sourceProduk && sourceProduk.length > 0) {
        const newProduk = sourceProduk.map((p) => ({
          tenant_apotek_id: targetBranchId,
          product_id: p.product_id,
          period_month: p.period_month,
          period_year: p.period_year,
          target_type: p.target_type,
          target_value: p.target_value,
          bonus_type: p.bonus_type,
          bonus_value: p.bonus_value,
          bonus_step: p.bonus_step,
          has_min_target: p.has_min_target,
          count_base: p.count_base,
          created_at: now,
        }));
        must(await supabaseAdmin.from("product_fokus_configs").insert(newProduk), "salin produk fokus");
      }
    }

    if (user) {
      await logActivity(supabaseAdmin, targetBranchId, user.id, 'addon_settings', targetBranchId, 'UPDATE', null, { action: "CLONED_FROM", sourceBranchId });
    }

    revalidatePath(`/sa/branches/${targetBranchId}`);
    return { success: true, message: "Konfigurasi cabang berhasil diduplikasi!" };

  } catch (err: any) {
    console.error("Clone error:", err);
    return { error: `Gagal menyalin konfigurasi: ${err.message}. Sebagian data mungkin sudah berubah — periksa konfigurasi cabang tujuan sebelum mengulang.` };
  }
}
