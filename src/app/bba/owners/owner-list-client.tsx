"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import { OwnerActions } from "./owner-actions";
import {
  UserCircle2, Building2, Search, X,
  AlertTriangle, Clock as ClockIcon, FlaskConical,
  LayoutGrid, LayoutList, Phone,
} from "lucide-react";

type FilterType = "active" | "inactive" | "all" | "demo";
type ViewMode   = "card" | "table";

function OwnerAvatar({ name, isDemo }: { name: string; isDemo?: boolean }) {
  const initial = name?.charAt(0)?.toUpperCase() ?? "?";
  return (
    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-black text-sm border ${
      isDemo
        ? "bg-amber-50 text-amber-600 border-amber-200"
        : "bg-sky-50 text-sky-600 border-sky-200"
    }`}>
      {initial}
    </div>
  );
}

export function OwnerListClient({ initialData }: { initialData: any[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter]           = useState<FilterType>("active");
  const [viewMode, setViewMode]       = useState<ViewMode>("table");

  const nonDemo       = initialData.filter(o => !o.is_demo);
  const totalAll      = nonDemo.length;
  const totalActive   = nonDemo.filter(o => o.status === "active" && o.is_active).length;
  const totalInactive = nonDemo.filter(o => o.status === "active" && !o.is_active).length;
  const totalDemo     = initialData.filter(o => o.is_demo).length;

  const filteredData = initialData.filter((owner) => {
    if (filter !== "demo" && owner.is_demo) return false;
    if (filter === "demo"     && !owner.is_demo) return false;
    if (filter === "active"   && !(owner.status === "active" && owner.is_active)) return false;
    if (filter === "inactive" && !(owner.status === "active" && !owner.is_active)) return false;

    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (
      owner.full_name.toLowerCase().includes(q) ||
      (owner.email  && owner.email.toLowerCase().includes(q)) ||
      (owner.phone  && owner.phone.toLowerCase().includes(q)) ||
      owner.apoteks.some((apt: string) => apt.toLowerCase().includes(q))
    );
  });

  const EmptyState = ({ colSpan }: { colSpan?: number }) => {
    const inner = (
      <div className="flex flex-col items-center gap-2 border-2 border-dashed border-slate-200 rounded-2xl px-10 py-8 text-center">
        <UserCircle2 size={36} className="text-slate-300" />
        <p className="text-sm font-bold text-slate-400">
          {searchQuery ? "Tidak ada hasil yang cocok." : "Belum ada owner yang terdaftar."}
        </p>
      </div>
    );
    if (colSpan) {
      return (
        <tr>
          <td colSpan={colSpan} className="py-12 text-center">
            <div className="flex justify-center">{inner}</div>
          </td>
        </tr>
      );
    }
    return <div className="py-8 flex justify-center">{inner}</div>;
  };

  return (
    <>
      {/* FILTER TABS + SEARCH + VIEW TOGGLE */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Filter tabs */}
        <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5 shrink-0">
          {(
            [
              { key: "active",   label: "Aktif",     count: totalActive   },
              { key: "inactive", label: "Non-Aktif", count: totalInactive },
              { key: "all",      label: "Semua",     count: totalAll      },
              { key: "demo",     label: "Demo",      count: totalDemo     },
            ] as const
          ).map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                filter === key
                  ? key === "demo"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "bg-white text-sky-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {key === "demo" && <FlaskConical size={12} />}
              {label}
              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                filter === key
                  ? key === "demo" ? "bg-amber-600 text-white" : "bg-sky-100 text-sky-700"
                  : "bg-slate-200 text-slate-500"
              }`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-slate-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-10 pr-10 py-2.5 border border-slate-200/60 rounded-xl bg-white/80 backdrop-blur-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 sm:text-sm transition-all shadow-sm"
            placeholder="Cari nama, email, atau apotek..."
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* View toggle */}
        <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setViewMode("card")}
            title="Tampilan Kartu"
            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
              viewMode === "card" ? "bg-white text-sky-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <LayoutGrid size={15} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            title="Tampilan Tabel"
            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
              viewMode === "table" ? "bg-white text-sky-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <LayoutList size={15} />
          </button>
        </div>
      </div>

      {/* ── CARD VIEW ── */}
      {viewMode === "card" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredData.length === 0 ? (
            <div className="col-span-full">
              <EmptyState />
            </div>
          ) : (
            filteredData.map((owner: any) => (
              <GlassCard
                key={`${owner.status}-${owner.id}`}
                variant="light"
                className={`p-0 overflow-hidden hover:shadow-xl transition-all duration-300 border-l-4 ${
                  owner.is_demo ? "border-l-amber-400 hover:shadow-amber-500/10" : "border-l-sky-500 hover:shadow-sky-500/10"
                }`}
              >
                <div className="p-4">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <OwnerAvatar name={owner.full_name} isDemo={owner.is_demo} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-black text-sm text-slate-800 truncate">{owner.full_name}</p>
                          {owner.is_demo && (
                            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 shrink-0">
                              <FlaskConical size={9} /> Demo
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">{owner.email}</p>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <OwnerActions owner={owner} />
                    </div>
                  </div>

                  {/* Status + phone */}
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    {owner.status === "active" ? (
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase ${
                        owner.is_active
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-rose-50 text-rose-700 border-rose-200"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${owner.is_active ? "bg-emerald-500" : "bg-rose-500"}`} />
                        {owner.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold uppercase">
                        <ClockIcon size={10} className="animate-pulse" /> Menunggu Verifikasi
                      </span>
                    )}
                    {owner.phone && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                        <Phone size={10} className="text-slate-400" /> {owner.phone}
                      </span>
                    )}
                  </div>

                  {/* Apoteks */}
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Kepemilikan Apotek</p>
                    <div className="flex flex-wrap gap-1.5">
                      {owner.apoteks.length > 0 ? owner.apoteks.map((apt: string, idx: number) => (
                        <span key={idx} className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-700 px-2 py-1 rounded-lg border border-slate-200/60 whitespace-nowrap">
                          <Building2 size={10} className="text-sky-600" /> {apt}
                        </span>
                      )) : (
                        <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-1 rounded-lg border border-amber-200">
                          <AlertTriangle size={10} /> Belum ada apotek
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </GlassCard>
            ))
          )}
        </div>
      )}

      {/* ── TABLE VIEW ── */}
      {viewMode === "table" && (
        <GlassCard variant="light" className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="py-3 px-5 text-[9px] font-black uppercase tracking-widest text-slate-400">Profil Owner</th>
                  <th className="py-3 px-5 text-[9px] font-black uppercase tracking-widest text-slate-400">Apotek</th>
                  <th className="py-3 px-5 text-[9px] font-black uppercase tracking-widest text-slate-400">Login Terakhir</th>
                  <th className="py-3 px-5 text-[9px] font-black uppercase tracking-widest text-slate-400">Status</th>
                  <th className="py-3 px-5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredData.length === 0 ? (
                  <EmptyState colSpan={5} />
                ) : (
                  filteredData.map((owner: any) => (
                    <tr
                      key={`${owner.status}-${owner.id}`}
                      className={`hover:bg-slate-50/60 transition-colors group ${owner.is_demo ? "bg-amber-50/20" : ""}`}
                    >
                      {/* Profil */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <OwnerAvatar name={owner.full_name} isDemo={owner.is_demo} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-black text-sm text-slate-800 truncate group-hover:text-sky-600 transition-colors">
                                {owner.full_name}
                              </p>
                              {owner.is_demo && (
                                <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-200 shrink-0">
                                  <FlaskConical size={9} /> Demo
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 truncate">{owner.email}</p>
                            {owner.phone && (
                              <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <Phone size={9} /> {owner.phone}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Apotek */}
                      <td className="py-3.5 px-5 max-w-[200px]">
                        <div className="flex flex-wrap gap-1.5">
                          {owner.apoteks.length > 0 ? (
                            owner.apoteks.map((apt: string, idx: number) => (
                              <span key={idx} className="inline-flex items-center gap-1 text-[9px] font-black uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg border border-slate-200">
                                <Building2 size={9} className="text-sky-600" /> {apt}
                              </span>
                            ))
                          ) : owner.status === "active" ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg border border-amber-200">
                              <AlertTriangle size={9} /> Belum diassign
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Login terakhir */}
                      <td className="py-3.5 px-5">
                        {owner.last_login_at ? (
                          <div>
                            <p className="text-xs font-bold text-slate-700">
                              {new Date(owner.last_login_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                            </p>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                              {new Date(owner.last_login_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} WIB
                            </p>
                          </div>
                        ) : (
                          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">Belum pernah login</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-5">
                        {owner.status === "active" ? (
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase ${
                            owner.is_active
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                              : "bg-rose-50 border-rose-200 text-rose-700"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${owner.is_active ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" : "bg-rose-500"}`} />
                            {owner.is_active ? "Aktif" : "Nonaktif"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-amber-50 border-amber-200 text-amber-700 text-[10px] font-bold uppercase">
                            <ClockIcon size={10} className="animate-pulse" /> Menunggu Verifikasi
                          </span>
                        )}
                      </td>

                      {/* Aksi */}
                      <td className="py-3.5 px-5 text-right">
                        <OwnerActions owner={owner} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </>
  );
}
