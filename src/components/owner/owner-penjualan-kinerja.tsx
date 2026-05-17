import { GlassCard } from "@/components/shared/glass-card";
import { CustomLineChart } from "@/components/dashboard/custom-line-chart";
import { BbaDashboardLeaderboard } from "@/app/bba/dashboard/bba-dashboard-leaderboard";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, TrendingUp } from "lucide-react";
import Link from "next/link";
import type { OwnerPenjualanSnapshot } from "@/lib/owner-dashboard-data";

export function OwnerPenjualanKinerja({
  snapshot,
  auditHref,
}: {
  snapshot: OwnerPenjualanSnapshot;
  auditHref?: string;
}) {
  const currencyFormatter = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  });
  const numberFormatter = new Intl.NumberFormat("id-ID");
  const {
    periodEnd,
    periodLabel,
    dailySeries,
    kpis,
    capaianPct,
    proratedTargetOmzet,
    mtdDays,
    avgTargetAtv,
    avgTargetAtu,
    leaderboardRows,
  } = snapshot;

  return (
    <div className="space-y-5">
      {/* ── Hero omzet card ── */}
      <GlassCard className="border-amber-100/50">
        <div className="flex flex-wrap gap-6 items-start">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              Total omzet · s.d. {periodEnd}
            </p>
            <p className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight leading-none">
              {currencyFormatter.format(kpis.omzet)}
            </p>
            <p className="text-[10px] font-bold text-slate-400 mt-2">
              Target prorata {currencyFormatter.format(Math.round(proratedTargetOmzet))} · {mtdDays} hari
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Capaian</p>
            <p
              className={cn(
                "text-3xl md:text-4xl font-black tracking-tight leading-none",
                capaianPct >= 100
                  ? "text-emerald-600"
                  : capaianPct >= 75
                    ? "text-amber-600"
                    : "text-rose-600",
              )}
            >
              {capaianPct}%
            </p>
          </div>
        </div>
        <div className="mt-4 h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              capaianPct >= 100 ? "bg-emerald-500" : capaianPct >= 75 ? "bg-amber-500" : "bg-rose-500",
            )}
            style={{ width: `${Math.min(100, capaianPct)}%` }}
          />
        </div>
      </GlassCard>

      {/* ── Secondary KPIs ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <GlassCard className="!py-4">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">ATV aktual</p>
          <p className="mt-1 text-xl font-black text-slate-900">{currencyFormatter.format(kpis.atv)}</p>
          <p className="text-[9px] font-bold text-slate-400 mt-1">
            Target {avgTargetAtv > 0 ? currencyFormatter.format(avgTargetAtv) : "—"}
          </p>
        </GlassCard>
        <GlassCard className="!py-4">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">ATU aktual</p>
          <p className="mt-1 text-xl font-black text-slate-900">{kpis.atu.toFixed(2)}</p>
          <p className="text-[9px] font-bold text-slate-400 mt-1">
            Target {avgTargetAtu > 0 ? avgTargetAtu.toFixed(2) : "—"}
          </p>
        </GlassCard>
        <GlassCard className="!py-4">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pelanggan hilang</p>
          <p className="mt-1 text-xl font-black text-amber-700">
            {numberFormatter.format(kpis.lostCustomers)}
          </p>
          {auditHref && (
            <Link
              href={auditHref}
              className="text-[9px] font-black uppercase tracking-widest text-amber-600 hover:underline mt-1 inline-block"
            >
              Detail →
            </Link>
          )}
        </GlassCard>
      </div>

      {/* ── Chart + Leaderboard ── */}
      <div className="grid gap-4 lg:grid-cols-5">
        <GlassCard className="lg:col-span-3 !p-0 overflow-hidden border-amber-100/50">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <TrendingUp size={14} className="text-amber-600 shrink-0" />
            <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
              Omzet harian — {periodLabel}
            </h2>
          </div>
          <div className="p-4">
            <CustomLineChart points={dailySeries} />
          </div>
        </GlassCard>

        <div className="lg:col-span-2">
          <BbaDashboardLeaderboard
            periodLabel={`s.d. ${periodEnd}`}
            rows={leaderboardRows}
            currencyFormatter={currencyFormatter}
          />
        </div>
      </div>

      {/* ── Daily history table ── */}
      <GlassCard className="!p-0 overflow-hidden border-amber-100/50">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
            Riwayat omzet harian
          </h2>
        </div>
        <div className="max-h-80 overflow-y-auto overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="sticky top-0 bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest z-10">
              <tr>
                <th className="px-5 py-3">Tanggal</th>
                <th className="px-5 py-3">Omzet</th>
                <th className="px-5 py-3">Δ harian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...dailySeries].reverse().map((row, idx, arr) => {
                const prev = arr[idx + 1];
                const delta = prev ? row.amount - prev.amount : 0;
                return (
                  <tr key={row.dateKey} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-2.5 text-xs font-bold text-slate-600">{row.dateKey}</td>
                    <td className="px-5 py-2.5 text-xs font-bold text-slate-900">
                      {currencyFormatter.format(row.amount)}
                    </td>
                    <td className="px-5 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-[10px] font-black",
                          delta >= 0 ? "text-emerald-600" : "text-rose-600",
                        )}
                      >
                        {delta >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                        {currencyFormatter.format(Math.abs(delta))}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
