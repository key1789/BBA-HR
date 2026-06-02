"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { assertGlobalBbaPortalManager } from "@/lib/bba-portal-guard";

const BRANCH_BOOTSTRAP_ADDONS = [
  "produk_fokus",
  "payroll",
  "review_pelanggan",
  "review_internal",
  "absensi_shift",
] as const;

/** Minimal: tab Overview punya daftar shift, bukan “Belum Ada Shift”. */
const BRANCH_BOOTSTRAP_SHIFTS = [
  { shift_name: "PAGI", start_time: "07:00:00", end_time: "15:00:00" },
  { shift_name: "SIANG", start_time: "15:00:00", end_time: "21:00:00" },
] as const;

export async function createBranchAction(prevState: any, formData: FormData) {
  const gate = await assertGlobalBbaPortalManager();
  if (!gate.ok) return { error: gate.error };

  const name = formData.get("name") as string;
  const code = formData.get("code") as string;
  const ownerId = formData.get("ownerId") as string;
  const addressRaw = (formData.get("address") as string)?.trim() || "";
  const phoneRaw = (formData.get("phone") as string)?.trim() || "";

  if (!name || !code || !ownerId) {
    return { error: "Nama, Kode Apotek, dan Owner wajib diisi." };
  }

  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const { data: { user: actor } } = await supabase.auth.getUser();
  const actorUserId = actor?.id ?? ownerId;

  const emptyToNull = (s: string) => (s.length > 0 ? s : null);
  const isTrial = formData.get("is_trial") === "true";

  // 1. Insert tenant_apotek
  const { data: newBranch, error: branchError } = await supabaseAdmin
    .from("tenant_apotek")
    .insert({
      name,
      code,
      status: "active",
      is_trial: isTrial,
      address: emptyToNull(addressRaw),
      phone: emptyToNull(phoneRaw),
    })
    .select("id")
    .single();

  if (branchError) {
    return { error: `Gagal membuat cabang: ${branchError.message}` };
  }

  const newTenantId = newBranch.id;
  const now = new Date().toISOString();

  // 2. Assign Owner
  const { error: membershipError } = await supabaseAdmin
    .from("tenant_memberships")
    .insert({
      user_id: ownerId,
      tenant_apotek_id: newTenantId,
      role: "owner",
      is_active: true
    });
    
  if (membershipError) {
    console.error("Failed to assign owner:", membershipError);
  }

  // 3. Baris add-on (nonaktif) + JSON settings kosong (supaya kolom addon “siap dikonfigurasi”)
  const { error: addonError } = await supabaseAdmin.from("addon_settings").insert(
    BRANCH_BOOTSTRAP_ADDONS.map((addon_key) => ({
      tenant_apotek_id: newTenantId,
      addon_key,
      is_enabled: false,
      settings: {},
      updated_by_user_id: actorUserId,
      updated_at: now,
    }))
  );

  if (addonError) {
    console.error("addon_settings bootstrap failed:", addonError);
    return {
      error: `Cabang terbentuk tetapi add-on default gagal: ${addonError.message}. Sesuaikan add-on dari menu cabang atau hubungi dukungan.`,
    };
  }

  // 4. KPI periode kalender berjalan
  const { error: kpiError } = await supabaseAdmin.from("kpi_configs").insert({
    tenant_apotek_id: newTenantId,
    period_month: new Date().getMonth() + 1,
    period_year: new Date().getFullYear(),
    target_omzet: 0,
    target_atv: 0,
    target_atu: 0,
    created_by_user_id: actorUserId,
  });

  if (kpiError) {
    console.error("kpi_configs bootstrap failed:", kpiError);
    return {
      error: `Cabang dan add-on ada, tetapi KPI awal gagal: ${kpiError.message}. Buat KPI manual dari dashboard cabang jika perlu.`,
    };
  }

  // 5. Master shift standar (Overview “Operasional”)
  const { error: shiftError } = await supabaseAdmin.from("master_shifts").insert(
    BRANCH_BOOTSTRAP_SHIFTS.map((row) => ({
      tenant_apotek_id: newTenantId,
      shift_name: row.shift_name,
      start_time: row.start_time,
      end_time: row.end_time,
      created_at: now,
      updated_at: now,
    }))
  );

  if (shiftError) {
    console.error("master_shifts bootstrap failed:", shiftError);
    revalidatePath("/bba/branches");
    revalidatePath("/bba/audit");
    return {
      success: true,
      message:
        "Apotek berhasil didaftarkan (profil, add-on & KPI dasar OK). Shift standar gagal dibuat — tambahkan dari tab Shift & Roster atau jalankan migrasi database terbaru.",
    };
  }

  revalidatePath("/bba/branches");
  revalidatePath("/bba/audit");
  return {
    success: true,
    message:
      "Apotek berhasil didaftarkan. Profil, KPI bulan ini, baris add-on, dan shift Pagi/Siang standar sudah siap — lanjutkan dari tab Overview cabang.",
  };
}

