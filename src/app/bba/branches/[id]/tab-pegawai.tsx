"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import { UserCircle2, Plus, ShieldAlert } from "lucide-react";
import { AddCrewModal } from "./add-crew-modal";
import { EditCrewModal } from "./edit-crew-modal";
import { UserActionDropdown } from "./user-action-dropdown";

export function TabPegawai({ branch, users }: { branch: any, users: any[] }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);

  // Hanya tampilkan crew dan admin_apotek
  const displayUsers = users.filter(u => u.role === 'crew' || u.role === 'admin_apotek');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-800">Manajemen Pegawai</h2>
          <p className="text-sm text-slate-500 mt-1">Daftar Crew dan Admin Apotek yang bertugas di {branch.name}.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-sky-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-sky-600/30 hover:shadow-sky-600/50 hover:bg-sky-700 transition-all hover:-translate-y-0.5 active:scale-95 whitespace-nowrap"
        >
          <Plus size={18} /> Tambah Pegawai
        </button>
      </div>

      <GlassCard variant="light" className="p-0 overflow-visible">
        <div className="w-full">
          {/* DESKTOP TABLE VIEW */}
          <div className="hidden md:block w-full overflow-x-auto">
            <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 backdrop-blur-sm border-b border-slate-100">
                <th className="py-5 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Profil Pegawai</th>
                <th className="py-5 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Hak Akses</th>
                <th className="py-5 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Status Keaktifan</th>
                <th className="py-5 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Manajemen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <div className="w-16 h-16 rounded-3xl bg-slate-50 flex items-center justify-center mb-4 text-slate-200">
                        <UserCircle2 size={32} />
                      </div>
                      <p className="text-sm font-bold text-slate-500 uppercase tracking-tight">Belum Ada Pegawai</p>
                      <p className="text-xs text-slate-400 mt-1">Mulai tambahkan personil untuk mengelola cabang ini.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                displayUsers.map((item) => {
                  const isUserActive = !!(item.is_active && item.app_users?.is_active);
                  const initials = item.app_users?.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
                  const colors = ['bg-sky-100 text-sky-600', 'bg-indigo-100 text-indigo-600', 'bg-emerald-100 text-emerald-600', 'bg-amber-100 text-amber-600', 'bg-rose-100 text-rose-600', 'bg-purple-100 text-purple-600'];
                  const colorClass = colors[item.app_users?.full_name?.length % colors.length] || colors[0];

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-all duration-300 group">
                      <td className="py-5 px-6">
                        <div className="flex items-center gap-4">
                          <div className={`w-11 h-11 rounded-2xl ${colorClass} flex items-center justify-center font-black text-sm shadow-sm border-2 border-white group-hover:scale-110 transition-transform duration-500`}>
                            {initials}
                          </div>
                          <div className="overflow-hidden">
                            <p className="font-black text-slate-800 text-sm group-hover:text-sky-600 transition-colors truncate">{item.app_users?.full_name || 'No Name'}</p>
                            <p className="text-[11px] font-medium text-slate-500 truncate">{item.app_users?.email || 'No Email'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-5 px-6">
                        <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 w-fit shadow-sm border ${
                          item.role === 'crew' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                          item.role === 'admin_apotek' ? 'bg-sky-600 text-white border-sky-700' :
                          'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {item.role === 'admin_apotek' ? <ShieldAlert size={12} /> : <UserCircle2 size={12} />}
                          {item.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-5 px-6">
                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${isUserActive ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isUserActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse' : 'bg-rose-500'}`}></span>
                          <span className="text-[10px] font-black uppercase tracking-tight">{isUserActive ? 'Aktif' : 'Non-aktif'}</span>
                        </div>
                      </td>
                      <td className="py-5 px-6 text-right">
                        <UserActionDropdown 
                          user={item}
                          branchId={branch.id}
                          branchName={branch.name}
                          onEdit={(u) => setEditingUser(u)}
                        />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            </table>
          </div>

          {/* MOBILE CARD VIEW */}
          <div className="md:hidden flex flex-col divide-y divide-slate-100">
            {displayUsers.length === 0 ? (
              <div className="py-16 text-center flex flex-col items-center justify-center text-slate-400">
                <UserCircle2 size={48} className="mb-3 opacity-20" />
                <p className="text-sm font-bold text-slate-500 uppercase tracking-tight">Belum Ada Pegawai</p>
              </div>
            ) : (
              displayUsers.map((item) => {
                const isUserActive = !!(item.is_active && item.app_users?.is_active);
                const initials = item.app_users?.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
                const colors = ['bg-sky-100 text-sky-600', 'bg-indigo-100 text-indigo-600', 'bg-emerald-100 text-emerald-600', 'bg-amber-100 text-amber-600', 'bg-rose-100 text-rose-600'];
                const colorClass = colors[item.app_users?.full_name?.length % colors.length] || colors[0];
                
                return (
                  <div key={item.id} className="p-5 hover:bg-slate-50/50 transition-colors active:bg-slate-100">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl ${colorClass} flex items-center justify-center font-black text-sm shadow-sm border-2 border-white`}>
                          {initials}
                        </div>
                        <div className="overflow-hidden">
                          <p className="font-black text-slate-800 text-sm truncate">{item.app_users?.full_name || 'No Name'}</p>
                          <p className="text-xs font-medium text-slate-500 truncate max-w-[180px]">{item.app_users?.email || 'No Email'}</p>
                        </div>
                      </div>
                      <UserActionDropdown 
                        user={item}
                        branchId={branch.id}
                        branchName={branch.name}
                        onEdit={(u) => setEditingUser(u)}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-2 pl-16">
                      <span className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 w-fit border ${
                        item.role === 'crew' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                        item.role === 'admin_apotek' ? 'bg-sky-600 text-white border-sky-700' :
                        'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        {item.role === 'admin_apotek' && <ShieldAlert size={10} />}
                        {item.role.replace('_', ' ')}
                      </span>
                      <div className={`flex items-center gap-1.5 ${isUserActive ? 'text-emerald-600' : 'text-rose-600'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${isUserActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`}></div>
                        <span className="text-[10px] font-black uppercase tracking-tight">{isUserActive ? 'Aktif' : 'Non-aktif'}</span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

        </div>
      </GlassCard>

      <AddCrewModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        branchId={branch.id} 
        branchName={branch.name}
      />

      <EditCrewModal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        branchId={branch.id}
        branchName={branch.name}
        userData={editingUser}
      />
    </div>
  );
}
