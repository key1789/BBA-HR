import { AnimatedPage } from "@/components/shared/animated-page";
import { OwnerPortalShell } from "@/components/owner/owner-portal-shell";
import { getOwnerPortalContext } from "@/app/owner/_lib/owner-portal-context";
import { Building2, Lock, Wallet } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { PayrollConfigClient, type CrewPayrollRow } from "@/app/admin/konfigurasi-gaji/payroll-config-client";
import { savePayrollConfigByOwnerAction } from "@/actions/payroll-config";
import { GlassCard } from "@/components/shared/glass-card";

export const dynamic = "force-dynamic";

export default async function OwnerKaryawanPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    year?: string;
    tenant?: string;
  }>;
}) {
  const params = await searchParams;
  const ctxResult = await getOwnerPortalContext(params);

  if (!ctxResult.ok) {
    if (ctxResult.reason === "no_owner") {
      return (
        <AnimatedPage className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="h-16 w-16 text-slate-300 mb-4" />
          <h1 className="text-xl font-black text-slate-800 uppercase">Belum ada cabang</h1>
          <p className="text-slate-500 mt-2">Akun Anda belum ditugaskan sebagai owner apotek manapun.</p>
        </AnimatedPage>
      );
    }
    return <p className="text-sm text-slate-600">Halaman ini khusus owner.</p>;
  }

  const { data: ctx } = ctxResult;
  const tenantId = ctx.activeOwnerMembership.tenantId;
  const supabaseAdmin = createAdminClient();

  // Check addon + permission
  const { data: addonRow } = await supabaseAdmin
    .from("addon_settings")
    .select("is_enabled, settings")
    .eq("tenant_apotek_id", tenantId)
    .eq("addon_key", "payroll")
    .maybeSingle();

  const addonEnabled = Boolean(addonRow?.is_enabled);
  const allowOwnerInput = Boolean(
    (addonRow?.settings as Record<string, unknown> | null)?.allow_owner_input,
  );
  const canManageSalary = addonEnabled && allowOwnerInput;

  // Fetch crew configs only when permitted
  let crew: CrewPayrollRow[] = [];

  const BPJS_IDS = ["__bpjs_kes_k__", "__bpjs_tk_k__", "__bpjs_kes_p__", "__bpjs_tk_p__"];

  if (canManageSalary) {
    const { data: memberships } = await supabaseAdmin
      .from("tenant_memberships")
      .select("user_id")
      .eq("tenant_apotek_id", tenantId)
      .eq("role", "crew")
      .eq("is_active", true);

    const crewIds = (memberships ?? []).map((m) => m.user_id as string);

    if (crewIds.length > 0) {
      const [usersRes, configsRes] = await Promise.all([
        supabaseAdmin.from("app_users").select("id, full_name").in("id", crewIds),
        supabaseAdmin
          .from("payroll_configs")
          .select(
            "user_id, base_salary, position_allowance, meal_allowance, transport_allowance, bpjs_deduction, custom_adjustments",
          )
          .eq("tenant_apotek_id", tenantId)
          .in("user_id", crewIds),
      ]);

      const nameMap = new Map(
        (usersRes.data ?? []).map((u) => [u.id, u.full_name ?? "—"]),
      );
      const configMap = new Map(
        (configsRes.data ?? []).map((c) => [c.user_id, c]),
      );

      crew = crewIds.map((uid) => {
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
        // Legacy migration: old single bpjs_deduction → kes_karyawan
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

      crew.sort((a, b) => {
        const aConf = a.baseSalary > 0 ? 1 : 0;
        const bConf = b.baseSalary > 0 ? 1 : 0;
        if (aConf !== bConf) return aConf - bConf;
        return a.name.localeCompare(b.name, "id");
      });
    }
  }

  return (
    <AnimatedPage>
      <OwnerPortalShell
        ctx={ctx}
        basePath="/owner/karyawan"
        title="SETUP GAJI"
        subtitle={`Konfigurasi komponen gaji karyawan ${ctx.activeOwnerMembership.tenantName}`}
      >
        <GlassCard className="border-slate-100/50">
          <div className="flex items-center gap-2 mb-5">
            <Wallet size={14} className="text-sky-600 shrink-0" />
            <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
              Konfigurasi Gaji Karyawan
            </h2>
          </div>

          {canManageSalary ? (
            <PayrollConfigClient
              tenantId={tenantId}
              crew={crew}
              saveAction={savePayrollConfigByOwnerAction}
              portalLabel="Owner"
            />
          ) : addonEnabled && !allowOwnerInput ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                <Lock size={20} className="text-slate-400" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-700">Akses Belum Diizinkan</p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  BBA belum mengizinkan Owner untuk mengelola konfigurasi gaji cabang ini.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                <Wallet size={20} className="text-slate-400" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-700">Fitur Payroll Belum Aktif</p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  Modul payroll belum diaktifkan untuk cabang ini. Hubungi BBA untuk mengaktifkannya.
                </p>
              </div>
            </div>
          )}
        </GlassCard>
      </OwnerPortalShell>
    </AnimatedPage>
  );
}
