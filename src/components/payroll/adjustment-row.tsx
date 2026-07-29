"use client";

import { Trash2 } from "lucide-react";
import { CurrencyInput } from "@/components/shared/currency-input";
import { cn } from "@/lib/utils";

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export type AdjustmentValue = {
  name: string;
  amount: number;
  basis: "monthly" | "daily";
};

/**
 * Baris penyesuaian gaji kustom (penambahan/pengurangan).
 * Layout kartu: NAMA full-width di baris sendiri (mudah diakses walau kolom sempit)
 * lalu nominal + basis (Bulanan / per hari) + hapus di baris kedua.
 * SATU sumber dipakai konfigurasi gaji admin, owner, dan SA (one-logic-one-place).
 */
export function PayrollAdjustmentRow({
  value,
  accent,
  workDays,
  onUpdate,
  onRemove,
}: {
  value: AdjustmentValue;
  accent: "emerald" | "rose";
  /** Jika diberikan, tampilkan estimasi "× N hari" untuk basis harian. */
  workDays?: number;
  onUpdate: (patch: Partial<AdjustmentValue>) => void;
  onRemove: () => void;
}) {
  const isDaily = value.basis === "daily";
  const amtCls =
    accent === "emerald"
      ? "border-emerald-200 text-emerald-600 bg-emerald-50/30 focus:border-emerald-400"
      : "border-rose-200 text-rose-600 bg-rose-50/30 focus:border-rose-400";

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-2.5 space-y-2">
      <input
        type="text"
        placeholder={
          accent === "emerald"
            ? "Nama penambahan (mis. Uang Lembur)"
            : "Nama pengurangan (mis. Kasbon)"
        }
        value={value.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800 bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10 outline-none transition-all"
      />
      <div className="flex items-center gap-2">
        <CurrencyInput
          value={value.amount}
          onChange={(val) => onUpdate({ amount: val })}
          className={cn(
            "flex-1 min-w-0 rounded-lg border px-2.5 py-2 text-sm font-black outline-none transition-all",
            amtCls,
          )}
        />
        <div className="flex shrink-0 rounded-lg border border-slate-200 overflow-hidden text-[9px] font-black uppercase">
          <button
            type="button"
            onClick={() => onUpdate({ basis: "monthly" })}
            className={cn(
              "px-2.5 py-2 transition-colors",
              !isDaily ? "bg-slate-700 text-white" : "bg-white text-slate-400 hover:text-slate-600",
            )}
          >
            Bulanan
          </button>
          <button
            type="button"
            onClick={() => onUpdate({ basis: "daily" })}
            className={cn(
              "px-2.5 py-2 transition-colors",
              isDaily ? "bg-amber-500 text-white" : "bg-white text-slate-400 hover:text-amber-600",
            )}
          >
            / hari
          </button>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-rose-300 hover:text-rose-500 transition-colors shrink-0"
        >
          <Trash2 size={14} />
        </button>
      </div>
      {isDaily && value.amount > 0 && workDays != null && workDays > 0 && (
        <p className="text-[9px] text-amber-600 font-bold">
          × {workDays} hari ≈ {IDR.format(value.amount * workDays)} · aktual ikut hari masuk
        </p>
      )}
    </div>
  );
}
