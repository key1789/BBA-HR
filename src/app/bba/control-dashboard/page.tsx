import { getSessionContext } from "@/lib/auth-context";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

type TenantRow = {
  id: string;
  name: string;
  code: string;
  status: string;
};

type ReminderLogRow = {
  tenant_apotek_id: string;
  reason_code: string;
  created_at: string;
};

type QueueDetailRow = {
  id: string;
  submission_date: string;
  status: string;
  shift_label: string;
  user: { full_name: string } | { full_name: string }[] | null;
  assignment:
    | {
        assigned_at: string;
        assignee: { full_name: string } | { full_name: string }[] | null;
      }
    | {
        assigned_at: string;
        assignee: { full_name: string } | { full_name: string }[] | null;
      }[]
    | null;
};

async function getQueueStats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  todayDateKey: string,
) {
  const [openQueue, overdueQueue] = await Promise.all([
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", tenantId)
      .in("status", ["submitted", "edited_by_admin", "reject"]),
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", tenantId)
      .lt("submission_date", todayDateKey)
      .in("status", ["submitted", "edited_by_admin", "reject"]),
  ]);
  return {
    openQueue: openQueue.count ?? 0,
    overdueQueue: overdueQueue.count ?? 0,
  };
}

export default async function BbaControlDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  const params = await searchParams;
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return <p className="text-sm text-slate-600">Control dashboard hanya untuk super admin BBA.</p>;
  }

  const supabase = await createClient();
  const reminderWindow = getOperationalReminderWindow();
  const numberFormatter = new Intl.NumberFormat("id-ID");
  const last7Date = new Date();
  last7Date.setDate(last7Date.getDate() - 7);
  const last7Iso = last7Date.toISOString();

  const { data: tenantData } = await supabase
    .from("tenant_apotek")
    .select("id, name, code, status")
    .order("name", { ascending: true });
  const tenants = (tenantData ?? []) as TenantRow[];
  const selectedTenantId =
    params.tenant && params.tenant !== "all" ? params.tenant : tenants[0]?.id ?? null;
  const scopedTenantIds =
    params.tenant === "all" || !selectedTenantId ? tenants.map((tenant) => tenant.id) : [selectedTenantId];

  if (tenants.length === 0) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">BBA Control Dashboard</h1>
        <p className="text-sm text-slate-600">Belum ada tenant apotek yang terdaftar.</p>
      </section>
    );
  }

  const [{ data: reminderRows }, assignmentStats, perTenantQueue] = await Promise.all([
    supabase
      .from("reminder_dispatch_logs")
      .select("tenant_apotek_id, reason_code, created_at")
      .gte("created_at", last7Iso)
      .in("tenant_apotek_id", scopedTenantIds),
    Promise.all(
      scopedTenantIds.map(async (tenantId) => {
        const { count } = await supabase
          .from("submission_assignments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_apotek_id", tenantId);
        return [tenantId, count ?? 0] as const;
      }),
    ),
    Promise.all(
      scopedTenantIds.map(async (tenantId) => {
        const stats = await getQueueStats(supabase, tenantId, reminderWindow.dateKey);
        return [tenantId, stats] as const;
      }),
    ),
  ]);
  const reminderLogs = (reminderRows ?? []) as ReminderLogRow[];
  const selectedTenantReminderRows = reminderLogs.filter(
    (row) => row.tenant_apotek_id === selectedTenantId,
  );
  const reminderReasonMap = selectedTenantReminderRows.reduce(
    (acc, row) => {
      acc.set(row.reason_code, (acc.get(row.reason_code) ?? 0) + 1);
      return acc;
    },
    new Map<string, number>(),
  );
  const selectedTenantName =
    selectedTenantId && params.tenant !== "all"
      ? tenants.find((tenant) => tenant.id === selectedTenantId)?.name ?? "-"
      : "Semua Tenant";
  const selectedTenantCode =
    selectedTenantId && params.tenant !== "all"
      ? tenants.find((tenant) => tenant.id === selectedTenantId)?.code ?? "-"
      : "ALL";
  const { data: queueDetailData } =
    selectedTenantId && params.tenant !== "all"
      ? await supabase
          .from("daily_submissions")
          .select(
            "id, submission_date, status, shift_label, user:user_id(full_name), assignment:submission_assignments(assigned_at, assignee:assigned_to_user_id(full_name))",
          )
          .eq("tenant_apotek_id", selectedTenantId)
          .in("status", ["submitted", "edited_by_admin", "reject"])
          .order("submission_date", { ascending: true })
          .limit(12)
      : { data: [] };
  const queueDetails = (queueDetailData ?? []) as QueueDetailRow[];

  const assignmentMap = new Map(assignmentStats);
  const queueMap = new Map(perTenantQueue);

  const reminderByTenant = new Map<
    string,
    { total: number; overdueVerification: number; verificationBacklog: number }
  >();
  for (const row of reminderLogs) {
    const current = reminderByTenant.get(row.tenant_apotek_id) ?? {
      total: 0,
      overdueVerification: 0,
      verificationBacklog: 0,
    };
    current.total += 1;
    if (row.reason_code === "overdue_verification") current.overdueVerification += 1;
    if (row.reason_code === "verification_backlog") current.verificationBacklog += 1;
    reminderByTenant.set(row.tenant_apotek_id, current);
  }

  const tenantRows = scopedTenantIds
    .map((tenantId) => {
      const tenant = tenants.find((item) => item.id === tenantId);
      if (!tenant) return null;
      const queue = queueMap.get(tenantId) ?? { openQueue: 0, overdueQueue: 0 };
      const reminder = reminderByTenant.get(tenantId) ?? {
        total: 0,
        overdueVerification: 0,
        verificationBacklog: 0,
      };
      return {
        tenantId,
        tenantCode: tenant.code,
        tenantName: tenant.name,
        openQueue: queue.openQueue,
        overdueQueue: queue.overdueQueue,
        reminders7d: reminder.total,
        overdueReminders7d: reminder.overdueVerification,
        backlogReminders7d: reminder.verificationBacklog,
        assignments: assignmentMap.get(tenantId) ?? 0,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.overdueQueue - a.overdueQueue || b.openQueue - a.openQueue);

  const totals = tenantRows.reduce(
    (acc, row) => {
      acc.openQueue += row.openQueue;
      acc.overdueQueue += row.overdueQueue;
      acc.reminders7d += row.reminders7d;
      acc.assignments += row.assignments;
      return acc;
    },
    { openQueue: 0, overdueQueue: 0, reminders7d: 0, assignments: 0 },
  );

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">BBA Control Dashboard</h1>
        <p className="text-sm text-slate-600">
          Monitoring reminder, backlog verifikasi, dan SLA lintas tenant (window: 7 hari).
        </p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <Link
          href="/bba/control-dashboard?tenant=all"
          className={`rounded-md px-3 py-1 text-xs font-medium ${
            params.tenant === "all" ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-700"
          }`}
        >
          Semua Tenant
        </Link>
        {tenants.map((tenant) => (
          <Link
            key={tenant.id}
            href={`/bba/control-dashboard?tenant=${tenant.id}`}
            className={`rounded-md px-3 py-1 text-xs font-medium ${
              selectedTenantId === tenant.id && params.tenant !== "all"
                ? "bg-slate-900 text-white"
                : "border border-slate-300 text-slate-700"
            }`}
          >
            {tenant.code}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Open Queue</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {numberFormatter.format(totals.openQueue)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">SLA Breach Queue</p>
          <p className="mt-2 text-2xl font-bold text-rose-700">
            {numberFormatter.format(totals.overdueQueue)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Reminder Events (7 Hari)</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {numberFormatter.format(totals.reminders7d)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Assignment Records</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {numberFormatter.format(totals.assignments)}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <p>
          Fokus hari ini: <span className="font-semibold">prioritaskan tenant dengan SLA breach tertinggi</span>,
          lalu lanjut tenant dengan open queue tinggi tetapi assignment rendah.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Waktu monitoring: {reminderWindow.dateKey} (WIB), cut-off {reminderWindow.cutoffHour}.00 WIB.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2">Tenant</th>
              <th className="px-3 py-2">Open Queue</th>
              <th className="px-3 py-2">SLA Breach</th>
              <th className="px-3 py-2">Reminder 7D</th>
              <th className="px-3 py-2">Overdue Reminder 7D</th>
              <th className="px-3 py-2">Assignments</th>
            </tr>
          </thead>
          <tbody>
            {tenantRows.map((row) => (
              <tr key={row.tenantId} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <p className="font-medium text-slate-900">{row.tenantCode}</p>
                  <p className="text-xs text-slate-500">{row.tenantName}</p>
                </td>
                <td className="px-3 py-2">{numberFormatter.format(row.openQueue)}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                      row.overdueQueue > 0
                        ? "bg-rose-100 text-rose-800"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {numberFormatter.format(row.overdueQueue)}
                  </span>
                </td>
                <td className="px-3 py-2">{numberFormatter.format(row.reminders7d)}</td>
                <td className="px-3 py-2">{numberFormatter.format(row.overdueReminders7d)}</td>
                <td className="px-3 py-2">{numberFormatter.format(row.assignments)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Drill-Down Reminder ({selectedTenantCode})
          </h2>
          <p className="mt-1 text-xs text-slate-500">{selectedTenantName} - 7 hari terakhir</p>
          <div className="mt-3 space-y-2 text-sm">
            {params.tenant === "all" ? (
              <p className="text-slate-500">Pilih tenant spesifik untuk melihat breakdown detail.</p>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-md border border-slate-200 p-2">
                  <span className="text-slate-600">verification_backlog</span>
                  <span className="font-semibold text-slate-900">
                    {numberFormatter.format(reminderReasonMap.get("verification_backlog") ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-slate-200 p-2">
                  <span className="text-slate-600">overdue_verification</span>
                  <span className="font-semibold text-slate-900">
                    {numberFormatter.format(reminderReasonMap.get("overdue_verification") ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-slate-200 p-2">
                  <span className="text-slate-600">missing_submission</span>
                  <span className="font-semibold text-slate-900">
                    {numberFormatter.format(reminderReasonMap.get("missing_submission") ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-slate-200 p-2">
                  <span className="text-slate-600">pending_submission</span>
                  <span className="font-semibold text-slate-900">
                    {numberFormatter.format(reminderReasonMap.get("pending_submission") ?? 0)}
                  </span>
                </div>
              </>
            )}
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Queue Prioritas Tenant
          </h2>
          <p className="mt-1 text-xs text-slate-500">Urut tanggal terlama, maksimal 12 item.</p>
          <div className="mt-3 space-y-2 text-sm">
            {params.tenant === "all" ? (
              <p className="text-slate-500">Pilih tenant spesifik untuk melihat queue prioritas.</p>
            ) : queueDetails.length === 0 ? (
              <p className="text-slate-500">Tidak ada queue terbuka untuk tenant ini.</p>
            ) : (
              queueDetails.map((row) => {
                const actor = Array.isArray(row.user) ? row.user[0] : row.user;
                const assignment = Array.isArray(row.assignment) ? row.assignment[0] : row.assignment;
                const assignee = assignment
                  ? Array.isArray(assignment.assignee)
                    ? assignment.assignee[0]
                    : assignment.assignee
                  : null;
                return (
                  <div key={row.id} className="rounded-md border border-slate-200 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-slate-900">
                        {row.submission_date} - {row.shift_label}
                      </p>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                        {row.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">Input by: {actor?.full_name ?? "Tanpa nama"}</p>
                    <p className="text-xs text-slate-600">
                      Assignee: {assignee?.full_name ?? "Belum ditugaskan"}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </article>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/bba/master-apotek"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          Buka Master Apotek
        </Link>
        <Link
          href="/bba/audit-log"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
        >
          Buka Audit Log
        </Link>
        <Link
          href="/bba/export-center"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
        >
          Buka Export Center
        </Link>
      </div>
    </section>
  );
}
