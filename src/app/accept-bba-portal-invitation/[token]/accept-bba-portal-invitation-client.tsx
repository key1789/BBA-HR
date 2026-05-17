"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useActionState, useEffect } from "react";
import { completeBbaPortalStaffInvitationAction } from "@/app/bba/admins/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Loader2, User, Lock, BadgeCheck } from "lucide-react";

interface Props {
  invitation: any;
  token: string;
}

export function AcceptBbaPortalInvitationClient({ invitation, token }: Props) {
  const [state, action, isPending] = useActionState(completeBbaPortalStaffInvitationAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.success) {
      toast.success(state.message);
      setTimeout(() => router.replace("/login"), 1500);
    } else if (state && "error" in state && state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-indigo-600 p-8 text-white text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-md">
            <BadgeCheck size={32} />
          </div>
          <h1 className="text-2xl font-black tracking-tight">Aktivasi Analyst BBA</h1>
          <p className="text-indigo-100 mt-2 text-sm opacity-90">
            Set password untuk menyelesaikan undangan akun portal BBA (akses terbatas).
          </p>
        </div>

        <form action={action} className="p-8 space-y-6">
          <input type="hidden" name="token" value={token} />

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <User size={12} /> Nama Lengkap
              </label>
              <div className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-700">
                {invitation.full_name}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email</label>
              <div className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-700">
                {invitation.email}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Lock size={12} /> Buat Password
              </label>
              <input
                type="password"
                name="password"
                required
                minLength={8}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm font-medium"
                placeholder="Minimal 8 karakter..."
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending || Boolean(state && "success" in state && state.success)}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-black text-sm shadow-xl shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {isPending ? (
              <>
                <Loader2 size={20} className="animate-spin" /> Memproses...
              </>
            ) : state && "success" in state && state.success ? (
              "Selesai"
            ) : (
              "Aktifkan akun"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
