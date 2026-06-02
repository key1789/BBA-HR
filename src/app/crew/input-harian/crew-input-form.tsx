"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { createDailySubmissionAction, type InputFormState } from "@/actions/operational";
import { Button } from "@/components/shared/button";
import { InlineAlert } from "@/components/shared/inline-alert";
import { getSubmissionStatusBadgeClass } from "@/lib/labels";
import {
  Clock, AlertCircle, Loader2, PenLine, History,
  FileText, CheckCircle2, Pencil, Info, Send, CalendarCheck,
} from "lucide-react";
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
  focus_items?: Array<{ product_id: string; product_name: string; quantity_sold: number }>;
};

type Props = {
  shifts: Shift[];
  addonProdukFokusEnabled: boolean;
  focusProducts: FocusProduct[];
  recentSubmissions: SubmissionRow[];
  todayDateKey: string;
};

// ── Indonesian status labels ──────────────────────────────────────────────────
const STATUS_ID: Record<string, string> = {
  draft:           "Draft",
  submitted:       "Menunggu Verifikasi",
  approved:        "Disetujui",
  reject:          "Ditolak",
  edited_by_admin: "Diedit Admin",
};
function statusId(status: string) {
  return STATUS_ID[status] ?? status;
}

// ── Formatters ────────────────────────────────────────────────────────────────
const NUM = new Intl.NumberFormat("id-ID");
function formatId(digits: string) {
  const cleaned = digits.replace(/[^\d]/g, "");
  if (!cleaned) return "";
  const n = Number(cleaned);
  return Number.isFinite(n) ? NUM.format(n) : "";
}
const digitsOnly = (s: string) => s.replace(/[^\d]/g, "");

// ── Submit buttons — must live inside <form> to access useFormStatus ──────────
function SubmitButtons({
  isLockedByApproval,
  confirmingSubmit,
  onRequestConfirm,
  onCancelConfirm,
  confirmData,
}: {
  isLockedByApproval: boolean;
  confirmingSubmit: boolean;
  onRequestConfirm: () => void;
  onCancelConfirm: () => void;
  confirmData: { date: string; shift: string; omzet: string; trx: string; product: string };
}) {
  const { pending } = useFormStatus();

  if (confirmingSubmit) {
    return (
      <div className="rounded-3xl border-2 border-sky-200 bg-sky-50 p-5 space-y-4 animate-in fade-in duration-200">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-sky-600 rounded-lg flex items-center justify-center shrink-0">
            <Send size={12} className="text-white" />
          </div>
          <h3 className="text-[10px] font-black text-sky-800 uppercase tracking-widestst">Konfirmasi Submit</h3>
        </div>

        <div className="bg-white rounded-2xl p-4 space-y-1.5 border border-sky-100">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widestst">
            {confirmData.date} · {confirmData.shift}
          </p>
          <p className="text-2xl font-black text-sky-600 leading-none">
            Rp {confirmData.omzet || "0"}
          </p>
          <div className="flex gap-3 text-[10px] font-bold text-slate-400 pt-0.5">
            <span>{confirmData.trx || "0"} nota</span>
            <span>·</span>
            <span>{confirmData.product || "0"} produk</span>
          </div>
        </div>

        <p className="text-[10px] font-bold text-sky-700 leading-relaxed">
          Laporan dikirim ke admin untuk diverifikasi. Setelah disetujui, laporan tidak bisa diubah lagi.
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancelConfirm}
            disabled={pending}
            className="flex-1 py-3.5 rounded-2xl border-2 border-slate-200 bg-white text-[10px] font-black text-slate-600 uppercase tracking-widestst hover:bg-slate-50 transition-all disabled:opacity-40"
          >
            Batal
          </button>
          <button
            type="submit"
            name="submitNow"
            value="true"
            disabled={pending}
            className="flex-[2] py-3.5 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-black uppercase tracking-widestst shadow-lg shadow-sky-200/60 transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            {pending ? (
              <><Loader2 size={13} className="animate-spin" />Mengirim…</>
            ) : (
              <><CheckCircle2 size={13} />Ya, Kirim Sekarang</>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3 pt-2 pb-6">
      <button
        type="submit"
        name="submitNow"
        value="false"
        disabled={isLockedByApproval || pending}
        className="py-4 sm:py-5 flex-1 rounded-2xl text-[10px] font-black uppercase tracking-widestst bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
      >
        {pending && <Loader2 size={13} className="animate-spin" />}
        Simpan Draft
      </button>
      <button
        type="button"
        onClick={onRequestConfirm}
        disabled={isLockedByApproval || pending}
        className="py-4 sm:py-5 flex-[2] rounded-2xl bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-black uppercase tracking-widestst shadow-lg shadow-sky-200/60 transition-all disabled:opacity-40 disabled:pointer-events-none"
      >
        Submit Laporan
      </button>
    </div>
  );
}

