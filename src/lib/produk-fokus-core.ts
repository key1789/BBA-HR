/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * SATU sumber kebenaran perhitungan bonus produk fokus untuk 1 config, diberi `sold`
 * unit (kumulatif per crew dalam periode). Modul murni tanpa alias/impor agar bisa di-unit-test.
 *
 * 5 skema:
 *   gerbang = has_min_target ? target_value : 1
 *   flat      -> sold >= gerbang ? bonus : 0
 *   kelipatan -> basis = (has_min_target && count_base='excess') ? target_value : 0
 *                sold >= gerbang ? floor((sold - basis)/step) * bonus : 0
 *
 * Data lama (tanpa kolom baru) diperlakukan has_min_target=true, count_base='excess'
 * sehingga perilaku sebelumnya tidak berubah.
 */
/**
 * Kalimat aturan bonus dalam bahasa manusia — SATU sumber, dipakai preview modal & daftar
 * agar deskripsi di layar selalu selaras dengan mesin {@link productFokusEarnedForConfig}.
 */
export function describeProductFokusRule(cfg: any): string {
  const fmt = (n: number) => `Rp${new Intl.NumberFormat("id-ID").format(Math.round(Number(n) || 0))}`;
  const bonus = Number(cfg?.bonus_value ?? 0);
  const step = Number(cfg?.bonus_step ?? 0);
  const target = Number(cfg?.target_value ?? 0);
  const hasMinTarget = cfg?.has_min_target !== false;
  const isKelipatan = cfg?.bonus_type === "kelipatan";

  if (!isKelipatan) {
    return hasMinTarget
      ? `Bonus ${fmt(bonus)} (sekali) jika crew menjual minimal ${target} unit.`
      : `Bonus ${fmt(bonus)} (sekali) begitu crew menjual produk ini (mulai 1 unit).`;
  }
  if (!hasMinTarget) {
    return `Bonus ${fmt(bonus)} setiap ${step} unit terjual — tanpa target minimal.`;
  }
  return (cfg?.count_base ?? "excess") === "full"
    ? `Setelah capai ${target} unit, bonus ${fmt(bonus)} setiap ${step} unit dari SELURUH penjualan.`
    : `Setelah capai ${target} unit, bonus ${fmt(bonus)} setiap ${step} unit KELEBIHAN di atas target.`;
}

export function productFokusEarnedForConfig(cfg: any, sold: number): number {
  const soldNum = Number.isFinite(sold) ? Number(sold) : 0;
  const targetValue = Number(cfg?.target_value ?? 0);
  const bonusValue = Number(cfg?.bonus_value ?? 0);
  const step = Number(cfg?.bonus_step ?? 1) || 1;
  const hasMinTarget = cfg?.has_min_target !== false;

  const gate = hasMinTarget ? targetValue : 1;
  if (soldNum < gate) return 0;

  if (cfg?.bonus_type === "kelipatan") {
    const base = hasMinTarget && (cfg?.count_base ?? "excess") === "excess" ? targetValue : 0;
    return Math.floor((soldNum - base) / step) * bonusValue;
  }
  return bonusValue;
}

/**
 * Total bonus produk fokus otomatis SATU crew untuk periode: jumlahkan quantity_sold
 * per produk (dari submission approved dalam rentang), lalu terapkan skema tiap config.
 * Dipakai baik untuk TAMPILAN (audit detail) maupun SUMBER KEBENARAN (sync -> monthly_appraisals),
 * supaya angka layar & payroll selalu sama.
 *
 * `approvedProductRows`: baris daily_submission_products yang sudah difilter ke submission approved,
 * tiap baris punya `product_id`, `quantity_sold`, dan `submission` ({user_id, submission_date}).
 * `bounds`: rentang tanggal (monthStartKey..mtdThroughDateKey, "YYYY-MM-DD").
 */
export function computeProductFokusBonusTotalForUser(
  userId: string,
  productFokusConfigs: any[],
  approvedProductRows: any[],
  bounds: { monthStartKey: string; mtdThroughDateKey: string },
): number {
  const soldByProductId = new Map<string, number>();
  for (const row of approvedProductRows ?? []) {
    const submission = Array.isArray(row.submission) ? row.submission[0] : row.submission;
    const uid = String(submission?.user_id ?? "");
    const dateKey = String(submission?.submission_date ?? "").slice(0, 10);
    if (!userId || uid !== String(userId)) continue;
    if (!dateKey || dateKey < bounds.monthStartKey || dateKey > bounds.mtdThroughDateKey) continue;
    const pid = String(row.product_id ?? "");
    if (!pid) continue;
    soldByProductId.set(pid, (soldByProductId.get(pid) ?? 0) + Number(row.quantity_sold ?? 0));
  }

  let total = 0;
  for (const cfg of productFokusConfigs ?? []) {
    const productId = String(cfg.product_id ?? "");
    const sold = soldByProductId.get(productId) ?? 0;
    total += productFokusEarnedForConfig(cfg, sold);
  }
  return total;
}
