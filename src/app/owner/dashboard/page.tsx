import { GlassCard } from "@/components/shared/glass-card";
import { InlineAlert } from "@/components/shared/inline-alert";
import { AnimatedPage } from "@/components/shared/animated-page";
import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { 
  Crown, CheckCircle2, Clock, AlertTriangle, 
  ChevronRight, BarChart3, ListTree, Trophy,
  Building2
} from "lucide-react";

export default async function OwnerDashboardPage() {
  const session = await getSessionContext();
  const active = session?.activeMembership;

  if (!active) {
    return (
      <AnimatedPage className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center text-slate-400 mb-6">
             <Building2 size={40} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 uppercase">Owner Dashboard</h1>
          <p className="text-slate-500 mt-2">Tidak ada tenant aktif yang terhubung dengan akun Anda.</p>
      </AnimatedPage>
    );
  }

  const supabase = await createClient();
  const [approved, submitted, submissionIdsResult] = await Promise.all([
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("status", "approved"),
    supabase
      .from("daily_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_apotek_id", active.tenantId)
      .eq("status", "submitted"),
    supabase
      .from("daily_submissions")
      .select("id")
      .eq("tenant_apotek_id", active.tenantId),
  ]);
  const submissionIds = (submissionIdsResult.data ?? []).map((item) => item.id);
  const minusPoints =
    submissionIds.length > 0
      ? await supabase
          .from("minus_points")
          .select("id", { count: "exact", head: true })
          .in("submission_id", submissionIds)
      : { count: 0 };
      
  const numberFormatter = new Intl.NumberFormat("id-ID");
  const reminderTone = (submitted.count ?? 0) > 0 || (minusPoints.count ?? 0) > 0 ? "warning" : "success";
  const reminderMessage =
    reminderTone === "warning"
      ? `Terdapat ${numberFormatter.format(submitted.count ?? 0)} submission menunggu verifikasi dan ${numberFormatter.format(minusPoints.count ?? 0)} event minus poin yang perlu diperhatikan.`
      : "Seluruh operasional tenant Anda berjalan stabil dan terkendali hari ini.";

  return (
    <AnimatedPage className="space-y-8 pb-10">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
         <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-3 border border-amber-100">
               <Crown size={12} /> Owner Portal
            </div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight uppercase">Dashboard <span className="text-amber-600">Bisnis</span></h1>
            <p className="text-slate-500 text-sm mt-1 font-medium">Ringkasan performa dan status operasional apotek Anda.</p>
         </div>
         
         <div className="flex items-center gap-4">
            <div className="text-right">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Apotek Aktif</p>
               <p className="text-sm font-bold text-slate-800 uppercase">{active.tenantName}</p>
            </div>
            <div className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center text-amber-600">
               <Building2 size={24} />
            </div>
         </div>
      </div>

      <InlineAlert tone={reminderTone} message={reminderMessage} />

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        <GlassCard interactive className="group">
          <div className="flex justify-between items-start mb-4">
             <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                <CheckCircle2 size={20} />
             </div>
             <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full uppercase">Approved</span>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Submission Selesai</p>
          <p className="mt-1 text-3xl font-black text-slate-900 tracking-tight">
            {numberFormatter.format(approved.count ?? 0)}
          </p>
        </GlassCard>

        <GlassCard interactive className="group">
          <div className="flex justify-between items-start mb-4">
             <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-all">
                <Clock size={20} />
             </div>
             <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-full uppercase">Pending</span>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Menunggu Verifikasi</p>
          <p className="mt-1 text-3xl font-black text-slate-900 tracking-tight">
            {numberFormatter.format(submitted.count ?? 0)}
          </p>
        </GlassCard>

        <GlassCard interactive className="group">
          <div className="flex justify-between items-start mb-4">
             <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-all">
                <AlertTriangle size={20} />
             </div>
             <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-1 rounded-full uppercase">Issues</span>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Event Minus Poin</p>
          <p className="mt-1 text-3xl font-black text-rose-600 tracking-tight">
            {numberFormatter.format(minusPoints.count ?? 0)}
          </p>
        </GlassCard>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <Link href="/owner/laporan" className="group">
           <GlassCard interactive className="!p-6 flex items-center justify-between border-slate-100 bg-white/40">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-all shadow-sm">
                    <BarChart3 size={24} />
                 </div>
                 <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Analisis</p>
                    <p className="text-sm font-black text-slate-800 uppercase">Buka Laporan</p>
                 </div>
              </div>
              <ChevronRight size={20} className="text-slate-300 group-hover:text-amber-600 transition-all translate-x-0 group-hover:translate-x-1" />
           </GlassCard>
        </Link>

        <Link href="/owner/detail" className="group">
           <GlassCard interactive className="!p-6 flex items-center justify-between border-slate-100 bg-white/40">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-all shadow-sm">
                    <ListTree size={24} />
                 </div>
                 <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Data Mentah</p>
                    <p className="text-sm font-black text-slate-800 uppercase">Detail Data</p>
                 </div>
              </div>
              <ChevronRight size={20} className="text-slate-300 group-hover:text-amber-600 transition-all translate-x-0 group-hover:translate-x-1" />
           </GlassCard>
        </Link>

        <Link href="/owner/leaderboard" className="group">
           <GlassCard interactive className="!p-6 flex items-center justify-between border-slate-100 bg-white/40">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-all shadow-sm">
                    <Trophy size={24} />
                 </div>
                 <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Kompetisi</p>
                    <p className="text-sm font-black text-slate-800 uppercase">Leaderboard</p>
                 </div>
              </div>
              <ChevronRight size={20} className="text-slate-300 group-hover:text-amber-600 transition-all translate-x-0 group-hover:translate-x-1" />
           </GlassCard>
        </Link>
      </div>
    </AnimatedPage>
  );
}
