import { getSessionContext } from "@/lib/auth-context";
import {
  getSubmissionStatusBadgeClass,
  getSubmissionStatusLabel,
} from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

type SubmissionStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "reject"
  | "edited_by_admin"
  | "missing_submission";

type SubmissionRow = {
  id: string;
  submission_date: string;
  shift_label: string;
  omzet_total: number;
  transaction_total: number;
  product_total: number;
  rejected_customer_total: number;
  status: SubmissionStatus;
};

type SearchParams = {
  status?: string;
  from?: string;
  to?: string;
  page?: string;
};

const ALLOWED_STATUS: SubmissionStatus[] = [
  "draft",
  "submitted",
  "approved",
  "reject",
  "edited_by_admin",
  "missing_submission",
];
const PAGE_SIZE = 20;

export default async function CrewRiwayatInputPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const session = await getSessionContext();
  const active = session?.activeMembership;

  if (!active || (active.role !== "crew" && active.role !== "admin_apotek")) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Crew - Riwayat Input</h1>
        <p className="text-sm text-slate-600">Halaman ini hanya untuk crew/admin apotek.</p>
      </section>
    );
  }

  const selectedStatus = ALLOWED_STATUS.includes(params.status as SubmissionStatus)
    ? (params.status as SubmissionStatus)
    : "all";
  const from = params.from ?? "";
  const to = params.to ?? "";
  const parsedPage = Number(params.page ?? "1");
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let query = supabase
    .from("daily_submissions")
    .select(
      "id, submission_date, shift_label, omzet_total, transaction_total, product_total, rejected_customer_total, status",
      { count: "exact" },
    )
    .eq("tenant_apotek_id", active.tenantId)
    .eq("user_id", user?.id ?? "")
    .order("submission_date", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (selectedStatus !== "all") {
    query = query.eq("status", selectedStatus);
  }
  if (from) {
    query = query.gte("submission_date", from);
  }
  if (to) {
    query = query.lte("submission_date", to);
  }

  const { data, count } = await query;
  const rows = (data ?? []) as SubmissionRow[];
  const numberFormatter = new Intl.NumberFormat("id-ID");
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const pageParams = new URLSearchParams();
  if (selectedStatus !== "all") pageParams.set("status", selectedStatus);
  if (from) pageParams.set("from", from);
  if (to) pageParams.set("to", to);
  const prevParams = new URLSearchParams(pageParams);
  prevParams.set("page", String(page - 1));
  const nextParams = new URLSearchParams(pageParams);
  nextParams.set("page", String(page + 1));

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Crew - Riwayat Input</h1>
        <p className="text-sm text-slate-600">
          Riwayat input pribadi untuk tenant aktif: {active.tenantCode}
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
            {ALLOWED_STATUS.map((status) => (
              <option key={status} value={status}>
                {getSubmissionStatusLabel(status)}
              </option>
            ))}
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
            href="/crew/riwayat-input"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
          >
            Reset
          </Link>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2">Tanggal</th>
              <th className="px-3 py-2">Shift</th>
              <th className="px-3 py-2">Omzet</th>
              <th className="px-3 py-2">Transaksi</th>
              <th className="px-3 py-2">Produk</th>
              <th className="px-3 py-2">Rejected</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={7}>
                  Belum ada data yang sesuai filter.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{row.submission_date}</td>
                <td className="px-3 py-2">{row.shift_label}</td>
                <td className="px-3 py-2">{numberFormatter.format(Number(row.omzet_total))}</td>
                <td className="px-3 py-2">
                  {numberFormatter.format(Number(row.transaction_total))}
                </td>
                <td className="px-3 py-2">{numberFormatter.format(Number(row.product_total))}</td>
                <td className="px-3 py-2">
                  {numberFormatter.format(Number(row.rejected_customer_total))}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getSubmissionStatusBadgeClass(row.status)}`}
                  >
                    {getSubmissionStatusLabel(row.status)}
                  </span>
                </td>
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
              href={`/crew/riwayat-input?${prevParams.toString()}`}
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
              href={`/crew/riwayat-input?${nextParams.toString()}`}
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
