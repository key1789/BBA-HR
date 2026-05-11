"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { X, Building2, LayoutGrid, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { isKnownBbaPortalMenuKey, type BbaPortalMenuKey } from "@/lib/bba-portal-menus";
import { cn } from "@/lib/utils";
import { updateAnalystPortalAccessAction } from "./actions";

type MenuRow = { key: BbaPortalMenuKey; label: string; pathPrefix: string };

export function EditAnalystModal({
  admin,
  branches,
  menuCatalog,
  open,
  onClose,
}: {
  admin: {
    id: string;
    full_name: string;
    portalMenuKeys: string[];
    analystTenantIds: string[];
  } | null;
  branches: any[];
  menuCatalog: MenuRow[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedMenus, setSelectedMenus] = useState<BbaPortalMenuKey[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || !admin) return;
    setSelectedBranches([...admin.analystTenantIds]);
    setSelectedMenus(admin.portalMenuKeys.filter((k): k is BbaPortalMenuKey => isKnownBbaPortalMenuKey(k)));
  }, [open, admin]);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  const uniqueMenuRows = useMemo(
    () => menuCatalog.filter((row, i, arr) => arr.findIndex((x) => x.key === row.key) === i),
    [menuCatalog],
  );

  const handleToggleBranch = (id: string) => {
    setSelectedBranches((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  };

  const handleToggleMenu = (key: BbaPortalMenuKey) => {
    setSelectedMenus((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleSave = () => {
    if (!admin) return;
    if (selectedBranches.length === 0) return toast.error("Pilih minimal satu cabang");
    if (selectedMenus.length === 0) return toast.error("Pilih minimal satu modul");
    startTransition(async () => {
      const res = await updateAnalystPortalAccessAction({
        userId: admin.id,
        tenantApotekIds: selectedBranches,
        menuKeys: selectedMenus,
      });
      if (res.success) {
        toast.success("Cakupan analyst diperbarui.");
        close();
        router.refresh();
      } else {
        toast.error(res.error || "Gagal menyimpan");
      }
    });
  };

  const titleId = "bba-edit-analyst-title";

  if (!mounted || !open || !admin) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-end justify-center p-0 sm:items-center sm:p-4" role="presentation">
      <button
        type="button"
        aria-label="Tutup overlay"
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
        onClick={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[1] flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-200/90 bg-white shadow-2xl sm:max-h-[min(88vh,680px)] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-br from-sky-50 to-white px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-sky-600 shadow-sm ring-1 ring-slate-200/80">
              <Pencil size={22} strokeWidth={2} aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-base font-black tracking-tight text-slate-900 sm:text-lg">
                Ubah cakupan analyst
              </h2>
              <p className="mt-0.5 truncate text-sm font-medium text-slate-600">{admin.full_name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
            aria-label="Tutup"
          >
            <X size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-slate-800">
                <Building2 size={16} className="text-sky-500" aria-hidden />
                <span className="text-sm font-bold">Cabang</span>
              </div>
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-sky-800">
                {selectedBranches.length} dipilih
              </span>
            </div>
            {branches.length === 0 ? (
              <p className="text-sm text-slate-500">Tidak ada cabang aktif.</p>
            ) : (
              <ul className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                {branches.map((branch: any) => {
                  const checked = selectedBranches.includes(branch.id);
                  return (
                    <li key={branch.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition",
                          checked
                            ? "border-sky-200 bg-sky-50/60 ring-1 ring-sky-200/50"
                            : "border-transparent bg-slate-50/80 hover:border-slate-200 hover:bg-slate-50",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleBranch(branch.id)}
                          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span className="text-sm font-medium text-slate-800">{branch.name}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-slate-800">
                <LayoutGrid size={16} className="text-sky-500" aria-hidden />
                <span className="text-sm font-bold">Modul portal</span>
              </div>
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-sky-800">
                {selectedMenus.length} dipilih
              </span>
            </div>
            <ul className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
              {uniqueMenuRows.map((m) => {
                const checked = selectedMenus.includes(m.key);
                return (
                  <li key={m.key}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition",
                        checked
                          ? "border-sky-200 bg-sky-50/60 ring-1 ring-sky-200/50"
                          : "border-transparent bg-slate-50/80 hover:border-slate-200 hover:bg-slate-50",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleMenu(m.key)}
                        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span className="text-sm font-medium text-slate-800">{m.label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-6">
          <button
            type="button"
            onClick={close}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || branches.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-black uppercase tracking-wide text-white transition hover:bg-sky-700 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
          >
            {isPending ? <Loader2 size={18} className="animate-spin" aria-hidden /> : null}
            Simpan perubahan
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
