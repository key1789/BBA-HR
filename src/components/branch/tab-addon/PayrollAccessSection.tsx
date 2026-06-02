"use client";

import { useTransition, useState } from "react";
import { Loader2, Shield, UserCog, Crown, CheckCircle2 } from "lucide-react";
import { updatePayrollAddonSettingsAction } from "@/app/bba/branches/[id]/actions";
import { toast } from "sonner";

interface Props {
  branchId: string;
  /** Current value of allow_admin_input from addon_settings.settings */
  allowAdminInput: boolean;
  /** Current value of allow_owner_input from addon_settings.settings */
  allowOwnerInput: boolean;
}

export function PayrollAccessSection({ branchId, allowAdminInput, allowOwnerInput }: Props) {
  const [adminInput, setAdminInput] = useState(allowAdminInput);
  const [ownerInput, setOwnerInput] = useState(allowOwnerInput);
  const [isPending, startTransition] = useTransition();

  function save(nextAdmin: boolean, nextOwner: boolean) {
    const fd = new FormData();
    fd.set("tenantId", branchId);
    fd.set("allow_admin_input", String(nextAdmin));
    fd.set("allow_owner_input", String(nextOwner));
    startTransition(async () => {
      const res = await updatePayrollAddonSettingsAction(undefined, fd);
      if (res.success) {
        toast.success(res.message ?? "Pengaturan akses payroll disimpan.");
      } else {
        toast.error(res.error ?? "Gagal menyimpan.");
        // Revert optimistic state on error
        setAdminInput(allowAdminInput);
        setOwnerInput(allowOwnerInput);
      }
    });
  }

  function handleAdminToggle() {
    const next = !adminInput;
    setAdminInput(next);
    save(next, ownerInput);
  }

  function handleOwnerToggle() {
    const next = !ownerInput;
    setOwnerInput(next);
    save(adminInput, next);
  }

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="p-5 bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-100/60 rounded-[24px] flex gap-4 items-start">
        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-sky-600 shadow-sm shrink-0">
          <Shield size={20} />
        </div>
        <p className="text-xs text-slate-600 leading-relaxed font-semibold">
          Tentukan siapa yang dapat mengelola konfigurasi gaji karyawan.
          Izin yang diberikan di sini memungkinkan Admin atau Owner membuka halaman{" "}
          <span className="text-sky-700 font-black text-[10px] uppercase tracking-widest">Konfigurasi Gaji</span>{" "}
          di portal masing-masing.
        </p>
      </div>

      {/* Toggle: Admin */}
      <div className="space-y-3">
        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <UserCog size={14} /> Izin Input Gaji
        </h4>

        <div className="space-y-2">
          {/* Admin toggle */}
          <button
            type="button"
            onClick={handleAdminToggle}
            disabled={isPending}
            className="w-full flex items-center justify-between p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors disabled:opacity-60 group"
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${adminInput ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"}`}>
                <UserCog size={16} />
              </div>
              <div className="text-left">
                <p className="text-sm font-black text-slate-800">Admin Apotek</p>
                <p className="text-[10px] text-slate-400 font-medium">
                  {adminInput ? "Dapat mengedit konfigurasi gaji karyawan" : "Tidak dapat mengakses konfigurasi gaji"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isPending && <Loader2 size={12} className="animate-spin text-slate-400" />}
              <div
                className={`w-11 h-6 rounded-full relative transition-colors ${adminInput ? "bg-indigo-600" : "bg-slate-200"}`}
              >
                <div
                  className={`absolute top-[2px] h-5 w-5 rounded-full bg-white shadow transition-transform ${adminInput ? "left-[calc(100%-22px)]" : "left-[2px]"}`}
                />
              </div>
              {adminInput && <CheckCircle2 size={14} className="text-indigo-500" />}
            </div>
          </button>

          {/* Owner toggle */}
          <button
            type="button"
            onClick={handleOwnerToggle}
            disabled={isPending}
            className="w-full flex items-center justify-between p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors disabled:opacity-60 group"
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${ownerInput ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-400"}`}>
                <Crown size={16} />
              </div>
              <div className="text-left">
                <p className="text-sm font-black text-slate-800">Owner</p>
                <p className="text-[10px] text-slate-400 font-medium">
                  {ownerInput ? "Dapat mengedit konfigurasi gaji karyawan" : "Tidak dapat mengakses konfigurasi gaji"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isPending && <Loader2 size={12} className="animate-spin text-slate-400" />}
              <div
                className={`w-11 h-6 rounded-full relative transition-colors ${ownerInput ? "bg-amber-500" : "bg-slate-200"}`}
              >
                <div
                  className={`absolute top-[2px] h-5 w-5 rounded-full bg-white shadow transition-transform ${ownerInput ? "left-[calc(100%-22px)]" : "left-[2px]"}`}
                />
              </div>
              {ownerInput && <CheckCircle2 size={14} className="text-amber-500" />}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
