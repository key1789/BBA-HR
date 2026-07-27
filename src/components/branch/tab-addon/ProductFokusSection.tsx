"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Target, Plus, CopyPlus, Package, Trash2, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { describeProductFokusRule } from "@/lib/produk-fokus-core";
import { deleteProductFokusAction, copyPreviousProductFokusAction } from "@/app/sa/branches/[id]/actions";
import { ProductFokusModal } from "./ProductFokusModal";

export interface ProductFokusSectionProps {
  branchId: string;
  currentMonth: number;
  currentYear: number;
  products: Array<{ id: string; product_name: string; is_active?: boolean; category?: string }>;
  productFokus: any[];
  onSave?: () => void;
}

export function ProductFokusSection({
  branchId,
  currentMonth,
  currentYear,
  products,
  productFokus,
}: ProductFokusSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [localProductFokus, setLocalProductFokus] = useState<any[]>(productFokus ?? []);
  const [modal, setModal] = useState<{ open: boolean; mode: "add" | "edit"; editConfig?: any }>({ open: false, mode: "add" });

  useEffect(() => {
    queueMicrotask(() => setLocalProductFokus(productFokus ?? []));
  }, [branchId, productFokus]);

  const availableProducts = useMemo(
    () =>
      products
        .filter((p) => p.is_active !== false && !localProductFokus.some((pf) => pf.product_id === p.id))
        .map((p) => ({ id: p.id, product_name: p.product_name })),
    [products, localProductFokus],
  );

  const handleModalSaved = (rows: any[]) => {
    setLocalProductFokus((prev) => {
      const savedIds = new Set(rows.map((r) => r.product_id));
      const others = prev.filter((x) => !savedIds.has(x.product_id));
      return [...rows, ...others];
    });
  };

  const handleCopyPrevious = () => {
    startTransition(async () => {
      const res = await copyPreviousProductFokusAction(branchId, currentMonth, currentYear);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(res.message ?? "Disalin.");
        router.refresh(); // ambil ulang config dari server
      }
    });
  };

  const handleDelete = (pf: any) => {
    const fd = new FormData();
    fd.append("configId", pf.id);
    fd.append("tenantId", branchId);
    startTransition(async () => {
      const res = await deleteProductFokusAction(fd);
      if (res.success) {
        setLocalProductFokus((prev) => prev.filter((x) => x.id !== pf.id));
        toast.success(res.message);
        setPendingDeleteId(null);
      } else toast.error(res.error);
    });
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Info + toolbar */}
      <div className="p-5 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100/50 rounded-3xl flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex gap-4 items-start flex-1">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-emerald-600 shadow-sm shrink-0">
            <Target size={20} />
          </div>
          <p className="text-xs text-slate-600 leading-relaxed font-semibold">
            Item <span className="text-emerald-600 font-black uppercase tracking-widest text-[10px]">Produk Fokus</span> memberi
            insentif khusus bagi crew yang menjualnya. Atur skema per produk di bawah.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyPrevious}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-black text-[11px] text-slate-600 bg-white border border-slate-200 hover:border-emerald-300 hover:text-emerald-700 transition-all disabled:opacity-60"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <CopyPlus size={14} />}
            Salin Bulan Lalu
          </button>
          <button
            type="button"
            onClick={() => setModal({ open: true, mode: "add" })}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-black text-[11px] text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all"
          >
            <Plus size={14} /> Tambah Produk Fokus
          </button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Produk Fokus Aktif</h4>
          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-black uppercase tracking-widest">
            {localProductFokus.length} Item
          </span>
        </div>

        {localProductFokus.length === 0 ? (
          <div className="p-10 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-slate-300 mx-auto shadow-sm">
              <Package size={24} />
            </div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest italic">Belum ada produk fokus</p>
            <button
              type="button"
              onClick={() => setModal({ open: true, mode: "add" })}
              className="text-xs font-black text-emerald-600 hover:text-emerald-700"
            >
              + Tambah sekarang
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {localProductFokus.map((pf) => (
              <div
                key={pf.id}
                className="group p-4 sm:p-5 bg-white border border-slate-100 rounded-3xl flex justify-between items-center gap-4 shadow-sm hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-500/5 transition-all"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <Package size={19} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-slate-800 text-sm uppercase tracking-tight leading-tight truncate">
                      {pf.master_products?.product_name}
                    </p>
                    <p className="text-[11px] font-semibold text-slate-500 leading-snug mt-0.5">
                      {describeProductFokusRule(pf)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {pendingDeleteId === pf.id ? (
                    <>
                      <button type="button" onClick={() => setPendingDeleteId(null)} className="px-3 py-2 text-[10px] font-black text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">Batal</button>
                      <button type="button" disabled={isPending} onClick={() => handleDelete(pf)} className="px-3 py-2 text-[10px] font-black text-white bg-rose-500 hover:bg-rose-600 rounded-xl transition-all disabled:opacity-50">Hapus</button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setModal({ open: true, mode: "edit", editConfig: pf })}
                        className="w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 rounded-xl transition-all"
                        title="Edit"
                        aria-label="Edit produk fokus"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(pf.id)}
                        className="w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-300 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all"
                        title="Hapus"
                        aria-label="Hapus produk fokus"
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal.open && (
        <ProductFokusModal
          isOpen={modal.open}
          onClose={() => setModal({ open: false, mode: "add" })}
          branchId={branchId}
          currentMonth={currentMonth}
          currentYear={currentYear}
          mode={modal.mode}
          availableProducts={availableProducts}
          editConfig={modal.editConfig}
          onSaved={handleModalSaved}
        />
      )}
    </div>
  );
}
