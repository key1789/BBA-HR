"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useActionState, useEffect } from "react";
import { AnimatedModal } from "@/components/shared/animated-modal";
import { createBranchAction } from "./actions";
import { toast } from "sonner";
import { Loader2, FlaskConical, MapPin } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  owners: { id: string; full_name: string }[];
}

export function AddTrialBranchModal({ isOpen, onClose, owners }: Props) {
  const [state, action, isPending] = useActionState(createBranchAction, null);

  useEffect(() => {
    if (state?.success) {
      toast.success(state.message);
      onClose();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, onClose]);

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose} title="Tambah Apotek Trial">
      <form action={action} className="space-y-5">
        {/* is_trial = true (hidden) */}
        <input type="hidden" name="is_trial" value="true" />

        {/* Info banner */}
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3">
          <FlaskConical className="text-amber-600 shrink-0 mt-0.5" size={18} />
          <div>
            <p className="text-sm font-bold text-amber-900">Apotek Trial / Demo</p>
            <p className="text-xs text-amber-800/80 mt-1">
              Apotek ini akan ditandai sebagai <strong>TRIAL</strong>. Data operasionalnya bisa di-reset kapan saja tanpa memengaruhi apotek produksi.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Nama Apotek Trial</label>
          <input
            type="text"
            name="name"
            required
            defaultValue="Apotek Demo"
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-medium"
            placeholder="Apotek Demo"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Kode Cabang</label>
          <input
            type="text"
            name="code"
            required
            defaultValue="DEMO-01"
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-bold uppercase"
            placeholder="DEMO-01"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <MapPin size={12} className="text-slate-400" /> Alamat (opsional)
          </label>
          <textarea
            name="address"
            rows={2}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-medium resize-none"
            placeholder="Jl. Demo No. 1, Kota Contoh"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Assign ke Owner Demo</label>
          <select
            name="ownerId"
            required
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-medium"
          >
            <option value="">-- Pilih Owner --</option>
            {owners.map(o => (
              <option key={o.id} value={o.id}>{o.full_name}</option>
            ))}
          </select>
          {owners.length === 0 && (
            <p className="text-[10px] text-rose-500">
              Belum ada akun owner demo. Buat owner baru via menu Owners lalu aktifkan toggle &ldquo;Akun Demo&rdquo;.
            </p>
          )}
        </div>

        <div className="pt-4 border-t border-slate-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-500/30 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <><Loader2 size={18} className="animate-spin" /> Membuat...</>
            ) : (
              <><FlaskConical size={18} /> Buat Apotek Trial</>
            )}
          </button>
        </div>
      </form>
    </AnimatedModal>
  );
}
