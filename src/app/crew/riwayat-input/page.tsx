/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSessionContext } from "@/lib/auth-context";
import {
  getSubmissionStatusBadgeClass,
  getSubmissionStatusLabel,
} from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { AnimatedPage } from "@/components/shared/animated-page";
import { ClipboardList, PenLine } from "lucide-react";
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
];
const PAGE_SIZE = 20;

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft:          { label: "Draft",        color: "text-slate-600" },
  submitted:      { label: "Submitted",    color: "text-amber-600" },
  approved:       { label: "Approved",     color: "text-sky-600"   },
  edited_by_admin:{ label: "Diedit Admin", color: "text-indigo-600" },
  reject:         { label: "Reject",       color: "text-rose-600"  },
};

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
      <AnimatedPage className="flex items-center justify-center py-20">
        <p className="text-sm text-slate-500 font-bold">Halaman ini hanya untuk crew atau admin apotek.</p>
      </AnimatedPage>
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
  const { data: { user } } = await supabase.auth.getUser();

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

  if (selectedStatus !== "all") query = query.eq("status", selectedStatus);
  if (from) query = query.gte("submission_date", from);
  if (to) query = query.lte("submission_date", to);

  const { data, count } = await query;

  const countByStatus = await Promise.all(
    ["draft", "submitted", "approved", "edited_by_admin", "reject"].map(async (status) => {
      let q = supabase
        .from("daily_submissions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_apotek_id", active.tenantId)
        .eq("user_id", user?.id ?? "")
        .eq("status", status);
      if (from) q = q.gte("submission_date", from);
      if (to)   q = q.lte("submission_date", to);
      const { count: c } = await q;
      return [status, c ?? 0] as const;
    }),
  );

  const rows = (data ?? []) as SubmissionRow[];
  const fmt = new Intl.NumberFormat("id-ID");
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
    <AnimatedPage className="space-y-4 pb-10">

      {/* Header */}
      <div className="bg-white rounded-3xl p-5 shadow-md border border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sky-600 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
            <ClipboardList size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Riwayat Input</h1>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {active.tenantCode} · Semua Periode
            </p>
          </div>
        </div>
      </div>

      {/* Status summary chips */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {(["draft", "submitted", "approved", "edited_by_admin", "reject"] as const).map((s) => {
          const cfg = STATUS_CONFIG[s]!;
          const isActive = selectedStatus === s;
          const filterParams = new URLSearchParams();
          filterParams.set("status", s);
          if (from) filterParams.set("from", from);
          if (to) filterParams.set("to", to);
          return (
            <Link
              key={s}
              href={`/crew/riwayat-input?${filterParams.toString()}`}
              className={`bg-white border rounded-2xl p-4 shadow-sm text-center transition-all ${
                isActive ? "border-sky-400 ring-1 ring-sky-300" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{cfg.label}</p>
              <p className={`mt-1 text-2xl font-black ${cfg.color}`}>
                {fmt.format(statusMap.get(s) ?? 0)}
              </p>
            </Link>
          );
        })}
      </div>

      {/* Filter form */}
      <form className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-4">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Status</span>
            <select
              name="status"
              defaultValue={selectedStatus}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all"
            >
              <option value="all">Semua Status</option>
              {ALLOWED_STATUS.map((s) => (
                <option key={s} value={s}>{getSubmissionStatusLabel(s)}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Dari</span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sampai</span>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all"
            />
          </label>
          <div className="flex items-end gap-2 pt-2">
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

      {/* Quick link */}
      <div className="flex gap-2">
        <Link
          href="/crew/input-harian"
          className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-sky-700 transition-colors shadow-sm"
        >
          <PenLine size={14} />
          Input Baru
        </Link>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest border-b border-slate-200">
            <tr>
              <th className="px-5 py-3.5">Tanggal</th>
              <th className="px-5 py-3.5">Shift</th>
              <th className="px-5 py-3.5 text-right">Omzet</th>
              <th className="px-5 py-3.5 text-right">Transaksi</th>
              <th className="px-5 py-3.5 text-right">Produk</th>
              <th className="px-5 py-3.5 text-right">Tertolak</th>
              <th className="px-5 py-3.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-5 py-8 text-slate-400 text-center text-sm font-medium" colSpan={7}>
                  Tidak ada data sesuai filter.
                </td>
              </tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3 font-bold text-slate-800">{row.submission_date}</td>
                <td className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{row.shift_label}</td>
                <td className="px-5 py-3 text-right font-black text-slate-900">Rp {fmt.format(Number(row.omzet_total))}</td>
                <td className="px-5 py-3 text-right font-medium text-slate-700">{fmt.format(Number(row.transaction_total))}</td>
                <td className="px-5 py-3 text-right font-medium text-slate-700">{fmt.format(Number(row.product_total))}</td>
                <td className="px-5 py-3 text-right font-medium text-slate-700">{fmt.format(Number(row.rejected_customer_total))}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex rounded-xl px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${getSubmissionStatusBadgeClass(row.status)}`}>
                    {getSubmissionStatusLabel(row.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {rows.length === 0 ? (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center">
            <p className="text-sm text-slate-400 font-medium">Tidak ada data sesuai filter.</p>
          </div>
        ) : rows.map((row) => (
          <div key={row.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{row.submission_date}</p>
                <p className="font-black text-slate-800 uppercase text-sm mt-0.5">{row.shift_label}</p>
              </div>
              <span className={`inline-flex rounded-xl px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${getSubmissionStatusBadgeClass(row.status)}`}>
                {getSubmissionStatusLabel(row.status)}
              </span>
            </div>
            <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Omzet</p>
                <p className="font-black text-slate-900 mt-0.5">Rp {fmt.format(Number(row.omzet_total))}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Transaksi</p>
                <p className="font-bold text-slate-700 mt-0.5">{fmt.format(Number(row.transaction_total))}</p>
              </div>
              <div className="mt-1">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Produk</p>
                <p className="font-bold text-slate-700 mt-0.5">{fmt.format(Number(row.product_total))}</p>
              </div>
              <div className="mt-1">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Tertolak</p>
                <p className="font-bold text-slate-700 mt-0.5">{fmt.format(Number(row.rejected_customer_total))}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-slate-600">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
          Halaman {page} dari {totalPages}
        </p>
        <div className="flex gap-2">
          {hasPrev ? (
            <Link href={`/crew/riwayat-input?${prevParams.toString()}`}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 transition-colors">
              ← Sebelumnya
            </Link>
          ) : (
            <span className="rounded-2xl border border-slate-100 px-4 py-2 text-xs font-black text-slate-300">← Sebelumnya</span>
          )}
          {hasNext ? (
            <Link href={`/crew/riwayat-input?${nextParams.toString()}`}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 transition-colors">
              Berikutnya →
            </Link>
          ) : (
            <span className="rounded-2xl border border-slate-100 px-4 py-2 text-xs font-black text-slate-300">Berikutnya →</span>
          )}
        </div>
      </div>
    </AnimatedPage>
  );
}
