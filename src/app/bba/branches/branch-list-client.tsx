"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { Search, Store, Target, Wallet, Clock, Star, ClipboardCheck, X, ChevronRight } from "lucide-react";
import Link from "next/link";
import { AnimatedList, AnimatedListItem } from "@/components/shared/animated-list";
import { GlassCard } from "@/components/shared/glass-card";
import { ToggleBranchButton } from "./toggle-branch-button";

export function BranchListClient({ initialData }: { initialData: any[] }) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredData = initialData.filter((branch) => {
    const q = searchQuery.toLowerCase();
    const addr = (branch.address ?? "").toString().toLowerCase();
    return (
      branch.name.toLowerCase().includes(q) ||
      branch.code.toLowerCase().includes(q) ||
      addr.includes(q)
    );
  });

  return (
    <>
      {/* FILTER & SEARCH */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-slate-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-10 pr-10 py-2.5 border border-slate-200/60 rounded-xl leading-5 bg-white/80 backdrop-blur-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 sm:text-sm transition-all shadow-sm"
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
      </div>

      {/* GRID CARDS FOR BRANCHES */}
      <AnimatedList className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredData.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-400">
            <Store size={48} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">
              {searchQuery ? "Tidak ada apotek yang cocok dengan pencarian Anda." : "Belum ada apotek yang terdaftar."}
            </p>
          </div>
        )}
        {filteredData.map((branch: any) => (
          <AnimatedListItem key={branch.id}>
            <GlassCard variant="light" className="h-full p-0 overflow-hidden group hover:shadow-2xl hover:shadow-sky-500/10 transition-all duration-500 border-slate-200/60 flex flex-col">
              {/* TOP HEADER */}
              <div className="p-5 pb-3 flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[9px] font-black text-sky-600 bg-sky-50 px-2 py-0.5 rounded-md uppercase tracking-widest">{branch.code}</span>
                    <div className={`w-2 h-2 rounded-full ${branch.status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`}></div>
                  </div>
                  <h3 className="text-md font-black text-slate-800 leading-tight group-hover:text-sky-600 transition-colors">{branch.name}</h3>
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
                      {branch.address?.trim()
                        ? branch.address.trim()
                        : "Belum diisi"}
                    </p>
                  </div>
                </div>
              </div>

              {/* ADDONS BAR — 5 fitur addon_key (sinkron dengan page.tsx / tab overview) */}
              <div className="px-5 py-3 border-t border-slate-50 flex items-center justify-between gap-3 bg-slate-50/30">
                <div className="flex flex-wrap gap-1.5 flex-1 min-w-0 items-center">
                  <div className={`w-6 h-6 shrink-0 rounded-md flex items-center justify-center transition-all ${branch.addon_produk ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-300 opacity-40"}`} title="Produk Fokus">
                    <Target size={12} />
                  </div>
                  <div className={`w-6 h-6 shrink-0 rounded-md flex items-center justify-center transition-all ${branch.addon_payroll ? "bg-sky-100 text-sky-600" : "bg-slate-100 text-slate-300 opacity-40"}`} title="Payroll">
                    <Wallet size={12} />
                  </div>
                  <div className={`w-6 h-6 shrink-0 rounded-md flex items-center justify-center transition-all ${branch.addon_review_p ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-300 opacity-40"}`} title="Review Pelanggan">
                    <Star size={12} />
                  </div>
                  <div className={`w-6 h-6 shrink-0 rounded-md flex items-center justify-center transition-all ${branch.addon_review_i ? "bg-violet-100 text-violet-600" : "bg-slate-100 text-slate-300 opacity-40"}`} title="Review Internal">
                    <ClipboardCheck size={12} />
                  </div>
                  <div className={`w-6 h-6 shrink-0 rounded-md flex items-center justify-center transition-all ${branch.addon_absensi ? "bg-cyan-100 text-cyan-600" : "bg-slate-100 text-slate-300 opacity-40"}`} title="Absensi & Shift">
                    <Clock size={12} />
                  </div>
                </div>

                <Link 
                  href={`/bba/branches/${branch.id}`} 
                  className="px-3 py-1.5 bg-white hover:bg-sky-600 hover:text-white border border-slate-200 hover:border-sky-600 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all duration-300 shadow-sm flex items-center gap-1.5 group/btn"
                >
                  Kelola
                  <ChevronRight size={10} className="group-hover/btn:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            </GlassCard>
          </AnimatedListItem>
        ))}

      </AnimatedList>
    </>
  );
}
