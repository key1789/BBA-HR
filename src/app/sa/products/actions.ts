"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { assertBbaAccess } from "@/lib/bba-portal-guard";
import {
  normalizeProductName,
  stripHeaderRow,
  parseCsvFirstColumn,
  summarizeImport,
} from "@/lib/products-import-core";

const MAX_IMPORT_ROWS = 5000;

async function parseProductNamesFromFile(file: File): Promise<string[]> {
  const buf = Buffer.from(await file.arrayBuffer());
  const lname = (file.name || "").toLowerCase();
  if (lname.endsWith(".csv") || file.type === "text/csv") {
    return parseCsvFirstColumn(buf.toString("utf8"));
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out: string[] = [];
  ws.eachRow((row) => {
    const v = row.getCell(1).value as any;
    if (v == null) { out.push(""); return; }
    if (typeof v === "object") out.push(String(v.text ?? v.result ?? v.hyperlink ?? ""));
    else out.push(String(v));
  });
  return out;
}

/** Baca file & bandingkan dengan data lama; kembalikan ringkasan sebelum commit. */
export async function previewMasterProductsImportAction(prevState: any, formData: FormData) {
  void prevState;
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  const file = formData.get("file");
  if (!file || typeof file === "string" || (file as File).size === 0) {
    return { error: "File tidak ditemukan atau kosong." };
  }
  if ((file as File).size > 2 * 1024 * 1024) {
    return { error: "Ukuran file maksimal 2 MB." };
  }

  let rawNames: string[];
  try {
    rawNames = await parseProductNamesFromFile(file as File);
  } catch {
    return { error: "Gagal membaca file. Pastikan format .xlsx atau .csv yang benar." };
  }

  rawNames = stripHeaderRow(rawNames);
  if (rawNames.length > MAX_IMPORT_ROWS) {
    return { error: `Terlalu banyak baris (${rawNames.length}). Maksimal ${MAX_IMPORT_ROWS} per impor.` };
  }

  const supabase = createAdminClient();
  const { data: existing } = await supabase.from("master_products").select("product_name");
  const existingNames = (existing ?? []).map((r: any) => String(r.product_name ?? ""));

  const s = summarizeImport(rawNames, existingNames);

  return {
    success: true as const,
    toAdd: s.toAdd,
    dupExistingSample: s.dupExisting.slice(0, 30),
    counts: {
      totalRows: s.totalRows,
      toAdd: s.toAdd.length,
      dupExisting: s.dupExisting.length,
      dupInFile: s.dupInFile,
      empty: s.empty,
    },
  };
}

/** Insert daftar nama yang sudah dikonfirmasi user (re-cek anti-dobel di server). */
export async function commitMasterProductsImportAction(prevState: any, formData: FormData) {
  void prevState;
  const gate = await assertBbaAccess();
  if (!gate.ok) return { error: gate.error };

  let names: unknown;
  try {
    names = JSON.parse((formData.get("names") as string) || "[]");
  } catch {
    return { error: "Data impor tidak valid." };
  }
  if (!Array.isArray(names) || names.length === 0) {
    return { error: "Tidak ada produk untuk ditambahkan." };
  }
  if (names.length > MAX_IMPORT_ROWS) {
    return { error: `Terlalu banyak baris. Maksimal ${MAX_IMPORT_ROWS} per impor.` };
  }

  const supabase = createAdminClient();
  const { data: existing } = await supabase.from("master_products").select("product_name");
  const existingKeys = new Set(
    (existing ?? []).map((r: any) => normalizeProductName(r.product_name).toLowerCase()),
  );

  const now = new Date().toISOString();
  const seen = new Set<string>();
  const rows: { product_name: string; is_active: boolean; created_at: string; updated_at: string }[] = [];
  for (const raw of names) {
    const n = normalizeProductName(String(raw));
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key) || existingKeys.has(key)) continue;
    seen.add(key);
    rows.push({ product_name: n, is_active: true, created_at: now, updated_at: now });
  }

  if (rows.length === 0) {
    return { error: "Semua produk sudah ada atau tidak valid." };
  }

  const { error } = await supabase.from("master_products").insert(rows);
  if (error) return { error: `Gagal menyimpan: ${error.message}` };

  revalidatePath("/sa/products");
  revalidatePath("/sa/branches", "layout");
  return { success: true as const, message: `${rows.length} produk berhasil ditambahkan.`, added: rows.length };
}

export async function saveMasterProductAction(prevState: any, formData: FormData) {
  const id = formData.get("id") as string;
  const name = formData.get("product_name") as string;

  if (!name) return { error: "Nama produk wajib diisi." };

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const payload = {
    product_name: name,
    updated_at: now
  };

  let error;
  if (id) {
    const { error: updateError } = await supabase
      .from("master_products")
      .update(payload)
      .eq("id", id);
    error = updateError;
  } else {
    const { error: insertError } = await supabase
      .from("master_products")
      .insert({ ...payload, is_active: true, created_at: now });
    error = insertError;
  }

  if (error) {
    if ((error as any).code === "23505") return { error: "Produk dengan nama itu sudah ada." };
    return { error: `Gagal menyimpan produk: ${error.message}` };
  }

  revalidatePath("/sa/products");
  revalidatePath("/sa/branches", "layout");
  return { success: true, message: "Produk berhasil disimpan!" };
}

export async function toggleProductStatusAction(id: string, currentStatus: boolean) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("master_products")
    .update({ is_active: !currentStatus, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: `Gagal mengubah status: ${error.message}` };

  revalidatePath("/sa/products");
  return { success: true, message: `Produk berhasil di${!currentStatus ? 'aktifkan' : 'nonaktifkan'}!` };
}
