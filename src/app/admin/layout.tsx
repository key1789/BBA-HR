import { getSessionContext } from "@/lib/auth-context";
import { getUnreadNotificationCount } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard,
  ClipboardCheck,
  Banknote,
  CalendarDays,
  Star,
  LogOut,
} from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { AdminBottomNav } from "./admin-bottom-nav";
import { SidebarLink } from "@/components/shared/crew-sidebar-link";
import { SwitchModeModal } from "@/components/shared/switch-mode-modal";

const SIDEBAR_ITEMS = [
  { name: "Dashboard",  path: "/admin/dashboard",          icon: LayoutDashboard },
  { name: "Verifikasi", path: "/admin/verifikasi",          icon: ClipboardCheck  },
  { name: "Absensi",    path: "/admin/absensi",             icon: CalendarDays    },
  { name: "Review",     path: "/admin/review-pelanggan",   icon: Star            },
  { name: "Setup Gaji", path: "/admin/konfigurasi-gaji",   icon: Banknote        },
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionContext();
  const activeRole = session?.activeMembership?.role;

  if (!session || !activeRole) {
    redirect("/login");
  }
  if (activeRole !== "admin_apotek") {
    redirect("/");
  }

  const supabase = await createClient();
  const tenantId = session.activeMembership?.tenantId;

  const [unreadCount, pendingAttendanceCount] = await Promise.all([
    getUnreadNotificationCount(session.userId).catch(() => 0),
    (async (): Promise<number> => {
      if (!tenantId) return 0;
      try {
        const [{ count: leaveCount }, { count: swapCount }] = await Promise.all([
          supabase
            .from("leave_requests")
            .select("id", { count: "exact", head: true })
            .eq("tenant_apotek_id", tenantId)
            .eq("status", "pending"),
          supabase
            .from("shift_swap_requests")
            .select("id", { count: "exact", head: true })
            .eq("tenant_apotek_id", tenantId)
            .in("status", ["pending_crew", "pending_admin"]),
        ]);
        return (leaveCount ?? 0) + (swapCount ?? 0);
      } catch {
        return 0;
      }
    })(),
  ]);

  const userName    = session.userFullName || session.userEmail?.split("@")[0] || "Admin";
  const userInitial = userName.charAt(0).toUpperCase();
  const tenantName  = session.activeMembership?.tenantName ?? "Apotek";

  async function handleLogout() {
    "use server";
    await logoutAction();
  }

  return (
    <div className="bg-slate-50 min-h-screen font-sans text-slate-900 flex flex-col md:flex-row w-full">

      {/* ── SIDEBAR DESKTOP ── */}
      <aside className="hidden md:flex flex-col w-60 lg:w-64 bg-white border-r border-slate-100 h-screen sticky top-0 z-50 shrink-0">

        {/* Brand */}
        <div className="px-5 py-5 border-b border-slate-100 flex items-center gap-3">
          <Image src="/bba-logo.png" alt="BBA System" width={36} height={36} className="rounded-xl shrink-0" />
          <div className="min-w-0">
            <p className="font-black text-slate-800 tracking-tight text-sm leading-none">BBA System</p>
            <p className="text-[9px] text-slate-400 uppercase font-bold tracking-widest mt-0.5">Admin Access</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {SIDEBAR_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <SidebarLink key={item.path} href={item.path} icon={<Icon size={17} />} label={item.name} />
            );
          })}
        </nav>

        {/* User card + logout */}
        <div className="border-t border-slate-100 px-3 py-3 space-y-1">
          {/* User info */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50">
            <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center font-black text-sm shrink-0">
              {userInitial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-slate-800 truncate">{userName}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide truncate">{tenantName}</p>
            </div>
          </div>

          {/* Crew mode shortcut */}
          <SwitchModeModal target="crew" />

          {/* Logout */}
          <form action={handleLogout}>
            <button
              type="submit"
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors group"
            >
              <LogOut size={16} className="shrink-0" />
              <span className="text-xs font-bold">Keluar</span>
            </button>
          </form>
        </div>
      </aside>

      {/* ── KONTEN KANAN ── */}
      <div className="flex-1 flex flex-col w-full min-w-0 pb-20 md:pb-0">

        {/* Mobile header */}
        <header className="md:hidden bg-sky-600 px-5 pt-8 pb-16 flex items-center justify-between rounded-b-[2rem] shadow-sm relative z-0">
          <div className="flex items-center gap-3">
            <Image src="/bba-logo.png" alt="BBA System" width={36} height={36} className="rounded-full shrink-0" />
            <div>
              <p className="font-black text-base text-white tracking-tight leading-none">BBA System</p>
              <p className="text-[9px] text-sky-200 uppercase tracking-widest font-bold mt-0.5">Admin Access</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SwitchModeModal target="crew" variant="pill" />
            <form action={handleLogout}>
              <button type="submit" className="p-2 text-sky-200 hover:text-white hover:bg-white/20 rounded-full transition-colors">
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </header>

        {/* Desktop header strip */}
        <header className="hidden md:flex items-center px-8 py-3.5 bg-white border-b border-slate-100 sticky top-0 z-40 shadow-sm">
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Portal Admin</p>
        </header>

        {/* Main content */}
        <main className="w-full px-4 md:px-8 flex-1 max-w-5xl mx-auto -mt-10 md:mt-0 relative pb-6 md:py-6">
          {children}
        </main>

        {/* Bottom nav (mobile only) */}
        <AdminBottomNav unreadCount={unreadCount} pendingAttendanceCount={pendingAttendanceCount} />
      </div>
    </div>
  );
}
