import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/auth-context";
import { redirect } from "next/navigation";
import { BroadcastComposer } from "./broadcast-composer";
import {
  ANNOUNCEMENT_PRIORITY_LABEL,
  ANNOUNCEMENT_STATUS_LABEL,
  getAnnouncementPriorityBadge,
  type AnnouncementRow,
} from "@/lib/announcements";
import { publishDueAnnouncementsAction } from "./actions";
import { ReminderTrigger } from "./reminder-trigger";
import { AnalyticsExportButton } from "./analytics-export-button";

type AnnouncementListRow = AnnouncementRow & {
  targetCount: number;
  recipientCount: number;
  viewedCount: number;
  ackCount: number;
};

type UnreadCriticalRow = {
  user_id: string;
  role: "admin_apotek" | "crew";
  tenant_apotek_id: string | null;
  announcement: { title: string } | { title: string }[] | null;
  user: { full_name: string } | { full_name: string }[] | null;
  tenant: { name: string } | { name: string }[] | null;
};

type ReceiptTrendRow = {
  tenant_apotek_id: string | null;
  role: "admin_apotek" | "crew";
  created_at: string;
  viewed_at: string | null;
  acknowledged_at: string | null;
};

export default async function BroadcastPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; period?: string; role?: string; sort?: string }>;
}) {
  const session = await getSessionContext();
  if (!session || session.activeMembership?.role !== "super_admin_bba") {
    redirect("/");
  }

  await publishDueAnnouncementsAction();

  const params = await searchParams;
  const period = params.period === "14d" || params.period === "30d" ? params.period : "7d";
  const daysBack = period === "30d" ? 30 : period === "14d" ? 14 : 7;
  const roleFilter =
    params.role === "admin_apotek" || params.role === "crew" ? params.role : "all";
  const rankingSort = params.sort === "unread" ? "unread" : "unacked";
  const now = new Date();
  const rangeStart = new Date(now);
  rangeStart.setDate(rangeStart.getDate() - (daysBack - 1));
  const statusFilter =
    params.status === "draft" || params.status === "scheduled" || params.status === "archived"
      ? params.status
      : "published";

  const supabase = createAdminClient();
  const [
    { data: tenants },
    { data: announcements },
    { data: targets },
    { data: receipts },
    { data: unreadCriticalRows },
    { data: weeklyCriticalRows },
    { data: trendRows },
  ] = await Promise.all([
    supabase.from("tenant_apotek").select("id, name, code").eq("status", "active").order("name", { ascending: true }),
    supabase
      .from("announcements")
      .select("*")
      .eq("status", statusFilter)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("announcement_targets").select("announcement_id"),
    supabase.from("announcement_receipts").select("announcement_id, role, viewed_at, acknowledged_at"),
    supabase
      .from("announcement_receipts")
      .select(
        "user_id, role, tenant_apotek_id, announcement:announcement_id(title), user:user_id(full_name), tenant:tenant_apotek_id(name)",
      )
      .is("acknowledged_at", null)
      .eq("announcement.status", "published")
      .in("announcement.priority", ["required", "urgent"])
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("announcement_receipts")
      .select("announcement_id, role, acknowledged_at, announcement:announcement_id(priority)")
      .gte("created_at", rangeStart.toISOString())
      .in("announcement.priority", ["required", "urgent"]),
    supabase
      .from("announcement_receipts")
      .select("tenant_apotek_id, role, created_at, viewed_at, acknowledged_at")
      .gte("created_at", rangeStart.toISOString())
      .order("created_at", { ascending: true }),
  ]);

  const roleMatch = (role: "admin_apotek" | "crew") => roleFilter === "all" || role === roleFilter;

  const targetCountMap = new Map<string, number>();
  for (const row of targets ?? []) {
    targetCountMap.set(row.announcement_id, (targetCountMap.get(row.announcement_id) ?? 0) + 1);
  }

  const receiptSummaryMap = new Map<string, { recipientCount: number; viewedCount: number; ackCount: number }>();
  for (const row of receipts ?? []) {
    if (!roleMatch(row.role)) continue;
    const current = receiptSummaryMap.get(row.announcement_id) ?? {
      recipientCount: 0,
      viewedCount: 0,
      ackCount: 0,
    };
    current.recipientCount += 1;
    if (row.viewed_at) current.viewedCount += 1;
    if (row.acknowledged_at) current.ackCount += 1;
    receiptSummaryMap.set(row.announcement_id, current);
  }

  const list = ((announcements ?? []) as AnnouncementRow[]).map((row) => ({
    ...row,
    targetCount: targetCountMap.get(row.id) ?? 0,
    recipientCount: receiptSummaryMap.get(row.id)?.recipientCount ?? 0,
    viewedCount: receiptSummaryMap.get(row.id)?.viewedCount ?? 0,
    ackCount: receiptSummaryMap.get(row.id)?.ackCount ?? 0,
  })) as AnnouncementListRow[];

  const totalRecipients = list.reduce((acc, item) => acc + item.recipientCount, 0);
  const totalViewed = list.reduce((acc, item) => acc + item.viewedCount, 0);
  const totalAcked = list.reduce((acc, item) => acc + item.ackCount, 0);
  const overallReadRate = totalRecipients > 0 ? Math.round((totalViewed / totalRecipients) * 100) : 0;
  const overallAckRate = totalRecipients > 0 ? Math.round((totalAcked / totalRecipients) * 100) : 0;

  const unreadCritical = ((unreadCriticalRows ?? []) as UnreadCriticalRow[]).filter((row) =>
    roleMatch(row.role),
  );
  const weeklyCritical = (weeklyCriticalRows ?? []) as Array<{
    announcement_id: string;
    role: "admin_apotek" | "crew";
    acknowledged_at: string | null;
    announcement: { priority: string } | { priority: string }[] | null;
  }>;
  const weeklyCriticalFiltered = weeklyCritical.filter((row) => roleMatch(row.role));
  const weeklyCriticalRecipients = weeklyCriticalFiltered.length;
  const weeklyCriticalAcked = weeklyCriticalFiltered.filter((row) => !!row.acknowledged_at).length;
  const weeklyCriticalAckRate =
    weeklyCriticalRecipients > 0 ? Math.round((weeklyCriticalAcked / weeklyCriticalRecipients) * 100) : 0;

  const tenantNameMap = new Map<string, string>();
  for (const tenant of tenants ?? []) {
    tenantNameMap.set(tenant.id, tenant.name);
  }

  const dayKeys: string[] = [];
  for (let i = daysBack - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dayKeys.push(d.toISOString().slice(0, 10));
  }

  const trendByDay = new Map<string, { delivered: number; viewed: number; acked: number }>();
  for (const dayKey of dayKeys) {
    trendByDay.set(dayKey, { delivered: 0, viewed: 0, acked: 0 });
  }

  const tenantSummaryMap = new Map<
    string,
    { tenantName: string; delivered: number; viewed: number; acked: number; unread: number; unacked: number }
  >();
  for (const row of (trendRows ?? []) as ReceiptTrendRow[]) {
    if (!roleMatch(row.role)) continue;
    const dayKey = row.created_at.slice(0, 10);
    const day = trendByDay.get(dayKey);
    if (day) {
      day.delivered += 1;
      if (row.viewed_at) day.viewed += 1;
      if (row.acknowledged_at) day.acked += 1;
    }

    const tenantKey = row.tenant_apotek_id ?? "global";
    const tenantName = row.tenant_apotek_id ? (tenantNameMap.get(row.tenant_apotek_id) ?? "Tenant") : "Semua cabang";
    const current = tenantSummaryMap.get(tenantKey) ?? {
      tenantName,
      delivered: 0,
      viewed: 0,
      acked: 0,
      unread: 0,
      unacked: 0,
    };
    current.delivered += 1;
    if (row.viewed_at) current.viewed += 1;
    else current.unread += 1;
    if (row.acknowledged_at) current.acked += 1;
    else current.unacked += 1;
    tenantSummaryMap.set(tenantKey, current);
  }

  const trendSeries = dayKeys.map((dayKey) => {
    const day = trendByDay.get(dayKey) ?? { delivered: 0, viewed: 0, acked: 0 };
    const readRate = day.delivered > 0 ? Math.round((day.viewed / day.delivered) * 100) : 0;
    const ackRate = day.delivered > 0 ? Math.round((day.acked / day.delivered) * 100) : 0;
    return { dayKey, ...day, readRate, ackRate };
  });
  const ackSparkline = trendSeries.map((item) => item.ackRate);
  const maxAck = Math.max(1, ...ackSparkline);

  const tenantRanking = [...tenantSummaryMap.values()]
    .sort((a, b) => (rankingSort === "unread" ? b.unread - a.unread : b.unacked - a.unacked))
    .slice(0, 5);

  return (
    <AnimatedPage className="space-y-6">
      <GlassCard className="p-6" variant="light">
        <h1 className="text-xl font-black text-slate-800">Pusat Pengumuman</h1>
        <p className="mt-1 text-sm text-slate-500">
          Composer terpusat untuk Admin & Crew dengan lifecycle Draft / Scheduled / Published / Archived.
        </p>
      </GlassCard>

      <BroadcastComposer tenants={tenants ?? []} />

      <GlassCard className="grid gap-3 p-5 md:grid-cols-4" variant="light">
        <div className="rounded-xl bg-white p-3">
          <p className="text-xs font-semibold text-slate-500">Published items</p>
          <p className="text-2xl font-black text-slate-800">{list.length}</p>
        </div>
        <div className="rounded-xl bg-white p-3">
          <p className="text-xs font-semibold text-slate-500">Recipients</p>
          <p className="text-2xl font-black text-slate-800">{totalRecipients}</p>
        </div>
        <div className="rounded-xl bg-white p-3">
          <p className="text-xs font-semibold text-slate-500">Read rate</p>
          <p className="text-2xl font-black text-indigo-700">{overallReadRate}%</p>
        </div>
        <div className="rounded-xl bg-white p-3">
          <p className="text-xs font-semibold text-slate-500">Ack rate</p>
          <p className="text-2xl font-black text-emerald-700">{overallAckRate}%</p>
        </div>
      </GlassCard>

      <GlassCard className="space-y-2 p-5" variant="light">
        <h3 className="text-base font-black text-slate-800">KPI Baseline Operasional</h3>
        <p className="text-sm text-slate-600">
          Target fase awal: <span className="font-bold">95% acknowledgment</span> untuk pengumuman kritis dalam 24 jam.
        </p>
        <p className="text-sm text-slate-600">
          Baseline {daysBack} hari: {weeklyCriticalAcked}/{weeklyCriticalRecipients} receipt kritis sudah ack (
          <span className="font-bold">{weeklyCriticalAckRate}%</span>).
        </p>
        <div className="flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wider">
          {(["7d", "14d", "30d"] as const).map((item) => (
            <a
              key={item}
              href={`/bba/broadcast?status=${statusFilter}&period=${item}&role=${roleFilter}&sort=${rankingSort}`}
              className={`rounded-full px-3 py-1 ${
                period === item ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700"
              }`}
            >
              {item}
            </a>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wider">
          {([
            { id: "all", label: "Role: All" },
            { id: "admin_apotek", label: "Role: Admin" },
            { id: "crew", label: "Role: Crew" },
          ] as const).map((item) => (
            <a
              key={item.id}
              href={`/bba/broadcast?status=${statusFilter}&period=${period}&role=${item.id}&sort=${rankingSort}`}
              className={`rounded-full px-3 py-1 ${
                roleFilter === item.id ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"
              }`}
            >
              {item.label}
            </a>
          ))}
        </div>
        <a
          href={`/bba/broadcast/export?period=${period}&role=${roleFilter}&sort=${rankingSort}`}
          className="inline-flex rounded-xl border border-slate-300 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-700"
        >
          Export CSV Analytics
        </a>
        <AnalyticsExportButton
          periodLabel={period}
          roleLabel={roleFilter}
          readRate={overallReadRate}
          ackRate={overallAckRate}
          recipients={totalRecipients}
          trend={trendSeries.map((item) => ({ dayKey: item.dayKey, ackRate: item.ackRate }))}
          exporterName={session.userFullName ?? session.userEmail}
          backlog={tenantRanking.map((tenant) => {
            const readRate = tenant.delivered > 0 ? Math.round((tenant.viewed / tenant.delivered) * 100) : 0;
            const ackRate = tenant.delivered > 0 ? Math.round((tenant.acked / tenant.delivered) * 100) : 0;
            return {
              tenantName: tenant.tenantName,
              delivered: tenant.delivered,
              readRate,
              ackRate,
              unread: tenant.unread,
              unacked: tenant.unacked,
            };
          })}
        />
        <ReminderTrigger />
      </GlassCard>

      <GlassCard className="space-y-4 p-5" variant="light">
        <div className="flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wider">
          {(["published", "draft", "scheduled", "archived"] as const).map((status) => (
            <a
              key={status}
              href={`/bba/broadcast?status=${status}`}
              className={`rounded-full px-3 py-1 ${
                statusFilter === status ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700"
              }`}
            >
              {ANNOUNCEMENT_STATUS_LABEL[status]}
            </a>
          ))}
        </div>

        <div className="space-y-3">
          {list.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              Belum ada pengumuman pada status ini.
            </div>
          ) : null}
          {list.map((item) => {
            const readRate = item.recipientCount > 0 ? Math.round((item.viewedCount / item.recipientCount) * 100) : 0;
            const ackRate = item.recipientCount > 0 ? Math.round((item.ackCount / item.recipientCount) * 100) : 0;
            return (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${getAnnouncementPriorityBadge(item.priority)}`}>
                    {ANNOUNCEMENT_PRIORITY_LABEL[item.priority]}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                    {ANNOUNCEMENT_STATUS_LABEL[item.status]}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                    Target {item.targetCount}
                  </span>
                </div>
                <h3 className="mt-2 text-base font-black text-slate-800">{item.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.body}</p>
                <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-4">
                  <p>Recipients: {item.recipientCount}</p>
                  <p>Read rate: {readRate}%</p>
                  <p>Ack rate: {ackRate}%</p>
                  <p>Updated: {new Date(item.updated_at).toLocaleString("id-ID")}</p>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard className="space-y-3 p-5" variant="light">
        <h3 className="text-base font-black text-slate-800">Daftar Belum Ack (Kritis)</h3>
        {unreadCritical.length === 0 ? (
          <p className="text-sm text-slate-500">Tidak ada backlog acknowledgment kritis.</p>
        ) : (
          <div className="space-y-2">
            {unreadCritical.map((row) => {
              const user = Array.isArray(row.user) ? row.user[0] : row.user;
              const tenant = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant;
              const announcement = Array.isArray(row.announcement) ? row.announcement[0] : row.announcement;
              return (
                <div key={`${row.user_id}-${announcement?.title ?? "unknown"}`} className="rounded-xl bg-white p-3 text-sm">
                  <p className="font-bold text-slate-800">{user?.full_name ?? "Tanpa nama"}</p>
                  <p className="text-xs text-slate-600">
                    {row.role === "crew" ? "Crew" : "Admin Apotek"} - {tenant?.name ?? "Semua cabang"}
                  </p>
                  <p className="mt-1 text-xs text-rose-700">Belum ack: {announcement?.title ?? "-"}</p>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      <GlassCard className="space-y-3 p-5" variant="light">
        <h3 className="text-base font-black text-slate-800">Tren {daysBack} Hari (Read/Ack)</h3>
        <div className="rounded-xl bg-white p-3">
          <p className="mb-2 text-xs font-semibold text-slate-600">Ack Sparkline</p>
          <div className="flex h-14 items-end gap-1">
            {ackSparkline.map((value, idx) => {
              const height = Math.max(6, Math.round((value / maxAck) * 48));
              return (
                <div
                  key={`${trendSeries[idx]?.dayKey ?? idx}-spark`}
                  className="flex-1 rounded-t bg-emerald-500/80"
                  style={{ height }}
                  title={`${trendSeries[idx]?.dayKey ?? ""}: ${value}%`}
                />
              );
            })}
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-7">
          {trendSeries.map((day) => (
            <div key={day.dayKey} className="rounded-xl bg-white p-3 text-xs">
              <p className="font-bold text-slate-800">{new Date(`${day.dayKey}T00:00:00`).toLocaleDateString("id-ID")}</p>
              <p className="mt-1 text-slate-600">Sent: {day.delivered}</p>
              <div className="mt-1 space-y-1">
                <div>
                  <p className="text-[11px] text-slate-600">Viewed: {day.readRate}%</p>
                  <div className="h-1.5 rounded-full bg-slate-200">
                    <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${day.readRate}%` }} />
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-slate-600">Ack: {day.ackRate}%</p>
                  <div className="h-1.5 rounded-full bg-slate-200">
                    <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${day.ackRate}%` }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="space-y-3 p-5" variant="light">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-black text-slate-800">Top Backlog Ack per Cabang</h3>
          <div className="flex gap-2 text-xs font-bold uppercase tracking-wider">
            <a
              href={`/bba/broadcast?status=${statusFilter}&period=${period}&role=${roleFilter}&sort=unacked`}
              className={`rounded-full px-3 py-1 ${
                rankingSort === "unacked" ? "bg-rose-600 text-white" : "bg-slate-200 text-slate-700"
              }`}
            >
              Sort: Unacked
            </a>
            <a
              href={`/bba/broadcast?status=${statusFilter}&period=${period}&role=${roleFilter}&sort=unread`}
              className={`rounded-full px-3 py-1 ${
                rankingSort === "unread" ? "bg-rose-600 text-white" : "bg-slate-200 text-slate-700"
              }`}
            >
              Sort: Unread
            </a>
          </div>
        </div>
        {tenantRanking.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada data backlog untuk periode {daysBack} hari.</p>
        ) : (
          <div className="space-y-2">
            {tenantRanking.map((tenant) => {
              const readRate = tenant.delivered > 0 ? Math.round((tenant.viewed / tenant.delivered) * 100) : 0;
              const ackRate = tenant.delivered > 0 ? Math.round((tenant.acked / tenant.delivered) * 100) : 0;
              return (
                <div key={tenant.tenantName} className="rounded-xl bg-white p-3 text-sm">
                  <p className="font-bold text-slate-800">{tenant.tenantName}</p>
                  <p className="text-xs text-slate-600">
                    Sent {tenant.delivered} - Read {readRate}% - Ack {ackRate}% - Unread {tenant.unread} - Unacked {tenant.unacked}
                  </p>
                  <div className="mt-2 space-y-1">
                    <div className="h-1.5 rounded-full bg-slate-200">
                      <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${readRate}%` }} />
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200">
                      <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${ackRate}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </AnimatedPage>
  );
}
