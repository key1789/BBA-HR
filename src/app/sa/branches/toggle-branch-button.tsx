"use client";

import { useTransition } from "react";
import { Power, PowerOff } from "lucide-react";
import { toggleBranchStatusAction } from "./actions";
import { toast } from "sonner";

export function ToggleBranchButton({ branchId, currentStatus }: { branchId: string, currentStatus: string }) {
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("branchId", branchId);
      formData.append("currentStatus", currentStatus);

      const result = await toggleBranchStatusAction(formData);
      
      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        toast.success(result.message);
      }
    });
  };

  const isActive = currentStatus === "active";

  return (
    <button 
      onClick={handleToggle}
      disabled={isPending}
      title={isActive ? "Nonaktifkan Cabang" : "Aktifkan Cabang"}
      className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
        isActive 
          ? "text-slate-300 hover:text-rose-500 hover:bg-rose-50" 
          : "text-rose-500 hover:text-emerald-500 hover:bg-emerald-50"
      }`}
    >
      {isActive ? <PowerOff size={18} /> : <Power size={18} />}
    </button>
  );
}
