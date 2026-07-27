/**
 * SATU sumber kebenaran: apakah sebuah add-on (yang sudah aktif) sudah "terkonfigurasi"?
 * Dipakai skor kesehatan cabang (Overview) DAN badge di tab Add-on agar sinyalnya konsisten.
 *
 * Aturan (disepakati 2026-07-26):
 *  - review_internal → butuh `frequency_per_month` terisi
 *  - payroll         → butuh `allow_admin_input` atau `allow_owner_input`
 *  - selebihnya (produk_fokus, absensi_shift, review_pelanggan) → aktif = beres
 *    (konfigurasi dalamnya opsional / disimpan di tabel lain, bukan di addon_settings.settings)
 */
export function isAddonConfigured(key: string, settings: unknown): boolean {
  const s =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};

  switch (key) {
    case "review_internal":
      return typeof s.frequency_per_month === "number";
    case "payroll":
      return Boolean(s.allow_admin_input) || Boolean(s.allow_owner_input);
    default:
      return true;
  }
}
