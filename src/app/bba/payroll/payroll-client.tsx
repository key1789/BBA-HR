"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import { InlineAlert } from "@/components/shared/inline-alert";
import { cn } from "@/lib/utils";
import {
  lockPayrollPeriodAction,
  publishMonthlyAppraisalPeriodAction,
  recalculateMonthlyAppraisalsAction,
  unlockPayrollPeriodAction,
  unpublishMonthlyAppraisalPeriodAction,
} from "@/actions/governance";
import { Lock, RefreshCw, Send, Unlock } from "lucide-react";
import { getFeedbackMessage } from "@/lib/feedback-messages";

export type PayrollAppraisalRow = {
  id: string;
  crewUserId: string;
  crewName: string;
  approvedSubmissionCount: number;
  approvedOmzetTotal: number;
  autoBonusAccountability: number;
  addonManualTotal: number;
  bbaAdjustment: number;
  finalTotalBonus: number;
  calcVersion: string;
  isPublished: boolean;
};

type TenantOpt = { id: string; code: string; name: string };

type PayrollPeriodRow = {
  id: string;
  status: string;
  periodStart: string;
  periodEnd: string;
};


function formatIdr(val: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(val);
}

function buildQuery(tenant: string, month: number, year: number): string {
  const q = new URLSearchParams();
  q.set("tenant", tenant);
  q.set("month", String(month));
  q.set("year", String(year));
  return q.toString();
}

