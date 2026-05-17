import type { ReactNode } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/shared/glass-card";
import { selectOwnerTenantAction } from "@/actions/owner-portal";
import { ChevronLeft, ChevronRight, Crown } from "lucide-react";
import type { OwnerPortalSessionOk } from "@/app/owner/_lib/owner-portal-context";

function addCalendarMonths(m: number, y: number, delta: number): { month: number; year: number } {
  const d = new Date(y, m - 1 + delta, 1);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

function buildOwnerHref(
  basePath: string,
  ctx: OwnerPortalSessionOk,
  patch: Partial<{ month: number; year: number; date: string; verifiedOnly: boolean }>,
) {
  const p = new URLSearchParams();
  p.set("month", String(patch.month ?? ctx.month));
  p.set("year", String(patch.year ?? ctx.year));
  const date = patch.date ?? ctx.dateParam;
  if (date) p.set("date", date);
  const verifiedOnly = patch.verifiedOnly ?? ctx.verifiedOnly;
  if (!verifiedOnly) p.set("verifiedOnly", "false");
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
  children: React.ReactNode;
};

export function OwnerPortalShell({ ctx, basePath, title, subtitle, dateForNav, children }: Props) {
  const { month, year, activeOwnerMembership, tenantOptions } = ctx;
  const prevPeriod = addCalendarMonths(month, year, -1);
  const nextPeriod = addCalendarMonths(month, year, 1);
  const navDate = dateForNav ?? ctx.dateParam;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-[10px] font-black uppercase tracking-widest mb-2 border border-amber-100">
            <Crown size={12} /> Portal Owner
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">{title}</h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">
            {subtitle ?? `${activeOwnerMembership.tenantName} · Data hanya untuk cabang tempat Anda sebagai owner.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={buildOwnerHref(basePath, { ...ctx, dateParam: navDate }, { month: prevPeriod.month, year: prevPeriod.year })}
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Bulan sebelumnya"
          >
            <ChevronLeft size={20} />
          </Link>
          <Link
            href={buildOwnerHref(basePath, { ...ctx, dateParam: navDate }, { month: nextPeriod.month, year: nextPeriod.year })}
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Bulan berikutnya"
          >
            <ChevronRight size={20} />
          </Link>
        </div>
      </div>

      {tenantOptions.length > 1 ? (
        <GlassCard className="!p-4">
          <form action={selectOwnerTenantAction} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 min-w-[200px]">
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
