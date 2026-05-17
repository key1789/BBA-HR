"use client";
import { useActionState, useEffect } from "react";
import { completeStaffPasswordResetWithTokenAction } from "@/app/bba/branches/[id]/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Loader2, Lock, ShieldCheck } from "lucide-react";

export function SetPasswordByLinkClient({ token }: { token: string }) {
  const [state, action, isPending] = useActionState(completeStaffPasswordResetWithTokenAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.success) {
      toast.success(state.message);
      setTimeout(() => router.push("/login"), 1500);
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-sky-600 p-8 text-white text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-md">
            <ShieldCheck size={32} />
          </div>
          <h1 className="text-2xl font-black tracking-tight">Ganti Password</h1>
          <p className="text-sky-100 mt-2 text-sm opacity-90">Masukkan password baru untuk akun Anda.</p>
        </div>

        <form action={action} className="p-8 space-y-6">
          <input type="hidden" name="token" value={token} />
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Lock size={12} /> Password Baru
            </label>
            <input
              type="password"
              name="password"
              required
              minLength={6}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none transition-all text-sm font-medium"
              placeholder="Minimal 6 karakter..."
            />
          </div>

          <button
            type="submit"
            disabled={isPending || state?.success}
            className="w-full bg-sky-600 hover:bg-sky-700 text-white py-4 rounded-2xl font-black text-sm shadow-xl shadow-sky-600/30 transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {isPending ? (
              <><Loader2 size={20} className="animate-spin" /> Memproses...</>
            ) : state?.success ? (
              "Berhasil!"
            ) : (
              "Simpan Password"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
