"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useState, useTransition, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Plus, X, Globe, Loader2, UserPlus, Building2, LayoutGrid, Mail } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { inviteBbaPortalAnalystAction, promoteToGlobalAdminAction } from "./actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { BbaPortalMenuKey } from "@/lib/bba-portal-menus";
import { cn } from "@/lib/utils";

type MenuRow = { key: BbaPortalMenuKey; label: string; pathPrefix: string };

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5"
    >
      {children}
    </label>
  );
}

export function AddAdminButton({
  branches,
  menuCatalog,
}: {
  branches: any[];
  menuCatalog: MenuRow[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<"analyst" | "global">("analyst");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [globalEmail, setGlobalEmail] = useState("");
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedMenus, setSelectedMenus] = useState<BbaPortalMenuKey[]>([]);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, close]);

  const uniqueMenuRows = menuCatalog.filter(
    (row, i, arr) => arr.findIndex((x) => x.key === row.key) === i,
  );

  const handleToggleBranch = (id: string) => {
    setSelectedBranches((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  };

  const handleToggleMenu = (key: BbaPortalMenuKey) => {
    setSelectedMenus((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleInviteAnalyst = () => {
    if (!fullName.trim() || !email.trim()) return toast.error("Nama dan email wajib diisi");
    if (selectedBranches.length === 0) return toast.error("Pilih minimal satu cabang");
    if (selectedMenus.length === 0) return toast.error("Pilih minimal satu modul");

    startTransition(async () => {
      const res = await inviteBbaPortalAnalystAction({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        tenantApotekIds: selectedBranches,
        menuKeys: selectedMenus,
      });
      if (res.success) {
        toast.success("Undangan analyst dibuat.");
        if ("inviteLink" in res && res.inviteLink) {
          try {
            await navigator.clipboard.writeText(res.inviteLink);
            toast.message("Link disalin ke clipboard");
          } catch {
            toast.message(res.inviteLink);
          }
        }
        close();
        setFullName("");
        setEmail("");
        setSelectedBranches([]);
        setSelectedMenus([]);
        router.refresh();
      } else {
        toast.error(res.error || "Gagal membuat undangan");
      }
    });
  };

  const handlePromoteGlobal = () => {
    if (!globalEmail.trim()) return toast.error("Email wajib diisi");
    startTransition(async () => {
      const res = await promoteToGlobalAdminAction(globalEmail.trim().toLowerCase());
      if (res.success) {
        toast.success("User diangkat menjadi super admin global.");
        close();
        setGlobalEmail("");
        router.refresh();
      } else {
        toast.error(res.error || "Gagal");
      }
    });
  };

  const modalId = "bba-staff-portal-dialog-title";

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-md shadow-indigo-900/15 transition hover:bg-indigo-700 hover:shadow-lg active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
      >
        <Plus size={17} strokeWidth={2.5} aria-hidden />
        Kelola staff portal
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <div
                className="fixed inset-0 z-[10050] flex items-end justify-center p-0 sm:items-center sm:p-4"
                role="presentation"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  aria-hidden
                  onClick={close}
                  className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
                />
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={modalId}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  transition={{ type: "spring", damping: 28, stiffness: 320 }}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    "relative z-[1] flex max-h-[min(92vh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-200/90 bg-white shadow-2xl",
                    "sm:max-h-[min(88vh,720px)] sm:rounded-3xl",
                  )}
                >
                  <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-br from-indigo-50 to-white px-5 py-4 sm:px-6 sm:py-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/80">
                        <UserPlus size={22} strokeWidth={2} aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <h2 id={modalId} className="text-base font-black tracking-tight text-slate-900 sm:text-lg">
                          Staff portal BBA
                        </h2>
                        <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Hanya super admin global
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={close}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                      aria-label="Tutup"
                    >
                      <X size={20} />
                    </button>
                  </header>

                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5">
                    <div
                      className="flex rounded-2xl border border-slate-200 bg-slate-50/90 p-1"
                      role="tablist"
                      aria-label="Jenis aksi"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={tab === "analyst"}
                        onClick={() => setTab("analyst")}
                        className={cn(
                          "flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[11px] font-black uppercase tracking-wider transition",
                          tab === "analyst"
                            ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80"
                            : "text-slate-500 hover:text-slate-700",
                        )}
                      >
                        <UserPlus size={15} aria-hidden />
                        Undang analyst
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={tab === "global"}
                        onClick={() => setTab("global")}
                        className={cn(
                          "flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[11px] font-black uppercase tracking-wider transition",
                          tab === "global"
                            ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80"
                            : "text-slate-500 hover:text-slate-700",
                        )}
                      >
                        <Globe size={15} aria-hidden />
                        Promote global
                      </button>
                    </div>

                    {tab === "analyst" ? (
                      <div className="mt-5 space-y-5">
                        <p className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs leading-relaxed text-slate-600">
                          Penerima akan membuat password lewat link undangan. Hanya email yang belum terdaftar di sistem.
                        </p>

                        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                          <FieldLabel htmlFor="bba-invite-name">Nama lengkap</FieldLabel>
                          <input
                            id="bba-invite-name"
                            type="text"
                            autoComplete="name"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                            placeholder="Nama di undangan"
                          />
                          <div className="mt-4">
                            <FieldLabel htmlFor="bba-invite-email">Email (akun baru)</FieldLabel>
                            <input
                              id="bba-invite-email"
                              type="email"
                              autoComplete="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                              placeholder="nama@perusahaan.com"
                            />
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-slate-800">
                              <Building2 size={16} className="text-indigo-500" aria-hidden />
                              <span className="text-sm font-bold">Cabang</span>
                            </div>
                            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-700">
                              {selectedBranches.length} dipilih
                            </span>
                          </div>
                          {branches.length === 0 ? (
                            <p className="text-sm text-slate-500">Tidak ada cabang aktif.</p>
                          ) : (
                            <ul className="max-h-40 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
                              {branches.map((branch) => {
                                const checked = selectedBranches.includes(branch.id);
                                return (
                                  <li key={branch.id}>
                                    <label
                                      className={cn(
                                        "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition",
                                        checked
                                          ? "border-indigo-200 bg-indigo-50/60 ring-1 ring-indigo-200/50"
                                          : "border-transparent bg-slate-50/80 hover:border-slate-200 hover:bg-slate-50",
                                      )}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => handleToggleBranch(branch.id)}
                                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                      />
                                      <span className="text-sm font-medium text-slate-800">{branch.name}</span>
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>

                        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-slate-800">
                              <LayoutGrid size={16} className="text-indigo-500" aria-hidden />
                              <span className="text-sm font-bold">Modul portal</span>
                            </div>
                            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-700">
                              {selectedMenus.length} dipilih
                            </span>
                          </div>
                          <ul className="max-h-44 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
                            {uniqueMenuRows.map((m) => {
                              const checked = selectedMenus.includes(m.key);
                              return (
                                <li key={m.key}>
                                  <label
                                    className={cn(
                                      "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition",
                                      checked
                                        ? "border-indigo-200 bg-indigo-50/60 ring-1 ring-indigo-200/50"
                                        : "border-transparent bg-slate-50/80 hover:border-slate-200 hover:bg-slate-50",
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => handleToggleMenu(m.key)}
                                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-sm font-medium text-slate-800">{m.label}</span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5 space-y-5">
                        <div className="rounded-2xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-xs leading-relaxed text-amber-950">
                          <strong className="font-bold">Tindakan sensitif.</strong> User yang sudah ada di{" "}
                          <code className="rounded bg-white/80 px-1 py-0.5 font-mono text-[11px]">app_users</code> akan
                          mendapat akses penuh ke semua cabang (global). Pastikan identitas email benar.
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                          <FieldLabel htmlFor="bba-promote-email">Email user</FieldLabel>
                          <input
                            id="bba-promote-email"
                            type="email"
                            autoComplete="email"
                            value={globalEmail}
                            onChange={(e) => setGlobalEmail(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                            placeholder="email yang sudah terdaftar"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-6">
                    <button
                      type="button"
                      onClick={close}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                    >
                      Batal
                    </button>
                    {tab === "analyst" ? (
                      <button
                        type="button"
                        onClick={handleInviteAnalyst}
                        disabled={isPending || branches.length === 0}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white transition hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                      >
                        {isPending ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Mail size={18} aria-hidden />}
                        Buat undangan & salin link
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handlePromoteGlobal}
                        disabled={isPending}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white transition hover:bg-indigo-700 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                      >
                        {isPending ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Globe size={18} aria-hidden />}
                        Set global admin
                      </button>
                    )}
                  </footer>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
