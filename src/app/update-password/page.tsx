"use client";

import { createClient } from "@/lib/supabase/client";
import { InlineAlert } from "@/components/shared/inline-alert";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const checkRecoverySession = async () => {
      try {
        const supabase = createClient();
        // Allow Supabase client to process hash-based recovery tokens first.
        await new Promise((resolve) => setTimeout(resolve, 150));
        const { data, error } = await supabase.auth.getSession();
        if (!isMounted) return;
        if (error || !data.session) {
          setHasRecoverySession(false);
          setErrorMessage("Link reset password tidak valid atau sudah kadaluwarsa. Silakan minta link baru.");
        } else {
          setHasRecoverySession(true);
        }
      } catch {
        if (!isMounted) return;
        setHasRecoverySession(false);
        setErrorMessage("Gagal memverifikasi link reset password.");
      } finally {
        if (isMounted) setIsCheckingSession(false);
      }
    };
    checkRecoverySession();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    const formData = new FormData(event.currentTarget);
    const password = (formData.get("password") as string) || "";
    const confirmPassword = (formData.get("confirmPassword") as string) || "";

    if (password.length < 6) {
      setErrorMessage("Password minimal 6 karakter.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Konfirmasi password tidak cocok.");
      return;
    }

    startTransition(async () => {
      try {
        const supabase = createClient();
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          setErrorMessage(error.message);
          return;
        }
        setSuccessMessage("Password berhasil diperbarui. Silakan login.");
        setTimeout(() => router.push("/login"), 1500);
      } catch {
        setErrorMessage("Gagal memperbarui password.");
      }
    });
  };

  return (
    <section className="flex min-h-screen w-full items-center justify-center bg-[#E5E7EB] p-4 sm:p-8 font-sans">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-black text-slate-800">Set Password Baru</h1>
        <p className="mt-2 text-sm text-slate-500">
          Masukkan password baru untuk akun Anda.
        </p>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-[13px] font-bold text-slate-700">Password Baru</label>
            <input
              name="password"
              type="password"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 outline-none focus:border-sky-500"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-[13px] font-bold text-slate-700">Konfirmasi Password</label>
            <input
              name="confirmPassword"
              type="password"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 outline-none focus:border-sky-500"
              required
            />
          </div>

          {errorMessage && <InlineAlert tone="error" message={errorMessage} />}
          {successMessage && <InlineAlert tone="success" message={successMessage} />}

          <button
            type="submit"
            disabled={isPending || isCheckingSession || !hasRecoverySession}
            className="w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-70"
          >
            {isCheckingSession ? "Memverifikasi Link..." : isPending ? "Memproses..." : "Simpan Password Baru"}
          </button>
        </form>

        <div className="mt-5 text-center">
          <Link href="/login" className="text-xs font-bold text-slate-500 hover:text-sky-600">
            Kembali ke login
          </Link>
        </div>
      </div>
    </section>
  );
}
