import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";

export default async function OwnerDashboardPage() {
  const session = await getSessionContext();
  const active = session?.activeMembership;

  if (!active) {
    return <p className="text-sm text-slate-600">Tidak ada tenant aktif.</p>;
  }

  const supabase = await createClient();
  const [approved, submitted, submissionIdsResult] = await Promise.all([
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("status", "approved"),
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("status", "submitted"),
    supabase
      .from("daily_submissions")
      .select("id")
      .eq("tenant_apotek_id", active.tenantId),
  ]);
  const submissionIds = (submissionIdsResult.data ?? []).map((item) => item.id);
  const minusPoints =
    submissionIds.length > 0
      ? await supabase
          .from("minus_points")
          .select("id", { count: "exact", head: true })
          .in("submission_id", submissionIds)
      : { count: 0 };
  const numberFormatter = new Intl.NumberFormat("id-ID");

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Owner Dashboard</h1>
        <p className="text-sm text-slate-600">
          Ringkasan status operasional tenant aktif: {active.tenantCode}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Submission Disetujui</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {numberFormatter.format(approved.count ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Menunggu Verifikasi</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {numberFormatter.format(submitted.count ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Event Minus Poin</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {numberFormatter.format(minusPoints.count ?? 0)}
          </p>
        </div>
      </div>
    </section>
  );
}
