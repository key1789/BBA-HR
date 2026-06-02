"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Puzzle } from "lucide-react";
import { InfoTooltip } from "@/components/shared/info-tooltip";
import { TabAddon } from "@/components/branch/tab-addon";

export function TabAddons({
  branchId, addons, products, productFokus, currentMonth, currentYear, onNavigateToTab,
}: {
  branchId: string;
  addons: any[];
  products: any[];
  productFokus: any[];
  currentMonth: number;
  currentYear: number;
  onNavigateToTab: (tabId: string) => void;
}) {
  const activeAddons      = addons.filter((a) => a.is_enabled);
  const activeAddonsCount = activeAddons.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
          <Puzzle size={20} />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-800 leading-tight flex items-center gap-1.5">
            Fitur &amp; Add-on
            <InfoTooltip
              content="Aktifkan atau nonaktifkan modul tambahan sesuai kebutuhan operasional cabang. Beberapa add-on memerlukan konfigurasi lanjutan setelah diaktifkan."
              side="right"
              width="w-72"
            />
          </h2>
          <p className="text-xs font-medium text-slate-400 mt-0.5">
            {activeAddonsCount} dari 5 add-on aktif · Aktifkan fitur tambahan dan atur sistem kerjanya.
          </p>
        </div>
      </div>

      {/* Content */}
      <TabAddon
        branchId={branchId}
        addons={addons}
        products={products}
        productFokus={productFokus}
        currentMonth={currentMonth}
        currentYear={currentYear}
        onNavigateToTab={onNavigateToTab}
      />
    </div>
  );
}
