"use client";

import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { BarChart3, Calendar } from "lucide-react";

const TABS = [
  { key: "bulanan", label: "Bulanan", Icon: BarChart3 },
  { key: "harian",  label: "Harian",  Icon: Calendar  },
] as const;

type TabKey = "bulanan" | "harian";

export function OwnerPerformaTabs({ activeTab }: { activeTab: TabKey }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  function buildTabUrl(tab: TabKey) {
    const p = new URLSearchParams(searchParams.toString());
    // Always clear date when switching tabs (date nav from AuditDetailClient drops tab param)
    p.delete("date");
    if (tab === "harian") {
      p.set("tab", "harian");
    } else {
      p.delete("tab");
    }
    return `${pathname}?${p.toString()}`;
  }

  return (
    <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl w-fit">
      {TABS.map(({ key, label, Icon }) => (
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
