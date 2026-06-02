"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useState, useActionState, useEffect } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import {
  Search, Plus, Edit2, Archive, CheckCircle2, X, Save,
  Loader2, Package, Power, LayoutGrid, LayoutList,
} from "lucide-react";
import { saveMasterProductAction, toggleProductStatusAction } from "./actions";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

type ViewMode = "card" | "table";

export function ProductListClient({ initialProducts }: { initialProducts: any[] }) {
  const [search, setSearch]           = useState("");
  const [activeTab, setActiveTab]     = useState<"aktif" | "arsip">("aktif");
  const [viewMode, setViewMode]       = useState<ViewMode>("table");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [state, action, isPending]    = useActionState(saveMasterProductAction, null);

  const filteredProducts = initialProducts.filter(p => {
    const matchSearch = p.product_name.toLowerCase().includes(search.toLowerCase());
    const matchTab    = activeTab === "aktif" ? p.is_active : !p.is_active;
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
    const toastId = toast.loading(`Sedang di${product.is_active ? "nonaktifkan" : "aktifkan"}...`);
    const res = await toggleProductStatusAction(product.id, product.is_active);
    if (res.success) toast.success(res.message, { id: toastId });
    else toast.error(res.error, { id: toastId });
  };

  const openAdd = () => { setEditingProduct(null); setIsModalOpen(true); };
  const openEdit = (product: any) => { setEditingProduct(product); setIsModalOpen(true); };

  const EmptyState = ({ colSpan }: { colSpan?: number }) => {
    const inner = (
      <div className="flex flex-col items-center gap-2 border-2 border-dashed border-slate-200 rounded-2xl px-10 py-8 text-center">
        <Package size={36} className="text-slate-300" />
        <p className="text-sm font-bold text-slate-400">
          {search ? "Tidak ada produk yang cocok." : activeTab === "aktif" ? "Belum ada produk aktif." : "Belum ada produk diarsipkan."}
        </p>
      </div>
    );
    if (colSpan) {
      return (
        <tr>
          <td colSpan={colSpan} className="py-12">
            <div className="flex justify-center">{inner}</div>
          </td>
        </tr>
      );
    }
    return <div className="py-6 flex justify-center">{inner}</div>;
  };

  return (
    <div className="space-y-4">
      {/* TOOLBAR: TABS + SEARCH + TOGGLE + ADD BUTTON */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Tabs: Aktif / Arsip */}
        <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5 shrink-0">
          {([
            { key: "aktif", label: "Produk Aktif", icon: CheckCircle2 },
            { key: "arsip", label: "Arsip",         icon: Archive      },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeTab === key ? "text-indigo-600" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {activeTab === key && (
                <motion.div
                  layoutId="productTab"
                  className="absolute inset-0 bg-white rounded-lg shadow-sm border border-indigo-100"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon size={12} /> {label}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Cari nama produk..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full pl-10 pr-10 py-2.5 border border-slate-200/60 rounded-xl bg-white/80 backdrop-blur-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sm:text-sm transition-all shadow-sm"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          )}
        </div>

        {/* View toggle */}
        <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setViewMode("card")}
            title="Tampilan Kartu"
            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${viewMode === "card" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
          >
            <LayoutGrid size={15} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            title="Tampilan Tabel"
            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${viewMode === "table" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
          >
            <LayoutList size={15} />
          </button>
        </div>

        {/* Add button */}
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-black text-xs shadow-lg shadow-indigo-600/25 hover:bg-indigo-700 transition-all hover:-translate-y-0.5 active:scale-95 shrink-0"
        >
          <Plus size={15} /> Tambah Produk
        </button>
      </div>

      {/* ── TABLE VIEW ── */}
      {viewMode === "table" && (
        <GlassCard variant="light" className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="py-3 px-5 text-[9px] font-black uppercase tracking-widest text-slate-400 w-12 text-center">#</th>
                  <th className="py-3 px-5 text-[9px] font-black uppercase tracking-widest text-slate-400">Nama Produk</th>
                  <th className="py-3 px-5 text-[9px] font-black uppercase tracking-widest text-slate-400">Tanggal Dibuat</th>
                  <th className="py-3 px-5 text-[9px] font-black uppercase tracking-widest text-slate-400">Status</th>
                  <th className="py-3 px-5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredProducts.length === 0 ? (
                  <EmptyState colSpan={5} />
                ) : (
                  filteredProducts.map((product, index) => (
                    <tr key={product.id} className="hover:bg-slate-50/60 transition-colors group">
                      <td className="py-3.5 px-5 text-xs font-bold text-slate-300 text-center">{index + 1}</td>
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${product.is_active ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400"}`}>
                            <Package size={15} />
                          </div>
                          <span className="font-black text-sm text-slate-800 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">
                            {product.product_name}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5">
                        <p className="text-xs font-bold text-slate-600">
                          {new Date(product.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </td>
                      <td className="py-3.5 px-5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase ${
                          product.is_active
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : "bg-slate-100 border-slate-200 text-slate-400"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${product.is_active ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" : "bg-slate-300"}`} />
                          {product.is_active ? "Aktif" : "Arsip"}
                        </span>
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="flex items-center justify-end gap-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEdit(product)}
                            className="p-1.5 bg-white hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg shadow-sm border border-slate-100 transition-all"
                            title="Edit"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(product)}
                            className={`p-1.5 bg-white rounded-lg shadow-sm border border-slate-100 transition-all ${
                              product.is_active
                                ? "hover:bg-rose-50 text-slate-400 hover:text-rose-600"
                                : "hover:bg-emerald-50 text-slate-400 hover:text-emerald-600"
                            }`}
                            title={product.is_active ? "Arsipkan" : "Aktifkan"}
                          >
                            {product.is_active ? <Archive size={13} /> : <Power size={13} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* ── CARD VIEW ── */}
      {viewMode === "card" && (
        <>
          {filteredProducts.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence mode="popLayout">
                {filteredProducts.map((product) => (
                  <motion.div
                    layout
                    key={product.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    <GlassCard
                      variant="light"
                      className={`p-0 overflow-hidden hover:shadow-xl transition-all duration-300 border-l-4 ${
                        product.is_active ? "border-l-indigo-500 hover:shadow-indigo-500/10" : "border-l-slate-200"
                      }`}
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              product.is_active ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400"
                            }`}>
                              <Package size={17} />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-black text-sm text-slate-800 uppercase tracking-tight leading-tight truncate">
                                {product.product_name}
                              </h3>
                              <p className="text-[9px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest">
                                {new Date(product.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                              </p>
                            </div>
                          </div>
                          <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase ${
                            product.is_active
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                              : "bg-slate-100 border-slate-200 text-slate-400"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${product.is_active ? "bg-emerald-500" : "bg-slate-300"}`} />
                            {product.is_active ? "Aktif" : "Arsip"}
                          </span>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex gap-2">
                          <button
                            onClick={() => openEdit(product)}
                            className="flex-1 py-2 bg-slate-50 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 rounded-xl transition-all font-bold text-[10px] uppercase flex justify-center items-center gap-1.5"
                          >
                            <Edit2 size={11} /> Edit
                          </button>
                          <button
                            onClick={() => handleToggleStatus(product)}
                            className={`flex-1 py-2 rounded-xl transition-all font-bold text-[10px] uppercase flex justify-center items-center gap-1.5 ${
                              product.is_active
                                ? "bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600"
                                : "bg-slate-50 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600"
                            }`}
                          >
                            {product.is_active ? <><Archive size={11} /> Arsipkan</> : <><Power size={11} /> Aktifkan</>}
                          </button>
                        </div>
                      </div>
                    </GlassCard>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </>
      )}

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
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200"
            >
              {/* Modal header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/25">
                    <Package size={17} />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-800">
                      {editingProduct ? "Edit Produk" : "Tambah Produk"}
                    </h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Master Data Produk Fokus</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-200 text-slate-400 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal body */}
              <form action={action} className="p-5 space-y-4">
                <input type="hidden" name="id" value={editingProduct?.id || ""} />

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 mb-1.5">
                    <Package size={11} /> Nama Produk
                  </label>
                  <input
                    name="product_name"
                    defaultValue={editingProduct?.product_name || ""}
                    placeholder="Contoh: Panadol Extra 500mg"
                    required
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-bold text-sm text-slate-800"
                  />
                </div>

                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3.5 flex gap-2.5">
                  <Archive size={15} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 leading-relaxed font-medium">
                    Produk tidak dapat dihapus untuk menjaga riwayat laporan, namun dapat diarsipkan agar tidak muncul lagi dalam pilihan.
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-black text-xs hover:bg-slate-200 transition-all"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="flex-[2] py-2.5 bg-indigo-600 text-white rounded-xl font-black text-xs shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
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
