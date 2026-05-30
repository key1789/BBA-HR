import {
  bulkVerifySubmissionsAction,
  verifySubmissionAction,
} from "@/actions/operational";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { InlineAlert } from "@/components/shared/inline-alert";
import { FlashMessage } from "@/components/shared/flash-message";
import { Input } from "@/components/shared/input";
import { PageHeader } from "@/components/shared/page-header";
import { PendingSubmitButton } from "./submit-buttons";
import { MobileFilterSheet } from "./mobile-filter-sheet";
import { DirectEditModal } from "./direct-edit-modal";
import { MobileActionBar } from "./mobile-action-bar";
import { HelpDrawer } from "@/components/shared/help-drawer";
import { VERIFIKASI_HELP } from "./help-content";
import { getSessionContext } from "@/lib/auth-context";
import {
  getSubmissionStatusBadgeClass,
  getSubmissionStatusLabel,
  getVerificationActionLabel,
} from "@/lib/labels";
import { recordReminderDispatch } from "@/lib/reminder-dispatch-log";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
import { readFlashMessage } from "@/lib/flash-message";
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
  late_reason: string | null;
  status: string;
  user: { full_name: string } | { full_name: string }[] | null;
};
const PAGE_SIZE = 15;
const FILTERABLE_STATUS = ["all", "submitted", "edited_by_admin", "reject", "approved"] as const;

