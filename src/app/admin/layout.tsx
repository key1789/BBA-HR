import { getSessionContext } from "@/lib/auth-context";
import { getUnreadNotificationCount } from "@/lib/notifications";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { Home, ClipboardCheck, BarChart3, LogOut, ShieldCheck, UserCircle2, Megaphone } from "lucide-react";
import { logoutAction } from "@/actions/auth";

// Komponen async terpisah agar tidak memblokir render layout utama.
async function AdminUnreadBadge({ userId }: { userId: string }) {
  const count = await getUnreadNotificationCount(userId);
  if (count === 0) return null;
  return (
    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none">
      {Math.min(count, 99)}
    </span>
  );
}

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

  const navItems = [
    { name: "Dashboard",      path: "/admin/dashboard",  icon: <Home size={22} />,          showBadge: false },
    { name: "Verifikasi crew",path: "/admin/verifikasi", icon: <ClipboardCheck size={22} />, showBadge: true  },
    { name: "Laporan",        path: "/admin/laporan",    icon: <BarChart3 size={22} />,      showBadge: false },
    { name: "Pengumuman",     path: "/admin/pengumuman", icon: <Megaphone size={22} />,      showBadge: false },
  ];

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
          {/* TOMBOL PINDAH KE MODE CREW */}
          <Link
            href="/crew/dashboard"
            className="flex items-center gap-2 bg-brand-emerald/10 text-brand-emerald px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter border border-brand-emerald/20 hover:bg-brand-emerald/20 transition-all"
          >
            <UserCircle2 size={16} /> Mode Crew
          </Link>

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
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-slate-100 px-4 py-3 flex justify-around items-center z-50 shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.05)]">
        {navItems.map((item) => {
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex flex-col items-center p-2 rounded-2xl min-w-[64px] transition-all duration-300 text-slate-400 opacity-60 hover:opacity-100 hover:text-indigo-600`}
            >
              <div className="relative">
                {item.icon}
                {item.showBadge && (
                  <Suspense fallback={null}>
                    <AdminUnreadBadge userId={session.userId} />
                  </Suspense>
                )}
              </div>
              <span className={`text-[9px] font-black mt-1 uppercase tracking-tighter text-slate-500`}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
