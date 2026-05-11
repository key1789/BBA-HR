"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useEffect, useTransition, useState } from "react";
import { AnimatedModal } from "@/components/shared/animated-modal";
import { createStaffPasswordResetLinkAction } from "./actions";
import { toast } from "sonner";
import { Loader2, Link2, MessageCircle, Copy } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  branchId: string;
  branchName: string;
}

export function ResendAccessModal({ isOpen, onClose, user, branchId, branchName }: Props) {
  const [isPending, startTransition] = useTransition();
  const [resetLink, setResetLink] = useState("");

  const appUser = user?.app_users;

  useEffect(() => {
    if (isOpen) {
      setResetLink("");
    }
  }, [isOpen]);
  
  const handleGenerateLink = () => {
    if (!appUser?.id) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("userId", appUser.id);
      fd.append("tenantId", branchId);
      const result = await createStaffPasswordResetLinkAction(fd);
      if (result.error) {
        toast.error(result.error);
      } else if (result.success && result.inviteLink) {
        setResetLink(result.inviteLink);
        try {
          await navigator.clipboard.writeText(result.inviteLink);
          toast.success("Link reset dibuat dan disalin.");
        } catch {
          toast.success(result.message);
        }
      }
    });
  };

  const handleCopyLink = async () => {
    if (!resetLink) return;
    try {
      await navigator.clipboard.writeText(resetLink);
      toast.success("Link berhasil disalin.");
    } catch {
      toast.error("Gagal menyalin link.");
    }
  };

  const handleSendWA = () => {
    let phoneStr = appUser?.phone || "";
    if (phoneStr.startsWith("0")) {
      phoneStr = "62" + phoneStr.substring(1);
    }

    const roleLabel = user.role === 'admin_apotek' ? 'Admin Apotek' : 'Crew';
    
    const text = `Halo ${appUser?.full_name},

Berikut link untuk mengganti password akun BBA Portal Anda sebagai ${roleLabel} di ${branchName}:

🔗 Link Ganti Password: ${resetLink}

Link hanya berlaku terbatas. Jika link tidak bisa digunakan, hubungi admin untuk meminta link baru. Terima kasih!`;

    const encodedText = encodeURIComponent(text);
    
    if (phoneStr) {
      window.open(`https://wa.me/${phoneStr}?text=${encodedText}`, '_blank');
    } else {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          toast.success("Teks disalin ke clipboard! Silakan paste di WhatsApp.");
        }).catch(() => {
          toast.info("Pesan telah dibuat. Silakan salin secara manual jika perlu.");
        });
      } else {
        toast.info("Pesan telah dibuat. Silakan salin secara manual jika perlu.");
      }
      window.open(`https://web.whatsapp.com/send?text=${encodedText}`, '_blank');
    }
    
    onClose();
  };

  if (!appUser) return null;

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose} title="Kirim Link Reset Password">
      
      <div className="space-y-5">
        <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 flex gap-3">
          <Link2 className="text-sky-600 shrink-0" size={20} />
          <div>
            <p className="text-sm font-bold text-sky-900">Kirim Link Ganti Password</p>
            <p className="text-xs text-sky-700/80 mt-1">Buat link reset password untuk {appUser.full_name}. Link bisa dikirim via WA tanpa membagikan password plaintext.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Email Akun</label>
          <input
            type="text"
            disabled
            value={appUser.email}
            className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 text-sm font-medium cursor-not-allowed"
          />
        </div>

        {resetLink ? (
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Link Reset</label>
            <textarea
              value={resetLink}
              readOnly
              rows={3}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 resize-none"
            />
          </div>
        ) : null}

        <div className="pt-3 border-t border-slate-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            Tutup
          </button>
          {!resetLink ? (
            <button
              type="button"
              onClick={handleGenerateLink}
              disabled={isPending}
              className="flex-[2] px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-sky-600 hover:bg-sky-700 shadow-md shadow-sky-600/30 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-70"
            >
              {isPending ? <><Loader2 size={18} className="animate-spin" /> Membuat...</> : <><Link2 size={16} /> Buat Link Reset</>}
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
                className="flex-[2] px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <MessageCircle size={18} /> Kirim via WhatsApp
              </button>
            </>
          )}
        </div>
      </div>
    </AnimatedModal>
  );
}
