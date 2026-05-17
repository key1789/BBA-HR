import { Button } from "@/components/shared/button";
import { Input } from "@/components/shared/input";
import Link from "next/link";

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
  return (
    <form className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm md:hidden">
      <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">
        Filter Queue ({queueCount})
      </p>
      <div className="grid grid-cols-1 gap-2">
        <select
          name="status"
          defaultValue={selectedStatus}
          className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="all">Semua</option>
          <option value="submitted">Submitted</option>
        </select>
        <Input type="date" name="from" defaultValue={from} />
        <Input type="date" name="to" defaultValue={to} />
        <div className="flex items-center gap-2">
          <Button type="submit">Terapkan</Button>
          <Link
            href="/admin/verifikasi"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
          >
            Reset
          </Link>
        </div>
      </div>
    </form>
  );
}
