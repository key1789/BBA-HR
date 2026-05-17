"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ClipboardCheck, Lock, TrendingUp, AlertCircle,
  Trophy, Star, Wallet, Award, BarChart2,
} from "lucide-react";

const IDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("id-ID");
const pct = (n: number) => `${n.toFixed(1)}%`;

const MONTHS_ID = [
  "", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const MEDAL = [
  { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-600",  ring: "ring-amber-300",  emoji: "🥇" },
  { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-500",  ring: "ring-slate-300",  emoji: "🥈" },
  { bg: "bg-orange-50",border: "border-orange-200",text: "text-orange-600", ring: "ring-orange-300", emoji: "🥉" },
];

type Snapshot = { omzet: number; atv: number; atu: number; sarpPct: number; lateFlag: number };
type CrewAudit = { analyst_score: number | null; analyst_feedback: string | null; internal_review_score: number | null; customer_review_score: number | null };
type LeaderboardRow = { userId: string; name: string; omzet: number; atv: number; atu: number; sarpPct: number; lateFlag: number };

type Props = {
  month: number;
  year: number;
  periodOptions: { month: number; year: number; label: string }[];
  initialTab: string;
  isPublished: boolean;
  publishedAt: string | null;
  totalBonus: number | null;
  autoBonus: number | null;
  addonManual: number | null;
  bbaAdj: number | null;
  calcBreakdown: any;
  approvedCount: number;
  approvedOmzet: number;
  mySnapshot: Snapshot | null;
  crewAudit: CrewAudit | null;
  peerRatingAvg: number | null;
  peerReviewCount: number;
  addonReviewInternal: boolean;
  addonReviewPelanggan: boolean;
  thpData: any;
  teamLeaderboard: LeaderboardRow[];
  currentUserId: string;
};

export function CrewRaporClient(props: Props) {
  const [tab, setTab] = useState<"rapor" | "peringkat">(
    props.initialTab === "peringkat" ? "peringkat" : "rapor",
  );
  const { month, year, periodOptions } = props;
  const router = useRouter();

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="bg-white rounded-3xl p-5 shadow-md border border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sky-600 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
            <ClipboardCheck size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Rapor Bulanan</h1>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Skor &amp; Bonus Kamu</p>
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-slate-100 rounded-2xl p-1 gap-1">
        {(["rapor", "peringkat"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all",
              tab === t ? "bg-white text-sky-700 shadow-sm" : "text-slate-500 hover:text-slate-700",
            )}
          >
            {t === "rapor" ? <ClipboardCheck size={14} /> : <Trophy size={14} />}
            {t === "rapor" ? "Rapor Saya" : "Peringkat Tim"}
          </button>
        ))}
      </div>

      {/* Period selector */}
      <select
        value={`${year}-${month}`}
        onChange={(e) => {
          const [y, m] = e.target.value.split("-");
          router.push(`/crew/rapor?month=${m}&year=${y}&tab=${tab}`);
        }}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all"
      >
        {periodOptions.map((opt) => (
          <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
            {opt.label}
          </option>
        ))}
      </select>

      {tab === "rapor"
        ? <RaporTab {...props} />
        : <PeringkatTab {...props} />
      }
    </div>
  );
}

/* ─────────────────────────── TAB: RAPOR SAYA ─────────────────────────── */

