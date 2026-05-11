import { getSessionContext } from "@/lib/auth-context";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Home, Receipt, CalendarClock, MessageSquare, LogOut, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CrewBottomNav } from "@/components/shared/crew-bottom-nav";
import { logoutAction } from "@/actions/auth";

export default async function CrewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionContext();
  const activeRole = session?.activeMembership?.role;

  if (!session || !activeRole || (activeRole !== "crew" && activeRole !== "admin_apotek")) {
    redirect("/");
  }

  const supabase = await createClient();
  
  // Ambil konfigurasi add-on dari database
  const { data: addons } = await supabase
    .from("addon_settings")
    .select("addon_key, is_enabled")
    .eq("tenant_apotek_id", session.activeMembership?.tenantId || "");

  const branchConfig = {
    addon_absensi: addons?.find(a => a.addon_key === "absensi_shift")?.is_enabled ?? false,
    addon_grooming: addons?.find(a => a.addon_key === "review_internal")?.is_enabled ?? false,
    addon_peer_review: addons?.find(a => a.addon_key === "review_internal")?.is_enabled ?? false,
  };

  const navItems = [
    { name: "Progress", path: "/crew/dashboard", icon: <Home size={22} /> },
    { name: "Input Harian", path: "/crew/input-harian", icon: <Receipt size={22} /> },
  ];

  if (branchConfig.addon_absensi) navItems.push({ name: "Kehadiran", path: "/crew/kehadiran", icon: <CalendarClock size={22} /> });
  if (branchConfig.addon_grooming) navItems.push({ name: "Review Rekan", path: "/crew/review-rekan", icon: <MessageSquare size={22} /> });
  if (branchConfig.addon_peer_review) navItems.push({ name: "Leaderboard", path: "/crew/leaderboard", icon: <ShieldCheck size={22} /> });

  async function handleLogout() {
    "use server";
    await logoutAction();
  }

  return (
    <div className="bg-slate-50 min-h-screen font-sans text-slate-900 flex flex-col md:flex-row w-full">
      {/* SIDEBAR DESKTOP */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 min-h-screen sticky top-0 z-50">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-sky-600 text-white rounded-xl flex items-center justify-center font-bold text-xl shadow-sm">
            B
          </div>
          <div>
            <h1 className="font-black text-slate-800 tracking-tight">BBA Portal</h1>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Crew Access</p>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:text-sky-700 hover:bg-sky-50 transition-all font-medium text-sm group"
            >
              <div className="text-slate-400 group-hover:text-sky-600 transition-colors">
                 {item.icon}
              </div>
              <span className="font-bold">{item.name}</span>
            </Link>
          ))}
        </nav>
      </aside>

      {/* WADAH KONTEN KANAN */}
      <div className="flex-1 flex flex-col relative w-full max-w-full pb-20 md:pb-0 min-h-screen">
        {/* HEADER MOBILE & DESKTOP */}
        <header className="bg-sky-600 px-5 pt-8 pb-16 md:pt-10 md:pb-20 md:px-10 flex items-start justify-between z-0 rounded-b-[2rem] md:rounded-b-[3rem] shadow-sm relative">
          {/* Logo Khusus Mobile */}
          <div className="flex items-center gap-3 md:hidden">
             <div className="w-10 h-10 bg-white text-sky-600 rounded-full flex items-center justify-center font-black shadow-sm text-xl">
                B
             </div>
             <div>
                <h1 className="font-black text-lg text-white tracking-tight">BBA Portal</h1>
                <p className="text-[10px] text-sky-100 uppercase tracking-widest font-bold">Crew Access</p>
             </div>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <h2 className="text-2xl font-black text-white tracking-tight uppercase">Portal Operasional</h2>
          </div>

          <div className="flex items-center gap-3">
            {/* User Profile Info */}
            <div className="hidden md:block text-right mr-2">
              <h1 className="font-bold text-sm text-white leading-tight">
                {session.userFullName || session.userEmail.split('@')[0]}
              </h1>
              <p className="text-[10px] text-sky-200 uppercase tracking-wider font-bold">
                {session.activeMembership?.tenantName || "Apotek"}
              </p>
            </div>
            <div className="w-10 h-10 bg-white/20 text-white rounded-full flex items-center justify-center font-bold border border-white/30 backdrop-blur-sm">
              {(session.userFullName || session.userEmail)?.charAt(0).toUpperCase() || "C"}
            </div>

            {activeRole === "admin_apotek" && (
              <Link
                href="/admin/dashboard"
                className="flex items-center gap-2 bg-white/10 text-white px-3 py-2 rounded-full text-[10px] font-black uppercase transition-all hover:bg-white/20 border border-white/20 shadow-sm ml-2"
              >
                <ShieldCheck size={16} /> <span className="hidden md:inline">Mode Admin</span>
              </Link>
            )}

            <form action={handleLogout}>
              <button type="submit" className="p-2 text-sky-100 hover:text-white hover:bg-white/20 rounded-full transition-colors ml-1">
                <LogOut size={20} />
              </button>
            </form>
          </div>
        </header>

        {/* KONTEN UTAMA */}
        <main className="w-full px-4 md:px-10 flex-1 max-w-5xl mx-auto -mt-10 md:-mt-12 relative z-10 pb-6">
          {children}
        </main>

        {/* BOTTOM NAVIGATION (Dynamic Expanding Pill) */}
        <CrewBottomNav branchConfig={branchConfig} />
      </div>
    </div>
  );
}
