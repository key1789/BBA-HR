import {
  approveTaskAction,
  requestTaskRevisionAction,
  submitTaskAction,
} from "@/app/actions/workflow";
import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";

type TaskRow = {
  id: string;
  title: string;
  task_type: string;
  due_date: string;
  status: string;
  assigned_user:
    | {
        full_name: string;
      }
    | {
        full_name: string;
      }[]
    | null;
};

export default async function TasksPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeMembership?.tenantId;

  if (!tenantId) {
    return (
      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tasks & Approval</h1>
          <p className="text-sm text-slate-600">
            Belum ada tenant aktif pada akun ini.
          </p>
        </div>
      </section>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, task_type, due_date, status, assigned_user:assigned_to_user_id(full_name)")
    .eq("tenant_apotek_id", tenantId)
    .order("created_at", { ascending: false });

  const tasks = (data ?? []) as TaskRow[];

  const activeRole = session?.activeMembership?.role;
  const canSubmitTask = activeRole && activeRole !== "owner";
  const canRequestRevision =
    activeRole === "admin_apotek" || activeRole === "super_admin_bba";
  const canFinalApprove = activeRole === "super_admin_bba";

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tasks & Approval</h1>
        <p className="text-sm text-slate-600">
          Daftar task operasional HR untuk assignment, submit, dan approval.
        </p>
        <p className="text-xs text-slate-500">
          Tenant aktif: {session?.activeMembership?.tenantCode}
        </p>
      </div>
      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Gagal memuat data task dari Supabase. Cek RLS/membership tenant.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Judul</th>
              <th className="px-4 py-3">Assignee</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr className="border-t border-slate-100">
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  Belum ada task pada tenant aktif.
                </td>
              </tr>
            ) : null}
            {tasks.map((task) => (
              <tr key={task.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{task.id}</td>
                <td className="px-4 py-3">{task.title}</td>
                <td className="px-4 py-3">
                  {Array.isArray(task.assigned_user)
                    ? task.assigned_user[0]?.full_name
                    : task.assigned_user?.full_name}
                </td>
                <td className="px-4 py-3">
                  {new Date(task.due_date).toLocaleDateString("id-ID")}
                </td>
                <td className="px-4 py-3">{task.status}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {canSubmitTask &&
                    (task.status === "open" ||
                      task.status === "assigned" ||
                      task.status === "in_progress" ||
                      task.status === "revision_required") ? (
                      <form action={submitTaskAction}>
                        <input type="hidden" name="taskId" value={task.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700"
                        >
                          Submit
                        </button>
                      </form>
                    ) : null}
                    {canRequestRevision && task.status === "submitted" ? (
                      <form action={requestTaskRevisionAction}>
                        <input type="hidden" name="taskId" value={task.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700"
                        >
                          Revisi
                        </button>
                      </form>
                    ) : null}
                    {canFinalApprove && task.status === "submitted" ? (
                      <form action={approveTaskAction}>
                        <input type="hidden" name="taskId" value={task.id} />
                        <button
                          type="submit"
                          className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white"
                        >
                          Approve
                        </button>
                      </form>
                    ) : null}
                    {activeRole === "owner" ? (
                      <span className="text-xs text-slate-500">Read-only</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
