"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useState, useActionState, useEffect } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import { Search, Plus, Edit2, Archive, CheckCircle2, X, Save, Loader2, Package, Power } from "lucide-react";
import { saveMasterProductAction, toggleProductStatusAction } from "./actions";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export function ProductListClient({ initialProducts }: { initialProducts: any[] }) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<'aktif'|'arsip'>('aktif');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [state, action, isPending] = useActionState(saveMasterProductAction, null);

  const filteredProducts = initialProducts.filter(p => {
    const matchSearch = p.product_name.toLowerCase().includes(search.toLowerCase());
    const matchTab = activeTab === 'aktif' ? p.is_active : !p.is_active;
    return matchSearch && matchTab;
  });

  useEffect(() => {
    if (state?.success) {
      toast.success(state.message);
      setIsModalOpen(false);
      setEditingProduct(null);
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state]);

  const handleToggleStatus = async (product: any) => {
    const toastId = toast.loading(`Sedang di${product.is_active ? 'nonaktifkan' : 'aktifkan'}...`);
    const res = await toggleProductStatusAction(product.id, product.is_active);
    if (res.success) {
      toast.success(res.message, { id: toastId });
    } else {
      toast.error(res.error, { id: toastId });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={20} />
          <input 
            type="text" 
            placeholder="Cari nama produk..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-3xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 outline-none transition-all font-bold text-slate-800 shadow-sm"
          />
        </div>
        <button 
          onClick={() => {
            setEditingProduct(null);
            setIsModalOpen(true);
          }}
          className="w-full md:w-auto px-8 py-4 bg-indigo-600 text-white rounded-3xl font-black text-sm shadow-xl shadow-indigo-600/30 hover:bg-indigo-700 transition-all hover:-translate-y-1 flex items-center justify-center gap-2"
        >
          <Plus size={20} /> Tambah Produk
        </button>
      </div>

      {/* TABS NAVIGATION */}
      <div className="flex gap-2 p-1.5 bg-slate-100/50 rounded-2xl border border-slate-200/50 backdrop-blur-sm shadow-inner w-full sm:w-max">
        <button
          onClick={() => setActiveTab('aktif')}
          className={`flex-1 sm:flex-none relative px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeTab === 'aktif' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'}`}
        >
          {activeTab === 'aktif' && <motion.div layoutId="productTab" className="absolute inset-0 bg-white rounded-xl shadow-md border border-indigo-100" transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />}
          <span className="relative z-10 flex items-center justify-center gap-2">
            <CheckCircle2 size={14} /> Produk Aktif
          </span>
        </button>
        <button
          onClick={() => setActiveTab('arsip')}
          className={`flex-1 sm:flex-none relative px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeTab === 'arsip' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'}`}
        >
          {activeTab === 'arsip' && <motion.div layoutId="productTab" className="absolute inset-0 bg-white rounded-xl shadow-md border border-indigo-100" transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />}
          <span className="relative z-10 flex items-center justify-center gap-2">
            <Archive size={14} /> Arsip
          </span>
        </button>
      </div>

      {/* DESKTOP VIEW (TABLE) */}
      <div className="hidden md:block">
        <GlassCard variant="light" className="p-0 overflow-hidden border border-slate-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400 w-16 text-center">No</th>
                <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Nama Produk</th>
                <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Tanggal Dibuat</th>
                <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right w-32">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product, index) => (
                <tr key={product.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                  <td className="py-4 px-6 text-sm font-bold text-slate-400 text-center">{index + 1}</td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${product.is_active ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                        <Package size={16} />
                      </div>
                      <span className="font-black text-slate-800 uppercase tracking-tight">{product.product_name}</span>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-xs font-bold text-slate-500">
                    {new Date(product.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => {
                          setEditingProduct(product);
                          setIsModalOpen(true);
                        }}
                        className="p-2 bg-white hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-xl shadow-sm border border-slate-100 transition-all"
                        title="Edit Produk"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        onClick={() => handleToggleStatus(product)}
                        className={`p-2 bg-white rounded-xl shadow-sm border border-slate-100 transition-all ${product.is_active ? 'hover:bg-rose-50 text-slate-400 hover:text-rose-600' : 'hover:bg-emerald-50 text-slate-400 hover:text-emerald-600'}`}
                        title={product.is_active ? "Arsipkan" : "Aktifkan"}
                      >
                        {product.is_active ? <Archive size={14} /> : <Power size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-400 font-bold text-sm uppercase tracking-widest">
                    Tidak ada produk ditemukan
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </GlassCard>
      </div>

      {/* MOBILE VIEW (CARDS) */}
      <div className="md:hidden grid grid-cols-1 gap-4">
        <AnimatePresence mode="popLayout">
          {filteredProducts.map((product) => (
            <motion.div
              layout
              key={product.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <GlassCard variant={product.is_active ? "light" : "dark"} className={`p-5 transition-all border ${product.is_active ? 'border-slate-100 hover:border-indigo-100' : 'border-slate-100 grayscale opacity-80'}`}>
                <div className="flex justify-between items-start gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${product.is_active ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-200 text-slate-400'}`}>
                      <Package size={20} />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-800 uppercase tracking-tight leading-tight text-sm">{product.product_name}</h3>
                      <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
                        Dibuat: {new Date(product.created_at).toLocaleDateString('id-ID')}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
                  <button 
                    onClick={() => {
                      setEditingProduct(product);
                      setIsModalOpen(true);
                    }}
                    className="flex-1 py-2.5 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-xl transition-all font-bold text-[10px] uppercase flex justify-center items-center gap-2"
                  >
                    <Edit2 size={12} /> Edit
                  </button>
                  <button 
                    onClick={() => handleToggleStatus(product)}
                    className={`flex-1 py-2.5 rounded-xl transition-all font-bold text-[10px] uppercase flex justify-center items-center gap-2 ${product.is_active ? 'bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-600' : 'bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600'}`}
                  >
                    {product.is_active ? <Archive size={12} /> : <Power size={12} />}
                    {product.is_active ? "Arsipkan" : "Aktifkan"}
                  </button>
                </div>
              </GlassCard>
            </motion.div>
          ))}
          {filteredProducts.length === 0 && (
            <div className="py-12 text-center text-slate-400 font-bold text-xs uppercase tracking-widest border-2 border-dashed border-slate-200 rounded-3xl">
              Tidak ada produk
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* ADD/EDIT MODAL */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-lg bg-white rounded-[40px] shadow-2xl overflow-hidden p-8"
            >
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30">
                    <Plus size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">{editingProduct ? 'Edit Produk' : 'Tambah Produk'}</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Master Data Produk Fokus</p>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-slate-100 rounded-2xl transition-colors">
                  <X size={24} className="text-slate-400" />
                </button>
              </div>

              <form action={action} className="space-y-6">
                <input type="hidden" name="id" value={editingProduct?.id || ""} />
                
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                    <Package size={14} /> Nama Produk
                  </label>
                  <input 
                    name="product_name"
                    defaultValue={editingProduct?.product_name || ""}
                    placeholder="Contoh: Panadol Extra 500mg"
                    required
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 outline-none transition-all font-bold text-slate-800"
                  />
                </div>

                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3 mt-4">
                   <Archive size={18} className="text-amber-600 shrink-0" />
                   <p className="text-xs text-amber-800 leading-relaxed font-medium">Produk yang sudah ditambahkan tidak dapat dihapus untuk menjaga riwayat laporan, namun dapat dinonaktifkan agar tidak muncul lagi dalam pilihan.</p>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-sm hover:bg-slate-200 transition-all"
                  >
                    Batal
                  </button>
                  <button 
                    type="submit" 
                    disabled={isPending}
                    className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-indigo-600/30 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                  >
                    {isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    Simpan Produk
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
