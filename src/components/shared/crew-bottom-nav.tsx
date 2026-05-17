"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PenLine,
  Fingerprint,
  Users,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ALL_NAV_ITEMS = [
  { key: "dashboard", name: "Dashboard", path: "/crew/dashboard",    icon: LayoutDashboard },
  { key: "input",     name: "Input",     path: "/crew/input-harian", icon: PenLine         },
  { key: "kehadiran", name: "Kehadiran", path: "/crew/kehadiran",    icon: Fingerprint     },
  { key: "review",    name: "Review",    path: "/crew/review-rekan", icon: Users           },
  { key: "rapor",     name: "Rapor",     path: "/crew/rapor",        icon: ClipboardCheck  },
];

export function CrewBottomNav({ branchConfig }: { branchConfig: Record<string, boolean> }) {
  const pathname = usePathname();

  const items = ALL_NAV_ITEMS.filter((item) => {
    if (item.key === "kehadiran"   && !branchConfig.addon_absensi)    return false;
    if (item.key === "review" && !branchConfig.addon_grooming) return false;
    return true;
  });

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[1.75rem] shadow-[0_-4px_30px_rgba(0,0,0,0.09)] pb-safe">
      <div className="flex justify-around items-stretch px-2 pt-1 pb-2">
        {items.map((item) => {
          const isActive = pathname?.startsWith(item.path);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              href={item.path}
              className="relative flex flex-col items-center gap-1 flex-1 py-2.5 px-1 min-w-0"
            >
              <span
                className={cn(
                  "absolute top-0 left-1/2 -translate-x-1/2 h-[3px] rounded-full transition-all duration-300",
                  isActive ? "w-8 bg-sky-600" : "w-0 bg-transparent",
                )}
              />
              <Icon
                size={21}
                className={cn(
                  "transition-colors duration-200 shrink-0",
                  isActive ? "text-sky-600" : "text-slate-400",
                )}
              />
              <span
                className={cn(
                  "text-[9px] font-black uppercase tracking-wide leading-none transition-colors duration-200 truncate max-w-full text-center",
                  isActive ? "text-sky-600" : "text-slate-400",
                )}
              >
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