function RaporTab(props: Props) {
  const {
    month, year, isPublished, publishedAt, totalBonus,
    autoBonus, addonManual, bbaAdj, calcBreakdown,
    approvedCount, mySnapshot,
    crewAudit, peerRatingAvg, peerReviewCount,
    addonReviewInternal, addonReviewPelanggan,
    thpData,
  } = props;

  const hasBonus   = totalBonus !== null;
  const hasSnapshot= mySnapshot !== null;
  const hasAnything= hasBonus || hasSnapshot;
  const perUser    = (calcBreakdown as any)?.perUserBonus ?? null;
  const showReview = addonReviewInternal || addonReviewPelanggan || peerRatingAvg !== null;

  if (!hasAnything) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm text-center space-y-3">
        <div className="w-14 h-14 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto">
          <AlertCircle size={28} className="text-slate-400" />
        </div>
        <p className="font-black text-slate-700 uppercase text-sm">Belum ada data</p>
        <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
          Rapor {MONTHS_ID[month]} {year} belum tersedia. Pastikan sudah ada input yang disetujui pada periode ini.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Status banner */}
      {isPublished ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <ClipboardCheck size={15} className="shrink-0 text-emerald-600" />
          <p className="text-[11px] font-bold text-emerald-800 flex-1">
            Rapor <span className="font-black">{MONTHS_ID[month]} {year}</span> sudah final
            {publishedAt
              ? ` · ${new Date(publishedAt).toLocaleDateString("id-ID", { day: "numeric", month: "long" })}`
              : ""}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Lock size={15} className="shrink-0 text-amber-600" />
          <p className="text-[11px] font-bold text-amber-800">
            Estimasi — belum final, angka bisa berubah setelah diverifikasi admin
          </p>
        </div>
      )}

      {/* Hero: Total Bonus */}
      {hasBonus ? (
        <div className="bg-slate-950 rounded-3xl px-5 py-5 shadow-xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Bonus</p>
          <p className={cn("text-3xl font-black tracking-tight", isPublished ? "text-white" : "text-amber-400")}>
            {IDR.format(totalBonus!)}
          </p>
          {!isPublished && (
            <p className="text-[9px] font-bold text-slate-500 mt-1">Estimasi sementara</p>
          )}
        </div>
      ) : (
        <div className="bg-slate-900 rounded-3xl px-5 py-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Bonus</p>
          <p className="text-base font-black text-slate-500">Belum dikalkulasi</p>
          <p className="text-[9px] font-bold text-slate-600 mt-1">Admin belum menjalankan kalkulasi bonus untuk periode ini</p>
        </div>
      )}

      {/* Performa & Capaian */}
      {mySnapshot && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <SectionHeader icon={<BarChart2 size={14} className="text-sky-600" />} label="Performa & Capaian" />
          <div className="p-4 grid grid-cols-2 gap-3">
            <StatChip label="Omzet" value={IDR.format(mySnapshot.omzet)} />
            <StatChip label="ATV" value={IDR.format(mySnapshot.atv)} />
            <StatChip label="ATU" value={mySnapshot.atu.toFixed(2)} />
            <StatChip
              label="SARP"
              value={pct(mySnapshot.sarpPct)}
              color={mySnapshot.sarpPct >= 80 ? "emerald" : mySnapshot.sarpPct >= 50 ? "amber" : "rose"}
            />
            <StatChip label="Input Approved" value={`${NUM.format(approvedCount)} hari`} />
            <StatChip
              label="Late Flag"
              value={`${NUM.format(mySnapshot.lateFlag)}×`}
              color={mySnapshot.lateFlag > 0 ? "rose" : undefined}
            />
          </div>
        </div>
      )}

      {/* Breakdown Bonus — hanya kalau bonus sudah dikalkulasi */}
      {hasBonus && <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <SectionHeader icon={<Award size={14} className="text-amber-500" />} label="Breakdown Bonus" />
        <div className="divide-y divide-slate-100">

          <LineItem label="Bonus KPI Otomatis" value={IDR.format(autoBonus ?? 0)} bold />

          {perUser && (
            <>
              {Number(perUser.teamMonthlyBonus      ?? 0) > 0 && <LineItem label="— Tim (bulanan)"         value={IDR.format(Number(perUser.teamMonthlyBonus))}       indent />}
              {Number(perUser.teamDailyBonus        ?? 0) > 0 && <LineItem label="— Tim (harian)"          value={IDR.format(Number(perUser.teamDailyBonus))}         indent />}
              {Number(perUser.individualMonthlyBonus?? 0) > 0 && <LineItem label="— Individu (bulanan)"    value={IDR.format(Number(perUser.individualMonthlyBonus))} indent />}
              {Number(perUser.individualDailyBonus  ?? 0) > 0 && <LineItem label="— Individu (harian)"     value={IDR.format(Number(perUser.individualDailyBonus))}   indent />}
            </>
          )}

          {(addonManual ?? 0) !== 0 && (
            <LineItem
              label="Bonus Tambahan"
              value={IDR.format(addonManual ?? 0)}
              bold
              color={(addonManual ?? 0) >= 0 ? "emerald" : "rose"}
            />
          )}
          {(bbaAdj ?? 0) !== 0 && (
            <LineItem
              label="Penyesuaian BBA"
              value={IDR.format(bbaAdj ?? 0)}
              bold
              color={(bbaAdj ?? 0) >= 0 ? "emerald" : "rose"}
            />
          )}

          {/* Total footer */}
          <div className="px-5 py-4 flex items-center justify-between bg-slate-950 rounded-b-3xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Bonus</p>
            <p className="text-base font-black text-white">{IDR.format(totalBonus!)}</p>
          </div>
        </div>
      </div>}

      {/* Review & Penilaian */}
      {showReview && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <SectionHeader icon={<Star size={14} className="text-amber-500" />} label="Review & Penilaian" />
          <div className="p-4 space-y-4">

            {addonReviewInternal && crewAudit?.internal_review_score != null && (
              <ReviewRow
                label="Review Internal"
                score={Number(crewAudit.internal_review_score)}
                dotColor="bg-amber-400"
              />
            )}

            {addonReviewPelanggan && crewAudit?.customer_review_score != null && (
              <ReviewRow
                label="Review Pelanggan"
                score={Number(crewAudit.customer_review_score)}
                dotColor="bg-sky-400"
              />
            )}

            {peerRatingAvg !== null && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Peer Review</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{peerReviewCount} reviewer</p>
                </div>
                <p className="text-xl font-black text-slate-900">
                  {peerRatingAvg.toFixed(1)}
                  <span className="text-sm font-bold text-slate-400"> /5</span>
                </p>
              </div>
            )}

            {crewAudit?.analyst_feedback && (
              <div className="bg-slate-50 rounded-2xl p-3.5">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Catatan Analis</p>
                <p className="text-[11px] text-slate-700 leading-relaxed">{crewAudit.analyst_feedback}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* THP Rapor — hanya kalau ada bonus dan payroll_config */}
      {hasBonus && thpData && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <SectionHeader icon={<Wallet size={14} className="text-emerald-600" />} label="THP Rapor" />
          <div className="divide-y divide-slate-100">

            {thpData.base > 0            && <LineItem label="Gaji Pokok"             value={IDR.format(thpData.base)}          bold />}
            {thpData.posAllowance > 0    && <LineItem label="+ Tunjangan Jabatan"    value={IDR.format(thpData.posAllowance)}   indent />}
            {thpData.mealAllowance > 0   && <LineItem label="+ Tunjangan Makan"      value={IDR.format(thpData.mealAllowance)}  indent />}
            {thpData.transAllowance > 0  && <LineItem label="+ Tunjangan Transport"  value={IDR.format(thpData.transAllowance)} indent />}

            {thpData.bonus !== 0 && <LineItem label="Total Bonus" value={IDR.format(thpData.bonus)} bold color="emerald" />}

            {(thpData.customAdj as any[]).map((adj: any, i: number) => (
              <LineItem
                key={i}
                label={`${adj.type === "addition" ? "+" : "−"} ${adj.name}`}
                value={IDR.format(Number(adj.amount ?? 0))}
                indent
                color={adj.type === "addition" ? undefined : "rose"}
              />
            ))}

            {thpData.bpjsTotal > 0 && (
              <LineItem label="− Potongan BPJS" value={IDR.format(thpData.bpjsTotal)} bold color="rose" />
            )}

            {/* THP footer */}
            <div className="px-5 py-4 flex items-center justify-between bg-emerald-600 rounded-b-3xl">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100">Take Home Pay</p>
              <p className="text-lg font-black text-white">{IDR.format(thpData.netPay)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Kalau tidak ada THP config tapi bonus sudah final */}
      {hasBonus && isPublished && !thpData && (
        <p className="text-center text-[10px] text-slate-400 font-medium">
          THP belum dikonfigurasi oleh admin untuk akun ini.
        </p>
      )}

    </div>
  );
}

