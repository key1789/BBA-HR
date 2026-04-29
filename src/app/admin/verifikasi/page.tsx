import { verifySubmissionAction } from "@/app/actions/operational";
import { getSessionContext } from "@/lib/auth-context";
import {
  getSubmissionStatusBadgeClass,
  getSubmissionStatusLabel,
  getVerificationActionLabel,
} from "@/lib/labels";
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
};
const PAGE_SIZE = 15;

export default async function AdminVerifikasiPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
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
  const { data, count } = await supabase
    .from("daily_submissions")
    .select(
      "id, submission_date, shift_label, omzet_total, transaction_total, product_total, rejected_customer_total, status, user:user_id(full_name)",
      { count: "exact" },
    )
    .eq("tenant_apotek_id", active.tenantId)
    .in("status", ["submitted", "edited_by_admin", "reject"])
    .order("submission_date", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const rows = (data ?? []) as VerificationQueueRow[];
  const numberFormatter = new Intl.NumberFormat("id-ID");
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin - Verifikasi Data</h1>
        <p className="text-sm text-slate-600">
          Queue verifikasi submission crew/admin pada tenant aktif.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2">Tanggal</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Shift</th>
              <th className="px-3 py-2">Omzet</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={6}>
                  Tidak ada queue verifikasi.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{row.submission_date}</td>
                <td className="px-3 py-2">
                  {Array.isArray(row.user) ? row.user[0]?.full_name : row.user?.full_name}
                </td>
                <td className="px-3 py-2">{row.shift_label}</td>
                <td className="px-3 py-2">{numberFormatter.format(Number(row.omzet_total))}</td>
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
      <div className="flex items-center justify-between text-sm text-slate-600">
        <p>
          Halaman {page} dari {totalPages}
        </p>
        <div className="flex gap-2">
          {hasPrev ? (
            <Link
              href={`/admin/verifikasi?page=${page - 1}`}
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
              href={`/admin/verifikasi?page=${page + 1}`}
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
    </section>
  );
}
