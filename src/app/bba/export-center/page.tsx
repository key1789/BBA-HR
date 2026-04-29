import { createExportJobAction } from "@/app/actions/governance";
import { getSessionContext } from "@/lib/auth-context";
import {
  getExportJobStatusBadgeClass,
  getExportJobStatusLabel,
  humanizeEnum,
} from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

type ExportJobRow = {
  id: string;
  export_type: string;
  format: string;
  status: string;
  created_at: string;
};

export default async function BbaExportCenterPage() {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return <p className="text-sm text-slate-600">Akses export center hanya untuk BBA.</p>;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("export_jobs")
    .select("id, export_type, format, status, created_at")
    .eq("tenant_apotek_id", active.tenantId)
    .order("created_at", { ascending: false })
    .limit(20);

  const jobs = (data ?? []) as ExportJobRow[];

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">BBA - Export Center</h1>
        <p className="text-sm text-slate-600">
          Export hanya untuk role BBA. Semua request export masuk audit log.
        </p>
      </div>

      <form action={createExportJobAction} className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="text-sm text-slate-700">
          Export Type
          <select name="exportType" className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="tasks">Tasks</option>
            <option value="candidates">Candidates</option>
            <option value="payroll">Payroll</option>
          </select>
        </label>
        <label className="text-sm text-slate-700">
          Format
          <select name="format" className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="csv">CSV</option>
            <option value="pdf">PDF</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          Buat Export Job
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Format</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-slate-500">
                  Belum ada export job.
                </td>
              </tr>
            ) : null}
            {jobs.map((job) => (
              <tr key={job.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{job.id}</td>
                <td className="px-3 py-2">{humanizeEnum(job.export_type)}</td>
                <td className="px-3 py-2">{job.format.toUpperCase()}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getExportJobStatusBadgeClass(job.status)}`}
                  >
                    {getExportJobStatusLabel(job.status)}
                  </span>
                </td>
                <td className="px-3 py-2">{new Date(job.created_at).toLocaleString("id-ID")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
