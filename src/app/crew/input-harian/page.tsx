import { createDailySubmissionAction } from "@/app/actions/operational";
import { getSessionContext } from "@/lib/auth-context";
import {
  getSubmissionStatusBadgeClass,
  getSubmissionStatusLabel,
} from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

type SubmissionRow = {
  id: string;
  submission_date: string;
  shift_label: string;
  omzet_total: number;
  transaction_total: number;
  product_total: number;
  rejected_customer_total: number;
  status: string;
};

export default async function CrewInputHarianPage() {
  const session = await getSessionContext();
  const active = session?.activeMembership;

  if (!active || (active.role !== "crew" && active.role !== "admin_apotek")) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Crew - Input Harian</h1>
        <p className="text-sm text-slate-600">Halaman ini hanya untuk crew/admin apotek.</p>
      </section>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("daily_submissions")
    .select(
      "id, submission_date, shift_label, omzet_total, transaction_total, product_total, rejected_customer_total, status",
    )
    .eq("tenant_apotek_id", active.tenantId)
    .eq("user_id", user?.id ?? "")
    .order("submission_date", { ascending: false })
    .limit(10);

  const rows = (data ?? []) as SubmissionRow[];
  const numberFormatter = new Intl.NumberFormat("id-ID");

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Crew - Input Harian</h1>
        <p className="text-sm text-slate-600">
          Input metrik harian per shift. Simpan draft atau langsung submit.
        </p>
      </div>

      <form action={createDailySubmissionAction} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2">
        <label className="text-sm text-slate-700">
          Tanggal
          <input
            type="date"
            name="submissionDate"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-slate-700">
          Shift
          <input
            type="text"
            name="shiftLabel"
            defaultValue="general"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-slate-700">
          Omzet
          <input type="number" name="omzetTotal" min={0} required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-slate-700">
          Total Transaksi
          <input type="number" name="transactionTotal" min={0} required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-slate-700">
          Total Produk
          <input type="number" name="productTotal" min={0} required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-slate-700">
          Pelanggan Tertolak
          <input type="number" name="rejectedCustomerTotal" min={0} required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <div className="col-span-full flex gap-2">
          <button
            type="submit"
            name="submitNow"
            value="false"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
          >
            Simpan Draft
          </button>
          <button
            type="submit"
            name="submitNow"
            value="true"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Submit
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2">Tanggal</th>
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
                <td className="px-3 py-4 text-slate-500" colSpan={7}>
                  Belum ada data submission.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{row.submission_date}</td>
                <td className="px-3 py-2">{row.shift_label}</td>
                <td className="px-3 py-2">{numberFormatter.format(Number(row.omzet_total))}</td>
                <td className="px-3 py-2">
                  {numberFormatter.format(Number(row.transaction_total))}
                </td>
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
    </section>
  );
}
