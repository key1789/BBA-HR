import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";

type WorkforceRequestRow = {
  id: string;
  position_title: string;
  headcount_needed: number;
  priority_level: string;
  status: string;
  tenant_apotek:
    | {
        name: string;
      }
    | {
        name: string;
      }[]
    | null;
};

export default async function RequestsPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeMembership?.tenantId;

  if (!tenantId) {
    return (
      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Workforce Requests</h1>
          <p className="text-sm text-slate-600">
            Belum ada tenant aktif pada akun ini.
          </p>
        </div>
      </section>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workforce_requests")
    .select("id, position_title, headcount_needed, priority_level, status, tenant_apotek:tenant_apotek_id(name)")
    .eq("tenant_apotek_id", tenantId)
    .order("created_at", { ascending: false });

  const workforceRequests = (data ?? []) as WorkforceRequestRow[];

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Workforce Requests</h1>
        <p className="text-sm text-slate-600">
          Intake kebutuhan SDM dari tenant apotek.
        </p>
        <p className="text-xs text-slate-500">
          Tenant aktif: {session?.activeMembership?.tenantCode}
        </p>
      </div>
      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Gagal memuat data request dari Supabase. Cek RLS/membership tenant.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">Posisi</th>
              <th className="px-4 py-3">Headcount</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {workforceRequests.map((request) => (
              <tr key={request.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{request.id}</td>
                <td className="px-4 py-3">
                  {Array.isArray(request.tenant_apotek)
                    ? request.tenant_apotek[0]?.name
                    : request.tenant_apotek?.name}
                </td>
                <td className="px-4 py-3">{request.position_title}</td>
                <td className="px-4 py-3">{request.headcount_needed}</td>
                <td className="px-4 py-3 capitalize">{request.priority_level}</td>
                <td className="px-4 py-3">{request.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
