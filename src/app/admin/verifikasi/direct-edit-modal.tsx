import { verifySubmissionAction } from "@/actions/operational";
import { PendingSubmitButton } from "./submit-buttons";

export function DirectEditModal({
  submissionId,
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
  return (
    <details className="relative">
      <summary className="cursor-pointer rounded-md border border-indigo-300 px-2 py-1 text-xs font-medium text-indigo-700">
        Edit langsung
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
        <p className="mb-2 text-xs font-semibold text-slate-700">
          Edit langsung + set status `edited_by_admin`.
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
          <div>Omzet: {new Intl.NumberFormat("id-ID").format(defaultValues.omzetTotal)}</div>
          <div>Transaksi: {new Intl.NumberFormat("id-ID").format(defaultValues.transactionTotal)}</div>
          <div>Produk: {new Intl.NumberFormat("id-ID").format(defaultValues.productTotal)}</div>
          <div>Rejected: {new Intl.NumberFormat("id-ID").format(defaultValues.rejectedCustomerTotal)}</div>
        </div>
        <PendingSubmitButton
          formAction={verifySubmissionAction}
          hiddenFields={{ verification: `${submissionId}:edit_directly` }}
          idleLabel="Konfirmasi edit langsung"
          pendingLabel="Memproses..."
          className="mt-3 w-full rounded-md bg-indigo-600 px-3 py-2 text-xs font-medium text-white"
        />
      </div>
    </details>
  );
}
