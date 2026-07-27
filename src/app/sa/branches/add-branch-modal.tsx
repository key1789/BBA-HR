"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useActionState, useEffect } from "react";
import { AnimatedModal } from "@/components/shared/animated-modal";
import { createBranchAction } from "./actions";
import { toast } from "sonner";
import { Loader2, Plus, Store, MapPin, Phone } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  owners?: any[];
}

export function AddBranchModal({ isOpen, onClose, owners = [] }: Props) {
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
    <AnimatedModal isOpen={isOpen} onClose={onClose} title="Daftarkan Apotek Baru">
      <form action={action} className="space-y-5">
        
        <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 flex gap-3">
          <Store className="text-sky-600 shrink-0" size={20} />
          <div>
            <p className="text-sm font-bold text-sky-900">Registrasi Cabang Baru</p>
            <p className="text-xs text-sky-700/80 mt-1">
              Data tab Overview akan terisi minimal: KPI bulan berjalan, semua baris add-on (mati), shift PAGI/SIANG standar, dan profil (nama/kode/alamat opsional).
            </p>
          </div>
        </div>
        
        <div className="space-y-1.5">
          <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Nama Apotek</label>
          <input 
            type="text" 
            name="name"
            required
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-medium"
            placeholder="Apotek Sehat Medika"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Kode Cabang</label>
          <input 
            type="text" 
            name="code"
            required
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-bold uppercase"
            placeholder="ASM-01"
          />
          <p className="text-[10px] text-slate-400">Digunakan sebagai prefix atau identifikasi internal (maks. 10 karakter).</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <MapPin size={12} className="text-slate-400" /> Alamat (opsional)
          </label>
          <textarea
            name="address"
            rows={2}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-medium resize-none"
            placeholder="Alamat lengkap apotek — bisa dilengkapi nanti dari Edit Profil"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Phone size={12} className="text-slate-400" /> Telepon / WA cabang (opsional)
          </label>
          <input
            type="text"
            name="phone"
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-medium"
            placeholder="Contoh: 0812xxxxxxxx"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Assign ke Owner</label>
          <select 
            name="ownerId"
            required
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-medium"
          >
            <option value="">-- Pilih Owner Apotek --</option>
            {owners.map(o => (
              <option key={o.id} value={o.id}>{o.full_name}</option>
            ))}
          </select>
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
            className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-sky-600 hover:bg-sky-700 shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <><Loader2 size={18} className="animate-spin" /> Mendaftarkan...</>
            ) : (
              <><Plus size={18} /> Daftarkan Cabang</>
            )}
          </button>
        </div>

      </form>
    </AnimatedModal>
  );
}
