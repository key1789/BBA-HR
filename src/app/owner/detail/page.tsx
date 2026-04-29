import { getSessionContext } from "@/lib/auth-context";
import { getSubmissionStatusBadgeClass, getSubmissionStatusLabel } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

type DetailRow = {
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

const PAGE_SIZE = 20;
const FILTERABLE_STATUS = ["all", "submitted", "approved", "reject", "edited_by_admin"] as const;

export default async function OwnerDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "owner") {
    return <p className="text-sm text-slate-600">Akses detail owner tidak tersedia.</p>;
  }

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

  const supabase = await createClient();
  let detailQuery = supabase
    .from("daily_submissions")
    .select(
      "id, submission_date, shift_label, omzet_total, transaction_total, product_total, rejected_customer_total, status, user:user_id(full_name)",
      { count: "exact" },
    )
    .eq("tenant_apotek_id", active.tenantId)
    .order("submission_date", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (selectedStatus !== "all") {
    detailQuery = detailQuery.eq("status", selectedStatus);
  }
  if (from) {
    detailQuery = detailQuery.gte("submission_date", from);
  }
  if (to) {
    detailQuery = detailQuery.lte("submission_date", to);
  }

  const [detailRes, approvedRes, submittedRes, rejectRes] = await Promise.all([
    detailQuery,
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("status", "approved"),
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .in("status", ["submitted", "edited_by_admin"]),
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("status", "reject"),
  ]);

  const rows = (detailRes.data ?? []) as DetailRow[];
  const totalPages = Math.max(1, Math.ceil((detailRes.count ?? 0) / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const numberFormatter = new Intl.NumberFormat("id-ID");
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
        <h1 className="text-2xl font-bold text-slate-900">Owner - Detail Data</h1>
        <p className="text-sm text-slate-600">
          Drill-down operasional submission tenant aktif: {active.tenantCode}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Submitted / Menunggu</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {numberFormatter.format(submittedRes.count ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Approved</p>
          <p className="mt-1 text-xl font-semibold text-emerald-700">
            {numberFormatter.format(approvedRes.count ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Reject</p>
          <p className="mt-1 text-xl font-semibold text-rose-700">
            {numberFormatter.format(rejectRes.count ?? 0)}
          </p>
        </div>
      </div>

      <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-4">
        <label className="text-sm text-slate-700">
          Status
          <select
            name="status"
            defaultValue={selectedStatus}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">Semua</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="reject">Reject</option>
            <option value="edited_by_admin">Edited by Admin</option>
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
            Terapkan
          </button>
          <Link
            href="/owner/detail"
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
              <th className="px-3 py-2">User</th>
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
                <td colSpan={8} className="px-3 py-4 text-slate-500">
                  Tidak ada data detail untuk filter ini.
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
                <td className="px-3 py-2">{numberFormatter.format(Number(row.transaction_total))}</td>
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
              href={`/owner/detail?${prevParams.toString()}`}
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
              href={`/owner/detail?${nextParams.toString()}`}
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
