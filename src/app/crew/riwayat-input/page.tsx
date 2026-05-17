import { getSessionContext } from "@/lib/auth-context";
import { Card } from "@/components/shared/card";
import { Input } from "@/components/shared/input";
import { PageHeader } from "@/components/shared/page-header";
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
        <PageHeader
          title="Crew - Riwayat Input"
          subtitle="Halaman ini hanya untuk crew/admin apotek."
        />
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
  const countByStatus = await Promise.all(
    ["draft", "submitted", "approved", "reject"].map(async (status) => {
      let statusQuery = supabase
        .from("daily_submissions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_apotek_id", active.tenantId)
        .eq("user_id", user?.id ?? "")
        .eq("status", status);
      if (from) {
        statusQuery = statusQuery.gte("submission_date", from);
      }
      if (to) {
        statusQuery = statusQuery.lte("submission_date", to);
      }
      const { count: statusCount } = await statusQuery;
      return [status, statusCount ?? 0] as const;
    }),
  );
  const rows = (data ?? []) as SubmissionRow[];
  const numberFormatter = new Intl.NumberFormat("id-ID");
  const statusMap = new Map(countByStatus);
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
      <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-100 relative z-20 mb-6">
         <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Riwayat <span className="text-sky-600">Input</span></h1>
         <p className="text-slate-500 text-sm mt-1 font-medium">Riwayat input pribadi untuk tenant aktif: <span className="font-bold text-slate-700">{active.tenantCode}</span></p>
      </div>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Draft</p>
          <p className="mt-1 text-2xl font-black text-slate-800">
            {numberFormatter.format(statusMap.get("draft") ?? 0)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Submitted</p>
          <p className="mt-1 text-2xl font-black text-amber-600">
            {numberFormatter.format(statusMap.get("submitted") ?? 0)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Approved</p>
          <p className="mt-1 text-2xl font-black text-sky-600">
            {numberFormatter.format(statusMap.get("approved") ?? 0)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reject</p>
          <p className="mt-1 text-2xl font-black text-rose-600">
            {numberFormatter.format(statusMap.get("reject") ?? 0)}
          </p>
        </div>
      </div>

      <form className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm mb-4">
        <div className="grid gap-4 md:grid-cols-4">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Status
            <select
              name="status"
              defaultValue={selectedStatus}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white transition-all"
            >
              <option value="all">Semua Status</option>
              {ALLOWED_STATUS.map((status) => (
                <option key={status} value={status}>
                  {getSubmissionStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Dari
            <Input
              type="date"
              name="from"
              defaultValue={from}
              className="mt-2 rounded-2xl bg-slate-50 border-slate-200 px-4 py-3 text-sm font-bold text-slate-800"
            />
          </label>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Sampai
            <Input
              type="date"
              name="to"
              defaultValue={to}
              className="mt-2 rounded-2xl bg-slate-50 border-slate-200 px-4 py-3 text-sm font-bold text-slate-800"
            />
          </label>
          <div className="flex items-end gap-2 h-full pt-2">
            <button
              type="submit"
              className="flex-1 rounded-2xl bg-slate-900 px-3 py-3.5 text-xs font-black uppercase tracking-widest text-white hover:bg-slate-800 transition-colors shadow-md"
            >
              Filter
            </button>
            <Link
              href="/crew/riwayat-input"
              className="flex-1 rounded-2xl border-2 border-slate-200 bg-white px-3 py-3 text-center text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Reset
            </Link>
          </div>
        </div>
      </form>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/crew/input-harian"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          Input Baru
        </Link>
        <Link
          href="/crew/dashboard"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
        >
          Kembali ke Dashboard
        </Link>
      </div>

      {/* Tampilan Desktop: Tabel */}
      <div className="hidden md:block">
        <Card className="overflow-hidden rounded-2xl shadow-sm border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest">
              <tr>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Shift</th>
                <th className="px-4 py-3 text-right">Omzet</th>
                <th className="px-4 py-3 text-right">Transaksi</th>
                <th className="px-4 py-3 text-right">Produk</th>
                <th className="px-4 py-3 text-right">Rejected</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500 text-center" colSpan={7}>
                    Tidak ada data sesuai filter. Coba reset filter atau buat input baru.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium">{row.submission_date}</td>
                  <td className="px-4 py-3 uppercase text-[10px] font-bold">{row.shift_label}</td>
                  <td className="px-4 py-3 text-right font-medium">{numberFormatter.format(Number(row.omzet_total))}</td>
                  <td className="px-4 py-3 text-right">
                    {numberFormatter.format(Number(row.transaction_total))}
                  </td>
                  <td className="px-4 py-3 text-right">{numberFormatter.format(Number(row.product_total))}</td>
                  <td className="px-4 py-3 text-right">
                    {numberFormatter.format(Number(row.rejected_customer_total))}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${getSubmissionStatusBadgeClass(row.status)}`}
                    >
                      {getSubmissionStatusLabel(row.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Tampilan Mobile: Cards */}
      <div className="md:hidden grid gap-3">
        {rows.length === 0 ? (
           <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center text-sm text-slate-500 font-medium">
              Tidak ada data sesuai filter.
           </div>
        ) : null}
        {rows.map((row) => (
          <div key={row.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm relative overflow-hidden">
             <div className="flex justify-between items-start mb-2">
                <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{row.submission_date}</p>
                   <p className="font-black text-slate-800 uppercase text-sm mt-0.5">{row.shift_label} Shift</p>
                </div>
                <span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${getSubmissionStatusBadgeClass(row.status)}`}>
                   {getSubmissionStatusLabel(row.status)}
                </span>
             </div>
             
             <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                <div>
                   <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Omzet</p>
                   <p className="font-black text-slate-900 leading-tight mt-0.5">Rp {numberFormatter.format(Number(row.omzet_total))}</p>
                </div>
                <div>
                   <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Transaksi</p>
                   <p className="font-black text-slate-700 leading-tight mt-0.5">{numberFormatter.format(Number(row.transaction_total))}</p>
                </div>
                <div className="mt-1">
                   <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Produk</p>
                   <p className="font-black text-slate-700 leading-tight mt-0.5">{numberFormatter.format(Number(row.product_total))}</p>
                </div>
                <div className="mt-1">
                   <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Tertolak</p>
                   <p className="font-black text-slate-700 leading-tight mt-0.5">{numberFormatter.format(Number(row.rejected_customer_total))}</p>
                </div>
             </div>
          </div>
        ))}
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
