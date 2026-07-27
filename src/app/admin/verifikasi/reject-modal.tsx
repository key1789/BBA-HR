"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { verifySubmissionAction } from "@/actions/operational";
import { Ban, X, Loader2 } from "lucide-react";

/**
 * Modal Tolak dengan ALASAN WAJIB. Alasan dikirim sebagai `note` → tercatat di
 * riwayat verifikasi (submission_verifications) sehingga crew tahu apa yang salah.
 */
export function RejectModal({
  submissionId,
  page,
  selectedStatus,
  from,
  to,
  triggerClassName,
  triggerLabel = "Tolak",
}: {
  submissionId: string;
  page: number;
  selectedStatus: string;
  from: string;
  to: string;
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await verifySubmissionAction(fd);
      setOpen(false);
    });
  }

  const overlay = open ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => !isPending && setOpen(false)}
      />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <Ban size={13} className="text-rose-500" />
            Tolak Closingan
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={isPending}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-40"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="hidden" name="verification" value={`${submissionId}:reject`} />
          <input type="hidden" name="page" value={String(page)} />
          <input type="hidden" name="status" value={selectedStatus} />
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />

          <label className="block">
            <span className="mb-0.5 block text-[11px] font-semibold text-slate-600">
              Alasan penolakan <span className="text-rose-500">*</span>
            </span>
            <textarea
              name="note"
              required
              rows={3}
              placeholder="Jelaskan apa yang perlu diperbaiki crew…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
          </label>

          <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] leading-snug text-rose-700">
            Alasan ini akan terlihat crew di riwayat input. Penolakan <strong>tidak</strong> memberi
            hukuman poin — hanya menandai closingan perlu diperbaiki.
          </p>

          <button
            type="submit"
            disabled={isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2.5 text-xs font-bold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
          >
            {isPending ? (
              <>
                <Loader2 size={12} className="animate-spin" /> Memproses…
              </>
            ) : (
              "Tolak & Kirim Alasan"
            )}
          </button>
        </form>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
        {triggerLabel}
      </button>
      {overlay && createPortal(overlay, document.body)}
    </>
  );
}
