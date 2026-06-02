"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useState, useTransition, useEffect, useCallback } from "react";
import { AnimatedModal } from "@/components/shared/animated-modal";
import {
  assignExistingCrewAction,
  createStaffInvitationAction,
  getAvailableUsersForBranch,
  getPendingStaffInvitationsAction,
  regenerateStaffInvitationAction,
} from "./actions";
import { toast } from "sonner";
import { Loader2, UserPlus, Store, Users, Link2, Copy, RefreshCw } from "lucide-react";
import { InfoTooltip } from "@/components/shared/info-tooltip";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeForEmail(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function suggestCrewEmail(fullName: string, branchCode: string): string {
  const firstName = fullName.trim().split(/\s+/)[0] ?? "";
  const name = normalizeForEmail(firstName);
  const code = normalizeForEmail(branchCode);
  return name && code ? `${name}.${code}@bba.id` : "";
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  isOpen: boolean;
  onClose: () => void;
  branchId: string;
  branchName: string;
  branchCode?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddCrewModal({ isOpen, onClose, branchId, branchName, branchCode = "" }: Props) {
  const [activeTab, setActiveTab] = useState<"existing" | "invite">("invite");
  const [isPending, startTransition] = useTransition();
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false);

  // "Undangan Link" tab — controlled email with auto-suggest
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteEmailTouched, setInviteEmailTouched] = useState(false);

  const loadInvitations = useCallback(async () => {
    setIsLoadingInvitations(true);
    const result = await getPendingStaffInvitationsAction(branchId);
    if ("error" in result) {
      toast.error(result.error);
      setPendingInvitations([]);
    } else if (result.success) {
      setPendingInvitations((result.data || []).filter((i: any) => i.role === "crew"));
    }
    setIsLoadingInvitations(false);
  }, [branchId]);

  useEffect(() => {
    if (isOpen && activeTab === "existing") {
      setIsLoadingUsers(true);
      getAvailableUsersForBranch(branchId).then((users) => {
        setAvailableUsers(users);
        setIsLoadingUsers(false);
      });
    }
    if (isOpen && activeTab === "invite") {
      loadInvitations();
    }
  }, [isOpen, activeTab, branchId, loadInvitations]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setActiveTab("invite");
      setInviteName("");
      setInviteEmail("");
      setInviteEmailTouched(false);
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

  // "Pilih Pegawai Terdaftar"
  const handleSubmitExisting = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await assignExistingCrewAction(formData);
      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        toast.success(result.message);
        onClose();
      }
    });
  };

  // "Undangan Link"
  const handleSubmitInvite = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const formData = new FormData(formEl);
    formData.append("tenantId", branchId);

    startTransition(async () => {
      const result = await createStaffInvitationAction(null, formData);
      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        toast.success(result.message);
        if (result.inviteLink) {
          await copyInviteLink(result.inviteLink);
        }
        await loadInvitations();
        setInviteName("");
        setInviteEmail("");
        setInviteEmailTouched(false);
      }
    });
  };

  const handleRegenerateInvite = (invitationId: string) => {
    startTransition(async () => {
      const result = await regenerateStaffInvitationAction(invitationId);
      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        toast.success(result.message);
        if (result.inviteLink) {
          await copyInviteLink(result.inviteLink);
        }
        await loadInvitations();
      }
    });
  };

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose} title="Tambah Crew">
      {/* Tab selector */}
      <div className="mb-5 flex bg-slate-100 p-1 rounded-xl">
        <button
          onClick={() => setActiveTab("invite")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "invite" ? "bg-white text-sky-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Link2 size={14} /> Undangan Link
          {activeTab === "invite" && (
            <InfoTooltip content="Buat akun baru. Karyawan akan menerima link undangan untuk set password." side="top" width="w-64" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("existing")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "existing" ? "bg-white text-sky-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Users size={14} /> Pegawai Terdaftar
          {activeTab === "existing" && (
            <InfoTooltip content="Tambahkan user yang sudah memiliki akun di sistem ke cabang ini." side="top" width="w-64" />
          )}
        </button>
      </div>

      {/* Branch label */}
      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center">
          <Store size={16} />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Penempatan Cabang</p>
          <p className="text-sm font-bold text-slate-800 leading-none mt-0.5">{branchName}</p>
        </div>
      </div>

      {/* ── Tab: Undangan Link ── */}
      {activeTab === "invite" ? (
        <div className="space-y-5">
          <form onSubmit={handleSubmitInvite} className="space-y-4">
            <input type="hidden" name="role" value="crew" />
            <p className="text-xs text-slate-500 font-medium">
              Link undangan berlaku <strong className="text-slate-700">48 jam</strong>. Pegawai membuat
              password sendiri saat pertama kali mengakses link.
            </p>

            {/* Nama */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Nama Lengkap</label>
              <input
                type="text"
                name="fullName"
                required
                value={inviteName}
                onChange={(e) => {
                  const val = e.target.value;
                  setInviteName(val);
                  if (!inviteEmailTouched) {
                    setInviteEmail(suggestCrewEmail(val, branchCode));
                  }
                }}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-medium"
                placeholder="Nama lengkap pegawai"
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  Alamat Email
                  <InfoTooltip content="Email digunakan untuk login dan menerima undangan akses." side="right" width="w-56" />
                </label>
                {!inviteEmailTouched && inviteEmail && (
                  <span className="text-[9px] font-bold text-sky-500 uppercase tracking-widest">
                    Saran otomatis
                  </span>
                )}
              </div>
              <input
                type="email"
                name="email"
                required
                value={inviteEmail}
                onChange={(e) => {
                  setInviteEmail(e.target.value);
                  setInviteEmailTouched(true);
                }}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-medium"
                placeholder={
                  branchCode ? `nama.${normalizeForEmail(branchCode)}@bba.id` : "email@bba.id"
                }
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-sky-600 hover:bg-sky-700 shadow-md shadow-sky-600/30 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <><Loader2 size={18} className="animate-spin" /> Membuat Undangan...</>
              ) : (
                <><Link2 size={16} /> Buat & Salin Link Undangan</>
              )}
            </button>
          </form>

          {/* Daftar undangan pending crew */}
          <div className="border-t border-slate-100 pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Undangan Pending / Expired
              </p>
              <button
                type="button"
                onClick={loadInvitations}
                className="text-xs font-bold text-slate-500 hover:text-sky-600"
              >
                Muat Ulang
              </button>
            </div>
            {isLoadingInvitations ? (
              <div className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium flex items-center gap-2 text-slate-400">
                <Loader2 size={16} className="animate-spin" /> Memuat undangan...
              </div>
            ) : pendingInvitations.length === 0 ? (
              <div className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-500">
                Belum ada undangan yang perlu dipantau.
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
                          Crew · {inv.status}
                        </p>
                      </div>
                      <div className="flex gap-2">
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
        </div>

      /* ── Tab: Pilih Pegawai Terdaftar ── */
      ) : (
        <form onSubmit={handleSubmitExisting} className="space-y-5">
          <input type="hidden" name="tenantId" value={branchId} />
          <input type="hidden" name="role" value="crew" />
          <p className="text-xs text-slate-500 font-medium">
            Pegawai yang sudah punya akun di sistem lain, ditugaskan sebagai{" "}
            <strong className="text-slate-700">crew</strong> di cabang ini.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-500 uppercase tracking-wider">
              Pilih pegawai terdaftar
            </label>
            {isLoadingUsers ? (
              <div className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium flex items-center gap-2 text-slate-400">
                <Loader2 size={16} className="animate-spin" /> Memuat data pegawai...
              </div>
            ) : availableUsers.length === 0 ? (
              <div className="w-full px-4 py-2.5 bg-slate-50 border border-rose-200 text-rose-500 rounded-xl text-sm font-medium">
                Tidak ada pegawai terdaftar yang bisa ditambahkan.
              </div>
            ) : (
              <select
                name="userId"
                required
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white transition-colors text-sm font-medium"
              >
                <option value="">-- Pilih Pegawai --</option>
                {availableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name} ({user.email})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isPending || isLoadingUsers || availableUsers.length === 0}
              className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-sky-600 hover:bg-sky-700 shadow-md shadow-sky-600/30 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <><Loader2 size={18} className="animate-spin" /> Menugaskan...</>
              ) : (
                <><UserPlus size={18} /> Tugaskan Pegawai</>
              )}
            </button>
          </div>
        </form>
      )}
    </AnimatedModal>
  );
}
