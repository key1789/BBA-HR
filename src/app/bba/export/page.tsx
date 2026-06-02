import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { createAdminClient } from "@/lib/supabase/admin";
import { DownloadForm } from "./download-form";
import { FileText, CheckCircle2, Store, FileDown, LayoutList } from "lucide-react";

export const dynamic = "force-dynamic";

async function getActiveBranches() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tenant_apotek")
    .select("id, name, code")
    .eq("status", "active")
    .order("name", { ascending: true });
  return (data ?? []) as { id: string; name: string; code: string }[];
}

const REPORT_SECTIONS = [
  { title: "Ringkasan Setup", desc: "Nama apotek, owner, alamat, target KPI, dan daftar crew." },
  { title: "Rekapitulasi Harian", desc: "Omzet, nota, produk, ATV, ATU, dan pelanggan tertolak per hari selama sebulan penuh." },
  { title: "Performa Per Karyawan", desc: "Kumulatif omzet, ATV, ATU, ATV%, ATU%, dan SARP% tiap crew. Rankings top 4 per metrik." },
  { title: "Matriks Omzet Harian", desc: "Tabel landscape: setiap crew di baris, setiap hari di kolom — one-glance per-person performance." },
  { title: "Tren Omzet 12 Bulan", desc: "Grafik bar horizontal omzet bulanan branch 12 bulan terakhir." },
  { title: "Pelanggan Tertolak", desc: "Detail tertolak per hari lengkap dengan estimasi omzet hilang." },
];

export default async function ExportPage() {
  const branches = await getActiveBranches();

  return (
    <AnimatedPage className="space-y-6">
      {/* HEADER */}
      <GlassCard className="p-4 sm:p-5" variant="light">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-sky-600/25">
            <FileText size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase leading-tight">
              Pusat Unduhan
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Unduh Laporan Jago Jualan BBA dalam format{" "}
              <span className="font-semibold text-slate-700">PDF</span> atau{" "}
              <span className="font-semibold text-slate-700">Excel</span>.
            </p>
          </div>
        </div>
      </GlassCard>

      {/* QUICK STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <GlassCard className="p-3.5 border-l-4 border-l-emerald-500" variant="light">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Store size={18} />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Cabang Aktif</p>
              <p className="text-2xl font-black text-slate-900 leading-none">{branches.length}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-3.5 border-l-4 border-l-teal-500" variant="light">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
              <FileDown size={18} />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Format Ekspor</p>
              <p className="text-2xl font-black text-slate-900 leading-none">2</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-3.5 border-l-4 border-l-slate-300" variant="light">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
              <LayoutList size={18} />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Seksi Laporan</p>
              <p className="text-2xl font-black text-slate-900 leading-none">{REPORT_SECTIONS.length}</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form panel */}
        <div className="lg:col-span-2">
          <GlassCard variant="light" className="p-6">
            <h2 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-5">
              Pilih Laporan
            </h2>
            <DownloadForm branches={branches} />
          </GlassCard>
        </div>

        {/* Info panel */}
        <div className="lg:col-span-3 space-y-4">
          <GlassCard variant="light" className="p-6">
            <h2 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">
              Isi Laporan
            </h2>
            <div className="space-y-3">
              {REPORT_SECTIONS.map((s, i) => (
                <div key={i} className="flex gap-3">
                  <div className="mt-0.5 shrink-0">
                    <CheckCircle2 size={15} className="text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-800">{s.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Notes — plain div, tidak menggunakan GlassCard agar warna amber tidak berbenturan */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs text-amber-700 leading-relaxed">
              <span className="font-black">Catatan:</span> Laporan hanya mencakup data yang sudah di-approve
              (status &quot;approved&quot; / &quot;edited_by_admin&quot;). Data pending atau rejected tidak masuk ke laporan.
              Tren 12 bulan menggunakan data leaderboard snapshot yang tersimpan di sistem.
            </p>
          </div>
        </div>
      </div>
    </AnimatedPage>
  );
}
