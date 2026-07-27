import { getSessionContext } from "@/lib/auth-context";
import { createAdminClient } from "@/lib/supabase/admin";

type CsvRow = {
  tenantName: string;
  delivered: number;
  viewed: number;
  acked: number;
  unread: number;
  unacked: number;
  readRate: number;
  ackRate: number;
};

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session || session.activeMembership?.role !== "super_admin_bba") {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const period = url.searchParams.get("period") === "14d" || url.searchParams.get("period") === "30d"
    ? (url.searchParams.get("period") as "14d" | "30d")
    : "7d";
  const roleFilter = url.searchParams.get("role") === "admin_apotek" || url.searchParams.get("role") === "crew"
    ? (url.searchParams.get("role") as "admin_apotek" | "crew")
    : "all";
  const rankingSort = url.searchParams.get("sort") === "unread" ? "unread" : "unacked";
  const daysBack = period === "30d" ? 30 : period === "14d" ? 14 : 7;

  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - (daysBack - 1));

  const supabase = createAdminClient();
  const [{ data: tenants }, { data: rows }] = await Promise.all([
    supabase.from("tenant_apotek").select("id, name").eq("status", "active"),
    supabase
      .from("announcement_receipts")
      .select("tenant_apotek_id, role, viewed_at, acknowledged_at")
      .gte("created_at", start.toISOString()),
  ]);

  const tenantNameMap = new Map<string, string>();
  for (const tenant of tenants ?? []) tenantNameMap.set(tenant.id, tenant.name);

  const roleMatch = (role: "admin_apotek" | "crew") => roleFilter === "all" || role === roleFilter;
  const summary = new Map<string, CsvRow>();

  for (const row of rows ?? []) {
    if (!roleMatch(row.role)) continue;
    const key = row.tenant_apotek_id ?? "global";
    const current = summary.get(key) ?? {
      tenantName: row.tenant_apotek_id ? (tenantNameMap.get(row.tenant_apotek_id) ?? "Tenant") : "Semua cabang",
      delivered: 0,
      viewed: 0,
      acked: 0,
      unread: 0,
      unacked: 0,
      readRate: 0,
      ackRate: 0,
    };
    current.delivered += 1;
    if (row.viewed_at) current.viewed += 1;
    else current.unread += 1;
    if (row.acknowledged_at) current.acked += 1;
    else current.unacked += 1;
    summary.set(key, current);
  }

  const ranked = [...summary.values()]
    .map((item) => ({
      ...item,
      readRate: item.delivered > 0 ? Math.round((item.viewed / item.delivered) * 100) : 0,
      ackRate: item.delivered > 0 ? Math.round((item.acked / item.delivered) * 100) : 0,
    }))
    .sort((a, b) => (rankingSort === "unread" ? b.unread - a.unread : b.unacked - a.unacked));

  const headers = [
    "tenant_name",
    "delivered",
    "viewed",
    "acked",
    "unread",
    "unacked",
    "read_rate_percent",
    "ack_rate_percent",
  ];
  const generatedAt = new Date().toISOString();
  const csvLines = [
    `# period,${period}`,
    `# role_filter,${roleFilter}`,
    `# sort_by,${rankingSort}`,
    `# generated_at,${generatedAt}`,
    headers.join(","),
  ];
  for (const row of ranked) {
    csvLines.push(
      [
        `"${row.tenantName.replace(/"/g, '""')}"`,
        row.delivered,
        row.viewed,
        row.acked,
        row.unread,
        row.unacked,
        row.readRate,
        row.ackRate,
      ].join(","),
    );
  }

  return new Response(csvLines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="broadcast-analytics-${period}-${roleFilter}.csv"`,
    },
  });
}
