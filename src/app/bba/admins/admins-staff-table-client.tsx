"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo, useState } from "react";
import { UserCircle2, Building2, Globe } from "lucide-react";
import { AdminRowActions } from "./admin-row-actions";
import type { BbaPortalMenuKey } from "@/lib/bba-portal-menus";
import type { AdminStaffRowVm } from "./admins-staff-types";

type MenuRow = { key: BbaPortalMenuKey; label: string; pathPrefix: string };

export function AdminsStaffTableClient({
  rows,
  branches,
  menuCatalog,
}: {
  rows: AdminStaffRowVm[];
  branches: any[];
  menuCatalog: MenuRow[];
}) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"all" | "global" | "analyst" | "legacy">("all");

  const filtered = useMemo(() => {
    let list = rows;
    if (role !== "all") list = list.filter((r) => r.kind === role);
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter((r) => {
        if (r.full_name?.toLowerCase().includes(qq)) return true;
        if (r.email?.toLowerCase().includes(qq)) return true;
        if (r.branchNames.some((n) => String(n).toLowerCase().includes(qq))) return true;
        if (r.portalMenuKeys.some((k) => k.toLowerCase().includes(qq))) return true;
        return false;
      });
    }
    return list;
  }, [rows, q, role]);

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama, email, cabang, atau kunci menu…"
          className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 sm:min-w-[240px]"
          aria-label="Filter daftar staff"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <span className="shrink-0 font-semibold">Peran:</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
          >
            <option value="all">Semua</option>
            <option value="global">Global</option>
            <option value="analyst">Analyst</option>
            <option value="legacy">Legacy BBA</option>
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/90">
              <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-6">
                Profil
              </th>
              <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-6">
                Cakupan
              </th>
              <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-6">
                Peran / izin
              </th>
              <th className="px-5 py-3.5 text-right text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-6">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-14 text-center text-sm text-slate-500">
                  Belum ada data staff BBA. Gunakan tombol di atas untuk undang analyst atau pastikan user global tercatat.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-sm text-slate-500">
                  Tidak ada baris yang cocok dengan filter.
                </td>
              </tr>
            ) : (
              filtered.map((admin) => (
                <tr key={admin.id} className="transition-colors hover:bg-slate-50/90">
                  <td className="px-5 py-4 sm:px-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                        <UserCircle2 size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{admin.full_name}</p>
                        <p className="truncate text-sm text-slate-500">{admin.email}</p>
                        {!admin.is_active && (
                          <span className="mt-0.5 inline-block rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700">
                            Nonaktif
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 sm:px-6">
                    {admin.kind === "global" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-800">
                        <Globe size={12} aria-hidden /> Global
                      </span>
                    ) : admin.kind === "analyst" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-sky-900">
                        Analyst
                      </span>
                    ) : (
                      <div className="flex max-w-[220px] flex-wrap gap-1">
                        {admin.memberships?.map((m: any, idx: number) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
                          >
                            <Building2 size={10} className="shrink-0 opacity-70" aria-hidden />
                            <span className="max-w-[140px] truncate">{m.tenant_apotek?.name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4 sm:px-6">
                    <div className="flex max-w-xs flex-wrap gap-1">
                      {admin.kind === "analyst" ? (
                        admin.portalMenuKeys.length > 0 ? (
                          admin.portalMenuKeys.map((key) => (
                            <span
                              key={key}
                              className="rounded-md border border-sky-100 bg-sky-50/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-sky-900"
                            >
                              {key}
                            </span>
                          ))
                        ) : (
                          <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                            Belum ada menu
                          </span>
                        )
                      ) : (
                        admin.legacyPermissionLabels.map((perm) => (
                          <span
                            key={perm}
                            className="rounded-md border border-slate-100 bg-slate-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-600"
                          >
                            {perm}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right sm:px-6">
                    <AdminRowActions row={admin} branches={branches} menuCatalog={menuCatalog} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
