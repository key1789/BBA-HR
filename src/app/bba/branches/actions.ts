"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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

  // 1. Insert tenant_apotek (add-on lewat addon_settings; alamat/WA kolom dari migrasi 0021)
  const { data: newBranch, error: branchError } = await supabaseAdmin
    .from("tenant_apotek")
    .insert({
      name,
      code,
      status: "active",
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
    return {
      success: true,
      message:
        "Apotek berhasil didaftarkan (profil, add-on & KPI dasar OK). Shift standar gagal dibuat — tambahkan dari tab Shift & Roster atau jalankan migrasi database terbaru.",
    };
  }

  revalidatePath("/bba/branches");
  return {
    success: true,
    message:
      "Apotek berhasil didaftarkan. Profil, KPI bulan ini, baris add-on, dan shift Pagi/Siang standar sudah siap — lanjutkan dari tab Overview cabang.",
  };
}

export async function toggleBranchStatusAction(formData: FormData) {
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
  return { success: true, message: `Cabang berhasil di-${newStatus === "active" ? 'aktifkan' : 'nonaktifkan'}!` };
}
