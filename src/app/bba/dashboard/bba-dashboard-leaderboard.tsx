import { GlassCard } from "@/components/shared/glass-card";
import { Trophy } from "lucide-react";

export type LeaderboardRow = {
  userId: string;
  name: string;
  omzet: number;
};

export function BbaDashboardLeaderboard({
  periodLabel,
  rows,
  currencyFormatter,
}: {
  periodLabel: string;
  rows: LeaderboardRow[];
  currencyFormatter: Intl.NumberFormat;
}) {
  return (
    <GlassCard className="border-indigo-100/50">
      <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
        <Trophy size={16} className="text-amber-500" />
        Leaderboard omzet
        <span className="font-bold text-slate-400 normal-case">· {periodLabel}</span>
      </h2>
      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada data omzet terverifikasi untuk periode ini.</p>
        ) : (
          rows.map((item, index) => (
            <div
              key={item.userId}
              className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100"
            >
              <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center font-black text-xs text-indigo-600 border border-indigo-50 shrink-0">
                #{index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-slate-800 truncate">{item.name}</p>
                <p className="text-[10px] font-bold text-emerald-600">{currencyFormatter.format(item.omzet)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </GlassCard>
  );
}
