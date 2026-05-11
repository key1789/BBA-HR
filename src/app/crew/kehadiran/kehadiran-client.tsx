"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { Button } from "@/components/shared/button";
import { Input } from "@/components/shared/input";
import { Camera, FileText, ArrowLeftRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { clockInAction, requestLeaveAction, requestShiftSwapAction } from "@/actions/attendance";
import { toast } from "sonner";

type Props = {
  metrics: { hariKerja: number; terlambat: number; izin: number };
  attendances: any[];
  leaves: any[];
  swaps: any[];
  crewList: any[];
  schedules: any[];
  swapCandidateUserIdsByDate: Record<string, string[]>;
  tenantId: string;
  userId: string;
};

export function KehadiranClient({ metrics, attendances, leaves, swaps, crewList, schedules, swapCandidateUserIdsByDate }: Props) {
  const [activeTab, setActiveTab] = useState<"kalender" | "log" | "pengajuan">("kalender");
  
  // Modal States
  const [showAbsenModal, setShowAbsenModal] = useState(false);
  const [showIzinModal, setShowIzinModal] = useState(false);
  const [showTukarModal, setShowTukarModal] = useState(false);
  const [selectedRequesterScheduleId, setSelectedRequesterScheduleId] = useState("");

  // Camera State for Absen
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);

  // Photo State for Leave Attachment
  const [leavePhotoData, setLeavePhotoData] = useState<string | null>(null);
  const [isCompressingLeave, setIsCompressingLeave] = useState(false);

  // Handle Photo Capture & Compression
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        // Target max width 800px
        const MAX_WIDTH = 800;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;

        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Compress to JPEG 0.7 quality
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        setPhotoData(dataUrl);
        setIsCompressing(false);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const clearPhoto = () => setPhotoData(null);

  const handleLeavePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressingLeave(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 1200; // allow slightly larger for documents
        let scaleSize = 1;
        if (img.width > MAX_WIDTH) {
           scaleSize = MAX_WIDTH / img.width;
        }
        canvas.width = img.width * scaleSize;
        canvas.height = img.height * scaleSize;

        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        setLeavePhotoData(dataUrl);
        setIsCompressingLeave(false);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const clearLeavePhoto = () => setLeavePhotoData(null);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved": return <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md text-[10px] font-black uppercase">Disetujui</span>;
      case "rejected": return <span className="bg-red-100 text-red-700 px-2 py-1 rounded-md text-[10px] font-black uppercase">Ditolak</span>;
      default: return <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-md text-[10px] font-black uppercase">Menunggu</span>;
    }
  };

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1).getDay();
  const scheduleByDate = new Map<string, any>(
    (schedules || []).map((s: any) => [String(s.schedule_date).slice(0, 10), s]),
  );
  const monthName = new Date(currentYear, currentMonth - 1, 1).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
  const selectedRequesterSchedule = schedules.find((s: any) => s.id === selectedRequesterScheduleId);
  const selectedRequesterDate = selectedRequesterSchedule?.schedule_date
    ? String(selectedRequesterSchedule.schedule_date).slice(0, 10)
    : "";
  const eligibleTargetIds = new Set(
    selectedRequesterDate ? (swapCandidateUserIdsByDate[selectedRequesterDate] ?? []) : [],
  );
  const availableSwapTargets = selectedRequesterDate
    ? crewList.filter((c: any) => eligibleTargetIds.has(c.id))
    : crewList;

  return (
    <div className="w-full space-y-6">
      {/* 1. HEADER METRICS */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-sky-500 to-sky-600 rounded-3xl p-5 text-white shadow-[0_8px_20px_-6px_rgba(2,132,199,0.5)] flex flex-col items-center justify-center text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-sky-100 mb-1">Hari Kerja</p>
          <p className="text-3xl font-black">{metrics.hariKerja}</p>
        </div>
        <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex flex-col items-center justify-center text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Terlambat</p>
          <p className="text-3xl font-black text-amber-500">{metrics.terlambat}</p>
        </div>
        <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex flex-col items-center justify-center text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Total Izin</p>
          <p className="text-3xl font-black text-slate-700">{metrics.izin}</p>
        </div>
      </div>

      {/* 2. QUICK ACTIONS */}
      <div className="grid grid-cols-3 gap-3">
        <button 
          onClick={() => setShowAbsenModal(true)}
          className="bg-white border border-slate-200/60 rounded-[2rem] p-4 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 hover:border-sky-200 hover:shadow-md transition-all group"
        >
          <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Camera size={24} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 mt-1">Absen Foto</span>
        </button>

        <button 
          onClick={() => setShowIzinModal(true)}
          className="bg-white border border-slate-200/60 rounded-[2rem] p-4 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 hover:border-amber-200 hover:shadow-md transition-all group"
        >
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
            <FileText size={24} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 mt-1">Pengajuan Izin</span>
        </button>

        <button 
          onClick={() => setShowTukarModal(true)}
          className="bg-white border border-slate-200/60 rounded-[2rem] p-4 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 hover:border-emerald-200 hover:shadow-md transition-all group"
        >
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
            <ArrowLeftRight size={24} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 mt-1">Tukar Shift</span>
        </button>
      </div>

      {/* 3. TABS NAVIGATION */}
      <div className="flex bg-slate-200/50 p-1 rounded-2xl shadow-inner mt-4">
        <button onClick={() => setActiveTab("kalender")} className={cn("flex-1 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all", activeTab === "kalender" ? "bg-white text-sky-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}>📅 Kalender</button>
        <button onClick={() => setActiveTab("log")} className={cn("flex-1 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all", activeTab === "log" ? "bg-white text-sky-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}>🕒 Log Absen</button>
        <button onClick={() => setActiveTab("pengajuan")} className={cn("flex-1 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all", activeTab === "pengajuan" ? "bg-white text-sky-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}>📝 Pengajuan</button>
      </div>

      {/* TABS CONTENT */}
      <div className="mt-4">
        {activeTab === "kalender" && (
          <div className="bg-white rounded-3xl p-6 border border-slate-200/60 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-slate-800">Kalender Shift</h3>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{monthName}</span>
            </div>
            {schedules.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">Belum ada jadwal untuk akun ini pada bulan berjalan.</p>
            ) : null}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase text-slate-400 mb-2">
              <div>Min</div><div>Sen</div><div>Sel</div><div>Rab</div><div>Kam</div><div>Jum</div><div>Sab</div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                <div key={`empty-${i}`} className="h-16 rounded-lg bg-slate-50/50 border border-slate-100" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const sch = scheduleByDate.get(dateKey);
                const label = sch ? (sch.is_off ? "OFF" : sch.shift_name ?? "-") : "-";
                return (
                  <div key={dateKey} className="h-16 rounded-lg border border-slate-100 bg-slate-50 p-1 flex flex-col justify-between">
                    <span className="text-[10px] font-black text-slate-700">{day}</span>
                    <span className={cn(
                      "text-[9px] font-black uppercase truncate",
                      sch ? (sch.is_off ? "text-rose-600" : "text-sky-700") : "text-slate-300",
                    )}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "log" && (
          <div className="space-y-3">
             {attendances.length === 0 && <div className="text-center p-6 text-slate-400 font-bold text-sm bg-white rounded-3xl border border-slate-200/60">Belum ada data absen</div>}
             {attendances.map(log => (
               <div key={log.id} className="bg-white rounded-3xl p-4 border border-slate-200/60 shadow-sm flex items-center gap-4">
                 <div className="w-16 h-16 rounded-2xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                   {/* eslint-disable-next-line @next/next/no-img-element */}
                   <img src={log.photo_url} alt="Absen" className="w-full h-full object-cover" />
                 </div>
                 <div className="flex-1">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{new Date(log.clock_in_time).toLocaleDateString('id-ID')}</p>
                   <p className="font-black text-slate-800">{new Date(log.clock_in_time).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})} WIB</p>
                   {log.is_late && <span className="inline-block mt-1 bg-red-100 text-red-600 px-2 py-0.5 rounded-md text-[9px] font-black uppercase">Terlambat</span>}
                 </div>
               </div>
             ))}
          </div>
        )}

        {activeTab === "pengajuan" && (
          <div className="space-y-4">
             <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest px-2">Riwayat Izin & Tukar Shift</h3>
             {[...leaves, ...swaps].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((req, i) => (
               <div key={i} className="bg-white rounded-3xl p-4 border border-slate-200/60 shadow-sm">
                 <div className="flex justify-between items-start mb-2">
                   <p className="font-black text-sm text-slate-800">{req.leave_type ? `Izin: ${req.leave_type.replace('_',' ')}` : `Tukar Shift`}</p>
                   {getStatusBadge(req.status)}
                 </div>
                 <p className="text-xs text-slate-500 font-medium line-clamp-2">{req.reason}</p>
                 <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest mt-3">{new Date(req.created_at).toLocaleDateString('id-ID')}</p>
               </div>
             ))}
          </div>
        )}
      </div>

      {/* ========================================= */}
      {/* MODAL ABSEN */}
      {/* ========================================= */}
      {showAbsenModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300 p-3 sm:p-4 overflow-y-auto flex items-end md:items-center justify-center">
          <div className="bg-white w-full max-w-2xl rounded-[2rem] animate-in slide-in-from-bottom-10 duration-300 shadow-2xl max-h-[calc(100vh-1.5rem)] md:max-h-[calc(100vh-3rem)] overflow-hidden">
            <div className="p-6 pb-4 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-black text-slate-800 text-lg tracking-tight">Absen Masuk</h2>
              <button onClick={() => setShowAbsenModal(false)} className="w-8 h-8 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center"><X size={18}/></button>
            </div>
            <div className="p-6 pb-24 md:pb-6 overflow-y-auto max-h-[calc(100vh-7rem)] md:max-h-[calc(100vh-10rem)]">

            <form action={async (formData) => {
              if (photoData) {
                formData.append("photoBase64", photoData);
              }
              const res = await clockInAction(formData);
              if (res?.error) {
                toast.error(res.error);
                return;
              }
              toast.success("Absen berhasil direkam.");
              setShowAbsenModal(false);
              setPhotoData(null);
            }}>
              <div className="space-y-5">
                {/* Kamera Section */}
                <div className="relative w-full aspect-square bg-slate-100 rounded-3xl overflow-hidden border-2 border-dashed border-slate-300 flex flex-col items-center justify-center">
                  {isCompressing ? (
                    <p className="text-slate-500 font-bold text-sm animate-pulse">Memproses foto...</p>
                  ) : photoData ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoData} alt="Preview" className="w-full h-full object-cover" />
                      <button type="button" onClick={clearPhoto} className="absolute top-4 right-4 bg-white/80 backdrop-blur-md p-2 rounded-full text-slate-700 shadow-sm"><X size={16}/></button>
                    </>
                  ) : (
                    <>
                      <Camera size={40} className="text-slate-400 mb-3" />
                      <p className="text-sm font-bold text-slate-500">Ambil Foto Selfie</p>
                      <input 
                        type="file" 
                        accept="image/*" 
                        capture="user" 
                        required
                        onChange={handlePhotoCapture}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </>
                  )}
                </div>
                
                <p className="text-[10px] text-slate-500 font-medium text-center px-4">Pastikan wajah terlihat jelas dan berada di lokasi apotek. Absen akan mencatat jam otomatis sesuai waktu server.</p>

                <Button 
                  type="submit" 
                  disabled={!photoData || isCompressing}
                  className="w-full py-4 rounded-full bg-gradient-to-r from-sky-500 to-sky-600 text-white font-black uppercase tracking-widest text-sm shadow-[0_8px_20px_-6px_rgba(2,132,199,0.5)] active:scale-95 transition-all"
                >
                  Submit Kehadiran
                </Button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* ========================================= */}
      {/* MODAL IZIN */}
      {/* ========================================= */}
      {showIzinModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300 p-3 sm:p-4 overflow-y-auto flex items-end md:items-center justify-center">
          <div className="bg-white w-full max-w-2xl rounded-[2rem] animate-in slide-in-from-bottom-10 duration-300 shadow-2xl max-h-[calc(100vh-1.5rem)] md:max-h-[calc(100vh-3rem)] overflow-hidden">
            <div className="p-6 pb-4 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-black text-slate-800 text-lg tracking-tight">Pengajuan Izin</h2>
              <button onClick={() => setShowIzinModal(false)} className="w-8 h-8 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center"><X size={18}/></button>
            </div>
            <div className="p-6 pb-24 md:pb-6 overflow-y-auto max-h-[calc(100vh-7rem)] md:max-h-[calc(100vh-10rem)]">
            <form action={async (formData) => {
               if (leavePhotoData) {
                 formData.append("photoBase64", leavePhotoData);
               }
               const res = await requestLeaveAction(formData);
               if (res?.error) {
                 toast.error(res.error);
                 return;
               }
               toast.success(res?.message || "Pengajuan izin berhasil dikirim.");
               setShowIzinModal(false);
               setLeavePhotoData(null);
            }} className="space-y-4">
               <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                 Jenis Izin
                 <select name="leaveType" required className="mt-2 w-full appearance-none rounded-2xl border border-slate-200/60 px-4 py-3.5 text-sm font-black text-slate-800 bg-slate-50 focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all outline-none">
                   <option value="sakit">Sakit</option>
                   <option value="cuti_tahunan">Cuti Tahunan</option>
                   <option value="izin_lainnya">Keperluan Lainnya</option>
                 </select>
               </label>
               <div className="grid grid-cols-2 gap-3">
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                   Mulai
                   <Input type="date" name="startDate" required className="mt-2 rounded-2xl bg-slate-50 border-slate-200/60 px-4 py-3.5 text-sm font-bold w-full focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20" />
                 </label>
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                   Selesai
                   <Input type="date" name="endDate" required className="mt-2 rounded-2xl bg-slate-50 border-slate-200/60 px-4 py-3.5 text-sm font-bold w-full focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20" />
                 </label>
               </div>
               <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                 Alasan Lengkap
                 <textarea name="reason" required className="mt-2 w-full rounded-2xl border border-slate-200/60 px-4 py-3 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all resize-none h-20" />
               </label>
               
               <div className="block pt-2">
                 <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Lampiran Bukti (Surat Dokter / Dokumen)</span>
                 <div className="relative w-full h-32 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center overflow-hidden">
                   {isCompressingLeave ? (
                     <p className="text-slate-500 font-bold text-sm animate-pulse">Memproses file...</p>
                   ) : leavePhotoData ? (
                     <>
                       {/* eslint-disable-next-line @next/next/no-img-element */}
                       <img src={leavePhotoData} alt="Preview Bukti" className="w-full h-full object-cover" />
                       <button type="button" onClick={clearLeavePhoto} className="absolute top-2 right-2 bg-white/80 backdrop-blur-md p-1.5 rounded-full text-slate-700 shadow-sm"><X size={14}/></button>
                     </>
                   ) : (
                     <>
                       <Camera size={24} className="text-slate-400 mb-2" />
                       <p className="text-xs font-bold text-slate-500">Ambil Foto / Pilih File</p>
                       <input 
                         type="file" 
                         accept="image/*" 
                         onChange={handleLeavePhotoCapture}
                         className="absolute inset-0 opacity-0 cursor-pointer"
                       />
                     </>
                   )}
                 </div>
                 <p className="text-[9px] text-slate-400 mt-2 font-medium">Opsional, namun sangat disarankan untuk pengajuan cuti sakit.</p>
               </div>

               <Button type="submit" disabled={isCompressingLeave} className="w-full mt-4 py-4 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black uppercase tracking-widest text-sm shadow-[0_8px_20px_-6px_rgba(245,158,11,0.5)] active:scale-95 transition-all">Kirim Pengajuan</Button>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* ========================================= */}
      {/* MODAL TUKAR SHIFT */}
      {/* ========================================= */}
      {showTukarModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300 p-3 sm:p-4 overflow-y-auto flex items-end md:items-center justify-center">
          <div className="bg-white w-full max-w-2xl rounded-[2rem] animate-in slide-in-from-bottom-10 duration-300 shadow-2xl max-h-[calc(100vh-1.5rem)] md:max-h-[calc(100vh-3rem)] overflow-hidden">
            <div className="p-6 pb-4 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-black text-slate-800 text-lg tracking-tight">Tukar Shift</h2>
              <button onClick={() => setShowTukarModal(false)} className="w-8 h-8 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center"><X size={18}/></button>
            </div>
            <div className="p-6 pb-24 md:pb-6 overflow-y-auto max-h-[calc(100vh-7rem)] md:max-h-[calc(100vh-10rem)]">
            <form action={async (formData) => {
               const res = await requestShiftSwapAction(formData);
               if (res?.error) {
                 toast.error(res.error);
                 return;
               }
               toast.success(res?.message || "Pengajuan tukar shift berhasil dikirim.");
               setShowTukarModal(false);
               setSelectedRequesterScheduleId("");
            }} className="space-y-4">
               <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                 Jadwal Saya (Yang Ingin Ditukar)
                 <select
                   name="requesterScheduleId"
                   required
                   value={selectedRequesterScheduleId}
                   onChange={(e) => setSelectedRequesterScheduleId(e.target.value)}
                   className="mt-2 w-full appearance-none rounded-2xl border border-slate-200/60 px-4 py-3 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 transition-all outline-none"
                 >
                   <option value="">-- Pilih Jadwal Anda --</option>
                   {schedules.map((s:any) => (
                     <option key={s.id} value={s.id}>{new Date(s.schedule_date).toLocaleDateString('id-ID')} - {s.is_off ? 'OFF' : s.shift_name}</option>
                   ))}
                 </select>
               </label>
               <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                 Tukar Dengan Siapa?
                 <select name="targetUserId" required className="mt-2 w-full appearance-none rounded-2xl border border-slate-200/60 px-4 py-3 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 transition-all outline-none">
                   <option value="">-- Pilih Kru --</option>
                   {availableSwapTargets.map((c:any) => (
                     <option key={c.id} value={c.id}>{c.name}</option>
                   ))}
                 </select>
               </label>
               {selectedRequesterDate && availableSwapTargets.length === 0 ? (
                 <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                   Tidak ada kru lain yang punya jadwal pada tanggal ini.
                 </p>
               ) : null}
               <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                 Alasan Tukar
                 <textarea name="reason" required className="mt-2 w-full rounded-2xl border border-slate-200/60 px-4 py-3 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 transition-all resize-none h-20" />
               </label>
               
               <Button type="submit" className="w-full mt-4 py-4 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black uppercase tracking-widest text-sm shadow-[0_8px_20px_-6px_rgba(16,185,129,0.5)] active:scale-95 transition-all">Ajukan Tukar</Button>
            </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
