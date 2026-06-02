"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/auth-context";
import { revalidatePath } from "next/cache";

type PayrollConfigInput = {
  tenantId: string;
  userId: string;
  baseSalary: number;
  positionAllowance: number;
  mealAllowance: number;
  transportAllowance: number;
  bpjsDeduction: number;
  customAdjustments: { name: string; amount: number; type: "addition" | "deduction" }[];
};

/** Verify payroll addon is enabled and the given flag is set for this tenant. */
async function checkPayrollAccess(
  tenantId: string,
  flagKey: "allow_admin_input" | "allow_owner_input",
): Promise<boolean> {
  const supabaseAdmin = createAdminClient();
  const { data } = await supabaseAdmin
    .from("addon_settings")
    .select("is_enabled, settings")
    .eq("tenant_apotek_id", tenantId)
    .eq("addon_key", "payroll")
    .maybeSingle();

  if (!data?.is_enabled) return false;
  return Boolean((data.settings as Record<string, unknown>)?.[flagKey]);
}

function parsePayrollFormData(formData: FormData): PayrollConfigInput {
  const tenantId   = formData.get("tenantId")  as string;
  const userId     = formData.get("userId")    as string;
  const customAdjStr = formData.get("customAdjustments") as string;
  return {
    tenantId,
    userId,
    baseSalary:          parseFloat(formData.get("baseSalary")          as string) || 0,
    positionAllowance:   parseFloat(formData.get("positionAllowance")   as string) || 0,
    mealAllowance:       parseFloat(formData.get("mealAllowance")       as string) || 0,
    transportAllowance:  parseFloat(formData.get("transportAllowance")  as string) || 0,
    bpjsDeduction:       parseFloat(formData.get("bpjsDeduction")       as string) || 0,
    customAdjustments:   customAdjStr ? JSON.parse(customAdjStr) : [],
  };
}

// ─── Admin Apotek ─────────────────────────────────────────────────────────────

export async function savePayrollConfigByAdminAction(prevState: unknown, formData: FormData) {
  const session = await getSessionContext();
  const active  = session?.activeMembership;

  if (!active || active.role !== "admin_apotek") {
    return { error: "Akses ditolak." };
  }

  const input = parsePayrollFormData(formData);

  // Verify the userId belongs to THIS tenant (prevent cross-tenant edit)
  if (input.tenantId !== active.tenantId) {
    return { error: "Akses ditolak — apotek tidak sesuai." };
  }

  const allowed = await checkPayrollAccess(active.tenantId, "allow_admin_input");
  if (!allowed) {
    return { error: "Fitur ini belum diaktifkan oleh BBA untuk apotek ini." };
  }

  const supabaseAdmin = createAdminClient();

  // Verify the target user is an active crew member of this tenant
  const { data: membership } = await supabaseAdmin
    .from("tenant_memberships")
    .select("user_id")
    .eq("tenant_apotek_id", active.tenantId)
    .eq("user_id", input.userId)
    .eq("is_active", true)
    .eq("role", "crew")
    .maybeSingle();

  if (!membership) {
    return { error: "Karyawan tidak ditemukan di apotek ini." };
  }

  const { error } = await supabaseAdmin
    .from("payroll_configs")
    .upsert(
      {
        tenant_apotek_id:    active.tenantId,
        user_id:             input.userId,
        base_salary:         input.baseSalary,
        position_allowance:  input.positionAllowance,
        meal_allowance:      input.mealAllowance,
        transport_allowance: input.transportAllowance,
        bpjs_deduction:      input.bpjsDeduction,
        custom_adjustments:  input.customAdjustments,
        updated_at:          new Date().toISOString(),
      },
      { onConflict: "tenant_apotek_id,user_id" },
    );

  if (error) {
    console.error("savePayrollConfigByAdminAction:", error);
    return { error: "Gagal menyimpan konfigurasi gaji." };
  }

  revalidatePath("/admin/konfigurasi-gaji");
  return { success: true, message: "Konfigurasi gaji berhasil disimpan." };
}

// ─── Owner ────────────────────────────────────────────────────────────────────

export async function savePayrollConfigByOwnerAction(prevState: unknown, formData: FormData) {
  const session = await getSessionContext();
  const active  = session?.activeMembership;

  if (!active || active.role !== "owner") {
    return { error: "Akses ditolak." };
  }

  const input = parsePayrollFormData(formData);

  // Verify the tenantId is one of this owner's tenants
  const ownerTenantIds = (session.memberships ?? [])
    .filter((m) => m.role === "owner")
    .map((m) => m.tenantId);

  if (!ownerTenantIds.includes(input.tenantId)) {
    return { error: "Akses ditolak — apotek tidak sesuai." };
  }

  const allowed = await checkPayrollAccess(input.tenantId, "allow_owner_input");
  if (!allowed) {
    return { error: "Fitur ini belum diaktifkan oleh BBA untuk apotek ini." };
  }

  const supabaseAdmin = createAdminClient();

  // Verify the target user is an active crew member of this tenant
  const { data: membership } = await supabaseAdmin
    .from("tenant_memberships")
    .select("user_id")
    .eq("tenant_apotek_id", input.tenantId)
    .eq("user_id", input.userId)
    .eq("is_active", true)
    .eq("role", "crew")
    .maybeSingle();

  if (!membership) {
    return { error: "Karyawan tidak ditemukan di apotek ini." };
  }

  const { error } = await supabaseAdmin
    .from("payroll_configs")
    .upsert(
      {
        tenant_apotek_id:    input.tenantId,
        user_id:             input.userId,
        base_salary:         input.baseSalary,
        position_allowance:  input.positionAllowance,
        meal_allowance:      input.mealAllowance,
        transport_allowance: input.transportAllowance,
        bpjs_deduction:      input.bpjsDeduction,
        custom_adjustments:  input.customAdjustments,
        updated_at:          new Date().toISOString(),
      },
      { onConflict: "tenant_apotek_id,user_id" },
    );

  if (error) {
    console.error("savePayrollConfigByOwnerAction:", error);
    return { error: "Gagal menyimpan konfigurasi gaji." };
  }

  revalidatePath("/owner/karyawan");
  return { success: true, message: "Konfigurasi gaji berhasil disimpan." };
}
