import {
  toggleAddonSettingAction,
  updateTenantInfoAction,
  upsertKpiConfigAction,
} from "@/app/actions/governance";
import { getSessionContext } from "@/lib/auth-context";
import {
  getPayrollStatusBadgeClass,
  getPayrollStatusLabel,
  humanizeEnum,
} from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

type TenantRow = {
  id: string;
  name: string;
  code: string;
  status: string;
};

type MemberRow = {
  role: string;
  user: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
};

type KpiRow = {
  period_month: number;
  period_year: number;
  target_omzet: number;
  target_atv: number;
  target_atu: number;
  bonus_mode: string;
};

type AddonRow = {
  addon_key: string;
  is_enabled: boolean;
};

type PeriodRow = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
};

const addonKeys = [
  "produk_fokus",
  "absensi_shift",
  "review_internal",
  "review_pelanggan",
  "payroll",
] as const;

export default async function BbaMasterApotekPage({
  searchParams,
}: {
  searchParams: Promise<{
    tenant?: string;
    feedback?: string;
    message?: string;
    scope?: string;
  }>;
}) {
  const params = await searchParams;
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "super_admin_bba") {
    return <p className="text-sm text-slate-600">Akses master apotek hanya untuk BBA.</p>;
  }

  const supabase = await createClient();
  const { data: tenantsData } = await supabase
    .from("tenant_apotek")
    .select("id, name, code, status")
    .order("name", { ascending: true });
  const tenants = (tenantsData ?? []) as TenantRow[];
  const selectedTenantId = params.tenant ?? tenants[0]?.id;
  const selectedTenant = tenants.find((item) => item.id === selectedTenantId);

  if (!selectedTenantId || !selectedTenant) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">BBA - Master Apotek</h1>
        <p className="text-sm text-slate-600">Belum ada data apotek.</p>
      </section>
    );
  }

  const [{ data: membersData }, { data: kpiData }, { data: addonData }, { data: periodData }] =
    await Promise.all([
      supabase
        .from("tenant_memberships")
        .select("role, user:user_id(full_name, email)")
        .eq("tenant_apotek_id", selectedTenantId)
        .eq("is_active", true),
      supabase
        .from("kpi_configs")
        .select("period_month, period_year, target_omzet, target_atv, target_atu, bonus_mode")
        .eq("tenant_apotek_id", selectedTenantId)
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .limit(1),
      supabase
        .from("addon_settings")
        .select("addon_key, is_enabled")
        .eq("tenant_apotek_id", selectedTenantId),
      supabase
        .from("payroll_periods")
        .select("id, period_start, period_end, status")
        .eq("tenant_apotek_id", selectedTenantId)
        .order("period_start", { ascending: false })
        .limit(5),
    ]);

  const members = (membersData ?? []) as MemberRow[];
  const latestKpi = (kpiData?.[0] ?? null) as KpiRow | null;
  const addonMap = new Map<string, boolean>(
    ((addonData ?? []) as AddonRow[]).map((item) => [item.addon_key, item.is_enabled]),
  );
  const periods = (periodData ?? []) as PeriodRow[];
  const now = new Date();
  const feedbackStatus =
    params.feedback === "success" || params.feedback === "error"
      ? params.feedback
      : null;
  const feedbackKey = `${params.scope ?? "general"}:${params.message ?? "unknown"}`;
  const feedbackMessageMap: Record<string, string> = {
    "tenant_info:tenant_saved": "Informasi apotek berhasil disimpan.",
    "tenant_info:invalid_tenant_payload":
      "Data informasi apotek tidak valid. Periksa nama dan status.",
    "tenant_info:update_failed":
      "Gagal menyimpan informasi apotek. Silakan coba lagi.",
    "kpi:kpi_saved": "Konfigurasi KPI berhasil disimpan.",
    "kpi:invalid_kpi_payload":
      "Data KPI tidak valid. Pastikan bulan/tahun/target sesuai.",
    "kpi:upsert_failed": "Gagal menyimpan konfigurasi KPI.",
    "addon:addon_saved": "Pengaturan add-on berhasil diperbarui.",
    "addon:invalid_addon_payload": "Payload add-on tidak valid.",
    "addon:toggle_failed": "Gagal memperbarui status add-on.",
    "general:access_denied": "Akses ditolak untuk aksi ini.",
    "general:user_not_found": "Sesi user tidak ditemukan. Silakan login ulang.",
  };
  const feedbackMessage =
    feedbackStatus && params.message
      ? feedbackMessageMap[feedbackKey] ?? "Aksi selesai."
      : null;

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">BBA - Master Apotek</h1>
        <p className="text-sm text-slate-600">
          Informasi, Tim&Akses, KPI&Target, Add-on, dan Periode.
        </p>
      </div>
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

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3">
        {tenants.map((tenant) => (
          <Link
            key={tenant.id}
            href={`/bba/master-apotek?tenant=${tenant.id}`}
            className={`rounded-md px-3 py-1 text-xs font-medium ${
              tenant.id === selectedTenantId
                ? "bg-slate-900 text-white"
                : "border border-slate-300 text-slate-700"
            }`}
          >
            {tenant.code}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Informasi</h2>
          <form action={updateTenantInfoAction} className="mt-3 space-y-2 text-sm">
            <input type="hidden" name="tenantId" value={selectedTenantId} />
            <label className="block">
              Nama Apotek
              <input
                name="name"
                defaultValue={selectedTenant.name}
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block">
              Status
              <select
                name="status"
                defaultValue={selectedTenant.status}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white"
            >
              Simpan Informasi
            </button>
          </form>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Tim&Akses</h2>
          <div className="mt-3 space-y-2 text-sm">
            {members.length === 0 ? (
              <p className="text-slate-500">Belum ada membership aktif.</p>
            ) : null}
            {members.map((member, idx) => (
              <div key={`${member.role}-${idx}`} className="rounded-md border border-slate-200 p-2">
                <p className="font-medium text-slate-900">
                  {Array.isArray(member.user)
                    ? member.user[0]?.full_name
                    : member.user?.full_name}
                </p>
                <p className="text-slate-600">
                  {Array.isArray(member.user) ? member.user[0]?.email : member.user?.email}
                </p>
                <p className="text-xs text-slate-500">Role: {humanizeEnum(member.role)}</p>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">KPI&Target</h2>
          <form action={upsertKpiConfigAction} className="mt-3 grid gap-2 text-sm md:grid-cols-2">
            <input type="hidden" name="tenantId" value={selectedTenantId} />
            <label className="block">
              Bulan
              <input
                type="number"
                name="periodMonth"
                min={1}
                max={12}
                defaultValue={latestKpi?.period_month ?? now.getMonth() + 1}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block">
              Tahun
              <input
                type="number"
                name="periodYear"
                defaultValue={latestKpi?.period_year ?? now.getFullYear()}
                min={2000}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block">
              Target Omzet
              <input
                type="number"
                name="targetOmzet"
                defaultValue={latestKpi?.target_omzet ?? 0}
                min={0}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block">
              Target ATV
              <input
                type="number"
                name="targetAtv"
                defaultValue={latestKpi?.target_atv ?? 0}
                min={0}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block">
              Target ATU
              <input
                type="number"
                step="0.01"
                name="targetAtu"
                defaultValue={latestKpi?.target_atu ?? 0}
                min={0}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block">
              Bonus Mode
              <select
                name="bonusMode"
                defaultValue={latestKpi?.bonus_mode ?? "fixed_only"}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="fixed_only">{humanizeEnum("fixed_only")}</option>
                <option value="progressive_only">{humanizeEnum("progressive_only")}</option>
                <option value="fixed_plus_progressive">
                  {humanizeEnum("fixed_plus_progressive")}
                </option>
              </select>
            </label>
            <div className="md:col-span-2">
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white"
              >
                Simpan KPI
              </button>
            </div>
          </form>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Add-on</h2>
          <div className="mt-3 space-y-2 text-sm">
            {addonKeys.map((key) => {
              const enabled = addonMap.get(key) ?? false;
              return (
                <form action={toggleAddonSettingAction} key={key} className="flex items-center justify-between rounded-md border border-slate-200 p-2">
                  <input type="hidden" name="tenantId" value={selectedTenantId} />
                  <input type="hidden" name="addonKey" value={key} />
                  <input type="hidden" name="isEnabled" value={enabled ? "false" : "true"} />
                  <span className="font-medium text-slate-900">{humanizeEnum(key)}</span>
                  <button
                    type="submit"
                    className={`rounded-md px-2 py-1 text-xs font-medium ${
                      enabled
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {enabled ? "ON" : "OFF"}
                  </button>
                </form>
              );
            })}
          </div>
        </article>
      </div>

      <article className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Periode</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-3 py-2">Periode</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {periods.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-3 py-4 text-slate-500">
                    Belum ada payroll period.
                  </td>
                </tr>
              ) : null}
              {periods.map((period) => (
                <tr key={period.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    {period.period_start} - {period.period_end}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getPayrollStatusBadgeClass(period.status)}`}
                    >
                      {getPayrollStatusLabel(period.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
