import { Card } from "@/components/shared/card";
import { Input } from "@/components/shared/input";
import { InlineAlert } from "@/components/shared/inline-alert";
import { PageHeader } from "@/components/shared/page-header";
import { ReportMetricsGrid } from "@/components/reports/report-metrics-grid";
import { getSessionContext } from "@/lib/auth-context";
import { getReportMetricsForTenant } from "@/lib/report-metrics";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

const IDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("id-ID");

type CrewRow = {
  userId: string;
  name: string;
  omzet: number;
  trx: number;
  prod: number;
  rejected: number;
  atv: number;
  atu: number;
  projectedLost: number;
};

type DayRow = {
  date: string;
  rejected: number;
  atv: number;
  projectedLost: number;
};

export default async function AdminLaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "admin_apotek") {
    return <p className="text-sm text-slate-600">Akses laporan admin tidak tersedia.</p>;
  }

  // Compute effective range (mirrors logic in getReportMetricsForTenant)
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const defaultTo   = now.toISOString().slice(0, 10);
  const effectiveFrom = params.from && params.from <= defaultTo ? params.from : defaultFrom;
  const effectiveTo   = params.to   && params.to   >= effectiveFrom ? params.to : defaultTo;

  const supabase      = await createClient();
  const supabaseAdmin = createAdminClient();

  // All queries in parallel
  const [metrics, submissionsResult] = await Promise.all([
    getReportMetricsForTenant(active.tenantId, { from: params.from, to: params.to }),
    supabase
      .from("daily_submissions")
      .select("user_id, submission_date, omzet_total, transaction_total, product_total, rejected_customer_total, app_user:user_id(full_name)")
      .eq("tenant_apotek_id", active.tenantId)
      .in("status", ["approved", "edited_by_admin"])
      .gte("submission_date", effectiveFrom)
      .lte("submission_date", effectiveTo),
  ]);

  // ── Per-karyawan aggregation ──
  const byUser = new Map<string, { name: string; omzet: number; trx: number; prod: number; rejected: number }>();
  for (const row of (submissionsResult.data ?? []) as any[]) {
    const uid  = String(row.user_id);
    const name = (Array.isArray(row.app_user) ? row.app_user[0]?.full_name : row.app_user?.full_name) ?? "—";
    const cur  = byUser.get(uid) ?? { name, omzet: 0, trx: 0, prod: 0, rejected: 0 };
    cur.omzet    += Number(row.omzet_total            ?? 0);
    cur.trx      += Number(row.transaction_total      ?? 0);
    cur.prod     += Number(row.product_total          ?? 0);
    cur.rejected += Number(row.rejected_customer_total ?? 0);
    byUser.set(uid, cur);
  }

  const crewRows: CrewRow[] = Array.from(byUser.entries())
    .map(([userId, v]) => {
      const atv          = v.trx > 0 ? v.omzet / v.trx : 0;
      const atu          = v.trx > 0 ? v.prod  / v.trx : 0;
      const projectedLost = v.rejected * atv;
      return { userId, name: v.name, omzet: v.omzet, trx: v.trx, prod: v.prod, rejected: v.rejected, atv, atu, projectedLost };
    })
    .sort((a, b) => b.omzet - a.omzet);

  // ── Per-hari penolakan aggregation ──
  const byDate = new Map<string, { omzet: number; trx: number; rejected: number }>();
  for (const row of (submissionsResult.data ?? []) as any[]) {
    const d   = String(row.submission_date).slice(0, 10);
    const cur = byDate.get(d) ?? { omzet: 0, trx: 0, rejected: 0 };
    cur.omzet    += Number(row.omzet_total            ?? 0);
    cur.trx      += Number(row.transaction_total      ?? 0);
    cur.rejected += Number(row.rejected_customer_total ?? 0);
    byDate.set(d, cur);
  }

  const dayRows: DayRow[] = Array.from(byDate.entries())
    .filter(([, v]) => v.rejected > 0)
    .map(([date, v]) => {
      const atv          = v.trx > 0 ? v.omzet / v.trx : 0;
      const projectedLost = v.rejected * atv;
      return { date, rejected: v.rejected, atv, projectedLost };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const hasCustomRange   = Boolean(params.from || params.to);
  const sevenDaysAgo     = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const fmt              = (d: Date) => d.toISOString().slice(0, 10);
  const quickLast7       = `/admin/laporan?from=${fmt(sevenDaysAgo)}&to=${fmt(now)}`;
  const monthStart       = new Date(now.getFullYear(), now.getMonth(), 1);
  const quickThisMonth   = `/admin/laporan?from=${fmt(monthStart)}&to=${fmt(now)}`;
  const rangeSummary     = `${metrics.effectiveFrom} s/d ${metrics.effectiveTo}`;

  return (
    <section className="space-y-6">
      <PageHeader
        title="Admin - Laporan"
        subtitle={`Laporan harian/bulanan/berjalan tenant aktif: ${active.tenantCode}`}
      />
      <InlineAlert
        tone="info"
        message={`Range aktif ${rangeSummary}. Approved data pada range: ${metrics.rangeApprovedCount}.`}
      />

      {/* Range controls */}
      <div className="flex flex-wrap gap-2">
        <Link href={quickLast7} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700">
          Quick: 7 Hari Terakhir
        </Link>
        <Link href={quickThisMonth} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700">
          Quick: Bulan Ini
        </Link>
        {hasCustomRange && (
          <Link href="/admin/laporan" className="rounded-md border border-rose-300 px-3 py-2 text-xs font-medium text-rose-700">
            Reset Range
          </Link>
        )}
      </div>
      <form className="flex flex-wrap items-end gap-3 card-surface p-3 text-sm">
        <label>
          Dari Tanggal
          <Input type="date" name="from" defaultValue={params.from} />
        </label>
        <label>
          Sampai Tanggal
          <Input type="date" name="to" defaultValue={params.to} />
        </label>
        <button type="submit" className="rounded-md bg-slate-900 px-3 py-2 font-medium text-white">
          Terapkan Range
        </button>
      </form>

      {/* Aggregate metrics */}
      <ReportMetricsGrid metrics={metrics} />

      {/* Per-karyawan breakdown */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-slate-800">Breakdown per Karyawan</h2>
        {crewRows.length === 0 ? (
          <Card className="rounded-xl p-4 text-sm text-slate-500">
            Belum ada submission approved pada range ini.
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Nama</th>
                  <th className="px-4 py-3 text-right">Omzet</th>
                  <th className="px-4 py-3 text-right">Nota</th>
                  <th className="px-4 py-3 text-right">ATV</th>
                  <th className="px-4 py-3 text-right">Produk</th>
                  <th className="px-4 py-3 text-right">ATU</th>
                  <th className="px-4 py-3 text-right">Plg. Tertolak</th>
                  <th className="px-4 py-3 text-right">Perkiraan Omzet Tertolak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {crewRows.map((r) => (
                  <tr key={r.userId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{IDR.format(r.omzet)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{NUM.format(r.trx)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{IDR.format(r.atv)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{NUM.format(r.prod)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{r.atu.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{NUM.format(r.rejected)}</td>
                    <td className="px-4 py-3 text-right font-medium text-rose-600">{IDR.format(r.projectedLost)}</td>
                  </tr>
                ))}
              </tbody>
              {crewRows.length > 1 && (
                <tfoot className="bg-slate-50 text-slate-700 font-semibold text-xs border-t border-slate-200">
                  <tr>
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right">{IDR.format(crewRows.reduce((s, r) => s + r.omzet, 0))}</td>
                    <td className="px-4 py-3 text-right">{NUM.format(crewRows.reduce((s, r) => s + r.trx, 0))}</td>
                    <td className="px-4 py-3 text-right">—</td>
                    <td className="px-4 py-3 text-right">{NUM.format(crewRows.reduce((s, r) => s + r.prod, 0))}</td>
                    <td className="px-4 py-3 text-right">—</td>
                    <td className="px-4 py-3 text-right">{NUM.format(crewRows.reduce((s, r) => s + r.rejected, 0))}</td>
                    <td className="px-4 py-3 text-right text-rose-600">{IDR.format(crewRows.reduce((s, r) => s + r.projectedLost, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Penolakan per hari */}
      {dayRows.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-bold text-slate-800">Penolakan Pelanggan per Hari</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3 text-right">Plg. Tertolak</th>
                  <th className="px-4 py-3 text-right">ATV Hari Itu</th>
                  <th className="px-4 py-3 text-right">Perkiraan Omzet Tertolak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dayRows.map((d) => (
                  <tr key={d.date} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {new Date(d.date + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">{NUM.format(d.rejected)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{IDR.format(d.atv)}</td>
                    <td className="px-4 py-3 text-right font-medium text-rose-600">{IDR.format(d.projectedLost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 text-slate-700 font-semibold text-xs border-t border-slate-200">
                <tr>
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right">{NUM.format(dayRows.reduce((s, d) => s + d.rejected, 0))}</td>
                  <td className="px-4 py-3 text-right">—</td>
                  <td className="px-4 py-3 text-right text-rose-600">{IDR.format(dayRows.reduce((s, d) => s + d.projectedLost, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <Card className="rounded-xl p-4 text-sm text-slate-600">
        Data sumber laporan berasal dari submission status <code>approved</code>. Total approved
        bulan ini: <span className="font-semibold text-slate-900">{metrics.monthApprovedCount}</span>.
      </Card>
    </section>
  );
}
