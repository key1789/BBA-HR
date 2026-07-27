#!/usr/bin/env node
/**
 * check-button-nesting.mjs
 *
 * Deteksi button-in-button (HTML invalid / React hydration error) secara AST.
 * Berbeda dari heuristik hitung-teks, ini memakai TypeScript compiler untuk
 * membaca struktur JSX yang sebenarnya — jadi ternary, `&&`, dan nesting
 * kondisional ditangani dengan benar (tidak ada false positive dari depth drift).
 *
 * Menandai:
 *   - <button> yang punya leluhur <button> di pohon JSX yang sama
 *   - <InfoTooltip> (komponen yang me-render <button>) di dalam <button>
 *
 * Jalankan:  node scripts/check-button-nesting.mjs
 * Exit code: 0 = bersih, 1 = ada temuan (cocok untuk CI / pre-commit).
 *
 * Menambah komponen lain yang me-render <button> di root-nya?
 * Tambahkan namanya ke BUTTON_RENDERING_COMPONENTS di bawah.
 */
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, "..", "src");

// Komponen yang me-render <button> di root-nya → nesting di dalam <button> = bug.
const BUTTON_RENDERING_COMPONENTS = new Set(["InfoTooltip"]);

function walkFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkFiles(p, out);
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function tagName(node) {
  return node.tagName ? node.tagName.getText() : "";
}

const hits = [];

for (const file of walkFiles(ROOT)) {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  function visit(node, buttonDepth) {
    let isButton = false;
    let tag = "";

    if (ts.isJsxElement(node)) tag = tagName(node.openingElement);
    else if (ts.isJsxSelfClosingElement(node)) tag = tagName(node);

    if (tag) {
      const lc = tag.toLowerCase();
      if (lc === "button") {
        if (buttonDepth >= 1) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
          hits.push({ file: relative(ROOT, file), line: line + 1, kind: "<button> di dalam <button>" });
        }
        isButton = true;
      } else if (BUTTON_RENDERING_COMPONENTS.has(tag)) {
        if (buttonDepth >= 1) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
          hits.push({ file: relative(ROOT, file), line: line + 1, kind: `<${tag}> (me-render button) di dalam <button>` });
        }
      }
    }

    const nextDepth = buttonDepth + (isButton ? 1 : 0);
    ts.forEachChild(node, (c) => visit(c, nextDepth));
  }

  visit(sf, 0);
}

if (hits.length === 0) {
  console.log("✓ CLEAN: tidak ada button-in-button terdeteksi.");
  process.exit(0);
} else {
  console.error(`✗ Ditemukan ${hits.length} button-in-button:\n`);
  for (const h of hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
    console.error(`  src/${h.file.replace(/\\/g, "/")}:${h.line}  -> ${h.kind}`);
  }
  process.exit(1);
}
