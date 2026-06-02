"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, BarChart3, Wallet, TrendingUp,
  ChevronLeft, ChevronRight, LogOut,
} from "lucide-react";
import { LinkPendingHint } from "@/components/shared/link-pending-hint";

const NAV_BASE = [
  { path: "/owner/dashboard",   label: "Dashboard",          Icon: LayoutDashboard },
  { path: "/owner/performa",    label: "Performa Apotek",    Icon: BarChart3 },
  { path: "/owner/kompensasi",  label: "Performa Karyawan",  Icon: TrendingUp },
] as const;

const NAV_SALARY = {
  path: "/owner/karyawan",
  label: "Setup Gaji",
  Icon: Wallet,
} as const;

function isActive(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function OwnerSidebar({
  userEmail,
  handleLogout,
  showSalaryConfig,
}: {
  userEmail: string;
  handleLogout: () => Promise<void>;
  showSalaryConfig: boolean;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname() ?? "";

  const nav = showSalaryConfig
    ? [NAV_BASE[0], NAV_BASE[1], NAV_SALARY, NAV_BASE[2]]
    : [...NAV_BASE];

  return (
    <motion.aside
      animate={{ width: isCollapsed ? 88 : 288 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="h-full bg-slate-900 flex flex-col z-50 relative pt-8 pb-6 px-3 border-r border-slate-800 text-slate-300 shrink-0"
    >
      {/* ── Toggle ── */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute top-10 -right-4 w-8 h-8 bg-slate-800 text-slate-400 border border-slate-700 rounded-full shadow-md flex items-center justify-center hover:text-white transition-colors z-50"
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      {/* ── Logo ── */}
      <div className={cn("flex items-center gap-3 mb-10", isCollapsed ? "justify-center" : "px-2")}>
        <div className="w-10 h-10 min-w-[40px] rounded-xl overflow-hidden shrink-0 shadow-lg ring-1 ring-white/10">
          <Image
            src="/bba-logo.png"
            width={40}
            height={40}
            alt="Owner Portal"
            className="w-full h-full object-cover"
            priority
          />
        </div>
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col overflow-hidden"
          >
            <h1 className="font-bold text-lg leading-tight tracking-tight text-white whitespace-nowrap">
              Owner Portal
            </h1>
            <p className="text-[10px] font-bold text-sky-400 tracking-wider whitespace-nowrap">
              APOTEK SYSTEM
            </p>
          </motion.div>
        )}
      </div>

      {/* ── Navigation ── */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-4">
        <div className="space-y-1">
          {nav.map((item) => {
            const active = isActive(pathname, item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "flex items-center gap-3 rounded-xl transition-all duration-200 group relative",
                  isCollapsed ? "justify-center py-3.5 px-0" : "px-4 py-3.5",
                  active
                    ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white",
                )}
              >
                <item.Icon
                  size={20}
                  className={cn(
                    "shrink-0",
                    active ? "text-white" : "text-slate-400 group-hover:text-white",
                  )}
                />
                {!isCollapsed && (
                  <span
                    className={cn(
                      "font-medium text-sm whitespace-nowrap flex-1",
                      active ? "text-white" : "",
                    )}
                  >
                    {item.label}
                  </span>
                )}
                <LinkPendingHint
                  className={cn(
                    isCollapsed ? "absolute bottom-1 right-1" : "ml-auto",
                    active ? "text-white" : "text-slate-500",
                  )}
                />
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Profile & Logout ── */}
      <div className="pt-4 mt-auto border-t border-slate-800">
        <div
          className={cn(
            "flex items-center gap-3 p-2 rounded-2xl transition-all duration-300",
            isCollapsed ? "justify-center" : "bg-slate-800 border border-slate-700",
          )}
        >
          <div className="w-10 h-10 min-w-[40px] bg-sky-800 text-sky-100 rounded-xl flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
            {userEmail.charAt(0).toUpperCase()}
          </div>

          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate leading-none mb-1">
                {userEmail.split("@")[0]}
              </p>
              <p className="text-[9px] font-black text-sky-400 uppercase tracking-widest">
                Portal Owner
              </p>
            </div>
          )}

          <form action={handleLogout}>
            <button
              type="submit"
              className={cn(
                "p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-700 rounded-lg transition-all",
                isCollapsed && "hidden",
              )}
              title="Keluar"
            >
              <LogOut size={18} />
            </button>
          </form>
        </div>

        {isCollapsed && (
          <form action={handleLogout} className="mt-2 flex justify-center">
            <button
              type="submit"
              className="p-3 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition-colors"
            >
              <LogOut size={20} />
            </button>
          </form>
        )}
      </div>
    </motion.aside>
  );
}
