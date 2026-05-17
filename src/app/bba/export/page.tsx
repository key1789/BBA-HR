import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";

export default function ExportPage() {
  return (
    <AnimatedPage className="space-y-6">
      <GlassCard className="p-6" variant="light">
        <h1 className="text-xl font-black text-slate-800">Pusat Unduhan (Export Center)</h1>
        <p className="text-sm text-slate-500 mt-1">Halaman khusus untuk mengunduh laporan berukuran besar dalam format Excel/PDF.</p>
      </GlassCard>
      
      <GlassCard variant="light" className="h-64 flex items-center justify-center border-dashed border-2">
        <p className="text-slate-400 font-medium">Fitur sedang dalam pengembangan (Work in Progress)</p>
      </GlassCard>
    </AnimatedPage>
  );
}
