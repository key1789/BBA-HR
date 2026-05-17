"use client";

import { useEffect, useMemo, useState, useActionState, startTransition } from "react";
import { Copy, Loader2, ChevronRight, Users, User, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { GlassCard } from "@/components/shared/glass-card";
import { GlobalTargetSection } from "@/components/kpi-v2/schemes/GlobalTargetSection";
import { TeamMonthlyScheme } from "@/components/kpi-v2/schemes/TeamMonthlyScheme";
import { TeamDailyScheme } from "@/components/kpi-v2/schemes/TeamDailyScheme";
import { IndividualMonthlyScheme } from "@/components/kpi-v2/schemes/IndividualMonthlyScheme";
import { IndividualDailyScheme } from "@/components/kpi-v2/schemes/IndividualDailyScheme";
import { saveKpiV2Action, getPreviousKpiV2Action } from "@/actions/kpi-v2-actions";
import { validateManualTargetDistribution, validateKpiV2Config } from "@/lib/kpi-v2/utils";
import type { IndividualSchemeConfig, KpiConfigV2, KpiGlobalConfig, TeamSchemeConfig } from "@/lib/types/kpi-v2";
import { isBranchOperationalPersonnel } from "@/lib/branch-personnel";
import { SimulasiBonus } from "@/components/kpi-v2/SimulasiBonus";

export interface TabKpiV2Props {
  branchId: string;
  currentMonth: number;
  currentYear: number;
  users: Array<{
    id: string;
    user_id: string;
    role: string;
    app_users: { full_name: string; is_branch_desk_account?: boolean | null } | null;
  }>;
  initialConfig: KpiConfigV2;
  /** Default true. Set false untuk tampilan hanya-baca (mis. owner portal). */
  canEditKpi?: boolean;
}

function withDerivedActiveSchemes(c: KpiConfigV2): KpiConfigV2 {
  const active_schemes: KpiConfigV2["active_schemes"] = [];
  if (c.team_monthly.enabled) active_schemes.push("team_monthly");
  if (c.team_daily.enabled) active_schemes.push("team_daily");
  if (c.individual_monthly.enabled) active_schemes.push("individual_monthly");
  if (c.individual_daily.enabled) active_schemes.push("individual_daily");
  return { ...c, active_schemes };
}

function TabKpiV2({ branchId, currentMonth, currentYear, users, initialConfig, canEditKpi = true }: TabKpiV2Props) {
  const [config, setConfig] = useState<KpiConfigV2>(initialConfig);
  const [isCopying, setIsCopying] = useState(false);
  const [saveState, saveFormAction, isSavePending] = useActionState(saveKpiV2Action, undefined);

  const isDirty = JSON.stringify(config) !== JSON.stringify(initialConfig);

  const activeUsers = useMemo(
    () => users.filter((u) => isBranchOperationalPersonnel(u)),
    [users],
  );

  const schemeActiveUsers = useMemo(
    () =>
      activeUsers.map((u) => ({
        id: u.id,
        app_users: { full_name: u.app_users?.full_name?.trim() ?? "" },
      })),
    [activeUsers],
  );

  const simulasiUsers = useMemo(
    () => schemeActiveUsers.map((u) => ({ id: u.id, name: u.app_users.full_name })),
    [schemeActiveUsers],
  );

  useEffect(() => {
    queueMicrotask(() => setConfig(initialConfig));
  }, [initialConfig]);

  useEffect(() => {
    if (saveState === undefined) return;
    if ("error" in saveState && saveState.error) {
      toast.error(saveState.error);
      return;
    }
    if ("success" in saveState && saveState.success) {
      toast.success(saveState.message ?? "Konfigurasi tersimpan.");
    }
  }, [saveState]);

  const handleGlobalChange = (newGlobal: KpiGlobalConfig) => {
    setConfig((prev) => ({ ...prev, global: newGlobal }));
  };

  const handleTeamMonthlyChange = (newConfig: TeamSchemeConfig) => {
    setConfig((prev) => ({ ...prev, team_monthly: newConfig }));
  };

  const handleTeamDailyChange = (newConfig: TeamSchemeConfig) => {
    setConfig((prev) => ({ ...prev, team_daily: newConfig }));
  };

  const handleIndividualMonthlyChange = (newConfig: IndividualSchemeConfig) => {
    setConfig((prev) => ({ ...prev, individual_monthly: newConfig }));
  };

  const handleIndividualDailyChange = (newConfig: IndividualSchemeConfig) => {
    setConfig((prev) => ({ ...prev, individual_daily: newConfig }));
  };

  const handleCopyPrevious = async () => {
    if (!canEditKpi) return;
    setIsCopying(true);
    const toastId = toast.loading("Mencari data bulan sebelumnya...");
    const result = await getPreviousKpiV2Action(branchId, currentMonth, currentYear);

    if (result.error) {
      toast.error(result.error, { id: toastId });
    } else if (result.data) {
      setConfig(result.data);
      toast.success("Berhasil menyalin data bulan sebelumnya!", { id: toastId });
    }
    setIsCopying(false);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canEditKpi) return;

    const payload = withDerivedActiveSchemes(config);

    const fullValidation = validateKpiV2Config(payload);
    if (!fullValidation.isValid) {
      fullValidation.errors.forEach((err) => toast.error(err.message));
      return;
    }
    fullValidation.warnings.forEach((w) => toast.warning(w.message));

    if (
      payload.individual_monthly.enabled &&
      payload.individual_monthly.target_distribution === "manual"
    ) {
      const validation = validateManualTargetDistribution(
        payload.global.target_omzet,
        payload.individual_monthly.user_configs,
        activeUsers.map((u) => u.id),
      );
      if (!validation.isValid) {
        toast.error(validation.errors[0]?.message ?? "Validasi distribusi target gagal.");
        return;
      }
    }

    if (payload.individual_daily.enabled && payload.individual_daily.target_distribution === "manual") {
      const validation = validateManualTargetDistribution(
        payload.global.target_omzet,
        payload.individual_daily.user_configs,
        activeUsers.map((u) => u.id),
      );
      if (!validation.isValid) {
        toast.error(validation.errors[0]?.message ?? "Validasi distribusi target gagal.");
        return;
      }
    }

    const formData = new FormData(e.currentTarget);
    formData.set("configV2", JSON.stringify(payload));

    startTransition(() => {
      saveFormAction(formData);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight leading-none">
            Target & KPI Cabang
          </h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1.5">
            Konfigurasi target performa & skema bonus periode ini
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopyPrevious}
          disabled={isCopying || !canEditKpi}
          className="group flex items-center gap-3 px-5 py-2.5 bg-white hover:bg-slate-900 text-slate-600 hover:text-white border border-slate-200 hover:border-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all duration-500 hover:shadow-xl hover:shadow-slate-200 hover:-translate-y-0.5 disabled:opacity-50"
        >
          <div
            className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-500 ${
              isCopying
                ? "bg-sky-100 text-sky-600"
                : "bg-slate-50 text-slate-400 group-hover:bg-sky-500 group-hover:text-white group-hover:rotate-12"
            }`}
          >
            {isCopying ? <Loader2 size={14} className="animate-spin" /> : <Copy size={12} />}
          </div>
          Salin Data Bulan Lalu
        </button>
      </div>

      <GlassCard
        variant="light"
        className="p-0 overflow-visible bg-white/80 backdrop-blur-xl border-slate-200/60 shadow-xl shadow-slate-200/50"
      >
        <form onSubmit={handleSubmit} className={!canEditKpi ? "pointer-events-none opacity-60" : undefined}>
          <input type="hidden" name="tenantId" value={branchId} />
          <input type="hidden" name="month" value={currentMonth} />
          <input type="hidden" name="year" value={currentYear} />
          <input type="hidden" name="configV2" value={JSON.stringify(withDerivedActiveSchemes(config))} />

          <div className="p-6 space-y-8">
            <GlobalTargetSection config={config.global} onChange={canEditKpi ? handleGlobalChange : () => {}} />

            <div className="pt-8 border-t border-slate-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-sm">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 uppercase tracking-tight">Skema Bonus Team</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    Bonus berdasarkan performa kolektif
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <TeamMonthlyScheme
                  config={config.team_monthly}
                  globalConfig={config.global}
                  onChange={canEditKpi ? handleTeamMonthlyChange : () => {}}
                />
                <TeamDailyScheme
                  config={config.team_daily}
                  globalConfig={config.global}
                  onChange={canEditKpi ? handleTeamDailyChange : () => {}}
                />
              </div>
            </div>

            <div className="pt-8 border-t border-slate-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm">
                  <User size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 uppercase tracking-tight">Skema Bonus Individu</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    Bonus berdasarkan performa personal
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <IndividualMonthlyScheme
                  config={config.individual_monthly}
                  globalConfig={config.global}
                  activeUsers={schemeActiveUsers}
                  onChange={canEditKpi ? handleIndividualMonthlyChange : () => {}}
                />
                <IndividualDailyScheme
                  config={config.individual_daily}
                  globalConfig={config.global}
                  activeUsers={schemeActiveUsers}
                  onChange={canEditKpi ? handleIndividualDailyChange : () => {}}
                />
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6 bg-slate-50/50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto justify-center sm:justify-start">
              <div className="flex items-center gap-2 text-slate-500">
                <ChevronRight size={16} />
                <span className="text-[10px] font-black uppercase tracking-widest">Konfigurasi KPI</span>
              </div>
              {isDirty && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-lg text-[9px] font-black uppercase tracking-widest">
                  <AlertCircle size={10} /> Belum Disimpan
                </span>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <SimulasiBonus config={withDerivedActiveSchemes(config)} users={simulasiUsers} />
              <button
                type="submit"
                disabled={isSavePending || !canEditKpi}
                className="w-full sm:w-auto px-8 py-3.5 sm:py-3 rounded-2xl font-black text-sm text-white bg-sky-600 hover:bg-sky-700 shadow-xl shadow-sky-600/30 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSavePending ? <Loader2 size={18} className="animate-spin" /> : "Simpan Konfigurasi KPI"}
              </button>
            </div>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}

export { TabKpiV2 };
