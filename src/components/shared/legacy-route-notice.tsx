import { getDefaultPortalPath } from "@/lib/portal";
import type { Role } from "@/lib/types";
import Link from "next/link";

type LegacyRouteNoticeProps = {
  title: string;
  activeRole?: Role;
};

export function LegacyRouteNotice({ title, activeRole }: LegacyRouteNoticeProps) {
  const defaultPath = activeRole ? getDefaultPortalPath(activeRole) : "/login";

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-600">
          Halaman ini termasuk modul lama dan tidak menjadi alur operasional utama V1.1.
        </p>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Gunakan menu operasional aktif (Dashboard, Input Harian, Verifikasi, Laporan, Control
        Dashboard) untuk workflow harian.
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={defaultPath}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          Buka Portal Aktif
        </Link>
        <Link
          href="/"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
        >
          Kembali ke Beranda
        </Link>
      </div>
    </section>
  );
}
