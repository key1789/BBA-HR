"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/app-url";
import { revalidatePath } from "next/cache";
import { assertGlobalBbaPortalManager } from "@/lib/bba-portal-guard";
import crypto from "crypto";

const BRANCH_BOOTSTRAP_ADDONS = [
  "produk_fokus",
  "payroll",
  "review_pelanggan",
  "review_internal",
  "absensi_shift",
] as const;

const DEFAULT_SHIFTS = [
  { shift_name: "PAGI", start_time: "07:00:00", end_time: "15:00:00" },
  { shift_name: "SIANG", start_time: "15:00:00", end_time: "21:00:00" },
];

export type StaffOnboardingInput = {
  fullName: string;
  email: string;
  phone: string;
};

export type StaffOnboardingResult = {
  fullName: string;
  email: string;
  role: "admin_apotek" | "crew";
  inviteLink: string | null;
  skipped: boolean;
  skipReason?: string;
};

export type OnboardingResult =
  | {
      success: true;
      branchId: string;
      branchName: string;
      branchCode: string;
      staffResults: StaffOnboardingResult[];
    }
  | { error: string };

export async function createBranchOnboardingAction(
  _prev: OnboardingResult | null,
  formData: FormData,
): Promise<OnboardingResult> {
  const gate = await assertGlobalBbaPortalManager();
  if (!gate.ok) return { error: gate.error };

  // --- Branch info ---
  const name = (formData.get("name") as string)?.trim();
  const code = (formData.get("code") as string)?.trim();
  const address = (formData.get("address") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const ownerId = (formData.get("ownerId") as string)?.trim();

  if (!name || !code || !ownerId) {
    return { error: "Nama, Kode Apotek, dan Owner wajib diisi." };
  }

  // --- Admin apotek (invitation, 7 hari) ---
  const adminEmail = (formData.get("adminEmail") as string)?.trim().toLowerCase();
  const includeAdmin = !!adminEmail;

  // --- Custom shifts (optional) ---
  let customShifts: { shift_name: string; start_time: string; end_time: string }[] = [];
  try {
    const raw = formData.get("shiftsJson") as string;
    if (raw) customShifts = JSON.parse(raw);
  } catch {
    // ignore — fall back to defaults
  }
  const shiftsToCreate = customShifts.length > 0 ? customShifts : DEFAULT_SHIFTS;

  // --- Staff list ---
  let staffList: StaffOnboardingInput[] = [];
  try {
    const raw = formData.get("staffJson") as string;
    if (raw) staffList = JSON.parse(raw);
  } catch {
    return { error: "Data staf tidak valid." };
  }

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user: actor } } = await supabase.auth.getUser();

  if (!actor) {
    return { error: "Sesi tidak valid. Silakan login ulang." };
  }

  const actorId = actor.id;
  const now = new Date().toISOString();

  // Validasi owner exists
  const { data: ownerUser } = await supabaseAdmin
    .from("app_users")
    .select("id")
    .eq("id", ownerId)
    .maybeSingle();

  if (!ownerUser) {
    return { error: "Owner yang dipilih tidak ditemukan. Refresh halaman dan coba lagi." };
  }

  // 1. Create branch
  const { data: newBranch, error: branchError } = await supabaseAdmin
    .from("tenant_apotek")
    .insert({ name, code, status: "active", address, phone })
    .select("id")
    .single();

  if (branchError) {
    return { error: `Gagal membuat apotek: ${branchError.message}` };
  }

  const tenantId = newBranch.id;

  // Helper: rollback semua data yang sudah dibuat jika bootstrap gagal di tengah jalan.
  // Setiap delete idempotent — baris yang tidak ada tidak masalah.
  const cleanupBranch = async () => {
    await supabaseAdmin.from("master_shifts").delete().eq("tenant_apotek_id", tenantId);
    await supabaseAdmin.from("kpi_configs").delete().eq("tenant_apotek_id", tenantId);
    await supabaseAdmin.from("addon_settings").delete().eq("tenant_apotek_id", tenantId);
    await supabaseAdmin.from("tenant_memberships").delete().eq("tenant_apotek_id", tenantId);
    await supabaseAdmin.from("tenant_apotek").delete().eq("id", tenantId);
  };

  // 2. Assign owner membership
  const { error: ownerMembershipError } = await supabaseAdmin.from("tenant_memberships").insert({
    user_id: ownerId,
    tenant_apotek_id: tenantId,
    role: "owner",
    is_active: true,
  });

  if (ownerMembershipError) {
    await cleanupBranch();
    return { error: `Gagal menetapkan owner: ${ownerMembershipError.message}` };
  }

  // 3. Bootstrap addons
  const { error: addonsError } = await supabaseAdmin.from("addon_settings").insert(
    BRANCH_BOOTSTRAP_ADDONS.map((addon_key) => ({
      tenant_apotek_id: tenantId,
      addon_key,
      is_enabled: false,
      settings: {},
      updated_by_user_id: actorId,
      updated_at: now,
    })),
  );

  if (addonsError) {
    await cleanupBranch();
    return { error: `Gagal bootstrap addon: ${addonsError.message}` };
  }

  // 4. Bootstrap KPI
  const { error: kpiError } = await supabaseAdmin.from("kpi_configs").insert({
    tenant_apotek_id: tenantId,
    period_month: new Date().getMonth() + 1,
    period_year: new Date().getFullYear(),
    target_omzet: 0,
    target_atv: 0,
    target_atu: 0,
    created_by_user_id: actorId,
  });

  if (kpiError) {
    await cleanupBranch();
    return { error: `Gagal bootstrap KPI: ${kpiError.message}` };
  }

  // 5. Bootstrap shifts (default atau custom dari wizard)
  const { error: shiftsError } = await supabaseAdmin.from("master_shifts").insert(
    shiftsToCreate.map((row) => ({
      tenant_apotek_id: tenantId,
      shift_name: row.shift_name,
      // Pastikan format HH:MM:SS
      start_time: row.start_time.length === 5 ? `${row.start_time}:00` : row.start_time,
      end_time: row.end_time.length === 5 ? `${row.end_time}:00` : row.end_time,
      created_at: now,
      updated_at: now,
    })),
  );

  if (shiftsError) {
    await cleanupBranch();
    return { error: `Gagal bootstrap shift: ${shiftsError.message}` };
  }

  // 6. Create invitations
  const appUrl = getAppUrl();
  const staffResults: StaffOnboardingResult[] = [];

  const makeCrewInvitation = async (
    fullName: string,
    email: string,
  ): Promise<StaffOnboardingResult> => {
    // Check for duplicate email
    const { data: existing } = await supabaseAdmin
      .from("app_users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      return { fullName, email, role: "crew", inviteLink: null, skipped: true, skipReason: "Email sudah terdaftar" };
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    const { error } = await supabaseAdmin.from("staff_invitations").insert({
      tenant_apotek_id: tenantId,
      email,
      full_name: fullName,
      role: "crew",
      token,
      status: "pending",
      expires_at: expiresAt.toISOString(),
      invited_by_user_id: actorId,
      updated_at: now,
    });

    if (error) {
      if (error.message?.toLowerCase().includes("unique")) {
        return { fullName, email, role: "crew", inviteLink: null, skipped: true, skipReason: "Undangan sudah ada" };
      }
      return { fullName, email, role: "crew", inviteLink: null, skipped: true, skipReason: error.message };
    }

    const inviteLink = `${appUrl}/accept-staff-invitation/${token}`;
    return { fullName, email, role: "crew", inviteLink, skipped: false };
  };

  // Buat undangan admin apotek (7 hari, admin set password sendiri via link aktivasi)
  if (includeAdmin) {
    const adminFullName = `Admin — ${name}`;

    const { data: existingAdmin } = await supabaseAdmin
      .from("app_users")
      .select("id")
      .eq("email", adminEmail)
      .maybeSingle();

    if (existingAdmin) {
      staffResults.push({
        fullName: adminFullName,
        email: adminEmail,
        role: "admin_apotek",
        inviteLink: null,
        skipped: true,
        skipReason: "Email sudah terdaftar",
      });
    } else {
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 hari

      const { error: invError } = await supabaseAdmin.from("staff_invitations").insert({
        tenant_apotek_id: tenantId,
        email: adminEmail,
        full_name: adminFullName,
        role: "admin_apotek",
        token,
        status: "pending",
        expires_at: expiresAt.toISOString(),
        invited_by_user_id: actorId,
        updated_at: now,
      });

      if (invError) {
        staffResults.push({
          fullName: adminFullName,
          email: adminEmail,
          role: "admin_apotek",
          inviteLink: null,
          skipped: true,
          skipReason: invError.message?.toLowerCase().includes("unique")
            ? "Undangan sudah ada"
            : invError.message,
        });
      } else {
        staffResults.push({
          fullName: adminFullName,
          email: adminEmail,
          role: "admin_apotek",
          inviteLink: `${appUrl}/accept-staff-invitation/${token}`,
          skipped: false,
        });
      }
    }
  }

  for (const staff of staffList) {
    const cleanEmail = staff.email?.trim().toLowerCase();
    const cleanName = staff.fullName?.trim();
    if (!cleanEmail || !cleanName) continue;
    const result = await makeCrewInvitation(cleanName, cleanEmail);
    staffResults.push(result);
  }

  revalidatePath("/bba/branches");

  return {
    success: true,
    branchId: tenantId,
    branchName: name,
    branchCode: code,
    staffResults,
  };
}
