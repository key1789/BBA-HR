import { ReportMetricsGrid } from "@/components/reports/report-metrics-grid";
import { getSessionContext } from "@/lib/auth-context";
import { getReportMetricsForTenant } from "@/lib/report-metrics";
import Link from "next/link";

export default async function OwnerLaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "owner") {
    return <p className="text-sm text-slate-600">Akses laporan owner tidak tersedia.</p>;
  }

  const metrics = await getReportMetricsForTenant(active.tenantId, {
    from: params.from,
    to: params.to,
  });
  const hasCustomRange = Boolean(params.from || params.to);
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const fmt = (date: Date) => date.toISOString().slice(0, 10);
  const quickLast7 = `/owner/laporan?from=${fmt(sevenDaysAgo)}&to=${fmt(now)}`;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const quickThisMonth = `/owner/laporan?from=${fmt(monthStart)}&to=${fmt(now)}`;

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Owner - Laporan</h1>
        <p className="text-sm text-slate-600">
          Ringkasan performa harian/bulanan tenant aktif: {active.tenantCode}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={quickLast7}
          className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
        >
          Quick: 7 Hari Terakhir
        </Link>
        <Link
          href={quickThisMonth}
          className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
        >
          Quick: Bulan Ini
        </Link>
        {hasCustomRange ? (
          <Link
            href="/owner/laporan"
            className="rounded-md border border-rose-300 px-3 py-2 text-xs font-medium text-rose-700"
          >
            Reset Range
          </Link>
        ) : null}
      </div>
      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
        <label>
          Dari Tanggal
          <input
            type="date"
            name="from"
            defaultValue={params.from}
            className="mt-1 block rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label>
          Sampai Tanggal
          <input
            type="date"
            name="to"
            defaultValue={params.to}
            className="mt-1 block rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-3 py-2 font-medium text-white"
        >
          Terapkan Range
        </button>
      </form>
      <ReportMetricsGrid metrics={metrics} />
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Export tetap tidak tersedia untuk owner sesuai rulebook (BBA only). Total approved bulan
        ini: <span className="font-semibold text-slate-900">{metrics.monthApprovedCount}</span>.
      </div>
    </section>
  );
}
