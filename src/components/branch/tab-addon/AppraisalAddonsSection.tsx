"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Activity } from "lucide-react";
import { toast } from "sonner";
import { saveAddonSettingsAction } from "@/app/bba/branches/[id]/actions";

export interface AppraisalAddonsSectionProps {
  branchId: string;
  /** Frekuensi review internal per bulan. */
  reviewInternalFrequency?: number;
  onSave?: () => void;
}

export function AppraisalAddonsSection({
  branchId,
  reviewInternalFrequency,
  onSave,
}: AppraisalAddonsSectionProps) {
  const [frequency, setFrequency] = useState<number | undefined>(reviewInternalFrequency);

  useEffect(() => {
    queueMicrotask(() => setFrequency(reviewInternalFrequency));
  }, [reviewInternalFrequency]);

  const persistSettings = useCallback(
    async (addonKey: string, next: Record<string, unknown>) => {
      const formData = new FormData();
      formData.append("tenantId", branchId);
      formData.append("addonKey", addonKey);
      formData.append("settings", JSON.stringify(next));
      const res = await saveAddonSettingsAction(null, formData);
      if (res.success) {
        toast.success(res.message);
        onSave?.();
      } else toast.error(res.error);
    },
    [branchId, onSave],
  );

  return (
    <div className="space-y-8">
      <div className="p-6 bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-100/50 rounded-[24px] flex gap-5 items-start">
        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-rose-600 shadow-sm shrink-0">
          <CalendarDays size={20} />
        </div>
        <p className="text-xs text-slate-600 leading-relaxed font-semibold">
          Evaluasi antar rekan kerja membantu menjaga kualitas layanan. Tentukan{" "}
          <span className="text-rose-600 font-black text-[10px] uppercase tracking-widest">Frekuensi Penilaian</span>{" "}
          yang harus dilakukan personil setiap bulannya.
        </p>
      </div>

      <div className="space-y-4">
        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Activity size={14} /> Frekuensi Penilaian
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 4].map((freq) => {
            const isSelected = frequency === freq;
            return (
              <button
                key={freq}
                type="button"
                onClick={() => {
                  setFrequency(freq);
                  void persistSettings("review_internal", { frequency_per_month: freq });
                }}
                className={`group relative p-6 rounded-3xl border-2 transition-all duration-500 text-center overflow-hidden ${
                  isSelected
                    ? "border-rose-600 bg-white shadow-xl shadow-rose-500/10"
                    : "border-slate-100 bg-slate-50/50 hover:bg-white hover:border-slate-200"
                }`}
              >
                <div
                  className={`text-3xl font-black mb-1 transition-all duration-500 ${
                    isSelected ? "text-rose-600 scale-110" : "text-slate-300"
                  }`}
                >
                  {freq}x
                </div>
                <p
                  className={`text-[10px] font-black uppercase tracking-widest ${
                    isSelected ? "text-rose-500" : "text-slate-400"
                  }`}
                >
                  Per Bulan
                </p>
                {isSelected && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-600 animate-ping"></div>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
