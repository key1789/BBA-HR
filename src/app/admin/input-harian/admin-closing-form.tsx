"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { adminCreateClosingAction, type InputFormState } from "@/actions/operational";
import { InlineAlert } from "@/components/shared/inline-alert";
import { getSubmissionStatusBadgeClass } from "@/lib/labels";
import {
  Clock, FileText, CheckCircle2, Loader2, Pencil, Info, User, History, PenLine, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Crew = { id: string; full_name: string };
type Shift = { id: string; shift_name: string };
type FocusProduct = { product_id: string; product_name: string };
type SubmissionRow = {
  id: string;
  user_id: string;
  crew_name: string;
  submission_date: string;
  shift_label: string;
  omzet_total: number;
  transaction_total: number;
  product_total: number;
  rejected_customer_total: number;
  rejected_medicine_total: number;
  status: string;
  focus_items: Array<{ product_id: string; product_name: string; quantity_sold: number }>;
};

type Props = {
  crews: Crew[];
  shifts: Shift[];
  addonProdukFokusEnabled: boolean;
  focusProducts: FocusProduct[];
  recentSubmissions: SubmissionRow[];
  todayDateKey: string;
};

const STATUS_ID: Record<string, string> = {
  draft: "Draft",
  submitted: "Menunggu Verifikasi",
  approved: "Disahkan",
  reject: "Ditolak",
  edited_by_admin: "Diedit Admin",
};
const statusId = (s: string) => STATUS_ID[s] ?? s;

const NUM = new Intl.NumberFormat("id-ID");
const formatId = (digits: string) => {
  const cleaned = digits.replace(/[^\d]/g, "");
  if (!cleaned) return "";
  const n = Number(cleaned);
  return Number.isFinite(n) ? NUM.format(n) : "";
};
const digitsOnly = (s: string) => s.replace(/[^\d]/g, "");

function SubmitButton({ isEditing }: { isEditing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-4 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-black uppercase tracking-widest shadow-lg shadow-sky-200/60 transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
    >
      {pending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
      {pending ? "Menyimpan…" : isEditing ? "Perbarui Closingan" : "Simpan & Sahkan"}
    </button>
  );
}

export function AdminClosingForm({
  crews,
  shifts,
  addonProdukFokusEnabled,
  focusProducts,
  recentSubmissions,
  todayDateKey,
}: Props) {
  const [state, formAction] = useActionState<InputFormState, FormData>(adminCreateClosingAction, null);

  const [activeTab, setActiveTab] = useState<"form" | "log">("form");
  const [targetUserId, setTargetUserId] = useState(() => crews[0]?.id ?? "");
  const [selectedDate, setSelectedDate] = useState(todayDateKey);
  const [selectedShift, setSelectedShift] = useState(() => shifts[0]?.shift_name ?? "general");
  const [omzetDigits, setOmzetDigits] = useState("");
  const [trxDigits, setTrxDigits] = useState("");
  const [productDigits, setProductDigits] = useState("");
  const [rejectedDigits, setRejectedDigits] = useState("");
  const [rejectedMedicineDigits, setRejectedMedicineDigits] = useState("");
  const [focusQtyByProduct, setFocusQtyByProduct] = useState<Record<string, string>>({});
  const [focusSearch, setFocusSearch] = useState("");

  const effectiveShift =
    shifts.some((s) => s.shift_name === selectedShift) || selectedShift === "general"
      ? selectedShift
      : (shifts[0]?.shift_name ?? "general");

  // Baris eksisting untuk kombinasi crew + tanggal + shift → menandai mode edit.
  const currentRow = recentSubmissions.find(
    (r) => r.user_id === targetUserId && r.submission_date === selectedDate && r.shift_label === effectiveShift,
  );
  const isEditing = Boolean(currentRow);

  function resetForm() {
    setOmzetDigits("");
    setTrxDigits("");
    setProductDigits("");
    setRejectedDigits("");
    setRejectedMedicineDigits("");
    setFocusQtyByProduct({});
  }

  function loadForEdit(row: SubmissionRow) {
    setTargetUserId(row.user_id);
    setSelectedDate(row.submission_date);
    setSelectedShift(row.shift_label);
    setOmzetDigits(String(Number(row.omzet_total ?? 0)));
    setTrxDigits(String(Number(row.transaction_total ?? 0)));
    setProductDigits(String(Number(row.product_total ?? 0)));
    setRejectedDigits(String(Number(row.rejected_customer_total ?? 0)));
    setRejectedMedicineDigits(String(Number(row.rejected_medicine_total ?? 0)));
    const nextFocus: Record<string, string> = {};
    for (const item of row.focus_items ?? []) nextFocus[item.product_id] = String(Number(item.quantity_sold ?? 0));
    setFocusQtyByProduct(nextFocus);
    setActiveTab("form");
  }

  const touchedFocusProductIds = focusProducts
    .filter((fp) => focusQtyByProduct[fp.product_id] !== undefined && focusQtyByProduct[fp.product_id] !== "")
    .map((fp) => fp.product_id);

  // Produk fokus: search-by-name (hanya menyaring TAMPILAN — qty tetap tersimpan & terkirim).
  const showFocusSearch = focusProducts.length > 4;
  const focusQuery = focusSearch.trim().toLowerCase();
  const visibleFocusProducts = focusQuery
    ? focusProducts.filter((fp) => fp.product_name.toLowerCase().includes(focusQuery))
    : focusProducts;
  const filledFocusCount = touchedFocusProductIds.length;

  const noCrew = crews.length === 0;

  const formContent = (
    <div className="space-y-3 animate-in fade-in duration-300">
      {state?.message && (
        <InlineAlert tone={state.status === "error" ? "error" : "success"} message={state.message} />
      )}

      {noCrew ? (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-6 text-center">
          <p className="text-sm font-black text-amber-800">Belum ada crew di apotek ini.</p>
          <p className="text-xs text-amber-600 mt-1">Tambahkan crew dulu di portal Super Admin (Tim & Akses).</p>
        </div>
      ) : (
        <form action={formAction} className="space-y-3">
          {/* ── Card 1: Crew, Waktu & Shift ── */}
          <div className="bg-white border border-slate-100 rounded-3xl p-4 sm:p-5 shadow-sm">
            <div className="hidden sm:flex items-center gap-2.5 mb-4">
              <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <Clock size={14} className="text-slate-500" />
              </div>
              <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Crew & Waktu</h2>
            </div>

            {/* Crew */}
            <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 block">
              Atas Nama Crew
              <div className="relative mt-1.5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><User size={14} /></span>
                <select
                  name="targetUserId"
                  required
                  value={targetUserId}
                  onChange={(e) => { setTargetUserId(e.target.value); }}
                  className="w-full appearance-none rounded-2xl border border-slate-200 pl-9 pr-3 py-2.5 text-sm font-black text-slate-800 bg-slate-50 focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/20 transition-all outline-none"
                >
                  {crews.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
              </div>
            </label>

            {/* Date + Shift */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                Tanggal
                <input
                  type="date"
                  name="submissionDate"
                  required
                  value={selectedDate}
                  max={todayDateKey}
                  onChange={(e) => setSelectedDate(e.target.value > todayDateKey ? todayDateKey : e.target.value)}
                  className="mt-1.5 rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm font-black text-slate-800 w-full focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/20 transition-all outline-none"
                />
              </label>
              <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                Shift
                <div className="relative mt-1.5">
                  <select
                    name="shiftLabel"
                    required
                    value={effectiveShift}
                    onChange={(e) => setSelectedShift(e.target.value)}
                    className="w-full appearance-none rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-black text-slate-800 bg-slate-50 focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/20 transition-all outline-none"
                  >
                    {shifts.length === 0 && <option value="general">General</option>}
                    {shifts.map((s) => <option key={s.id} value={s.shift_name}>{s.shift_name}</option>)}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </label>
            </div>

            {currentRow && (
              <div className={cn(
                "flex items-start gap-2.5 rounded-2xl border px-3 py-2.5 text-xs font-bold mt-3",
                "border-sky-200 bg-sky-50 text-sky-800",
              )}>
                <Info size={13} className="mt-0.5 shrink-0" />
                <span>Sudah ada closingan untuk crew, tanggal & shift ini ({statusId(currentRow.status)}). Menyimpan akan <span className="font-black">memperbarui</span> data tersebut.</span>
              </div>
            )}
          </div>

          {/* ── Card 2: Metrik ── */}
          <div className="bg-white border border-slate-100 rounded-3xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-7 h-7 rounded-xl bg-sky-100 flex items-center justify-center shrink-0">
                <FileText size={14} className="text-sky-600" />
              </div>
              <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Metrik Closingan</h2>
            </div>

            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
              <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                Total Omzet (Rp)
                <input type="hidden" name="omzetTotal" value={omzetDigits || "0"} />
                <div className="relative mt-1.5">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm pointer-events-none">Rp</span>
                  <input
                    type="text" inputMode="numeric" pattern="[0-9.]*" required
                    value={formatId(omzetDigits)}
                    onChange={(e) => setOmzetDigits(digitsOnly(e.target.value))}
                    className="rounded-2xl bg-slate-50 border border-slate-200 pl-9 pr-4 py-2.5 text-base font-black text-slate-800 w-full focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/20 transition-all outline-none"
                    placeholder="0"
                  />
                </div>
              </label>

              <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                Total Transaksi / Nota
                <input type="hidden" name="transactionTotal" value={trxDigits || "0"} />
                <input
                  type="text" inputMode="numeric" pattern="[0-9.]*" required
                  value={formatId(trxDigits)}
                  onChange={(e) => setTrxDigits(digitsOnly(e.target.value))}
                  className="mt-1.5 rounded-2xl bg-slate-50 border border-slate-200 px-4 py-2.5 text-base font-black text-slate-800 w-full focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/20 transition-all outline-none"
                  placeholder="0"
                />
              </label>

              <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                Total Produk Terjual
                <input type="hidden" name="productTotal" value={productDigits || "0"} />
                <input
                  type="text" inputMode="numeric" pattern="[0-9.]*" required
                  value={formatId(productDigits)}
                  onChange={(e) => setProductDigits(digitsOnly(e.target.value))}
                  className="mt-1.5 rounded-2xl bg-slate-50 border border-slate-200 px-4 py-2.5 text-base font-black text-slate-800 w-full focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/20 transition-all outline-none"
                  placeholder="0"
                />
              </label>

              <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                Pelanggan Tertolak
                <input type="hidden" name="rejectedCustomerTotal" value={rejectedDigits || "0"} />
                <input
                  type="text" inputMode="numeric" pattern="[0-9.]*" required
                  value={formatId(rejectedDigits)}
                  onChange={(e) => setRejectedDigits(digitsOnly(e.target.value))}
                  className="mt-1.5 rounded-2xl bg-slate-50 border border-slate-200 px-4 py-2.5 text-base font-black text-amber-600 w-full focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/20 transition-all outline-none"
                  placeholder="0"
                />
                <p className="mt-1 text-[9px] font-bold text-slate-400">
                  Jumlah <span className="text-slate-500">orang</span> yang pulang tanpa dilayani — dihitung per pelanggan.
                </p>
              </label>

              <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                Obat Tertolak
                <input type="hidden" name="rejectedMedicineTotal" value={rejectedMedicineDigits || "0"} />
                <input
                  type="text" inputMode="numeric" pattern="[0-9.]*" required
                  value={formatId(rejectedMedicineDigits)}
                  onChange={(e) => setRejectedMedicineDigits(digitsOnly(e.target.value))}
                  className="mt-1.5 rounded-2xl bg-slate-50 border border-slate-200 px-4 py-2.5 text-base font-black text-amber-600 w-full focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/20 transition-all outline-none"
                  placeholder="0"
                />
                <p className="mt-1 text-[9px] font-bold text-slate-400">
                  Jumlah <span className="text-slate-500">item obat</span> yang gagal disediakan — 1 pelanggan bisa beberapa item.
                </p>
              </label>
            </div>
          </div>

          {/* ── Card 3: Produk Fokus ── */}
          {addonProdukFokusEnabled && focusProducts.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-4 sm:p-5 shadow-sm">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-7 h-7 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={14} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-[10px] font-black text-emerald-900 uppercase tracking-widest">Produk Fokus</h2>
                  <p className="text-[9px] font-bold text-emerald-600 mt-0.5">Target penjualan bulan ini — kosongkan jika tidak terjual</p>
                </div>
                {filledFocusCount > 0 && (
                  <span className="shrink-0 text-[9px] font-black text-emerald-700 bg-white border border-emerald-200 rounded-full px-2 py-0.5 uppercase tracking-wide">
                    {filledFocusCount} terisi
                  </span>
                )}
              </div>

              {showFocusSearch && (
                <div className="relative mb-3">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400" />
                  <input
                    type="text"
                    value={focusSearch}
                    onChange={(e) => setFocusSearch(e.target.value)}
                    placeholder="Cari produk fokus…"
                    className="w-full pl-10 pr-3 py-2.5 bg-white border border-emerald-200 rounded-2xl text-xs font-bold text-slate-700 placeholder:text-emerald-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none"
                  />
                </div>
              )}

              <div className="space-y-2">
                {/* Hidden mirror untuk SEMUA produk fokus — nilai produk yang tersembunyi
                    oleh filter tetap ikut terkirim (server baca focusProduct_<id>). */}
                {focusProducts.map((fp) => (
                  <input
                    key={`focus-hidden-${fp.product_id}`}
                    type="hidden"
                    name={`focusProduct_${fp.product_id}`}
                    value={focusQtyByProduct[fp.product_id] ?? ""}
                  />
                ))}
                {visibleFocusProducts.length === 0 ? (
                  <p className="py-6 text-center text-[10px] font-black text-emerald-500/70 uppercase tracking-widest">
                    Produk tidak ditemukan
                  </p>
                ) : visibleFocusProducts.map((fp) => (
                  <div key={fp.product_id} className="bg-white border border-emerald-100 rounded-2xl px-3 py-2.5 flex items-center justify-between gap-3 shadow-sm">
                    <span className="text-xs font-black text-slate-700 flex-1 line-clamp-2">{fp.product_name}</span>
                    <div className="w-20 shrink-0">
                      <input
                        type="text" inputMode="numeric" pattern="[0-9.]*"
                        value={formatId(focusQtyByProduct[fp.product_id] ?? "")}
                        onChange={(e) => setFocusQtyByProduct((prev) => ({ ...prev, [fp.product_id]: digitsOnly(e.target.value) }))}
                        placeholder="0"
                        className="rounded-xl bg-emerald-50 border border-emerald-200 px-2 py-2 text-sm font-black text-emerald-700 text-center w-full focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none"
                      />
                    </div>
                  </div>
                ))}
                <input type="hidden" name="focusProductIds" value={touchedFocusProductIds.join(",")} />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1 pb-6">
            {isEditing && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-4 rounded-2xl border-2 border-slate-200 bg-white text-[10px] font-black text-slate-500 uppercase tracking-widest hover:bg-slate-50 transition-all"
              >
                Kosongkan
              </button>
            )}
            <div className="flex-1">
              <SubmitButton isEditing={isEditing} />
            </div>
          </div>
        </form>
      )}
    </div>
  );

  const logContent = (
    <div className="space-y-3 animate-in fade-in duration-300">
      {recentSubmissions.length === 0 ? (
        <div className="bg-slate-50 border border-slate-100 rounded-3xl p-8 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <FileText size={22} className="text-slate-300" />
          </div>
          <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Belum ada closingan</p>
          <p className="text-xs text-slate-400 mt-1">Closingan yang kamu catat akan muncul di sini.</p>
        </div>
      ) : (
        recentSubmissions.map((row) => (
          <div key={row.id} className="bg-white border border-slate-100 rounded-3xl p-4 shadow-sm hover:border-slate-200 transition-all">
            <div className="flex items-center justify-between mb-2.5">
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-800 truncate">{row.crew_name}</p>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{row.submission_date} · {row.shift_label}</p>
              </div>
              <span className={cn(
                "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest",
                getSubmissionStatusBadgeClass(row.status),
              )}>
                {statusId(row.status)}
              </span>
            </div>

            <p className="text-xl font-black text-sky-600 leading-none">Rp {NUM.format(Number(row.omzet_total))}</p>

            <div className="flex flex-wrap gap-3 mt-1.5 text-[10px] font-bold text-slate-400">
              <span>{NUM.format(Number(row.transaction_total))} nota</span>
              <span>·</span>
              <span>{NUM.format(Number(row.product_total))} produk</span>
              {Number(row.rejected_customer_total) > 0 && (
                <><span>·</span><span className="text-amber-600">{NUM.format(Number(row.rejected_customer_total))} tolak</span></>
              )}
              {Number(row.rejected_medicine_total) > 0 && (
                <><span>·</span><span className="text-amber-600">{NUM.format(Number(row.rejected_medicine_total))} obat</span></>
              )}
            </div>

            {row.focus_items.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {row.focus_items.map((f) => (
                  <span key={f.product_id} className="text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-lg">
                    {f.product_name}: {NUM.format(Number(f.quantity_sold))}
                  </span>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => loadForEdit(row)}
              className="mt-3 flex items-center gap-1.5 text-[10px] font-black text-sky-600 bg-sky-50 hover:bg-sky-100 border border-sky-100 rounded-xl px-3 py-1.5 transition-colors"
            >
              <Pencil size={11} />
              Edit closingan ini
            </button>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="w-full space-y-3">
      {/* Mobile: tab switcher */}
      <div className="md:hidden flex bg-white border border-slate-100 p-1 rounded-2xl shadow-sm">
        {(["form", "log"] as const).map((tab) => {
          const isActive = activeTab === tab;
          const Icon = tab === "form" ? PenLine : History;
          const label = tab === "form" ? "Form Input" : "Log Closingan";
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                isActive ? "bg-sky-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-600",
              )}
            >
              <Icon size={13} />
              {label}
            </button>
          );
        })}
      </div>

      <div className="md:hidden">{activeTab === "form" ? formContent : logContent}</div>

      {/* Desktop split */}
      <div className="hidden md:flex gap-6">
        <div className="flex-[3]">{formContent}</div>
        <div className="flex-[2]">
          <div className="sticky top-6 bg-slate-50 rounded-3xl p-5 border border-slate-100">
            <div className="flex items-center gap-2 mb-4">
              <History size={14} className="text-slate-400" />
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Log Bulan Ini</h2>
            </div>
            <div className="max-h-[calc(100vh-12rem)] overflow-y-auto space-y-3 pr-1">{logContent}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
