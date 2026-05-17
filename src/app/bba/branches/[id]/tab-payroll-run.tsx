"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useTransition } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import {
  Banknote,
  Users,
  Save,
  Loader2,
  Info,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { getPayrollRunDataAction, savePayrollRunAction } from "./actions";
import { toast } from "sonner";
import { isBranchOperationalPersonnel } from "@/lib/branch-personnel";

type CustomAdjustment = {
  id: string;
  name: string;
  type: "addition" | "deduction";
  amount: number;
};

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  return 0;
}

function formatRp(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export function TabPayrollRun({
  branchId,
  users,
  payrollConfigs,
  currentMonth,
  currentYear,
}: {
  branchId: string;
  users: any[];
  payrollConfigs: any[];
  currentMonth: number;
  currentYear: number;
}) {
  const [isAbsensiEnabled, setIsAbsensiEnabled] = useState(false);
  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, number>>({});
  const [hariMasukOverrides, setHariMasukOverrides] = useState<Record<string, number>>({});
  const [existingPeriod, setExistingPeriod] = useState<{ id: string; status: string; submitted_at: string | null } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const filteredUsers = users.filter((u) => isBranchOperationalPersonnel(u));

  const BPJS_IDS = new Set(['__bpjs_kes_k__', '__bpjs_tk_k__', '__bpjs_kes_p__', '__bpjs_tk_p__']);

  const getConfig = (userId: string) => {
    const raw = payrollConfigs.find((c) => c.user_id === userId);
    const allAdj: CustomAdjustment[] = Array.isArray(raw?.custom_adjustments) ? raw.custom_adjustments : [];
    return {
      base_salary: toNum(raw?.base_salary),
      position_allowance: toNum(raw?.position_allowance),
      meal_allowance: toNum(raw?.meal_allowance),
      transport_allowance: toNum(raw?.transport_allowance),
      bpjs_deduction: toNum(raw?.bpjs_deduction),
      custom_adjustments: allAdj.filter((a) => !BPJS_IDS.has(a.id)),
    };
  };

  const getHariMasuk = (userId: string): number => {
    if (hariMasukOverrides[userId] !== undefined) return hariMasukOverrides[userId];
    if (isAbsensiEnabled && attendanceCounts[userId] !== undefined) return attendanceCounts[userId];
    return 0;
  };

  const isAutoFilled = (userId: string) =>
    isAbsensiEnabled &&
    hariMasukOverrides[userId] === undefined &&
    attendanceCounts[userId] !== undefined;

  const calcRow = (userId: string) => {
    const cfg = getConfig(userId);
    const hari = getHariMasuk(userId);
    const mealTotal = cfg.meal_allowance * hari;
    const transportTotal = cfg.transport_allowance * hari;
    const customAdditions = cfg.custom_adjustments
      .filter((c) => c.type === "addition")
      .reduce((s, c) => s + c.amount, 0);
    const customDeductions = cfg.custom_adjustments
      .filter((c) => c.type === "deduction")
      .reduce((s, c) => s + c.amount, 0);
    const netTotal =
      cfg.base_salary +
      cfg.position_allowance +
      mealTotal +
      transportTotal +
      customAdditions -
      cfg.bpjs_deduction -
      customDeductions;
    return { ...cfg, hari, mealTotal, transportTotal, customAdditions, customDeductions, netTotal };
  };

  const loadData = async () => {
    setIsLoading(true);
    const result = await getPayrollRunDataAction(branchId, currentMonth, currentYear);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      setIsAbsensiEnabled(result.isAbsensiEnabled);
      setAttendanceCounts(result.attendanceCounts);
      setExistingPeriod(result.existingPeriod);
      setHariMasukOverrides({});
    }
    setIsLoading(false);
  };

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    getPayrollRunDataAction(branchId, currentMonth, currentYear).then((result) => {
      if (!active) return;
      if ("error" in result) {
        toast.error(result.error);
      } else {
        setIsAbsensiEnabled(result.isAbsensiEnabled);
        setAttendanceCounts(result.attendanceCounts);
        setExistingPeriod(result.existingPeriod);
        setHariMasukOverrides({});
      }
      setIsLoading(false);
    });
    return () => { active = false; };
  }, [branchId, currentMonth, currentYear]);

  const handleSave = () => {
    const items = filteredUsers.map((user) => {
      const uid = user.app_users.id;
      const row = calcRow(uid);
      return {
        userId: uid,
        hariMasuk: row.hari,
        baseSalary: row.base_salary,
        positionAllowance: row.position_allowance,
        mealRate: row.meal_allowance,
        mealTotal: row.mealTotal,
        transportRate: row.transport_allowance,
        transportTotal: row.transportTotal,
        bpjs: row.bpjs_deduction,
        customAdditions: row.customAdditions,
        customDeductions: row.customDeductions,
        netTotal: row.netTotal,
      };
    });

    const fd = new FormData();
    fd.set("branchId", branchId);
    fd.set("month", String(currentMonth));
    fd.set("year", String(currentYear));
    fd.set("itemsJson", JSON.stringify(items));

    startTransition(async () => {
      const result = await savePayrollRunAction(null, fd);
      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        toast.success(result.message ?? "Tersimpan");
        await loadData();
      }
    });
  };

  const grandTotal = filteredUsers.reduce(
    (sum, u) => sum + calcRow(u.app_users.id).netTotal,
    0,
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-400 gap-2">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm font-bold">Memuat data payroll...</span>
      </div>
    );
  }

  if (filteredUsers.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400">
        <Users size={40} className="mx-auto mb-3 opacity-30" />
        <p className="font-bold text-sm">Belum ada pegawai operasional di cabang ini.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Banknote size={22} className="text-sky-600" />
            Rekap Payroll — {MONTH_NAMES[currentMonth - 1]} {currentYear}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Kalkulasi gaji berdasarkan konfigurasi tiap pegawai dan hari masuk bulan ini.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {existingPeriod ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold">
              <CheckCircle2 size={12} /> Tersimpan (draft)
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-xs font-bold">
              <AlertTriangle size={12} /> Belum disimpan
            </div>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="px-5 py-2.5 bg-sky-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-sky-700 transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {existingPeriod ? "Perbarui" : "Simpan Draft"}
          </button>
        </div>
      </div>

      {/* Absensi banner */}
      <div
        className={`flex items-start gap-3 p-4 rounded-2xl border text-xs font-medium ${
          isAbsensiEnabled
            ? "bg-sky-50 border-sky-100 text-sky-800"
            : "bg-amber-50 border-amber-100 text-amber-800"
        }`}
      >
        {isAbsensiEnabled ? (
          <Sparkles size={14} className="text-sky-500 shrink-0 mt-0.5" />
        ) : (
          <Info size={14} className="text-amber-500 shrink-0 mt-0.5" />
        )}
        {isAbsensiEnabled
          ? "Addon Absensi aktif — hari masuk diisi otomatis dari rekap absensi bulan ini. Kamu tetap bisa ubah manual jika perlu."
          : "Addon Absensi tidak aktif — isi hari masuk secara manual untuk setiap pegawai."}
      </div>

      {/* Table */}
      <GlassCard variant="light" className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[960px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Pegawai</th>
                <th className="text-right px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Gaji Pokok</th>
                <th className="text-right px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tunjangan Jab.</th>
                <th className="text-right px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Makan/Hari</th>
                <th className="text-right px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Transport/Hari</th>
                <th className="text-center px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Hari Masuk</th>
                <th className="text-right px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Makan Total</th>
                <th className="text-right px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Transport Total</th>
                <th className="text-right px-4 py-3 text-[10px] font-black text-rose-400 uppercase tracking-widest">BPJS (−)</th>
                <th className="text-right px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Custom</th>
                <th className="text-right px-5 py-3 text-[10px] font-black text-sky-600 uppercase tracking-widest">Total Bersih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredUsers.map((user) => {
                const uid = user.app_users.id;
                const row = calcRow(uid);
                const auto = isAutoFilled(uid);
                const hasConfig = payrollConfigs.some((c) => c.user_id === uid);

                return (
                  <tr
                    key={uid}
                    className={`hover:bg-slate-50/50 transition-colors ${!hasConfig ? "opacity-60" : ""}`}
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-black text-slate-800">{user.app_users.full_name}</p>
                      <p className="text-[10px] text-slate-400 uppercase font-bold">{user.role.replace("_", " ")}</p>
                      {!hasConfig && (
                        <p className="text-[10px] text-rose-400 font-bold mt-0.5">Belum ada config gaji</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold text-slate-700 whitespace-nowrap">{formatRp(row.base_salary)}</td>
                    <td className="px-4 py-3.5 text-right font-bold text-slate-700 whitespace-nowrap">{formatRp(row.position_allowance)}</td>
                    <td className="px-4 py-3.5 text-right font-bold text-slate-500 whitespace-nowrap">{formatRp(row.meal_allowance)}</td>
                    <td className="px-4 py-3.5 text-right font-bold text-slate-500 whitespace-nowrap">{formatRp(row.transport_allowance)}</td>
                    <td className="px-4 py-3.5 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={31}
                          value={getHariMasuk(uid)}
                          onChange={(e) =>
                            setHariMasukOverrides((prev) => ({
                              ...prev,
                              [uid]: Math.max(0, Number(e.target.value) || 0),
                            }))
                          }
                          className="w-16 text-center px-2 py-1.5 border border-slate-200 rounded-xl font-black text-slate-800 outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400"
                        />
                        {auto && (
                          <span className="text-[9px] font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-full border border-sky-100">
                            Auto
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold text-slate-700 whitespace-nowrap">{formatRp(row.mealTotal)}</td>
                    <td className="px-4 py-3.5 text-right font-bold text-slate-700 whitespace-nowrap">{formatRp(row.transportTotal)}</td>
                    <td className="px-4 py-3.5 text-right font-bold text-rose-500 whitespace-nowrap">{formatRp(row.bpjs_deduction)}</td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      {row.customAdditions > 0 && (
                        <span className="font-bold text-emerald-600 block">+{formatRp(row.customAdditions)}</span>
                      )}
                      {row.customDeductions > 0 && (
                        <span className="font-bold text-rose-500 block">−{formatRp(row.customDeductions)}</span>
                      )}
                      {row.customAdditions === 0 && row.customDeductions === 0 && (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="font-black text-sky-700 whitespace-nowrap">{formatRp(row.netTotal)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-sky-50 border-t-2 border-sky-100">
                <td
                  colSpan={10}
                  className="px-5 py-4 text-[10px] font-black text-slate-600 uppercase tracking-widest"
                >
                  Total Pengeluaran Payroll Bulan Ini
                </td>
                <td className="px-5 py-4 text-right">
                  <span className="text-base font-black text-sky-700 whitespace-nowrap">{formatRp(grandTotal)}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </GlassCard>

      {/* Note */}
      <div className="flex gap-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
        <Info size={14} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
          Uang Makan & Transport = Rate/Hari × Hari Masuk. BPJS yang ditampilkan adalah potongan dari karyawan (employee side).
          Bonus KPI tidak termasuk di sini — lihat di modul Appraisal.
        </p>
      </div>
    </div>
  );
}
