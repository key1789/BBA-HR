import { getSessionContext } from "@/lib/auth-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { AnimatedPage } from "@/components/shared/animated-page";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
import { Banknote, Lock } from "lucide-react";
import { AdminPayrollConfigClient, type CrewPayrollRow } from "./admin-payroll-config-client";
import { savePayrollConfigByAdminAction } from "@/actions/payroll-config";

export const dynamic = "force-dynamic";

export default async function AdminKonfigurasiGajiPage() {
  const session = await getSessionContext();
  const active = session?.activeMembership;

  if (!active || active.role !== "admin_apotek") {
    redirect("/admin/dashboard");
  }

  const tenantId = active.tenantId;
  const supabase = createAdminClient();

  // Check payroll addon + allow_admin_input flag
  const { data: addonRow } = await supabase
    .from("addon_settings")
    .select("is_enabled, settings")
    .eq("tenant_apotek_id", tenantId)
    .eq("addon_key", "payroll")
    .maybeSingle();

  const addonEnabled = Boolean(addonRow?.is_enabled);
  const allowAdminInput = Boolean(
    (addonRow?.settings as Record<string, unknown> | null)?.allow_admin_input,
  );

  if (!addonEnabled || !allowAdminInput) {
    return (
      <AnimatedPage className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-slate-100 flex items-center justify-center">
          <Lock size={28} className="text-slate-400" />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-800">Fitur Belum Aktif</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-xs mx-auto">
            {!addonEnabled
              ? "Modul Payroll belum diaktifkan oleh BBA untuk apotek ini."
              : "BBA belum mengizinkan Admin untuk mengelola konfigurasi gaji."}
          </p>
        </div>
      </AnimatedPage>
    );
  }

  // Fetch active crew members
  const { data: memberships } = await supabase
    .from("tenant_memberships")
    .select("user_id")
    .eq("tenant_apotek_id", tenantId)
    .eq("role", "crew")
    .eq("is_active", true);

  const crewIds = (memberships ?? []).map((m) => m.user_id);

  // Fetch crew names
  const { data: users } = crewIds.length
    ? await supabase.from("app_users").select("id, full_name").in("id", crewIds)
    : { data: [] };

  const nameMap = new Map((users ?? []).map((u) => [u.id, u.full_name ?? "—"]));

  // Fetch existing payroll configs
  const { data: configs } = crewIds.length
    ? await supabase
        .from("payroll_configs")
        .select(
          "user_id, base_salary, position_allowance, meal_allowance, transport_allowance, bpjs_deduction, custom_adjustments",
        )
        .eq("tenant_apotek_id", tenantId)
        .in("user_id", crewIds)
    : { data: [] };

  const configMap = new Map((configs ?? []).map((c) => [c.user_id, c]));

  const BPJS_IDS = ["__bpjs_kes_k__", "__bpjs_tk_k__", "__bpjs_kes_p__", "__bpjs_tk_p__"];

  const crew: CrewPayrollRow[] = crewIds.map((uid) => {
    const cfg = configMap.get(uid);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allAdj: any[] = Array.isArray(cfg?.custom_adjustments) ? cfg.custom_adjustments : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bpjsItems: any[] = allAdj.filter((a: any) => BPJS_IDS.includes(a.id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const normalItems = allAdj.filter((a: any) => !BPJS_IDS.includes(a.id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getBpjs = (id: string): number => bpjsItems.find((a: any) => a.id === id)?.amount ?? 0;
    const legacyBpjs = Number(cfg?.bpjs_deduction ?? 0);
    const bpjsKesKaryawan = bpjsItems.length === 0 && legacyBpjs > 0 ? legacyBpjs : getBpjs("__bpjs_kes_k__");
    const bpjsTkKaryawan  = bpjsItems.length === 0 ? 0 : getBpjs("__bpjs_tk_k__");
    return {
      userId: uid,
      name: nameMap.get(uid) ?? "—",
      baseSalary: Number(cfg?.base_salary ?? 0),
      positionAllowance: Number(cfg?.position_allowance ?? 0),
      mealAllowance: Number(cfg?.meal_allowance ?? 0),
      transportAllowance: Number(cfg?.transport_allowance ?? 0),
      bpjsKesKaryawan,
      bpjsTkKaryawan,
      bpjsKesPerusahaan: getBpjs("__bpjs_kes_p__"),
      bpjsTkPerusahaan:  getBpjs("__bpjs_tk_p__"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customAdjustments: normalItems.map((a: any) => ({
        name:   String(a.name ?? ""),
        amount: Number(a.amount ?? 0),
        type:   (a.type === "deduction" ? "deduction" : "addition") as "addition" | "deduction",
      })),
    };
  });

  // Sort: unconfigured first, then by name
  crew.sort((a, b) => {
    const aConf = a.baseSalary > 0 ? 1 : 0;
    const bConf = b.baseSalary > 0 ? 1 : 0;
    if (aConf !== bConf) return aConf - bConf;
    return a.name.localeCompare(b.name, "id");
  });

  const reminderWindow = getOperationalReminderWindow();

  return (
    <AnimatedPage>
      <div className="space-y-4 pb-10">
        {/* ── Hero card ── */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-600 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
              <Banknote size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Setup Gaji</h1>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {active.tenantName} · {reminderWindow.dateKey}
              </p>
            </div>
          </div>
        </div>

        <AdminPayrollConfigClient
          tenantId={tenantId}
          crew={crew}
          saveAction={savePayrollConfigByAdminAction}
        />
      </div>
    </AnimatedPage>
  );
}
