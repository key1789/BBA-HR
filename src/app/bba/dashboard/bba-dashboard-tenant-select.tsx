"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { BbaDashboardTab } from "@/lib/bba-dashboard-metrics";
import { GlassCard } from "@/components/shared/glass-card";

type TenantOpt = { id: string; code: string; name: string };

function buildQuery(tenant: string, month: number, year: number, tab: BbaDashboardTab): string {
  const q = new URLSearchParams();
  q.set("tenant", tenant);
  q.set("month", String(month));
  q.set("year", String(year));
  q.set("tab", tab);
  return q.toString();
}

export function BbaDashboardTenantSelect({
  tenants,
  tenantId,
  month,
  year,
  tab,
}: {
  tenants: TenantOpt[];
  tenantId: string | "all";
  month: number;
  year: number;
  tab: BbaDashboardTab;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const tenantParam = tenantId === "all" ? "all" : tenantId;

  const push = useCallback(
    (next: { tenant?: string; month?: number; year?: number; tab?: BbaDashboardTab }) => {
      const t = next.tenant ?? tenantParam;
      const m = next.month ?? month;
      const y = next.year ?? year;
      const tb = next.tab ?? tab;
      router.push(`${pathname}?${buildQuery(t, m, y, tb)}`);
    },
    [router, pathname, tenantParam, month, year, tab],
  );

  const yearOptions = useMemo(() => {
    const cy = new Date().getFullYear();
    const out: number[] = [];
    for (let y = cy - 2; y <= cy + 1; y++) out.push(y);
    return out;
  }, []);

  return (
    <GlassCard className="!p-4 flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end bg-slate-50/50">
      <div className="flex flex-col gap-1 min-w-[200px]">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tenant</label>
        <select
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800"
          value={tenantParam}
          onChange={(e) => {
            const v = e.target.value;
            push({ tenant: v === "all" ? "all" : v });
          }}
        >
          <option value="all">Semua cabang</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.code} — {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bulan</label>
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 min-w-[120px]"
            value={month}
            onChange={(e) => push({ month: Number(e.target.value) })}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {new Date(2000, m - 1, 1).toLocaleString("id-ID", { month: "long" })}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tahun</label>
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 min-w-[100px]"
            value={year}
            onChange={(e) => push({ year: Number(e.target.value) })}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tampilan</label>
        <div className="flex rounded-xl border border-slate-200 bg-white p-1 gap-1">
          {(
            [
              { id: "sales" as const, label: "Penjualan & kinerja" },
              { id: "ops" as const, label: "Operasional & tugas" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => push({ tab: item.id })}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-all",
                tab === item.id ? "bg-indigo-600 text-white shadow-md" : "text-slate-600 hover:bg-slate-50",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}
