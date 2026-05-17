import { getSessionContext } from "@/lib/auth-context";
import { recordReminderDispatch } from "@/lib/reminder-dispatch-log";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@/lib/supabase/server";
import { AnimatedPage } from "@/components/shared/animated-page";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { 
  Zap, PenTool, Clock, 
  CheckCircle2, Trophy, 
  History, Building2, ArrowRight, Megaphone
} from "lucide-react";

export default async function CrewDashboardPage() {
  const session = await getSessionContext();
  const active = session?.activeMembership;

  if (!active || (active.role !== "crew" && active.role !== "admin_apotek")) {
    return (
      <AnimatedPage className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center text-slate-400 mb-6">
             <Zap size={40} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 uppercase">Crew Dashboard</h1>
          <p className="text-slate-500 mt-2">Halaman ini hanya dapat diakses oleh Crew atau Admin Apotek.</p>
      </AnimatedPage>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const reminderWindow = getOperationalReminderWindow();
  const today = reminderWindow.dateKey;
  const [todayCount, personalPending, personalApproved] = await Promise.all([
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("user_id", user?.id ?? "")
      .eq("submission_date", today),
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("user_id", user?.id ?? "")
      .in("status", ["draft", "submitted", "edited_by_admin"]),
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("user_id", user?.id ?? "")
      .eq("status", "approved"),
  ]);

  const numberFormatter = new Intl.NumberFormat("id-ID");
  const reminders: { tone: "amber" | "sky"; text: string; href: string; cta: string; icon: any }[] = [];
  
  if ((todayCount.count ?? 0) === 0) {
    reminders.push({
      tone: "amber",
      text: "Belum ada input hari ini. Pastikan laporan masuk sebelum cut-off.",
      href: "/crew/input-harian",
      cta: "Input Sekarang",
      icon: PenTool
    });
  }
  
  if ((personalPending.count ?? 0) > 0) {
    reminders.push({
      tone: "amber",
      text: `Ada ${numberFormatter.format(personalPending.count ?? 0)} laporan menunggu verifikasi.`,
      href: "/crew/riwayat-input",
      cta: "Cek Status",
      icon: Clock
    });
  }
  
  if (reminders.length === 0) {
    reminders.push({
      tone: "sky",
      text: "Semua indikator operasional aman. Kerja bagus, tim!",
      href: "/crew/leaderboard",
      cta: "Lihat Skor",
      icon: Trophy
    });
  }

  const reminderWrites: Promise<unknown>[] = [];
  if ((todayCount.count ?? 0) === 0) {
    reminderWrites.push(
      recordReminderDispatch(supabase, {
        tenantApotekId: active.tenantId,
        actorUserId: user?.id ?? null,
        reminderDate: reminderWindow.dateKey,
        phase: reminderWindow.phase,
        scope: "crew_dashboard",
        reasonCode: "missing_submission",
        payload: { pendingCount: personalPending.count ?? 0 },
      }),
    );
  }
  if ((personalPending.count ?? 0) > 0) {
    reminderWrites.push(
      recordReminderDispatch(supabase, {
        tenantApotekId: active.tenantId,
        actorUserId: user?.id ?? null,
        reminderDate: reminderWindow.dateKey,
        phase: reminderWindow.phase,
        scope: "crew_dashboard",
        reasonCode: "pending_submission",
        payload: { pendingCount: personalPending.count ?? 0 },
      }),
    );
  }
  if (reminderWrites.length > 0) {
    await Promise.allSettled(reminderWrites);
  }

  return (
    <AnimatedPage className="space-y-8 pb-10">
      {/* Header Section */}
      {/* Header Section (Floating Card) */}
      <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-20">
         <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-sky-50 text-sky-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-3 border border-sky-100">
               <Zap size={12} /> Crew Portal
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight uppercase leading-none">Dashboard <span className="text-sky-600 block md:inline mt-1 md:mt-0">Operasional</span></h1>
            <p className="text-slate-500 text-sm mt-2 font-medium">Monitoring aktivitas dan performa kerja harian Anda.</p>
         </div>
         
         <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100 self-start md:self-auto">
            <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center text-sky-600">
               <Building2 size={24} />
            </div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cabang Aktif</p>
               <p className="text-sm font-bold text-slate-800 uppercase">{active.tenantName}</p>
            </div>
         </div>
      </div>

      {/* Reminders List */}
      <div className="grid gap-4">
        {reminders.map((reminder) => (
          <div
            key={reminder.text}
            className={cn(
              "relative overflow-hidden rounded-3xl p-5 border flex flex-col md:flex-row md:items-center gap-4 transition-all shadow-sm",
              reminder.tone === "amber" ? "bg-amber-50/50 border-amber-100" : "bg-sky-50/50 border-sky-100"
            )}
          >
             <div className={cn(
               "w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm",
               reminder.tone === "amber" ? "bg-amber-100 text-amber-600" : "bg-sky-100 text-sky-600"
             )}>
                <reminder.icon size={20} />
             </div>
             <p className="flex-1 text-sm font-bold text-slate-700">{reminder.text}</p>
             <Link
               href={reminder.href}
               className={cn(
                 "inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all",
                 reminder.tone === "amber" ? "bg-amber-600 text-white shadow-lg shadow-amber-200" : "bg-sky-600 text-white shadow-lg shadow-sky-200"
               )}
             >
               {reminder.cta} <ArrowRight size={14} />
             </Link>
          </div>
        ))}
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm group hover:border-sky-200 hover:shadow-md transition-all cursor-pointer">
          <div className="flex justify-between items-start mb-4">
             <div className="w-10 h-10 rounded-2xl bg-sky-50 flex items-center justify-center text-sky-600 group-hover:bg-sky-600 group-hover:text-white transition-all shadow-sm">
                <PenTool size={20} />
             </div>
             <span className="text-[10px] font-black text-sky-600 bg-sky-50 px-2 py-1 rounded-full uppercase">Today</span>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">Input<br/>Hari Ini</p>
          <p className="mt-1 text-3xl font-black text-slate-900 tracking-tight">
            {numberFormatter.format(todayCount.count ?? 0)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm group hover:border-amber-200 hover:shadow-md transition-all cursor-pointer">
          <div className="flex justify-between items-start mb-4">
             <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-all shadow-sm">
                <Clock size={20} />
             </div>
             <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-full uppercase">Pending</span>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">Menunggu<br/>Verifikasi</p>
          <p className="mt-1 text-3xl font-black text-slate-900 tracking-tight">
            {numberFormatter.format(personalPending.count ?? 0)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm group hover:border-lime-200 hover:shadow-md transition-all cursor-pointer col-span-2 md:col-span-1">
          <div className="flex justify-between items-start mb-4">
             <div className="w-10 h-10 rounded-2xl bg-lime-50 flex items-center justify-center text-lime-600 group-hover:bg-lime-600 group-hover:text-white transition-all shadow-sm">
                <CheckCircle2 size={20} />
             </div>
             <span className="text-[10px] font-black text-lime-600 bg-lime-50 px-2 py-1 rounded-full uppercase">Done</span>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">Disetujui<br/>(Bulan Ini)</p>
          <p className="mt-1 text-3xl font-black text-slate-900 tracking-tight">
            {numberFormatter.format(personalApproved.count ?? 0)}
          </p>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      {/* Square Navigation Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        <Link href="/crew/input-harian" className="group block">
           <div className="bg-white border border-slate-200 rounded-3xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-amber-200 hover:shadow-md transition-all aspect-square relative overflow-hidden">
              <div className="absolute inset-0 bg-amber-50/30 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-all shadow-sm mb-3 relative z-10">
                 <PenTool size={28} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 relative z-10">Tugas</p>
              <p className="text-sm font-black text-slate-800 uppercase relative z-10 leading-tight mt-0.5">Input<br/>Harian</p>
           </div>
        </Link>

        <Link href="/crew/riwayat-input" className="group block">
           <div className="bg-white border border-slate-200 rounded-3xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-sky-200 hover:shadow-md transition-all aspect-square relative overflow-hidden">
              <div className="absolute inset-0 bg-sky-50/30 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="w-14 h-14 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center group-hover:bg-sky-600 group-hover:text-white transition-all shadow-sm mb-3 relative z-10">
                 <History size={28} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 relative z-10">Arsip</p>
              <p className="text-sm font-black text-slate-800 uppercase relative z-10 leading-tight mt-0.5">Riwayat<br/>Input</p>
           </div>
        </Link>

        <Link href="/crew/leaderboard" className="group block">
           <div className="bg-white border border-slate-200 rounded-3xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-lime-200 hover:shadow-md transition-all aspect-square relative overflow-hidden">
              <div className="absolute inset-0 bg-lime-50/30 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="w-14 h-14 rounded-2xl bg-lime-100 text-lime-600 flex items-center justify-center group-hover:bg-lime-600 group-hover:text-white transition-all shadow-sm mb-3 relative z-10">
                 <Trophy size={28} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 relative z-10">Peringkat</p>
              <p className="text-sm font-black text-slate-800 uppercase relative z-10 leading-tight mt-0.5">Leader<br/>board</p>
           </div>
        </Link>

        <Link href="/crew/pengumuman" className="group block">
           <div className="bg-white border border-slate-200 rounded-3xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-rose-200 hover:shadow-md transition-all aspect-square relative overflow-hidden">
              <div className="absolute inset-0 bg-rose-50/30 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition-all shadow-sm mb-3 relative z-10">
                 <Megaphone size={28} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 relative z-10">Info</p>
              <p className="text-sm font-black text-slate-800 uppercase relative z-10 leading-tight mt-0.5">Pusat<br/>Pengumuman</p>
           </div>
        </Link>
      </div>
    </AnimatedPage>
  );
}
