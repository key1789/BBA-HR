"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { ShieldCheck, ShieldAlert, Loader2, Pencil, UserMinus, ArrowBigUpDash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { demoteGlobalAdminAction, promoteToGlobalAdminAction, toggleAdminStatusAction } from "./actions";
import { toast } from "sonner";
import { EditAnalystModal } from "./edit-analyst-modal";
import type { AdminStaffRowVm } from "./admins-staff-types";
import type { BbaPortalMenuKey } from "@/lib/bba-portal-menus";

type MenuRow = { key: BbaPortalMenuKey; label: string; pathPrefix: string };

export function AdminRowActions({
  row,
  branches,
  menuCatalog,
}: {
  row: AdminStaffRowVm;
  branches: any[];
  menuCatalog: MenuRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmDemote, setConfirmDemote] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    setConfirmDeactivate(false);
    setConfirmDemote(false);
  }, [row.id, row.is_active]);

  useEffect(() => {
    if (!confirmDeactivate || !row.is_active || isPending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmDeactivate(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmDeactivate, row.is_active, isPending]);

  useEffect(() => {
    if (!confirmDemote || isPending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmDemote(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmDemote, isPending]);

  const runToggle = () => {
    startTransition(async () => {
      const res = await toggleAdminStatusAction(row.id, row.is_active);
      if (res.success) {
        setConfirmDeactivate(false);
        toast.success(`Akun ${row.full_name} ${row.is_active ? "dinonaktifkan" : "diaktifkan"}.`);
        router.refresh();
      } else {
        toast.error(res.error || "Gagal mengubah status akun.");
      }
    });
  };

  const handlePrimaryToggleClick = () => {
    if (row.is_active && !confirmDeactivate) {
      setConfirmDeactivate(true);
      return;
    }
    runToggle();
  };

  const runPromote = () => {
    if (
      !window.confirm(
        `Angkat ${row.full_name} (${row.email}) menjadi super admin global? Akses portal menjadi penuh.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await promoteToGlobalAdminAction(row.email);
      if (res.success) {
        toast.success("User diangkat menjadi super admin global.");
        router.refresh();
      } else {
        toast.error(res.error || "Gagal");
      }
    });
  };

  const runDemote = () => {
    startTransition(async () => {
      const res = await demoteGlobalAdminAction(row.id);
      if (res.success) {
        setConfirmDemote(false);
        toast.success("Status global dicabut.");
        router.refresh();
      } else {
        toast.error(res.error || "Gagal mencabut status global.");
      }
    });
  };

  const editTarget =
    row.kind === "analyst"
      ? {
          id: row.id,
          full_name: row.full_name,
          portalMenuKeys: row.portalMenuKeys,
          analystTenantIds: row.analystTenantIds,
        }
      : null;

  return (
    <>
      <div className="flex flex-col items-end gap-2">
        {(confirmDeactivate && row.is_active) || (confirmDemote && row.is_global_admin && row.canDemoteGlobal) ? (
          <div className="flex max-w-[260px] flex-col gap-2">
            {confirmDeactivate && row.is_active && (
              <div
                role="status"
                className="rounded-xl border border-rose-100 bg-rose-50/90 px-3 py-2 text-right text-[11px] leading-snug text-rose-900 shadow-sm sm:text-left"
              >
                <p className="font-medium">Nonaktifkan akun {row.full_name}?</p>
                <p className="mt-0.5 text-rose-800/90">Pengguna tidak bisa masuk sampai diaktifkan lagi.</p>
                <p className="mt-1 text-[10px] text-rose-700/70">Tekan Esc untuk batal.</p>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDeactivate(false)}
                    disabled={isPending}
                    className="rounded-lg border border-rose-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={runToggle}
                    disabled={isPending}
                    className="rounded-lg bg-rose-600 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white transition hover:bg-rose-700 disabled:opacity-50"
                  >
                    Nonaktifkan
                  </button>
                </div>
              </div>
            )}
            {confirmDemote && row.is_global_admin && row.canDemoteGlobal && (
              <div
                role="status"
                className="rounded-xl border border-amber-100 bg-amber-50/90 px-3 py-2 text-right text-[11px] leading-snug text-amber-950 shadow-sm sm:text-left"
              >
                <p className="font-medium">Cabut status global untuk {row.full_name}?</p>
                <p className="mt-0.5 text-amber-900/90">Tanpa membership cabang, akses portal BBA bisa terbatas.</p>
                <p className="mt-1 text-[10px] text-amber-800/80">Tekan Esc untuk batal.</p>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDemote(false)}
                    disabled={isPending}
                    className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={runDemote}
                    disabled={isPending}
                    className="rounded-lg bg-amber-700 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white transition hover:bg-amber-800 disabled:opacity-50"
                  >
                    Cabut global
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {row.kind === "analyst" && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              disabled={isPending}
              title="Ubah cabang & modul"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-50"
            >
              <Pencil size={18} aria-hidden />
              <span className="sr-only">Ubah cakupan analyst</span>
            </button>
          )}

          {row.is_active && !row.is_global_admin && (
            <button
              type="button"
              onClick={runPromote}
              disabled={isPending}
              title="Angkat ke super admin global"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 transition hover:bg-indigo-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
            >
              <ArrowBigUpDash size={18} aria-hidden />
              <span className="sr-only">Promote global</span>
            </button>
          )}

          {row.is_global_admin && row.canDemoteGlobal && (
            <button
              type="button"
              onClick={() => setConfirmDemote(true)}
              disabled={isPending}
              title="Cabut status super admin global"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-900 transition hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:opacity-50"
            >
              <UserMinus size={18} aria-hidden />
              <span className="sr-only">Cabut global</span>
            </button>
          )}

          <button
            type="button"
            onClick={handlePrimaryToggleClick}
            disabled={isPending || (confirmDeactivate && row.is_active)}
            title={
              confirmDeactivate && row.is_active
                ? "Gunakan panel konfirmasi"
                : row.is_active
                  ? "Nonaktifkan seluruh akun"
                  : "Aktifkan akun"
            }
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 ${
              row.is_active
                ? "border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-rose-500"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 focus-visible:outline-emerald-600"
            }`}
          >
            {isPending ? (
              <Loader2 size={18} className="animate-spin" aria-hidden />
            ) : row.is_active ? (
              <ShieldAlert size={18} aria-hidden />
            ) : (
              <ShieldCheck size={18} aria-hidden />
            )}
            <span className="sr-only">
              {row.is_active
                ? confirmDeactivate
                  ? "Menunggu konfirmasi nonaktif"
                  : "Mulai nonaktifkan akun"
                : "Aktifkan akun"}
            </span>
          </button>
        </div>
      </div>

      <EditAnalystModal
        admin={editOpen ? editTarget : null}
        branches={branches}
        menuCatalog={menuCatalog}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
    </>
  );
}
