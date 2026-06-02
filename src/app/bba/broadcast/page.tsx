import { AnimatedPage } from "@/components/shared/animated-page";
import { Construction } from "lucide-react";

export default function BroadcastPage() {
  return (
    <AnimatedPage className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
      {/* Icon */}
      <div className="w-20 h-20 rounded-3xl bg-amber-50 border-2 border-amber-200 flex items-center justify-center mb-6 shadow-sm">
        <Construction size={36} className="text-amber-500" />
      </div>

      {/* Label atas */}
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700 mb-4">
        Dalam Pengembangan
      </span>

      {/* Judul */}
      <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight mb-3">
        Pusat Pengumuman
      </h1>

      {/* Deskripsi */}
      <p className="text-sm text-slate-500 max-w-sm leading-relaxed">
        Fitur ini sedang disiapkan dan akan segera tersedia.
        Composer pengumuman, analytics keterbacaan, dan scheduling broadcast
        akan hadir dalam waktu dekat.
      </p>
    </AnimatedPage>
  );
}
