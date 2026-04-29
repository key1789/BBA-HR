import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

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
const PAGE_SIZE = 30;

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
  searchParams: Promise<{ action?: string; entity?: string; page?: string; days?: string }>;
}) {
  const params = await searchParams;
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return <p className="text-sm text-slate-600">Akses audit log hanya untuk BBA.</p>;
  }

  const supabase = await createClient();
  const parsedPage = Number(params.page ?? "1");
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
  const offset = (page - 1) * PAGE_SIZE;
  const parsedDays = Number(params.days ?? "7");
  const days =
    Number.isFinite(parsedDays) && [1, 7, 30].includes(parsedDays) ? parsedDays : 7;
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const fromIso = fromDate.toISOString();
  let query = supabase
    .from("activity_logs")
    .select(
      "id, created_at, action, entity_type, entity_id, old_value, new_value, actor:actor_user_id(full_name, email)",
      { count: "exact" },
    )
    .eq("tenant_apotek_id", active.tenantId)
    .gte("created_at", fromIso)
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (params.action) {
    query = query.eq("action", params.action);
  }
  if (params.entity) {
    query = query.eq("entity_type", params.entity);
  }

  const { data, count } = await query;
  const rows = (data ?? []) as AuditLogRow[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const pageParams = new URLSearchParams();
  if (params.action) pageParams.set("action", params.action);
  if (params.entity) pageParams.set("entity", params.entity);
  pageParams.set("days", String(days));
  const prevParams = new URLSearchParams(pageParams);
  prevParams.set("page", String(page - 1));
  const nextParams = new URLSearchParams(pageParams);
  nextParams.set("page", String(page + 1));
  const summary = rows.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.action.includes("payroll") || row.action.includes("export")) {
        acc.governanceCritical += 1;
      }
      if (row.action.includes("reject") || row.action.includes("unlock")) {
        acc.needsReview += 1;
      }
      return acc;
    },
    { total: 0, governanceCritical: 0, needsReview: 0 },
  );

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">BBA - Audit Log</h1>
        <p className="text-sm text-slate-600">
          Jejak aksi sensitif tenant aktif: {active.tenantCode}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Total Event ({days} hari)</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{summary.total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Governance Critical</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{summary.governanceCritical}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Perlu Review</p>
          <p className="mt-1 text-xl font-semibold text-amber-700">{summary.needsReview}</p>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <label className="text-sm text-slate-700">
          Aksi
          <input
            type="text"
            name="action"
            defaultValue={params.action ?? ""}
            placeholder="mis. export_requested"
            className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-slate-700">
          Entitas
          <input
            type="text"
            name="entity"
            defaultValue={params.entity ?? ""}
            placeholder="mis. payroll_periods"
            className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-slate-700">
          Periode
          <select
            name="days"
            defaultValue={String(days)}
            className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="1">1 hari</option>
            <option value="7">7 hari</option>
            <option value="30">30 hari</option>
          </select>
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
              <th className="px-3 py-2">Pelaku</th>
              <th className="px-3 py-2">Aksi</th>
              <th className="px-3 py-2">Entitas</th>
              <th className="px-3 py-2">Data Lama</th>
              <th className="px-3 py-2">Data Baru</th>
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
      <div className="flex items-center justify-between text-sm text-slate-600">
        <p>
          Halaman {page} dari {totalPages}
        </p>
        <div className="flex gap-2">
          {hasPrev ? (
            <Link
              href={`/bba/audit-log?${prevParams.toString()}`}
              className="rounded-md border border-slate-300 px-3 py-1 font-medium text-slate-700"
            >
              Sebelumnya
            </Link>
          ) : (
            <span className="rounded-md border border-slate-200 px-3 py-1 text-slate-400">
              Sebelumnya
            </span>
          )}
          {hasNext ? (
            <Link
              href={`/bba/audit-log?${nextParams.toString()}`}
              className="rounded-md border border-slate-300 px-3 py-1 font-medium text-slate-700"
            >
              Berikutnya
            </Link>
          ) : (
            <span className="rounded-md border border-slate-200 px-3 py-1 text-slate-400">
              Berikutnya
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
