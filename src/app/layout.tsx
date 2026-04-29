import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionControls } from "@/components/auth/session-controls";
import { getSessionContext } from "@/lib/auth-context";
import { getDefaultPortalPath } from "@/lib/portal";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BBA HR Platform",
  description: "Platform HR untuk operasional dan monitoring apotek",
  icons: {
    icon: "/bba-logo.png",
    apple: "/bba-logo.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSessionContext();
  const activeMembership = session?.activeMembership;
  const activeRole = activeMembership?.role;
  const portalLinks =
    activeRole === "crew"
      ? [
          { href: "/crew/dashboard", label: "Dashboard" },
          { href: "/crew/input-harian", label: "Input Harian" },
          { href: "/crew/riwayat-input", label: "Riwayat" },
          { href: "/crew/leaderboard", label: "Leaderboard" },
        ]
      : activeRole === "admin_apotek"
        ? [
            { href: "/admin/dashboard", label: "Dashboard" },
            { href: "/admin/verifikasi", label: "Verifikasi" },
            { href: "/admin/input-harian", label: "Input Harian" },
            { href: "/admin/laporan", label: "Laporan" },
            { href: "/admin/leaderboard", label: "Leaderboard" },
          ]
        : activeRole === "owner"
          ? [
              { href: "/owner/dashboard", label: "Dashboard" },
              { href: "/owner/laporan", label: "Laporan" },
              { href: "/owner/leaderboard", label: "Leaderboard" },
              { href: "/owner/detail", label: "Detail" },
            ]
          : activeRole === "super_admin_bba"
            ? [
                { href: "/bba/control-dashboard", label: "Control" },
                { href: "/bba/master-apotek", label: "Master Apotek" },
                { href: "/bba/audit-log", label: "Audit Log" },
                { href: "/bba/export-center", label: "Export" },
              ]
            : [];

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
              <Image
                src="/bba-logo.png"
                alt="BBA HR Logo"
                width={32}
                height={32}
                className="rounded-full"
              />
              <span>BBA HR</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm font-medium text-slate-600">
              {portalLinks.map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-slate-900">
                  {item.label}
                </Link>
              ))}
              {activeRole ? (
                <Link href={getDefaultPortalPath(activeRole)} className="hover:text-slate-900">
                  Portal
                </Link>
              ) : null}
              {!session?.userId ? (
                <Link href="/login" className="hover:text-slate-900">
                  Login
                </Link>
              ) : null}
            </nav>
            <div className="flex items-center gap-3">
              {activeMembership ? (
                <div className="hidden text-xs text-slate-600 lg:block">
                  {activeMembership.tenantCode} / {activeMembership.role}
                </div>
              ) : null}
              <SessionControls
                userEmail={session?.userEmail}
                memberships={session?.memberships ?? []}
                activeTenantId={activeMembership?.tenantId}
              />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
