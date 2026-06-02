"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/app-url";
import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { assertGlobalBbaPortalManager } from "@/lib/bba-portal-guard";

export async function createOwnerAction(prevState: any, formData: FormData) {
  const gate = await assertGlobalBbaPortalManager();
  if (!gate.ok) return { error: gate.error };

  const fullName = formData.get("fullName") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const phone = formData.get("phone") as string;

  if (!fullName || !email || !password) {
    return { error: "Nama, Email, dan Password wajib diisi." };
  }

  const supabaseAdmin = createAdminClient();

  // 1. Create user in auth.users
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: "owner", phone },
  });

  if (authError) {
    if (authError.message.includes("already registered")) {
      return { error: "Email ini sudah terdaftar di sistem." };
    }
    return { error: `Gagal membuat akun Owner: ${authError.message}` };
  }

  const userId = authData.user.id;
  const now = new Date().toISOString();

  // 2. Insert into app_users
  const { error: appUserError } = await supabaseAdmin
    .from("app_users")
    .insert({
      id: userId,
      full_name: fullName,
      email: email,
      phone: phone || null,
      is_active: true,
      created_at: now,
      updated_at: now
    });

  if (appUserError) {
    return { error: `Gagal menyimpan profil owner: ${appUserError.message}` };
  }

  revalidatePath("/bba/owners");
  return { success: true, message: "Owner berhasil ditambahkan! Silakan assign ke Apotek mereka di menu Manajemen Apotek." };
}

export async function toggleOwnerStatusAction(userId: string, currentStatus: boolean) {
  const gate = await assertGlobalBbaPortalManager();
  if (!gate.ok) return { error: gate.error };

  const supabaseAdmin = createAdminClient();
  const newStatus = !currentStatus;

  // Blokir / buka di level Auth (ban_duration)
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: newStatus ? "none" : "876000h",
  });

  if (authError) {
    return { error: `Gagal mengubah status auth: ${authError.message}` };
  }

  // Update app_users.is_active untuk tampilan badge di UI
  const { error: appUserError } = await supabaseAdmin
    .from("app_users")
    .update({ is_active: newStatus })
    .eq("id", userId);

  if (appUserError) {
    return { error: `Gagal mengubah status akun: ${appUserError.message}` };
  }

  // Update tenant_memberships.is_active — ini yang benar-benar dikecek saat login
  const { error: membershipError } = await supabaseAdmin
    .from("tenant_memberships")
    .update({ is_active: newStatus })
    .eq("user_id", userId)
    .eq("role", "owner");

  if (membershipError) {
    return { error: `Gagal mengubah akses membership: ${membershipError.message}` };
  }

  revalidatePath("/bba/owners");
  return { success: true, message: `Status akun berhasil di${newStatus ? 'aktifkan' : 'nonaktifkan'}.` };
}

export async function editOwnerAction(prevState: any, formData: FormData) {
  const gate = await assertGlobalBbaPortalManager();
  if (!gate.ok) return { error: gate.error };

  const userId = formData.get("userId") as string;
  const fullName = formData.get("fullName") as string;
  const email = formData.get("email") as string;
  const phone = formData.get("phone") as string;

  if (!userId || !fullName || !email) {
    return { error: "Nama dan Email wajib diisi." };
  }

  const supabaseAdmin = createAdminClient();

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email,
    user_metadata: { full_name: fullName, phone: phone || null, role: "owner" },
  });

  if (authError) {
    if (authError.message.includes("already registered")) {
      return { error: "Email ini sudah digunakan oleh akun lain." };
    }
    return { error: `Gagal memperbarui kredensial: ${authError.message}` };
  }

  const isDemo = formData.get("is_demo") === "true";

  const { error: appUserError } = await supabaseAdmin
    .from("app_users")
    .update({
      full_name: fullName,
      email: email,
      phone: phone || null,
      is_demo: isDemo,
      updated_at: new Date().toISOString()
    })
    .eq("id", userId);

  if (appUserError) {
    return { error: `Gagal memperbarui profil: ${appUserError.message}` };
  }

  revalidatePath("/bba/owners");
  return { success: true, message: "Profil owner berhasil diperbarui." };
}

