"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  X, UploadCloud, FileSpreadsheet, Loader2, Download, CheckCircle2, AlertTriangle,
} from "lucide-react";
import {
  previewMasterProductsImportAction,
  commitMasterProductsImportAction,
} from "./actions";

type PreviewResult = {
  toAdd: string[];
  dupExistingSample: string[];
  counts: { totalRows: number; toAdd: number; dupExisting: number; dupInFile: number; empty: number };
};

export function ImportProductsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [committing, setCommitting] = useState(false);

  if (!open) return null;

  const reset = () => { setFileName(""); setPreview(null); if (inputRef.current) inputRef.current.value = ""; };
  const close = () => { reset(); onClose(); };

  const handleFile = (file: File) => {
    setFileName(file.name);
    setPreview(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res: any = await previewMasterProductsImportAction(null, fd);
      if (res?.error) { toast.error(res.error); return; }
      setPreview(res as PreviewResult);
    });
  };

  const handleCommit = () => {
    if (!preview || preview.toAdd.length === 0) return;
    setCommitting(true);
    const fd = new FormData();
    fd.append("names", JSON.stringify(preview.toAdd));
    startTransition(async () => {
      const res: any = await commitMasterProductsImportAction(null, fd);
      setCommitting(false);
      if (res?.error) { toast.error(res.error); return; }
      toast.success(res.message);
      router.refresh();
      close();
    });
  };

  const c = preview?.counts;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4" onClick={close}>
      <div
        className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800">Import Produk dari Excel</h3>
              <p className="text-[11px] text-slate-400">Format .xlsx atau .csv, kolom pertama = Nama Produk.</p>
            </div>
          </div>
          <button onClick={close} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <a
            href="/api/products/import-template"
            className="inline-flex items-center gap-2 text-[11px] font-black text-sky-600 hover:text-sky-700 uppercase tracking-widest"
          >
            <Download size={13} /> Unduh Template Excel
          </a>

          <label className="block cursor-pointer">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <div className="border-2 border-dashed border-slate-200 rounded-2xl px-6 py-8 text-center hover:border-emerald-400 hover:bg-emerald-50/40 transition-all">
              {isPending && !committing ? (
                <Loader2 size={28} className="mx-auto text-emerald-500 animate-spin" />
              ) : (
                <UploadCloud size={28} className="mx-auto text-slate-300" />
              )}
              <p className="mt-2 text-xs font-black text-slate-600">
                {fileName || "Klik untuk pilih file"}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Maks. 5.000 baris · 2 MB</p>
            </div>
          </label>

          {preview && c && (
            <div className="space-y-3 animate-in fade-in duration-300">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-emerald-50 p-3 text-center">
                  <p className="text-2xl font-black text-emerald-600 leading-none">{c.toAdd}</p>
                  <p className="text-[9px] font-black text-emerald-700/70 uppercase tracking-widest mt-1">Akan ditambah</p>
                </div>
                <div className="rounded-2xl bg-amber-50 p-3 text-center">
                  <p className="text-2xl font-black text-amber-600 leading-none">{c.dupExisting + c.dupInFile}</p>
                  <p className="text-[9px] font-black text-amber-700/70 uppercase tracking-widest mt-1">Duplikat dilewati</p>
                </div>
                <div className="rounded-2xl bg-slate-100 p-3 text-center">
                  <p className="text-2xl font-black text-slate-500 leading-none">{c.empty}</p>
                  <p className="text-[9px] font-black text-slate-500/70 uppercase tracking-widest mt-1">Baris kosong</p>
                </div>
              </div>

              {c.dupExisting > 0 && (
                <p className="flex items-start gap-1.5 text-[11px] text-amber-600 font-semibold">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  {c.dupExisting} produk sudah ada di master &amp; dilewati{preview.dupExistingSample.length ? `: ${preview.dupExistingSample.slice(0, 8).join(", ")}${c.dupExisting > 8 ? "…" : ""}` : "."}
                </p>
              )}

              {preview.toAdd.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50/50 p-2 space-y-0.5">
                  {preview.toAdd.slice(0, 100).map((n, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1 text-xs font-bold text-slate-600">
                      <CheckCircle2 size={12} className="text-emerald-500 shrink-0" /> {n}
                    </div>
                  ))}
                  {preview.toAdd.length > 100 && (
                    <p className="px-2 py-1 text-[10px] text-slate-400 italic">…dan {preview.toAdd.length - 100} lainnya</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          <button onClick={close} className="px-4 py-2.5 text-xs font-black text-slate-500 hover:text-slate-700 rounded-xl transition-colors">
            Batal
          </button>
          <button
            onClick={handleCommit}
            disabled={!preview || preview.toAdd.length === 0 || committing}
            className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-black text-xs shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {committing ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
            {preview ? `Tambahkan ${preview.toAdd.length} Produk` : "Tambahkan"}
          </button>
        </div>
      </div>
    </div>
  );
}
