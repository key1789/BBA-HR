import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeProductName,
  stripHeaderRow,
  parseCsvFirstColumn,
  summarizeImport,
} from "@/lib/products-import-core";

test("normalizeProductName trims dan rapikan spasi", () => {
  assert.equal(normalizeProductName("  Paracetamol   500mg "), "Paracetamol 500mg");
  assert.equal(normalizeProductName(""), "");
});

test("stripHeaderRow buang baris judul", () => {
  assert.deepEqual(stripHeaderRow(["Nama Produk", "A", "B"]), ["A", "B"]);
  assert.deepEqual(stripHeaderRow(["Paracetamol", "B"]), ["Paracetamol", "B"]);
});

test("parseCsvFirstColumn: BOM, kutip, koma", () => {
  const csv = "﻿Nama Produk\r\nParacetamol\r\n\"Vitamin C, 1000mg\"\r\nAmox,500";
  assert.deepEqual(parseCsvFirstColumn(csv), ["Nama Produk", "Paracetamol", "Vitamin C, 1000mg", "Amox"]);
});

test("summarizeImport: dedup dalam file + vs data lama + kosong", () => {
  const raw = ["ctm", "CTM", "  Paracetamol ", "", "Amox", "amox", "Swamed"];
  const existing = ["Swamed", "cetirizine"];
  const r = summarizeImport(raw, existing);
  assert.deepEqual(r.toAdd, ["ctm", "Paracetamol", "Amox"]);
  assert.deepEqual(r.dupExisting, ["Swamed"]);
  assert.equal(r.dupInFile, 2); // "CTM" dan "amox"
  assert.equal(r.empty, 1);
  assert.equal(r.totalRows, 7);
});

test("summarizeImport: semua baru", () => {
  const r = summarizeImport(["A", "B", "C"], []);
  assert.deepEqual(r.toAdd, ["A", "B", "C"]);
  assert.equal(r.dupExisting.length, 0);
});
