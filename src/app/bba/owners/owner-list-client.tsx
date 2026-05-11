"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import { OwnerActions } from "./owner-actions";
import { UserCircle2, Building2, Search, X, AlertTriangle, Clock as ClockIcon } from "lucide-react";

export function OwnerListClient({ initialData }: { initialData: any[] }) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredData = initialData.filter((owner) => {
    const q = searchQuery.toLowerCase();
    return (
      owner.full_name.toLowerCase().includes(q) ||
      owner.email.toLowerCase().includes(q) ||
      (owner.phone && owner.phone.toLowerCase().includes(q)) ||
      owner.apoteks.some((apt: string) => apt.toLowerCase().includes(q))
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
      </div>

      {/* MOBILE VIEW (CARDS) */}
      <div className="md:hidden flex flex-col gap-4">
        {filteredData.length === 0 ? (
          <GlassCard variant="light" className="p-8 text-center flex flex-col items-center justify-center">
            <UserCircle2 size={48} className="mb-3 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">
              {searchQuery ? "Pencarian tidak ditemukan." : "Belum ada owner yang terdaftar."}
            </p>
          </GlassCard>
        ) : (
          filteredData.map((owner: any) => (
            <GlassCard key={`${owner.status}-${owner.id}`} variant="light" className="p-4 relative hover:shadow-md transition-shadow border-l-4 border-l-sky-500">
              <div className="absolute top-4 right-4">
                <OwnerActions owner={owner} />
              </div>
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-sky-50 flex items-center justify-center text-sky-600 shrink-0">
                  <UserCircle2 size={24} />
                </div>
                <div className="min-w-0 pr-6">
                  <p className="font-bold text-base text-slate-800 truncate">{owner.full_name}</p>
                  <p className="text-sm text-slate-500 truncate">{owner.email}</p>
                  {owner.phone && (
                    <p className="text-xs font-semibold text-emerald-600 mt-1 tracking-wide">📞 {owner.phone}</p>
                  )}
                  <div className="mt-2">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${owner.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${owner.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                      <span className="text-[10px] font-bold uppercase">{owner.is_active ? 'Aktif' : 'Nonaktif'}</span>
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="pt-3 border-t border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Kepemilikan Apotek</p>
                <div className="flex flex-wrap gap-1.5">
                  {owner.apoteks.length > 0 ? owner.apoteks.map((apt: string, idx: number) => (
                    <span key={idx} className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md border border-slate-200/60 whitespace-nowrap">
                      <Building2 size={12} className="text-sky-600" /> {apt}
                    </span>
                  )) : (
                    <span className="flex items-center gap-1 text-[11px] font-bold bg-amber-50 text-amber-700 px-2.5 py-1 rounded-md border border-amber-200">
                      <AlertTriangle size={12} /> Menunggu Assign Apotek
                    </span>
                  )}
                </div>
              </div>
            </GlassCard>
          ))
        )}
      </div>

      {/* DESKTOP VIEW (TABLE) */}
      <GlassCard variant="light" className="p-0 overflow-visible hidden md:block border-slate-200/60 shadow-sm">
        <div className="overflow-visible">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 backdrop-blur-sm border-b border-slate-200/60">
                <th className="py-5 px-8 text-xs font-black uppercase tracking-widest text-slate-500">Profil Owner</th>
                <th className="py-5 px-8 text-xs font-black uppercase tracking-widest text-slate-500">Aktivitas Terakhir</th>
                <th className="py-5 px-8 text-xs font-black uppercase tracking-widest text-slate-500">Status Akun</th>
                <th className="py-5 px-8 text-xs font-black uppercase tracking-widest text-slate-500 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <UserCircle2 size={56} className="mb-4 opacity-20" />
                      <p className="text-base font-medium">
                        {searchQuery ? "Tidak ada hasil yang cocok dengan pencarian Anda." : "Belum ada owner yang terdaftar."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((owner: any) => (
                  <tr key={`${owner.status}-${owner.id}`} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="py-5 px-8">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-sky-50 flex items-center justify-center text-sky-600 group-hover:scale-110 group-hover:bg-sky-100 transition-all duration-300 shrink-0 shadow-sm">
                          <UserCircle2 size={24} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-base text-slate-800 truncate">{owner.full_name}</p>
                          <p className="text-sm text-slate-500 truncate">{owner.email}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {owner.apoteks.length > 0 ? (
                              owner.apoteks.map((apt: string, idx: number) => (
                                <span key={idx} className="inline-flex items-center gap-1 text-[9px] font-black uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                                  <Building2 size={10} /> {apt}
                                </span>
                              ))
                            ) : owner.status === "active" ? (
                              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200">
                                <AlertTriangle size={10} /> Menunggu assign apotek
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-5 px-8">
                      {owner.last_login_at ? (
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-700">{new Date(owner.last_login_at).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })}</p>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{new Date(owner.last_login_at).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' })} WIB</p>
                        </div>
                      ) : (
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">Belum pernah login</span>
                      )}
                    </td>
                    <td className="py-5 px-8">
                      {owner.status === 'active' ? (
                        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${owner.is_active ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                          <span className={`w-2 h-2 rounded-full ${owner.is_active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`}></span>
                          <span className="text-xs font-bold uppercase tracking-wide">{owner.is_active ? 'Aktif' : 'Nonaktif'}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-amber-50 border-amber-200 text-amber-700">
                          <ClockIcon size={12} className="animate-pulse" />
                          <span className="text-xs font-bold uppercase tracking-wide">Menunggu Verifikasi</span>
                        </span>
                      )}
                    </td>
                    <td className="py-5 px-8 text-right">
                      <OwnerActions owner={owner} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </>
  );
}