// Urutan prioritas: item yang butuh aksi admin muncul paling atas.
const STATUS_PRIORITY: Record<string, number> = {
  submitted:        0,
  edited_by_admin:  1,
  reject:           2,
  draft:            3,
  missing_submission: 4,
  approved:         5,
};

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
  }>;
}) {
  const params = await searchParams;
  const flash = await readFlashMessage();
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "admin_apotek") {
    return (
      <section className="space-y-4">
        <PageHeader
          title="Admin - Verifikasi Data"
          subtitle="Halaman ini hanya untuk admin apotek."
        />
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
      "id, submission_date, shift_label, omzet_total, transaction_total, product_total, rejected_customer_total, late_reason, status, user:user_id(full_name)",
      { count: "exact" },
    )
    .eq("tenant_apotek_id", active.tenantId)
    .order("submission_date", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (selectedStatus !== "all") {
    query = query.eq("status", selectedStatus);
  }
  // "all" = tidak filter status — tampilkan semua submission.
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
    .in("status", ["submitted"]);

  const rowsRaw = (data ?? []) as VerificationQueueRow[];
  const submissionIds = rowsRaw.map((row) => row.id);
  const { data: submissionProducts } =
    submissionIds.length > 0
      ? await supabase
          .from("daily_submission_products")
          .select("submission_id, product_id, quantity_sold")
          .in("submission_id", submissionIds)
      : { data: [] as { submission_id: string; product_id: string; quantity_sold: number }[] };
  const productIds = Array.from(new Set((submissionProducts ?? []).map((row) => row.product_id).filter(Boolean)));
  const { data: productRows } =
    productIds.length > 0
      ? await supabase.from("master_products").select("id, product_name").in("id", productIds)
      : { data: [] as { id: string; product_name: string }[] };
  const productNameById = new Map((productRows ?? []).map((p) => [p.id, p.product_name]));
  const productsBySubmission = new Map<string, { product_name: string; quantity_sold: number }[]>();
  for (const row of submissionProducts ?? []) {
    const prev = productsBySubmission.get(row.submission_id) ?? [];
    prev.push({
      product_name: productNameById.get(row.product_id) ?? "Produk",
      quantity_sold: Number(row.quantity_sold ?? 0),
    });
    productsBySubmission.set(row.submission_id, prev);
  }

  const { data: verificationRows } =
    submissionIds.length > 0
      ? await supabase
          .from("submission_verifications")
          .select("submission_id, action, error_code, note, acted_at, actor:acted_by_user_id(full_name)")
          .in("submission_id", submissionIds)
          .order("acted_at", { ascending: false })
      : {
          data: [] as {
            submission_id: string;
            action: string;
            error_code: string | null;
            note: string | null;
            acted_at: string;
            actor: { full_name: string } | { full_name: string }[] | null;
          }[],
        };
  const verificationsBySubmission = new Map<
    string,
    {
      action: string;
      error_code: string | null;
      note: string | null;
      acted_at: string;
      actor_name: string;
    }[]
  >();
  for (const row of verificationRows ?? []) {
    const prev = verificationsBySubmission.get(row.submission_id) ?? [];
    const actorName = Array.isArray(row.actor) ? row.actor[0]?.full_name : row.actor?.full_name;
    prev.push({
      action: row.action,
      error_code: row.error_code,
      note: row.note,
      acted_at: row.acted_at,
      actor_name: actorName ?? "Admin",
    });
    verificationsBySubmission.set(row.submission_id, prev);
  }

  const rows = [...rowsRaw].sort((a, b) => {
    const priorityA = STATUS_PRIORITY[a.status] ?? 9;
    const priorityB = STATUS_PRIORITY[b.status] ?? 9;
    if (priorityA !== priorityB) return priorityA - priorityB;
    // Dalam grup yang sama: tanggal terlama dulu (mendekati SLA terlewat)
    return a.submission_date.localeCompare(b.submission_date);
  });
  const rowsByDate = rows.reduce<Record<string, VerificationQueueRow[]>>((acc, row) => {
    if (!acc[row.submission_date]) acc[row.submission_date] = [];
    acc[row.submission_date].push(row);
    return acc;
  }, {});
  const numberFormatter = new Intl.NumberFormat("id-ID");
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
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
      <PageHeader title="Verifikasi Data" />
      <InlineAlert
        tone={reminderTone === "rose" ? "error" : reminderTone === "amber" ? "warning" : "success"}
        message={reminderText}
      />
      <MobileFilterSheet
        queueCount={count ?? 0}
        selectedStatus={selectedStatus}
        from={from}
        to={to}
      />
      <section className="space-y-4 md:hidden">
        {rows.length === 0 ? (
          <Card className="rounded-2xl p-4 text-sm text-slate-500">Tidak ada queue verifikasi.</Card>
        ) : (
          Object.entries(rowsByDate).map(([dateKey, dateRows]) => (
            <div key={`date-group-${dateKey}`} className="space-y-2.5">
              {/* Date separator */}
              <div className="flex items-center gap-2 px-1">
                <span className="flex-shrink-0 rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-600">
                  {dateKey}
                </span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              {dateRows.map((row) => {
                const userName = Array.isArray(row.user)
                  ? row.user[0]?.full_name ?? "Tanpa Nama"
                  : row.user?.full_name ?? "Tanpa Nama";
                const sla = getSlaBadge(row.submission_date, reminderWindow.dateKey);
                const focusItems = productsBySubmission.get(row.id) ?? [];
                const verifs = verificationsBySubmission.get(row.id) ?? [];

                return (
                  <div key={`card-${row.id}`} className="rounded-2xl border border-slate-100 bg-white shadow-sm">

                    {/* ── Body ─────────────────────────────────────── */}
                    <div className="px-4 pb-3 pt-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-800">{userName}</p>
                          <p className="mt-0.5 text-[11px] text-slate-400">{row.shift_label}</p>
                        </div>
                        <span className={`inline-flex flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${getSubmissionStatusBadgeClass(row.status)}`}>
                          {getSubmissionStatusLabel(row.status)}
                        </span>
                      </div>

                      <p className="mt-3 text-xl font-black tracking-tight text-slate-900 tabular-nums">
                        Rp {numberFormatter.format(Number(row.omzet_total))}
                      </p>

                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                        <span className="text-[11px] text-slate-500">
                          Trx:{" "}
                          <span className="font-semibold text-slate-700">
                            {numberFormatter.format(Number(row.transaction_total))}
                          </span>
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Produk:{" "}
                          <span className="font-semibold text-slate-700">
                            {numberFormatter.format(Number(row.product_total))}
                          </span>
                        </span>
                        <span className="text-[11px] text-slate-500">
                          DT:{" "}
                          <span className="font-semibold text-slate-700">
                            {numberFormatter.format(Number(row.rejected_customer_total))}
                          </span>
                        </span>
                      </div>

                      <div className="mt-2.5">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${sla.className}`}>
                          {sla.text}
                        </span>
                      </div>
                    </div>

                    {/* ── Action bar ───────────────────────────────── */}
                    <MobileActionBar
                      submissionId={row.id}
                      page={page}
                      selectedStatus={selectedStatus}
                      from={from}
                      to={to}
                      defaultValues={{
                        omzetTotal: Number(row.omzet_total),
                        transactionTotal: Number(row.transaction_total),
                        productTotal: Number(row.product_total),
                        rejectedCustomerTotal: Number(row.rejected_customer_total),
                        lateReason: row.late_reason,
                      }}
                    />

                    {/* ── Expandable detail ────────────────────────── */}
                    <details className="group overflow-hidden rounded-b-2xl border-t border-slate-100">
                      <summary className="flex cursor-pointer list-none select-none items-center justify-between px-4 py-2.5">
                        <span className="text-xs font-semibold text-indigo-600 group-open:hidden">Lihat detail</span>
                        <span className="hidden text-xs font-semibold text-indigo-600 group-open:inline">Sembunyikan</span>
                        <svg
                          className="h-3.5 w-3.5 text-slate-400 transition-transform group-open:rotate-180"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </summary>

                      <div className="space-y-3 bg-slate-50/50 px-4 pb-4 pt-2">
                        {row.late_reason?.trim() ? (
                          <div>
                            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                              Alasan Terlambat
                            </p>
                            <p className="text-xs text-slate-700">{row.late_reason}</p>
                          </div>
                        ) : null}

                        <div>
                          <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Produk Fokus
                          </p>
                          {focusItems.length === 0 ? (
                            <p className="text-xs text-slate-400">Tidak ada data produk fokus.</p>
                          ) : (
                            <div className="space-y-1">
                              {focusItems.map((item, idx) => (
                                <div key={`fi-${row.id}-${idx}`} className="flex justify-between text-xs">
                                  <span className="text-slate-600">{item.product_name}</span>
                                  <span className="font-semibold text-slate-800">
                                    {numberFormatter.format(item.quantity_sold)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Riwayat Verifikasi
                          </p>
                          {verifs.length === 0 ? (
                            <p className="text-xs text-slate-400">Belum ada riwayat verifikasi.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {verifs.slice(0, 5).map((v, idx) => (
                                <div key={`vr-${row.id}-${idx}`} className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                                  <p className="text-xs font-semibold text-slate-700">
                                    {getVerificationActionLabel(v.action)}{" "}
                                    <span className="font-normal text-slate-500">oleh {v.actor_name}</span>
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-slate-400">
                                    {new Date(v.acted_at).toLocaleString("id-ID")}
                                    {v.error_code ? ` · kode: ${v.error_code}` : ""}
                                    {v.note ? ` · ${v.note}` : ""}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </details>

                  </div>
                );
              })}
            </div>
          ))
        )}
      </section>
      <form className="hidden items-end gap-2 overflow-x-auto bg-white rounded-3xl border border-slate-100 p-3 shadow-sm md:grid md:gap-3 md:overflow-visible md:p-4 md:grid-cols-4">
        <label className="min-w-[130px] text-sm text-slate-700 md:min-w-0">
          Status
          <select
            name="status"
            defaultValue={selectedStatus}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="all">Semua (prioritas aksi)</option>
            <option value="submitted">Menunggu Verifikasi</option>
            <option value="edited_by_admin">Diedit Admin</option>
            <option value="reject">Ditolak</option>
            <option value="approved">Disetujui</option>
          </select>
        </label>
        <label className="min-w-[140px] text-sm text-slate-700 md:min-w-0">
          Dari Tanggal
          <Input
            type="date"
            name="from"
            defaultValue={from}
          />
        </label>
        <label className="min-w-[140px] text-sm text-slate-700 md:min-w-0">
          Sampai Tanggal
          <Input
            type="date"
            name="to"
            defaultValue={to}
          />
        </label>
        <div className="flex min-w-[180px] items-end gap-2 md:min-w-0">
          <Button
            type="submit"
          >
            Terapkan Filter
          </Button>
          <Link
            href="/admin/verifikasi"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
          >
            Reset
          </Link>
        </div>
      </form>
      <FlashMessage flash={flash} />
      <form className="hidden bg-white rounded-3xl border border-slate-100 p-4 shadow-sm md:block">
        <input type="hidden" name="page" value={String(page)} />
        <input type="hidden" name="status" value={selectedStatus} />
        <input type="hidden" name="from" value={from} />
        <input type="hidden" name="to" value={to} />
        <div className="flex flex-wrap gap-2">
          {rows.length === 0 ? (
            <>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-400"
              >
                Setujui massal (halaman ini)
              </button>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-400"
              >
                Tolak massal (halaman ini)
              </button>
            </>
          ) : (
            <>
              <PendingSubmitButton
                formAction={bulkVerifySubmissionsAction}
                hiddenFields={{ bulkAction: "approve" }}
                idleLabel="Setujui massal (halaman ini)"
                pendingLabel="Memproses..."
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
              />
              <PendingSubmitButton
                formAction={bulkVerifySubmissionsAction}
                hiddenFields={{ bulkAction: "reject" }}
                idleLabel="Tolak massal (halaman ini)"
                pendingLabel="Memproses..."
                className="rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700"
              />
            </>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Pilih baris yang ingin diproses. Default semua baris halaman ini terpilih.
        </p>
        <Card className="mt-3 overflow-x-auto rounded-2xl shadow-none">
        <table className="min-w-[820px] text-left text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2">Pilih</th>
              <th className="px-3 py-2">Tanggal</th>
              <th className="px-3 py-2">Crew</th>
              <th className="px-3 py-2">Omzet</th>
              <th className="px-3 py-2">SLA</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Detail</th>
              <th className="px-3 py-2">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={8}>
                  Tidak ada queue verifikasi.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50 has-[:checked]:bg-indigo-50/50">
                <td className="px-3 py-2">
                  <input type="checkbox" name="submissionIds" value={row.id} defaultChecked />
                </td>
                <td className="px-3 py-2 text-sm">{row.submission_date}</td>
                <td className="px-3 py-2">
                  <p className="font-medium text-slate-800">
                    {Array.isArray(row.user) ? row.user[0]?.full_name : row.user?.full_name}
                  </p>
                  <p className="text-xs text-slate-400">{row.shift_label}</p>
                </td>
                <td className="px-3 py-2">
                  <p className="font-medium text-slate-800">{numberFormatter.format(Number(row.omzet_total))}</p>
                  <p className="text-xs text-slate-400">
                    Trx: {numberFormatter.format(Number(row.transaction_total))} &middot; Produk: {numberFormatter.format(Number(row.product_total))} &middot; DT: {numberFormatter.format(Number(row.rejected_customer_total))}
                  </p>
                </td>
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
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getSubmissionStatusBadgeClass(row.status)}`}
                  >
                    {getSubmissionStatusLabel(row.status)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <details className="group">
                    <summary className="cursor-pointer text-xs font-semibold text-indigo-700 hover:text-indigo-800 select-none list-none">
                      <span className="group-open:hidden">Lihat detail</span>
                      <span className="hidden group-open:inline">Sembunyikan</span>
                    </summary>
                    <div className="mt-2 w-[380px] rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-md">
                      <p className="font-semibold text-slate-800">Input Crew</p>
                      <div className="mt-1 grid grid-cols-2 gap-1">
                        <p>Omzet: <span className="font-medium">{numberFormatter.format(Number(row.omzet_total))}</span></p>
                        <p>Transaksi: <span className="font-medium">{numberFormatter.format(Number(row.transaction_total))}</span></p>
                        <p>Produk: <span className="font-medium">{numberFormatter.format(Number(row.product_total))}</span></p>
                        <p>Pelanggan ditolak: <span className="font-medium">{numberFormatter.format(Number(row.rejected_customer_total))}</span></p>
                      </div>
                      <p className="mt-2">
                        Alasan terlambat:{" "}
                        <span className="font-medium">{row.late_reason?.trim() ? row.late_reason : "-"}</span>
                      </p>
                      <div className="mt-2">
                        <p className="font-semibold text-slate-800">Produk Fokus</p>
                        {(productsBySubmission.get(row.id) ?? []).length === 0 ? (
                          <p className="text-slate-500">Tidak ada detail produk fokus.</p>
                        ) : (
                          <ul className="mt-1 space-y-1">
                            {(productsBySubmission.get(row.id) ?? []).map((item, idx) => (
                              <li key={`${row.id}-fp-${idx}`}>
                                {item.product_name}: <span className="font-medium">{numberFormatter.format(item.quantity_sold)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="mt-2">
                        <p className="font-semibold text-slate-800">Riwayat Verifikasi</p>
                        {(verificationsBySubmission.get(row.id) ?? []).length === 0 ? (
                          <p className="text-slate-500">Belum ada riwayat verifikasi.</p>
                        ) : (
                          <ul className="mt-1 space-y-1">
                            {(verificationsBySubmission.get(row.id) ?? []).map((v, idx) => (
                              <li key={`${row.id}-ver-${idx}`} className="rounded-md bg-slate-50 px-2 py-1">
                                <p>
                                  <span className="font-semibold">{getVerificationActionLabel(v.action)}</span>{" "}
                                  oleh <span className="font-medium">{v.actor_name}</span>
                                </p>
                                <p className="text-slate-500">
                                  {new Date(v.acted_at).toLocaleString("id-ID")}
                                  {v.error_code ? ` · kode: ${v.error_code}` : ""}
                                  {v.note ? ` · ${v.note}` : ""}
                                </p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </details>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    {(["approve", "reject"] as const).map((action) => (
                      <PendingSubmitButton
                        key={`${row.id}-${action}`}
                        formAction={verifySubmissionAction}
                        hiddenFields={{ verification: `${row.id}:${action}` }}
                        idleLabel={getVerificationActionLabel(action)}
                        pendingLabel="Memproses..."
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700"
                      />
                    ))}
                    <DirectEditModal
                      submissionId={row.id}
                      page={page}
                      selectedStatus={selectedStatus}
                      from={from}
                      to={to}
                      defaultValues={{
                        omzetTotal: Number(row.omzet_total),
                        transactionTotal: Number(row.transaction_total),
                        productTotal: Number(row.product_total),
                        rejectedCustomerTotal: Number(row.rejected_customer_total),
                        lateReason: row.late_reason,
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </Card>
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

      <HelpDrawer content={VERIFIKASI_HELP} />
    </section>
  );
}
