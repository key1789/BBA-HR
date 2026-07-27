import { AnimatedPage } from "@/components/shared/animated-page";
import { OwnerPortalShell } from "@/components/owner/owner-portal-shell";
import { getOwnerPortalContext } from "@/app/owner/_lib/owner-portal-context";
import { Building2, Lock } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { GlassCard } from "@/components/shared/glass-card";
import { JadwalManager } from "@/components/branch/tab-jadwal/JadwalManager";

export const dynamic = "force-dynamic";

export default async function OwnerJadwalPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; tenant?: string }>;
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
  const { month, year } = ctx;
  const supabaseAdmin = createAdminClient();

  const { data: addonRow } = await supabaseAdmin
    .from("addon_settings")
    .select("is_enabled, settings")
    .eq("tenant_apotek_id", tenantId)
    .eq("addon_key", "absensi_shift")
    .maybeSingle();

  const addonEnabled = Boolean(addonRow?.is_enabled);
  const allowOwnerSchedule =
    addonEnabled &&
    Boolean((addonRow?.settings as Record<string, unknown> | null)?.allow_owner_schedule);

  // Data pengelolaan jadwal — hanya di-fetch bila owner diberi izin.
  let scheduleData:
    | { users: unknown[]; shifts: unknown[]; roster: unknown[]; shiftDefaults: unknown[] }
    | null = null;
  if (allowOwnerSchedule) {
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const monthStart = `${year}-${pad2(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${year}-${pad2(month)}-${pad2(lastDay)}`;
    const [usersRes, shiftsRes, rosterRes, defaultsRes] = await Promise.all([
      supabaseAdmin
        .from("tenant_memberships")
        .select(
          "id, role, is_active, user_id, app_users (id, full_name, email, phone, is_active, is_branch_desk_account)",
        )
        .eq("tenant_apotek_id", tenantId)
        .order("assigned_at", { ascending: false }),
      supabaseAdmin
        .from("master_shifts")
        .select("*")
        .eq("tenant_apotek_id", tenantId)
        .order("start_time", { ascending: true }),
      supabaseAdmin
        .from("shift_schedules")
        .select("*")
        .eq("tenant_apotek_id", tenantId)
        .gte("schedule_date", monthStart)
        .lte("schedule_date", monthEnd)
        .order("schedule_date", { ascending: true }),
      supabaseAdmin
        .from("crew_shift_defaults")
        .select("*")
        .eq("tenant_apotek_id", tenantId),
    ]);
    scheduleData = {
      users: usersRes.data ?? [],
      shifts: shiftsRes.data ?? [],
      roster: rosterRes.data ?? [],
      shiftDefaults: defaultsRes.data ?? [],
    };
  }

  return (
    <AnimatedPage>
      <OwnerPortalShell
        ctx={ctx}
        basePath="/owner/jadwal"
        title="KELOLA JADWAL"
        subtitle={`Pola mingguan & roster ${ctx.activeOwnerMembership.tenantName}`}
      >
        {scheduleData ? (
          <JadwalManager
            branchId={tenantId}
            users={scheduleData.users}
            shifts={scheduleData.shifts}
            roster={scheduleData.roster}
            shiftDefaults={scheduleData.shiftDefaults}
            currentMonth={month}
            currentYear={year}
          />
        ) : (
          <GlassCard className="border-slate-100/50">
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                <Lock size={20} className="text-slate-400" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-700">Akses Belum Diizinkan</p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  {addonEnabled
                    ? "Apotrik belum mengizinkan Owner untuk mengatur jadwal cabang ini."
                    : "Fitur Jadwal & Absensi belum aktif untuk cabang ini."}
                </p>
              </div>
            </div>
          </GlassCard>
        )}
      </OwnerPortalShell>
    </AnimatedPage>
  );
}
