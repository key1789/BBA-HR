import { getSessionContext } from "@/lib/auth-context";
import { recordReminderDispatch } from "@/lib/reminder-dispatch-log";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
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

  const reminderWindow = getOperationalReminderWindow();
  const today = reminderWindow.dateKey;
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
  const reminders: { tone: "amber" | "emerald"; text: string; href: string; cta: string }[] = [];
  if ((todayCount.count ?? 0) === 0) {
    const deadlineCopy =
      reminderWindow.phase === "post_cutoff"
        ? "Cut-off sudah lewat, mohon input secepatnya untuk menghindari keterlambatan."
        : `Input minimal satu submission sebelum pukul ${String(reminderWindow.cutoffHour).padStart(2, "0")}.00 ${reminderWindow.timezoneLabel}.`;
    reminders.push({
      tone: "amber",
      text: `Belum ada input hari ini. ${deadlineCopy}`,
      href: "/crew/input-harian",
      cta: "Input Sekarang",
    });
  }
  if ((personalPending.count ?? 0) > 0) {
    const pendingCopy =
      reminderWindow.phase === "post_cutoff"
        ? "Segera cek agar tidak menumpuk ke hari berikutnya."
        : "Pastikan data sudah lengkap sebelum cut-off.";
    reminders.push({
      tone: "amber",
      text: `Ada ${numberFormatter.format(
        personalPending.count ?? 0,
      )} submission menunggu verifikasi. ${pendingCopy}`,
      href: "/crew/riwayat-input",
      cta: "Cek Riwayat",
    });
  }
  if (reminders.length === 0) {
    reminders.push({
      tone: "emerald",
      text: "Semua indikator operasional kamu aman. Pertahankan ritme input harian.",
      href: "/crew/leaderboard",
      cta: "Lihat Leaderboard",
    });
  }
  const reminderWrites: Promise<unknown>[] = [];
  if ((todayCount.count ?? 0) === 0) {
    reminderWrites.push(
      recordReminderDispatch(supabase, {
        tenantApotekId: active.tenantId,
        actorUserId: user?.id ?? null,
        reminderDate: reminderWindow.dateKey,
        phase: reminderWindow.phase,
        scope: "crew_dashboard",
        reasonCode: "missing_submission",
        payload: { pendingCount: personalPending.count ?? 0 },
      }),
    );
  }
  if ((personalPending.count ?? 0) > 0) {
    reminderWrites.push(
      recordReminderDispatch(supabase, {
        tenantApotekId: active.tenantId,
        actorUserId: user?.id ?? null,
        reminderDate: reminderWindow.dateKey,
        phase: reminderWindow.phase,
        scope: "crew_dashboard",
        reasonCode: "pending_submission",
        payload: { pendingCount: personalPending.count ?? 0 },
      }),
    );
  }
  if (reminderWrites.length > 0) {
    await Promise.allSettled(reminderWrites);
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Crew Dashboard</h1>
        <p className="text-sm text-slate-600">
          Ringkasan aktivitas input untuk tenant aktif: {active.tenantCode}
        </p>
      </div>
      <div className="space-y-2">
        {reminders.map((reminder) => (
          <div
            key={reminder.text}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm ${
              reminder.tone === "amber"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            <p>{reminder.text}</p>
            <Link
              href={reminder.href}
              className="rounded-md border border-current px-3 py-1 text-xs font-semibold"
            >
              {reminder.cta}
            </Link>
          </div>
        ))}
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
