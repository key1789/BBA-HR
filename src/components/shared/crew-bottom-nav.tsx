"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Receipt, CalendarClock, MessageSquare, ShieldCheck, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

// Define the nav items
const navItems = [
  { name: "Progress", path: "/crew/dashboard", icon: Home },
  { name: "Input", path: "/crew/input-harian", icon: Receipt },
  { name: "Kehadiran", path: "/crew/kehadiran", icon: CalendarClock },
  { name: "Pengumuman", path: "/crew/pengumuman", icon: Megaphone },
  { name: "Review", path: "/crew/review-rekan", icon: MessageSquare },
  { name: "Leaderboard", path: "/crew/leaderboard", icon: ShieldCheck },
];

export function CrewBottomNav({ branchConfig }: { branchConfig: Record<string, boolean> }) {
  const pathname = usePathname();

  // Filter based on branch config
  const activeNavItems = navItems.filter((item) => {
    if (item.name === "Kehadiran" && !branchConfig.addon_absensi) return false;
    if (item.name === "Grooming" && !branchConfig.addon_grooming) return false;
    if (item.name === "Leaderboard" && !branchConfig.addon_peer_review) return false;
    return true;
  });

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 flex justify-between items-center z-50 pb-safe pt-2 shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.05)]">
      {activeNavItems.map((item) => {
        const isActive = pathname?.startsWith(item.path);
        const Icon = item.icon;
        
        return (
          <Link
            key={item.path}
            href={item.path}
            className={cn(
              "flex items-center justify-center p-2.5 transition-all duration-300 ease-in-out",
              isActive 
                ? "bg-sky-100 text-sky-600 rounded-full px-5" 
                : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Icon size={22} className={cn("transition-transform duration-300", isActive && "scale-110")} />
            
            {/* Animasi memunculkan text hanya jika aktif */}
            <div
              className={cn(
                "overflow-hidden transition-all duration-300 ease-in-out",
                isActive ? "max-w-[100px] ml-2 opacity-100" : "max-w-0 ml-0 opacity-0"
              )}
            >
              <span className="text-[11px] font-black tracking-wide whitespace-nowrap">
                {item.name}
              </span>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
