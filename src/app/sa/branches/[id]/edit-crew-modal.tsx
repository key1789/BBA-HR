"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useTransition } from "react";
import { AnimatedModal } from "@/components/shared/animated-modal";
import { editCrewAction } from "./actions";
import { toast } from "sonner";
import { Loader2, UserCog, Store, Info } from "lucide-react";
import { InfoTooltip } from "@/components/shared/info-tooltip";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  branchId: string;
  branchName: string;
  userData: any;
}

export function EditCrewModal({ isOpen, onClose, branchId, branchName, userData }: Props) {
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    startTransition(async () => {
      const result = await editCrewAction(null, formData);
      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        toast.success(result.message);
        onClose();
      }
    });
  };

  if (!userData) return null;

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose} title="Edit data crew">
      <form key={userData?.id || ""} onSubmit={handleSubmit} className="space-y-5">
        
        {/* Hidden inputs to pass branch context and user IDs */}
        <input type="hidden" name="tenantId" value={branchId} />
        <input type="hidden" name="membershipId" value={userData.id} />
        <input type="hidden" name="userId" value={userData.app_users?.id || userData.user_id || ""} />

        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center">
            <Store size={16} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Penempatan Cabang</p>
            <p className="text-sm font-bold text-slate-800 leading-none mt-0.5">{branchName}</p>
          </div>
        </div>
        
        <div className="space-y-1.5">
          <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
            Nama Lengkap
            <InfoTooltip content="Nama lengkap tampil di semua laporan, rapor, dan slip gaji karyawan." side="right" width="w-64" />
          </label>
          <input
            type="text"
            name="fullName"
            required
            defaultValue={userData.app_users?.full_name}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-medium"
            placeholder="John Doe"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Alamat Email</label>
          <input 
            type="email" 
            name="email"
            required
            defaultValue={userData.app_users?.email}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-medium"
            placeholder="john@apotek.com"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
            Peran di cabang ini
            <InfoTooltip content="Mengubah role akan mengubah akses menu di aplikasi karyawan secara langsung." side="right" width="w-64" />
          </label>
          <p className="text-sm font-bold text-slate-800 capitalize">{String(userData.role || "").replace("_", " ")}</p>
          <p className="text-[11px] text-slate-500">
            Peran tidak diubah dari sini. Admin meja: tab «Akun admin cabang».
          </p>
        </div>

        <div className="flex items-start gap-2 bg-amber-50 text-amber-700 p-3 rounded-xl border border-amber-100">
          <Info size={16} className="shrink-0 mt-0.5" />
          <p className="text-xs font-medium leading-relaxed">
            Perubahan nama dan email akan disinkronkan ke akun login. Untuk reset password gunakan menu <strong>Kirim Link Reset</strong> di dropdown aksi crew.
          </p>
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
            className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-sky-600 hover:bg-sky-700 shadow-md shadow-sky-600/30 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <><Loader2 size={18} className="animate-spin" /> Menyimpan...</>
            ) : (
              <><UserCog size={18} /> Simpan Perubahan</>
            )}
          </button>
        </div>

      </form>
    </AnimatedModal>
  );
}
