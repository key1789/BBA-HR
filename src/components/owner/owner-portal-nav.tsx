"use client";

import Link from "next/link";
import { LinkPendingHint } from "@/components/shared/link-pending-hint";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BarChart3, Wallet, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_BASE = [
  { path: "/owner/dashboard",  label: "Dashboard",  Icon: LayoutDashboard },
  { path: "/owner/performa",   label: "Performa",   Icon: BarChart3 },
  { path: "/owner/kompensasi", label: "Karyawan",   Icon: TrendingUp },
] as const;

const NAV_SALARY = { path: "/owner/karyawan", label: "Setup Gaji", Icon: Wallet } as const;

function isActive(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

type Variant = "sidebar" | "bottom";

export function OwnerPortalNav({
  variant,
  showSalaryConfig = false,
}: {
  variant: Variant;
  showSalaryConfig?: boolean;
}) {
  const pathname = usePathname() ?? "";

  const nav = showSalaryConfig
    ? [NAV_BASE[0], NAV_BASE[1], NAV_SALARY, NAV_BASE[2]]
    : [...NAV_BASE];

  if (variant === "sidebar") {
    return (
      <>
        {nav.map((item) => {
          const active = isActive(pathname, item.path);
          return (
            <Link
              key={item.path}
              href={item.path}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-semibold text-sm",
                active
                  ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white",
              )}
            >
              <item.Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
              <span className="flex-1">{item.label}</span>
              <LinkPendingHint className={active ? "text-sky-300" : "text-slate-400"} />
            </Link>
          );
        })}
      </>
    );
  }

  return (
    <>
      {nav.map((item) => {
        const active = isActive(pathname, item.path);
        return (
          <Link
            key={item.path}
            href={item.path}
            className={cn(
              "flex flex-col items-center p-1.5 rounded-xl min-w-[72px] max-w-[25vw] transition-all",
              active ? "text-sky-400" : "text-slate-300 hover:text-white",
            )}
          >
            <div className={cn("p-1.5 rounded-lg", active && "bg-slate-800")}>
              <item.Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
            </div>
            <span className="text-[9px] font-black mt-0.5 text-center leading-tight line-clamp-2 px-0.5">
              {item.label}
            </span>
          </Link>
        );
      })}
    </>
  );
}
