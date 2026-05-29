"use client";

import { useState, useTransition } from "react";
import { adminDirectEditSubmissionAction } from "@/actions/operational";
import { Pencil, X, Loader2 } from "lucide-react";

export function DirectEditModal({
  submissionId,
  page,
  selectedStatus,
  from,
  to,
  defaultValues,
}: {
  submissionId: string;
  page: number;
  selectedStatus: string;
  from: string;
  to: string;
  defaultValues: {
    omzetTotal: number;
    transactionTotal: number;
    productTotal: number;
    rejectedCustomerTotal: number;
    lateReason: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await adminDirectEditSubmissionAction(fd);
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-indigo-300 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 transition-colors"
      >
        Edit langsung
      </button>

      {open && (
        <>
          {/* Backdrop — tutup saat klik di luar */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />

          <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Pencil size={12} className="text-indigo-500" />
                Edit Data Submission
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-2">
              <input type="hidden" name="submissionId" value={submissionId} />
              <input type="hidden" name="page" value={String(page)} />
              <input type="hidden" name="status" value={selectedStatus} />
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="to" value={to} />

              <label className="block">
                <span className="text-[11px] font-semibold text-slate-600">Omzet (Rp)</span>
                <input
                  type="number"
                  name="omzet_total"
                  defaultValue={defaultValues.omzetTotal}
                  min={0}
                  step={1}
                  required
                  className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </label>

              <label className="block">
                <span className="text-[11px] font-semibold text-slate-600">Jumlah Transaksi</span>
                <input
                  type="number"
                  name="transaction_total"
                  defaultValue={defaultValues.transactionTotal}
                  min={0}
                  step={1}
                  required
                  className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </label>

              <label className="block">
                <span className="text-[11px] font-semibold text-slate-600">Jumlah Produk</span>
                <input
                  type="number"
                  name="product_total"
                  defaultValue={defaultValues.productTotal}
                  min={0}
                  step={1}
                  required
                  className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </label>

              <label className="block">
                <span className="text-[11px] font-semibold text-slate-600">Pelanggan Ditolak</span>
                <input
                  type="number"
                  name="rejected_customer_total"
                  defaultValue={defaultValues.rejectedCustomerTotal}
                  min={0}
                  step={1}
                  required
                  className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </label>

              <label className="block">
                <span className="text-[11px] font-semibold text-slate-600">Alasan Terlambat</span>
                <input
                  type="text"
                  name="late_reason"
                  defaultValue={defaultValues.lateReason ?? ""}
                  placeholder="Kosong jika tidak ada"
                  className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </label>

              <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1.5 rounded-lg leading-snug">
                Perubahan ini akan langsung <strong>disetujui (approved)</strong>. Tidak bisa dibatalkan.
              </p>

              <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isPending ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Menyimpan...
                  </>
                ) : (
                  "Simpan & Setujui"
                )}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
