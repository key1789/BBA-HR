const ACTION_LABEL: Record<string, string> = {
  approve:       "Disetujui",
  reject:        "Ditolak",
  edit_directly: "Diedit Admin",
};

type FocusItem = { product_name: string; quantity_sold: number };
type VerificationItem = {
  action: string;
  actor_name: string;
  acted_at: string;
  error_code?: string | null;
  note?: string | null;
};

export function MobileVerificationDetailModal({
  row,
  focusItems,
  verifications,
}: {
  row: {
    id?: string;
    submission_date?: string;
    user_name: string;
    shift_label?: string;
    status?: string;
    omzet_total: number;
    transaction_total: number;
    product_total: number;
    rejected_customer_total: number;
    late_reason: string | null;
  };
  focusItems: FocusItem[];
  verifications: VerificationItem[];
}) {
  const numberFormatter = new Intl.NumberFormat("id-ID");
  return (
    <details>
      <summary className="cursor-pointer text-xs font-semibold text-indigo-700">Detail</summary>
      <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-sm">
        <p className="font-semibold text-slate-800">{row.user_name}</p>
        <p>Omzet: {numberFormatter.format(row.omzet_total)}</p>
        <p>Transaksi: {numberFormatter.format(row.transaction_total)}</p>
        <p>Produk: {numberFormatter.format(row.product_total)}</p>
        <p>Pelanggan ditolak: {numberFormatter.format(row.rejected_customer_total)}</p>
        <p>Alasan terlambat: {row.late_reason?.trim() ? row.late_reason : "-"}</p>

        <p className="mt-2 font-semibold text-slate-800">Produk Fokus</p>
        {focusItems.length === 0 ? (
          <p className="text-slate-500">Tidak ada detail produk fokus.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {focusItems.map((item, idx) => (
              <li key={`focus-${idx}`}>
                {item.product_name}: {numberFormatter.format(item.quantity_sold)}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-2 font-semibold text-slate-800">Riwayat Verifikasi</p>
        {verifications.length === 0 ? (
          <p className="text-slate-500">Belum ada riwayat verifikasi.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {verifications.slice(0, 5).map((v, idx) => (
              <li key={`ver-${idx}`} className="rounded-md bg-slate-50 px-2 py-1">
                <p>
                  <span className="font-semibold">{ACTION_LABEL[v.action] ?? v.action}</span>{" "}
                  oleh {v.actor_name}
                </p>
                <p className="text-slate-500">
                  {new Date(v.acted_at).toLocaleString("id-ID")}
                  {v.error_code ? ` | kode: ${v.error_code}` : ""}
                  {v.note ? ` | catatan: ${v.note}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
