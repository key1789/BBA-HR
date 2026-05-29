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
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-indigo-300 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 transition-colors"
      >
        Edit
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />

          {/* Modal */}
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                <Pencil size={13} className="text-indigo-500" />
                Edit Data Submission
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
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
                  className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
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
                  className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
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
                  className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
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
                  className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </label>

              <label className="block">
                <span className="text-[11px] font-semibold text-slate-600">Alasan Terlambat</span>
                <input
                  type="text"
                  name="late_reason"
                  defaultValue={defaultValues.lateReason ?? ""}
                  placeholder="Kosong jika tidak ada"
                  className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </label>

              <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-700">
                Perubahan ini akan langsung <strong>disetujui (approved)</strong>. Tidak bisa dibatalkan.
              </p>

              <button
                type="submit"
                disabled={isPending}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
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
        </div>
      )}
    </>
  );
}
