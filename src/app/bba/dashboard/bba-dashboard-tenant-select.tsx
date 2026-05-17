"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { BbaDashboardTab } from "@/lib/bba-dashboard-metrics";
import { Building2, CalendarDays, BarChart2, Wrench } from "lucide-react";

type TenantOpt = { id: string; code: string; name: string };

function buildQuery(tenant: string, month: number, year: number, tab: BbaDashboardTab): string {
  const q = new URLSearchParams();
  q.set("tenant", tenant);
  q.set("month", String(month));
  q.set("year", String(year));
  q.set("tab", tab);
  return q.toString();
}

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];

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
    <div className="flex flex-wrap items-center gap-2 p-2 bg-white rounded-2xl border border-slate-100 shadow-sm">
      {/* Tenant */}
      <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 min-w-[180px] flex-1">
        <Building2 size={13} className="text-slate-400 shrink-0" />
        <select
          className="flex-1 bg-transparent text-[11px] font-black text-slate-700 outline-none cursor-pointer"
          value={tenantParam}
          onChange={(e) => push({ tenant: e.target.value === "all" ? "all" : e.target.value })}
        >
          <option value="all">Semua cabang</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.code} — {t.name}</option>
          ))}
        </select>
      </div>

      {/* Period */}
      <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
        <CalendarDays size={13} className="text-slate-400 shrink-0" />
        <select
          className="bg-transparent text-[11px] font-black text-slate-700 outline-none cursor-pointer"
          value={month}
          onChange={(e) => push({ month: Number(e.target.value) })}
        >
          {MONTH_SHORT.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
        <div className="w-px h-3.5 bg-slate-300" />
        <select
          className="bg-transparent text-[11px] font-black text-slate-700 outline-none cursor-pointer"
          value={year}
          onChange={(e) => push({ year: Number(e.target.value) })}
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1 ml-auto">
        {([
          { id: "sales" as const, label: "Penjualan", icon: BarChart2 },
          { id: "ops" as const, label: "Operasional", icon: Wrench },
        ] as const).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => push({ tab: item.id })}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all",
                tab === item.id
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              <Icon size={11} />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
