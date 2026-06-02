import { createAdminClient } from "@/lib/supabase/admin";
import { ProductListClient } from "./product-list-client";
import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { Package, CheckCircle2, Archive } from "lucide-react";

export default async function MasterProductsPage() {
  const supabase = createAdminClient();

  const { data: products } = await supabase
    .from("master_products")
    .select("*")
    .order("created_at", { ascending: false });

  const allProducts = products || [];
  const statTotal  = allProducts.length;
  const statAktif  = allProducts.filter(p => p.is_active).length;
  const statArsip  = allProducts.filter(p => !p.is_active).length;

  return (
    <AnimatedPage className="space-y-6">
      {/* HEADER */}
      <GlassCard className="p-4 sm:p-5" variant="light">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-sky-600/25">
              <Package size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase leading-tight">
                Master Produk Fokus
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">Kelola daftar produk global yang digunakan di seluruh cabang.</p>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* QUICK STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <GlassCard className="p-3.5 border-l-4 border-l-indigo-500" variant="light">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Package size={18} />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Produk</p>
              <p className="text-2xl font-black text-slate-900 leading-none">{statTotal}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-3.5 border-l-4 border-l-emerald-500" variant="light">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Produk Aktif</p>
              <p className="text-2xl font-black text-slate-900 leading-none">{statAktif}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-3.5 border-l-4 border-l-slate-300" variant="light">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
              <Archive size={18} />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Diarsipkan</p>
              <p className="text-2xl font-black text-slate-900 leading-none">{statArsip}</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* CLIENT COMPONENT */}
      <ProductListClient initialProducts={allProducts} />
    </AnimatedPage>
  );
}
