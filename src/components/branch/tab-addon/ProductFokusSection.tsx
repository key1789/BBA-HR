"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Target,
  Plus,
  Search,
  Save,
  CheckCircle2,
  Package,
  Gift,
  Trash2,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { CurrencyInput } from "@/components/shared/currency-input";
import { deleteProductFokusAction, saveProductFokusAction } from "@/app/bba/branches/[id]/actions";

export interface ProductFokusSectionProps {
  branchId: string;
  currentMonth: number;
  currentYear: number;
  products: Array<{
    id: string;
    product_name: string;
    is_active?: boolean;
    category?: string;
  }>;
  /** Daftar konfigurasi produk fokus periode ini (dari server). */
  productFokus: any[];
  onSave?: () => void;
}

export function ProductFokusSection({
  branchId,
  currentMonth,
  currentYear,
  products,
  productFokus,
  onSave,
}: ProductFokusSectionProps) {
  const [isPending, startTransition] = useTransition();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [searchProduct, setSearchProduct] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [localProductFokus, setLocalProductFokus] = useState<any[]>(productFokus ?? []);
  const [targetType, setTargetType] = useState<"item" | "nominal">("item");
  const [bonusType, setBonusType] = useState<"flat" | "kelipatan">("flat");
  const [targetValue, setTargetValue] = useState(0);
  const [bonusValue, setBonusValue] = useState(0);
  const [bonusStep, setBonusStep] = useState(0);

  useEffect(() => {
    queueMicrotask(() => setLocalProductFokus(productFokus ?? []));
  }, [branchId, productFokus]);

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          p.is_active !== false &&
          p.product_name.toLowerCase().includes(searchProduct.toLowerCase()) &&
          !localProductFokus.some((pf) => pf.product_id === p.id),
      ),
    [products, searchProduct, localProductFokus],
  );

  const afterMutation = () => {
    onSave?.();
  };

  return (
    <div className="space-y-10 pb-10">
      <div className="p-6 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100/50 rounded-[24px] flex gap-5 items-start">
        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-emerald-600 shadow-sm shrink-0">
          <Target size={20} />
        </div>
        <p className="text-xs text-slate-600 leading-relaxed font-semibold">
          Optimalkan penjualan dengan menetapkan{" "}
          <span className="text-emerald-600 font-black text-[10px] uppercase tracking-widest">Produk Fokus</span>. Item
          yang dipilih akan mendapatkan insentif khusus bagi personil yang berhasil menjualnya.
        </p>
      </div>

      <div className="space-y-6">
        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Plus size={14} /> Tambah Produk Baru
        </h4>

        {!selectedProduct ? (
          <div className="space-y-4">
            <div className="relative group">
              <Search
                size={20}
                className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors"
              />
              <input
                placeholder="Cari nama produk apotek..."
                value={searchProduct}
                onChange={(e) => setSearchProduct(e.target.value)}
                className="w-full pl-14 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-3xl focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all font-black text-slate-800 outline-none text-sm"
              />
            </div>
            <div className="max-h-60 overflow-y-auto border border-slate-100 rounded-[28px] bg-slate-50/50 p-2 custom-scrollbar">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProduct(p)}
                  className="w-full p-4 text-left hover:bg-white hover:shadow-md hover:text-emerald-700 text-xs font-black uppercase tracking-tight text-slate-600 transition-all rounded-2xl mb-1 last:mb-0 flex items-center justify-between group"
                >
                  {p.product_name}
                  <ChevronRight
                    size={14}
                    className="opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0"
                  />
                </button>
              ))}
              {searchProduct && filteredProducts.length === 0 && (
                <div className="p-8 text-center">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest italic">Produk tidak ditemukan</p>
                </div>
              )}
              {!searchProduct && filteredProducts.length === 0 && (
                <div className="p-8 text-center">
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                    Tidak ada produk tersedia untuk ditambahkan.
                  </p>
                  <p className="text-[10px] text-slate-400 mt-2">
                    Kemungkinan semua produk aktif sudah menjadi produk fokus pada periode ini.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <form
            className="space-y-6 p-8 bg-emerald-50/50 rounded-[32px] border border-emerald-100 relative animate-in zoom-in-95 duration-500"
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              startTransition(async () => {
                const res = await saveProductFokusAction(null, formData);
                if (res.success) {
                  toast.success(res.message);
                  const nextItem = {
                    id: `${selectedProduct.id}-${currentMonth}-${currentYear}`,
                    tenant_apotek_id: branchId,
                    product_id: selectedProduct.id,
                    period_month: currentMonth,
                    period_year: currentYear,
                    target_type: targetType,
                    target_value: targetValue,
                    bonus_type: bonusType,
                    bonus_value: bonusValue,
                    bonus_step: bonusType === "kelipatan" ? bonusStep : null,
                    master_products: { product_name: selectedProduct.product_name },
                  };
                  setLocalProductFokus((prev) => {
                    const others = prev.filter((x) => x.product_id !== selectedProduct.id);
                    return [nextItem, ...others];
                  });
                  setSelectedProduct(null);
                  setSearchProduct("");
                  afterMutation();
                } else toast.error(res.error);
              });
            }}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Produk Terpilih</p>
                <h5 className="text-lg font-black text-slate-800 uppercase tracking-tight">{selectedProduct.product_name}</h5>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="px-3 py-1 bg-white text-[9px] font-black text-rose-500 uppercase rounded-lg border border-rose-100 hover:bg-rose-50 transition-all"
              >
                Ganti Produk
              </button>
            </div>

            <input type="hidden" name="tenantId" value={branchId} />
            <input type="hidden" name="productId" value={selectedProduct.id} />
            <input type="hidden" name="periodMonth" value={currentMonth} />
            <input type="hidden" name="periodYear" value={currentYear} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Jenis Target</label>
                <select
                  name="targetType"
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value as "item" | "nominal")}
                  className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                >
                  <option value="item">Total Item / Unit</option>
                  <option value="nominal">Nominal Rupiah (Rp)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nilai Target</label>
                {targetType === "nominal" ? (
                  <CurrencyInput
                    name="targetValue"
                    value={targetValue}
                    onChange={setTargetValue}
                    required
                    className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                  />
                ) : (
                  <input
                    name="targetValue"
                    type="number"
                    required
                    value={targetValue || ""}
                    onChange={(e) => setTargetValue(parseInt(e.target.value, 10) || 0)}
                    placeholder="0"
                    className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Mode Bonus</label>
                <select
                  name="bonusType"
                  value={bonusType}
                  onChange={(e) => setBonusType(e.target.value as "flat" | "kelipatan")}
                  className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                >
                  <option value="flat">Bonus Flat (Sekali)</option>
                  <option value="kelipatan">Bonus Kelipatan</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nominal Bonus (Rp)</label>
                <CurrencyInput
                  name="bonusValue"
                  value={bonusValue}
                  onChange={setBonusValue}
                  required
                  className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>

            {bonusType === "kelipatan" && (
              <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Kelipatan Per Berapa (Unit/Rp)
                </label>
                {targetType === "nominal" ? (
                  <CurrencyInput
                    name="bonusStep"
                    value={bonusStep}
                    onChange={setBonusStep}
                    required
                    className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                  />
                ) : (
                  <input
                    name="bonusStep"
                    type="number"
                    required
                    value={bonusStep || ""}
                    onChange={(e) => setBonusStep(parseInt(e.target.value, 10) || 0)}
                    placeholder="1"
                    className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                  />
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Simpan Konfigurasi Produk
            </button>
          </form>
        )}
      </div>

      <div className="pt-10 border-t border-slate-100 space-y-5">
        <div className="flex items-center justify-between">
          <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <CheckCircle2 size={14} /> Produk Fokus Aktif
          </h4>
          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-black uppercase tracking-widest">
            {localProductFokus.length} Item
          </span>
        </div>

        {localProductFokus.length === 0 ? (
          <div className="p-10 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[32px] text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-slate-300 mx-auto shadow-sm">
              <Search size={24} />
            </div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest italic">Belum ada produk fokus yang diatur</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {localProductFokus.map((pf) => (
              <div
                key={pf.id}
                className="group p-5 bg-white border border-slate-100 rounded-3xl flex justify-between items-center shadow-sm hover:shadow-xl hover:shadow-emerald-500/5 hover:border-emerald-200 transition-all duration-500"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black text-xs shadow-inner group-hover:scale-110 transition-transform duration-500">
                    <Package size={20} />
                  </div>
                  <div>
                    <p className="font-black text-slate-800 text-sm uppercase tracking-tight leading-tight">
                      {pf.master_products?.product_name}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <Target size={10} className="text-emerald-500" />{" "}
                        {pf.target_type === "item"
                          ? `${Number(pf.target_value || 0).toLocaleString()} Item`
                          : `Rp ${Number(pf.target_value || 0).toLocaleString()}`}
                      </div>
                      <div className="w-1 h-1 rounded-full bg-slate-200"></div>
                      <div className="flex items-center gap-1 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                        <Gift size={10} />{" "}
                        {pf.bonus_type === "flat"
                          ? `Rp ${Number(pf.bonus_value || 0).toLocaleString()} (Flat)`
                          : `Rp ${Number(pf.bonus_value || 0).toLocaleString()} / ${Number(pf.bonus_step || 0).toLocaleString()} unit`}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {pendingDeleteId === pf.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(null)}
                        className="px-3 py-2 text-[10px] font-black text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          const fd = new FormData();
                          fd.append("configId", pf.id);
                          fd.append("tenantId", branchId);
                          startTransition(async () => {
                            const res = await deleteProductFokusAction(fd);
                            if (res.success) {
                              setLocalProductFokus((prev) => prev.filter((x) => x.id !== pf.id));
                              toast.success(res.message);
                              setPendingDeleteId(null);
                              afterMutation();
                            } else toast.error(res.error);
                          });
                        }}
                        className="px-3 py-2 text-[10px] font-black text-white bg-rose-500 hover:bg-rose-600 rounded-xl transition-all disabled:opacity-50"
                      >
                        Hapus
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setPendingDeleteId(pf.id)}
                      className="w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-300 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all duration-500 disabled:opacity-50"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
