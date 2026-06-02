import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";

export default function AuditDetailNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-20 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mb-6">
        <AlertTriangle size={28} className="text-amber-500" />
      </div>
      <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">
        Cabang Tidak Ditemukan
      </h1>
      <p className="text-sm text-slate-500 max-w-sm mb-8">
        Data apotek yang Anda cari tidak tersedia atau sudah tidak aktif di sistem.
        Mungkin link ini sudah kedaluwarsa.
      </p>
      <Link
        href="/bba/audit"
        className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 transition-colors"
      >
        <ArrowLeft size={15} />
        Kembali ke Daftar Audit
      </Link>
    </div>
  );
}
