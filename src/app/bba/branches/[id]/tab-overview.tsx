"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useTransition, useState } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import {
  Store, MapPin, Phone, Hash, Loader2, Check, X,
  User as UserIcon, Mail, Settings, Target, Puzzle, Clock,
  AlertCircle, ShieldCheck, Settings2, Users, ExternalLink,
  CheckCircle2, Circle, Activity,
} from "lucide-react";
import { InfoTooltip } from "@/components/shared/info-tooltip";
import { updateBranchAction } from "./actions";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { isBranchDeskAdminAccount } from "@/lib/branch-personnel";
import { OwnerDetailModal } from "./owner-detail-modal";

export function TabOverview({
  branch, users, kpi, addons, shifts, products, productFokus, roster, availableOwners,
  currentMonth, currentYear, onNavigateToTab,
}: {
  branch: any; users: any[]; kpi: any; addons: any[]; shifts: any[];
  products: any[]; productFokus: any[]; roster: any[]; availableOwners?: any[];
  currentMonth: number; currentYear: number; onNavigateToTab: (tabId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isOwnerModalOpen, setIsOwnerModalOpen] = useState(false);
  const ownerMembership =
    users.find((u) => u.role === "owner" && u.is_active && u.app_users?.is_active) ||
    users.find((u) => u.role === "owner");
  const ownerData = ownerMembership?.app_users;
  const isOwnerActive = !!(ownerMembership?.is_active && ownerData?.is_active);
  const activeCrewCount = users.filter(
    (u) => u.role === "crew" && u.is_active && u.app_users?.is_active,
  ).length;
  const deskAdminAccountCount = users.filter(
    (u) => isBranchDeskAdminAccount(u) && u.is_active && u.app_users?.is_active,
  ).length;

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

  // ── KPI Data ──
  const isKpiReady    = !!kpi;
  const targetOmzet   = Number(kpi?.target_omzet || 0);
  const targetAtv     = Number(kpi?.target_atv    || 0);
  const targetAtu     = Number(kpi?.target_atu    || 0);

  // ── Shift Data ──
  const masterShiftsCount = shifts.length;
  void roster;

  // ── Add-on Data ──
  const activeAddons      = addons.filter((a) => a.is_enabled);
  const activeAddonsCount = activeAddons.length;
  const NO_SETTINGS_REQUIRED = new Set(["review_pelanggan", "payroll", "produk_fokus"]);
  const activeUnsetAddonsCount = activeAddons.filter((a) => {
    if (NO_SETTINGS_REQUIRED.has(a.addon_key)) return false;
    const settings = a.settings;
    if (settings === null || settings === undefined) return true;
    if (Array.isArray(settings)) return settings.length === 0;
    if (typeof settings === "object") return Object.keys(settings).length === 0;
    if (typeof settings === "string")
      return settings.trim() === "" || settings.trim() === "{}" || settings.trim() === "[]";
    return false;
  }).length;

  // ── Health Score ──
  const healthItems = [
    { key: "owner",  label: "Owner ditugaskan",       met: !!ownerData && isOwnerActive },
    { key: "crew",   label: "Memiliki crew aktif",     met: activeCrewCount > 0 },
    { key: "kpi",    label: "KPI dikonfigurasi",       met: isKpiReady },
    { key: "shift",  label: "Master shift tersedia",   met: masterShiftsCount > 0 },
    { key: "addon",  label: "Add-on terkonfigurasi",   met: activeAddonsCount > 0 && activeUnsetAddonsCount === 0 },
  ];
  const healthScore = healthItems.filter(i => i.met).length;
  const healthPct   = Math.round((healthScore / healthItems.length) * 100);
  const healthColor =
    healthPct === 100 ? { bar: "bg-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" } :
    healthPct >= 80   ? { bar: "bg-sky-500",     text: "text-sky-600",     bg: "bg-sky-50",     border: "border-sky-100"     } :
    healthPct >= 60   ? { bar: "bg-amber-400",   text: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-100"   } :
                        { bar: "bg-rose-400",    text: "text-rose-600",    bg: "bg-rose-50",    border: "border-rose-100"    };

  const formatShiftTime = (value: string) => {
    if (!value) return "--:--";
    const [hh, mm] = value.split(":");
    return `${hh ?? "00"}:${mm ?? "00"}`;
  };

  return (
    <div className="space-y-6">
      {/* ─── 2-PANEL LAYOUT ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* ── LEFT PANEL: Static Info (2 of 5 cols) ─────────────────────────────── */}
        <div className="xl:col-span-2 space-y-5">

          {/* Branch Profile Form */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <GlassCard className="p-6" variant="light">
              <form onSubmit={handleUpdateBranch}>
                <input type="hidden" name="tenantId" value={branch.id} />

                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                    <Store size={18} className="text-sky-500" /> Profil Cabang
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
                        <X size={14} /> Batal
                      </button>
                      <button
                        type="submit"
                        disabled={isPending}
                        className="text-xs font-bold text-white bg-sky-600 px-3 py-1.5 rounded-xl hover:bg-sky-700 transition-colors flex items-center gap-1 shadow-sm disabled:opacity-50"
                      >
                        {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Simpan
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
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                        <Hash size={12} /> Kode Cabang
                        <InfoTooltip content="ID unik singkat cabang — tampil di laporan, slip gaji, dan referensi internal." side="top" width="w-64" />
                      </label>
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
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                        Status
                        <InfoTooltip content="Inactive = cabang tidak muncul di operasional harian. Data tetap tersimpan." side="top" width="w-64" />
                      </label>
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
                          <span className={`w-2 h-2 rounded-full ${branch.status === "active" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-300"}`} />
                          <span className="text-sm font-bold text-slate-800 capitalize">{branch.status}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                      <MapPin size={12} /> Alamat Lengkap
                    </label>
                    {isEditing ? (
                      <textarea
                        name="address"
                        defaultValue={branch.address || ""}
                        rows={2}
                        placeholder="Masukkan alamat apotek..."
                        className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 resize-none"
                      />
                    ) : (
                      <p className="font-medium text-slate-600 text-sm mt-0.5">
                        {branch.address || <span className="text-slate-400 italic">Belum diisi</span>}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                      <Phone size={12} /> Nomor Telepon / WA
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        name="phone"
                        defaultValue={branch.phone || ""}
                        placeholder="Cth: 08123456789"
                        className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                      />
                    ) : (
                      <p className="font-medium text-slate-600 text-sm mt-0.5">
                        {branch.phone || <span className="text-slate-400 italic">Belum diisi</span>}
                      </p>
                    )}
                  </div>
                </div>
              </form>
            </GlassCard>
          </motion.div>

          {/* Owner Info */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <GlassCard className="p-6" variant="light">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <ShieldCheck size={18} className="text-sky-500" /> Informasi Owner
                  <InfoTooltip content="Owner memiliki akses penuh ke portal manajemen cabangnya. Satu cabang hanya boleh memiliki satu owner aktif." side="right" width="w-72" />
                </h2>
                <button
                  type="button"
                  onClick={() => setIsOwnerModalOpen(true)}
                  disabled={!ownerData}
                  className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-sky-600 bg-slate-100 hover:bg-sky-50 px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Settings size={13} /> Kelola
                </button>
              </div>

              {ownerData ? (
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center font-bold text-base shadow-sm border border-sky-200/50">
                      {ownerData.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">{ownerData.full_name}</h3>
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md mt-1 inline-block ${
                        isOwnerActive ? "text-emerald-600 bg-emerald-100" : "text-rose-600 bg-rose-100"
                      }`}>
                        {isOwnerActive ? "Active Owner" : "Inactive Owner"}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-3 border-t border-slate-200/60">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center shrink-0 border border-slate-100 shadow-sm">
                        <Mail size={12} className="text-slate-500" />
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Email</p>
                        <p className="text-xs font-bold text-slate-700">{ownerData.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center shrink-0 border border-slate-100 shadow-sm">
                        <Phone size={12} className="text-slate-500" />
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Kontak</p>
                        <p className="text-xs font-bold text-slate-700">{ownerData.phone || "—"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center bg-slate-50/50">
                  <UserIcon size={28} className="text-slate-300 mb-2" />
                  <p className="text-sm font-bold text-slate-600 mb-1">Tidak Ada Owner</p>
                  <p className="text-xs font-medium text-slate-400">Belum ada Owner yang ditugaskan.</p>
                </div>
              )}

              {/* Transfer ownership form */}
              <div className="mt-5 pt-5 border-t border-slate-100">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                  Transfer Kepemilikan
                  <InfoTooltip content="Owner baru mendapat akses penuh. Owner lama kehilangan akses ke cabang ini." side="top" width="w-64" />
                </h3>
                <form
                  action={async (formData) => {
                    const newOwnerId = formData.get("newOwnerId");
                    if (!newOwnerId || newOwnerId === (ownerData?.id || "")) {
                      toast.error("Silakan pilih owner baru yang berbeda.");
                      return;
                    }
                    if (confirm("Apakah Anda yakin ingin memindahkan kepemilikan cabang ini?")) {
                      formData.append("tenantId", branch.id);
                      const { transferBranchOwnershipAction } = await import("./actions");
                      const res = await transferBranchOwnershipAction(null, formData);
                      if (res.success) toast.success(res.message);
                      else toast.error(res.error);
                    }
                  }}
                  className="flex flex-col sm:flex-row gap-2"
                >
                  <select
                    name="newOwnerId"
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:bg-white transition-all"
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
                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <UserIcon size={13} /> Ganti
                  </button>
                </form>
              </div>
            </GlassCard>
          </motion.div>
        </div>

        {/* ── RIGHT PANEL: Metrics & Health (3 of 5 cols) ──────────────────────── */}
        <div className="xl:col-span-3 space-y-5">

          {/* 2×2 Widget Grid */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* HR Stats Widget */}
              <GlassCard variant="light" className="p-5 border-l-4 border-l-indigo-500 hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-500 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Users size={18} />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                    Total Pegawai
                    <InfoTooltip content="Hanya crew dengan akun aktif yang dihitung. Owner dan admin tidak termasuk." side="left" width="w-64" />
                  </span>
                </div>
                <h3 className="text-3xl font-black text-slate-800 tracking-tighter mb-1">
                  {activeCrewCount}
                  <span className="text-xs font-bold text-slate-400 ml-2 uppercase">Crew Aktif</span>
                </h3>
                {deskAdminAccountCount > 0 && (
                  <div className="mt-3 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 text-[10px] text-slate-500 font-medium flex items-center gap-1.5">
                    + {deskAdminAccountCount} akun portal admin cabang
                    <InfoTooltip content="Akun kasir/admin apotek. Tidak dihitung di angka crew aktif." side="top" width="w-64" />
                  </div>
                )}
              </GlassCard>

              {/* KPI Target Widget */}
              <GlassCard variant="light" className="p-5 border-l-4 border-l-emerald-500 hover:shadow-xl hover:shadow-emerald-500/10 transition-all duration-500 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Target size={18} />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Target KPI</span>
                </div>

                {isKpiReady ? (
                  <>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                      Target Omzet
                      <InfoTooltip content="Target penjualan bulanan di konfigurasi KPI cabang ini." side="right" width="w-56" />
                    </p>
                    <h3 className="text-xl font-black text-slate-800 tracking-tighter mb-3">
                      <span className="text-emerald-500 text-xs mr-1">Rp</span>
                      {targetOmzet.toLocaleString("id-ID")}
                    </h3>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                        <span className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1">
                          ATV
                          <InfoTooltip content="Average Transaction Value — rata-rata nilai rupiah per transaksi." side="right" width="w-60" />
                        </span>
                        <span className="text-[10px] font-black text-slate-700">Rp {targetAtv.toLocaleString("id-ID")}</span>
                      </div>
                      <div className="flex items-center justify-between bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                        <span className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1">
                          ATU
                          <InfoTooltip content="Average Transaction Units — rata-rata jumlah item per transaksi." side="right" width="w-60" />
                        </span>
                        <span className="text-[10px] font-black text-slate-700">{targetAtu.toLocaleString("id-ID")} Pcs</span>
                      </div>
                    </div>
                    {kpi?.bonus_config_v2 && (() => {
                      const bv2 = kpi.bonus_config_v2;
                      const hasActive = bv2.team_monthly?.enabled || bv2.team_daily?.enabled ||
                        bv2.individual_monthly?.enabled || bv2.individual_daily?.enabled;
                      return (
                        <div className={`mt-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[9px] font-bold ${hasActive ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-slate-50 border-slate-100 text-slate-400"}`}>
                          <Settings2 size={11} />
                          {hasActive ? "Skema bonus aktif" : "Belum ada skema bonus"}
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-4 text-center">
                    <AlertCircle size={20} className="text-amber-400 mb-2" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Belum Diatur</p>
                  </div>
                )}
              </GlassCard>

              {/* Shift Info Widget */}
              <GlassCard variant="light" className="p-5 border-l-4 border-l-sky-500 hover:shadow-xl hover:shadow-sky-500/10 transition-all duration-500 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                    <Clock size={18} />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Operasional</span>
                </div>

                <div className="flex items-center justify-between bg-sky-50/60 px-3 py-2.5 rounded-xl border border-sky-100 mb-3">
                  <span className="text-[9px] font-bold text-sky-700 uppercase tracking-widest flex items-center gap-1">
                    Master Shift
                    <InfoTooltip content="Jumlah template jam kerja yang tersimpan untuk cabang ini." side="right" width="w-60" />
                  </span>
                  <span className="text-xl font-black text-sky-700">{masterShiftsCount}</span>
                </div>

                {shifts.length > 0 ? (
                  <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                    {shifts.map((shift) => (
                      <div key={shift.id} className="flex items-center justify-between bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                        <span className="text-[9px] font-black text-slate-700 uppercase tracking-wide">{shift.shift_name}</span>
                        <span className="text-[9px] font-bold text-slate-500">
                          {formatShiftTime(shift.start_time)} – {formatShiftTime(shift.end_time)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-amber-50 text-amber-700 px-3 py-2 rounded-xl border border-amber-100">
                    <AlertCircle size={14} />
                    <span className="text-[9px] font-black uppercase tracking-widest">Belum Ada Shift</span>
                  </div>
                )}
              </GlassCard>

              {/* Add-on Widget */}
              <GlassCard variant="light" className="p-5 border-l-4 border-l-purple-500 hover:shadow-xl hover:shadow-purple-500/10 transition-all duration-500 bg-white flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                    <Puzzle size={18} />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                    Fitur Ekstra
                    <InfoTooltip content="Add-on adalah modul opsional yang memperluas kemampuan sistem. Setiap cabang bisa punya konfigurasi berbeda." side="left" width="w-72" />
                  </span>
                </div>

                <h3 className="text-3xl font-black text-slate-800 tracking-tighter mb-0.5">
                  {activeAddonsCount}
                  <span className="text-xs font-bold text-slate-400 ml-2 uppercase">Aktif</span>
                </h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">dari 5 add-on tersedia</p>

                {activeUnsetAddonsCount > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border border-amber-100 rounded-xl mb-3">
                    <AlertCircle size={11} className="text-amber-500 shrink-0" />
                    <span className="text-[9px] font-bold text-amber-700">{activeUnsetAddonsCount} addon belum dikonfigurasi</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onNavigateToTab("addons")}
                  className="mt-auto w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-50 border border-purple-100 text-purple-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-purple-100 transition-colors group"
                >
                  Kelola Fitur
                  <ExternalLink size={10} className="group-hover:scale-110 transition-transform" />
                </button>
              </GlassCard>
            </div>
          </motion.div>

          {/* Branch Health Score */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <GlassCard variant="light" className="p-5 bg-white">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${healthColor.bg} border ${healthColor.border}`}>
                    <Activity size={17} className={healthColor.text} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 leading-tight">Skor Kesehatan Cabang</h3>
                    <p className="text-[10px] font-medium text-slate-400">Kelengkapan konfigurasi operasional</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-2xl font-black ${healthColor.text}`}>{healthPct}%</span>
                  <p className={`text-[9px] font-black uppercase tracking-widest ${healthColor.text}`}>{healthScore}/{healthItems.length} kriteria</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${healthColor.bar}`}
                  style={{ width: `${healthPct}%` }}
                />
              </div>

              {/* Health checklist */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {healthItems.map((item) => (
                  <div key={item.key} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
                    item.met
                      ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                      : "bg-slate-50 border-slate-100 text-slate-400"
                  }`}>
                    {item.met
                      ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                      : <Circle       size={14} className="text-slate-300 shrink-0" />
                    }
                    {item.label}
                  </div>
                ))}
              </div>
            </GlassCard>
          </motion.div>

        </div>
      </div>

      {/* ── OWNER DETAIL MODAL ─────────────────────────────────────────────────── */}
      {ownerData && (
        <OwnerDetailModal
          isOpen={isOwnerModalOpen}
          onClose={() => setIsOwnerModalOpen(false)}
          ownerData={ownerData}
          isOwnerActive={isOwnerActive}
        />
      )}

    </div>
  );
}
