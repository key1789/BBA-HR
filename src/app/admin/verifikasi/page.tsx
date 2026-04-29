import {
  bulkAssignSubmissionsAction,
  bulkVerifySubmissionsAction,
  verifySubmissionAction,
} from "@/app/actions/operational";
import { getSessionContext } from "@/lib/auth-context";
import {
  getSubmissionStatusBadgeClass,
  getSubmissionStatusLabel,
  getVerificationActionLabel,
} from "@/lib/labels";
import { recordReminderDispatch } from "@/lib/reminder-dispatch-log";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

type VerificationQueueRow = {
  id: string;
  submission_date: string;
  shift_label: string;
  omzet_total: number;
  transaction_total: number;
  product_total: number;
  rejected_customer_total: number;
  status: string;
  user: { full_name: string } | { full_name: string }[] | null;
  assignment:
    | {
        assigned_to_user_id: string;
        assigned_at: string;
        assignee: { full_name: string } | { full_name: string }[] | null;
      }
    | {
        assigned_to_user_id: string;
        assigned_at: string;
        assignee: { full_name: string } | { full_name: string }[] | null;
      }[]
    | null;
};
const PAGE_SIZE = 15;
const FILTERABLE_STATUS = ["all", "submitted", "edited_by_admin", "reject"] as const;

