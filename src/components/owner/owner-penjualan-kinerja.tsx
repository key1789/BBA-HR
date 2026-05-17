import { GlassCard } from "@/components/shared/glass-card";
import { CustomLineChart } from "@/components/dashboard/custom-line-chart";
import { BbaDashboardLeaderboard } from "@/app/bba/dashboard/bba-dashboard-leaderboard";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, TrendingUp } from "lucide-react";
import type { OwnerPenjualanSnapshot } from "@/lib/owner-dashboard-data";

export function OwnerPenjualanKinerja({ snapshot }: { snapshot: OwnerPenjualanSnapshot }) {
  const currencyFormatter = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  });
  const numberFormatter = new Intl.NumberFormat("id-ID");
  const { periodEnd, periodLabel, dailySeries, kpis, capaianPct, proratedTargetOmzet, mtdDays, avgTargetAtv, avgTargetAtu, leaderboardRows } =
    snapshot;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <GlassCard>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Omzet (s.d. {periodEnd})</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{currencyFormatter.format(kpis.omzet)}</p>
          <p className="text-[10px] text-slate-500 mt-1 font-bold">
            vs target prorata {currencyFormatter.format(Math.round(proratedTargetOmzet))}
          </p>
        </GlassCard>
        <GlassCard>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Capaian prorata</p>
          <p className="mt-1 text-2xl font-black text-amber-600">{capaianPct}%</p>
          <p className="text-[10px] text-slate-500 mt-1 font-bold">{mtdDays} hari dalam bulan</p>
        </GlassCard>
        <GlassCard>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ATV aktual</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{currencyFormatter.format(kpis.atv)}</p>
          <p className="text-[10px] text-slate-500 mt-1 font-bold">
            Target avg {avgTargetAtv > 0 ? currencyFormatter.format(avgTargetAtv) : "—"}
          </p>
        </GlassCard>
        <GlassCard>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ATU aktual</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{kpis.atu.toFixed(2)}</p>
          <p className="text-[10px] text-slate-500 mt-1 font-bold">
            Target avg {avgTargetAtu > 0 ? avgTargetAtu.toFixed(2) : "—"}
          </p>
        </GlassCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2 !p-0 overflow-hidden border-amber-100/50">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <TrendingUp size={16} className="text-amber-600" />
              Omzet harian — {periodLabel}
            </h2>
          </div>
          <div className="p-4">
            <CustomLineChart points={dailySeries} />
          </div>
        </GlassCard>
        <GlassCard>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pelanggan hilang</p>
          <p className="mt-2 text-3xl font-black text-amber-700">{numberFormatter.format(kpis.lostCustomers)}</p>
          <p className="text-xs text-slate-500 mt-2">
            Akumulasi penolakan / pelanggan tidak jadi beli pada submission terverifikasi di periode ini.
          </p>
        </GlassCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BbaDashboardLeaderboard
          periodLabel={`${periodLabel} (s.d. ${periodEnd})`}
          rows={leaderboardRows}
          currencyFormatter={currencyFormatter}
        />
        <GlassCard className="!p-0 overflow-hidden border-amber-100/50">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Riwayat omzet harian</h2>
          </div>
          <div className="max-h-[420px] overflow-y-auto overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest z-10">
                <tr>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Omzet</th>
                  <th className="px-4 py-3">Δ harian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...dailySeries].reverse().map((row, idx, arr) => {
                  const prev = arr[idx + 1];
                  const delta = prev ? row.amount - prev.amount : 0;
                  return (
                    <tr key={row.dateKey} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2 font-bold text-slate-700">{row.dateKey}</td>
                      <td className="px-4 py-2 font-bold text-slate-900">{currencyFormatter.format(row.amount)}</td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[10px] font-black uppercase",
                            delta >= 0 ? "text-emerald-600" : "text-rose-600",
                          )}
                        >
                          {delta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
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
    </div>
  );
}
