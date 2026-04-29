import { updateCandidateStatusAction } from "@/app/actions/workflow";
import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";

type CandidateRow = {
  id: string;
  full_name: string;
  applied_position: string;
  source_channel: string;
  status: string;
};

export default async function CandidatesPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeMembership?.tenantId;

  if (!tenantId) {
    return (
      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Candidates</h1>
          <p className="text-sm text-slate-600">
            Belum ada tenant aktif pada akun ini.
          </p>
        </div>
      </section>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidates")
    .select("id, full_name, applied_position, source_channel, status")
    .eq("tenant_apotek_id", tenantId)
    .order("created_at", { ascending: false });

  const candidates = (data ?? []) as CandidateRow[];

  const activeRole = session?.activeMembership?.role;
  const canUpdateStatus = activeRole && activeRole !== "owner";

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Candidates</h1>
        <p className="text-sm text-slate-600">
          Tracking pipeline kandidat berdasarkan posisi dan status seleksi.
        </p>
        <p className="text-xs text-slate-500">
          Tenant aktif: {session?.activeMembership?.tenantCode}
        </p>
      </div>
      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Gagal memuat data kandidat dari Supabase. Cek RLS/membership tenant.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {candidates.length === 0 ? (
          <article className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            Belum ada kandidat pada tenant aktif.
          </article>
        ) : null}
        {candidates.map((candidate) => (
          <article
            key={candidate.id}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <p className="text-xs font-medium text-slate-500">{candidate.id}</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              {candidate.full_name}
            </h2>
            <p className="text-sm text-slate-700">{candidate.applied_position}</p>
            <div className="mt-3 space-y-1 text-sm text-slate-600">
              <p>Tenant: {session?.activeMembership?.tenantCode}</p>
              <p>Source: {candidate.source_channel}</p>
              <p>Status: {candidate.status}</p>
            </div>
            {canUpdateStatus ? (
              <form action={updateCandidateStatusAction} className="mt-4 flex items-center gap-2">
                <input type="hidden" name="candidateId" value={candidate.id} />
                <select
                  name="status"
                  defaultValue={candidate.status}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
                >
                  <option value="new">new</option>
                  <option value="screening_passed">screening_passed</option>
                  <option value="screening_failed">screening_failed</option>
                  <option value="interview_scheduled">interview_scheduled</option>
                  <option value="interviewed">interviewed</option>
                  <option value="hired">hired</option>
                  <option value="rejected">rejected</option>
                  <option value="hold">hold</option>
                </select>
                <button
                  type="submit"
                  className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white"
                >
                  Update
                </button>
              </form>
            ) : (
              <p className="mt-4 text-xs text-slate-500">Role owner hanya bisa melihat data.</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
