"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ClipboardCheck, Banknote, Star, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { name: "Dashboard",  path: "/admin/dashboard",          Icon: LayoutDashboard, badge: "none"       },
  { name: "Verifikasi", path: "/admin/verifikasi",          Icon: ClipboardCheck,  badge: "unread"     },
  { name: "Absensi",    path: "/admin/absensi",             Icon: CalendarDays,    badge: "attendance" },
  { name: "Review",     path: "/admin/review-pelanggan",   Icon: Star,            badge: "none"       },
  { name: "Setup Gaji", path: "/admin/konfigurasi-gaji",   Icon: Banknote,        badge: "none"       },
] as const;

type BadgeType = (typeof NAV_ITEMS)[number]["badge"];

export function AdminBottomNav({
  unreadCount,
  pendingAttendanceCount,
}: {
  unreadCount: number;
  pendingAttendanceCount: number;
}) {
  const pathname = usePathname();

  function badgeCount(type: BadgeType): number {
    if (type === "unread") return unreadCount;
    if (type === "attendance") return pendingAttendanceCount;
    return 0;
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[1.75rem] shadow-[0_-4px_30px_rgba(0,0,0,0.09)] pb-safe">
      <div className="flex justify-around items-stretch px-2 pt-1 pb-2">
        {NAV_ITEMS.map(({ name, path, Icon, badge }) => {
          const isActive = pathname === path || pathname.startsWith(path + "/");
          const count = badgeCount(badge);
          return (
            <Link
              key={path}
              href={path}
              className="relative flex flex-col items-center gap-1 flex-1 py-2.5 px-1 min-w-0"
            >
              {/* Active bar indicator */}
              <span
                className={cn(
                  "absolute top-0 left-1/2 -translate-x-1/2 h-[3px] rounded-full transition-all duration-300",
                  isActive ? "w-8 bg-sky-600" : "w-0 bg-transparent",
                )}
              />
              {/* Icon + badge */}
              <div className="relative">
                <Icon
                  size={21}
                  className={cn(
                    "transition-colors duration-200 shrink-0",
                    isActive ? "text-sky-600" : "text-slate-400",
                  )}
                />
                {count > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none">
                    {Math.min(count, 99)}
                  </span>
                )}
              </div>
              {/* Label */}
              <span
                className={cn(
                  "text-[9px] font-black uppercase tracking-widest leading-none transition-colors duration-200 truncate max-w-full text-center",
                  isActive ? "text-sky-600" : "text-slate-400",
                )}
              >
                {name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
