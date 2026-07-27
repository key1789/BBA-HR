"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Loader2, XCircle } from "lucide-react";
import { cancelBbaPortalStaffInvitationAction, getBbaPortalInvitationLinkAction } from "./actions";

export type PendingInviteRow = {
  id: string;
  email: string;
  full_name: string;
  expires_at: string;
};

export function PendingInvitesClient({ invites }: { invites: PendingInviteRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const copyLink = (invitationId: string) => {
    startTransition(async () => {
      const res = await getBbaPortalInvitationLinkAction(invitationId);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      try {
        await navigator.clipboard.writeText(res.inviteLink);
        toast.success("Link undangan disalin.");
      } catch {
        toast.message(res.inviteLink);
      }
    });
  };

  const cancel = (invitationId: string) => {
    if (!window.confirm("Batalkan undangan ini? Email yang sama bisa diundang lagi setelah dibatalkan.")) return;
    startTransition(async () => {
      const res = await cancelBbaPortalStaffInvitationAction(invitationId);
      if (res.success) {
        toast.success("Undangan dibatalkan.");
        router.refresh();
      } else {
        toast.error(res.error || "Gagal membatalkan.");
      }
    });
  };

  return (
    <ul className="divide-y divide-slate-100">
      {invites.map((inv) => (
        <li key={inv.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <p className="font-semibold text-slate-900">{inv.full_name}</p>
            <p className="text-sm text-slate-500">{inv.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <span className="text-xs text-slate-500">Berakhir {String(inv.expires_at).slice(0, 10)}</span>
            <button
              type="button"
              disabled={isPending}
              onClick={() => copyLink(inv.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Link2 size={14} aria-hidden />}
              Salin link
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => cancel(inv.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-rose-800 transition hover:bg-rose-100 disabled:opacity-50"
            >
              <XCircle size={14} aria-hidden />
              Batalkan
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
