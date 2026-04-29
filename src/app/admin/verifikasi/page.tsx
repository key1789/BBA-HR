import {
  bulkVerifySubmissionsAction,
  verifySubmissionAction,
} from "@/app/actions/operational";
import { getSessionContext } from "@/lib/auth-context";
import {
  getSubmissionStatusBadgeClass,
  getSubmissionStatusLabel,
  getVerificationActionLabel,
} from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

type VerificationQueueRow = {
  id: string;
  submission_date: string;
  shift_label: string;
  omzet_total: number;
  transaction_total: number;
  product_total: number;
  rejected_customer_total: number;
  status: string;
  user: { full_name: string } | { full_name: string }[] | null;
};
const PAGE_SIZE = 15;
const FILTERABLE_STATUS = ["all", "submitted", "edited_by_admin", "reject"] as const;

export default async function AdminVerifikasiPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    status?: string;
    from?: string;
    to?: string;
    feedback?: string;
    message?: string;
    count?: string;
  }>;
}) {
  const params = await searchParams;
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || (active.role !== "admin_apotek" && active.role !== "super_admin_bba")) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Admin - Verifikasi Data</h1>
        <p className="text-sm text-slate-600">
          Halaman ini hanya untuk admin apotek atau super admin BBA.
        </p>
      </section>
    );
  }

  const supabase = await createClient();
  const parsedPage = Number(params.page ?? "1");
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
  const offset = (page - 1) * PAGE_SIZE;
  const selectedStatus = FILTERABLE_STATUS.includes(
    (params.status ?? "all") as (typeof FILTERABLE_STATUS)[number],
  )
    ? (params.status ?? "all")
    : "all";
  const from = params.from ?? "";
  const to = params.to ?? "";

  let query = supabase
    .from("daily_submissions")
    .select(
      "id, submission_date, shift_label, omzet_total, transaction_total, product_total, rejected_customer_total, status, user:user_id(full_name)",
      { count: "exact" },
    )
    .eq("tenant_apotek_id", active.tenantId)
    .order("submission_date", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (selectedStatus !== "all") {
    query = query.eq("status", selectedStatus);
  } else {
    query = query.in("status", ["submitted", "edited_by_admin", "reject"]);
  }
  if (from) {
    query = query.gte("submission_date", from);
  }
  if (to) {
    query = query.lte("submission_date", to);
  }
  const { data, count } = await query;

  const rows = (data ?? []) as VerificationQueueRow[];
  const numberFormatter = new Intl.NumberFormat("id-ID");
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const feedbackStatus =
    params.feedback === "success" || params.feedback === "error"
      ? params.feedback
      : null;
  const feedbackMessageMap: Record<string, string> = {
    bulk_approved: `Bulk approve berhasil untuk ${params.count ?? "0"} submission.`,
    bulk_rejected: `Bulk reject berhasil untuk ${params.count ?? "0"} submission.`,
    bulk_empty: "Pilih minimal satu submission untuk bulk approve.",
    bulk_none_eligible: "Submission terpilih tidak memenuhi syarat approve.",
    bulk_action_invalid: "Aksi bulk tidak valid.",
    bulk_fetch_failed: "Gagal membaca data submission terpilih.",
    bulk_insert_failed: "Bulk approve gagal diproses. Silakan coba lagi.",
    access_denied: "Akses ditolak untuk aksi ini.",
    user_not_found: "Sesi user tidak ditemukan. Silakan login ulang.",
  };
  const feedbackMessage =
    feedbackStatus && params.message
      ? feedbackMessageMap[params.message] ?? "Aksi selesai."
      : null;

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin - Verifikasi Data</h1>
        <p className="text-sm text-slate-600">
          Antrian verifikasi submission crew/admin pada tenant aktif.
        </p>
      </div>
      <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <label className="text-sm text-slate-700">
          Status
          <select
            name="status"
            defaultValue={selectedStatus}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">Semua</option>
            <option value="submitted">Submitted</option>
            <option value="edited_by_admin">Edited by Admin</option>
            <option value="reject">Rejected</option>
          </select>
        </label>
        <label className="text-sm text-slate-700">
          Dari Tanggal
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-slate-700">
          Sampai Tanggal
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Terapkan Filter
          </button>
          <Link
            href="/admin/verifikasi"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
          >
            Reset
          </Link>
        </div>
      </form>
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
      <form action={bulkVerifySubmissionsAction} className="rounded-2xl border border-slate-200 bg-white p-3">
        <input type="hidden" name="page" value={String(page)} />
        <input type="hidden" name="status" value={selectedStatus} />
        <input type="hidden" name="from" value={from} />
        <input type="hidden" name="to" value={to} />
        {rows.map((row) => (
          <input key={row.id} type="hidden" name="submissionIds" value={row.id} />
        ))}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="bulkAction"
            value="approve"
            disabled={rows.length === 0}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              rows.length === 0
                ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                : "bg-slate-900 text-white"
            }`}
          >
            Bulk Approve (Halaman Ini)
          </button>
          <button
            type="submit"
            name="bulkAction"
            value="reject"
            disabled={rows.length === 0}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              rows.length === 0
                ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                : "border border-rose-300 text-rose-700"
            }`}
          >
            Bulk Reject (Halaman Ini)
          </button>
        </div>
      </form>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2">Tanggal</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Shift</th>
              <th className="px-3 py-2">Omzet</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={6}>
                  Tidak ada queue verifikasi.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{row.submission_date}</td>
                <td className="px-3 py-2">
                  {Array.isArray(row.user) ? row.user[0]?.full_name : row.user?.full_name}
                </td>
                <td className="px-3 py-2">{row.shift_label}</td>
                <td className="px-3 py-2">{numberFormatter.format(Number(row.omzet_total))}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getSubmissionStatusBadgeClass(row.status)}`}
                  >
                    {getSubmissionStatusLabel(row.status)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    {(["approve", "reject", "edit_directly"] as const).map((action) => (
                      <form action={verifySubmissionAction} key={`${row.id}-${action}`}>
                        <input type="hidden" name="submissionId" value={row.id} />
                        <input type="hidden" name="action" value={action} />
                        <input
                          type="hidden"
                          name="errorCode"
                          value={action === "approve" ? "" : "verification_issue"}
                        />
                        <button
                          type="submit"
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700"
                        >
                          {getVerificationActionLabel(action)}
                        </button>
                      </form>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(() => {
        const pageParams = new URLSearchParams();
        if (selectedStatus !== "all") pageParams.set("status", selectedStatus);
        if (from) pageParams.set("from", from);
        if (to) pageParams.set("to", to);
        const prevParams = new URLSearchParams(pageParams);
        prevParams.set("page", String(page - 1));
        const nextParams = new URLSearchParams(pageParams);
        nextParams.set("page", String(page + 1));
        return (
      <div className="flex items-center justify-between text-sm text-slate-600">
        <p>
          Halaman {page} dari {totalPages}
        </p>
        <div className="flex gap-2">
          {hasPrev ? (
            <Link
              href={`/admin/verifikasi?${prevParams.toString()}`}
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
              href={`/admin/verifikasi?${nextParams.toString()}`}
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
        );
      })()}
    </section>
  );
}
