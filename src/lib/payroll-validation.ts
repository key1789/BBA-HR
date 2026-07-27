/**
 * Validasi input konfigurasi gaji — SATU SUMBER dipakai semua jalur simpan
 * (Super Admin, Admin Apotek, Owner) agar aturan money tidak divergen.
 *
 * Return pesan error (string) bila tidak valid, atau `null` bila valid.
 */

/**
 * Tipe item `custom_adjustments` yang sah. Termasuk `bpjs_employee`/`bpjs_employer`
 * karena BPJS memang disimpan sebagai item khusus di dalam custom_adjustments
 * (dengan id `__bpjs_*__`), bukan tipe penyesuaian biasa.
 */
const ALLOWED_ADJ_TYPES = new Set(["addition", "deduction", "bpjs_employee", "bpjs_employer"]);

export type PayrollConfigValidationInput = {
  baseSalary: number;
  positionAllowance: number;
  mealAllowance: number;
  transportAllowance: number;
  bpjsDeduction: number;
  /** Boleh array mentah hasil JSON.parse — divalidasi elemen per elemen di sini. */
  customAdjustments: unknown;
};

export function validatePayrollConfigInput(input: PayrollConfigValidationInput): string | null {
  const nums = [
    input.baseSalary,
    input.positionAllowance,
    input.mealAllowance,
    input.transportAllowance,
    input.bpjsDeduction,
  ];
  if (nums.some((v) => !Number.isFinite(v) || v < 0)) {
    return "Nilai gaji, tunjangan, dan potongan tidak boleh negatif.";
  }

  if (!Array.isArray(input.customAdjustments)) {
    return "Format custom adjustments tidak valid.";
  }

  for (const raw of input.customAdjustments) {
    const adj = raw as { type?: unknown; amount?: unknown; basis?: unknown };
    const amt = Number(adj?.amount);
    if (!Number.isFinite(amt) || amt < 0) {
      return "Nominal penyesuaian tidak boleh negatif.";
    }
    if (!ALLOWED_ADJ_TYPES.has(String(adj?.type))) {
      return "Tipe penyesuaian tidak valid.";
    }
    // basis opsional; bila diisi harus 'monthly' atau 'daily'
    if (adj?.basis != null && adj.basis !== "monthly" && adj.basis !== "daily") {
      return "Basis penyesuaian tidak valid.";
    }
  }

  return null;
}
