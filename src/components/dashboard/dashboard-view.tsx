type DashboardViewProps = {
  submitted: number;
  approved: number;
  inProgress: number;
  hired: number;
};

export function DashboardView({
  submitted,
  approved,
  inProgress,
  hired,
}: DashboardViewProps) {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Task Submitted" value={submitted.toString()} />
        <KpiCard title="Task Approved" value={approved.toString()} />
        <KpiCard title="Task In Progress" value={inProgress.toString()} />
        <KpiCard title="Candidate Hired" value={hired.toString()} />
      </div>
    </section>
  );
}

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
