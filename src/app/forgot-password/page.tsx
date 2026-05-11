"use client";

import { InlineAlert } from "@/components/shared/inline-alert";
import { forgotPasswordAction } from "@/actions/auth";
import Link from "next/link";
import { useState, useTransition } from "react";

export default function ForgotPasswordPage() {
  const [isPending, startTransition] = useTransition();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await forgotPasswordAction(formData);
      if (result?.error) setErrorMessage(result.error);
      else if (result?.success) setSuccessMessage(result.message);
    });
  };

  return (
    <section className="flex min-h-screen w-full items-center justify-center bg-[#E5E7EB] p-4 sm:p-8 font-sans">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-black text-slate-800">Lupa Password</h1>
        <p className="mt-2 text-sm text-slate-500">
          Masukkan email akun Anda. Jika terdaftar, kami akan kirim link reset password.
        </p>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-[13px] font-bold text-slate-700">Alamat E-mail</label>
            <input
              name="email"
              type="email"
              placeholder="nama@apotek.local"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 outline-none focus:border-sky-500"
              required
            />
          </div>

          {errorMessage && <InlineAlert tone="error" message={errorMessage} />}
          {successMessage && <InlineAlert tone="success" message={successMessage} />}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-70"
          >
            {isPending ? "Memproses..." : "Kirim Link Reset"}
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
