"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useActionState, useTransition, useEffect } from "react";
import { AnimatedModal } from "@/components/shared/animated-modal";
import { editOwnerAction, createOwnerPasswordResetLinkAction } from "@/app/bba/owners/actions";
import { toast } from "sonner";
import {
  Mail, Phone, Edit, KeyRound, Loader2, Save,
  UserCircle2, Copy, MessageCircle, Link2, ArrowLeft,
  CheckCircle2, XCircle,
} from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  ownerData: any;       // app_users row
  isOwnerActive: boolean;
}

type View = "detail" | "edit" | "reset";

export function OwnerDetailModal({ isOpen, onClose, ownerData, isOwnerActive }: Props) {
  const [view, setView] = useState<View>("detail");
  const [resetLink, setResetLink] = useState("");
  const [isPendingReset, startResetTransition] = useTransition();

  const [editState, editAction, isPendingEdit] = useActionState(editOwnerAction, null);

  // Reset view & link when modal closes
  useEffect(() => {
    if (!isOpen) {
      setView("detail");
      setResetLink("");
    }
  }, [isOpen]);

  // Handle edit result
  useEffect(() => {
    if (editState?.success) {
      toast.success(editState.message);
      setView("detail");
    } else if (editState?.error) {
      toast.error(editState.error);
    }
  }, [editState]);

  const handleGenerateResetLink = () => {
    startResetTransition(async () => {
      const fd = new FormData();
      fd.append("userId", ownerData.id);
      const result = await createOwnerPasswordResetLinkAction(fd);
      if (result.error) {
        toast.error(result.error);
      } else if (result.success && result.inviteLink) {
        setResetLink(result.inviteLink);
        try {
          await navigator.clipboard.writeText(result.inviteLink);
          toast.success("Link reset dibuat & disalin ke clipboard.");
        } catch {
          toast.success(result.message ?? "Link berhasil dibuat.");
        }
      }
    });
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(resetLink);
      toast.success("Link berhasil disalin.");
    } catch {
      toast.error("Gagal menyalin link.");
    }
  };

  const handleSendWA = () => {
    let phoneStr = ownerData.phone || "";
    if (phoneStr.startsWith("0")) phoneStr = "62" + phoneStr.substring(1);
    const text =
      `Halo ${ownerData.full_name},\n\n` +
      `Berikut link untuk mengganti password akun Owner Portal Anda:\n\n` +
      `🔗 ${resetLink}\n\n` +
      `Link hanya berlaku terbatas. Hubungi admin jika perlu link baru. Terima kasih!`;
    const encoded = encodeURIComponent(text);
    window.open(
      phoneStr
        ? `https://wa.me/${phoneStr}?text=${encoded}`
        : `https://web.whatsapp.com/send?text=${encoded}`,
      "_blank"
    );
    onClose();
  };

  if (!ownerData) return null;

  const title =
    view === "edit"  ? "Edit Profil Owner" :
    view === "reset" ? "Reset Password Owner" :
    "Detail Owner";

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose} title={title}>

      {/* ══════════ DETAIL VIEW ══════════ */}
      {view === "detail" && (
        <div className="space-y-5">

          {/* Owner card */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center font-black text-2xl shadow-sm border-2 border-sky-200/60 shrink-0">
                {ownerData.full_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-base leading-none">
                  {ownerData.full_name}
                </h3>
                <span className={`mt-2 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${
                  isOwnerActive
                    ? "text-emerald-600 bg-emerald-50 border border-emerald-100"
                    : "text-rose-600 bg-rose-50 border border-rose-100"
                }`}>
                  {isOwnerActive
                    ? <><CheckCircle2 size={10} /> Active Owner</>
                    : <><XCircle size={10} /> Inactive Owner</>}
                </span>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-200/60">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shrink-0 border border-slate-100 shadow-sm">
                  <Mail size={14} className="text-slate-400" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Email Login</p>
                  <p className="text-sm font-bold text-slate-700">{ownerData.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shrink-0 border border-slate-100 shadow-sm">
                  <Phone size={14} className="text-slate-400" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">No. WhatsApp</p>
                  <p className="text-sm font-bold text-slate-700">
                    {ownerData.phone || <span className="text-slate-400 font-medium italic">Belum diisi</span>}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setView("edit")}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-sky-50 border border-sky-100 text-sky-700 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-sky-100 transition-colors"
            >
              <Edit size={14} /> Edit Profil
            </button>
            <button
              type="button"
              onClick={() => setView("reset")}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-amber-50 border border-amber-100 text-amber-700 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-100 transition-colors"
            >
              <KeyRound size={14} /> Reset Password
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-xl font-bold text-sm text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            Tutup
          </button>
        </div>
      )}

      {/* ══════════ EDIT VIEW ══════════ */}
      {view === "edit" && (
        <form key={ownerData.id} action={editAction} className="space-y-5">
          <input type="hidden" name="userId" value={ownerData.id} />

          {/* Back nav */}
          <button
            type="button"
            onClick={() => setView("detail")}
            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft size={12} /> Kembali ke Detail
          </button>

          {/* Warning */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex gap-3">
            <UserCircle2 className="text-slate-400 shrink-0 mt-0.5" size={18} />
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Hati-hati saat mengubah Email. Pastikan Anda memberitahu Owner mengenai perubahan data login mereka.
            </p>
          </div>

          {/* Informasi Dasar */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
              <h3 className="text-sm font-bold text-slate-700">Informasi Dasar</h3>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Nama Lengkap</label>
              <input
                type="text"
                name="fullName"
                required
                defaultValue={ownerData.full_name}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-colors text-sm font-medium outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wider">No. WhatsApp</label>
              <input
                type="text"
                name="phone"
                defaultValue={ownerData.phone || ""}
                placeholder="0812..."
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-colors text-sm font-medium outline-none"
              />
            </div>
          </div>

          {/* Kredensial Login */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-1.5 h-4 bg-rose-500 rounded-full" />
              <h3 className="text-sm font-bold text-slate-700">Kredensial Login</h3>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Email (untuk login)</label>
              <input
                type="email"
                name="email"
                required
                defaultValue={ownerData.email}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-colors text-sm font-medium outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Password Baru <span className="normal-case font-medium text-slate-400">(opsional)</span></label>
              <input
                type="text"
                name="password"
                placeholder="Biarkan kosong jika tidak diubah"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-colors text-sm font-medium outline-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-100 flex gap-3">
            <button
              type="button"
              onClick={() => setView("detail")}
              className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isPendingEdit}
              className="flex-[2] px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-70"
            >
              {isPendingEdit
                ? <><Loader2 size={16} className="animate-spin" /> Menyimpan...</>
                : <><Save size={16} /> Simpan Perubahan</>}
            </button>
          </div>
        </form>
      )}

      {/* ══════════ RESET PASSWORD VIEW ══════════ */}
      {view === "reset" && (
        <div className="space-y-5">
          {/* Back nav */}
          <button
            type="button"
            onClick={() => { setView("detail"); setResetLink(""); }}
            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft size={12} /> Kembali ke Detail
          </button>

          {/* Info */}
          <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 flex gap-3">
            <Link2 className="text-sky-600 shrink-0 mt-0.5" size={18} />
            <p className="text-xs text-sky-700 font-medium leading-relaxed">
              Buat link reset password untuk <strong className="font-black">{ownerData.full_name}</strong>.
              Link bisa dikirim via WhatsApp tanpa perlu membagikan password secara langsung.
            </p>
          </div>

          {/* Email read-only */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Email Akun</label>
            <input
              type="text"
              disabled
              value={ownerData.email}
              className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 text-sm font-medium cursor-not-allowed"
            />
          </div>

          {/* Reset link display */}
          {resetLink && (
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Link Reset</label>
              <textarea
                value={resetLink}
                readOnly
                rows={3}
                className="w-full px-3 py-2.5 bg-slate-50 border border-emerald-200 rounded-xl text-xs font-medium text-slate-600 resize-none"
              />
            </div>
          )}

          {/* Footer */}
          <div className="pt-3 border-t border-slate-100 flex gap-3">
            <button
              type="button"
              onClick={() => { setView("detail"); setResetLink(""); }}
              className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Tutup
            </button>

            {!resetLink ? (
              <button
                type="button"
                onClick={handleGenerateResetLink}
                disabled={isPendingReset}
                className="flex-[2] px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-sky-600 hover:bg-sky-700 shadow-md shadow-sky-600/20 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-70"
              >
                {isPendingReset
                  ? <><Loader2 size={16} className="animate-spin" /> Membuat...</>
                  : <><Link2 size={16} /> Buat Link Reset</>}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-4 py-2.5 rounded-xl font-bold text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-2"
                >
                  <Copy size={16} /> Copy
                </button>
                <button
                  type="button"
                  onClick={handleSendWA}
                  className="flex-[2] px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <MessageCircle size={16} /> Kirim via WhatsApp
                </button>
              </>
            )}
          </div>
        </div>
      )}

    </AnimatedModal>
  );
}
