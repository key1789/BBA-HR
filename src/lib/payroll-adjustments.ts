/**
 * SATU sumber pengali penyesuaian gaji kustom (custom adjustments).
 *
 * Basis "daily" dikali `days` (hari masuk); "monthly"/default dikali 1.
 * Dipakai oleh: server commit payroll (audit/actions), preview audit
 * (audit-detail-client via audit-utils), kartu estimasi Setup Gaji
 * (branches/tab-payroll), dan slip crew (crew/rapor). JANGAN tulis ulang
 * formula ini di tempat lain — impor dari sini.
 */
export type PayrollAdjBasis = { basis?: string | null };

export function customAdjMultiplier(o: PayrollAdjBasis, days: number): number {
  return String(o?.basis ?? "monthly").toLowerCase() === "daily" ? days : 1;
}
