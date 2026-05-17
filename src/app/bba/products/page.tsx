import { createAdminClient } from "@/lib/supabase/admin";
import { ProductListClient } from "./product-list-client";
import { Package } from "lucide-react";

export default async function MasterProductsPage() {
  const supabase = createAdminClient();
  
  const { data: products } = await supabase
    .from("master_products")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <Package className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Master Produk Fokus</h1>
              <p className="text-slate-500 font-bold text-sm uppercase tracking-widest flex items-center gap-2">
                Manajemen Produk Global <span className="w-1 h-1 bg-slate-300 rounded-full"></span> {products?.length || 0} Item
              </p>
            </div>
          </div>
        </div>
      </div>

      <ProductListClient initialProducts={products || []} />
    </div>
  );
}
