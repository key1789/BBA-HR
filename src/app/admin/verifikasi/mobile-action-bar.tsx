"use client";

import { verifySubmissionAction } from "@/actions/operational";
import { PendingSubmitButton } from "./submit-buttons";
import { DirectEditModal } from "./direct-edit-modal";
import { RejectModal } from "./reject-modal";

export function MobileActionBar({
  submissionId,
  page,
  selectedStatus,
  from,
  to,
  defaultValues,
  focusProducts = [],
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
    rejectedMedicineTotal: number;
    lateReason: string | null;
  };
  focusProducts?: { product_id: string; product_name: string; quantity_sold: number }[];
}) {
  return (
    <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-3 py-2.5">
      {/* Setujui — form sendiri, tidak ada nested form */}
      <form className="flex-1">
        <input type="hidden" name="page" value={String(page)} />
        <input type="hidden" name="status" value={selectedStatus} />
        <input type="hidden" name="from" value={from} />
        <input type="hidden" name="to" value={to} />
        <PendingSubmitButton
          formAction={verifySubmissionAction}
          hiddenFields={{ verification: `${submissionId}:approve` }}
          idleLabel="Setujui"
          pendingLabel="..."
          className="w-full rounded-xl bg-emerald-600 py-2 text-xs font-black text-white transition-colors active:bg-emerald-700 disabled:opacity-50"
        />
      </form>

      {/* Tolak — modal alasan wajib (bukan form langsung) */}
      <div className="flex-1">
        <RejectModal
          submissionId={submissionId}
          page={page}
          selectedStatus={selectedStatus}
          from={from}
          to={to}
          triggerClassName="w-full rounded-xl border border-rose-300 bg-white py-2 text-xs font-black text-rose-700 transition-colors active:bg-rose-50"
        />
      </div>

      {/* DirectEditModal di luar form — buka modal fixed, tidak nested */}
      <DirectEditModal
        submissionId={submissionId}
        page={page}
        selectedStatus={selectedStatus}
        from={from}
        to={to}
        defaultValues={defaultValues}
        focusProducts={focusProducts}
      />
    </div>
  );
}