/* ─────────────────────────── TAB: PERINGKAT TIM ─────────────────────────── */

function PeringkatTab(props: Props) {
  const { teamLeaderboard, currentUserId, month, year } = props;

  if (teamLeaderboard.length === 0) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm text-center space-y-3">
        <div className="w-14 h-14 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto">
          <Trophy size={28} className="text-slate-400" />
        </div>
        <p className="font-black text-slate-700 uppercase text-sm">Belum ada data</p>
        <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
          Leaderboard {MONTHS_ID[month]} {year} belum tersedia.
        </p>
      </div>
    );
  }

  const podium = teamLeaderboard.slice(0, 3);
  const rest   = teamLeaderboard.slice(3);
  const myRank = teamLeaderboard.findIndex(r => r.userId === currentUserId) + 1;

  return (
    <div className="space-y-4">

      {/* Posisi saya */}
      {myRank > 0 && (
        <div className="flex items-center gap-3 bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3">
          <Trophy size={15} className="text-sky-600 shrink-0" />
          <p className="text-[11px] font-bold text-sky-800">
            Posisi kamu: <span className="font-black">#{myRank}</span> dari {teamLeaderboard.length} crew
          </p>
        </div>
      )}

      {/* Top 3 podium */}
      <div className="space-y-2">
        {podium.map((item, idx) => {
          const m    = MEDAL[idx]!;
          const isMe = item.userId === currentUserId;
          return (
            <div
              key={item.userId}
              className={cn(
                "flex items-center gap-3 p-3.5 rounded-2xl border transition-all",
                m.bg, m.border,
                isMe && "ring-2 ring-sky-400 ring-offset-1",
              )}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0">
                {m.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-slate-800 truncate">
                  {item.name}
                  {isMe && <span className="ml-1.5 text-[9px] font-black text-sky-600 bg-sky-100 px-1.5 py-0.5 rounded-md">KAMU</span>}
                </p>
                <p className={cn("text-[10px] font-black mt-0.5", m.text)}>
                  {IDR.format(item.omzet)}
                </p>
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                <p className="text-[9px] font-black text-slate-400 uppercase">SARP</p>
                <p className={cn("text-xs font-black", m.text)}>{pct(item.sarpPct)}</p>
                {item.lateFlag > 0 && (
                  <p className="text-[9px] font-bold text-rose-400">{item.lateFlag}× late</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sisa list */}
      {rest.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
          {rest.map((item, idx) => {
            const isMe = item.userId === currentUserId;
            return (
              <div
                key={item.userId}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 transition-colors",
                  isMe ? "bg-sky-50" : "hover:bg-slate-50",
                )}
              >
                <span className="text-[11px] font-black text-slate-300 w-5 text-center shrink-0">
                  {idx + 4}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-xs font-black truncate", isMe ? "text-sky-700" : "text-slate-700")}>
                    {item.name}
                    {isMe && <span className="ml-1.5 text-[9px] font-black text-sky-600 bg-sky-100 px-1.5 py-0.5 rounded-md">KAMU</span>}
                  </p>
                  <p className="text-[9px] text-slate-400 font-bold mt-0.5">
                    SARP {pct(item.sarpPct)} · ATV {IDR.format(item.atv)} · Late {item.lateFlag}×
                  </p>
                </div>
                <p className="text-[10px] font-black text-emerald-600 shrink-0">
                  {IDR.format(item.omzet)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-[10px] text-slate-400 font-medium">
        Diurutkan berdasarkan omzet tertinggi · Data dari snapshot terakhir
      </p>
    </div>
  );
}

/* ─────────────────────────── SHARED UI ATOMS ─────────────────────────── */

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
      {icon}
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
    </div>
  );
}

function StatChip({
  label, value, color,
}: {
  label: string;
  value: string;
  color?: "emerald" | "amber" | "rose";
}) {
  const bg  = color === "emerald" ? "bg-emerald-50" : color === "amber" ? "bg-amber-50" : color === "rose" ? "bg-rose-50" : "bg-slate-50";
  const txt = color === "emerald" ? "text-emerald-700" : color === "amber" ? "text-amber-700" : color === "rose" ? "text-rose-700" : "text-slate-900";
  return (
    <div className={cn("rounded-2xl p-3", bg)}>
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className={cn("text-sm font-black mt-0.5 leading-tight", txt)}>{value}</p>
    </div>
  );
}

function LineItem({
  label, value, bold, indent, color,
}: {
  label: string;
  value: string;
  bold?: boolean;
  indent?: boolean;
  color?: "emerald" | "rose";
}) {
  return (
    <div className={cn(
      "px-5 py-3 flex items-center justify-between",
      indent && "bg-slate-50/60",
    )}>
      <p className={cn(
        indent ? "text-[10px] text-slate-500 pl-3" : "text-[11px] text-slate-700",
        bold && !indent && "font-black",
        !bold && "font-medium",
      )}>
        {label}
      </p>
      <p className={cn(
        bold ? "font-black" : "font-bold",
        indent ? "text-[10px] text-slate-600" : "text-[11px]",
        color === "emerald" && "text-emerald-700",
        color === "rose"    && "text-rose-600",
        !color && "text-slate-900",
      )}>
        {value}
      </p>
    </div>
  );
}

function ReviewRow({
  label, score, dotColor,
}: {
  label: string;
  score: number;
  dotColor: string;
}) {
  const maxScore  = 5;
  const filled    = Math.round(Math.min(maxScore, Math.max(0, score)));
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
        <div className="flex items-center gap-1 mt-1.5">
          {Array.from({ length: maxScore }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "w-5 h-2 rounded-full transition-all",
                i < filled ? dotColor : "bg-slate-100",
              )}
            />
          ))}
        </div>
      </div>
      <p className="text-xl font-black text-slate-900">
        {score.toFixed(1)}
        <span className="text-sm font-bold text-slate-400"> /5</span>
      </p>
    </div>
  );
}
