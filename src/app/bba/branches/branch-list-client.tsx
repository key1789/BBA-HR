"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import {
  Search, Store, Target, Wallet, Clock, Star, ClipboardCheck,
  X, ChevronRight, FlaskConical, Plus, LayoutGrid, LayoutList,
  Users, MapPin, User, CheckCircle2, Circle,
} from "lucide-react";
import Link from "next/link";
import { AnimatedList, AnimatedListItem } from "@/components/shared/animated-list";
import { GlassCard } from "@/components/shared/glass-card";
import { ToggleBranchButton } from "./toggle-branch-button";
import { ResetTrialButton } from "./reset-trial-button";
import { AddTrialBranchModal } from "./add-trial-branch-modal";

type FilterType = "active" | "inactive" | "all" | "trial";
type ViewMode = "card" | "table";

interface Props {
  initialData: any[];
  trialOwners: { id: string; full_name: string }[];
}

function CompletenessBar({ branch }: { branch: any }) {
  const items = [
    { key: "owner",  label: "Owner",  met: branch.ownerName !== "Tanpa Owner" },
    { key: "crew",   label: "Crew",   met: branch.crewCount > 0 },
    { key: "kpi",    label: "KPI",    met: branch.hasKpi === true },
    { key: "shift",  label: "Shift",  met: branch.shiftCount > 0 },
  ];
  const score = items.filter(i => i.met).length;
  const pct   = (score / items.length) * 100;

  const barColor =
    pct === 100 ? "bg-emerald-500" :
    pct >= 75   ? "bg-sky-500"     :
    pct >= 50   ? "bg-amber-400"   :
                  "bg-rose-400";

  const textColor =
    pct === 100 ? "text-emerald-600" :
    pct >= 75   ? "text-sky-600"     :
    pct >= 50   ? "text-amber-600"   :
                  "text-rose-500";

  return (
    <div className="px-5 py-3 border-t border-slate-100/60 bg-slate-50/40">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Kelengkapan Konfigurasi</span>
        <span className={`text-[9px] font-black ${textColor}`}>{score}/{items.length}</span>
      </div>
      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex gap-3 mt-2">
        {items.map(item => (
          <div key={item.key} className="flex items-center gap-1">
            {item.met
              ? <CheckCircle2 size={9} className="text-emerald-500 shrink-0" />
              : <Circle       size={9} className="text-slate-300 shrink-0" />
            }
            <span className={`text-[8px] font-bold uppercase tracking-wide ${item.met ? "text-slate-600" : "text-slate-300"}`}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BranchListClient({ initialData, trialOwners }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter]           = useState<FilterType>("active");
  const [viewMode, setViewMode]       = useState<ViewMode>("card");
  const [showTrialModal, setShowTrialModal] = useState(false);

  // Trial selalu dipisah dari tiga filter utama
  const nonTrial      = initialData.filter(b => !b.is_trial);
  const totalAll      = nonTrial.length;
  const totalActive   = nonTrial.filter(b => b.status === "active").length;
  const totalInactive = nonTrial.filter(b => b.status !== "active").length;
  const totalTrial    = initialData.filter(b => b.is_trial).length;

  const filteredData = initialData.filter((branch) => {
    if (filter !== "trial" && branch.is_trial) return false;
    if (filter === "trial"    && !branch.is_trial) return false;
    if (filter === "active"   && branch.status !== "active") return false;
    if (filter === "inactive" && branch.status === "active") return false;

    const q = searchQuery.toLowerCase();
    if (!q) return true;
    const addr = (branch.address ?? "").toString().toLowerCase();
    return (
      branch.name.toLowerCase().includes(q) ||
      branch.code.toLowerCase().includes(q) ||
      addr.includes(q)
    );
  });

  const addonIcons = (branch: any) => (
    <div className="flex gap-1.5 items-center">
      <div className={`w-5 h-5 rounded flex items-center justify-center ${branch.addon_produk   ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-300 opacity-40"}`} title="Produk Fokus"><Target size={10} /></div>
      <div className={`w-5 h-5 rounded flex items-center justify-center ${branch.addon_payroll  ? "bg-sky-100 text-sky-600"         : "bg-slate-100 text-slate-300 opacity-40"}`} title="Payroll"><Wallet size={10} /></div>
      <div className={`w-5 h-5 rounded flex items-center justify-center ${branch.addon_review_p ? "bg-amber-100 text-amber-600"     : "bg-slate-100 text-slate-300 opacity-40"}`} title="Review Pelanggan"><Star size={10} /></div>
      <div className={`w-5 h-5 rounded flex items-center justify-center ${branch.addon_review_i ? "bg-violet-100 text-violet-600"   : "bg-slate-100 text-slate-300 opacity-40"}`} title="Review Internal"><ClipboardCheck size={10} /></div>
      <div className={`w-5 h-5 rounded flex items-center justify-center ${branch.addon_absensi  ? "bg-cyan-100 text-cyan-600"       : "bg-slate-100 text-slate-300 opacity-40"}`} title="Jadwal & Absensi"><Clock size={10} /></div>
    </div>
  );

  return (
    <>
      {/* FILTER TABS + SEARCH + TOGGLE + TRIAL BUTTON */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Filter tabs */}
        <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5 shrink-0">
          {(
            [
              { key: "active",   label: "Aktif",     count: totalActive   },
              { key: "inactive", label: "Non-Aktif", count: totalInactive },
              { key: "all",      label: "Semua",     count: totalAll      },
              { key: "trial",    label: "Trial",     count: totalTrial    },
            ] as const
          ).map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                filter === key
                  ? key === "trial"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "bg-white text-sky-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {key === "trial" && <FlaskConical size={12} />}
              {label}
              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                filter === key
                  ? key === "trial" ? "bg-amber-600 text-white" : "bg-sky-100 text-sky-700"
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
            className="block w-full pl-10 pr-10 py-2.5 border border-slate-200/60 rounded-xl leading-5 bg-white/80 backdrop-blur-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 sm:text-sm transition-all shadow-sm"
            placeholder="Cari nama apotek atau kode cabang..."
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

        {/* Tambah Trial button */}
        {filter === "trial" && (
          <button
            type="button"
            onClick={() => setShowTrialModal(true)}
            className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-lg shadow-amber-500/30 hover:bg-amber-600 transition-all hover:-translate-y-0.5 active:scale-95 shrink-0"
          >
            <Plus size={15} />
            Tambah Apotek Trial
          </button>
        )}
      </div>

      {/* ── CARD VIEW ── */}
      {viewMode === "card" && (
        <AnimatedList className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredData.length === 0 && (
            <div className="col-span-full py-16 text-center">
              <div className="inline-flex flex-col items-center gap-3 border-2 border-dashed border-slate-200 rounded-2xl px-10 py-8">
                <Store size={36} className="text-slate-300" />
                <p className="text-sm font-bold text-slate-400">
                  {searchQuery
                    ? "Tidak ada apotek yang cocok dengan pencarian."
                    : filter === "trial"
                    ? 'Belum ada apotek trial.'
                    : "Belum ada apotek yang terdaftar."}
                </p>
              </div>
            </div>
          )}

          {filteredData.map((branch: any) => (
            <AnimatedListItem key={branch.id}>
              <GlassCard
                variant="light"
                className={`h-full p-0 overflow-hidden group hover:shadow-2xl transition-all duration-500 flex flex-col ${
                  branch.is_trial
                    ? "border-amber-200/70 hover:shadow-amber-500/10"
                    : "border-slate-200/60 hover:shadow-sky-500/10"
                }`}
              >
                {/* TRIAL banner strip */}
                {branch.is_trial && (
                  <div className="bg-amber-500 px-4 py-1.5 flex items-center gap-2">
                    <FlaskConical size={11} className="text-white" />
                    <span className="text-[9px] font-black text-white uppercase tracking-widest">Demo / Trial</span>
                  </div>
                )}

                {/* TOP HEADER */}
                <div className="p-5 pb-3 flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[9px] font-black text-sky-600 bg-sky-50 px-2 py-0.5 rounded-md uppercase tracking-widest">
                        {branch.code}
                      </span>
                      <div className={`w-2 h-2 rounded-full ${
                        branch.status === "active"
                          ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                          : "bg-slate-300"
                      }`} />
                    </div>
                    <h3 className="text-md font-black text-slate-800 leading-tight group-hover:text-sky-600 transition-colors">
                      {branch.name}
                    </h3>
                  </div>
                  <ToggleBranchButton branchId={branch.id} currentStatus={branch.status} />
                </div>

                {/* DATA INFO */}
                <div className="px-5 py-3 space-y-3 flex-1">
                  <div className="flex items-center gap-3 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100/50">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 border border-slate-100 font-bold text-[10px] shadow-sm">
                      {branch.ownerName?.charAt(0).toUpperCase()}
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Pemilik Cabang</p>
                      <p className="text-xs font-bold text-slate-700 truncate">{branch.ownerName}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 bg-white border border-slate-100 rounded-xl shadow-sm">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Staf Aktif</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm font-black text-slate-800">{branch.crewCount}</span>
                        <span className="text-[9px] font-bold text-slate-400">Orang</span>
                      </div>
                    </div>
                    <div className="p-2.5 bg-white border border-slate-100 rounded-xl shadow-sm min-w-0">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Lokasi</p>
                      <p
                        className="text-[10px] font-bold text-slate-700 line-clamp-2 break-words leading-snug"
                        title={branch.address?.trim() || undefined}
                      >
                        {branch.address?.trim() || "Belum diisi"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* CONFIGURATION COMPLETENESS BAR */}
                <CompletenessBar branch={branch} />

                {/* ADDONS + ACTIONS */}
                <div className="px-5 py-3 border-t border-slate-50 flex items-center justify-between gap-2 bg-slate-50/30">
                  {/* Addon icons */}
                  <div className="flex flex-wrap gap-1.5 flex-1 min-w-0 items-center">
                    <div className={`w-6 h-6 shrink-0 rounded-md flex items-center justify-center ${branch.addon_produk   ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-300 opacity-40"}`} title="Produk Fokus"><Target size={12} /></div>
                    <div className={`w-6 h-6 shrink-0 rounded-md flex items-center justify-center ${branch.addon_payroll  ? "bg-sky-100 text-sky-600"         : "bg-slate-100 text-slate-300 opacity-40"}`} title="Payroll"><Wallet size={12} /></div>
                    <div className={`w-6 h-6 shrink-0 rounded-md flex items-center justify-center ${branch.addon_review_p ? "bg-amber-100 text-amber-600"     : "bg-slate-100 text-slate-300 opacity-40"}`} title="Review Pelanggan"><Star size={12} /></div>
                    <div className={`w-6 h-6 shrink-0 rounded-md flex items-center justify-center ${branch.addon_review_i ? "bg-violet-100 text-violet-600"   : "bg-slate-100 text-slate-300 opacity-40"}`} title="Review Internal"><ClipboardCheck size={12} /></div>
                    <div className={`w-6 h-6 shrink-0 rounded-md flex items-center justify-center ${branch.addon_absensi  ? "bg-cyan-100 text-cyan-600"       : "bg-slate-100 text-slate-300 opacity-40"}`} title="Jadwal & Absensi"><Clock size={12} /></div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {branch.is_trial && (
                      <ResetTrialButton branchId={branch.id} branchName={branch.name} />
                    )}
                    <Link
                      href={`/bba/branches/${branch.id}`}
                      className="px-3 py-1.5 bg-white hover:bg-sky-600 hover:text-white border border-slate-200 hover:border-sky-600 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all duration-300 shadow-sm flex items-center gap-1.5 group/btn"
                    >
                      Kelola
                      <ChevronRight size={10} className="group-hover/btn:translate-x-0.5 transition-transform" />
                    </Link>
                  </div>
                </div>
              </GlassCard>
            </AnimatedListItem>
          ))}
        </AnimatedList>
      )}

      {/* ── TABLE VIEW ── */}
      {viewMode === "table" && (
        <GlassCard variant="light" className="p-0 overflow-hidden">
          {filteredData.length === 0 ? (
            <div className="py-16 text-center">
              <div className="inline-flex flex-col items-center gap-3 border-2 border-dashed border-slate-200 rounded-2xl px-10 py-8 mx-auto">
                <Store size={36} className="text-slate-300" />
                <p className="text-sm font-bold text-slate-400">
                  {searchQuery
                    ? "Tidak ada apotek yang cocok dengan pencarian."
                    : filter === "trial"
                    ? "Belum ada apotek trial."
                    : "Belum ada apotek yang terdaftar."}
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-[9px] font-black text-slate-400 uppercase tracking-widest px-5 py-3">Apotek</th>
                    <th className="text-left text-[9px] font-black text-slate-400 uppercase tracking-widest px-4 py-3">Status</th>
                    <th className="text-left text-[9px] font-black text-slate-400 uppercase tracking-widest px-4 py-3">
                      <span className="flex items-center gap-1"><User size={10} /> Owner</span>
                    </th>
                    <th className="text-left text-[9px] font-black text-slate-400 uppercase tracking-widest px-4 py-3">
                      <span className="flex items-center gap-1"><Users size={10} /> Crew</span>
                    </th>
                    <th className="text-left text-[9px] font-black text-slate-400 uppercase tracking-widest px-4 py-3">
                      <span className="flex items-center gap-1"><MapPin size={10} /> Lokasi</span>
                    </th>
                    <th className="text-left text-[9px] font-black text-slate-400 uppercase tracking-widest px-4 py-3">Add-on</th>
                    <th className="text-left text-[9px] font-black text-slate-400 uppercase tracking-widest px-4 py-3">Lengkap</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredData.map((branch: any) => {
                    const score = [
                      branch.ownerName !== "Tanpa Owner",
                      branch.crewCount > 0,
                      branch.hasKpi === true,
                      branch.shiftCount > 0,
                    ].filter(Boolean).length;
                    const pct = (score / 4) * 100;
                    const barColor = pct === 100 ? "bg-emerald-500" : pct >= 75 ? "bg-sky-500" : pct >= 50 ? "bg-amber-400" : "bg-rose-400";
                    const textColor = pct === 100 ? "text-emerald-600" : pct >= 75 ? "text-sky-600" : pct >= 50 ? "text-amber-600" : "text-rose-500";

                    return (
                      <tr key={branch.id} className="hover:bg-slate-50/60 transition-colors group">
                        {/* Apotek name + code */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            {branch.is_trial && <FlaskConical size={12} className="text-amber-500 shrink-0" />}
                            <div>
                              <p className="font-black text-slate-800 text-xs leading-tight group-hover:text-sky-600 transition-colors">{branch.name}</p>
                              <span className="text-[9px] font-black text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded mt-0.5 inline-block uppercase tracking-widest">{branch.code}</span>
                            </div>
                          </div>
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${branch.status === "active" ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" : "bg-slate-300"}`} />
                            <span className={`text-[10px] font-bold capitalize ${branch.status === "active" ? "text-emerald-700" : "text-slate-400"}`}>
                              {branch.status === "active" ? "Aktif" : "Non-Aktif"}
                            </span>
                          </div>
                        </td>
                        {/* Owner */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-[9px] font-black shrink-0 border border-slate-200">
                              {branch.ownerName?.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-xs font-bold text-slate-700 max-w-[120px] truncate">{branch.ownerName}</span>
                          </div>
                        </td>
                        {/* Crew */}
                        <td className="px-4 py-3.5">
                          <span className="text-xs font-black text-slate-700">{branch.crewCount}</span>
                          <span className="text-[9px] text-slate-400 ml-1">orang</span>
                        </td>
                        {/* Lokasi */}
                        <td className="px-4 py-3.5 max-w-[160px]">
                          <p className="text-[10px] font-medium text-slate-500 truncate" title={branch.address?.trim() || undefined}>
                            {branch.address?.trim() || <span className="italic text-slate-300">—</span>}
                          </p>
                        </td>
                        {/* Add-ons */}
                        <td className="px-4 py-3.5">
                          {addonIcons(branch)}
                        </td>
                        {/* Completeness */}
                        <td className="px-4 py-3.5 min-w-[80px]">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden min-w-[40px]">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className={`text-[9px] font-black ${textColor} shrink-0`}>{score}/4</span>
                          </div>
                        </td>
                        {/* Actions */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 justify-end">
                            {branch.is_trial && (
                              <ResetTrialButton branchId={branch.id} branchName={branch.name} />
                            )}
                            <ToggleBranchButton branchId={branch.id} currentStatus={branch.status} />
                            <Link
                              href={`/bba/branches/${branch.id}`}
                              className="px-2.5 py-1.5 bg-white hover:bg-sky-600 hover:text-white border border-slate-200 hover:border-sky-600 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all duration-300 shadow-sm flex items-center gap-1 group/btn whitespace-nowrap"
                            >
                              Kelola
                              <ChevronRight size={9} className="group-hover/btn:translate-x-0.5 transition-transform" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      )}

      {/* Modal tambah apotek trial */}
      <AddTrialBranchModal
        isOpen={showTrialModal}
        onClose={() => setShowTrialModal(false)}
        owners={trialOwners}
      />
    </>
  );
}
