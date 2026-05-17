import { GlassCard } from "@/components/shared/glass-card";
import { Trophy } from "lucide-react";

export type LeaderboardRow = {
  userId: string;
  name: string;
  omzet: number;
};

const MEDAL = [
  { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-600", emoji: "🥇" },
  { bg: "bg-slate-50",  border: "border-slate-200", text: "text-slate-500", emoji: "🥈" },
  { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-600", emoji: "🥉" },
];

export function BbaDashboardLeaderboard({
  periodLabel,
  rows,
  currencyFormatter,
}: {
  periodLabel: string;
  rows: LeaderboardRow[];
  currencyFormatter: Intl.NumberFormat;
}) {
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <GlassCard className="border-indigo-100/50 !p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
        <Trophy size={14} className="text-amber-500 shrink-0" />
        <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">
          Leaderboard omzet
        </span>
        <span className="ml-auto text-[10px] font-bold text-slate-400">{periodLabel}</span>
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-xs text-slate-400">Belum ada data omzet terverifikasi untuk periode ini.</p>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {/* Podium top 3 */}
          {podium.length > 0 && (
            <div className="space-y-2">
              {podium.map((item, index) => {
                const m = MEDAL[index]!;
                return (
                  <div
                    key={item.userId}
                    className={`flex items-center gap-3 p-3 rounded-2xl border ${m.bg} ${m.border}`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0`}>
                      {m.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-slate-800 truncate">{item.name}</p>
                      <p className={`text-[10px] font-black ${m.text}`}>
                        {currencyFormatter.format(item.omzet)}
                      </p>
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-wide ${m.text} shrink-0`}>
                      #{index + 1}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Rest of the list */}
          {rest.length > 0 && (
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
              {rest.map((item, index) => (
                <div
                  key={item.userId}
                  className="flex items-center gap-3 px-3 py-2.5 bg-white hover:bg-slate-50 transition-colors"
                >
                  <span className="text-[10px] font-black text-slate-300 w-5 text-center shrink-0">
                    {index + 4}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black text-slate-700 truncate">{item.name}</p>
                  </div>
                  <p className="text-[10px] font-bold text-emerald-600 shrink-0">
                    {currencyFormatter.format(item.omzet)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}
