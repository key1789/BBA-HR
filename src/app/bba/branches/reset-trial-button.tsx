"use client";

import { useState, useTransition } from "react";
import { resetTrialBranchAction } from "./actions";
import { toast } from "sonner";
import { RotateCcw, Loader2, AlertTriangle } from "lucide-react";

interface Props {
  branchId: string;
  branchName: string;
}

export function ResetTrialButton({ branchId, branchName }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleReset = () => {
    startTransition(async () => {
      const result = await resetTrialBranchAction(branchId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(result.message ?? `Data ${branchName} berhasil direset.`);
      }
      setConfirming(false);
    });
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-black text-rose-600 uppercase tracking-wide flex items-center gap-1">
          <AlertTriangle size={10} /> Yakin?
        </span>
        <button
          type="button"
          onClick={handleReset}
          disabled={isPending}
          className="px-2 py-1 rounded-lg text-[9px] font-black bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-60 flex items-center gap-1"
        >
          {isPending ? <Loader2 size={10} className="animate-spin" /> : "Ya"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="px-2 py-1 rounded-lg text-[9px] font-black bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-60"
        >
          Batal
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="px-2.5 py-1.5 rounded-lg text-[9px] font-black bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 flex items-center gap-1 transition-colors"
    >
      <RotateCcw size={10} />
      Reset
    </button>
  );
}
