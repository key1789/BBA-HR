"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useTransition, useState } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import { Store, MapPin, Phone, Hash, Loader2, Check, X, User as UserIcon, Mail, Settings, Target, Puzzle, Users, Clock, AlertCircle, ShieldCheck, Banknote, Star, ClipboardCheck } from "lucide-react";
import { updateBranchAction } from "./actions";
import { toast } from "sonner";
import Link from "next/link";
import { motion } from "framer-motion";

export function TabOverview({ 
  branch, users, kpi, addons, shifts, products, productFokus, roster, payrollConfigs, availableOwners 
}: { 
  branch: any, users: any[], kpi: any, addons: any[], shifts: any[], products: any[], productFokus: any[], roster: any[], payrollConfigs: any[], availableOwners?: any[]
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const ownerMembership =
    users.find((u) => u.role === "owner" && u.is_active && u.app_users?.is_active) ||
    users.find((u) => u.role === "owner");
  void products;
  void productFokus;
  void payrollConfigs;
  const ownerData = ownerMembership?.app_users;
  const isOwnerActive = !!(ownerMembership?.is_active && ownerData?.is_active);
  const activeCrewCount = users.filter((u) => u.role === "crew" && u.is_active && u.app_users?.is_active).length;
  const activeAdminCount = users.filter((u) => u.role === "admin_apotek" && u.is_active && u.app_users?.is_active).length;

  const handleUpdateBranch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateBranchAction(null, formData);
      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        toast.success(result.message);
        setIsEditing(false);
      }
    });
  };

  // 1. KPI Data
  const isKpiReady = !!kpi;
  const targetOmzet = Number(kpi?.target_omzet || 0);
  const targetAtv = Number(kpi?.target_atv || 0);
  const targetAtu = Number(kpi?.target_atu || 0);

  // 3. Shift Data
  const masterShiftsCount = shifts.length;
  void roster;

  // 4. Add-on Data
  const addonMeta: Record<string, { label: string; icon: any }> = {
    produk_fokus: { label: "Produk Fokus", icon: Target },
    absensi_shift: { label: "Absensi & Roster", icon: Clock },
    review_pelanggan: { label: "Review Pelanggan", icon: Star },
    review_internal: { label: "Review Internal", icon: ClipboardCheck },
    payroll: { label: "Payroll & Gaji", icon: Banknote },
  };

  const activeAddons = addons.filter((a) => a.is_enabled);
  const activeAddonsCount = activeAddons.length;
  const activeUnsetAddonsCount = activeAddons.filter((a) => {
    const settings = a.settings;
    if (settings === null || settings === undefined) return true;
    if (Array.isArray(settings)) return settings.length === 0;
    if (typeof settings === "object") return Object.keys(settings).length === 0;
    if (typeof settings === "string") return settings.trim() === "" || settings.trim() === "{}" || settings.trim() === "[]";
    return false;
  }).length;

  const formatShiftTime = (value: string) => {
    if (!value) return "--:--";
    const [hh, mm] = value.split(":");
    return `${hh ?? "00"}:${mm ?? "00"}`;
  };

  return (
    <div className="space-y-6">
      {/* 1. EXECUTIVE DASHBOARD WIDGETS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* 1. HR Statistics Widget */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <GlassCard variant="light" className="p-5 flex flex-col justify-between h-full border-l-4 border-l-indigo-500 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-500 bg-white">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm">
                  <Users size={20} />
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total Pegawai</span>
              </div>
              
              <h3 className="text-4xl font-black text-slate-800 tracking-tighter mb-1">
                {activeCrewCount + activeAdminCount}
                <span className="text-sm font-bold text-slate-400 ml-2 uppercase">Personil</span>
              </h3>
              
              <div className="flex gap-2 mt-4">
                <div className="flex-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                  <p className="text-lg font-black text-indigo-600 leading-none mb-1">{activeAdminCount}</p>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Admin</p>
                </div>
                <div className="flex-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                  <p className="text-lg font-black text-indigo-600 leading-none mb-1">{activeCrewCount}</p>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Crew</p>
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* 2. KPI Target Widget */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <GlassCard variant="light" className="p-5 flex flex-col justify-between h-full border-l-4 border-l-emerald-500 hover:shadow-2xl hover:shadow-emerald-500/10 transition-all duration-500 bg-white">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-sm">
                  <Target size={20} />
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Target KPI</span>
              </div>
              
              {isKpiReady ? (
                <>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Target Omzet</p>
                  <h3 className="text-2xl font-black text-slate-800 tracking-tighter mb-4">
                    <span className="text-emerald-500 text-sm mr-1">Rp</span>
                    {targetOmzet.toLocaleString('id-ID')}
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-100">
                       <span className="text-[9px] font-bold text-slate-500 uppercase">ATV</span>
                       <span className="text-[11px] font-black text-slate-700">Rp {targetAtv.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-100">
                       <span className="text-[9px] font-bold text-slate-500 uppercase">ATU</span>
                       <span className="text-[11px] font-black text-slate-700">{targetAtu.toLocaleString('id-ID')} Pcs</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-6 flex flex-col items-center justify-center text-center">
                  <AlertCircle size={24} className="text-amber-400 mb-2" />
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Belum Diatur</p>
                </div>
              )}
            </div>
          </GlassCard>
        </motion.div>

        {/* 3. Shift Information Widget */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <GlassCard variant="light" className="p-5 flex flex-col justify-between h-full border-l-4 border-l-sky-500 hover:shadow-2xl hover:shadow-sky-500/10 transition-all duration-500 bg-white">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shadow-sm">
                  <Clock size={20} />
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Operasional</span>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-sky-50/60 p-3 rounded-xl border border-sky-100 shadow-sm">
                  <span className="text-[10px] font-bold text-sky-700 uppercase tracking-widest">Total Master Shift</span>
                  <span className="text-2xl font-black text-sky-700 leading-none">{masterShiftsCount}</span>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ringkasan Shift</p>
                  {shifts.length > 0 ? (
                    <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                      {shifts.map((shift) => (
                        <div key={shift.id} className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100">
                          <span className="text-[10px] font-black text-slate-700 uppercase tracking-wide">{shift.shift_name}</span>
                          <span className="text-[10px] font-bold text-slate-500">
                            {formatShiftTime(shift.start_time)} - {formatShiftTime(shift.end_time)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-amber-50 text-amber-700 px-3 py-2 rounded-xl border border-amber-100 shadow-sm">
                      <AlertCircle size={16} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Belum Ada Shift</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* 4. Add-on Widget */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <GlassCard variant="light" className="p-5 flex flex-col justify-between h-full border-l-4 border-l-purple-500 hover:shadow-2xl hover:shadow-purple-500/10 transition-all duration-500 bg-white">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shadow-sm">
                  <Puzzle size={20} />
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Fitur Ekstra</span>
              </div>
              
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Add-on Aktif</p>
                  {activeAddonsCount > 0 ? (
                    <div className="space-y-1.5">
                      {activeAddons.map((addon) => {
                        const meta = addonMeta[addon.addon_key];
                        const Icon = meta?.icon ?? Puzzle;
                        return (
                          <div key={addon.id ?? addon.addon_key} className="flex items-center gap-2 bg-purple-50/60 p-2 rounded-lg border border-purple-100">
                            <div className="w-6 h-6 rounded-lg bg-white text-purple-600 flex items-center justify-center border border-purple-100">
                              <Icon size={13} />
                            </div>
                            <span className="text-[10px] font-black text-purple-700 uppercase tracking-wide">
                              {meta?.label ?? addon.addon_key}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100 border-dashed">
                      <AlertCircle size={14} className="text-slate-400" />
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Belum Ada Add-on Aktif</span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100 border-dashed">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Aktif Tapi Belum Diset</span>
                  <span className="text-xs font-black text-slate-600">{activeUnsetAddonsCount}</span>
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>

      </div>


      {/* 2. ORIGINAL INFO & OWNER FORMS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <GlassCard className="p-6 h-full" variant="light">
            <form onSubmit={handleUpdateBranch}>
              <input type="hidden" name="tenantId" value={branch.id} />
              
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <Store size={20} className="text-sky-500" /> Profil Cabang
                </h2>
                {!isEditing ? (
                  <button 
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="text-xs font-bold text-sky-600 bg-sky-50 px-3 py-1.5 rounded-lg hover:bg-sky-100 transition-colors"
                  >
                    Edit Profil
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setIsEditing(false)}
                      disabled={isPending}
                      className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                      <X size={14}/> Batal
                    </button>
                    <button 
                      type="submit"
                      disabled={isPending}
                      className="text-xs font-bold text-white bg-sky-600 px-3 py-1.5 rounded-lg hover:bg-sky-700 transition-colors flex items-center gap-1 shadow-sm disabled:opacity-50"
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
                      className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
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
                        className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
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
                      className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 resize-none"
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
                      className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                    />
                  ) : (
                    <p className="font-medium text-slate-600 text-sm mt-0.5">{branch.phone || <span className="text-slate-400 italic">Belum diisi</span>}</p>
                  )}
                </div>
              </div>
            </form>
          </GlassCard>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <GlassCard className="p-6 h-full" variant="light">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <ShieldCheck size={20} className="text-sky-500" /> Informasi Owner
              </h2>
              <div className="flex gap-2">
                <Link 
                  href={ownerData ? `/bba/owners?tenantId=${branch.id}&ownerId=${ownerData.id}` : `/bba/owners?tenantId=${branch.id}`} 
                  className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-sky-600 bg-slate-100 hover:bg-sky-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Settings size={14} /> Kelola
                </Link>
              </div>
            </div>

            
            {ownerData ? (
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center font-bold text-lg shadow-sm border border-sky-200/50">
                    {ownerData.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">{ownerData.full_name}</h3>
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md mt-1 inline-block ${
                      isOwnerActive 
                        ? 'text-emerald-600 bg-emerald-100' 
                        : 'text-rose-600 bg-rose-100'
                    }`}>
                      {isOwnerActive ? 'Active Owner' : 'Inactive Owner'}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-3 pt-4 border-t border-slate-200/60">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 border border-slate-100 shadow-sm">
                       <Mail size={14} className="text-slate-500" />
                    </div>
                    <div className="pt-0.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Email Terdaftar</p>
                      <p className="text-sm font-bold text-slate-700">{ownerData.email}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 border border-slate-100 shadow-sm">
                       <Phone size={14} className="text-slate-500" />
                    </div>
                    <div className="pt-0.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Nomor Kontak</p>
                      <p className="text-sm font-bold text-slate-700">{ownerData.phone || "-"}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center bg-slate-50/50 hover:bg-slate-50 transition-colors">
                <UserIcon size={32} className="text-slate-300 mb-3" />
                <p className="text-sm font-bold text-slate-700 mb-1">Tidak Ada Owner</p>
                <p className="text-xs font-medium text-slate-500">Belum ada Owner yang ditugaskan untuk mengawasi cabang ini.</p>
              </div>
            )}

            {/* GANTI OWNER FORM */}
            <div className="mt-6 pt-6 border-t border-slate-100">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Transfer Kepemilikan Cabang</h3>
              <form action={async (formData) => {
                const newOwnerId = formData.get("newOwnerId");
                if(!newOwnerId || newOwnerId === (ownerData?.id || "")) {
                  toast.error("Silakan pilih owner baru yang berbeda.");
                  return;
                }
                if(confirm("Apakah Anda yakin ingin memindahkan kepemilikan cabang ini? Owner lama akan kehilangan akses.")) {
                  formData.append("tenantId", branch.id);
                  const { transferBranchOwnershipAction } = await import("./actions");
                  const res = await transferBranchOwnershipAction(null, formData);
                  if(res.success) toast.success(res.message);
                  else toast.error(res.error);
                }
              }} className="flex flex-col sm:flex-row gap-3">
                <select 
                  name="newOwnerId" 
                  className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:bg-white transition-all"
                  defaultValue=""
                  required
                >
                  <option value="" disabled>-- Pilih Owner Baru --</option>
                  {availableOwners?.map((user: any) => (
                    <option key={user.id} value={user.id} disabled={user.id === ownerData?.id}>
                      {user.full_name} {user.id === ownerData?.id ? "(Pemilik Saat Ini)" : ""}
                    </option>
                  ))}
                </select>
                <button type="submit" className="px-6 py-2 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2 whitespace-nowrap">
                  <UserIcon size={14} /> Ganti Owner
                </button>
              </form>
            </div>

          </GlassCard>
        </motion.div>
      </div>
    </div>
  );
}
