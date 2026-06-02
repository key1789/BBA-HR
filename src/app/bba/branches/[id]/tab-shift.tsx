"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useTransition, useEffect, useState } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import { Clock, Plus, Edit2, Trash2, Loader2, CalendarClock, ChevronRight, X, AlertCircle, ShieldAlert } from "lucide-react";
import { saveShiftAction, deleteShiftAction } from "./actions";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { InfoTooltip } from "@/components/shared/info-tooltip";

export function TabShift({ branchId, shifts }: { branchId: string, shifts: any[] }) {
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<any>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  useEffect(() => {
    if (editingShift) {
      setStartTime(editingShift.start_time);
      setEndTime(editingShift.end_time);
    } else {
      setStartTime("");
      setEndTime("");
    }
  }, [editingShift, isModalOpen]);

  const handleEdit = (shift: any) => {
    setEditingShift(shift);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setEditingShift(null);
    setIsModalOpen(true);
  };

  const handleDeleteConfirmed = async (shiftId: string) => {
    setIsDeleting(true);
    const fd = new FormData();
    fd.set("shiftId", shiftId);
    fd.set("tenantId", branchId);
    const res = await deleteShiftAction(fd);
    setIsDeleting(false);
    setConfirmDeleteId(null);
    if (res.success) toast.success(res.message);
    else toast.error(res.error);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    startTransition(async () => {
      const result = await saveShiftAction(null, formData);
      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        toast.success(result.message);
        setIsModalOpen(false);
        setEditingShift(null);
      }
    });
  };

  let durationText = "";
  let isOvernight = false;
  if (startTime && endTime) {
    const start = new Date(`2000-01-01T${startTime}`);
    const end = new Date(`2000-01-01T${endTime}`);
    if (end < start) {
      end.setDate(end.getDate() + 1);
      isOvernight = true;
    }
    const diffMs = end.getTime() - start.getTime();
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffMins = Math.round((diffMs % 3600000) / 60000);
    durationText = `${diffHrs} Jam ${diffMins > 0 ? diffMins + ' Menit' : ''}`;
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-1">
            Master Data Shift
            <InfoTooltip content="Shift adalah template waktu kerja. Tambahkan shift lalu gunakan untuk membuat jadwal otomatis per karyawan." side="right" width="w-72" />
          </h2>
          <p className="text-sm text-slate-500 mt-1">Kelola jam kerja operasional khusus untuk cabang ini.</p>
        </div>
        <button
          onClick={handleAddNew}
          className="flex items-center gap-2 px-6 py-3 bg-sky-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-sky-600/20 hover:bg-sky-700 transition-all hover:-translate-y-0.5 active:scale-95"
        >
          <Plus size={18} />
          Tambah Shift Baru
        </button>
      </div>

      {shifts.length === 0 ? (
        <GlassCard variant="light" className="flex flex-col items-center justify-center p-20 text-center border-dashed border-2 border-slate-200">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-4">
            <Clock size={32} />
          </div>
          <h3 className="text-slate-800 font-bold">Belum ada data shift</h3>
          <p className="text-slate-500 text-sm mt-1 max-w-xs">Mulai tambahkan shift operasional (Pagi, Siang, Malam) untuk memudahkan pengaturan jadwal.</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {shifts.map((shift) => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              key={shift.id}
            >
              <GlassCard variant="light" className="p-0 overflow-hidden group hover:shadow-2xl hover:shadow-sky-500/10 transition-all duration-500 border-slate-200/60 flex flex-col bg-white">
                <div className="p-5 flex-1">
                  <div className="flex justify-between items-start mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shadow-sm group-hover:scale-110 group-hover:bg-sky-600 group-hover:text-white transition-all duration-500">
                      <Clock size={24} />
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                      <button
                        onClick={() => handleEdit(shift)}
                        className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-xl transition-all"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(shift.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <h4 className="font-black text-slate-800 uppercase tracking-tight text-lg mb-4">{shift.shift_name}</h4>
                  
                  <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner">
                    <div className="flex-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Mulai</p>
                      <p className="text-lg font-black text-slate-700 leading-none">{shift.start_time.slice(0, 5)}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white border border-slate-100 flex items-center justify-center text-slate-300">
                      <ChevronRight size={16} />
                    </div>
                    <div className="flex-1 text-right">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Selesai</p>
                      <p className="text-lg font-black text-slate-700 leading-none">{shift.end_time.slice(0, 5)}</p>
                    </div>
                  </div>

                  {(() => {
                    const s = new Date(`2000-01-01T${shift.start_time}`);
                    const e = new Date(`2000-01-01T${shift.end_time}`);
                    if (e < s) {
                      return (
                        <div className="mt-4 px-3 py-1.5 bg-amber-50 rounded-xl inline-flex items-center gap-2 border border-amber-100 animate-pulse">
                          <AlertCircle size={14} className="text-amber-600" />
                          <span className="text-[10px] font-black text-amber-600 uppercase tracking-tight">Shift Lintas Hari</span>
                        </div>
                      )
                    }
                    return (
                       <div className="mt-4 px-3 py-1.5 bg-sky-50 rounded-xl inline-flex items-center gap-2 border border-sky-100">
                          <CalendarClock size={14} className="text-sky-600" />
                          <span className="text-[10px] font-black text-sky-600 uppercase tracking-tight">Satu Hari Kalender</span>
                        </div>
                    );
                  })()}
                </div>
                
              </GlassCard>
            </motion.div>
          ))}
        </div>

      )}

      {/* CONFIRM DELETE MODAL */}
      <AnimatePresence>
        {confirmDeleteId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isDeleting && setConfirmDeleteId(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
            >
              <div className="p-6 flex flex-col items-center text-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center">
                  <ShieldAlert size={28} className="text-rose-600" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-base flex items-center gap-1">
                    Hapus Shift Ini?
                    <InfoTooltip content="Menghapus shift tidak menghapus jadwal historis yang sudah dibuat. Shift yang aktif dipakai di jadwal bulan ini sebaiknya tidak dihapus." side="right" width="w-72" />
                  </h3>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                    Shift yang masih dipakai di jadwal ke depan tidak bisa dihapus.
                    Shift dengan riwayat lama (sudah lewat) boleh dihapus.
                  </p>
                </div>
                <div className="flex gap-3 w-full pt-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    disabled={isDeleting}
                    className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteConfirmed(confirmDeleteId)}
                    disabled={isDeleting}
                    className="flex-1 px-4 py-2.5 rounded-xl font-black text-sm text-white bg-rose-600 hover:bg-rose-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Hapus
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL FORM */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isPending && setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md"
            >
              <GlassCard className="p-0 overflow-hidden shadow-2xl border-none">
                <div className="p-6 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                    <Clock size={18} className="text-sky-600" />
                    {editingShift ? "Edit Data Shift" : "Tambah Shift Baru"}
                  </h3>
                  <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                  <input type="hidden" name="tenantId" value={branchId} />
                  {editingShift && <input type="hidden" name="shiftId" value={editingShift.id} />}
                  
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      Nama Shift
                      <InfoTooltip content="Nama identifikasi shift, contoh: Shift Pagi, Shift Malam." side="right" width="w-56" />
                    </label>
                    <input 
                      name="shiftName"
                      defaultValue={editingShift?.shift_name}
                      required
                      placeholder="Contoh: Pagi, Siang, atau Malam"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500/20 transition-all font-bold text-slate-800 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        Jam Mulai
                        <InfoTooltip content="Format 24 jam. Contoh: 08:00 untuk pukul 8 pagi." side="right" width="w-56" />
                      </label>
                      <input 
                        type="time"
                        name="startTime"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        required
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500/20 transition-all font-bold text-slate-800 outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        Jam Selesai
                        <InfoTooltip content="Format 24 jam. Jika melewati tengah malam, sistem mendeteksi otomatis." side="right" width="w-56" />
                      </label>
                      <input 
                        type="time"
                        name="endTime"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        required
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-sky-500/20 transition-all font-bold text-slate-800 outline-none"
                      />
                    </div>
                  </div>

                  {startTime && endTime && (
                    <div className={`p-3 rounded-xl border flex gap-3 ${isOvernight ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-100 text-emerald-800'}`}>
                      <div className="mt-0.5">
                        {isOvernight ? <AlertCircle size={18} className="shrink-0" /> : <Clock size={18} className="shrink-0" />}
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-tight">Durasi Shift: {durationText}</p>
                        {isOvernight && (
                          <p className="text-[10px] mt-1 leading-relaxed opacity-90">
                            <b>Perhatian:</b> Shift ini terdeteksi sebagai <b>Lintas Hari</b> (melewati tengah malam). Sistem akan memprosesnya ke tanggal keesokan harinya secara otomatis.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-sm hover:bg-slate-200 transition-all"
                    >
                      Batal
                    </button>
                    <button 
                      type="submit"
                      disabled={isPending}
                      className="flex-[2] px-6 py-3 bg-sky-600 text-white rounded-xl font-black text-sm shadow-lg shadow-sky-600/20 hover:bg-sky-700 transition-all flex items-center justify-center gap-2"
                    >
                      {isPending ? <Loader2 size={18} className="animate-spin" /> : "Simpan Shift"}
                    </button>
                  </div>
                </form>
              </GlassCard>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
