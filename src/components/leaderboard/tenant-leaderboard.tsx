import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";

type TenantLeaderboardProps = {
  title: string;
  subtitle: string;
};

type LeaderboardRow = {
  id: string;
  omzet_value: number;
  atv_value: number;
  atu_value: number;
  sarp_percent: number;
  late_flag_count: number;
  user: { full_name: string } | { full_name: string }[] | null;
};

export async function TenantLeaderboard({ title, subtitle }: TenantLeaderboardProps) {
  const session = await getSessionContext();
  const active = session?.activeMembership;

  if (!active) {
    return <p className="text-sm text-slate-600">Tidak ada tenant aktif.</p>;
  }

  const now = new Date();
  const periodMonth = now.getMonth() + 1;
  const periodYear = now.getFullYear();

  const supabase = await createClient();
  const { data } = await supabase
    .from("leaderboard_snapshots")
    .select(
      "id, omzet_value, atv_value, atu_value, sarp_percent, late_flag_count, user:user_id(full_name)",
    )
    .eq("tenant_apotek_id", active.tenantId)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear)
    .order("sarp_percent", { ascending: false })
    .order("late_flag_count", { ascending: true })
    .limit(50);

  const rows = (data ?? []) as LeaderboardRow[];

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-600">
          {subtitle} Tenant: {active.tenantCode} | Periode: {periodMonth}/{periodYear}
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2">Rank</th>
              <th className="px-3 py-2">Nama</th>
              <th className="px-3 py-2">Omzet</th>
              <th className="px-3 py-2">ATV</th>
              <th className="px-3 py-2">ATU</th>
              <th className="px-3 py-2">SARP (%)</th>
              <th className="px-3 py-2">Late Flag</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={7}>
                  Belum ada snapshot leaderboard untuk periode ini.
                </td>
              </tr>
            ) : null}
            {rows.map((row, index) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-semibold text-slate-800">{index + 1}</td>
                <td className="px-3 py-2">
                  {Array.isArray(row.user) ? row.user[0]?.full_name : row.user?.full_name}
                </td>
                <td className="px-3 py-2">{Number(row.omzet_value).toLocaleString("id-ID")}</td>
                <td className="px-3 py-2">{Number(row.atv_value).toLocaleString("id-ID")}</td>
                <td className="px-3 py-2">{Number(row.atu_value).toFixed(2)}</td>
                <td className="px-3 py-2">{Number(row.sarp_percent).toFixed(2)}</td>
                <td className="px-3 py-2">{row.late_flag_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
