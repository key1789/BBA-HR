import { getSessionContext } from "@/lib/auth-context";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BbaSidebar } from "@/components/layout/bba-sidebar";
import { logoutAction } from "@/actions/auth";
import { bbaPortalHasFullMenuAccess } from "@/lib/bba-portal-guard";

export default async function BbaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionContext();
  const activeRole = session?.activeMembership?.role;

  if (!session || !activeRole || activeRole !== "super_admin_bba") {
    redirect("/");
  }

  if (session.bbaPortalStaffRole === "analyst" && !(session.bbaPortalMenuKeys?.length ?? 0)) {
    redirect("/waiting");
  }

  const supabase = await createClient();
  
  // Update last login
  await supabase
    .from("app_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", session.userId);

  async function handleLogout() {

    "use server";
    await logoutAction();
  }

  return (
    <div className="h-screen w-full flex bg-slate-50 font-sans text-slate-800 overflow-hidden">
      <BbaSidebar
        session={session}
        handleLogout={handleLogout}
        bbaMenuFilter={bbaPortalHasFullMenuAccess(session) ? null : session.bbaPortalMenuKeys ?? []}
      />
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="flex-1 px-6 sm:px-10 py-8 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </main>
    </div>
  );
}
