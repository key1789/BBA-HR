"use client";

import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Users, FileText } from "lucide-react";

type TabKey = "per-karyawan" | "payroll";

const TABS = [
  { key: "per-karyawan" as TabKey, label: "Karyawan & Penilaian", Icon: Users },
  { key: "payroll"      as TabKey, label: "Rapor & Payroll",       Icon: FileText },
] as const;

export function OwnerKompensasiTabs({
  activeTab,
  showPayrollTab,
}: {
  activeTab: TabKey;
  showPayrollTab: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  function buildTabUrl(tab: string) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", tab);
    return `${pathname}?${p.toString()}`;
  }

  const visibleTabs = TABS.filter((t) => t.key !== "payroll" || showPayrollTab);

  return (
    <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl w-fit">
      {visibleTabs.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => router.push(buildTabUrl(key))}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all outline-none focus:outline-none",
            activeTab === key
              ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
              : "text-slate-500 hover:bg-slate-200 hover:text-slate-700",
          )}
        >
          <Icon size={12} />
          {label}
        </button>
      ))}
    </div>
  );
}
