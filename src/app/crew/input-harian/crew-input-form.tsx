"use client";

import { useActionState, useState } from "react";
import { createDailySubmissionAction, type InputFormState } from "@/actions/operational";
import { Button } from "@/components/shared/button";
import { InlineAlert } from "@/components/shared/inline-alert";
import { Input } from "@/components/shared/input";
import { getSubmissionStatusBadgeClass, getSubmissionStatusLabel } from "@/lib/labels";
import { Clock, CheckCircle2, AlertCircle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type Shift = { id: string; shift_name: string };
type FocusProduct = { product_id: string; product_name: string };
type SubmissionRow = {
  id: string;
  submission_date: string;
  shift_label: string;
  omzet_total: number;
  transaction_total: number;
  product_total: number;
  rejected_customer_total: number;
  late_reason?: string | null;
  status: string;
  focus_items?: Array<{
    product_id: string;
    product_name: string;
    quantity_sold: number;
  }>;
};

type Props = {
  shifts: Shift[];
  addonProdukFokusEnabled: boolean;
  focusProducts: FocusProduct[];
  recentSubmissions: SubmissionRow[];
};

export function CrewInputForm({
  shifts,
  addonProdukFokusEnabled,
  focusProducts,
  recentSubmissions,
}: Props) {
  const [state, formAction] = useActionState<InputFormState, FormData>(
    createDailySubmissionAction,
    null,
  );
  const formatId = (digits: string) => {
    const cleaned = digits.replace(/[^\d]/g, "");
    if (!cleaned) return "";
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return "";
    return new Intl.NumberFormat("id-ID").format(n);
  };

  const digitsOnly = (s: string) => s.replace(/[^\d]/g, "");

  const [todayStr] = useState(() => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().split("T")[0];
  });

  // Mobile Tab State
  const [activeTab, setActiveTab] = useState<"form" | "log">("form");
  
  // Date State for "Alasan Terlambat"
  const [selectedDate, setSelectedDate] = useState(() => {
    return todayStr;
  });

  // Check if selected date is strictly before today
  const isLate = () => {
    if (!selectedDate) return false;
    return selectedDate < todayStr;
  };

  const numberFormatter = new Intl.NumberFormat("id-ID");

  const [omzetDigits, setOmzetDigits] = useState("");
  const [trxDigits, setTrxDigits] = useState("");
  const [productDigits, setProductDigits] = useState("");
  const [rejectedDigits, setRejectedDigits] = useState("");
  const [selectedShift, setSelectedShift] = useState(() => shifts[0]?.shift_name || "general");
  const [focusQtyByProduct, setFocusQtyByProduct] = useState<Record<string, string>>({});
  const [editingSubmissionId, setEditingSubmissionId] = useState<string>("");
  const effectiveSelectedShift =
    shifts.some((s) => s.shift_name === selectedShift) || selectedShift === "general"
      ? selectedShift
      : shifts[0]?.shift_name || "general";

  const currentDraft = recentSubmissions.find(
    (row) => row.submission_date === selectedDate && row.shift_label === effectiveSelectedShift,
  );
  const isLockedByApproval = currentDraft?.status === "approved";
  const activeEditingSubmissionId =
    currentDraft && editingSubmissionId === currentDraft.id ? editingSubmissionId : "";
  const isEditingCurrent = Boolean(activeEditingSubmissionId);

  const formContent = (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {state?.message ? (
        <InlineAlert
          tone={state.status === "error" ? "error" : "success"}
          message={state.message}
        />
      ) : null}

      <form action={formAction} className="space-y-6">
        <input type="hidden" name="editSubmissionId" value={activeEditingSubmissionId} />
        {/* KARTU 1: Informasi Waktu */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm relative z-20">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center">
              <Clock size={16} />
            </div>
            <h2 className="font-black text-slate-800 uppercase tracking-widest text-xs">Waktu & Penugasan</h2>
          </div>
          
          <div className="grid gap-5 md:grid-cols-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
              Tanggal Input
              <Input
                type="date"
                name="submissionDate"
                required
                value={selectedDate}
                max={todayStr}
                onChange={(e) => {
                  const next = e.target.value;
                  setSelectedDate(next > todayStr ? todayStr : next);
                }}
                className="mt-2 rounded-2xl bg-slate-50 border-slate-200/60 px-4 py-3.5 text-sm font-black text-slate-800 w-full focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/20 transition-all shadow-sm"
              />
            </label>
            
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
              Shift Kerja
              <div className="relative mt-2">
                <select
                  name="shiftLabel"
                  required
                  value={effectiveSelectedShift}
                  onChange={(e) => setSelectedShift(e.target.value)}
                  className="w-full appearance-none rounded-2xl border border-slate-200/60 px-4 py-3.5 text-sm font-black text-slate-800 bg-slate-50 focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/20 transition-all shadow-sm outline-none"
                >
                  {shifts.length === 0 && <option value="general">General (Default)</option>}
                  {shifts.map((s) => (
                    <option key={s.id} value={s.shift_name}>{s.shift_name}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
              </div>
            </label>
          </div>

          {/* Munculkan kolom alasan terlambat jika isLate */}
          {isLate() && (
            <div className="mt-5 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/60 rounded-3xl p-5 animate-in fade-in zoom-in-95 duration-300 shadow-sm">
              <div className="flex items-center gap-2 mb-3 text-amber-700">
                <AlertCircle size={18} />
                <span className="text-xs font-black uppercase tracking-widest">Alasan Keterlambatan</span>
              </div>
              <textarea
                name="lateReason"
                required
                placeholder="Jelaskan secara singkat alasan Anda menginput laporan hari kemarin..."
                className="w-full rounded-2xl border border-amber-200/60 px-4 py-3.5 text-sm font-bold text-slate-800 bg-white/80 backdrop-blur-sm focus:outline-none focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all resize-none h-24 shadow-inner"
              />
            </div>
          )}
        </div>

        {/* KARTU 2: Metrik Laporan Harian */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm relative z-20">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
              <FileText size={16} />
            </div>
            <h2 className="font-black text-slate-800 uppercase tracking-widest text-xs">Metrik Laporan Harian</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block relative">
              Total Omzet (Rp)
              <input type="hidden" name="omzetTotal" value={omzetDigits || "0"} />
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9.]*"
                required
                value={formatId(omzetDigits)}
                onChange={(e) => setOmzetDigits(digitsOnly(e.target.value))}
                className="mt-2 rounded-2xl bg-slate-50 border-slate-200/60 pl-10 pr-4 py-3.5 text-lg font-black text-slate-800 w-full focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/20 transition-all shadow-sm"
                placeholder="0"
              />
              <span className="absolute bottom-4 left-4 text-slate-400 font-semibold text-sm pointer-events-none">Rp</span>
            </label>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
              Total Transaksi / Nota
              <input type="hidden" name="transactionTotal" value={trxDigits || "0"} />
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9.]*"
                required
                value={formatId(trxDigits)}
                onChange={(e) => setTrxDigits(digitsOnly(e.target.value))}
                className="mt-2 rounded-2xl bg-slate-50 border-slate-200/60 px-4 py-3.5 text-lg font-black text-slate-800 w-full focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/20 transition-all shadow-sm"
                placeholder="0"
              />
            </label>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
              Total Produk Terjual
              <input type="hidden" name="productTotal" value={productDigits || "0"} />
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9.]*"
                required
                value={formatId(productDigits)}
                onChange={(e) => setProductDigits(digitsOnly(e.target.value))}
                className="mt-2 rounded-2xl bg-slate-50 border-slate-200/60 px-4 py-3.5 text-lg font-black text-slate-800 w-full focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/20 transition-all shadow-sm"
                placeholder="0"
              />
            </label>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
              Pelanggan Tertolak
              <input type="hidden" name="rejectedCustomerTotal" value={rejectedDigits || "0"} />
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9.]*"
                required
                value={formatId(rejectedDigits)}
                onChange={(e) => setRejectedDigits(digitsOnly(e.target.value))}
                className="mt-2 rounded-2xl bg-slate-50 border-slate-200/60 px-4 py-3.5 text-lg font-black text-amber-600 w-full focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/20 transition-all shadow-sm"
                placeholder="0"
              />
            </label>
          </div>
          {currentDraft ? (
            <div
              className={`mt-5 rounded-2xl border px-4 py-3 text-xs font-bold ${
                isLockedByApproval
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-sky-200 bg-sky-50 text-sky-700"
              }`}
            >
              {isLockedByApproval
                ? "Tanggal + shift ini sudah APPROVED. Tidak bisa diedit dari portal crew."
                : isEditingCurrent
                  ? `Mode edit aktif (${getSubmissionStatusLabel(currentDraft.status)}). Submit akan memperbarui laporan ini.`
                  : `Tanggal + shift ini sudah ada (${getSubmissionStatusLabel(currentDraft.status)}). Input baru diblokir; gunakan tombol Edit pada log.`}
            </div>
          ) : null}
        </div>

        {/* KARTU 3: Produk Fokus (Khusus Add-on) */}
        {addonProdukFokusEnabled && focusProducts.length > 0 && (
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200/60 rounded-3xl p-6 shadow-sm relative z-20 overflow-hidden">
            <div className="absolute top-0 right-0 p-8 bg-emerald-100 rounded-bl-[4rem] -mr-4 -mt-4 opacity-50 pointer-events-none"></div>
            
            <div className="flex items-center gap-2 mb-5 relative z-10">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/30">
                <CheckCircle2 size={16} />
              </div>
              <div>
                <h2 className="font-black text-emerald-900 uppercase tracking-widest text-xs">Produk Fokus</h2>
                <p className="text-[10px] text-emerald-700 font-bold">Input penjualan produk target bulan ini</p>
              </div>
            </div>

            <div className="space-y-3 relative z-10">
              {focusProducts.map((fp) => (
                <div key={fp.product_id} className="bg-white/80 backdrop-blur-sm border border-emerald-100 rounded-2xl p-3 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                  <span className="text-xs font-black text-slate-700 w-1/2 line-clamp-2">{fp.product_name}</span>
                  <div className="w-1/3 min-w-[80px]">
                    <input
                      type="hidden"
                      name={`focusProduct_${fp.product_id}`}
                      value={focusQtyByProduct[fp.product_id] || "0"}
                    />
                    <Input 
                      type="text" 
                      inputMode="numeric" 
                      pattern="[0-9.]*"
                      value={formatId(focusQtyByProduct[fp.product_id] || "")}
                      onChange={(e) =>
                        setFocusQtyByProduct((prev) => ({
                          ...prev,
                          [fp.product_id]: digitsOnly(e.target.value),
                        }))
                      }
                      className="rounded-xl bg-emerald-50/50 border-emerald-200/50 px-3 py-2 text-lg font-black text-emerald-700 text-center w-full focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 transition-all shadow-inner" 
                    />
                  </div>
                </div>
              ))}
              {/* Field tersembunyi untuk mengirim daftar product_id yang difokuskan agar server tahu */}
              <input type="hidden" name="focusProductIds" value={focusProducts.map(p => p.product_id).join(',')} />
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4 pt-4 pb-8 relative z-20">
          <Button
            type="submit"
            name="submitNow"
            value="false"
            disabled={isLockedByApproval}
            variant="ghost"
            className="py-6 sm:py-4 flex-1 rounded-[2rem] text-sm font-black uppercase tracking-widest bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-all active:scale-95 border-none"
          >
            Simpan Draft
          </Button>
          <Button
            type="submit"
            name="submitNow"
            value="true"
            disabled={isLockedByApproval}
            className="py-6 sm:py-4 flex-[2] rounded-[2rem] bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white text-sm font-black uppercase tracking-widest shadow-[0_8px_20px_-6px_rgba(2,132,199,0.5)] active:scale-95 transition-all border-none"
          >
            Submit Laporan
          </Button>
        </div>
      </form>
    </div>
  );

  const historyContent = (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">Log Laporan Terakhir</h2>
      </div>
      
      {recentSubmissions.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center text-sm text-slate-500">
          Belum ada riwayat laporan.
        </div>
      ) : null}
      
      {recentSubmissions.map((row) => (
        <div key={row.id} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm relative overflow-hidden transition-all hover:border-sky-200 hover:shadow-md">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{row.submission_date}</p>
              <p className="font-black text-slate-800 uppercase text-sm mt-0.5">{row.shift_label} Shift</p>
            </div>
            <span className={`inline-flex rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest shadow-sm ${getSubmissionStatusBadgeClass(row.status)}`}>
              {getSubmissionStatusLabel(row.status)}
            </span>
          </div>
          
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Omzet</p>
              <p className="font-black text-sky-600">Rp {numberFormatter.format(Number(row.omzet_total))}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Transaksi</p>
              <p className="font-black text-slate-700">{numberFormatter.format(Number(row.transaction_total))}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <p className="text-slate-500">Produk terjual: <span className="font-bold text-slate-700">{numberFormatter.format(Number(row.product_total))}</span></p>
            <p className="text-slate-500 text-right">Pelanggan tertolak: <span className="font-bold text-slate-700">{numberFormatter.format(Number(row.rejected_customer_total))}</span></p>
          </div>
          {row.late_reason ? (
            <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
              Alasan terlambat: {row.late_reason}
            </p>
          ) : null}
          {row.focus_items && row.focus_items.length > 0 ? (
            <div className="mt-2 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1">
              {row.focus_items.map((f) => `${f.product_name}: ${numberFormatter.format(Number(f.quantity_sold))}`).join(" | ")}
            </div>
          ) : null}
          {row.status !== "approved" ? (
            <button
              type="button"
              onClick={() => {
                setSelectedDate(row.submission_date);
                setSelectedShift(row.shift_label);
                setOmzetDigits(String(Number(row.omzet_total || 0)));
                setTrxDigits(String(Number(row.transaction_total || 0)));
                setProductDigits(String(Number(row.product_total || 0)));
                setRejectedDigits(String(Number(row.rejected_customer_total || 0)));
                setEditingSubmissionId(row.id);
                const nextFocus: Record<string, string> = {};
                for (const item of row.focus_items ?? []) {
                  nextFocus[item.product_id] = String(Number(item.quantity_sold || 0));
                }
                setFocusQtyByProduct(nextFocus);
                setActiveTab("form");
              }}
              className="mt-3 w-full rounded-xl border border-sky-200 bg-sky-50 py-2 text-[11px] font-black uppercase tracking-widest text-sky-700 hover:bg-sky-100"
            >
              Edit Laporan Ini
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );

  return (
    <div className="w-full">
      {/* HEADER / TAB NAV FOR MOBILE */}
      <div className="md:hidden flex bg-slate-200/50 p-1 rounded-2xl mb-6 shadow-inner relative z-20">
        <button 
          onClick={() => setActiveTab("form")}
          className={cn(
            "flex-1 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all",
            activeTab === "form" 
              ? "bg-white text-sky-600 shadow-sm" 
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          📝 Form Input
        </button>
        <button 
          onClick={() => setActiveTab("log")}
          className={cn(
            "flex-1 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all",
            activeTab === "log" 
              ? "bg-white text-sky-600 shadow-sm" 
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          🕒 Log Laporan
        </button>
      </div>

      {/* MOBILE RENDER */}
      <div className="md:hidden">
        {activeTab === "form" ? formContent : historyContent}
      </div>

      {/* DESKTOP SPLIT VIEW */}
      <div className="hidden md:flex gap-8 relative z-20">
        <div className="flex-[3]">
          {formContent}
        </div>
        <div className="flex-[2] sticky top-8 self-start">
          <div className="bg-slate-50 rounded-3xl p-6 border border-slate-200 shadow-inner">
            {historyContent}
          </div>
        </div>
      </div>
    </div>
  );
}
