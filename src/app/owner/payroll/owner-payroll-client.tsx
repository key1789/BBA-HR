"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useTransition, useState } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, Lock, Clock, AlertTriangle, Banknote,
  X, MessageSquareWarning, Send, ChevronDown, ChevronUp,
  Loader2, Info,
} from "lucide-react";
import { ownerApprovePayrollAction, ownerRequestRevisionAction } from "@/actions/governance";
import { toast } from "sonner";

const MONTH_NAMES = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

function formatRp(n: number | string) {
  return `Rp ${Number(n).toLocaleString("id-ID")}`;
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return (
    <span className="inline-flex items-center gap-1 text-[9px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full uppercase tracking-widest">
      Belum Ada
    </span>
  );
  const map: Record<string, { label: string; cls: string; Icon: any }> = {
    draft_bba:                  { label: "Draft BBA",          cls: "text-slate-600 bg-slate-100",  Icon: AlertTriangle },
    sent_to_owner:              { label: "Menunggu Review",     cls: "text-sky-700 bg-sky-100",      Icon: Clock },
    revision_requested_by_owner:{ label: "Revisi Diminta",      cls: "text-rose-700 bg-rose-100",    Icon: MessageSquareWarning },
    locked:                     { label: "Terkunci",            cls: "text-emerald-700 bg-emerald-100", Icon: Lock },
  };
  const def = map[status] ?? { label: status, cls: "text-slate-600 bg-slate-100", Icon: Info };
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${def.cls}`}>
      <def.Icon size={10} /> {def.label}
    </span>
  );
}

export function OwnerPayrollClient({
  currentMonth,
  currentYear,
  period,
  payrollItems,
  recentSummary,
}: {
  currentMonth: number;
  currentYear: number;
  period: any;
  payrollItems: any[];
  recentSummary: any[];
}) {
  const [isPendingApprove, startApprove] = useTransition();
  const [isPendingRevision, startRevision] = useTransition();
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [showTable, setShowTable] = useState(true);

  const periodStatus = period?.status ?? null;
  const canAct = periodStatus === "sent_to_owner";

  const grandTotal = payrollItems.reduce((s, i) => s + Number(i.net_salary ?? 0), 0);

  const handleApprove = () => {
    if (!period?.id) return;
    const fd = new FormData();
    fd.set("periodId", period.id);
    startApprove(async () => {
      const result = await ownerApprovePayrollAction(null, fd);
      if (result.error) toast.error(result.error);
      else { toast.success(result.message ?? "Disetujui"); }
    });
  };

  const handleRevisionSubmit = () => {
    if (!period?.id || !revisionReason.trim()) return;
    const fd = new FormData();
    fd.set("periodId", period.id);
    fd.set("reason", revisionReason.trim());
    startRevision(async () => {
      const result = await ownerRequestRevisionAction(null, fd);
      if (result.error) { toast.error(result.error); return; }
      toast.success(result.message ?? "Revisi diminta");
      setShowRevisionModal(false);
      setRevisionReason("");
    });
  };

  return (
    <div className="space-y-6">
      {/* Recent timeline */}
      <GlassCard variant="light" className="p-5">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Riwayat 6 Bulan Terakhir</p>
        <div className="flex gap-2 flex-wrap">
          {recentSummary.map((s) => {
            const isActive = s.month === currentMonth && s.year === currentYear;
            const href = `/owner/payroll?month=${s.month}&year=${s.year}`;
            return (
              <a
                key={s.period_start}
                href={href}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-2xl border transition-all text-center ${
                  isActive
                    ? "bg-slate-900 border-slate-900 text-white shadow-lg"
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <span className={`text-[9px] font-black uppercase tracking-widest ${isActive ? "text-slate-300" : "text-slate-400"}`}>
                  {MONTH_NAMES[s.month - 1]?.slice(0, 3)} {s.year}
                </span>
                <StatusBadge status={s.dbPeriod?.status ?? null} />
              </a>
            );
          })}
        </div>
      </GlassCard>

      {/* Current month detail */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Banknote size={20} className="text-amber-600" />
            {MONTH_NAMES[currentMonth - 1]} {currentYear}
          </h2>
          <StatusBadge status={periodStatus} />
        </div>

        {/* Revision reason banner */}
        {periodStatus === "revision_requested_by_owner" && period?.notes && (
          <div className="flex items-start gap-3 p-4 rounded-2xl border bg-rose-50 border-rose-100 text-rose-800">
            <MessageSquareWarning size={16} className="text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-0.5">Alasan Revisi yang Anda Minta</p>
              <p className="text-xs font-medium">{period.notes}</p>
            </div>
          </div>
        )}

        {!period ? (
          <GlassCard variant="light" className="p-12 text-center">
            <Banknote size={40} className="mx-auto text-slate-200 mb-3" />
            <p className="font-black text-slate-500 uppercase tracking-tight text-sm">Belum ada data payroll</p>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              BBA Admin belum menyiapkan rekap gaji untuk bulan ini.
            </p>
          </GlassCard>
        ) : (
          <>
            {/* Summary + actions */}
            <GlassCard variant="light" className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Pengeluaran Gaji</p>
                <p className="text-3xl font-black text-slate-900 tracking-tight">{formatRp(grandTotal)}</p>
                <p className="text-[10px] text-slate-400 font-medium mt-1">{payrollItems.length} pegawai · {MONTH_NAMES[currentMonth - 1]} {currentYear}</p>
              </div>

              {canAct && (
                <div className="flex gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowRevisionModal(true)}
                    disabled={isPendingApprove}
                    className="px-4 py-2.5 rounded-xl text-xs font-black text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <MessageSquareWarning size={13} /> Minta Revisi
                  </button>
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={isPendingApprove}
                    className="px-4 py-2.5 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
                  >
                    {isPendingApprove ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    Setujui & Kunci
                  </button>
                </div>
              )}

              {periodStatus === "locked" && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <Lock size={14} className="text-emerald-600" />
                  <span className="text-xs font-black text-emerald-700">Disetujui & Terkunci</span>
                </div>
              )}

              {periodStatus === "draft_bba" && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <Send size={14} className="text-slate-400" />
                  <span className="text-xs font-bold text-slate-500">Menunggu BBA mengirim</span>
                </div>
              )}
            </GlassCard>

            {/* Breakdown table */}
            {payrollItems.length > 0 && (
              <GlassCard variant="light" className="p-0 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowTable((v) => !v)}
                  className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
                >
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Rincian per Pegawai</span>
                  {showTable ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </button>

                {showTable && (
                  <div className="overflow-x-auto border-t border-slate-100">
                    <table className="w-full text-xs min-w-[600px]">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Pegawai</th>
                          <th className="text-right px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Gaji Pokok</th>
                          <th className="text-right px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tunjangan</th>
                          <th className="text-right px-4 py-3 text-[10px] font-black text-rose-400 uppercase tracking-widest">Potongan</th>
                          <th className="text-right px-5 py-3 text-[10px] font-black text-sky-600 uppercase tracking-widest">Total Bersih</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {payrollItems.map((item) => (
                          <tr key={item.employee_profile_id} className="hover:bg-slate-50/50">
                            <td className="px-5 py-3.5 font-black text-slate-800">{item.name}</td>
                            <td className="px-4 py-3.5 text-right font-bold text-slate-700 whitespace-nowrap">{formatRp(item.base_salary)}</td>
                            <td className="px-4 py-3.5 text-right font-bold text-emerald-700 whitespace-nowrap">+{formatRp(item.allowance)}</td>
                            <td className="px-4 py-3.5 text-right font-bold text-rose-500 whitespace-nowrap">−{formatRp(item.deduction)}</td>
                            <td className="px-5 py-3.5 text-right font-black text-sky-700 whitespace-nowrap">{formatRp(item.net_salary)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-sky-50 border-t-2 border-sky-100">
                          <td colSpan={4} className="px-5 py-4 text-[10px] font-black text-slate-600 uppercase tracking-widest">
                            Total Pengeluaran
                          </td>
                          <td className="px-5 py-4 text-right">
                            <span className="text-base font-black text-sky-700">{formatRp(grandTotal)}</span>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </GlassCard>
            )}
          </>
        )}
      </div>

      {/* Revision modal */}
      {showRevisionModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowRevisionModal(false)}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
            className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
          >
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                <MessageSquareWarning size={15} className="text-rose-500" /> Minta Revisi
              </h3>
              <button
                type="button"
                onClick={() => setShowRevisionModal(false)}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-500 flex items-center justify-center transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Tulis alasan revisi yang jelas agar BBA Admin bisa melakukan perbaikan yang tepat.
              </p>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Alasan Revisi</label>
                <textarea
                  value={revisionReason}
                  onChange={(e) => setRevisionReason(e.target.value)}
                  placeholder="Contoh: Gaji Budi kurang sesuai, harap dicek ulang..."
                  rows={4}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 resize-none transition-all"
                />
                <p className="text-[10px] text-slate-400">{revisionReason.trim().length}/5 karakter minimum</p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowRevisionModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleRevisionSubmit}
                  disabled={isPendingRevision || revisionReason.trim().length < 5}
                  className="flex-1 px-4 py-2.5 rounded-xl font-black text-sm text-white bg-rose-500 hover:bg-rose-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isPendingRevision ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Kirim
                </button>
              </div>
            </div>
          </motion.div>
        </div>,
        document.body
      )}
    </div>
  );
}
