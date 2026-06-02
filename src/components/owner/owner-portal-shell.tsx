import type { ReactNode } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/shared/glass-card";
import { selectOwnerTenantAction } from "@/actions/owner-portal";
import { ChevronLeft, ChevronRight, Crown } from "lucide-react";
import type { OwnerPortalSessionOk } from "@/app/owner/_lib/owner-portal-context";

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function addCalendarMonths(m: number, y: number, delta: number): { month: number; year: number } {
  const d = new Date(y, m - 1 + delta, 1);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

function buildOwnerHref(
  basePath: string,
  ctx: OwnerPortalSessionOk,
  patch: Partial<{ month: number; year: number; date: string }>,
  activeTabParam?: string,
  activeSubParam?: string,
) {
  const p = new URLSearchParams();
  p.set("month", String(patch.month ?? ctx.month));
  p.set("year", String(patch.year ?? ctx.year));
  const date = patch.date ?? ctx.dateParam;
  if (date) p.set("date", date);
  if (activeTabParam) p.set("tab", activeTabParam);
  if (activeSubParam) p.set("sub", activeSubParam);
  p.set("tenant", ctx.activeOwnerMembership.tenantId);
  return `${basePath}?${p.toString()}`;
}

type Props = {
  ctx: OwnerPortalSessionOk;
  basePath: string;
  title: ReactNode;
  subtitle?: string;
  /** Tanggal untuk query `date` (nav bulan); kosongkan jika tidak dipakai halaman. */
  dateForNav?: string;
  /** Jika diset, disertakan sebagai ?tab=... di URL navigasi bulan agar tab tetap terjaga. */
  activeTabParam?: string;
  /** Jika diset, disertakan sebagai ?sub=... di URL navigasi bulan agar sub-tab tetap terjaga. */
  activeSubParam?: string;
  children: React.ReactNode;
};

export function OwnerPortalShell({ ctx, basePath, title, subtitle, dateForNav, activeTabParam, activeSubParam, children }: Props) {
  const { month, year, activeOwnerMembership, tenantOptions } = ctx;
  const prevPeriod = addCalendarMonths(month, year, -1);
  const nextPeriod = addCalendarMonths(month, year, 1);
  const navDate = dateForNav ?? ctx.dateParam;
  const navCtx = { ...ctx, dateParam: navDate };

  return (
    <div className="space-y-6 pb-10">
      <GlassCard className="p-4 sm:p-5" variant="light">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-sky-600/25">
              <Crown size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase leading-tight">
                {title}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {subtitle ?? `${activeOwnerMembership.tenantName} · Data hanya untuk cabang tempat Anda sebagai owner.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Link
              href={buildOwnerHref(basePath, navCtx, { month: prevPeriod.month, year: prevPeriod.year }, activeTabParam, activeSubParam)}
              className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
              aria-label="Bulan sebelumnya"
            >
              <ChevronLeft size={16} />
            </Link>
            <span className="min-w-[110px] text-center text-[11px] font-black text-slate-600 uppercase tracking-widest select-none">
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <Link
              href={buildOwnerHref(basePath, navCtx, { month: nextPeriod.month, year: nextPeriod.year }, activeTabParam, activeSubParam)}
              className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
              aria-label="Bulan berikutnya"
            >
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </GlassCard>

      {tenantOptions.length > 1 ? (
        <GlassCard className="!p-4">
          <form action={selectOwnerTenantAction} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 w-full md:w-auto md:min-w-[200px]">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cabang</label>
              <select
                name="tenantId"
                defaultValue={activeOwnerMembership.tenantId}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800"
              >
                {tenantOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} — {t.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-slate-800"
            >
              Ganti cabang
            </button>
          </form>
        </GlassCard>
      ) : null}

      {children}
    </div>
  );
}
