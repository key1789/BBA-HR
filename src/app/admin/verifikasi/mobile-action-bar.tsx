"use client";

import { verifySubmissionAction } from "@/actions/operational";
import { PendingSubmitButton } from "./submit-buttons";
import { DirectEditModal } from "./direct-edit-modal";

export function MobileActionBar({
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
  const hidden = { page: String(page), status: selectedStatus, from, to };

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
          className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white transition-colors active:bg-emerald-700 disabled:opacity-50"
        />
      </form>

      {/* Tolak — form sendiri */}
      <form className="flex-1">
        <input type="hidden" name="page" value={String(page)} />
        <input type="hidden" name="status" value={selectedStatus} />
        <input type="hidden" name="from" value={from} />
        <input type="hidden" name="to" value={to} />
        <PendingSubmitButton
          formAction={verifySubmissionAction}
          hiddenFields={{ verification: `${submissionId}:reject` }}
          idleLabel="Tolak"
          pendingLabel="..."
          className="w-full rounded-lg border border-rose-300 bg-white py-2 text-xs font-bold text-rose-700 transition-colors active:bg-rose-50 disabled:opacity-50"
        />
      </form>

      {/* DirectEditModal di luar form — buka modal fixed, tidak nested */}
      <DirectEditModal
        submissionId={submissionId}
        page={page}
        selectedStatus={selectedStatus}
        from={from}
        to={to}
        defaultValues={defaultValues}
      />
    </div>
  );
}
