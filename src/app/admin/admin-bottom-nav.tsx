"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ClipboardCheck, BarChart3, Megaphone, Trophy } from "lucide-react";

const NAV_ITEMS = [
  { name: "Dashboard",   path: "/admin/dashboard",   Icon: Home,           showBadge: false },
  { name: "Verifikasi",  path: "/admin/verifikasi",  Icon: ClipboardCheck, showBadge: true  },
  { name: "Laporan",     path: "/admin/laporan",     Icon: BarChart3,      showBadge: false },
  { name: "Pengumuman",  path: "/admin/pengumuman",  Icon: Megaphone,      showBadge: false },
  { name: "Leaderboard", path: "/admin/leaderboard", Icon: Trophy,         showBadge: false },
] as const;

export function AdminBottomNav({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-slate-100 px-2 py-2 flex justify-around items-center z-50 shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.05)]">
      {NAV_ITEMS.map(({ name, path, Icon, showBadge }) => {
        const isActive = pathname === path || pathname.startsWith(path + "/");
        return (
          <Link
            key={path}
            href={path}
            className={`flex flex-col items-center px-2 py-1.5 rounded-2xl min-w-[52px] transition-all duration-200 ${
              isActive
                ? "text-indigo-600 bg-indigo-50"
                : "text-slate-400 opacity-60 hover:opacity-100 hover:text-indigo-600"
            }`}
          >
            <div className="relative">
              <Icon size={20} />
              {showBadge && unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none">
                  {Math.min(unreadCount, 99)}
                </span>
              )}
            </div>
            <span
              className={`text-[9px] font-black mt-0.5 uppercase tracking-tighter ${
                isActive ? "text-indigo-600" : "text-slate-500"
              }`}
            >
              {name}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
