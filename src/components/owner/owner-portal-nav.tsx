"use client";

import Link from "next/link";
import { LinkPendingHint } from "@/components/shared/link-pending-hint";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardList, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { path: "/owner/penjualan-kinerja", label: "Penjualan & kinerja", Icon: BarChart3 },
  { path: "/owner/ringkasan-bonus", label: "Ringkasan & bonus", Icon: ClipboardList },
  { path: "/owner/data-karyawan", label: "Data per karyawan", Icon: Users },
] as const;

function isActive(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

type Variant = "sidebar" | "bottom";

export function OwnerPortalNav({ variant }: { variant: Variant }) {
  const pathname = usePathname() ?? "";

  if (variant === "sidebar") {
    return (
      <>
        {NAV.map((item) => {
          const active = isActive(pathname, item.path);
          return (
            <Link
              key={item.path}
              href={item.path}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm",
                active ? "bg-brand-amber text-slate-900 shadow-md" : "text-slate-300 hover:bg-slate-800 hover:text-white",
              )}
            >
              <item.Icon size={22} strokeWidth={active ? 2.25 : 2} />
              <span className="flex-1">{item.label}</span>
              <LinkPendingHint className={active ? "text-slate-900" : "text-slate-400"} />
            </Link>
          );
        })}
      </>
    );
  }

  return (
    <>
      {NAV.map((item) => {
        const active = isActive(pathname, item.path);
        return (
          <Link
            key={item.path}
            href={item.path}
            className={cn(
              "flex flex-col items-center p-1.5 rounded-xl min-w-[72px] max-w-[33vw] transition-all",
              active ? "text-brand-amber" : "text-slate-300 hover:text-white",
            )}
          >
            <div className={cn("p-1.5 rounded-lg", active && "bg-slate-800")}>
              <item.Icon size={20} strokeWidth={active ? 2.25 : 2} />
            </div>
            <span className="text-[8px] font-bold mt-0.5 text-center leading-tight line-clamp-2 px-0.5">{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}
