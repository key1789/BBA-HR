import {
  lockPayrollPeriodAction,
  unlockPayrollPeriodAction,
} from "@/app/actions/governance";
import { getSessionContext } from "@/lib/auth-context";
import {
  getPayrollStatusBadgeClass,
  getPayrollStatusLabel,
} from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

type PayrollPeriodRow = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  notes: string | null;
};

export default async function BbaPayrollPage() {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return <p className="text-sm text-slate-600">Akses payroll hanya untuk BBA.</p>;
  }

  const supabase = await createClient();
  const { data: addon } = await supabase
    .from("addon_settings")
    .select("is_enabled")
    .eq("tenant_apotek_id", active.tenantId)
    .eq("addon_key", "payroll")
    .maybeSingle();

  const payrollEnabled = addon?.is_enabled ?? false;
  const { data } = await supabase
    .from("payroll_periods")
    .select("id, period_start, period_end, status, notes")
    .eq("tenant_apotek_id", active.tenantId)
    .order("period_start", { ascending: false })
    .limit(12);

  const periods = (data ?? []) as PayrollPeriodRow[];

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">BBA - Payroll (Hidden Mode)</h1>
        <p className="text-sm text-slate-600">
          Modul payroll dibangun untuk internal BBA. Exposure publik tetap ditahan.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
        <p>
          Add-on payroll tenant aktif:{" "}
          <span className={payrollEnabled ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
            {payrollEnabled ? "Enabled" : "Disabled"}
          </span>
        </p>
        <p className="mt-1 text-slate-600">
          Walau enabled untuk konfigurasi tenant, route ini tetap hanya untuk BBA.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Notes</th>
              <th className="px-3 py-2">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {periods.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-slate-500">
                  Belum ada payroll period.
                </td>
              </tr>
            ) : null}
            {periods.map((period) => (
              <tr key={period.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  {period.period_start} - {period.period_end}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getPayrollStatusBadgeClass(period.status)}`}
                  >
                    {getPayrollStatusLabel(period.status)}
                  </span>
                </td>
                <td className="px-3 py-2">{period.notes ?? "-"}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    {period.status !== "locked" ? (
                      <form action={lockPayrollPeriodAction}>
                        <input type="hidden" name="periodId" value={period.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700"
                        >
                          Lock
                        </button>
                      </form>
                    ) : (
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                        Locked
                      </span>
                    )}
                    {period.status === "locked" ? (
                      <form action={unlockPayrollPeriodAction} className="flex gap-2">
                        <input type="hidden" name="periodId" value={period.id} />
                        <input
                          type="text"
                          name="reason"
                          required
                          placeholder="Alasan unlock"
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                        />
                        <button
                          type="submit"
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700"
                        >
                          Unlock
                        </button>
                      </form>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
