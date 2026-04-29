import { getSessionContext } from "@/lib/auth-context";
import { recordReminderDispatch } from "@/lib/reminder-dispatch-log";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
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
  const [
    {
      data: { user },
    },
    queueCount,
    approvedCount,
    needsFollowupCount,
  ] = await Promise.all([
    supabase.auth.getUser(),
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
  const reminderWindow = getOperationalReminderWindow();
  const queueValue = queueCount.count ?? 0;
  const followupValue = needsFollowupCount.count ?? 0;
  const reminder =
    queueValue > 0 || followupValue > 0
      ? {
          tone: "amber" as const,
          title:
            reminderWindow.phase === "post_cutoff"
              ? "Cut-off terlewati"
              : reminderWindow.phase === "near_cutoff"
                ? "Mendekati cut-off"
                : "Perlu tindakan verifikasi",
          text: `Terdapat ${numberFormatter.format(
            queueValue,
          )} antrian verifikasi dan ${numberFormatter.format(
            followupValue,
          )} item tindak lanjut. ${
            reminderWindow.phase === "post_cutoff"
              ? "Prioritaskan penyelesaian segera untuk menekan backlog."
              : `Prioritaskan penyelesaian sebelum pukul ${String(reminderWindow.cutoffHour).padStart(2, "0")}.00 ${reminderWindow.timezoneLabel}.`
          }`,
        }
      : {
          tone: "emerald" as const,
          title: "Queue terkendali",
          text: "Antrian verifikasi saat ini terkendali. Lanjutkan monitoring berkala.",
        };
  if (queueValue > 0 || followupValue > 0) {
    await recordReminderDispatch(supabase, {
      tenantApotekId: active.tenantId,
      actorUserId: user?.id ?? null,
      reminderDate: reminderWindow.dateKey,
      phase: reminderWindow.phase,
      scope: "admin_dashboard",
      reasonCode: "verification_backlog",
      payload: {
        queueCount: queueValue,
        followupCount: followupValue,
      },
    });
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin Apotek Dashboard</h1>
        <p className="text-sm text-slate-600">
          Monitoring verifikasi dan kualitas data untuk tenant aktif: {active.tenantCode}
        </p>
      </div>
      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          reminder.tone === "amber"
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-emerald-200 bg-emerald-50 text-emerald-800"
        }`}
      >
        <p className="font-semibold">{reminder.title}</p>
        {reminder.text}
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
