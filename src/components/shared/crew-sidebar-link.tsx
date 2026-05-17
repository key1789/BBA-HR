"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function SidebarLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  const pathname = usePathname();
  const isActive = pathname?.startsWith(href);

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group",
        isActive
          ? "bg-sky-50 text-sky-700"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
      )}
    >
      {/* Left accent bar */}
      <span
        className={cn(
          "w-[3px] h-5 rounded-full shrink-0 transition-all duration-200",
          isActive ? "bg-sky-600" : "bg-transparent group-hover:bg-slate-200",
        )}
      />
      <span
        className={cn(
          "shrink-0 transition-colors",
          isActive ? "text-sky-600" : "text-slate-400 group-hover:text-slate-600",
        )}
      >
        {icon}
      </span>
      <span className={cn("text-xs font-bold truncate", isActive && "font-black")}>
        {label}
      </span>
    </Link>
  );
}
