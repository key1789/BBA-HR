import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function AdminDashboardPage() {
  const session = await getSessionContext();
  const active = session?.activeMembership;

  if (!active || (active.role !== "admin_apotek" && active.role !== "super_admin_bba")) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Admin Apotek Dashboard</h1>
        <p className="text-sm text-slate-600">Dashboard ini hanya untuk admin apotek/BBA.</p>
      </section>
    );
  }

  const supabase = await createClient();
  const [queueCount, approvedCount, needsFollowupCount] = await Promise.all([
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .in("status", ["submitted", "edited_by_admin"]),
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("status", "approved"),
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .in("status", ["reject", "draft"]),
  ]);
  const numberFormatter = new Intl.NumberFormat("id-ID");

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin Apotek Dashboard</h1>
        <p className="text-sm text-slate-600">
          Monitoring verifikasi dan kualitas data untuk tenant aktif: {active.tenantCode}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Antrian Verifikasi</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {numberFormatter.format(queueCount.count ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Submission Disetujui</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {numberFormatter.format(approvedCount.count ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Perlu Tindak Lanjut</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {numberFormatter.format(needsFollowupCount.count ?? 0)}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-800">Aksi Cepat</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/admin/verifikasi"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Buka Antrian Verifikasi
          </Link>
          <Link
            href="/admin/laporan"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
          >
            Buka Laporan
          </Link>
          <Link
            href="/admin/leaderboard"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
          >
            Buka Leaderboard
          </Link>
        </div>
      </div>
    </section>
  );
}
