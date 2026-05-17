"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLinkProps = {
  href: string;
  label: string;
  variant?: "header" | "sidebar";
};

export function NavLink({ href, label, variant = "header" }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);
  const headerClass = isActive
    ? "bg-slate-900 text-white"
    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900";
  const sidebarClass = isActive
    ? "border-slate-900 bg-slate-900 text-white shadow-sm"
    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50";
  const baseClass =
    variant === "sidebar"
      ? `block rounded-2xl border px-4 py-3 text-sm font-medium transition ${sidebarClass}`
      : `rounded-full px-3 py-1.5 transition ${headerClass}`;

  return (
    <Link href={href} className={baseClass}>
      {label}
    </Link>
  );
}
