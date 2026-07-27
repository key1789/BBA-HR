"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo, useState, useTransition } from "react";
import { Search, Save, Loader2, CheckCircle2, Package, Info } from "lucide-react";
import { toast } from "sonner";
import { AnimatedModal } from "@/components/shared/animated-modal";
import { CurrencyInput } from "@/components/shared/currency-input";
import { describeProductFokusRule } from "@/lib/produk-fokus-core";
import { saveProductFokusAction, saveProductFokusBatchAction } from "@/app/sa/branches/[id]/actions";

type ProductLite = { id: string; product_name: string };

export interface ProductFokusModalProps {
  isOpen: boolean;
  onClose: () => void;
  branchId: string;
  currentMonth: number;
  currentYear: number;
  /** 'add' = pilih banyak produk; 'edit' = satu produk terkunci. */
  mode: "add" | "edit";
  /** Produk yang belum jadi fokus (mode add). */
  availableProducts: ProductLite[];
  /** Config yang diedit (mode edit). */
  editConfig?: any;
  onSaved: (savedRows: any[]) => void;
}

const SEG_ON = "bg-emerald-600 text-white border-emerald-600";
const SEG_OFF = "bg-white text-slate-500 border-slate-200 hover:border-emerald-300";

export function ProductFokusModal({
  isOpen,
  onClose,
  branchId,
  currentMonth,
  currentYear,
  mode,
  availableProducts,
  editConfig,
  onSaved,
}: ProductFokusModalProps) {
  const [isPending, startTransition] = useTransition();

  // Product selection (add mode)
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Scheme fields
  const [hasMinTarget, setHasMinTarget] = useState<boolean>(editConfig ? editConfig.has_min_target !== false : true);
  const [targetValue, setTargetValue] = useState<number>(editConfig ? Number(editConfig.target_value ?? 0) : 0);
  const [bonusType, setBonusType] = useState<"flat" | "kelipatan">(editConfig?.bonus_type === "kelipatan" ? "kelipatan" : "flat");
  const [bonusValue, setBonusValue] = useState<number>(editConfig ? Number(editConfig.bonus_value ?? 0) : 0);
  const [bonusStep, setBonusStep] = useState<number>(editConfig ? Number(editConfig.bonus_step ?? 0) : 0);
  const [countBase, setCountBase] = useState<"excess" | "full">((editConfig?.count_base ?? "excess") === "full" ? "full" : "excess");

  const filtered = useMemo(
    () => availableProducts.filter((p) => p.product_name.toLowerCase().includes(search.toLowerCase())),
    [availableProducts, search],
  );

  const previewCfg = {
    has_min_target: hasMinTarget,
    target_value: targetValue,
    bonus_type: bonusType,
    bonus_value: bonusValue,
    bonus_step: bonusStep,
    count_base: countBase,
  };

  const toggleProduct = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const buildSchemeFormData = (fd: FormData) => {
    fd.set("tenantId", branchId);
    fd.set("periodMonth", String(currentMonth));
    fd.set("periodYear", String(currentYear));
    fd.set("hasMinTarget", hasMinTarget ? "true" : "false");
    fd.set("targetValue", String(targetValue));
    fd.set("bonusType", bonusType);
    fd.set("bonusValue", String(bonusValue));
    fd.set("bonusStep", bonusType === "kelipatan" ? String(bonusStep) : "");
    fd.set("countBase", countBase);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "add" && selectedIds.size === 0) {
      toast.error("Pilih minimal satu produk.");
      return;
    }

    startTransition(async () => {
      if (mode === "edit") {
        const fd = new FormData();
        buildSchemeFormData(fd);
        fd.set("productId", editConfig.product_id);
        const res = await saveProductFokusAction(null, fd);
        if (res.success) {
          toast.success(res.message ?? "Tersimpan.");
          onSaved([{ ...editConfig, ...previewCfg, target_type: "item" }]);
          onClose();
        } else toast.error(res.error);
        return;
      }

      // add (batch)
      const ids = Array.from(selectedIds);
      const fd = new FormData();
      buildSchemeFormData(fd);
      fd.set("productIds", ids.join(","));
      const res = await saveProductFokusBatchAction(null, fd);
      if (res.success) {
        toast.success(res.message ?? "Tersimpan.");
        const rows = ids.map((pid) => {
          const p = availableProducts.find((x) => x.id === pid);
          return {
            id: `${pid}-${currentMonth}-${currentYear}`,
            tenant_apotek_id: branchId,
            product_id: pid,
            period_month: currentMonth,
            period_year: currentYear,
            target_type: "item",
            ...previewCfg,
            bonus_step: bonusType === "kelipatan" ? bonusStep : null,
            master_products: { product_name: p?.product_name ?? "Produk" },
          };
        });
        onSaved(rows);
        onClose();
      } else toast.error(res.error);
    });
  };

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "edit" ? "Edit Produk Fokus" : "Tambah Produk Fokus"}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Product picker / locked product */}
        {mode === "edit" ? (
          <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-white text-emerald-600 flex items-center justify-center shrink-0">
              <Package size={18} />
            </div>
            <div>
              <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Produk</p>
              <p className="text-sm font-black text-slate-800 uppercase">{editConfig?.master_products?.product_name}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pilih Produk (boleh lebih dari satu)</label>
              {selectedIds.size > 0 && (
                <span className="text-[10px] font-black text-emerald-600">{selectedIds.size} dipilih</span>
              )}
            </div>
            <div className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                placeholder="Cari nama produk…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all font-bold text-sm outline-none"
              />
            </div>
            <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-2xl bg-slate-50/50 p-1.5 custom-scrollbar">
              {filtered.length === 0 ? (
                <p className="p-6 text-center text-xs text-slate-400 font-bold uppercase tracking-widest italic">
                  {availableProducts.length === 0 ? "Semua produk sudah jadi fokus" : "Produk tidak ditemukan"}
                </p>
              ) : (
                filtered.map((p) => {
                  const on = selectedIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleProduct(p.id)}
                      className={`w-full px-3 py-2.5 rounded-xl mb-1 last:mb-0 flex items-center gap-3 text-left transition-all ${on ? "bg-emerald-50 text-emerald-800" : "hover:bg-white text-slate-600"}`}
                    >
                      <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${on ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-300 bg-white"}`}>
                        {on && <CheckCircle2 size={12} />}
                      </span>
                      <span className="text-xs font-black uppercase tracking-tight">{p.product_name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Target minimal */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Target minimal</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setHasMinTarget(true)} className={`px-4 py-3 rounded-2xl font-black text-xs border transition-all ${hasMinTarget ? SEG_ON : SEG_OFF}`}>Pakai target</button>
            <button type="button" onClick={() => setHasMinTarget(false)} className={`px-4 py-3 rounded-2xl font-black text-xs border transition-all ${!hasMinTarget ? SEG_ON : SEG_OFF}`}>Tanpa target</button>
          </div>
          {hasMinTarget && (
            <div className="pt-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nilai target (unit)</label>
              <input
                type="number" min={1} required
                value={targetValue || ""}
                onChange={(e) => setTargetValue(parseInt(e.target.value, 10) || 0)}
                placeholder="0"
                className="mt-1 w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
              />
            </div>
          )}
        </div>

        {/* Mode bonus */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Mode bonus</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setBonusType("flat")} className={`px-4 py-3 rounded-2xl font-black text-xs border transition-all ${bonusType === "flat" ? SEG_ON : SEG_OFF}`}>Flat (sekali)</button>
            <button type="button" onClick={() => setBonusType("kelipatan")} className={`px-4 py-3 rounded-2xl font-black text-xs border transition-all ${bonusType === "kelipatan" ? SEG_ON : SEG_OFF}`}>Kelipatan</button>
          </div>
        </div>

        {/* Nominal / kelipatan */}
        {bonusType === "flat" ? (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nominal bonus (Rp)</label>
            <CurrencyInput value={bonusValue} onChange={setBonusValue} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all" />
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Bonus kelipatan</label>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-400">Rp</span>
              <CurrencyInput value={bonusValue} onChange={setBonusValue} className="flex-1 px-3 py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all" />
              <span className="text-xs font-black text-slate-400 shrink-0">setiap</span>
              <input
                type="number" min={1}
                value={bonusStep || ""}
                onChange={(e) => setBonusStep(parseInt(e.target.value, 10) || 0)}
                placeholder="1"
                className="w-20 px-3 py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs text-center outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
              />
              <span className="text-xs font-black text-slate-400 shrink-0">unit</span>
            </div>
          </div>
        )}

        {/* Basis hitung */}
        {bonusType === "kelipatan" && hasMinTarget && (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Basis hitung</label>
            <div className="grid grid-cols-1 gap-2">
              <button type="button" onClick={() => setCountBase("excess")} className={`px-4 py-3 rounded-2xl font-bold text-xs text-left border transition-all ${countBase === "excess" ? SEG_ON : SEG_OFF}`}>Hanya kelebihan di atas target</button>
              <button type="button" onClick={() => setCountBase("full")} className={`px-4 py-3 rounded-2xl font-bold text-xs text-left border transition-all ${countBase === "full" ? SEG_ON : SEG_OFF}`}>Semua unit begitu target tercapai</button>
            </div>
          </div>
        )}

        {/* Live rule preview */}
        <div className="flex gap-3 items-start p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
          <Info size={15} className="text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">Aturan yang berlaku</p>
            <p className="text-xs font-bold text-slate-700 leading-relaxed">{describeProductFokusRule(previewCfg)}</p>
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-3.5 bg-emerald-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {mode === "edit" ? "Simpan Perubahan" : `Simpan${selectedIds.size > 0 ? ` ${selectedIds.size} Produk` : ""}`}
        </button>
      </form>
    </AnimatedModal>
  );
}
