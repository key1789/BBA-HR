import { getSessionContext } from "@/lib/auth-context";
import { selectTenantAction, logoutAction } from "@/actions/auth";
import { redirect } from "next/navigation";

const ROLE_LABELS: Record<string, string> = {
  crew: "Crew",
  admin_apotek: "Admin Apotek",
  owner: "Owner",
  super_admin_bba: "Super Admin BBA",
};

export default async function PilihCabangPage() {
  const session = await getSessionContext();

  if (!session) redirect("/login");
  if (session.activeMembership) redirect("/");

  const memberships = session.memberships;

  return (
    <section className="flex min-h-screen w-full items-center justify-center bg-[#E5E7EB] p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl shadow-slate-300/50 overflow-hidden">
        <div className="bg-gradient-to-r from-[#1464e6] to-[#0d4eb8] px-8 py-7 text-white">
          <p className="text-sm font-medium opacity-80 mb-1">Halo, {session.userFullName ?? session.userEmail}</p>
          <h1 className="text-xl font-bold">Pilih Akses</h1>
          <p className="text-xs opacity-70 mt-1">Akun Anda terhubung ke beberapa cabang. Pilih yang ingin Anda masuki.</p>
        </div>

        <div className="p-6 space-y-3">
          {memberships.map((m) => (
            <form key={`${m.tenantId}-${m.role}`} action={selectTenantAction}>
              <input type="hidden" name="tenantId" value={m.tenantId} />
              <input type="hidden" name="role" value={m.role} />
              <button
                type="submit"
                className="w-full text-left rounded-xl border border-slate-200 px-5 py-4 hover:border-[#1464e6] hover:bg-blue-50 transition-all group"
              >
                <p className="text-sm font-bold text-slate-800 group-hover:text-[#1464e6]">
                  {m.tenantName}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {ROLE_LABELS[m.role] ?? m.role} · {m.tenantCode}
                </p>
              </button>
            </form>
          ))}
        </div>

        <div className="px-6 pb-6">
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors py-2"
            >
              Keluar dari akun ini
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