/** Link `/set-password/[token]` — sama pola dengan tab pegawai; tenant opsional untuk owner tanpa membership. */
export async function createOwnerPasswordResetLinkAction(formData: FormData) {
  const gate = await assertGlobalBbaPortalManager();
  if (!gate.ok) return { error: gate.error };

  const userId = formData.get("userId") as string;
  if (!userId) return { error: "Data user tidak valid." };

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user: admin } } = await supabase.auth.getUser();
  if (!admin) return { error: "Sesi admin tidak valid." };

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setHours(expiresAt.getHours() + 24);
  const token = crypto.randomUUID();

  const { data: ownerMembership } = await supabaseAdmin
    .from("tenant_memberships")
    .select("tenant_apotek_id")
    .eq("user_id", userId)
    .eq("role", "owner")
    .eq("is_active", true)
    .order("assigned_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const tenantApotekId = ownerMembership?.tenant_apotek_id ?? null;

  // Jangan expire link reset cabang lain untuk user yang sama (edge case owner + crew).
  if (tenantApotekId) {
    await supabaseAdmin
      .from("staff_password_reset_links")
      .update({ status: "expired", updated_at: now.toISOString() })
      .eq("user_id", userId)
      .eq("status", "pending")
      .or(`tenant_apotek_id.eq.${tenantApotekId},tenant_apotek_id.is.null`);
  } else {
    await supabaseAdmin
      .from("staff_password_reset_links")
      .update({ status: "expired", updated_at: now.toISOString() })
      .eq("user_id", userId)
      .eq("status", "pending")
      .is("tenant_apotek_id", null);
  }

  const { error } = await supabaseAdmin
    .from("staff_password_reset_links")
    .insert({
      user_id: userId,
      tenant_apotek_id: tenantApotekId,
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

/** Undangan owner global (tanpa tenant): BBA hanya mengisi nama, email diisi owner saat menerima undangan. */
export async function createOwnerInvitationAction(prevState: any, formData: FormData) {
  void prevState;
  const gate = await assertGlobalBbaPortalManager();
  if (!gate.ok) return { error: gate.error };

  const fullName = (formData.get("fullName") as string)?.trim();

  if (!fullName) {
    return { error: "Nama wajib diisi." };
  }

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user: admin } } = await supabase.auth.getUser();

  if (!admin) return { error: "Sesi admin tidak valid." };

  const token = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setHours(expiresAt.getHours() + 48);

  const { error } = await supabaseAdmin.from("owner_invitations").insert({
    full_name: fullName,
    token,
    status: "pending",
    expires_at: expiresAt.toISOString(),
    created_by_user_id: admin.id,
    updated_at: now.toISOString(),
  });

  if (error) {
    return { error: `Gagal membuat undangan: ${error.message}` };
  }

  const inviteLink = `${getAppUrl()}/accept-invitation/${token}`;

  revalidatePath("/bba/owners");
  return {
    success: true,
    message: "Undangan berhasil dibuat.",
    inviteLink,
    ownerName: fullName,
  };
}

export async function getPendingOwnerInvitationsAction() {
  const gate = await assertGlobalBbaPortalManager();
  if (!gate.ok) return { error: gate.error };

  const supabaseAdmin = createAdminClient();
  const nowIso = new Date().toISOString();

  await supabaseAdmin
    .from("owner_invitations")
    .update({ status: "expired", updated_at: nowIso })
    .eq("status", "pending")
    .lt("expires_at", nowIso);

  const { data, error } = await supabaseAdmin
    .from("owner_invitations")
    .select("id, full_name, email, token, status, expires_at, created_at")
    .in("status", ["pending", "expired"])
    .order("created_at", { ascending: false });

  if (error) return { error: `Gagal mengambil daftar undangan: ${error.message}` };

  const appUrl = getAppUrl();
  const mapped = (data || []).map((inv) => ({
    ...inv,
    inviteLink: `${appUrl}/accept-invitation/${inv.token}`,
  }));
  return { success: true, data: mapped };
}

export async function regenerateOwnerInvitationAction(invitationId: string) {
  const gate = await assertGlobalBbaPortalManager();
  if (!gate.ok) return { error: gate.error };

  if (!invitationId) return { error: "Undangan tidak valid." };

  const supabaseAdmin = createAdminClient();
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setHours(expiresAt.getHours() + 48);
  const token = crypto.randomUUID();

  const { data: inv, error: fetchError } = await supabaseAdmin
    .from("owner_invitations")
    .select("id, status")
    .eq("id", invitationId)
    .maybeSingle();

  if (fetchError || !inv) return { error: "Data undangan tidak ditemukan." };
  if (inv.status === "accepted" || inv.status === "cancelled") {
    return { error: "Undangan ini tidak bisa diperbarui." };
  }

  const { error } = await supabaseAdmin
    .from("owner_invitations")
    .update({
      token,
      status: "pending",
      expires_at: expiresAt.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", invitationId);

  if (error) return { error: `Gagal memperbarui link: ${error.message}` };

  const inviteLink = `${getAppUrl()}/accept-invitation/${token}`;
  revalidatePath("/bba/owners");
  return { success: true, message: "Link undangan berhasil diperbarui.", inviteLink };
}

export async function completeInvitationAction(prevState: any, formData: FormData) {
  const token = formData.get("token") as string;
  const fullName = (formData.get("fullName") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;
  const phone = (formData.get("phone") as string)?.trim() || null;

  if (!token || !fullName || !email || !password) {
    return { error: "Semua field wajib diisi." };
  }

  if (password.length < 8) {
    return { error: "Password minimal 8 karakter." };
  }

  const supabaseAdmin = createAdminClient();

  const { data: inv, error: invError } = await supabaseAdmin
    .from("owner_invitations")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .maybeSingle();

  if (invError || !inv) {
    return { error: "Link undangan tidak valid atau sudah kadaluwarsa." };
  }

  if (new Date(inv.expires_at) < new Date()) {
    await supabaseAdmin
      .from("owner_invitations")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", inv.id);
    return { error: "Link undangan sudah kadaluwarsa." };
  }

  // Cek apakah email sudah terdaftar
  const { data: existingUser } = await supabaseAdmin
    .from("app_users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingUser) {
    return { error: "Email ini sudah terdaftar. Gunakan email lain." };
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: "owner" }
  });

  if (authError) {
    if (authError.message.toLowerCase().includes("already registered")) {
      return { error: "Email ini sudah terdaftar. Gunakan email lain." };
    }
    return { error: `Gagal membuat akun: ${authError.message}` };
  }

  const userId = authData.user.id;
  const now = new Date().toISOString();

  const { error: appUserError } = await supabaseAdmin
    .from("app_users")
    .insert({
      id: userId,
      full_name: fullName,
      email,
      phone,
      is_active: true,
      created_at: now,
      updated_at: now
    });

  if (appUserError) {
    return { error: `Gagal menyimpan profil: ${appUserError.message}` };
  }

  await supabaseAdmin
    .from("owner_invitations")
    .update({
      status: "accepted",
      accepted_at: now,
      accepted_by_user_id: userId,
      updated_at: now,
    })
    .eq("id", inv.id);

  revalidatePath("/bba/owners");
  return { success: true, message: "Pendaftaran berhasil! Silakan login." };
}
