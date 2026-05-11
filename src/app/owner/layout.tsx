import { getSessionContext } from "@/lib/auth-context";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LogOut, Crown, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "@/actions/auth";

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionContext();
  const activeRole = session?.activeMembership?.role;

  if (!session || !activeRole || activeRole !== "owner") {
    redirect("/");
  }

  const supabase = await createClient();

  // Update last login
  await supabase
    .from("app_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", session.userId);

  const navItems = [

    { name: "Ringkasan & Laporan", path: "/owner/dashboard", icon: <TrendingUp size={22} /> },
  ];

  async function handleLogout() {
    "use server";
    await logoutAction();
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden w-full">
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex flex-col w-72 bg-slate-900 text-white h-screen shadow-2xl flex-shrink-0">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <div className="w-10 h-10 bg-brand-amber text-slate-900 rounded-xl flex items-center justify-center font-bold">
            <Crown size={20} />
          </div>
          <div>
            <h1 className="font-black text-sm tracking-widest uppercase text-brand-amber">BBA Executive</h1>
            <p className="text-[10px] text-slate-300">Portal Pemilik Apotek</p>
          </div>
        </div>

        <div className="p-6">
          <p className="text-xs text-slate-300 mb-2 font-medium">Halo, Bapak/Ibu</p>
          <p className="font-bold text-lg leading-tight">{session?.userEmail?.split('@')[0] || 'Owner'}</p>
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              {item.icon} {item.name}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <form action={handleLogout} className="w-full">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 text-rose-400 rounded-xl hover:bg-slate-700 transition-colors text-sm font-bold"
            >
              <LogOut size={18} /> Keluar
            </button>
          </form>
        </div>
      </aside>

      {/* MOBILE HEADER */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-slate-900 text-white px-5 py-4 flex items-center justify-between shadow-md z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-amber text-slate-900 rounded-lg flex items-center justify-center font-bold">
            <Crown size={16} />
          </div>
          <h1 className="font-black text-sm tracking-widest uppercase text-brand-amber">BBA Executive</h1>
        </div>
        <form action={handleLogout}>
          <button type="submit" className="text-rose-400 p-2">
            <LogOut size={20} />
          </button>
        </form>
      </div>

      {/* KONTEN UTAMA */}
      <main className="flex-1 h-full overflow-y-auto pt-20 md:pt-8 pb-20 md:pb-8 px-4 md:px-10 relative custom-scrollbar">
        {children}
      </main>

      {/* MOBILE BOTTOM NAVIGATION */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 text-white px-2 py-2 flex justify-around items-center z-50 pb-safe border-t border-slate-800">
        {navItems.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            className="flex flex-col items-center p-2 rounded-xl min-w-[64px] transition-all text-slate-300 hover:text-white"
          >
            <div className="p-2">{item.icon}</div>
            <span className="text-[9px] font-bold mt-1 text-slate-300">{item.name}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
