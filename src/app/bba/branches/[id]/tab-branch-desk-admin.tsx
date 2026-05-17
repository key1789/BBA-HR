"use client";

import { useActionState, useEffect, useState, useCallback } from "react";
import { useFormStatus } from "react-dom";
import { GlassCard } from "@/components/shared/glass-card";
import {
  createBranchDeskAdminAccountAction,
  resetBranchDeskAdminPasswordAction,
  getPendingStaffInvitationsAction,
  regenerateStaffInvitationAction,
  type BranchDeskAdminActionState,
} from "./actions";
import { toast } from "sonner";
import { KeyRound, UserPlus, Shield, Clock, Copy, CheckCircle2, RefreshCw, AlertCircle } from "lucide-react";

interface BranchDeskPersonnelRow {
  id: string;
  role?: string | null;
  user_id?: string | null;
  app_users?: {
    id?: string;
    full_name?: string | null;
    email?: string | null;
    is_branch_desk_account?: boolean | null;
  } | null;
}

function FormSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-slate-800 disabled:opacity-60"
    >
      {pending ? "Memproses…" : label}
    </button>
  );
}

function CreateDeskAdminForm({ branchId }: { branchId: string }) {
  const [state, action] = useActionState(createBranchDeskAdminAccountAction, undefined as BranchDeskAdminActionState);

  useEffect(() => {
    if (!state) return;
    if ("error" in state && state.error) toast.error(state.error);
    if ("success" in state && state.success) toast.success(state.message);
  }, [state]);

  return (
    <form action={action} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <input type="hidden" name="tenantId" value={branchId} />
      <p className="md:col-span-2 text-xs text-slate-500">
        Nama di profil dibuat otomatis dari nama cabang (mis. «Admin cabang — …»). Isi hanya kredensial login.
      </p>
      <div className="md:col-span-1">
        <label className="text-[10px] font-black uppercase text-slate-400">Email login</label>
        <input
          name="email"
          type="email"
          required
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800"
        />
      </div>
      <div className="md:col-span-1">
        <label className="text-[10px] font-black uppercase text-slate-400">Password awal (min. 8)</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800"
        />
      </div>
      <div className="md:col-span-2">
        <FormSubmit label="Buat akun admin cabang" />
      </div>
    </form>
  );
}

function PendingAdminInvitations({ branchId }: { branchId: string }) {
  const [invitations, setInvitations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const result = await getPendingStaffInvitationsAction(branchId);
    if (result.success) {
      setInvitations((result.data || []).filter((i: any) => i.role === "admin_apotek"));
    }
    setIsLoading(false);
  }, [branchId]);

  useEffect(() => { load(); }, [load]);

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
    if (result.error) toast.error(result.error);
    else { toast.success("Link diperbarui."); await load(); }
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
            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
          });
          return (
            <div key={inv.id} className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isExpired ? "bg-rose-50/40" : ""}`}>
              <div>
                <p className="text-sm font-bold text-slate-800">{inv.full_name}</p>
                <p className="text-xs text-slate-400">{inv.email}</p>
                <div className={`flex items-center gap-1 mt-1 text-xs ${isExpired ? "text-rose-500 font-semibold" : "text-slate-400"}`}>
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
                    {isRegenerating ? <RefreshCw size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                    Perbarui Link
                  </button>
                ) : (
                  <button
                    onClick={() => handleCopy(inv.inviteLink, inv.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${isCopied ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"}`}
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

function ResetDeskPasswordForm({ branchId, userId }: { branchId: string; userId: string }) {
  const [state, action] = useActionState(resetBranchDeskAdminPasswordAction, undefined as BranchDeskAdminActionState);

  useEffect(() => {
    if (!state) return;
    if ("error" in state && state.error) toast.error(state.error);
    if ("success" in state && state.success) toast.success(state.message);
  }, [state]);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="tenantId" value={branchId} />
      <input type="hidden" name="userId" value={userId} />
      <div>
        <label className="text-[10px] font-black uppercase text-slate-400">Password baru</label>
        <input
          name="password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          className="mt-1 w-48 rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
      </div>
      <FormSubmit label="Reset password" />
    </form>
  );
}

export function TabBranchDeskAdmin({ branch, users }: { branch: { id: string; name: string }; users: BranchDeskPersonnelRow[] }) {
  const deskUsers = users.filter((u) => u.role === "admin_apotek" && u.app_users?.is_branch_desk_account);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
          <KeyRound size={22} className="text-sky-600" />
          Akun portal admin cabang
        </h2>
        <p className="text-sm text-slate-500 mt-1 max-w-2xl">
          Akun login portal admin (verifikasi, approval) — <strong className="text-slate-700">bukan crew</strong>. Cukup email + password;
          nama profil diisi otomatis. Tidak masuk KPI/payroll/roster; tidak bisa isi submission harian.
        </p>
      </div>

      <PendingAdminInvitations branchId={branch.id} />

      <GlassCard variant="light" className="p-6 space-y-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
          <UserPlus size={16} /> Buat akun baru
        </h3>
        <CreateDeskAdminForm branchId={branch.id} />
      </GlassCard>

      <GlassCard variant="light" className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <Shield size={16} className="text-sky-600" />
          <span className="text-sm font-black text-slate-800 uppercase tracking-tight">Daftar akun meja</span>
        </div>
        {deskUsers.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">Belum ada akun admin cabang.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {deskUsers.map((row) => {
              const name = row.app_users?.full_name ?? "—";
              const email = row.app_users?.email ?? "—";
              const uid = row.user_id ?? row.app_users?.id;
              if (!uid) return null;
              return (
                <div key={row.id} className="p-5 flex flex-col lg:flex-row lg:items-end gap-4 justify-between">
                  <div>
                    <p className="font-black text-slate-800">{name}</p>
                    <p className="text-xs text-slate-500 font-medium">{email}</p>
                  </div>
                  <ResetDeskPasswordForm branchId={branch.id} userId={uid} />
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
