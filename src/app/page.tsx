import Link from "next/link";
import Image from "next/image";
import { getSessionContext } from "@/lib/auth-context";
import { getDefaultPortalPath } from "@/lib/portal";

export default async function Home() {
  const session = await getSessionContext();
  const activeRole = session?.activeMembership?.role;
  const portalHref = activeRole ? getDefaultPortalPath(activeRole) : "/login";

  return (
    <section className="grid gap-6 md:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <Image
          src="/bba-logo.png"
          alt="BBA HR Logo"
          width={72}
          height={72}
          className="mb-3 rounded-full"
        />
        <p className="mb-2 text-sm font-medium text-sky-700">PRD Executable V1</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Dashboard operasional apotek berbasis role
        </h1>
        <p className="mt-3 text-slate-600">
          Scope V1 dikunci untuk 4 portal: Crew, Admin Apotek, Owner, dan Super
          Admin BBA dengan fokus input-verifikasi, laporan, leaderboard, audit,
          export, dan payroll hidden.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={portalHref}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Buka Portal
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Login
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Scope Build Terkunci</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          <li>1. Auth + tenant switch + route guard role portal</li>
          <li>2. Input harian dan verifikasi admin</li>
          <li>3. Dashboard laporan harian/bulanan/berjalan</li>
          <li>4. Leaderboard sales, ATV, ATU, SARP</li>
          <li>5. Control BBA: master, audit, export</li>
          <li>6. Payroll dibangun mode hidden</li>
        </ul>
      </div>
    </section>
  );
}