// ── Status Hari Ini card ──────────────────────────────────────────────────────
function StatusHariIni({ todaySubmissions }: { todaySubmissions: SubmissionRow[] }) {
  const hasSubmissions = todaySubmissions.length > 0;

  if (hasSubmissions) {
    return (
      <div className="bg-emerald-50 border-2 border-emerald-200 rounded-3xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <CalendarCheck size={13} className="text-emerald-600 shrink-0" />
          <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">
            Laporan Hari Ini
          </p>
        </div>
        <div className="space-y-2">
          {todaySubmissions.map((sub) => (
            <div key={sub.id} className="flex items-center justify-between gap-3 bg-white rounded-2xl px-3 py-2.5 border border-emerald-100">
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-800 uppercase truncate">{sub.shift_label}</p>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                  Rp {NUM.format(Number(sub.omzet_total))}
                </p>
              </div>
              <span className={cn(
                "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest",
                getSubmissionStatusBadgeClass(sub.status),
              )}>
                {statusId(sub.status)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 border-2 border-slate-200 rounded-3xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0">
        <FileText size={17} className="text-slate-400" />
      </div>
      <p className="text-xs font-black text-slate-800">Belum ada laporan hari ini</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function CrewInputForm({
  shifts,
  addonProdukFokusEnabled,
  focusProducts,
  recentSubmissions,
  todayDateKey,
}: Props) {
  const [state, formAction] = useActionState<InputFormState, FormData>(createDailySubmissionAction, null);

  const [activeTab, setActiveTab]       = useState<"form" | "log">("form");
  const [selectedDate, setSelectedDate] = useState(todayDateKey);
  const [selectedShift, setSelectedShift] = useState(() => shifts[0]?.shift_name ?? "general");
  const [omzetDigits, setOmzetDigits]     = useState("");
  const [trxDigits, setTrxDigits]         = useState("");
  const [productDigits, setProductDigits] = useState("");
  const [rejectedDigits, setRejectedDigits] = useState("");
  const [focusQtyByProduct, setFocusQtyByProduct] = useState<Record<string, string>>({});
  const [editingSubmissionId, setEditingSubmissionId] = useState("");
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);

  // Reset confirmation state if server returns an error
  useEffect(() => {
    if (state?.status === "error") setConfirmingSubmit(false);
  }, [state]);

  const isLate    = selectedDate < todayDateKey;
  const isToday   = selectedDate === todayDateKey;
  const effectiveShift =
    shifts.some((s) => s.shift_name === selectedShift) || selectedShift === "general"
      ? selectedShift
      : (shifts[0]?.shift_name ?? "general");

  const currentDraft = recentSubmissions.find(
    (r) => r.submission_date === selectedDate && r.shift_label === effectiveShift,
  );
  const isLockedByApproval = currentDraft?.status === "approved";
  const activeEditId = currentDraft && editingSubmissionId === currentDraft.id ? editingSubmissionId : "";
  const isEditing    = Boolean(activeEditId);

  const todaySubmissions = recentSubmissions.filter((r) => r.submission_date === todayDateKey);

  function loadForEdit(row: SubmissionRow) {
    setSelectedDate(row.submission_date);
    setSelectedShift(row.shift_label);
    setOmzetDigits(String(Number(row.omzet_total ?? 0)));
    setTrxDigits(String(Number(row.transaction_total ?? 0)));
    setProductDigits(String(Number(row.product_total ?? 0)));
    setRejectedDigits(String(Number(row.rejected_customer_total ?? 0)));
    setEditingSubmissionId(row.id);
    const nextFocus: Record<string, string> = {};
    for (const item of row.focus_items ?? []) {
      nextFocus[item.product_id] = String(Number(item.quantity_sold ?? 0));
    }
    setFocusQtyByProduct(nextFocus);
    setConfirmingSubmit(false);
    setActiveTab("form");
  }

  // Only include focus products that the user actually touched (non-empty string)
  const touchedFocusProductIds = focusProducts
    .filter((fp) => focusQtyByProduct[fp.product_id] !== undefined && focusQtyByProduct[fp.product_id] !== "")
    .map((fp) => fp.product_id);

  // ── Draft banner ────────────────────────────────────────────────────────────
  const draftBanner = currentDraft ? (
    <div className={cn(
      "flex items-start gap-2.5 rounded-2xl border px-3 py-2.5 text-xs font-bold mt-3",
      isLockedByApproval
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : isEditing
        ? "border-sky-200 bg-sky-50 text-sky-800"
        : "border-amber-200 bg-amber-50 text-amber-800",
    )}>
      <Info size={13} className="mt-0.5 shrink-0" />
      <span>
        {isLockedByApproval
          ? "Laporan ini sudah disetujui dan tidak bisa diubah dari portal crew."
          : isEditing
          ? `Mode edit aktif — submit akan memperbarui laporan ${statusId(currentDraft.status).toLowerCase()} ini.`
          : `Sudah ada laporan untuk tanggal & shift ini (${statusId(currentDraft.status)}). Klik "Edit" pada log untuk mengubahnya.`}
      </span>
    </div>
  ) : null;

  // ── Form content ────────────────────────────────────────────────────────────
  const formContent = (
    <div className="space-y-3 animate-in fade-in duration-300">
      {state?.message && (
        <InlineAlert tone={state.status === "error" ? "error" : "success"} message={state.message} />
      )}

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="editSubmissionId" value={activeEditId} />

        {/* ── Card 1: Waktu & Shift (compact on mobile) ── */}
        <div className="bg-white border border-slate-100 rounded-3xl p-4 sm:p-5 shadow-sm">
          {/* Header — hidden on mobile to save space */}
          <div className="hidden sm:flex items-center gap-2.5 mb-4">
            <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
              <Clock size={14} className="text-slate-500" />
            </div>
            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widestst">Waktu & Penugasan</h2>
          </div>

          {/* Date + Shift — always 2-col even on mobile */}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widestst text-slate-400 block">
              Tanggal
              <input
                type="date"
                name="submissionDate"
                required
                value={selectedDate}
                max={todayDateKey}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedDate(v > todayDateKey ? todayDateKey : v);
                  setConfirmingSubmit(false);
                }}
                className="mt-1.5 rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm font-black text-slate-800 w-full focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/20 transition-all outline-none"
              />
            </label>

            <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widestst text-slate-400 block">
              Shift
              <div className="relative mt-1.5">
                <select
                  name="shiftLabel"
                  required
                  value={effectiveShift}
                  onChange={(e) => { setSelectedShift(e.target.value); setConfirmingSubmit(false); }}
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

          {/* Late reason */}
          {isLate && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-2xl p-3.5 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center gap-2 mb-2 text-amber-700">
                <AlertCircle size={13} />
                <span className="text-[10px] font-black uppercase tracking-widestst">Alasan Keterlambatan</span>
              </div>
              <textarea
                name="lateReason"
                required
                placeholder="Jelaskan singkat alasan input terlambat…"
                className="w-full rounded-xl border border-amber-200 px-3 py-2.5 text-sm font-bold text-slate-800 bg-white focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all resize-none h-16 sm:h-20"
              />
            </div>
          )}

          {draftBanner}
        </div>

        {/* ── Card 2: Metrik ── */}
        <div className="bg-white border border-slate-100 rounded-3xl p-4 sm:p-5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-7 h-7 rounded-xl bg-sky-100 flex items-center justify-center shrink-0">
              <FileText size={14} className="text-sky-600" />
            </div>
            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widestst">Metrik Laporan</h2>
          </div>

          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
            {/* Omzet */}
            <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widestst text-slate-400 block">
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

            {/* Transaksi */}
            <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widestst text-slate-400 block">
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

            {/* Produk */}
            <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widestst text-slate-400 block">
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

            {/* Tertolak */}
            <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widestst text-slate-400 block">
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
                Pelanggan yg tidak bisa dilayani (stok habis, resep kurang, dll)
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
              <div>
                <h2 className="text-[10px] font-black text-emerald-900 uppercase tracking-widestst">Produk Fokus</h2>
                <p className="text-[9px] font-bold text-emerald-600 mt-0.5">Target penjualan bulan ini — kosongkan jika tidak terjual</p>
              </div>
            </div>
            <div className="space-y-2">
              {focusProducts.map((fp) => (
                <div key={fp.product_id} className="bg-white border border-emerald-100 rounded-2xl px-3 py-2.5 flex items-center justify-between gap-3 shadow-sm">
                  <span className="text-xs font-black text-slate-700 flex-1 line-clamp-2">{fp.product_name}</span>
                  <div className="w-20 shrink-0">
                    <input type="hidden" name={`focusProduct_${fp.product_id}`} value={focusQtyByProduct[fp.product_id] ?? ""} />
                    <input
                      type="text" inputMode="numeric" pattern="[0-9.]*"
                      value={formatId(focusQtyByProduct[fp.product_id] ?? "")}
                      onChange={(e) =>
                        setFocusQtyByProduct((prev) => ({ ...prev, [fp.product_id]: digitsOnly(e.target.value) }))
                      }
                      placeholder="0"
                      className="rounded-xl bg-emerald-50 border border-emerald-200 px-2 py-2 text-sm font-black text-emerald-700 text-center w-full focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none"
                    />
                  </div>
                </div>
              ))}
              {/* Only send product IDs that the user actually touched */}
              <input type="hidden" name="focusProductIds" value={touchedFocusProductIds.join(",")} />
            </div>
          </div>
        )}

        <SubmitButtons
          isLockedByApproval={isLockedByApproval}
          confirmingSubmit={confirmingSubmit}
          onRequestConfirm={() => setConfirmingSubmit(true)}
          onCancelConfirm={() => setConfirmingSubmit(false)}
          confirmData={{
            date: selectedDate,
            shift: effectiveShift,
            omzet: formatId(omzetDigits),
            trx: formatId(trxDigits),
            product: formatId(productDigits),
          }}
        />
      </form>
    </div>
  );

  // ── Log content ─────────────────────────────────────────────────────────────
  const logContent = (
    <div className="space-y-3 animate-in fade-in duration-300">
      {recentSubmissions.length === 0 ? (
        <div className="bg-slate-50 border border-slate-100 rounded-3xl p-8 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <FileText size={22} className="text-slate-300" />
          </div>
          <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Belum ada laporan</p>
          <p className="text-xs text-slate-400 mt-1">Input pertamamu akan muncul di sini.</p>
        </div>
      ) : (
        recentSubmissions.map((row) => (
          <div key={row.id} className="bg-white border border-slate-100 rounded-3xl p-4 shadow-sm hover:border-slate-200 transition-all">
            {/* Top row */}
            <div className="flex items-center justify-between mb-2.5">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widestst">{row.submission_date}</p>
                <p className="text-xs font-black text-slate-700 mt-0.5 uppercase">{row.shift_label}</p>
              </div>
              <span className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widestst",
                getSubmissionStatusBadgeClass(row.status),
              )}>
                {statusId(row.status)}
              </span>
            </div>

            {/* Omzet hero */}
            <p className="text-xl font-black text-sky-600 leading-none">
              Rp {NUM.format(Number(row.omzet_total))}
            </p>

            {/* Secondary metrics */}
            <div className="flex flex-wrap gap-3 mt-1.5 text-[10px] font-bold text-slate-400">
              <span>{NUM.format(Number(row.transaction_total))} nota</span>
              <span>·</span>
              <span>{NUM.format(Number(row.product_total))} produk</span>
              {Number(row.rejected_customer_total) > 0 && (
                <>
                  <span>·</span>
                  <span className="text-amber-600">{NUM.format(Number(row.rejected_customer_total))} tolak</span>
                </>
              )}
            </div>

            {/* Focus items */}
            {row.focus_items && row.focus_items.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {row.focus_items.map((f) => (
                  <span key={f.product_id} className="text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-lg">
                    {f.product_name}: {NUM.format(Number(f.quantity_sold))}
                  </span>
                ))}
              </div>
            )}

            {/* Late reason */}
            {row.late_reason && (
              <p className="mt-2 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-1.5">
                Terlambat: {row.late_reason}
              </p>
            )}

            {/* Edit button */}
            {row.status !== "approved" && (
              <button
                type="button"
                onClick={() => loadForEdit(row)}
                className="mt-3 flex items-center gap-1.5 text-[10px] font-black text-sky-600 bg-sky-50 hover:bg-sky-100 border border-sky-100 rounded-xl px-3 py-1.5 transition-colors"
              >
                <Pencil size={11} />
                Edit laporan ini
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-3">
      {/* Status Hari Ini — always visible on both layouts */}
      <StatusHariIni todaySubmissions={todaySubmissions} />

      {/* Mobile: tab switcher */}
      <div className="md:hidden flex bg-white border border-slate-100 p-1 rounded-2xl shadow-sm">
        {(["form", "log"] as const).map((tab) => {
          const isActive = activeTab === tab;
          const Icon = tab === "form" ? PenLine : History;
          const label = tab === "form" ? "Form Input" : "Log Laporan";
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

      {/* Mobile: active tab content */}
      <div className="md:hidden">
        {activeTab === "form" ? formContent : logContent}
      </div>

      {/* Desktop: side-by-side split */}
      <div className="hidden md:flex gap-6">
        <div className="flex-[3]">{formContent}</div>
        <div className="flex-[2]">
          <div className="sticky top-6 bg-slate-50 rounded-3xl p-5 border border-slate-100">
            <div className="flex items-center gap-2 mb-4">
              <History size={14} className="text-slate-400" />
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widestst">Log Bulan Ini</h2>
            </div>
            <div className="max-h-[calc(100vh-12rem)] overflow-y-auto space-y-3 pr-1">
              {logContent}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
