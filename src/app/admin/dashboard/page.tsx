import { getSessionContext } from "@/lib/auth-context";
import { recordReminderDispatch } from "@/lib/reminder-dispatch-log";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/shared/glass-card";
import { AnimatedPage } from "@/components/shared/animated-page";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { 
  ShieldCheck, ClipboardCheck, CheckCircle2,
  AlertCircle, BarChart3,
  MessageSquareHeart, Clock, Activity,
  ArrowRight, PenTool
} from "lucide-react";

export default async function AdminDashboardPage() {
  const session = await getSessionContext();
  const active = session?.activeMembership;

  if (!active || active.role !== "admin_apotek") {
    return (
      <AnimatedPage className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center text-slate-400 mb-6">
             <ShieldCheck size={40} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 uppercase">Admin Dashboard</h1>
          <p className="text-slate-500 mt-2">Halaman ini hanya dapat diakses oleh Admin Apotek.</p>
      </AnimatedPage>
    );
  }

  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    queueCount,
    approvedCount,
    needsFollowupCount,
    draftCount,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .in("status", ["submitted", "edited_by_admin"]),
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("status", "approved"),
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("status", "reject"),
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("status", "draft"),
  ]);
  
  const numberFormatter = new Intl.NumberFormat("id-ID");
  const reminderWindow = getOperationalReminderWindow();
  const queueValue = queueCount.count ?? 0;
  const followupValue = needsFollowupCount.count ?? 0;
  const draftValue = draftCount.count ?? 0;
  
  const reminder =
    queueValue > 0 || followupValue > 0
      ? {
          tone: "amber" as const,
          title:
            reminderWindow.phase === "post_cutoff"
              ? "Cut-off Terlewati"
              : reminderWindow.phase === "near_cutoff"
                ? "Mendekati Cut-off"
                : "Perlu Verifikasi",
          text: `Terdapat ${numberFormatter.format(queueValue)} antrean verifikasi dan ${numberFormatter.format(followupValue)} item reject yang perlu tindak lanjut.`,
          icon: <Clock size={16} className="text-amber-600" />
        }
      : {
          tone: "emerald" as const,
          title: "Status Terkendali",
          text: "Antrean verifikasi saat ini terkendali. Kerja bagus!",
          icon: <CheckCircle2 size={16} className="text-emerald-600" />
        };

  if (queueValue > 0 || followupValue > 0) {
    try {
      await recordReminderDispatch(supabase, {
        tenantApotekId: active.tenantId,
        actorUserId: user?.id ?? null,
        reminderDate: reminderWindow.dateKey,
        phase: reminderWindow.phase,
        scope: "admin_dashboard",
        reasonCode: "verification_backlog",
        payload: { queueCount: queueValue, followupCount: followupValue, draftCount: draftValue },
      });
    } catch {
      // Non-critical: reminder dispatch failure must not break the dashboard
    }
  }

  return (
    <AnimatedPage className="space-y-8 pb-10">
      <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-20">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-3 border border-indigo-100">
            <ShieldCheck size={12} /> Admin Portal
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight uppercase leading-none">
            Dashboard <span className="text-indigo-600 block md:inline mt-1 md:mt-0">Cabang</span>
          </h1>
          <p className="text-slate-500 text-sm mt-2 font-medium">
            Monitoring verifikasi dan kualitas data untuk <span className="text-indigo-600 font-bold">{active.tenantCode}</span>.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100 self-start md:self-auto">
          <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center text-indigo-600">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SLA Status</p>
            <p className="text-sm font-bold text-slate-800 uppercase">{reminderWindow.phase.replace("_", " ")}</p>
          </div>
        </div>
      </div>

      <div className={cn(
        "relative overflow-hidden rounded-3xl p-6 border flex flex-col md:flex-row md:items-center gap-4 transition-all shadow-sm",
        reminder.tone === "amber" ? "bg-amber-50/50 border-amber-100" : "bg-emerald-50/50 border-emerald-100"
      )}>
         <div className={cn(
           "w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm",
           reminder.tone === "amber" ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"
         )}>
            {reminder.icon}
         </div>
         <div className="flex-1">
            <p className={cn("text-xs font-black uppercase tracking-widest mb-1", 
               reminder.tone === "amber" ? "text-amber-700" : "text-emerald-700")}>
               {reminder.title}
            </p>
            <p className="text-sm font-medium text-slate-600">{reminder.text}</p>
         </div>
         <Link 
            href="/admin/verifikasi"
            className={cn(
               "inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all",
               reminder.tone === "amber" ? "bg-amber-600 text-white shadow-lg shadow-amber-200" : "bg-emerald-600 text-white shadow-lg shadow-emerald-200"
            )}
         >
            Selesaikan Queue <ArrowRight size={14} />
         </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <GlassCard interactive className="group">
          <div className="flex justify-between items-start mb-4">
             <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                <ClipboardCheck size={20} />
             </div>
             <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full uppercase">Queue</span>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Antrean Verifikasi</p>
          <p className="mt-1 text-3xl font-black text-slate-900 tracking-tight">
            {numberFormatter.format(queueCount.count ?? 0)}
          </p>
        </GlassCard>

        <GlassCard interactive className="group">
          <div className="flex justify-between items-start mb-4">
             <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                <CheckCircle2 size={20} />
             </div>
             <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full uppercase">Approved</span>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Submission Selesai</p>
          <p className="mt-1 text-3xl font-black text-slate-900 tracking-tight">
            {numberFormatter.format(approvedCount.count ?? 0)}
          </p>
        </GlassCard>

        <GlassCard interactive className="group">
          <div className="flex justify-between items-start mb-4">
             <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-all">
                <AlertCircle size={20} />
             </div>
             <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-1 rounded-full uppercase">Rejected</span>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Perlu Revisi Crew</p>
          <p className="mt-1 text-3xl font-black text-rose-600 tracking-tight">
            {numberFormatter.format(needsFollowupCount.count ?? 0)}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Draft internal: {numberFormatter.format(draftValue)}</p>
        </GlassCard>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        <Link href="/admin/verifikasi" className="group block">
          <div className="bg-white border border-slate-200 rounded-3xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-indigo-200 hover:shadow-md transition-all aspect-square relative overflow-hidden">
            <div className="absolute inset-0 bg-indigo-50/30 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm mb-3 relative z-10">
              <ClipboardCheck size={28} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 relative z-10">Approval</p>
            <p className="text-sm font-black text-slate-800 uppercase relative z-10 leading-tight mt-0.5">Verifikasi</p>
          </div>
        </Link>

        <Link href="/admin/input-harian" className="group block">
          <div className="bg-white border border-slate-200 rounded-3xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-sky-200 hover:shadow-md transition-all aspect-square relative overflow-hidden">
            <div className="absolute inset-0 bg-sky-50/30 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-14 h-14 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center group-hover:bg-sky-600 group-hover:text-white transition-all shadow-sm mb-3 relative z-10">
              <PenTool size={28} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 relative z-10">Operasional</p>
            <p className="text-sm font-black text-slate-800 uppercase relative z-10 leading-tight mt-0.5">Input Harian</p>
          </div>
        </Link>

        <Link href="/admin/laporan" className="group block">
          <div className="bg-white border border-slate-200 rounded-3xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-emerald-200 hover:shadow-md transition-all aspect-square relative overflow-hidden">
            <div className="absolute inset-0 bg-emerald-50/30 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-sm mb-3 relative z-10">
              <BarChart3 size={28} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 relative z-10">Analisis</p>
            <p className="text-sm font-black text-slate-800 uppercase relative z-10 leading-tight mt-0.5">Laporan</p>
          </div>
        </Link>

        <Link href="/admin/pengumuman" className="group block">
          <div className="bg-white border border-slate-200 rounded-3xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:border-amber-200 hover:shadow-md transition-all aspect-square relative overflow-hidden">
            <div className="absolute inset-0 bg-amber-50/30 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-all shadow-sm mb-3 relative z-10">
              <MessageSquareHeart size={28} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 relative z-10">Info</p>
            <p className="text-sm font-black text-slate-800 uppercase relative z-10 leading-tight mt-0.5">Pusat Pengumuman</p>
          </div>
        </Link>
      </div>
    </AnimatedPage>
  );
}
