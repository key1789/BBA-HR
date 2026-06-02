"use client";

import { useTransition, useEffect, useState, useCallback } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import {
  createBranchDeskAdminAccountAction,
  getPendingStaffInvitationsAction,
  regenerateStaffInvitationAction,
  toggleMembershipStatusAction,
  createStaffPasswordResetLinkAction,
  type BranchDeskAdminActionState,
} from "./actions";
import { toast } from "sonner";
import {
  KeyRound,
  UserPlus,
  Shield,
  Clock,
  Copy,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Loader2,
  Link2,
  PowerOff,
  Power,
  RotateCcw,
} from "lucide-react";
import { InfoTooltip } from "@/components/shared/info-tooltip";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeForEmail(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function suggestAdminEmail(branchCode: string): string {
  const code = normalizeForEmail(branchCode);
  return code ? `admin.${code}@bba.id` : "";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BranchDeskPersonnelRow {
  id: string; // membership id
  role?: string | null;
  user_id?: string | null;
  is_active?: boolean | null;
  app_users?: {
    id?: string;
    full_name?: string | null;
    email?: string | null;
    is_branch_desk_account?: boolean | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Create desk admin — invitation-based
// ---------------------------------------------------------------------------

function CreateDeskAdminInviteForm({
  branchId,
  branchCode,
}: {
  branchId: string;
  branchCode: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState(() => suggestAdminEmail(branchCode));
  const [emailTouched, setEmailTouched] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const suggested = suggestAdminEmail(branchCode);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createBranchDeskAdminAccountAction(
        undefined as BranchDeskAdminActionState,
        formData,
      );
      if (!result) return;
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(result.message);
        setGeneratedLink(result.inviteLink ?? null);
      }
    });
  };

  const handleCopy = async () => {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Gagal menyalin link.");
    }
  };

  const handleReset = () => {
    setGeneratedLink(null);
    setEmail(suggested);
    setEmailTouched(false);
    setCopied(false);
  };

  if (generatedLink) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-emerald-600">
          <CheckCircle2 size={18} />
          <span className="text-sm font-bold">Undangan berhasil dibuat</span>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
              Link Aktivasi · Berlaku 7 Hari
            </span>
          </div>
          <div className="bg-white border border-emerald-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-600 break-all">
            {generatedLink}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                copied
                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
              {copied ? "Tersalin!" : "Salin Link"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 transition-colors"
            >
              <UserPlus size={13} /> Buat Undangan Baru
            </button>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Salin link di atas dan bagikan kepada admin. Admin akan membuat password sendiri saat pertama kali mengakses link ini.
          Link hanya bisa digunakan satu kali.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="tenantId" value={branchId} />
      <p className="text-xs text-slate-500">
        Masukkan email login untuk akun admin cabang. Link aktivasi (berlaku 7 hari) akan digenerate — salin
        dan bagikan kepada admin. Nama profil diisi otomatis dari nama cabang.
      </p>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1">
            Email login
            <InfoTooltip content="Username untuk login ke aplikasi kasir. Tidak bisa diubah setelah dibuat." side="right" width="w-56" />
          </label>
          {!emailTouched && suggested && (
            <span className="text-[9px] font-bold text-sky-500 uppercase tracking-widest">
              Saran otomatis
            </span>
          )}
        </div>
        <input
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailTouched(true);
          }}
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-slate-800 disabled:opacity-60 transition-colors"
      >
        {isPending ? (
          <><Loader2 size={14} className="animate-spin" /> Membuat...</>
        ) : (
          <><Link2 size={14} /> Buat & Dapatkan Link Aktivasi</>
        )}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Pending admin invitations
// ---------------------------------------------------------------------------