export function PayrollClient({
  tenants,
  tenantId,
  month,
  year,
  rows,
  payrollPeriod,
  auditStatus,
  periodPublished,
  periodLocked,
  calcVersionLabel,
  feedbackStatus,
  feedbackMessageKey,
}: {
  tenants: TenantOpt[];
  tenantId: string;
  month: number;
  year: number;
  rows: PayrollAppraisalRow[];
  payrollPeriod: PayrollPeriodRow | null;
  auditStatus: string | null;
  periodPublished: boolean;
  periodLocked: boolean;
  calcVersionLabel: string | null;
  feedbackStatus: "success" | "error" | null;
  feedbackMessageKey: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [reason, setReason] = useState("");
  const [lockReason, setLockReason] = useState("");
  const [crewSearch, setCrewSearch] = useState("");

  const pushFilters = useCallback(
    (next: { tenant?: string; month?: number; year?: number }) => {
      const t = next.tenant ?? tenantId;
      const m = next.month ?? month;
      const y = next.year ?? year;
      router.push(`${pathname}?${buildQuery(t, m, y)}`);
    },
    [router, pathname, tenantId, month, year],
  );

  const periodLabel = new Date(year, month - 1, 1).toLocaleString("id-ID", {
    month: "long",
    year: "numeric",
  });

  const feedbackMessage = feedbackStatus ? getFeedbackMessage(feedbackMessageKey) : null;

  const crewSearchNorm = crewSearch.trim().toLowerCase();
  const filteredRows =
    crewSearchNorm === ""
      ? rows
      : rows.filter((r) => r.crewName.toLowerCase().includes(crewSearchNorm));

  let payrollTableRows: ReactNode;
  if (rows.length === 0) {
    payrollTableRows = (
      <tr>
        <td colSpan={9} className="px-4 py-12 text-center text-slate-500 font-medium">
          Belum ada data rapor. Setujui audit cabang atau jalankan Recalculate.
        </td>
      </tr>
    );
  } else if (filteredRows.length === 0) {
    payrollTableRows = (
      <tr>
        <td colSpan={9} className="px-4 py-12 text-center text-slate-500 font-medium">
          Tidak ada karyawan yang cocok dengan pencarian.
        </td>
      </tr>
    );
  } else {
    payrollTableRows = filteredRows.map((row) => (
      <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/80">
        <td className="px-4 py-3 font-bold text-slate-900">{row.crewName}</td>
        <td className="px-4 py-3 text-right tabular-nums">{row.approvedSubmissionCount}</td>
        <td className="px-4 py-3 text-right tabular-nums">{formatIdr(row.approvedOmzetTotal)}</td>
        <td className="px-4 py-3 text-right tabular-nums text-indigo-700 font-bold">
          {formatIdr(row.autoBonusAccountability)}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">{formatIdr(row.addonManualTotal)}</td>
        <td className="px-4 py-3 text-right tabular-nums">{formatIdr(row.bbaAdjustment)}</td>
        <td className="px-4 py-3 text-right tabular-nums font-black text-emerald-700">
          {formatIdr(row.finalTotalBonus)}
        </td>
        <td className="px-4 py-3 text-[10px] font-bold uppercase text-slate-500">{row.calcVersion}</td>
        <td className="px-4 py-3">
          {row.isPublished ? (
            <span className="text-[10px] font-black uppercase text-emerald-600">Published</span>
          ) : (
            <span className="text-[10px] font-black uppercase text-amber-600">Draft</span>
          )}
        </td>
      </tr>
    ));
  }

  const hiddenTenant = <input type="hidden" name="tenantId" value={tenantId} />;
  const hiddenPeriod = (
    <>
      <input type="hidden" name="periodMonth" value={month} />
      <input type="hidden" name="periodYear" value={year} />
    </>
  );

  return (
    <div className="space-y-6">
      {feedbackMessage ? (
        <InlineAlert tone={feedbackStatus === "success" ? "success" : "error"} message={feedbackMessage} />
      ) : null}

      <GlassCard className="!p-4 flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end bg-slate-50/50">
        <div className="flex flex-col gap-1 min-w-[220px]">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cabang</label>
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800"
            value={tenantId}
            onChange={(e) => pushFilters({ tenant: e.target.value })}
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} — {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bulan</label>
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 min-w-[140px]"
              value={month}
              onChange={(e) => pushFilters({ month: Number(e.target.value) })}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1, 1).toLocaleString("id-ID", { month: "long" })}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tahun</label>
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 min-w-[100px]"
              value={year}
              onChange={(e) => pushFilters({ year: Number(e.target.value) })}
            >
              {Array.from({ length: 5 }, (_, i) => year - 2 + i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="!p-5 space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status periode</p>
            <h2 className="text-xl font-black text-slate-900">{periodLabel}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <span
              className={cn(
                "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide",
                periodPublished ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800",
              )}
            >
              {periodPublished ? "Published" : "Draft"}
            </span>
            <span
              className={cn(
                "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide",
                periodLocked ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700",
              )}
            >
              Payroll {periodLocked ? "Locked" : "Open"}
            </span>
            {auditStatus ? (
              <span className="rounded-full bg-indigo-100 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-indigo-800">
                Audit {auditStatus}
              </span>
            ) : null}
            {calcVersionLabel ? (
              <span className="rounded-full bg-violet-100 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-violet-800">
                Calc {calcVersionLabel}
              </span>
            ) : null}
          </div>
          <p className="text-xs font-medium leading-relaxed text-slate-600 max-w-3xl">
            Publish / unpublish / buka kunci periode adalah gate Super Admin BBA. Pastikan admin cabang telah menyelesaikan verifikasi submission di portal Admin sebelum mempublikasikan rapor.
          </p>
        </div>

        <div className="flex flex-col gap-2 max-w-xl">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Alasan aksi (publish / recalc / unpublish)
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: Koreksi setelah audit April"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <form action={recalculateMonthlyAppraisalsAction} className="inline">
            {hiddenTenant}
            {hiddenPeriod}
            <input type="hidden" name="mode" value="single" />
            <input type="hidden" name="reason" value={reason} />
            <button
              type="submit"
              disabled={periodPublished}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-md disabled:opacity-50"
            >
              <RefreshCw size={16} />
              Recalculate
            </button>
          </form>

          <form action={publishMonthlyAppraisalPeriodAction} className="inline">
            {hiddenTenant}
            {hiddenPeriod}
            <input type="hidden" name="reason" value={reason} />
            <button
              type="submit"
              disabled={periodPublished || rows.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-md disabled:opacity-50"
            >
              <Send size={16} />
              Publish
            </button>
          </form>

          <form action={unpublishMonthlyAppraisalPeriodAction} className="inline">
            {hiddenTenant}
            {hiddenPeriod}
            <input type="hidden" name="reason" value={reason} />
            <button
              type="submit"
              disabled={!periodPublished}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wide text-slate-800 disabled:opacity-50"
            >
              Unpublish
            </button>
          </form>

          {payrollPeriod ? (
            periodLocked ? (
              <form action={unlockPayrollPeriodAction} className="inline-flex items-center gap-2">
                <input type="hidden" name="periodId" value={payrollPeriod.id} />
                {hiddenTenant}
                <input
                  type="text"
                  name="reason"
                  value={lockReason}
                  onChange={(e) => setLockReason(e.target.value)}
                  placeholder="Alasan buka kunci"
                  className="rounded-xl border border-slate-200 px-2 py-2 text-xs w-40"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white"
                >
                  <Unlock size={16} />
                  Unlock period
                </button>
              </form>
            ) : (
              <form action={lockPayrollPeriodAction} className="inline-flex items-center gap-2">
                <input type="hidden" name="periodId" value={payrollPeriod.id} />
                {hiddenTenant}
                <input
                  type="text"
                  name="reason"
                  value={lockReason}
                  onChange={(e) => setLockReason(e.target.value)}
                  placeholder="Alasan kunci"
                  className="rounded-xl border border-slate-200 px-2 py-2 text-xs w-40"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white"
                >
                  <Lock size={16} />
                  Lock period
                </button>
              </form>
            )
          ) : null}
        </div>
      </GlassCard>

      <GlassCard className="overflow-hidden !p-0">
        <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
          <label className="flex max-w-md flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Cari karyawan
            </span>
            <input
              type="search"
              value={crewSearch}
              onChange={(e) => setCrewSearch(e.target.value)}
              placeholder="Nama crew…"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800"
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                <th className="px-4 py-3">Karyawan</th>
                <th className="px-4 py-3 text-right">Submisi</th>
                <th className="px-4 py-3 text-right">Omzet</th>
                <th className="px-4 py-3 text-right">Bonus KPI</th>
                <th className="px-4 py-3 text-right">Add-on</th>
                <th className="px-4 py-3 text-right">Adj. BBA</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Versi</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>{payrollTableRows}</tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
