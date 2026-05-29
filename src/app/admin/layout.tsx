import { getSessionContext } from "@/lib/auth-context";
import { getUnreadNotificationCount } from "@/lib/notifications";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { AdminBottomNav } from "./admin-bottom-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionContext();
  const activeRole = session?.activeMembership?.role;

  if (!session || !activeRole || activeRole !== "admin_apotek") {
    redirect("/");
  }

  const unreadCount = await getUnreadNotificationCount(session.userId);

  async function handleLogout() {
    "use server";
    await logoutAction();
  }

  return (
    <div className="bg-slate-50 min-h-screen font-sans text-slate-900 pb-24 w-full">
      {/* HEADER PORTAL ADMIN */}
      <header className="bg-white/80 backdrop-blur-md px-5 py-4 flex items-center justify-between shadow-sm sticky top-0 z-40 border-b border-indigo-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 text-white rounded-2xl flex items-center justify-center font-bold shadow-lg shadow-indigo-200 relative">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h1 className="font-black text-sm text-slate-800 leading-tight">Admin Portal</h1>
            <p className="text-[10px] text-indigo-500 uppercase tracking-widest font-bold">
              {session?.activeMembership?.tenantName || "Apotek"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <form action={handleLogout}>
            <button type="submit" className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
              <LogOut size={20} />
            </button>
          </form>
        </div>
      </header>

      {/* AREA KONTEN UTAMA */}
      <main className="w-full mx-auto p-4 md:px-10 animate-in fade-in duration-500">
        {children}
      </main>

      {/* BOTTOM NAVIGATION (Mobile Style) */}
      <AdminBottomNav unreadCount={unreadCount} />
    </div>
  );
}