function getSlaBadge(submissionDate: string, todayDateKey: string) {
  const todayMs = Date.parse(`${todayDateKey}T00:00:00Z`);
  const submissionMs = Date.parse(`${submissionDate}T00:00:00Z`);
  const diffDays = Math.max(0, Math.floor((todayMs - submissionMs) / 86_400_000));
  if (diffDays >= 2) {
    return {
      text: `SLA Terlewati (+${diffDays} hari)`,
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }
  if (diffDays >= 1) {
    return {
      text: "SLA Waspada (H+1)",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  return {
    text: "SLA Aman (H0)",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
}

export default async function AdminVerifikasiPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    status?: string;
    from?: string;
    to?: string;
    feedback?: string;
    message?: string;
    count?: string;
  }>;
}) {
  const params = await searchParams;
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || (active.role !== "admin_apotek" && active.role !== "super_admin_bba")) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Admin - Verifikasi Data</h1>
        <p className="text-sm text-slate-600">
          Halaman ini hanya untuk admin apotek atau super admin BBA.
        </p>
      </section>
    );
  }

  const supabase = await createClient();
  const parsedPage = Number(params.page ?? "1");
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
  const offset = (page - 1) * PAGE_SIZE;
  const selectedStatus = FILTERABLE_STATUS.includes(
    (params.status ?? "all") as (typeof FILTERABLE_STATUS)[number],
  )
    ? (params.status ?? "all")
    : "all";
  const from = params.from ?? "";
  const to = params.to ?? "";
  const reminderWindow = getOperationalReminderWindow();

  let query = supabase
    .from("daily_submissions")
    .select(
      "id, submission_date, shift_label, omzet_total, transaction_total, product_total, rejected_customer_total, status, user:user_id(full_name), assignment:submission_assignments(assigned_to_user_id, assigned_at, assignee:assigned_to_user_id(full_name))",
      { count: "exact" },
    )
    .eq("tenant_apotek_id", active.tenantId)
    .order("submission_date", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (selectedStatus !== "all") {
    query = query.eq("status", selectedStatus);
  } else {
    query = query.in("status", ["submitted", "edited_by_admin", "reject"]);
  }
  if (from) {
    query = query.gte("submission_date", from);
  }
  if (to) {
    query = query.lte("submission_date", to);
  }
  const { data, count } = await query;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { count: overdueQueueCount } = await supabase
    .from("daily_submissions")
    .select("id", { count: "exact", head: true })
    .eq("tenant_apotek_id", active.tenantId)
    .lt("submission_date", reminderWindow.dateKey)
    .in("status", ["submitted", "edited_by_admin", "reject"]);

  const rows = (data ?? []) as VerificationQueueRow[];
  const numberFormatter = new Intl.NumberFormat("id-ID");
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const feedbackStatus =
    params.feedback === "success" || params.feedback === "error"
      ? params.feedback
      : null;
  const feedbackMessageMap: Record<string, string> = {
    bulk_approved: `Bulk approve berhasil untuk ${params.count ?? "0"} submission.`,
    bulk_rejected: `Bulk reject berhasil untuk ${params.count ?? "0"} submission.`,
    bulk_edited_directly: `Bulk edit langsung berhasil untuk ${params.count ?? "0"} submission.`,
    bulk_empty: "Pilih minimal satu submission untuk bulk approve.",
    bulk_none_eligible: "Submission terpilih tidak memenuhi syarat approve.",
    bulk_action_invalid: "Aksi bulk tidak valid.",
    bulk_fetch_failed: "Gagal membaca data submission terpilih.",
    bulk_insert_failed: "Bulk approve gagal diproses. Silakan coba lagi.",
    assign_mode_invalid: "Mode assign tidak valid.",
    assign_selection_empty: "Pilih minimal satu submission untuk assign.",
    assign_fetch_failed: "Gagal membaca submission untuk assign.",
    assign_none_eligible: "Submission terpilih tidak memenuhi syarat assign.",
    assign_all_assigned: "Semua submission terpilih sudah memiliki assignee.",
    assign_upsert_failed: "Gagal menyimpan assignment. Silakan coba lagi.",
    assign_unassigned_success: `Auto assign berhasil untuk ${params.count ?? "0"} submission.`,
    assign_take_over_success: `Take over berhasil untuk ${params.count ?? "0"} submission.`,
    access_denied: "Akses ditolak untuk aksi ini.",
    user_not_found: "Sesi user tidak ditemukan. Silakan login ulang.",
  };
  const feedbackMessage =
    feedbackStatus && params.message
      ? feedbackMessageMap[params.message] ?? "Aksi selesai."
      : null;
  const reminderTone =
    reminderWindow.phase === "post_cutoff" && (overdueQueueCount ?? 0) > 0
      ? "rose"
      : reminderWindow.phase === "near_cutoff" || (overdueQueueCount ?? 0) > 0
        ? "amber"
        : "emerald";
  const reminderText =
    reminderTone === "rose"
      ? `Ada ${numberFormatter.format(
          overdueQueueCount ?? 0,
        )} queue lintas hari setelah cut-off. Prioritaskan verifikasi untuk menekan backlog.`
      : reminderTone === "amber"
        ? `Reminder operasional: ${
            reminderWindow.phase === "near_cutoff"
              ? `mendekati cut-off ${String(reminderWindow.cutoffHour).padStart(2, "0")}.00 ${reminderWindow.timezoneLabel}`
              : `${numberFormatter.format(overdueQueueCount ?? 0)} queue lintas hari belum tuntas`
          }.`
        : "Queue verifikasi berada dalam kondisi aman.";
  if (reminderTone === "amber" || reminderTone === "rose") {
    await recordReminderDispatch(supabase, {
      tenantApotekId: active.tenantId,
      actorUserId: user?.id ?? null,
      reminderDate: reminderWindow.dateKey,
      phase: reminderWindow.phase,
      scope: "admin_verifikasi",
      reasonCode: reminderTone === "rose" ? "overdue_verification" : "verification_backlog",
      payload: {
        queueCount: count ?? 0,
        overdueCount: overdueQueueCount ?? 0,
        selectedStatus,
      },
    });
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin - Verifikasi Data</h1>
        <p className="text-sm text-slate-600">
          Antrian verifikasi submission crew/admin pada tenant aktif.
        </p>
      </div>
      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          reminderTone === "rose"
            ? "border-rose-200 bg-rose-50 text-rose-800"
            : reminderTone === "amber"
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
        }`}
      >
        {reminderText}
      </div>
      <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <label className="text-sm text-slate-700">
          Status
          <select
            name="status"
            defaultValue={selectedStatus}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">Semua</option>
            <option value="submitted">Submitted</option>
            <option value="edited_by_admin">Edited by Admin</option>
            <option value="reject">Rejected</option>
          </select>
        </label>
        <label className="text-sm text-slate-700">
          Dari Tanggal
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-slate-700">
          Sampai Tanggal
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Terapkan Filter
          </button>
          <Link
            href="/admin/verifikasi"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
          >
            Reset
          </Link>
        </div>
      </form>
      {feedbackStatus && feedbackMessage ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedbackStatus === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {feedbackMessage}
        </div>
      ) : null}
      <form className="rounded-2xl border border-slate-200 bg-white p-3">
        <input type="hidden" name="page" value={String(page)} />
        <input type="hidden" name="status" value={selectedStatus} />
        <input type="hidden" name="from" value={from} />
        <input type="hidden" name="to" value={to} />
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            formAction={bulkAssignSubmissionsAction}
            name="assignMode"
            value="assign_unassigned"
            disabled={rows.length === 0}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              rows.length === 0
                ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                : "border border-indigo-300 text-indigo-700"
            }`}
          >
            Auto Assign Belum Ditugaskan
          </button>
          <button
            type="submit"
            formAction={bulkAssignSubmissionsAction}
            name="assignMode"
            value="take_over"
            disabled={rows.length === 0}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              rows.length === 0
                ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                : "border border-violet-300 text-violet-700"
            }`}
          >
            Take Over ke Saya
          </button>
          <button
            type="submit"
            formAction={bulkVerifySubmissionsAction}
            name="bulkAction"
            value="edit_directly"
            disabled={rows.length === 0}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              rows.length === 0
                ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                : "border border-slate-300 text-slate-700"
            }`}
          >
            Bulk Edit Langsung
          </button>
          <button
            type="submit"
            formAction={bulkVerifySubmissionsAction}
            name="bulkAction"
            value="approve"
            disabled={rows.length === 0}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              rows.length === 0
                ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                : "bg-slate-900 text-white"
            }`}
          >
            Bulk Approve (Halaman Ini)
          </button>
          <button
            type="submit"
            formAction={bulkVerifySubmissionsAction}
            name="bulkAction"
            value="reject"
            disabled={rows.length === 0}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              rows.length === 0
                ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                : "border border-rose-300 text-rose-700"
            }`}
          >
            Bulk Reject (Halaman Ini)
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Pilih baris yang ingin diproses. Default semua baris halaman ini terpilih.
        </p>
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2">Pilih</th>
              <th className="px-3 py-2">Tanggal</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Shift</th>
              <th className="px-3 py-2">Omzet</th>
              <th className="px-3 py-2">SLA</th>
              <th className="px-3 py-2">Assignee</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={9}>
                  Tidak ada queue verifikasi.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <input type="checkbox" name="submissionIds" value={row.id} defaultChecked />
                </td>
                <td className="px-3 py-2">{row.submission_date}</td>
                <td className="px-3 py-2">
                  {Array.isArray(row.user) ? row.user[0]?.full_name : row.user?.full_name}
                </td>
                <td className="px-3 py-2">{row.shift_label}</td>
                <td className="px-3 py-2">{numberFormatter.format(Number(row.omzet_total))}</td>
                <td className="px-3 py-2">
                  {(() => {
                    const sla = getSlaBadge(row.submission_date, reminderWindow.dateKey);
                    return (
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${sla.className}`}
                      >
                        {sla.text}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-3 py-2">
                  {(() => {
                    const assignment = Array.isArray(row.assignment)
                      ? row.assignment[0]
                      : row.assignment;
                    if (!assignment) {
                      return <span className="text-xs text-slate-500">Belum ditugaskan</span>;
                    }
                    const assignee = Array.isArray(assignment.assignee)
                      ? assignment.assignee[0]
                      : assignment.assignee;
                    return (
                      <div className="text-xs text-slate-700">
                        <p className="font-medium">{assignee?.full_name ?? "Tanpa nama"}</p>
                        <p className="text-slate-500">
                          {new Date(assignment.assigned_at).toLocaleString("id-ID")}
                        </p>
                      </div>
                    );
                  })()}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getSubmissionStatusBadgeClass(row.status)}`}
                  >
                    {getSubmissionStatusLabel(row.status)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    {(["approve", "reject", "edit_directly"] as const).map((action) => (
                      <form action={verifySubmissionAction} key={`${row.id}-${action}`}>
                        <input type="hidden" name="submissionId" value={row.id} />
                        <input type="hidden" name="action" value={action} />
                        <input
                          type="hidden"
                          name="errorCode"
                          value={action === "approve" ? "" : "verification_issue"}
                        />
                        <button
                          type="submit"
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700"
                        >
                          {getVerificationActionLabel(action)}
                        </button>
                      </form>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </form>
      {(() => {
        const pageParams = new URLSearchParams();
        if (selectedStatus !== "all") pageParams.set("status", selectedStatus);
        if (from) pageParams.set("from", from);
        if (to) pageParams.set("to", to);
        const prevParams = new URLSearchParams(pageParams);
        prevParams.set("page", String(page - 1));
        const nextParams = new URLSearchParams(pageParams);
        nextParams.set("page", String(page + 1));
        return (
      <div className="flex items-center justify-between text-sm text-slate-600">
        <p>
          Halaman {page} dari {totalPages}
        </p>
        <div className="flex gap-2">
          {hasPrev ? (
            <Link
              href={`/admin/verifikasi?${prevParams.toString()}`}
              className="rounded-md border border-slate-300 px-3 py-1 font-medium text-slate-700"
            >
              Sebelumnya
            </Link>
          ) : (
            <span className="rounded-md border border-slate-200 px-3 py-1 text-slate-400">
              Sebelumnya
            </span>
          )}
          {hasNext ? (
            <Link
              href={`/admin/verifikasi?${nextParams.toString()}`}
              className="rounded-md border border-slate-300 px-3 py-1 font-medium text-slate-700"
            >
              Berikutnya
            </Link>
          ) : (
            <span className="rounded-md border border-slate-200 px-3 py-1 text-slate-400">
              Berikutnya
            </span>
          )}
        </div>
      </div>
        );
      })()}
    </section>
  );
}