export async function toggleBranchStatusAction(formData: FormData) {
  const gate = await assertGlobalBbaPortalManager();
  if (!gate.ok) return { error: gate.error };

  const branchId = formData.get("branchId") as string;
  const currentStatus = formData.get("currentStatus") as string;

  if (!branchId) return { error: "Cabang tidak ditemukan." };

  const newStatus = currentStatus === "active" ? "inactive" : "active";

  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin
    .from("tenant_apotek")
    .update({ status: newStatus })
    .eq("id", branchId);

  if (error) {
    return { error: `Gagal mengubah status cabang: ${error.message}` };
  }

  revalidatePath("/bba/branches");
  revalidatePath("/bba/audit");
  return { success: true, message: `Cabang berhasil di-${newStatus === "active" ? 'aktifkan' : 'nonaktifkan'}!` };
}

/**
 * Hard-reset semua data operasional milik sebuah apotek trial.
 * Konfigurasi (memberships, addon_settings, master_shifts, payroll_configs, dll.) tetap utuh.
 * Hanya bisa dipanggil pada apotek yang is_trial = true.
 */
export async function resetTrialBranchAction(branchId: string) {
  const gate = await assertGlobalBbaPortalManager();
  if (!gate.ok) return { error: gate.error };

  if (!branchId) return { error: "ID cabang tidak valid." };

  const supabaseAdmin = createAdminClient();

  // Safety check: pastikan ini benar-benar apotek trial
  const { data: branch } = await supabaseAdmin
    .from("tenant_apotek")
    .select("id, name, is_trial")
    .eq("id", branchId)
    .maybeSingle();

  if (!branch) return { error: "Cabang tidak ditemukan." };
  if (!branch.is_trial) return { error: "Reset hanya bisa dilakukan pada apotek trial." };

  // Tabel operasional yang dihapus (urutan: parent dulu, CASCADE handle child-nya)
  // KEEP: tenant_apotek, tenant_memberships, addon_settings, master_shifts,
  //       master_products, payroll_configs, tenant_kpi_policies, employee_profiles,
  //       crew_shift_defaults, staff_invitations
  const operationalTables = [
    "daily_submissions",        // CASCADE: daily_submission_products, submission_verifications, submission_assignments
    "monthly_audits",           // CASCADE: monthly_crew_audits, monthly_audit_state_events
    "monthly_appraisals",       // CASCADE: monthly_appraisal_publish_events, monthly_addon_appraisals
    "announcements",            // CASCADE: announcement_receipts, announcement_targets, announcement_audit_logs
    "tasks",                    // CASCADE: task_approvals
    "payroll_periods",          // CASCADE: payroll_unlock_events
    "payroll_items",
    "attendance_logs",
    "leave_requests",
    "shift_swap_requests",
    "peer_reviews",
    "minus_points",
    "leaderboard_snapshots",
    "candidates",
    "workforce_requests",
    "export_jobs",
    "activity_logs",
    "kpi_configs",
  ] as const;

  const errors: string[] = [];

  for (const table of operationalTables) {
    const { error } = await supabaseAdmin
      .from(table)
      .delete()
      .eq("tenant_apotek_id", branchId);

    if (error) {
      // Log tapi jangan hentikan proses — mungkin kolom FK-nya berbeda
      console.error(`reset [${table}] failed:`, error.message);
      errors.push(table);
    }
  }

  // Re-seed KPI bulan berjalan dengan nilai 0 (supaya dashboard tidak error)
  const now = new Date();
  const supabase = await createClient();
  const { data: { user: actor } } = await supabase.auth.getUser();
  await supabaseAdmin.from("kpi_configs").insert({
    tenant_apotek_id: branchId,
    period_month: now.getMonth() + 1,
    period_year: now.getFullYear(),
    target_omzet: 0,
    target_atv: 0,
    target_atu: 0,
    created_by_user_id: actor?.id ?? null,
  }).then(r => {
    if (r.error) console.error("kpi_configs re-seed failed:", r.error.message);
  });

  revalidatePath("/bba/branches");
  revalidatePath("/bba/audit");

  if (errors.length > 0) {
    return {
      success: true,
      message: `Data berhasil direset. Beberapa tabel tidak dapat dibersihkan: ${errors.join(", ")}`,
    };
  }

  return { success: true, message: `Data operasional ${branch.name} berhasil direset.` };
}
