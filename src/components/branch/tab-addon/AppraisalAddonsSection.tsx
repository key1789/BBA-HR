"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Info, Users, CheckCircle2, CalendarDays, Activity } from "lucide-react";
import { toast } from "sonner";
import { saveAddonSettingsAction } from "@/app/bba/branches/[id]/actions";

export type AppraisalAddonsVariant = "review_pelanggan" | "review_internal";

export interface AppraisalAddonsSectionProps {
  branchId: string;
  variant: AppraisalAddonsVariant;
  staffUsers: any[];
  /** PIC review pelanggan (app_users.id). */
  reviewPelangganPicIds?: string[];
  /** Frekuensi review internal per bulan. */
  reviewInternalFrequency?: number;
  onSave?: () => void;
}

export function AppraisalAddonsSection({
  branchId,
  variant,
  staffUsers,
  reviewPelangganPicIds = [],
  reviewInternalFrequency,
  onSave,
}: AppraisalAddonsSectionProps) {
  const [picIds, setPicIds] = useState<string[]>(reviewPelangganPicIds);
  const [frequency, setFrequency] = useState<number | undefined>(reviewInternalFrequency);

  const pelKey = useMemo(() => JSON.stringify(reviewPelangganPicIds), [reviewPelangganPicIds]);

  useEffect(() => {
    if (variant !== "review_pelanggan") return;
    queueMicrotask(() => setPicIds(JSON.parse(pelKey) as string[]));
  }, [variant, pelKey]);

  useEffect(() => {
    if (variant !== "review_internal") return;
    queueMicrotask(() => setFrequency(reviewInternalFrequency));
  }, [variant, reviewInternalFrequency]);

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

  if (variant === "review_pelanggan") {
    return (
      <div className="space-y-8">
        <div className="p-6 bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-100/50 rounded-[24px] flex gap-5 items-start">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-sky-600 shadow-sm shrink-0">
            <Info size={20} />
          </div>
          <p className="text-xs text-slate-600 leading-relaxed font-semibold">
            Fitur ini memungkinkan apotek untuk merekam kepuasan pelanggan secara sistematis. Silakan{" "}
            <span className="text-sky-600 font-black text-[10px] uppercase tracking-widest">Pilih Personil</span> yang
            bertugas mengelola input data ulasan.
          </p>
        </div>

        <div className="space-y-4">
          <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Users size={14} /> Daftar Personil (PIC)
          </h4>
          <div className="grid grid-cols-1 gap-3">
            {staffUsers.length === 0 ? (
              <p className="text-xs text-slate-500 font-medium px-2">
                Belum ada crew atau admin cabang untuk dijadikan PIC. Tambahkan pegawai di tab Manajemen Pegawai terlebih
                dulu.
              </p>
            ) : null}
            {staffUsers.map((u: any) => {
              const uid = u.app_users?.id as string;
              const isSelected = picIds.includes(uid);
              const initials =
                u.app_users?.full_name?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) || "?";

              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    const newPics = isSelected ? picIds.filter((id) => id !== uid) : [...picIds, uid];
                    setPicIds(newPics);
                    void persistSettings("review_pelanggan", { pic_user_ids: newPics });
                  }}
                  className={`group p-4 rounded-2xl border-2 text-left transition-all duration-500 flex items-center justify-between ${
                    isSelected
                      ? "border-sky-600 bg-sky-50/50 shadow-xl shadow-sky-500/5"
                      : "border-slate-100 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs transition-all duration-500 ${
                        isSelected ? "bg-sky-600 text-white rotate-6" : "bg-slate-100 text-slate-400 group-hover:bg-white"
                      }`}
                    >
                      {initials}
                    </div>
                    <div>
                      <p className="font-black text-slate-800 text-sm uppercase tracking-tight">{u.app_users.full_name}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{u.role}</p>
                    </div>
                  </div>
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-500 ${
                      isSelected ? "bg-sky-600 text-white scale-110" : "bg-slate-200 text-white"
                    }`}
                  >
                    <CheckCircle2 size={14} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

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
