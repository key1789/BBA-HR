"use client";

import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsLoading(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <section className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-3">
        <Image
          src="/bba-logo.png"
          alt="BBA HR Logo"
          width={48}
          height={48}
          className="rounded-full"
        />
        <div>
          <h1 className="text-xl font-bold text-slate-900">Login BBA HR</h1>
          <p className="text-sm text-slate-600">Masuk menggunakan akun Supabase Auth</p>
        </div>
      </div>

      <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
      <input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        placeholder="superadmin@bba.local"
      />

      <label className="mb-2 mt-4 block text-sm font-medium text-slate-700">Password</label>
      <input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        placeholder="••••••••"
      />

      {errorMessage ? (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleLogin}
        disabled={isLoading}
        className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
      >
        {isLoading ? "Memproses..." : "Masuk ke Dashboard"}
      </button>
    </section>
  );
}
