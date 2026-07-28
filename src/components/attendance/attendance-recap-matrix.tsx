import { cn } from "@/lib/utils";
import { ATTENDANCE_STATUS_LABEL, type AttendanceStatus } from "@/lib/attendance-status";
import type { AttendanceRecap } from "@/lib/attendance-recap";

const CELL: Record<AttendanceStatus, { code: string; cls: string }> = {
  hadir: { code: "H", cls: "bg-emerald-100 text-emerald-700" },
  terlambat: { code: "T", cls: "bg-amber-100 text-amber-700" },
  izin: { code: "I", cls: "bg-violet-100 text-violet-700" },
  alpha: { code: "A", cls: "bg-rose-200 text-rose-800 font-black" },
  off: { code: "L", cls: "bg-slate-100 text-slate-300" },
  belum: { code: "·", cls: "text-slate-300" },
  none: { code: "", cls: "" },
};

const LEGEND: AttendanceStatus[] = ["hadir", "terlambat", "izin", "alpha", "off", "belum"];

// Chip ringkasan per-crew (tampilan HP). Urut: yang paling penting dulu.
const SUMMARY: { key: AttendanceStatus; label: string; cls: string }[] = [
  { key: "hadir", label: "Hadir", cls: "bg-emerald-100 text-emerald-700" },
  { key: "terlambat", label: "Telat", cls: "bg-amber-100 text-amber-700" },
  { key: "izin", label: "Izin", cls: "bg-violet-100 text-violet-700" },
  { key: "alpha", label: "Alpha", cls: "bg-rose-200 text-rose-800" },
  { key: "off", label: "Libur", cls: "bg-slate-100 text-slate-500" },
];

export function AttendanceRecapMatrix({ recap }: { recap: AttendanceRecap }) {
  const dayNums = recap.dates.map((d) => Number(d.slice(8, 10)));
  const colCount = 1 + recap.dates.length + 4;

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        {LEGEND.map((s) => (
          <span key={s} className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-bold", CELL[s].cls || "text-slate-400")}>
            <span className="font-black">{CELL[s].code || "—"}</span>
            {ATTENDANCE_STATUS_LABEL[s]}
          </span>
        ))}
        <span className="text-[10px] text-slate-400">· A = Alpha (mangkir: terjadwal, lampau, tanpa absen &amp; tanpa izin)</span>
      </div>

      {/* Mobile: kartu ringkasan per-crew (total H/T/I/A/L) */}
      <div className="space-y-2 md:hidden">
        {recap.rows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-6 text-center text-[11px] text-slate-400">
            Belum ada karyawan aktif.
          </div>
        ) : (
          recap.rows.map((r) => (
            <div key={r.userId} className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-[13px] font-bold text-slate-800">{r.name}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SUMMARY.map((s) => {
                  const n = r.totals[s.key];
                  const active = n > 0;
                  return (
                    <span
                      key={s.key}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold",
                        active ? s.cls : "bg-slate-50 text-slate-300",
                        active && s.key === "alpha" && "font-black ring-1 ring-rose-300",
                      )}
                    >
                      <span className="tabular-nums">{n}</span>
                      {s.label}
                    </span>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop: matriks harian penuh */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
        <table className="border-collapse text-[10px]">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="sticky left-0 z-[1] bg-slate-50 px-3 py-2 text-left font-black uppercase tracking-widest shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)]">
                Karyawan
              </th>
              {dayNums.map((n) => (
                <th key={n} className="w-6 px-0 py-2 text-center font-bold text-slate-400">
                  {n}
                </th>
              ))}
              <th className="px-2 py-2 text-center font-black text-emerald-600" title="Hadir">H</th>
              <th className="px-2 py-2 text-center font-black text-amber-600" title="Terlambat">T</th>
              <th className="px-2 py-2 text-center font-black text-violet-600" title="Izin">I</th>
              <th className="px-2 py-2 text-center font-black text-rose-600" title="Alpha">A</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {recap.rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-6 text-center text-slate-400">
                  Belum ada karyawan aktif.
                </td>
              </tr>
            ) : (
              recap.rows.map((r) => (
                <tr key={r.userId} className="hover:bg-slate-50/50">
                  <td className="sticky left-0 z-[1] bg-white px-3 py-1.5 font-semibold text-slate-800 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap">
                    {r.name}
                  </td>
                  {r.days.map((d) => {
                    const c = CELL[d.status];
                    return (
                      <td
                        key={d.date}
                        title={`${d.date} — ${ATTENDANCE_STATUS_LABEL[d.status]}`}
                        className={cn("h-6 w-6 border border-slate-50 text-center align-middle font-bold", c.cls)}
                      >
                        {c.code}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-center font-black text-emerald-700">{r.totals.hadir}</td>
                  <td className="px-2 py-1.5 text-center font-black text-amber-700">{r.totals.terlambat}</td>
                  <td className="px-2 py-1.5 text-center font-black text-violet-700">{r.totals.izin}</td>
                  <td className={cn("px-2 py-1.5 text-center font-black", r.totals.alpha > 0 ? "text-rose-700" : "text-slate-300")}>
                    {r.totals.alpha}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
