import { createExportJobAction } from "@/app/actions/governance";
import { getSessionContext } from "@/lib/auth-context";
import {
  getExportJobStatusBadgeClass,
  getExportJobStatusLabel,
  humanizeEnum,
} from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

type ExportJobRow = {
  id: string;
  export_type: string;
  format: string;
  status: string;
  created_at: string;
};

export default async function BbaExportCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ feedback?: string; message?: string; page?: string }>;
}) {
  const params = await searchParams;
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return <p className="text-sm text-slate-600">Akses export center hanya untuk BBA.</p>;
  }

  const supabase = await createClient();
  const pageSize = 10;
  const parsedPage = Number(params.page ?? "1");
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
  const offset = (page - 1) * pageSize;
  const { data, count } = await supabase
    .from("export_jobs")
    .select("id, export_type, format, status, created_at", { count: "exact" })
    .eq("tenant_apotek_id", active.tenantId)
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  const jobs = (data ?? []) as ExportJobRow[];
  const feedbackStatus =
    params.feedback === "success" || params.feedback === "error"
      ? params.feedback
      : null;
  const feedbackMessageMap: Record<string, string> = {
    export_queued: "Export job berhasil dibuat dan masuk antrian.",
    invalid_export_type: "Jenis export tidak valid.",
    invalid_format: "Format export tidak valid.",
    create_failed: "Gagal membuat export job. Silakan coba lagi.",
    access_denied: "Akses ditolak untuk aksi ini.",
    user_not_found: "Sesi user tidak ditemukan. Silakan login ulang.",
  };
  const feedbackMessage =
    feedbackStatus && params.message
      ? feedbackMessageMap[params.message] ?? "Aksi selesai."
      : null;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const navParams = new URLSearchParams();
  if (params.feedback) navParams.set("feedback", params.feedback);
  if (params.message) navParams.set("message", params.message);
  const prevParams = new URLSearchParams(navParams);
  prevParams.set("page", String(page - 1));
  const nextParams = new URLSearchParams(navParams);
  nextParams.set("page", String(page + 1));

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">BBA - Export Center</h1>
        <p className="text-sm text-slate-600">
          Export hanya untuk role BBA. Semua request export masuk audit log.
        </p>
      </div>
      {feedbackStatus && feedbackMessage ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedbackStatus === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {feedbackMessage}
        </div>
      ) : null}

      <form action={createExportJobAction} className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="text-sm text-slate-700">
          Jenis Export
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
              <th className="px-3 py-2">Jenis</th>
              <th className="px-3 py-2">Format</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Dibuat</th>
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
      <div className="flex items-center justify-between text-sm text-slate-600">
        <p>
          Halaman {page} dari {totalPages}
        </p>
        <div className="flex gap-2">
          {hasPrev ? (
            <Link
              href={`/bba/export-center?${prevParams.toString()}`}
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
              href={`/bba/export-center?${nextParams.toString()}`}
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
