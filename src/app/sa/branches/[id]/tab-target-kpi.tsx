"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Target, Package } from "lucide-react";
import { TabKpiV2 } from "@/components/kpi-v2/TabKpiV2";
import { ProductFokusSection } from "@/components/branch/tab-addon/ProductFokusSection";
import type { KpiConfigV2 } from "@/lib/types/kpi-v2";

type Seg = "kpi" | "produk";

export function TabTargetKpi({
  branchId,
  currentMonth,
  currentYear,
  users,
  kpiConfigV2,
  products,
  productFokus,
  canEditKpi = true,
  isProductFokusEnabled,
}: {
  branchId: string;
  currentMonth: number;
  currentYear: number;
  users: any[];
  kpiConfigV2: KpiConfigV2;
  products: any[];
  productFokus: any[];
  canEditKpi?: boolean;
  isProductFokusEnabled: boolean;
}) {
  const segments: { id: Seg; label: string; Icon: React.ElementType }[] = [
    { id: "kpi",    label: "KPI & Bonus",  Icon: Target  },
    ...(isProductFokusEnabled ? [{ id: "produk" as Seg, label: "Produk Fokus", Icon: Package }] : []),
  ];

  const [active, setActive] = useState<Seg>("kpi");
  const resolved: Seg = segments.some(s => s.id === active) ? active : "kpi";

  return (
    <div className="space-y-5 pb-10">

      {/* ── Segment control (only shown when product fokus is enabled) ── */}
      {isProductFokusEnabled && (
        <div className="flex gap-1 p-1.5 bg-white rounded-2xl border border-slate-100 shadow-lg shadow-slate-200/40">
          {segments.map(({ id, label, Icon }) => {
            const isActive = resolved === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActive(id)}
                className={`relative flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                  isActive ? "text-sky-600" : "text-slate-400 hover:text-slate-700"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="targetKpiSeg"
                    className="absolute inset-0 bg-sky-50 rounded-xl border border-sky-100 shadow-sm"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                  />
                )}
                <div className={`relative z-10 w-5 h-5 rounded-md flex items-center justify-center transition-all duration-300 ${
                  isActive ? "bg-sky-600 text-white shadow-md shadow-sky-600/30" : "bg-slate-50 text-slate-400"
                }`}>
                  <Icon size={12} />
                </div>
                <span className="relative z-10 hidden sm:inline">{label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={resolved}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {resolved === "kpi" && (
            <TabKpiV2
              branchId={branchId}
              currentMonth={currentMonth}
              currentYear={currentYear}
              users={users}
              initialConfig={kpiConfigV2}
              canEditKpi={canEditKpi}
            />
          )}
          {resolved === "produk" && (
            <ProductFokusSection
              branchId={branchId}
              currentMonth={currentMonth}
              currentYear={currentYear}
              products={products}
              productFokus={productFokus}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
