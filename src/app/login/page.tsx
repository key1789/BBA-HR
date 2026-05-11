"use client";

import { InlineAlert } from "@/components/shared/inline-alert";
import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { loginAction } from "@/actions/auth";
import { motion } from "framer-motion";

export default function LoginPage() {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await loginAction(formData);
      if (result?.error) {
        setErrorMessage(result.error);
      }
    });
  };

  return (
    <section className="flex min-h-screen w-full items-center justify-center bg-[#E5E7EB] p-4 sm:p-8 font-sans">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex w-full max-w-[1000px] flex-col md:flex-row rounded-[2rem] overflow-hidden bg-white shadow-2xl shadow-slate-300/50 relative"
      >
        {/* LEFT / TOP PANEL (Blue Gradient & Wavy Edge) */}
        <div className="relative flex w-full md:w-[45%] flex-col items-center justify-center bg-gradient-to-b from-[#1464e6] to-[#0d4eb8] p-12 text-center text-white overflow-hidden z-10 min-h-[400px] md:min-h-[600px]">
          
          {/* Main Content inside Blue */}
          <div className="relative z-20 flex flex-col items-center">
            <h2 className="mb-8 text-xl md:text-2xl font-medium tracking-wide">Selamat Datang di</h2>
            
            <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-white p-2 shadow-lg">
              <Image
                src="/bba-logo.png"
                alt="BBA HR Logo"
                width={80}
                height={80}
                className="rounded-full"
              />
            </div>
            
            <h1 className="mb-6 text-3xl md:text-4xl font-bold tracking-tight">BBA Portal</h1>
            
            <p className="mt-4 text-[11px] md:text-xs font-light leading-relaxed opacity-90 max-w-[280px]">
              Sistem manajemen operasional apotek terpadu. Masukkan kredensial resmi Anda untuk mengakses dashboard.
            </p>
          </div>

          <div className="absolute bottom-6 left-0 right-0 flex justify-center text-[9px] uppercase tracking-widest opacity-60">
            <span>Creator Here</span> <span className="mx-4">|</span> <span>Designer Here</span>
          </div>

          {/* SVG Wave Edge (Desktop) */}
          <svg className="absolute -right-[1px] top-0 h-full w-24 text-white hidden md:block" preserveAspectRatio="none" viewBox="0 0 100 800" fill="currentColor">
             <path d="M100,0 L100,800 L0,800 C30,750 0,700 40,600 C70,500 10,400 50,300 C80,200 20,100 100,0 Z" />
          </svg>
          {/* Multiple Cloud Layers (Desktop) */}
          <svg className="absolute -right-[1px] top-0 h-full w-[120px] text-white/30 hidden md:block" preserveAspectRatio="none" viewBox="0 0 100 800" fill="currentColor">
             <path d="M100,0 L100,800 L0,800 C40,720 -10,650 50,550 C100,450 0,350 40,250 C80,150 10,50 100,0 Z" />
          </svg>
          <svg className="absolute -right-[1px] top-0 h-full w-[150px] text-white/10 hidden md:block" preserveAspectRatio="none" viewBox="0 0 100 800" fill="currentColor">
             <path d="M100,0 L100,800 L0,800 C80,750 -30,650 60,550 C-40,450 80,350 -10,250 C90,150 -30,50 100,0 Z" />
          </svg>

          {/* SVG Wave Edge (Mobile) */}
          <svg className="absolute bottom-0 left-0 w-full h-12 text-white block md:hidden" preserveAspectRatio="none" viewBox="0 0 800 100" fill="currentColor">
             <path d="M0,100 L800,100 L800,0 C750,30 700,0 600,40 C500,70 400,10 300,50 C200,80 100,20 0,100 Z" />
          </svg>
          <svg className="absolute bottom-0 left-0 w-full h-16 text-white/30 block md:hidden" preserveAspectRatio="none" viewBox="0 0 800 100" fill="currentColor">
             <path d="M0,100 L800,100 L800,0 C720,40 650,-10 550,50 C450,100 350,0 250,40 C150,80 50,10 0,100 Z" />
          </svg>
        </div>

        {/* RIGHT / BOTTOM PANEL (White Form) */}
        <div className="flex w-full md:w-[55%] flex-col justify-center bg-white p-10 sm:p-14 md:p-16 xl:p-20 relative z-20">
          <h2 className="mb-10 text-xl font-bold text-slate-800 md:text-2xl text-center md:text-left tracking-tight">
            Masuk ke Akun Anda
          </h2>

          <form className="space-y-8" onSubmit={handleLogin}>
            <div className="relative">
              <label className="mb-2 block text-[13px] font-bold text-slate-700">
                Alamat E-mail
              </label>
              <input
                name="email"
                type="email"
                placeholder="nama@apotek.local"
                className="w-full border-0 border-b-[1.5px] border-slate-200 bg-transparent px-0 py-2 text-slate-900 focus:border-[#1464e6] focus:ring-0 transition-colors font-medium placeholder:text-slate-300 placeholder:font-normal outline-none"
                required
              />
            </div>
            
            <div className="relative">
              <label className="mb-2 block text-[13px] font-bold text-slate-700">
                Kata Sandi
              </label>
              <input
                name="password"
                type="password"
                placeholder="••••••••"
                className="w-full border-0 border-b-[1.5px] border-slate-200 bg-transparent px-0 py-2 text-slate-900 focus:border-[#1464e6] focus:ring-0 transition-colors font-medium placeholder:text-slate-300 placeholder:font-normal outline-none"
                required
              />
            </div>

            <div className="flex justify-end -mt-4">
              <Link href="/forgot-password" className="text-[12px] font-bold text-sky-600 hover:text-sky-700">
                Lupa password?
              </Link>
            </div>

            {errorMessage && (
               <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                  <InlineAlert tone="error" message={errorMessage} />
               </motion.div>
            )}

            <div className="pt-2 flex justify-center md:justify-start">
              <button 
                type="submit" 
                className="w-full md:w-auto rounded-full bg-gradient-to-r from-[#1464e6] to-[#0d4eb8] px-10 py-3 text-[13px] font-bold text-white shadow-[0_8px_20px_rgba(20,100,230,0.3)] transition-all hover:shadow-[0_10px_25px_rgba(20,100,230,0.4)] active:scale-95 disabled:opacity-70"
                disabled={isPending}
              >
                {isPending ? "Memproses..." : "Log In"}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </section>
  );
}
