import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function CrewDashboardPage() {
  const session = await getSessionContext();
  const active = session?.activeMembership;

  if (!active || (active.role !== "crew" && active.role !== "admin_apotek")) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Crew Dashboard</h1>
        <p className="text-sm text-slate-600">Dashboard ini hanya untuk crew/admin apotek.</p>
      </section>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const today = new Date().toISOString().slice(0, 10);
  const [todayCount, personalPending, personalApproved] = await Promise.all([
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("user_id", user?.id ?? "")
      .eq("submission_date", today),
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("user_id", user?.id ?? "")
      .in("status", ["draft", "submitted", "edited_by_admin"]),
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("user_id", user?.id ?? "")
      .eq("status", "approved"),
  ]);
  const numberFormatter = new Intl.NumberFormat("id-ID");

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Crew Dashboard</h1>
        <p className="text-sm text-slate-600">
          Ringkasan aktivitas input untuk tenant aktif: {active.tenantCode}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Input Hari Ini</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {numberFormatter.format(todayCount.count ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Menunggu Verifikasi (Saya)</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {numberFormatter.format(personalPending.count ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Disetujui (Saya)</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {numberFormatter.format(personalApproved.count ?? 0)}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-800">Aksi Cepat</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/crew/input-harian"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Input Harian
          </Link>
          <Link
            href="/crew/riwayat-input"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
          >
            Lihat Riwayat
          </Link>
          <Link
            href="/crew/leaderboard"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
          >
            Leaderboard
          </Link>
        </div>
      </div>
    </section>
  );
}
