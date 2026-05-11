"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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
  const fullName = formData.get("fullName") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const role = formData.get("role") as string;
  const tenantId = formData.get("tenantId") as string;

  if (!fullName || !email || !password || !role || !tenantId) {
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

  const userId = authData.user.id;
  const now = new Date().toISOString();

  // 2. Insert into app_users
  const { error: appUserError } = await supabaseAdmin
    .from("app_users")
    .insert({
      id: userId,
      full_name: fullName,
      email: email,
      is_active: true,
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
  return { success: true, message: "Pegawai berhasil ditambahkan ke cabang ini!" };
}

export async function getAvailableUsersForBranch(tenantId: string) {
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
  const userId = formData.get("userId") as string;
  const role = formData.get("role") as string;
  const tenantId = formData.get("tenantId") as string;

  if (!userId || !role || !tenantId) {
    return { error: "Semua kolom wajib diisi." };
  }

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
  return { success: true, message: "Pegawai existing berhasil ditugaskan ke cabang ini!" };
}

export async function createStaffInvitationAction(prevState: any, formData: FormData) {
  void prevState;
  const tenantId = formData.get("tenantId") as string;
  const fullName = formData.get("fullName") as string;
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const role = formData.get("role") as string;

  if (!tenantId || !fullName || !email || !role) {
    return { error: "Data undangan tidak lengkap." };
  }

  if (!["crew", "admin_apotek"].includes(role)) {
    return { error: "Role undangan tidak valid." };
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

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: inv.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: inv.full_name, role: inv.role },
  });

  if (authError) {
    if (authError.message?.includes("already registered")) {
      return { error: "Email ini sudah terdaftar. Hubungi admin untuk assign ke cabang." };
    }
    return { error: `Gagal membuat akun: ${authError.message}` };
  }

  const userId = authData.user.id;
  const now = new Date().toISOString();

  const { error: appUserError } = await supabaseAdmin
    .from("app_users")
    .insert({
      id: userId,
      full_name: inv.full_name,
      email: inv.email,
      is_active: true,
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

export async function saveKpiAction(prevState: any, formData: FormData) {
  const tenantId = formData.get("tenantId") as string;
  const month = parseInt(formData.get("month") as string);
  const year = parseInt(formData.get("year") as string);
  
  const targetOmzet = parseFloat(formData.get("targetOmzet") as string);
  const targetAtv = parseFloat(formData.get("targetAtv") as string) || 0;
  const targetAtu = parseFloat(formData.get("targetAtu") as string) || 0;

  // New fields
  const isAtvEnabled = formData.get("isAtvEnabled") === "on";
  const isAtuEnabled = formData.get("isAtuEnabled") === "on";
  const weightOmzet = parseInt(formData.get("weightOmzet") as string) || 0;
  const weightAtv = parseInt(formData.get("weightAtv") as string) || 0;
  const weightAtu = parseInt(formData.get("weightAtu") as string) || 0;

  const bonusType = formData.get("bonusType") as string; // 'flat' or 'kelipatan'
  const targetDistribution = formData.get("targetDistribution") as string || "rata";
  const bonusDistribution = formData.get("bonusDistribution") as string || "global";
  const flatNominal = parseFloat(formData.get("flatNominal") as string) || 0;
  const kelipatanStep = parseFloat(formData.get("kelipatanStep") as string) || 0;
  const kelipatanReward = parseFloat(formData.get("kelipatanReward") as string) || 0;

  let userConfigs = {};
  try {
    const ucStr = formData.get("userConfigs") as string;
    if (ucStr) userConfigs = JSON.parse(ucStr);
  } catch (e) {
    console.error("Failed to parse user configs", e);
  }

  if (!tenantId || isNaN(month) || isNaN(year) || isNaN(targetOmzet)) {
    return { error: "Data KPI tidak valid." };
  }

  const supabaseAdmin = createAdminClient();

  const { data: existing } = await supabaseAdmin
    .from("kpi_configs")
    .select("*")
    .eq("tenant_apotek_id", tenantId)
    .eq("period_month", month)
    .eq("period_year", year)
    .maybeSingle();

  const prevBc = (existing?.bonus_config && typeof existing.bonus_config === "object")
    ? (existing.bonus_config as Record<string, unknown>)
    : {};

  const parsePrevInt = (key: string, fallback: number) => {
    const v = prevBc[key];
    if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
    if (typeof v === "string" && v.trim() !== "") {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : fallback;
    }
    return fallback;
  };

  const parsePrevFloat = (key: string, fallback: number) => {
    const v = prevBc[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    }
    return fallback;
  };

  // Mode global: input bobot ada di form. Mode manual: input itu tidak di-render — jangan validasi total 0%.
  if (bonusDistribution === "global") {
    const totalWeight = weightOmzet + (isAtvEnabled ? weightAtv : 0) + (isAtuEnabled ? weightAtu : 0);
    if (totalWeight !== 100) {
      return { error: `Total bobot persentase harus 100% (saat ini ${totalWeight}%).` };
    }
  }

  const bonusTypeNormalized =
    bonusType === "kelipatan" ? "kelipatan" : bonusType === "flat" ? "flat" : null;

  let resolvedBonusType: string;
  let resolvedWeightOmzet: number;
  let resolvedWeightAtv: number;
  let resolvedWeightAtu: number;
  let resolvedFlatNominal: number;
  let resolvedKelipatanStep: number;
  let resolvedKelipatanReward: number;

  if (bonusDistribution === "global") {
    resolvedBonusType = bonusTypeNormalized || "flat";
    resolvedWeightOmzet = weightOmzet;
    resolvedWeightAtv = isAtvEnabled ? weightAtv : 0;
    resolvedWeightAtu = isAtuEnabled ? weightAtu : 0;
    resolvedFlatNominal = flatNominal;
    resolvedKelipatanStep = kelipatanStep;
    resolvedKelipatanReward = kelipatanReward;
  } else {
    // Manual: pertahankan snapshot global terakhir dari DB (toggle bolak-balik), atau default aman.
    const pwO = parsePrevInt("weight_omzet", NaN);
    const pwA = parsePrevInt("weight_atv", NaN);
    const pwU = parsePrevInt("weight_atu", NaN);
    const prevSum =
      (Number.isFinite(pwO) ? pwO : 0) +
      (isAtvEnabled && Number.isFinite(pwA) ? pwA : 0) +
      (isAtuEnabled && Number.isFinite(pwU) ? pwU : 0);
    if (
      prevSum === 100 &&
      Number.isFinite(pwO) &&
      (!isAtvEnabled || Number.isFinite(pwA)) &&
      (!isAtuEnabled || Number.isFinite(pwU))
    ) {
      resolvedWeightOmzet = pwO;
      resolvedWeightAtv = isAtvEnabled ? pwA : 0;
      resolvedWeightAtu = isAtuEnabled ? pwU : 0;
    } else {
      resolvedWeightOmzet = 100;
      resolvedWeightAtv = 0;
      resolvedWeightAtu = 0;
    }

    const prevBt = prevBc["bonus_type"];
    resolvedBonusType =
      prevBt === "kelipatan" || prevBt === "flat"
        ? prevBt
        : "flat";

    resolvedFlatNominal = parsePrevFloat("flat_nominal", 0);
    resolvedKelipatanStep = parsePrevFloat("kelipatan_step", 0);
    resolvedKelipatanReward = parsePrevFloat("kelipatan_reward", 0);
  }

  const now = new Date().toISOString();

  const bonusConfig = {
    bonus_type: resolvedBonusType,
    is_atv_enabled: isAtvEnabled,
    is_atu_enabled: isAtuEnabled,
    weight_omzet: resolvedWeightOmzet,
    weight_atv: isAtvEnabled ? resolvedWeightAtv : 0,
    weight_atu: isAtuEnabled ? resolvedWeightAtu : 0,
    flat_nominal: resolvedFlatNominal,
    kelipatan_step: resolvedKelipatanStep,
    kelipatan_reward: resolvedKelipatanReward,
    target_distribution: targetDistribution,
    bonus_distribution: bonusDistribution,
    user_configs: userConfigs,
  };

  const payload = {
    tenant_apotek_id: tenantId,
    period_month: month,
    period_year: year,
    target_omzet: targetOmzet,
    target_atv: targetAtv,
    target_atu: targetAtu,
    bonus_mode: "fixed_plus_progressive", // Use valid enum value
    bonus_config: bonusConfig,
    updated_at: now,
  };

  const supabaseClient = await createClient();
  const { data: { user: currentUser } } = await supabaseClient.auth.getUser();

  let error;
  if (existing) {
    const { error: updateError } = await supabaseAdmin
      .from("kpi_configs")
      .update(payload)
      .eq("id", existing.id);
    error = updateError;
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return { error: "Sesi tidak valid. Silakan login kembali." };
    }

    const { error: insertError } = await supabaseAdmin
      .from("kpi_configs")
      .insert({
        ...payload,
        created_by_user_id: user?.id,
        created_at: now
      });
    error = insertError;
  }

  if (error) {
    return { error: `Gagal menyimpan KPI: ${error.message}` };
  }

  if (currentUser) {
    await logActivity(supabaseAdmin, tenantId, currentUser.id, 'kpi_configs', existing ? existing.id : tenantId, existing ? 'UPDATE' : 'CREATE', existing, payload);
  }

  revalidatePath(`/bba/branches/${tenantId}`);
  return { success: true, message: `KPI untuk ${month}/${year} berhasil disimpan!` };
}

export async function getPreviousKpiAction(tenantId: string, currentMonth: number, currentYear: number) {
  const supabaseAdmin = createAdminClient();
  
  let prevMonth = currentMonth - 1;
  let prevYear = currentYear;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }

  const { data, error } = await supabaseAdmin
    .from("kpi_configs")
    .select("*")
    .eq("tenant_apotek_id", tenantId)
    .eq("period_month", prevMonth)
    .eq("period_year", prevYear)
    .maybeSingle();

  if (error || !data) {
    return { error: "Data bulan sebelumnya tidak ditemukan." };
  }

  return { success: true, data };
}

export async function saveAddonAction(prevState: any, formData: FormData) {
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
  const shiftId = formData.get("shiftId") as string;
  const tenantId = formData.get("tenantId") as string;

  if (!shiftId) return { error: "ID Shift tidak ditemukan." };

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
  const tenantId = formData.get("tenantId") as string;
  const addonKey = formData.get("addonKey") as string;
  let patch: Record<string, unknown>;
  try {
    patch = JSON.parse(formData.get("settings") as string) as Record<string, unknown>;
  } catch {
    return { error: "Format konfigurasi tidak valid." };
  }

  if (!tenantId || !addonKey) return { error: "Data tidak valid." };

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
export async function savePayrollConfigAction(prevState: any, formData: FormData) {
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

export async function getOtherBranchesAction(currentBranchId: string) {
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

        // Strip user_configs from bonus_config
        let bonusConfig = sourceKpi.bonus_config || {};
        if (typeof bonusConfig === 'object' && 'user_configs' in bonusConfig) {
          bonusConfig = { ...bonusConfig, user_configs: {} }; // Clear user specific targets/bonuses
        }

        await supabaseAdmin.from("kpi_configs").insert({
          tenant_apotek_id: targetBranchId,
          period_month: sourceKpi.period_month,
          period_year: sourceKpi.period_year,
          target_omzet: sourceKpi.target_omzet,
          target_atv: sourceKpi.target_atv,
          target_atu: sourceKpi.target_atu,
          bonus_mode: sourceKpi.bonus_mode,
          bonus_config: bonusConfig,
          created_by_user_id: user?.id,
          created_at: now,
          updated_at: now
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
