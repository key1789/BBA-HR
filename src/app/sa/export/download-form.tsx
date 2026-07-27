"use client";

import { useState } from "react";
import { FileDown, Loader2, ChevronDown, Calendar, FileText, Table2 } from "lucide-react";

type Branch = { id: string; name: string; code: string };
type Format = "pdf" | "xlsx";

const MONTHS_ID = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

function buildYears(): number[] {
  const cur = new Date().getFullYear();
  const years = [];
  for (let y = cur; y >= 2024; y--) years.push(y);
  return years;
}

const FORMAT_OPTIONS: { key: Format; label: string; icon: typeof FileText; desc: string }[] = [
  { key: "pdf",  label: "PDF",   icon: FileText, desc: "6 halaman · siap cetak / share" },
  { key: "xlsx", label: "Excel", icon: Table2,   desc: "6 sheet · bisa diedit & filter" },
];

export function DownloadForm({ branches }: { branches: Branch[] }) {
  const now = new Date();
  const [branchId, setBranchId] = useState<string>(branches[0]?.id ?? "");
  const [month,    setMonth]    = useState<number>(now.getMonth() + 1);
  const [year,     setYear]     = useState<number>(now.getFullYear());
  const [format,   setFormat]   = useState<Format>("pdf");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const years = buildYears();
  const selectedBranch = branches.find((b) => b.id === branchId);

  async function handleDownload() {
    if (!branchId) { setError("Pilih apotek terlebih dahulu."); return; }
    setError(null);
    setLoading(true);
    try {
      const endpoint = format === "pdf" ? "/api/export/pdf" : "/api/export/xlsx";
      const url = `${endpoint}?branchId=${branchId}&month=${month}&year=${year}`;
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const mName = MONTHS_ID[month - 1];
      const bName = selectedBranch?.name.replace(/\s+/g, "_") ?? "apotek";
      link.href = blobUrl;
      link.download = `${bName}_${mName}_${year}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  const selectCls =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 " +
    "focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 appearance-none";

  return (
    <div className="space-y-5">
      {/* Format selector */}
      <div>
        <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
          Format Unduhan
        </label>
        <div className="grid grid-cols-2 gap-2">
          {FORMAT_OPTIONS.map(({ key, label, icon: Icon, desc }) => {
            const active = format === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFormat(key)}
                disabled={loading}
                className={[
                  "flex flex-col items-start gap-1 rounded-xl border-2 px-4 py-3 text-left transition-all",
                  active
                    ? "border-sky-500 bg-sky-50 text-sky-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                ].join(" ")}
              >
                <div className="flex items-center gap-2">
                  <Icon size={15} className={active ? "text-sky-600" : "text-slate-400"} />
                  <span className="text-sm font-black">{label}</span>
                </div>
                <span className="text-[10px] text-slate-400 leading-tight">{desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Branch */}
      <div>
        <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
          Apotek
        </label>
        <div className="relative">
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={selectCls} disabled={loading}>
            {branches.length === 0 && <option value="">Tidak ada apotek aktif</option>}
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>
      </div>

      {/* Period */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Bulan</label>
          <div className="relative">
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={selectCls} disabled={loading}>
              {MONTHS_ID.map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Tahun</label>
          <div className="relative">
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectCls} disabled={loading}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Preview badge */}
      {selectedBranch && (
        <div className="flex items-center gap-2 rounded-xl bg-sky-50 border border-sky-100 px-4 py-3">
          <Calendar size={13} className="text-sky-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-sky-700 font-black truncate">{selectedBranch.name}</p>
            <p className="text-[10px] text-sky-600">{MONTHS_ID[month - 1]} {year} · {format.toUpperCase()}</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-xs text-red-700 font-medium">{error}</p>
        </div>
      )}

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={loading || !branchId}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3
          text-sm font-black text-white shadow-sm shadow-sky-600/20
          hover:bg-sky-700 active:scale-[0.98] transition-all
          disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
      >
        {loading ? (
          <><Loader2 size={16} className="animate-spin" />Membuat {format.toUpperCase()}...</>
        ) : (
          <><FileDown size={16} />Download {format === "pdf" ? "PDF" : "Excel"}</>
        )}
      </button>

      {loading && (
        <p className="text-center text-xs text-slate-400">
          {format === "pdf"
            ? "Menyusun laporan PDF... biasanya 5–15 detik."
            : "Membangun workbook Excel... biasanya 3–8 detik."}
        </p>
      )}
    </div>
  );
}
