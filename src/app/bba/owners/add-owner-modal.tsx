"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useState, useTransition, useEffect } from "react";
import { AnimatedModal } from "@/components/shared/animated-modal";
import {
  createOwnerAction,
  createOwnerInvitationAction,
  getPendingOwnerInvitationsAction,
  regenerateOwnerInvitationAction,
} from "./actions";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  UserCircle2,
  CheckCircle2,
  MessageCircle,
  Link2,
  Copy,
  RefreshCw,
  Store,
} from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function AddOwnerModal({ isOpen, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<"manual" | "invite">("manual");
  const [isPending, startTransition] = useTransition();
  const [manualSuccess, setManualSuccess] = useState(false);
  const [tempData, setTempData] = useState<{
    name: string;
    email: string;
    phone: string;
    pass: string;
  } | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false);

  const loadInvitations = async () => {
    setIsLoadingInvitations(true);
    const result = await getPendingOwnerInvitationsAction();
    if (result.error) {
      toast.error(result.error);
      setPendingInvitations([]);
    } else if (result.success) {
      setPendingInvitations(result.data || []);
    }
    setIsLoadingInvitations(false);
  };

  useEffect(() => {
    if (isOpen && activeTab === "invite") {
      loadInvitations();
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (!isOpen) {
      setActiveTab("manual");
      setManualSuccess(false);
      setTempData(null);
    }
  }, [isOpen]);

  const copyInviteLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link undangan berhasil disalin.");
    } catch {
      toast.error("Gagal menyalin link undangan.");
    }
  };

  const handleManualSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setTempData({
      name: fd.get("fullName") as string,
      email: fd.get("email") as string,
      phone: (fd.get("phone") as string) || "",
      pass: fd.get("password") as string,
    });
    startTransition(async () => {
      const result = await createOwnerAction(null, fd);
      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        toast.success(result.message);
        setManualSuccess(true);
      }
    });
  };

  const handleInviteSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const formData = new FormData(formEl);
    startTransition(async () => {
      const result = await createOwnerInvitationAction(null, formData);
      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        toast.success(result.message);
        if (result.inviteLink) await copyInviteLink(result.inviteLink);
        await loadInvitations();
        formEl.reset();
      }
    });
  };

  const handleRegenerateInvite = (invitationId: string) => {
    startTransition(async () => {
      const result = await regenerateOwnerInvitationAction(invitationId);
      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        toast.success(result.message);
        if (result.inviteLink) await copyInviteLink(result.inviteLink);
        await loadInvitations();
      }
    });
  };

  const handleSendWA = () => {
    if (!tempData) return;
    let phoneStr = tempData.phone || "";
    if (phoneStr.startsWith("0")) {
      phoneStr = "62" + phoneStr.substring(1);
    }

    const text = `Halo Bpk/Ibu ${tempData.name},

Berikut adalah akses Anda untuk masuk ke sistem BBA Portal (Apotek System):

📧 Email: ${tempData.email}
🔑 Password Sementara: ${tempData.pass}

Harap segera mengubah password Anda setelah berhasil masuk ke dalam sistem. Login menggunakan halaman resmi aplikasi Anda. Terima kasih!`;

    const encodedText = encodeURIComponent(text);

    if (phoneStr) {
      window.open(`https://wa.me/${phoneStr}?text=${encodedText}`, "_blank");
    } else if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        toast.success("Teks disalin ke clipboard! Silakan kirim manual.");
      });
    }
    onClose();
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        manualSuccess ? "Owner berhasil didaftarkan" : "Daftarkan owner baru"
      }
    >
      {manualSuccess && tempData ? (
        <div className="space-y-6 py-4">
          <div className="flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
              <CheckCircle2 size={32} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Akun berhasil dibuat</h3>
              <p className="text-sm text-slate-500 mt-1">
                Kirim kredensial ke {tempData.name}. Penempatan ke satu atau banyak apotek dilakukan di{" "}
                <strong>Manajemen Apotek</strong>.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Email:</span>
              <span className="font-bold text-slate-800">{tempData.email}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Password:</span>
              <span className="font-bold text-slate-800">{tempData.pass}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">No. WA:</span>
              <span className="font-bold text-slate-800">{tempData.phone || "—"}</span>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-3 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handleSendWA}
              className="flex-[2] px-4 py-3 rounded-xl font-bold text-sm text-white bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <MessageCircle size={18} /> Kirim via WhatsApp
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-5 flex bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab("manual")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                activeTab === "manual"
                  ? "bg-white text-amber-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Buat akun baru
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("invite")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "invite"
                  ? "bg-white text-sky-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Link2 size={14} /> Undangan link
            </button>
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-3 mb-5">
            <Store size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">
                Owner ≠ satu apotek
              </p>
              <p className="text-xs text-amber-900/85 mt-1 leading-relaxed">
                Yang Anda buat di sini hanya <strong>identitas owner</strong> (login). Satu owner bisa
                ditugaskan ke <strong>banyak cabang</strong> lewat menu Manajemen Apotek (membership role owner).
              </p>
            </div>
          </div>

          {activeTab === "manual" ? (
            <form onSubmit={handleManualSubmit} className="space-y-5">
              <div className="bg-white border border-slate-100 rounded-xl p-4 flex gap-3">
                <UserCircle2 className="text-amber-600 shrink-0" size={20} />
                <div>
                  <p className="text-sm font-bold text-slate-800">Registrasi manual</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Anda mengatur password awal; owner bisa ganti setelah login.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider">
                    Nama lengkap owner
                  </label>
                  <input
                    type="text"
                    name="fullName"
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-medium"
                    placeholder="Bpk. Budi Santoso"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider">
                    No. WhatsApp (opsional)
                  </label>
                  <input
                    type="text"
                    name="phone"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-medium"
                    placeholder="0812..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider">
                    Email (login)
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-medium"
                    placeholder="budi@owner.com"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider">
                    Password awal
                  </label>
                  <input
                    type="text"
                    name="password"
                    required
                    defaultValue="12345"
                    className="w-full px-4 py-2.5 bg-amber-50/50 border border-amber-200 text-amber-700 rounded-xl focus:bg-white transition-colors text-sm font-bold"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-500/30 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isPending ? (
                    <>
                      <Loader2 size={18} className="animate-spin" /> Memproses...
                    </>
                  ) : (
                    <>
                      <Plus size={18} /> Daftarkan owner
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-5">
              <form onSubmit={handleInviteSubmit} className="space-y-4">
                <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 flex gap-3">
                  <Link2 className="text-sky-600 shrink-0" size={20} />
                  <div>
                    <p className="text-sm font-bold text-sky-900">Undangan mandiri</p>
                    <p className="text-xs text-sky-800/80 mt-1">
                      Owner mengatur password sendiri — pola sama seperti tab Undangan Link di Manajemen Pegawai.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider">
                    Nama lengkap
                  </label>
                  <input
                    type="text"
                    name="fullName"
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-medium"
                    placeholder="Nama calon owner"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-wider">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-medium"
                    placeholder="owner@apotek.com"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-sky-600 hover:bg-sky-700 shadow-md shadow-sky-600/30 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isPending ? (
                    <>
                      <Loader2 size={18} className="animate-spin" /> Membuat undangan...
                    </>
                  ) : (
                    <>
                      <Link2 size={16} /> Buat & salin link undangan
                    </>
                  )}
                </button>
              </form>

              <div className="border-t border-slate-100 pt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Undangan pending / expired
                  </p>
                  <button
                    type="button"
                    onClick={loadInvitations}
                    className="text-xs font-bold text-slate-500 hover:text-sky-600"
                  >
                    Muat ulang
                  </button>
                </div>
                {isLoadingInvitations ? (
                  <div className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium flex items-center gap-2 text-slate-400">
                    <Loader2 size={16} className="animate-spin" /> Memuat undangan...
                  </div>
                ) : pendingInvitations.length === 0 ? (
                  <div className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-500">
                    Belum ada undangan yang dipantau.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {pendingInvitations.map((inv) => (
                      <div key={inv.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-700 truncate">{inv.full_name}</p>
                            <p className="text-xs text-slate-500 truncate">{inv.email}</p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-1">
                              Owner — {inv.status}
                            </p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => copyInviteLink(inv.inviteLink)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-600 hover:text-sky-600 flex items-center gap-1"
                            >
                              <Copy size={12} /> Copy
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRegenerateInvite(inv.id)}
                              disabled={isPending}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-600 hover:text-emerald-600 flex items-center gap-1 disabled:opacity-60"
                            >
                              <RefreshCw size={12} /> Regenerate
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="w-full px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Tutup
              </button>
            </div>
          )}
        </>
      )}
    </AnimatedModal>
  );
}
