import { ReportMetricsGrid } from "@/components/reports/report-metrics-grid";
import { getSessionContext } from "@/lib/auth-context";
import { getReportMetricsForTenant } from "@/lib/report-metrics";

export default async function AdminLaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || (active.role !== "admin_apotek" && active.role !== "super_admin_bba")) {
    return <p className="text-sm text-slate-600">Akses laporan admin tidak tersedia.</p>;
  }

  const metrics = await getReportMetricsForTenant(active.tenantId, {
    from: params.from,
    to: params.to,
  });

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin - Laporan</h1>
        <p className="text-sm text-slate-600">
          Laporan harian/bulanan/berjalan tenant aktif: {active.tenantCode}
        </p>
      </div>
      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
        <label>
          From
          <input
            type="date"
            name="from"
            defaultValue={params.from}
            className="mt-1 block rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label>
          To
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
          Apply Range
        </button>
      </form>
      <ReportMetricsGrid metrics={metrics} />
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Data sumber laporan berasal dari submission status <code>approved</code>. Total approved
        bulan ini: <span className="font-semibold text-slate-900">{metrics.monthApprovedCount}</span>.
      </div>
    </section>
  );
}
