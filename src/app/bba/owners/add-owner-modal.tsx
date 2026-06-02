"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useTransition, useEffect } from "react";
import { AnimatedModal } from "@/components/shared/animated-modal";
import {
  createOwnerInvitationAction,
  getPendingOwnerInvitationsAction,
  regenerateOwnerInvitationAction,
} from "./actions";
import { toast } from "sonner";
import {
  Loader2,
  Link2,
  Copy,
  RefreshCw,
  Store,
  CheckCircle2,
} from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function AddOwnerModal({ isOpen, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const [successLink, setSuccessLink] = useState<string | null>(null);
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
    if (isOpen) {
      loadInvitations();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSuccessLink(null);
    }
  }, [isOpen]);

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link undangan berhasil disalin.");
    } catch {
      toast.error("Gagal menyalin link.");
    }
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
        if (result.inviteLink) {
          setSuccessLink(result.inviteLink);
          await copyLink(result.inviteLink);
        }
        await loadInvitations();
        formEl.reset();
      }
    });
  };

  const handleRegenerate = (invitationId: string) => {
    startTransition(async () => {
      const result = await regenerateOwnerInvitationAction(invitationId);
      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        toast.success(result.message);
        if (result.inviteLink) await copyLink(result.inviteLink);
        await loadInvitations();
      }
    });
  };

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onClose}
      title="Undang Owner Baru"
    >
      <div className="space-y-5">
        {/* Info notice */}
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-3">
          <Store size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">
              Owner ≠ satu apotek
            </p>
            <p className="text-xs text-amber-900/85 mt-1 leading-relaxed">
              Yang Anda buat di sini hanya <strong>identitas owner</strong> (login). Satu owner bisa
              ditugaskan ke <strong>banyak cabang</strong> lewat menu Manajemen Apotek.
            </p>
          </div>
        </div>

        {/* Invite form */}
        <form onSubmit={handleInviteSubmit} className="space-y-4">
          <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 flex gap-3">
            <Link2 className="text-sky-600 shrink-0 mt-0.5" size={18} />
            <div>
              <p className="text-sm font-bold text-sky-900">Undangan mandiri</p>
              <p className="text-xs text-sky-800/80 mt-1">
                BBA cukup isi nama. Owner mengisi email, no. WA, dan password sendiri saat membuka link.
              </p>
            </div>
          </div>

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

          {/* Success link preview */}
          {successLink && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
              <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
              <p className="text-xs text-emerald-800 truncate flex-1">{successLink}</p>
              <button
                type="button"
                onClick={() => copyLink(successLink)}
                className="shrink-0 px-2 py-1 rounded-lg text-xs font-bold bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center gap-1"
              >
                <Copy size={11} /> Salin
              </button>
            </div>
          )}

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

        {/* Pending invitations list */}
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
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">
                        Owner — {inv.status}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => copyLink(inv.inviteLink)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-600 hover:text-sky-600 flex items-center gap-1"
                      >
                        <Copy size={12} /> Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRegenerate(inv.id)}
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
          onClick={onClose}
          className="w-full px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
        >
          Tutup
        </button>
      </div>
    </AnimatedModal>
  );
}
