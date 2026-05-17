"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { SessionContext } from "@/lib/auth-context";
import type { BbaPortalMenuKey } from "@/lib/bba-portal-menus";
import { 
  LayoutDashboard, Building2, Store, Package, 
  ClipboardCheck, Download, Megaphone, ShieldCheck, 
  ChevronLeft, ChevronRight, HeartPulse, LogOut, Banknote
} from "lucide-react";

const MENU_GROUPS: {
  label: string;
  items: { name: string; path: string; icon: typeof LayoutDashboard; menuKey: BbaPortalMenuKey }[];
}[] = [
  {
    label: "Pusat Kontrol",
    items: [{ name: "Dashboard", path: "/bba/dashboard", icon: LayoutDashboard, menuKey: "dashboard" }],
  },
  {
    label: "Master Data",
    items: [
      { name: "Kelola Data Owner", path: "/bba/owners", icon: Building2, menuKey: "owners" },
      { name: "Manajemen Apotek", path: "/bba/branches", icon: Store, menuKey: "branches" },
      { name: "Master Produk Fokus", path: "/bba/products", icon: Package, menuKey: "products" },
    ],
  },
  {
    label: "Operasional & Audit",
    items: [
      { name: "Approval & Audit", path: "/bba/audit", icon: ClipboardCheck, menuKey: "audit" },
      { name: "Pratinjau THP & Rapor Bulanan", path: "/bba/payroll", icon: Banknote, menuKey: "payroll" },
      { name: "Pusat Unduhan", path: "/bba/export", icon: Download, menuKey: "export" },
      { name: "Pusat Pengumuman", path: "/bba/broadcast", icon: Megaphone, menuKey: "broadcast" },
    ],
  },
  {
    label: "Manajemen Sistem",
    items: [{ name: "Kelola Super Admin", path: "/bba/admins", icon: ShieldCheck, menuKey: "admins" }],
  },
];

export function BbaSidebar({
  session,
  handleLogout,
  bbaMenuFilter,
}: {
  session: SessionContext;
  handleLogout: () => Promise<void>;
  /** null = semua menu (global / legacy); array = hanya key yang diizinkan (analyst) */
  bbaMenuFilter: string[] | null;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();

  const allowed = bbaMenuFilter === null ? null : new Set(bbaMenuFilter);

  const portalLabel =
    session?.isGlobalSuperAdmin ? "Super Admin Global" : session?.bbaPortalStaffRole === "analyst" ? "Analyst BBA" : "Super Admin BBA";

  return (
    <motion.aside 
      animate={{ width: isCollapsed ? 88 : 288 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="bg-slate-900 flex flex-col z-50 relative pt-8 pb-6 px-3 border-r border-slate-800 text-slate-300"
    >
      {/* Toggle Button */}
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute top-10 -right-4 w-8 h-8 bg-slate-800 text-slate-400 border border-slate-700 rounded-full shadow-md flex items-center justify-center hover:text-white transition-colors z-50"
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      {/* Logo Area */}
      <div className={cn("flex items-center gap-3 mb-10", isCollapsed ? "justify-center" : "px-2")}>
        <div className="w-10 h-10 min-w-[40px] bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-900 shrink-0">
          <HeartPulse className="w-6 h-6 text-white" />
        </div>
        {!isCollapsed && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col overflow-hidden"
          >
            <h1 className="font-bold text-lg leading-tight tracking-tight text-white whitespace-nowrap">BBA Portal</h1>
            <p className="text-[10px] font-bold text-indigo-400 tracking-wider whitespace-nowrap">APOTEK SYSTEM</p>
          </motion.div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-6">
        {MENU_GROUPS.map((group, groupIdx) => {
          const visibleItems = group.items.filter(
            (item) => allowed === null || allowed.has(item.menuKey),
          );
          if (visibleItems.length === 0) return null;
          return (
          <div key={groupIdx} className="mb-6">
            {!isCollapsed && (
              <h3 className="px-3 mb-2 text-[10px] font-bold text-slate-500 tracking-wider uppercase whitespace-nowrap">
                {group.label}
              </h3>
            )}
            
            <div className="space-y-1">
              {visibleItems.map((item) => {
                const isActive = pathname.startsWith(item.path);
                const Icon = item.icon;
                
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={cn(
                      "flex items-center gap-3 rounded-xl transition-all duration-200 group relative",
                      isCollapsed ? "justify-center py-3.5 px-0" : "px-4 py-3.5",
                      isActive 
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/50" 
                        : "text-slate-400 hover:bg-slate-800 hover:text-white"
                    )}
                  >
                    <Icon size={20} className={cn("shrink-0", isActive ? "text-white" : "text-slate-400 group-hover:text-white")} />
                    
                    {!isCollapsed && (
                      <span className={cn(
                        "font-medium text-sm whitespace-nowrap",
                        isActive ? "text-white" : ""
                      )}>
                        {item.name}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>

      {/* Profile & Logout at bottom */}
      <div className="pt-4 mt-auto border-t border-slate-800">
         <div className={cn(
           "flex items-center gap-3 p-2 rounded-2xl transition-all duration-300",
           isCollapsed ? "justify-center" : "bg-slate-800 border border-slate-700"
         )}>
            <div className="w-10 h-10 min-w-[40px] bg-indigo-900 text-indigo-100 rounded-xl flex items-center justify-center font-bold shadow-sm shrink-0">
               {session?.userEmail?.charAt(0).toUpperCase() || "A"}
            </div>
            
            {!isCollapsed && (
               <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate leading-none mb-1">
                     {session?.userEmail?.split('@')[0] || "Admin"}
                  </p>
                  <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">
                     {portalLabel}
                  </p>
               </div>
            )}

            <form action={handleLogout}>
               <button 
                 type="submit"
                 className={cn(
                   "p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-700 rounded-lg transition-all",
                   isCollapsed && "hidden"
                 )}
                 title="Logout"
               >
                  <LogOut size={18} />
               </button>
            </form>
         </div>

         {isCollapsed && (
            <form action={handleLogout} className="mt-2 flex justify-center">
               <button type="submit" className="p-3 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition-colors">
                  <LogOut size={20} />
               </button>
            </form>
         )}
      </div>
    </motion.aside>
  );
}
