"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useActionState, useEffect } from "react";
import { AnimatedModal } from "@/components/shared/animated-modal";
import { editOwnerAction } from "./actions";
import { toast } from "sonner";
import { Loader2, Save, UserCircle2 } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  owner: any;
}

export function EditOwnerModal({ isOpen, onClose, owner }: Props) {
  const [state, action, isPending] = useActionState(editOwnerAction, null);

  useEffect(() => {
    if (state?.success) {
      toast.success(state.message);
      onClose();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, onClose]);

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose} title="Edit Profil Owner">
      <form action={action} className="space-y-5">
        <input type="hidden" name="userId" value={owner.id} />
        
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex gap-3">
          <UserCircle2 className="text-slate-400 shrink-0" size={20} />
          <div>
            <p className="text-sm font-bold text-slate-700">Pembaruan Kredensial</p>
            <p className="text-xs text-slate-500 mt-1">Hati-hati saat mengubah Email atau Password. Pastikan Anda memberitahu Owner mengenai perubahan data login mereka.</p>
          </div>
        </div>
        
        {/* INFORMASI DASAR */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <div className="w-1.5 h-4 bg-emerald-500 rounded-full"></div>
            <h3 className="text-sm font-bold text-slate-700">Informasi Dasar</h3>
          </div>
          
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Nama Lengkap Owner</label>
            <input 
              type="text" 
              name="fullName"
              required
              defaultValue={owner.full_name}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-medium"
              placeholder="Bpk. Budi Santoso"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-500 uppercase tracking-wider">No. WhatsApp</label>
            <input 
              type="text" 
              name="phone"
              defaultValue={owner.phone || ""}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-medium"
              placeholder="0812..."
            />
          </div>
        </div>

        {/* KREDENSIAL LOGIN */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <div className="w-1.5 h-4 bg-rose-500 rounded-full"></div>
            <h3 className="text-sm font-bold text-slate-700">Kredensial Login</h3>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Email (Untuk Login)</label>
            <input 
              type="email" 
              name="email"
              required
              defaultValue={owner.email}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-medium"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Password Baru (Opsional)</label>
            <input 
              type="text" 
              name="password"
              placeholder="Biarkan kosong jika tidak diubah"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-medium"
            />
          </div>
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
            className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <><Loader2 size={18} className="animate-spin" /> Menyimpan...</>
            ) : (
              <><Save size={18} /> Simpan Perubahan</>
            )}
          </button>
        </div>

      </form>
    </AnimatedModal>
  );
}
