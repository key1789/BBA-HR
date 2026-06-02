"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ClipboardCheck, Lock, AlertCircle,
  Star, Wallet, Award, BarChart2, Zap,
  Package, History, TrendingUp, Receipt,
  CalendarDays, BadgeMinus, BadgePlus,
  Clock, Umbrella, ShieldCheck,
} from "lucide-react";
import { HelpDrawer } from "@/components/shared/help-drawer";
import { RAPOR_HELP } from "./help-content";
import { CustomBarChart, buildMonthlyBars } from "@/components/dashboard/custom-bar-chart";

const IDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("id-ID");
const pct = (n: number) => `${n.toFixed(1)}%`;

const MONTHS_ID = [
  "", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

type Snapshot        = { omzet: number; atv: number; atu: number; sarpPct: number; lateFlag: number };
type RunningPersonal = { omzet: number; trx: number; prod: number; days: number; atv: number; atu: number };
type CrewAudit       = { analyst_score: number | null; analyst_feedback: string | null; internal_review_score: number | null; customer_review_score: number | null };
type ProdukFokusItem = { productId: string; productName: string; sold: number; target: number; progressPct: number; bonusType: string; bonusValue: number; bonusStep: number; bonusEarned: number };
type HistoriItem     = { month: number; year: number; omzet: number | null; bonus: number | null; isPublished: boolean };

type AbsensiData = { hadir: number; telat: number; izin: number };

type Props = {
  month: number;
  year: number;
  periodOptions: { month: number; year: number; label: string }[];
  initialTab: string;
  // Bonus snapshot
  isPublished: boolean;
  publishedAt: string | null;
  totalBonus: number | null;
  autoBonus: number | null;
  addonManual: number | null;
  bbaAdj: number | null;
  calcBreakdown: any;
  approvedCount: number;
  // Performa snapshot
  mySnapshot: Snapshot | null;
  // Running
  runningPersonal: RunningPersonal | null;
  personalTarget: number | null;
  teamTarget: number | null;
  // Operasional tambahan
  pelangganTertolak: number;
  perkiraanOmzetTertolak: number;
  kontribusiPct: number | null;
  absensi: AbsensiData;
  // Evaluasi
  crewAudit: CrewAudit | null;
  peerRatingAvg: number | null;
  peerReviewCount: number;
  addonReviewInternal: boolean;
  addonReviewPelanggan: boolean;
  // THP
  thpData: any;
  // Histori & Produk fokus
  histori: HistoriItem[];
  produkFokus: ProdukFokusItem[];
  addonProdukFokus: boolean;
  // Live estimate flag
  isLiveEstimate: boolean;
};

export function CrewRaporClient(props: Props) {
  const [tab, setTab] = useState<"penilaian" | "rapor">(
    props.initialTab === "rapor" ? "rapor" : "penilaian",
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

      <HelpDrawer content={RAPOR_HELP} />

      {/* Tab switcher */}
      <div className="flex bg-white border border-slate-100 rounded-2xl p-1 shadow-sm gap-1">
        {([
          { key: "penilaian", label: "Penilaian", icon: <BarChart2 size={14} /> },
          { key: "rapor",     label: "Rapor & Payroll", icon: <Wallet size={14} /> },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 min-h-[44px] py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all",
              tab === t.key ? "bg-sky-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Period selector */}
      <div className="relative">
        <select
          value={`${year}-${month}`}
          onChange={(e) => {
            const [y, m] = e.target.value.split("-");
            router.push(`/crew/rapor?month=${m}&year=${y}&tab=${tab}`);
          }}
          className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-400/20 transition-all"
        >
          {periodOptions.map((opt) => (
            <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {tab === "penilaian"
        ? <PenilaianTab {...props} />
        : <RaporPayrollTab {...props} />
      }
    </div>
  );
}

/* ─────────────────────────── TAB: PENILAIAN ─────────────────────────── */

function PenilaianTab(props: Props) {
  const {
    month, year, isPublished, publishedAt,
    mySnapshot, runningPersonal, personalTarget, teamTarget,
    approvedCount,
    pelangganTertolak, perkiraanOmzetTertolak, kontribusiPct, absensi,
    crewAudit, peerRatingAvg, peerReviewCount,
    addonReviewInternal, addonReviewPelanggan,
    totalBonus, autoBonus, addonManual, bbaAdj,
    produkFokus, addonProdukFokus,
    isLiveEstimate,
  } = props;

  const hasSnapshot  = mySnapshot !== null;
  const hasRunning   = runningPersonal !== null;
  const hasPerforma  = hasSnapshot || hasRunning;
  const showReview   = addonReviewInternal || addonReviewPelanggan || peerRatingAvg !== null
    || crewAudit?.analyst_score != null || crewAudit?.analyst_feedback;
  const hasAnything  = hasPerforma || showReview;

  const useSnapshot   = hasSnapshot;
  const perfOmzet     = useSnapshot ? mySnapshot!.omzet : (runningPersonal?.omzet ?? 0);
  const perfAtv       = useSnapshot ? mySnapshot!.atv   : (runningPersonal?.atv   ?? 0);
  const perfAtu       = useSnapshot ? mySnapshot!.atu   : (runningPersonal?.atu   ?? 0);
  const perfDays      = useSnapshot ? approvedCount      : (runningPersonal?.days  ?? 0);
  const perfTrx       = runningPersonal?.trx  ?? 0;
  const perfProd      = runningPersonal?.prod ?? 0;
  const perfIsRunning = !useSnapshot && hasRunning;

  const target      = personalTarget ?? teamTarget;
  const capaianPct  = target && target > 0 ? Math.min(150, (perfOmzet / target) * 100) : null;
  const capaianColor =
    capaianPct == null   ? "sky"
    : capaianPct >= 100  ? "emerald"
    : capaianPct >= 75   ? "sky"
    : capaianPct >= 50   ? "amber"
    : "rose";

  const hasBonus = totalBonus !== null;

  if (!hasAnything) {
    return (
      <EmptyState
        title="Belum ada data penilaian"
        desc={`Penilaian ${MONTHS_ID[month]} ${year} belum tersedia. Pastikan sudah ada input yang disetujui pada periode ini.`}
        icon={<BarChart2 size={28} className="text-slate-400" />}
      />
    );
  }

  return (
    <div className="space-y-4">

      {/* Status banner */}
      <StatusBanner isPublished={isPublished} publishedAt={publishedAt} month={month} year={year} />

      {/* ── Hero: Target vs Capaian ── */}
      {hasPerforma && target != null && target > 0 && (
        <div className={cn(
          "rounded-3xl overflow-hidden shadow-sm border bg-white",
          capaianColor === "emerald" ? "border-emerald-200"
          : capaianColor === "sky"   ? "border-sky-200"
          : capaianColor === "amber" ? "border-amber-200"
          : "border-rose-200",
        )}>
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center gap-2 mb-4">
              <Zap size={13} className={cn(
                capaianColor === "emerald" ? "text-emerald-500"
                : capaianColor === "sky"   ? "text-sky-500"
                : capaianColor === "amber" ? "text-amber-500"
                : "text-rose-500",
              )} />
              <p className={cn(
                "text-[9px] font-black uppercase tracking-widest",
                capaianColor === "emerald" ? "text-emerald-600"
                : capaianColor === "sky"   ? "text-sky-600"
                : capaianColor === "amber" ? "text-amber-600"
                : "text-rose-600",
              )}>
                Target Individu Bulanan{perfIsRunning && " · Berjalan"}
              </p>
            </div>

            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
              Omzet {perfIsRunning ? "Berjalan" : "Bulan Ini"}
            </p>
            <p className="text-3xl font-black text-slate-900 leading-none mb-1">{IDR.format(perfOmzet)}</p>
            <p className="text-[10px] font-bold text-slate-400">dari {IDR.format(target)}</p>

            <div className="mt-4 h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  capaianColor === "emerald" ? "bg-emerald-500"
                  : capaianColor === "sky"   ? "bg-sky-500"
                  : capaianColor === "amber" ? "bg-amber-500"
                  : "bg-rose-500",
                )}
                style={{ width: `${Math.min(100, capaianPct ?? 0)}%` }}
              />
            </div>

            <div className="flex items-center justify-between mt-2">
              <p className={cn(
                "text-2xl font-black leading-none",
                capaianColor === "emerald" ? "text-emerald-600"
                : capaianColor === "sky"   ? "text-sky-600"
                : capaianColor === "amber" ? "text-amber-600"
                : "text-rose-600",
              )}>
                {capaianPct != null ? `${capaianPct.toFixed(1)}%` : "—"}
              </p>
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-400">{perfDays} hari input approved</p>
                {kontribusiPct != null && (
                  <p className="text-[9px] font-bold text-slate-400 mt-0.5">
                    Kontribusi tim: {kontribusiPct.toFixed(1)}%
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Blok KPI: Metrik Performa ── */}
      {hasPerforma && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp size={14} className="text-sky-600" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">KPI &amp; Operasional</p>
            </div>
            {perfIsRunning && (
              <span className="text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5">
                Berjalan
              </span>
            )}
          </div>

          {/* Blok KPI utama */}
          <div className="px-4 pt-3 pb-1">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Blok KPI Utama</p>
          </div>
          <div className="p-4 pt-2 grid grid-cols-2 gap-3">
            <StatChip label="Total Omzet" value={IDR.format(perfOmzet)} />
            {target != null && target > 0 && (
              <StatChip label="% Capaian KPI" value={capaianPct != null ? `${capaianPct.toFixed(1)}%` : "—"}
                color={capaianPct != null ? (capaianPct >= 100 ? "emerald" : capaianPct >= 75 ? undefined : capaianPct >= 50 ? "amber" : "rose") : undefined} />
            )}
            {kontribusiPct != null && (
              <StatChip label="Kontribusi Omzet" value={`${kontribusiPct.toFixed(1)}%`} />
            )}
            <StatChip label="Hari Approved" value={`${NUM.format(perfDays)} hari`} />
          </div>

          {/* Blok Operasional & Risiko */}
          <div className="px-4 pt-2 pb-1 border-t border-slate-100">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Operasional &amp; Risiko</p>
          </div>
          <div className="p-4 pt-2 grid grid-cols-2 gap-3">
            {perfTrx > 0 && <StatChip label="Total Nota"    value={NUM.format(perfTrx)} />}
            {perfProd > 0 && <StatChip label="Total Produk"  value={NUM.format(perfProd)} />}
            <StatChip label="ATV" value={IDR.format(perfAtv)} />
            <StatChip label="ATU" value={perfAtu.toFixed(2)} />
            {useSnapshot && mySnapshot ? (
              <StatChip
                label="SARP"
                value={pct(mySnapshot.sarpPct)}
                color={mySnapshot.sarpPct >= 100 ? "emerald" : mySnapshot.sarpPct >= 80 ? undefined : mySnapshot.sarpPct >= 50 ? "amber" : "rose"}
              />
            ) : null}
            {useSnapshot && mySnapshot && mySnapshot.lateFlag > 0 && (
              <StatChip label="Late Flag" value={`${NUM.format(mySnapshot.lateFlag)}×`} color="rose" />
            )}
          </div>

          {/* Pelanggan Tertolak */}
          {pelangganTertolak > 0 && (
            <div className="mx-4 mb-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
              <StatChip label="Pelanggan Tertolak" value={`${NUM.format(pelangganTertolak)} pelanggan`} color="rose" />
              <StatChip label="Est. Omzet Tertolak" value={IDR.format(perkiraanOmzetTertolak)} color="rose" />
            </div>
          )}

          {perfIsRunning && (
            <div className="mx-4 mb-4 flex items-start gap-2 rounded-2xl bg-amber-50 border border-amber-200 px-3 py-2.5">
              <AlertCircle size={12} className="shrink-0 text-amber-600 mt-0.5" />
              <p className="text-[9px] font-bold text-amber-700 leading-relaxed">
                Data berjalan dari input kamu — belum termasuk kalkulasi akhir admin
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Jadwal & Absensi ── */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <SectionHeader icon={<CalendarDays size={14} className="text-sky-500" />} label="Jadwal &amp; Absensi" />
        <div className="p-4 grid grid-cols-3 gap-3">
          <AbsensiChip label="Hadir" value={absensi.hadir} icon={<ShieldCheck size={14} className="text-emerald-500" />} color="emerald" />
          <AbsensiChip label="Telat" value={absensi.telat} icon={<Clock       size={14} className="text-amber-500"  />} color={absensi.telat > 0 ? "amber" : undefined} />
          <AbsensiChip label="Izin"  value={absensi.izin}  icon={<Umbrella    size={14} className="text-sky-500"   />} color="sky" />
        </div>
        {absensi.hadir === 0 && absensi.izin === 0 && (
          <p className="text-center text-[10px] text-slate-400 pb-4">
            Belum ada data kehadiran untuk periode ini
          </p>
        )}
      </div>

      {/* ── Evaluasi & Penilaian ── */}
      {showReview && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <SectionHeader icon={<Star size={14} className="text-amber-500" />} label="Evaluasi &amp; Penilaian" />
          <div className="p-4 space-y-5">

            {crewAudit?.analyst_score != null && (
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Skor Analis</p>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-4xl font-black text-slate-900 leading-none">{Number(crewAudit.analyst_score).toFixed(1)}</p>
                    <p className="text-[9px] font-bold text-slate-400 mt-1">dari 100</p>
                  </div>
                  <div className="w-24 h-2.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        Number(crewAudit.analyst_score) >= 80 ? "bg-emerald-500"
                        : Number(crewAudit.analyst_score) >= 60 ? "bg-sky-500"
                        : Number(crewAudit.analyst_score) >= 40 ? "bg-amber-500"
                        : "bg-rose-500",
                      )}
                      style={{ width: `${Math.min(100, Number(crewAudit.analyst_score))}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {addonReviewInternal && crewAudit?.internal_review_score != null && (
              <ReviewRow label="Review Internal" score={Number(crewAudit.internal_review_score)} dotColor="bg-amber-400" />
            )}

            {addonReviewPelanggan && crewAudit?.customer_review_score != null && (
              <ReviewRow label="Review Pelanggan" score={Number(crewAudit.customer_review_score)} dotColor="bg-sky-400" />
            )}

            {peerRatingAvg !== null && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Peer Review</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{peerReviewCount} reviewer</p>
                </div>
                <p className="text-xl font-black text-slate-900">
                  {peerRatingAvg.toFixed(1)}<span className="text-sm font-bold text-slate-400"> /5</span>
                </p>
              </div>
            )}

            {crewAudit?.analyst_feedback && (
              <div className="rounded-2xl bg-sky-50 border border-sky-100 p-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-sky-600 mb-2">Catatan Analis</p>
                <p className="text-[11px] text-slate-700 leading-relaxed">{crewAudit.analyst_feedback}</p>
              </div>
            )}

            {!crewAudit?.analyst_score && !crewAudit?.internal_review_score && !crewAudit?.customer_review_score && peerRatingAvg === null && !crewAudit?.analyst_feedback && (
              <p className="text-center text-[11px] text-slate-400 py-2">
                Evaluasi belum diisi oleh admin untuk periode ini.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Ringkasan Bonus Variabel ── */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award size={14} className="text-amber-500" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ringkasan Bonus Variabel</p>
          </div>
          {isLiveEstimate && (
            <span className="text-[8px] font-black text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5 uppercase tracking-wide">
              Estimasi Berjalan
            </span>
          )}
        </div>
        {hasBonus ? (
          <div className="divide-y divide-slate-100">
            <LineItem
              label={isLiveEstimate ? "Bonus KPI (estimasi)" : "Bonus KPI (auto)"}
              value={IDR.format(autoBonus ?? 0)}
              bold
            />
            {/* Live: tampilkan produk fokus jika ada bonus */}
            {isLiveEstimate && addonProdukFokus && produkFokus.some(p => p.bonusEarned > 0) && (
              <LineItem
                label="Bonus Produk Fokus (estimasi)"
                value={IDR.format(produkFokus.reduce((s, p) => s + p.bonusEarned, 0))}
                indent
              />
            )}
            {/* Appraisal: bonus tambahan & penyesuaian dari admin */}
            {(addonManual ?? 0) !== 0 && (
              <LineItem label="Bonus Tambahan"  value={IDR.format(addonManual ?? 0)} indent
                color={(addonManual ?? 0) < 0 ? "rose" : undefined} />
            )}
            {(bbaAdj ?? 0) !== 0 && (
              <LineItem label="Penyesuaian BBA" value={IDR.format(bbaAdj ?? 0)} indent
                color={(bbaAdj ?? 0) < 0 ? "rose" : undefined} />
            )}
            <div className="px-5 py-3 flex items-center justify-between bg-amber-50">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Total Bonus Variabel</p>
              <p className="text-sm font-black text-amber-700">{IDR.format(totalBonus!)}</p>
            </div>
            {isLiveEstimate && (
              <div className="px-5 py-2.5 flex items-start gap-2">
                <AlertCircle size={10} className="shrink-0 text-amber-500 mt-0.5" />
                <p className="text-[9px] font-bold text-amber-600 leading-relaxed">
                  Estimasi berjalan berdasarkan data input kamu — angka final ditetapkan oleh admin
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="px-5 py-5 flex flex-col items-center gap-2">
            <p className="text-sm font-black text-slate-400">—</p>
            <p className="text-[10px] text-slate-400 text-center">
              Admin belum menjalankan kalkulasi bonus untuk periode ini
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── TAB: RAPOR & PAYROLL ─────────────────────────── */

function RaporPayrollTab(props: Props) {
  const {
    month, year, isPublished, publishedAt,
    totalBonus, autoBonus, addonManual, bbaAdj, calcBreakdown,
    thpData, histori, produkFokus, addonProdukFokus,
    isLiveEstimate,
  } = props;

  const hasBonus = totalBonus !== null;
  const perUser  = (calcBreakdown as any)?.perUserBonus ?? null;

  return (
    <div className="space-y-4">

      {/* Status banner */}
      <StatusBanner isPublished={isPublished} publishedAt={publishedAt} month={month} year={year} />

      {/* ── Hero: Total Bonus ── */}
      {hasBonus ? (
        <div className="bg-slate-950 rounded-3xl px-5 py-5 shadow-xl">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Bonus</p>
            {isLiveEstimate && (
              <span className="text-[8px] font-black text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-2 py-0.5 uppercase tracking-wide">
                Estimasi Berjalan
              </span>
            )}
          </div>
          <p className={cn(
            "text-3xl font-black tracking-tight",
            isPublished    ? "text-white"
            : isLiveEstimate ? "text-amber-400"
            : "text-amber-400",
          )}>
            {IDR.format(totalBonus!)}
          </p>
          {isLiveEstimate ? (
            <p className="text-[9px] font-bold text-slate-500 mt-1">
              Dihitung dari data berjalan — belum final
            </p>
          ) : !isPublished ? (
            <p className="text-[9px] font-bold text-slate-500 mt-1">Estimasi sementara</p>
          ) : null}
        </div>
      ) : (
        <div className="bg-slate-900 rounded-3xl px-5 py-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Bonus</p>
          <p className="text-base font-black text-slate-500">Belum dikalkulasi</p>
          <p className="text-[9px] font-bold text-slate-600 mt-1">Admin belum menjalankan kalkulasi bonus untuk periode ini</p>
        </div>
      )}

      {/* ── Breakdown Bonus ── */}
      {hasBonus && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award size={14} className="text-amber-500" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {isLiveEstimate ? "Estimasi Breakdown Bonus" : "Breakdown Bonus"}
              </p>
            </div>
            {isLiveEstimate && (
              <span className="text-[8px] font-black text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5 uppercase tracking-wide">
                Berjalan
              </span>
            )}
          </div>
          <div className="divide-y divide-slate-100">
            <LineItem
              label={isLiveEstimate ? "Bonus KPI (estimasi)" : "Bonus KPI Otomatis"}
              value={IDR.format(autoBonus ?? 0)}
              bold
            />
            {perUser && (
              <>
                {Number(perUser.teamMonthlyBonus       ?? 0) > 0 && <LineItem label="— Tim (bulanan)"      value={IDR.format(Number(perUser.teamMonthlyBonus))}       indent />}
                {Number(perUser.teamDailyBonus         ?? 0) > 0 && <LineItem label="— Tim (harian)"       value={IDR.format(Number(perUser.teamDailyBonus))}         indent />}
                {Number(perUser.individualMonthlyBonus ?? 0) > 0 && <LineItem label="— Individu (bulanan)" value={IDR.format(Number(perUser.individualMonthlyBonus))} indent />}
                {Number(perUser.individualDailyBonus   ?? 0) > 0 && <LineItem label="— Individu (harian)"  value={IDR.format(Number(perUser.individualDailyBonus))}   indent />}
              </>
            )}
            {/* Live: produk fokus bonus */}
            {isLiveEstimate && addonProdukFokus && produkFokus.some(p => p.bonusEarned > 0) && (
              <LineItem
                label="Bonus Produk Fokus (estimasi)"
                value={IDR.format(produkFokus.reduce((s, p) => s + p.bonusEarned, 0))}
                bold
                color="emerald"
              />
            )}
            {/* Appraisal: bonus tambahan & penyesuaian */}
            {(addonManual ?? 0) !== 0 && (
              <LineItem label="Bonus Tambahan"  value={IDR.format(addonManual ?? 0)} bold color={(addonManual ?? 0) >= 0 ? "emerald" : "rose"} />
            )}
            {(bbaAdj ?? 0) !== 0 && (
              <LineItem label="Penyesuaian BBA" value={IDR.format(bbaAdj ?? 0)}     bold color={(bbaAdj ?? 0) >= 0 ? "emerald" : "rose"} />
            )}
            <div className="px-5 py-4 flex items-center justify-between bg-slate-950 rounded-b-3xl">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Bonus</p>
              <p className="text-base font-black text-white">{IDR.format(totalBonus!)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Slip Gaji (payroll run) ── */}
      {thpData ? (
        <SlipGajiCard thpData={thpData} />
      ) : (
        isPublished && (
          <p className="text-center text-[10px] text-slate-400 font-medium">
            Slip gaji belum diproses oleh admin untuk periode ini.
          </p>
        )
      )}

      {/* ── Produk Fokus ── */}
      {addonProdukFokus && produkFokus.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <SectionHeader icon={<Package size={14} className="text-violet-500" />} label="Produk Fokus" />
          <div className="p-4 space-y-4">
            {produkFokus.map((item) => (
              <div key={item.productId}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-black text-slate-800 truncate flex-1 mr-2">{item.productName}</p>
                  <div className="text-right shrink-0">
                    <p className="text-[9px] font-black text-slate-500">
                      {NUM.format(item.sold)} / {NUM.format(item.target)} unit
                    </p>
                    {item.bonusEarned > 0 && (
                      <p className="text-[9px] font-bold text-emerald-600">+{IDR.format(item.bonusEarned)}</p>
                    )}
                  </div>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      item.progressPct >= 100 ? "bg-emerald-500"
                      : item.progressPct >= 60 ? "bg-sky-500"
                      : "bg-amber-500",
                    )}
                    style={{ width: `${item.progressPct}%` }}
                  />
                </div>
                <p className="text-[9px] font-bold text-slate-400 mt-1">
                  {item.bonusType === "kelipatan"
                    ? `Bonus ${IDR.format(item.bonusValue)} per ${NUM.format(item.bonusStep)} unit`
                    : `Bonus ${IDR.format(item.bonusValue)} jika capai target`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Histori 1 Tahun ── */}
      {(() => {
        const validHistori = histori.filter(h => h.omzet !== null || h.bonus !== null);
        if (validHistori.length < 2) return null;
        const { bars: histBars, highlightIndex: histHL } = buildMonthlyBars(histori, month, year);
        return (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <SectionHeader icon={<History size={14} className="text-slate-500" />} label="Histori 1 Tahun" />
            <div className="px-4 pt-4 pb-2">
              <CustomBarChart
                bars={histBars}
                highlightIndex={histHL}
                color="sky"
                ariaLabel="Histori omzet 1 tahun"
              />
            </div>
            <div className="divide-y divide-slate-100">
              {histori.map((h) => {
                const isCurrentPeriod = h.month === month && h.year === year;
                return (
                  <div
                    key={`${h.year}-${h.month}`}
                    className={cn(
                      "px-5 py-3 flex items-center justify-between",
                      isCurrentPeriod && "bg-sky-50/60",
                    )}
                  >
                    <div>
                      <p className={cn("text-xs font-black", isCurrentPeriod ? "text-sky-700" : "text-slate-800")}>
                        {MONTHS_ID[h.month]} {h.year}
                        {isCurrentPeriod && (
                          <span className="ml-1.5 text-[8px] bg-sky-100 text-sky-600 rounded px-1 py-0.5 font-black uppercase">Ini</span>
                        )}
                      </p>
                      {h.omzet != null
                        ? <p className="text-[10px] font-bold text-slate-400">{IDR.format(h.omzet)}</p>
                        : <p className="text-[10px] font-bold text-slate-300">Tidak ada data</p>
                      }
                    </div>
                    <div className="text-right">
                      {h.bonus != null ? (
                        <p className={cn("text-sm font-black", h.isPublished ? "text-emerald-600" : "text-amber-500")}>
                          {IDR.format(h.bonus)}
                        </p>
                      ) : (
                        <p className="text-xs font-bold text-slate-300">—</p>
                      )}
                      {h.bonus != null && (
                        <p className="text-[9px] font-bold text-slate-300 mt-0.5">
                          {h.isPublished ? "Final" : "Estimasi"}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ─────────────────────────── SLIP GAJI CARD ─────────────────────────── */

const PERIOD_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft_bba:          { label: "Draft",            cls: "text-slate-600 bg-slate-100 border-slate-200" },
  sent_to_owner:      { label: "Menunggu Approval", cls: "text-sky-700 bg-sky-50 border-sky-200" },
  revision_requested: { label: "Revisi",            cls: "text-amber-700 bg-amber-50 border-amber-200" },
  locked:             { label: "Final · Terkunci",  cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
};

function SlipGajiCard({ thpData }: { thpData: any }) {
  const statusInfo = PERIOD_STATUS_LABELS[thpData.periodStatus ?? ""] ?? { label: "Payroll Run", cls: "text-slate-600 bg-slate-100 border-slate-200" };
  const isLocked   = thpData.periodStatus === "locked";

  // Pendapatan rows
  const hasBreakdown = thpData.posAllowance > 0 || thpData.mealAllowanceTotal > 0 || thpData.transAllowanceTotal > 0;
  const customAdds: any[] = (thpData.customAdjustments ?? []).filter((a: any) => a.type === "addition");
  const customDeds: any[] = (thpData.customAdjustments ?? []).filter((a: any) => a.type === "deduction");

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">

      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt size={14} className="text-emerald-600" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Slip Gaji</p>
        </div>
        <span className={cn("text-[9px] font-black border rounded-lg px-2 py-0.5 uppercase tracking-wide", statusInfo.cls)}>
          {statusInfo.label}
        </span>
      </div>

      {/* Hari Masuk */}
      {thpData.daysWorked != null && (
        <div className="px-5 py-3 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-2">
            <CalendarDays size={12} className="text-slate-400" />
            <p className="text-[11px] font-black text-slate-700">Hari Masuk</p>
          </div>
          <p className="text-[11px] font-black text-slate-900">{thpData.daysWorked} hari</p>
        </div>
      )}

      {/* ── PENDAPATAN ── */}
      <div className="px-5 pt-3.5 pb-1">
        <div className="flex items-center gap-1.5 mb-2">
          <BadgePlus size={11} className="text-sky-500" />
          <p className="text-[9px] font-black uppercase tracking-widest text-sky-600">Pendapatan</p>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {thpData.base > 0 && (
          <LineItem label="Gaji Pokok" value={IDR.format(thpData.base)} bold />
        )}
        {hasBreakdown ? (
          <>
            {thpData.posAllowance       > 0 && <LineItem label="Tunjangan Jabatan"           value={IDR.format(thpData.posAllowance)}       indent />}
            {thpData.mealAllowanceTotal  > 0 && <LineItem label="Tunjangan Makan"             value={IDR.format(thpData.mealAllowanceTotal)}  indent />}
            {thpData.transAllowanceTotal > 0 && <LineItem label="Tunjangan Transport"         value={IDR.format(thpData.transAllowanceTotal)} indent />}
            {customAdds.map((a: any, i: number) => (
              <LineItem key={i} label={String(a.name ?? "Tambahan")} value={IDR.format(Number(a.amount ?? 0))} indent />
            ))}
          </>
        ) : (
          thpData.allowance > 0 && <LineItem label="Tunjangan" value={IDR.format(thpData.allowance)} indent />
        )}
        <div className="px-5 py-2 flex items-center justify-between bg-slate-50/70">
          <p className="text-[10px] font-black text-slate-500">Subtotal Pendapatan</p>
          <p className="text-[11px] font-black text-slate-800">
            {IDR.format(thpData.base + thpData.allowance)}
          </p>
        </div>
      </div>

      {/* ── POTONGAN ── */}
      <div className="px-5 pt-3.5 pb-1">
        <div className="flex items-center gap-1.5 mb-2">
          <BadgeMinus size={11} className="text-rose-500" />
          <p className="text-[9px] font-black uppercase tracking-widest text-rose-600">Potongan</p>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {thpData.bpjsDeduction > 0 && (
          <LineItem label="BPJS" value={`−${IDR.format(thpData.bpjsDeduction)}`} bold color="rose" />
        )}
        {customDeds.map((a: any, i: number) => (
          <LineItem key={i} label={String(a.name ?? "Potongan")} value={`−${IDR.format(Number(a.amount ?? 0))}`} indent color="rose" />
        ))}
        {thpData.deduction === 0 && (
          <div className="px-5 py-3">
            <p className="text-[10px] text-slate-400">Tidak ada potongan</p>
          </div>
        )}
        <div className="px-5 py-2 flex items-center justify-between bg-rose-50/50">
          <p className="text-[10px] font-black text-rose-600">Subtotal Potongan</p>
          <p className="text-[11px] font-black text-rose-700">−{IDR.format(thpData.deduction)}</p>
        </div>
      </div>

      {/* ── BONUS ── */}
      {(thpData.bonusKpi > 0 || thpData.bonusProduk > 0 || thpData.bonusAdj !== 0 || thpData.bonusTotal !== 0) && (
        <>
          <div className="px-5 pt-3.5 pb-1">
            <div className="flex items-center gap-1.5 mb-2">
              <Award size={11} className="text-amber-500" />
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-600">Bonus</p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {thpData.bonusKpi    > 0 && <LineItem label="Bonus KPI"         value={IDR.format(thpData.bonusKpi)}    bold color="emerald" />}
            {thpData.bonusProduk > 0 && <LineItem label="Bonus Produk Fokus" value={IDR.format(thpData.bonusProduk)} indent />}
            {thpData.bonusAdj !== 0  && (
              <LineItem
                label="Penyesuaian"
                value={`${thpData.bonusAdj >= 0 ? "+" : "−"}${IDR.format(Math.abs(thpData.bonusAdj))}`}
                indent
                color={thpData.bonusAdj < 0 ? "rose" : undefined}
              />
            )}
            <div className="px-5 py-2 flex items-center justify-between bg-amber-50/60">
              <p className="text-[10px] font-black text-amber-700">Total Bonus</p>
              <p className="text-[11px] font-black text-amber-700">{IDR.format(thpData.bonusTotal)}</p>
            </div>
          </div>
        </>
      )}

      {/* ── THP BERSIH ── */}
      <div className={cn(
        "px-5 py-4 flex items-center justify-between rounded-b-3xl",
        isLocked ? "bg-emerald-600" : "bg-slate-800",
      )}>
        <div>
          <p className={cn("text-[9px] font-black uppercase tracking-widest", isLocked ? "text-emerald-100" : "text-slate-400")}>
            Take Home Pay
          </p>
          {!isLocked && (
            <p className="text-[8px] font-bold text-slate-500 mt-0.5">Belum final</p>
          )}
        </div>
        <p className="text-xl font-black text-white">{IDR.format(thpData.netPay)}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────── SHARED ATOMS ─────────────────────────── */

function StatusBanner({ isPublished, publishedAt, month, year }: {
  isPublished: boolean; publishedAt: string | null; month: number; year: number;
}) {
  if (isPublished) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <ClipboardCheck size={15} className="shrink-0 text-emerald-600" />
        <p className="text-[11px] font-bold text-emerald-800 flex-1">
          Rapor <span className="font-black">{MONTHS_ID[month]} {year}</span> sudah final
          {publishedAt ? ` · ${new Date(publishedAt).toLocaleDateString("id-ID", { day: "numeric", month: "long" })}` : ""}
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      <Lock size={15} className="shrink-0 text-amber-600" />
      <p className="text-[11px] font-bold text-amber-800">
        Data berjalan — belum final, angka bisa berubah setelah diverifikasi admin
      </p>
    </div>
  );
}

function EmptyState({ title, desc, icon }: { title: string; desc: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm text-center space-y-3">
      <div className="w-14 h-14 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto">
        {icon}
      </div>
      <p className="font-black text-slate-700 uppercase text-sm">{title}</p>
      <p className="text-[11px] text-slate-500 max-w-xs mx-auto">{desc}</p>
    </div>
  );
}

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
      {icon}
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
    </div>
  );
}

function AbsensiChip({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color?: "emerald" | "amber" | "sky" | "rose" }) {
  const bg  = color === "emerald" ? "bg-emerald-50" : color === "amber" ? "bg-amber-50" : color === "sky" ? "bg-sky-50" : color === "rose" ? "bg-rose-50" : "bg-slate-50";
  const txt = color === "emerald" ? "text-emerald-700" : color === "amber" ? "text-amber-700" : color === "sky" ? "text-sky-700" : color === "rose" ? "text-rose-700" : "text-slate-700";
  return (
    <div className={cn("rounded-2xl p-3 flex flex-col items-center gap-1.5", bg)}>
      {icon}
      <p className={cn("text-xl font-black leading-none", txt)}>{value}</p>
      <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">{label}</p>
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: string; color?: "emerald" | "amber" | "rose" }) {
  const bg  = color === "emerald" ? "bg-emerald-50" : color === "amber" ? "bg-amber-50" : color === "rose" ? "bg-rose-50" : "bg-slate-50";
  const txt = color === "emerald" ? "text-emerald-700" : color === "amber" ? "text-amber-700" : color === "rose" ? "text-rose-700" : "text-slate-900";
  return (
    <div className={cn("rounded-2xl p-3", bg)}>
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className={cn("text-sm font-black mt-0.5 leading-tight", txt)}>{value}</p>
    </div>
  );
}

function LineItem({ label, value, bold, indent, color }: { label: string; value: string; bold?: boolean; indent?: boolean; color?: "emerald" | "rose" }) {
  return (
    <div className={cn("px-5 py-3 flex items-center justify-between", indent && "bg-slate-50/60")}>
      <p className={cn(indent ? "text-[10px] text-slate-500 pl-3" : "text-[11px] text-slate-700", bold && !indent && "font-black", !bold && "font-medium")}>
        {label}
      </p>
      <p className={cn(bold ? "font-black" : "font-bold", indent ? "text-[10px] text-slate-600" : "text-[11px]", color === "emerald" && "text-emerald-700", color === "rose" && "text-rose-600", !color && "text-slate-900")}>
        {value}
      </p>
    </div>
  );
}

function ReviewRow({ label, score, dotColor }: { label: string; score: number; dotColor: string }) {
  const filled = Math.round(Math.min(5, Math.max(0, score)));
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
        <div className="flex items-center gap-1 mt-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={cn("w-5 h-2 rounded-full", i < filled ? dotColor : "bg-slate-100")} />
          ))}
        </div>
      </div>
      <p className="text-xl font-black text-slate-900">{score.toFixed(1)}<span className="text-sm font-bold text-slate-400"> /5</span></p>
    </div>
  );
}
