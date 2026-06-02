import { getSessionContext } from "@/lib/auth-context";
import { redirect } from "next/navigation";
import { OwnerSidebar } from "@/components/owner/owner-sidebar";
import { OwnerPortalNav } from "@/components/owner/owner-portal-nav";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "@/actions/auth";
import Image from "next/image";

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
  const tenantId = session.activeMembership?.tenantId;

  // Update last login + fetch payroll addon in parallel
  const [, payrollRes] = await Promise.all([
    supabase
      .from("app_users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", session.userId),
    tenantId
      ? supabase
          .from("addon_settings")
          .select("is_enabled, settings")
          .eq("tenant_apotek_id", tenantId)
          .eq("addon_key", "payroll")
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const payrollRow = payrollRes.data;
  const showSalaryConfig =
    Boolean(payrollRow?.is_enabled) &&
    Boolean((payrollRow?.settings as Record<string, unknown> | null)?.allow_owner_input);

  async function handleLogout() {
    "use server";
    await logoutAction();
  }

  const userEmail = session.userEmail ?? "owner";

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden w-full">

      {/* ── Desktop Sidebar ── */}
      <div className="hidden md:flex h-screen shrink-0">
        <OwnerSidebar
          userEmail={userEmail}
          handleLogout={handleLogout}
          showSalaryConfig={showSalaryConfig}
        />
      </div>

      {/* ── Mobile Header ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-slate-900 text-white px-4 py-3 flex items-center justify-between shadow-md z-40 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg overflow-hidden ring-1 ring-white/10">
            <Image src="/bba-logo.png" width={32} height={32} alt="Owner Portal" className="w-full h-full object-cover" />
          </div>
          <h1 className="font-bold text-sm text-white tracking-tight">Owner Portal</h1>
        </div>
        <form action={handleLogout}>
          <button type="submit" className="text-rose-400 p-2 hover:text-rose-300 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </form>
      </div>

      {/* ── Main Content ── */}
      <main className="flex-1 h-full overflow-y-auto pt-16 md:pt-0 pb-20 md:pb-0 px-4 md:px-8 lg:px-10 custom-scrollbar">
        <div className="py-6 md:py-8">
          {children}
        </div>
      </main>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 text-white px-1 py-2 flex justify-around items-stretch z-50 border-t border-slate-800 gap-0.5">
        <OwnerPortalNav variant="bottom" showSalaryConfig={showSalaryConfig} />
      </nav>
    </div>
  );
}
