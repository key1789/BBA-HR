"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useActionState, useEffect, useState } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import { Store, MapPin, Phone, Hash, Loader2, Check, X, User as UserIcon, Mail, Settings } from "lucide-react";
import { updateBranchAction } from "./actions";
import { toast } from "sonner";
import Link from "next/link";

export function TabInfo({ branch, owner }: { branch: any, owner?: any }) {
  const [isEditing, setIsEditing] = useState(false);
  const [state, action, isPending] = useActionState(updateBranchAction, null);

  useEffect(() => {
    if (state?.success) {
      toast.success(state.message);
      setIsEditing(false);
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state]);

  const ownerData = owner?.app_users;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <GlassCard className="p-6" variant="light">
        <form action={action}>
          <input type="hidden" name="tenantId" value={branch.id} />
          
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <Store size={20} className="text-sky-500" /> Profil Cabang
            </h2>
            {!isEditing ? (
              <button 
                type="button"
                onClick={() => setIsEditing(true)}
                className="text-xs font-bold text-sky-600 bg-sky-50 px-3 py-1.5 rounded-xl hover:bg-sky-100 transition-colors"
              >
                Edit Profil
              </button>
            ) : (
              <div className="flex gap-2">
                <button 
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={isPending}
                  className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl hover:bg-slate-200 transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  <X size={14}/> Batal
                </button>
                <button 
                  type="submit"
                  disabled={isPending}
                  className="text-xs font-bold text-white bg-sky-600 px-3 py-1.5 rounded-xl hover:bg-sky-700 transition-colors flex items-center gap-1 shadow-sm disabled:opacity-50"
                >
                  {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14}/>} Simpan
                </button>
              </div>
            )}
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nama Apotek</label>
              {isEditing ? (
                <input 
                  type="text" 
                  name="name"
                  defaultValue={branch.name}
                  required
                  className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              ) : (
                <p className="font-bold text-slate-800 text-sm mt-0.5">{branch.name}</p>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1"><Hash size={12}/> Kode Cabang</label>
                {isEditing ? (
                  <input 
                    type="text" 
                    name="code"
                    defaultValue={branch.code}
                    required
                    className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 uppercase"
                  />
                ) : (
                  <p className="font-bold text-slate-800 text-sm mt-0.5 uppercase">{branch.code}</p>
                )}
              </div>
              
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</label>
                {isEditing ? (
                  <select 
                    name="status"
                    defaultValue={branch.status}
                    required
                    className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                ) : (
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${branch.status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`}></span>
                    <span className="text-sm font-bold text-slate-800 capitalize">{branch.status}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1"><MapPin size={12}/> Alamat Lengkap</label>
              {isEditing ? (
                <textarea 
                  name="address"
                  defaultValue={branch.address || ""}
                  rows={2}
                  placeholder="Masukkan alamat apotek..."
                  className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 resize-none"
                />
              ) : (
                <p className="font-medium text-slate-600 text-sm mt-0.5">{branch.address || <span className="text-slate-400 italic">Belum diisi</span>}</p>
              )}
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1"><Phone size={12}/> Nomor Telepon / WA</label>
              {isEditing ? (
                <input 
                  type="text" 
                  name="phone"
                  defaultValue={branch.phone || ""}
                  placeholder="Cth: 08123456789"
                  className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              ) : (
                <p className="font-medium text-slate-600 text-sm mt-0.5">{branch.phone || <span className="text-slate-400 italic">Belum diisi</span>}</p>
              )}
            </div>
          </div>
        </form>
      </GlassCard>

      <GlassCard className="p-6" variant="light">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-black text-slate-800">Informasi Owner</h2>
          <Link 
            href="/bba/owners" 
            className="text-xs font-bold text-slate-500 hover:text-sky-600 bg-slate-100 hover:bg-sky-50 px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1"
          >
            <Settings size={14} /> Kelola Owner
          </Link>
        </div>
        
        {ownerData ? (
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center font-bold text-lg">
                {ownerData.full_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-slate-800">{ownerData.full_name}</h3>
                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md mt-1 inline-block ${
                  owner?.is_active 
                    ? 'text-emerald-600 bg-emerald-100' 
                    : 'text-rose-600 bg-rose-100'
                }`}>
                  {owner?.is_active ? 'Active Owner' : 'Inactive Owner'}
                </span>
              </div>
            </div>
            
            <div className="space-y-3 pt-3 border-t border-slate-200/60">
              <div className="flex items-start gap-2">
                <Mail size={14} className="text-slate-400 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Email</p>
                  <p className="text-sm font-medium text-slate-700">{ownerData.email}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Phone size={14} className="text-slate-400 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Nomor Telepon</p>
                  <p className="text-sm font-medium text-slate-700">{ownerData.phone || "-"}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center bg-slate-50/50">
            <UserIcon size={24} className="text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-500">Belum ada Owner yang ditugaskan ke cabang ini.</p>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
