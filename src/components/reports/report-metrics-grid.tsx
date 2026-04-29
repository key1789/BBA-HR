import { ReportMetrics } from "@/lib/report-metrics";

type Props = {
  metrics: ReportMetrics;
};

function metricValue(value: number, asCurrency = false, fractionDigits = 0) {
  if (asCurrency) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(value);
  }

  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function ReportMetricsGrid({ metrics }: Props) {
  const items = [
    { label: "Total Omzet (Harian)", value: metricValue(metrics.totalOmzet, true) },
    { label: "Akumulasi Omzet (Bulan Ini)", value: metricValue(metrics.accumulatedOmzet, true) },
    { label: "Target Omzet", value: metricValue(metrics.targetOmzet, true) },
    { label: "Perkiraan Omzet Akhir Bulan", value: metricValue(metrics.projectedOmzetEom, true) },
    { label: "Total Transaksi", value: metricValue(metrics.totalTransactions) },
    { label: "Total Produk", value: metricValue(metrics.totalProducts) },
    { label: "ATV", value: metricValue(metrics.atv, true) },
    { label: "ATU", value: metricValue(metrics.atu, false, 2) },
    { label: "Jumlah Pelanggan Tertolak", value: metricValue(metrics.rejectedCustomers) },
    { label: "Perkiraan Omzet Tertolak", value: metricValue(metrics.projectedRejectedOmzet, true) },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <article key={item.label} className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">{item.label}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{item.value}</p>
        </article>
      ))}
    </div>
  );
}
