import { Button } from "@/components/shared/button";
import { Input } from "@/components/shared/input";
import { getSubmissionFilterStatusLabel } from "@/lib/labels";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";

export function MobileFilterSheet({
  queueCount,
  selectedStatus,
  from,
  to,
}: {
  queueCount: number;
  selectedStatus: string;
  from: string;
  to: string;
}) {
  const isFiltered = selectedStatus !== "all" || !!from || !!to;

  return (
    <details className="group rounded-2xl border border-slate-100 bg-white shadow-sm md:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 select-none">
        <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <SlidersHorizontal size={13} className="text-slate-400" />
          Filter
          {isFiltered ? (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-700">
              {getSubmissionFilterStatusLabel(selectedStatus)}
              {from || to ? ` · ${from || "…"} – ${to || "…"}` : ""}
            </span>
          ) : (
            <span className="text-slate-400 font-normal">
              {queueCount} data
            </span>
          )}
        </span>
        <svg
          className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>

      <form action="/admin/verifikasi" className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-2.5">
        <select
          name="status"
          defaultValue={selectedStatus}
          className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="all">Semua (prioritas aksi)</option>
          <option value="submitted">Menunggu Verifikasi</option>
          <option value="edited_by_admin">Diedit Admin</option>
          <option value="reject">Ditolak</option>
          <option value="approved">Disetujui</option>
        </select>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="mb-1 text-[10px] font-semibold text-slate-500">Dari</p>
            <Input type="date" name="from" defaultValue={from} />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold text-slate-500">Sampai</p>
            <Input type="date" name="to" defaultValue={to} />
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="submit" className="flex-1">Terapkan</Button>
          <Link
            href="/admin/verifikasi"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-center text-sm font-medium text-slate-700"
          >
            Reset
          </Link>
        </div>
      </form>
    </details>
  );
}
