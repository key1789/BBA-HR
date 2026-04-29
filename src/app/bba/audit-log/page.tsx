import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";

type AuditLogRow = {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  actor:
    | {
        full_name: string;
        email: string;
      }
    | {
        full_name: string;
        email: string;
      }[]
    | null;
};

function actorLabel(
  actor: AuditLogRow["actor"],
): { fullName?: string; email?: string } {
  if (!actor) {
    return {};
  }
  if (Array.isArray(actor)) {
    return actor[0] ?? {};
  }
  return actor;
}

function compactJson(value: Record<string, unknown> | null): string {
  if (!value) {
    return "-";
  }
  return JSON.stringify(value);
}

export default async function BbaAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; entity?: string }>;
}) {
  const params = await searchParams;
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return <p className="text-sm text-slate-600">Akses audit log hanya untuk BBA.</p>;
  }

  const supabase = await createClient();
  let query = supabase
    .from("activity_logs")
    .select(
      "id, created_at, action, entity_type, entity_id, old_value, new_value, actor:actor_user_id(full_name, email)",
    )
    .eq("tenant_apotek_id", active.tenantId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (params.action) {
    query = query.eq("action", params.action);
  }
  if (params.entity) {
    query = query.eq("entity_type", params.entity);
  }

  const { data } = await query;
  const rows = (data ?? []) as AuditLogRow[];

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">BBA - Audit Log</h1>
        <p className="text-sm text-slate-600">
          Jejak aksi sensitif tenant aktif: {active.tenantCode}
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <label className="text-sm text-slate-700">
          Action
          <input
            type="text"
            name="action"
            defaultValue={params.action ?? ""}
            placeholder="mis. export_requested"
            className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-slate-700">
          Entity
          <input
            type="text"
            name="entity"
            defaultValue={params.entity ?? ""}
            placeholder="mis. payroll_periods"
            className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          Filter
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2">Waktu</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Old</th>
              <th className="px-3 py-2">New</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-slate-500">
                  Tidak ada data audit untuk filter ini.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => {
              const actor = actorLabel(row.actor);
              return (
                <tr key={row.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(row.created_at).toLocaleString("id-ID")}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{actor.fullName ?? "-"}</div>
                    <div className="text-slate-500">{actor.email ?? "-"}</div>
                  </td>
                  <td className="px-3 py-2">{row.action}</td>
                  <td className="px-3 py-2">
                    <div>{row.entity_type}</div>
                    <div className="text-slate-500">{row.entity_id}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{compactJson(row.old_value)}</td>
                  <td className="px-3 py-2 text-slate-600">{compactJson(row.new_value)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
