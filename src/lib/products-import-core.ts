/**
 * Logika murni untuk import master produk (parsing kolom + dedup + ringkasan).
 * Dipisah agar bisa di-unit-test tanpa file/alias. Pembacaan biner .xlsx tetap di server action.
 */

export function normalizeProductName(s: string): string {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

const HEADER_RE = /^(nama produk|nama|product name|produk)$/i;

/** Buang baris pertama bila tampak seperti judul kolom. */
export function stripHeaderRow(rawNames: string[]): string[] {
  if (rawNames.length > 0 && HEADER_RE.test((rawNames[0] ?? "").trim())) {
    return rawNames.slice(1);
  }
  return rawNames;
}

/** Ambil kolom pertama tiap baris dari teks CSV (dukung nilai berkutip). */
export function parseCsvFirstColumn(text: string): string[] {
  const clean = text.replace(/^﻿/, "");
  return clean.split(/\r?\n/).map((line) => {
    const quoted = line.match(/^\s*"([^"]*)"/);
    if (quoted) return quoted[1];
    return line.split(",")[0] ?? "";
  });
}

export type ImportSummary = {
  toAdd: string[];
  dupExisting: string[];
  dupInFile: number;
  empty: number;
  totalRows: number;
};

/**
 * Ringkas hasil import: buang kosong, buang dobel dalam file (case-insensitive),
 * pisahkan yang sudah ada di `existingNames` dari yang benar-benar baru.
 */
export function summarizeImport(rawNames: string[], existingNames: string[]): ImportSummary {
  const totalRows = rawNames.length;
  let empty = 0;
  let dupInFile = 0;
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const raw of rawNames) {
    const n = normalizeProductName(raw);
    if (!n) { empty++; continue; }
    const key = n.toLowerCase();
    if (seen.has(key)) { dupInFile++; continue; }
    seen.add(key);
    cleaned.push(n);
  }

  const existingKeys = new Set(existingNames.map((e) => normalizeProductName(e).toLowerCase()));
  const toAdd: string[] = [];
  const dupExisting: string[] = [];
  for (const n of cleaned) {
    if (existingKeys.has(n.toLowerCase())) dupExisting.push(n);
    else toAdd.push(n);
  }

  return { toAdd, dupExisting, dupInFile, empty, totalRows };
}