function PendingAdminInvitations({ branchId }: { branchId: string }) {
  const [invitations, setInvitations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const result = await getPendingStaffInvitationsAction(branchId);
    if ("success" in result && result.success) {
      setInvitations((result.data || []).filter((i: any) => i.role === "admin_apotek"));
    }
    setIsLoading(false);
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCopy = async (inviteLink: string, id: string) => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      toast.error("Gagal menyalin link.");
    }
  };

  const handleRegenerate = async (invitationId: string) => {
    setRegeneratingId(invitationId);
    const result = await regenerateStaffInvitationAction(invitationId);
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Link diperbarui (berlaku 7 hari).");
      await load();
    }
    setRegeneratingId(null);
  };

  if (isLoading || invitations.length === 0) return null;

  const pending = invitations.filter((i) => i.status === "pending");
  const expired = invitations.filter((i) => i.status === "expired");

  return (
    <GlassCard variant="light" className="p-0 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-amber-50/60 flex items-center gap-2">
        <Clock size={15} className="text-amber-500" />
        <span className="text-sm font-black text-slate-700 uppercase tracking-tight">
          Undangan Menunggu Aktivasi
        </span>
        <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold ml-1">
          {pending.length} pending{expired.length > 0 ? ` · ${expired.length} expired` : ""}
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        {invitations.map((inv) => {
          const isExpired = inv.status === "expired";
          const isCopied = copiedId === inv.id;
          const isRegenerating = regeneratingId === inv.id;
          const expiredLabel = new Date(inv.expires_at).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          });
          return (
            <div
              key={inv.id}
              className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isExpired ? "bg-rose-50/40" : ""}`}
            >
              <div>
                <p className="text-sm font-bold text-slate-800">{inv.full_name}</p>
                <p className="text-xs text-slate-400">{inv.email}</p>
                <div
                  className={`flex items-center gap-1 mt-1 text-xs ${isExpired ? "text-rose-500 font-semibold" : "text-slate-400"}`}
                >
                  {isExpired && <AlertCircle size={11} />}
                  Kadaluwarsa: {expiredLabel}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isExpired ? (
                  <button
                    onClick={() => handleRegenerate(inv.id)}
                    disabled={isRegenerating}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
                  >
                    {isRegenerating ? (
                      <RefreshCw size={11} className="animate-spin" />
                    ) : (
                      <RefreshCw size={11} />
                    )}
                    Perbarui Link
                  </button>
                ) : (
                  <button
                    onClick={() => handleCopy(inv.inviteLink, inv.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                      isCopied
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                    }`}
                  >
                    {isCopied ? <CheckCircle2 size={11} /> : <Copy size={11} />}
                    {isCopied ? "Tersalin" : "Salin Link"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Reset password — generate link, admin bagikan ke user
// ---------------------------------------------------------------------------

function DeskAdminResetLink({
  branchId,
  userId,
}: {
  branchId: string;
  userId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("userId", userId);
      fd.append("tenantId", branchId);
      const result = await createStaffPasswordResetLinkAction(fd);
      if ("error" in result) {
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

  const handleCopy = async () => {
    if (!resetLink) return;
    try {
      await navigator.clipboard.writeText(resetLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Gagal menyalin link.");
    }
  };

  if (resetLink) {
    return (
      <div className="mt-3 space-y-2">
        <div className="bg-sky-50 border border-sky-100 rounded-lg px-3 py-2 text-xs font-mono text-slate-600 break-all">
          {resetLink}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              copied
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {copied ? <CheckCircle2 size={11} /> : <Copy size={11} />}
            {copied ? "Tersalin" : "Salin"}
          </button>
          <button
            type="button"
            onClick={() => { setResetLink(null); setCopied(false); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <RotateCcw size={11} /> Buat Baru
          </button>
          <span className="text-[10px] text-slate-400">Berlaku 24 jam</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition-colors disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <Link2 size={11} />
        )}
        Buat Link Reset Password
      </button>
      <InfoTooltip content="Membuat link akses baru. Link lama yang sudah dibagikan akan otomatis kadaluarsa." side="right" width="w-64" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle active/inactive button
// ---------------------------------------------------------------------------

function ToggleDeskAdminStatus({
  membershipId,
  isActive,
  branchId,
}: {
  membershipId: string;
  isActive: boolean;
  branchId: string;
}) {
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("membershipId", membershipId);
      fd.set("currentStatus", String(isActive));
      fd.set("branchId", branchId);
      const result = await toggleMembershipStatusAction(fd);
      if ("error" in result) toast.error(result.error);
      else toast.success(result.message ?? (isActive ? "Akun dinonaktifkan." : "Akun diaktifkan."));
    });
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50 ${
        isActive
          ? "text-rose-600 bg-rose-50 border-rose-200 hover:bg-rose-100"
          : "text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
      }`}
    >
      {isPending ? (
        <Loader2 size={12} className="animate-spin" />
      ) : isActive ? (
        <PowerOff size={12} />
      ) : (
        <Power size={12} />
      )}
      {isActive ? "Nonaktifkan" : "Aktifkan"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main tab
// ---------------------------------------------------------------------------

export function TabBranchDeskAdmin({
  branch,
  users,
}: {
  branch: { id: string; name: string; code?: string };
  users: BranchDeskPersonnelRow[];
}) {
  const deskUsers = users.filter(
    (u) => u.role === "admin_apotek" && u.app_users?.is_branch_desk_account,
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
          <KeyRound size={22} className="text-sky-600" />
          Akun Portal Admin Cabang
          <InfoTooltip content="Akun terbatas untuk operasional harian kasir. Tidak bisa mengakses pengaturan cabang, KPI, atau payroll." side="right" width="w-72" />
        </h2>
        <p className="text-sm text-slate-500 mt-1 max-w-2xl">
          Akun login portal admin (verifikasi, approval) —{" "}
          <strong className="text-slate-700">bukan crew</strong>. Tidak masuk KPI/payroll/roster.
        </p>
      </div>

      {/* Undangan pending */}
      <PendingAdminInvitations branchId={branch.id} />

      {/* Form buat undangan baru */}
      <GlassCard variant="light" className="p-6 space-y-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
          <UserPlus size={16} /> Buat undangan aktivasi baru
        </h3>
        <CreateDeskAdminInviteForm branchId={branch.id} branchCode={branch.code ?? ""} />
      </GlassCard>

      {/* Daftar akun aktif */}
      <GlassCard variant="light" className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <Shield size={16} className="text-sky-600" />
          <span className="text-sm font-black text-slate-800 uppercase tracking-tight">
            Daftar akun admin cabang
          </span>
        </div>
        {deskUsers.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Belum ada akun admin cabang yang aktif.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {deskUsers.map((row) => {
              const name = row.app_users?.full_name ?? "—";
              const email = row.app_users?.email ?? "—";
              const uid = row.user_id ?? row.app_users?.id;
              const isActive = row.is_active ?? false;
              if (!uid) return null;
              return (
                <div key={row.id} className="p-5 flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-slate-800">{name}</p>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">{email}</p>
                      <div
                        className={`inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tight border ${
                          isActive
                            ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                            : "bg-rose-50 border-rose-100 text-rose-700"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-rose-500"}`}
                        />
                        {isActive ? "Aktif" : "Nonaktif"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <ToggleDeskAdminStatus
                        membershipId={row.id}
                        isActive={isActive}
                        branchId={branch.id}
                      />
                      <InfoTooltip content="Nonaktif = karyawan tidak bisa login ke aplikasi. Akses diblokir di semua device." side="left" width="w-60" />
                    </div>
                  </div>
                  {isActive && <DeskAdminResetLink branchId={branch.id} userId={uid} />}
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
