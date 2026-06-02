import ExcelJS from "exceljs";
import type { ExportData, ExportCrewDaily } from "./fetch-export-data";

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS_ID = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

// ARGB colors (Excel uses ARGB)
const XL = {
  emerald:     "FF059669",
  emeraldDark: "FF047857",
  emeraldLight:"FFD1FAE5",
  emeraldBg:   "FFF0FDF4",
  white:       "FFFFFFFF",
  slate50:     "FFF8FAFC",
  slate100:    "FFF1F5F9",
  slate200:    "FFE2E8F0",
  slate500:    "FF64748B",
  slate700:    "FF334155",
  slate900:    "FF0F172A",
  amber50:     "FFFFFBEB",
  amber500:    "FFF59E0B",
  green600:    "FF16A34A",
  red100:      "FFFEE2E2",
  red600:      "FFDC2626",
};

// ─── Style helpers ────────────────────────────────────────────────────────────
function headerFill(argb = XL.emerald): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function altFill(argb = XL.slate50): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function thinBorder(color = XL.slate200): Partial<ExcelJS.Borders> {
  const s = { style: "thin" as const, color: { argb: color } };
  return { top: s, left: s, bottom: s, right: s };
}

function headerFont(): Partial<ExcelJS.Font> {
  return { bold: true, color: { argb: XL.white }, size: 9, name: "Arial" };
}

function boldFont(color = XL.slate900, size = 9): Partial<ExcelJS.Font> {
  return { bold: true, color: { argb: color }, size, name: "Arial" };
}

function normalFont(color = XL.slate700, size = 9): Partial<ExcelJS.Font> {
  return { color: { argb: color }, size, name: "Arial" };
}

function applyHeaderRow(row: ExcelJS.Row, bgArgb = XL.emerald) {
  row.eachCell((cell) => {
    cell.fill = headerFill(bgArgb);
    cell.font = headerFont();
    cell.border = thinBorder("FF34D399");
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  row.height = 20;
}

function applyDataRow(row: ExcelJS.Row, isAlt: boolean, highlight?: string) {
  row.eachCell((cell) => {
    cell.fill = highlight
      ? { type: "pattern", pattern: "solid", fgColor: { argb: highlight } }
      : isAlt ? altFill() : headerFill(XL.white);
    cell.border = thinBorder();
    if (!cell.font) cell.font = normalFont();
    cell.alignment = cell.alignment ?? { vertical: "middle" };
  });
  row.height = 16;
}

function applyTotalRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.emeraldBg } };
    cell.font = boldFont(XL.emeraldDark);
    cell.border = thinBorder(XL.emerald);
    cell.alignment = cell.alignment ?? { vertical: "middle" };
  });
  row.height = 18;
}

// ─── Format helpers ───────────────────────────────────────────────────────────
const RP_FMT   = '"Rp "#,##0;[Red]-"Rp "#,##0';
const RP_FMT_0 = '"Rp "#,##0';
const PCT_FMT  = '0.0"%"';
const NUM_FMT  = '#,##0';
const DEC_FMT  = '#,##0.0';

function setRp(cell: ExcelJS.Cell, val: number) {
  cell.value = val;
  cell.numFmt = RP_FMT_0;
  cell.alignment = { horizontal: "right", vertical: "middle" };
}

function setNum(cell: ExcelJS.Cell, val: number, fmt = NUM_FMT) {
  cell.value = val;
  cell.numFmt = fmt;
  cell.alignment = { horizontal: "right", vertical: "middle" };
}

function setPct(cell: ExcelJS.Cell, val: number) {
  cell.value = val / 100;
  cell.numFmt = '0.0"%"';
  cell.alignment = { horizontal: "right", vertical: "middle" };
}

function setCenter(cell: ExcelJS.Cell, val: string | number) {
  cell.value = val;
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

// ─── Computation helpers ──────────────────────────────────────────────────────
function pad2(n: number) { return String(n).padStart(2, "0"); }

function calcCrewTotals(userId: string, crewDailyData: ExportCrewDaily[]) {
  return crewDailyData.filter((d) => d.userId === userId).reduce(
    (acc, d) => ({ omzet: acc.omzet + d.omzet, tx: acc.tx + d.transactions, prod: acc.prod + d.products }),
    { omzet: 0, tx: 0, prod: 0 },
  );
}

function calcSarp(omzet: number, tx: number, prod: number, refAtv: number, refAtu: number) {
  const atv = tx > 0 ? omzet / tx : 0;
  const atu = tx > 0 ? prod / tx : 0;
  const atvPct = refAtv > 0 ? (atv / refAtv) * 100 : 0;
  const atuPct = refAtu > 0 ? (atu / refAtu) * 100 : 0;
  return { atv, atu, atvPct, atuPct, sarp: (atvPct + atuPct) / 2 };
}

// ─── Sheet builders ───────────────────────────────────────────────────────────

/** Sheet 1: Ringkasan */
function buildRingkasan(wb: ExcelJS.Workbook, data: ExportData) {
  const ws = wb.addWorksheet("Ringkasan");
  const { branch, owner, kpi, crew, period } = data;
  const monthName = MONTHS_ID[period.month - 1];

  ws.columns = [
    { width: 26 }, { width: 40 }, { width: 26 }, { width: 40 },
  ];

  // Title
  ws.mergeCells("A1:D1");
  const title = ws.getCell("A1");
  title.value = `LAPORAN JAGO JUALAN BBA — ${branch.name}`;
  title.font = boldFont(XL.white, 14);
  title.fill = headerFill(XL.emerald);
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 28;

  ws.mergeCells("A2:D2");
  const sub = ws.getCell("A2");
  sub.value = `Periode: ${monthName} ${period.year}`;
  sub.font = boldFont(XL.emeraldDark, 11);
  sub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.emeraldBg } };
  sub.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(2).height = 20;

  ws.addRow([]);

  // Branch info
  const info: [string, string][] = [
    ["Nama Apotek", branch.name],
    ["Kode", branch.code],
    ["Alamat", branch.address ?? "-"],
    ["Telepon", branch.phone ?? "-"],
    ["Owner", owner?.fullName ?? "-"],
    ["Periode", `${monthName} ${period.year}`],
    ["Jumlah Crew", `${crew.length} orang`],
  ];

  for (const [label, value] of info) {
    const row = ws.addRow([label, value, "", ""]);
    const lc = row.getCell(1);
    const vc = row.getCell(2);
    lc.font = boldFont(XL.emeraldDark);
    lc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.emeraldBg } };
    vc.font = normalFont();
    lc.border = thinBorder();
    vc.border = thinBorder();
    row.height = 16;
  }

  ws.addRow([]);

  // KPI targets
  const kpiHeader = ws.addRow(["TARGET BULANAN", "", "", ""]);
  kpiHeader.getCell(1).font = boldFont(XL.white);
  kpiHeader.getCell(1).fill = headerFill();
  ws.mergeCells(`A${kpiHeader.number}:D${kpiHeader.number}`);
  kpiHeader.height = 18;

  const kpiRows: [string, string][] = [
    ["Target Omzet", kpi ? `Rp ${kpi.targetOmzet.toLocaleString("id-ID")}` : "Belum diset"],
    ["Target ATV", kpi && kpi.targetAtv > 0 ? `Rp ${kpi.targetAtv.toLocaleString("id-ID")}` : "Belum diset"],
    ["Target ATU", kpi && kpi.targetAtu > 0 ? `${kpi.targetAtu.toFixed(1)} produk` : "Belum diset"],
  ];
  for (const [label, value] of kpiRows) {
    const r = ws.addRow([label, value]);
    r.getCell(1).font = boldFont(XL.emeraldDark);
    r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.emeraldBg } };
    r.getCell(1).border = thinBorder();
    r.getCell(2).border = thinBorder();
    r.height = 16;
  }

  ws.addRow([]);

  // Crew list
  const crewHeader = ws.addRow(["DAFTAR CREW", "", "", ""]);
  crewHeader.getCell(1).font = boldFont(XL.white);
  crewHeader.getCell(1).fill = headerFill();
  ws.mergeCells(`A${crewHeader.number}:D${crewHeader.number}`);
  crewHeader.height = 18;

  const crewColHeader = ws.addRow(["No", "Nama Karyawan", "No", "Nama Karyawan"]);
  applyHeaderRow(crewColHeader);

  const half = Math.ceil(crew.length / 2);
  for (let i = 0; i < half; i++) {
    const lc = crew[i];
    const rc = crew[i + half];
    const r = ws.addRow([i + 1, lc.fullName, rc ? i + half + 1 : "", rc?.fullName ?? ""]);
    applyDataRow(r, i % 2 !== 0);
    r.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    r.getCell(3).alignment = { horizontal: "center", vertical: "middle" };
  }
}

/** Sheet 2: Rekapitulasi Harian */
function buildHarian(wb: ExcelJS.Workbook, data: ExportData) {
  const ws = wb.addWorksheet("Rekapitulasi Harian");
  const { dailyTotals, period, kpi } = data;
  const monthName = MONTHS_ID[period.month - 1];
  const targetMonthly = kpi?.targetOmzet ?? 0;
  const targetDaily = targetMonthly > 0 ? targetMonthly / period.daysInMonth : 0;

  ws.columns = [
    { key: "no",     width: 6  },
    { key: "tgl",    width: 14 },
    { key: "target", width: 18 },
    { key: "omzet",  width: 18 },
    { key: "pct",    width: 10 },
    { key: "nota",   width: 10 },
    { key: "prod",   width: 10 },
    { key: "atv",    width: 18 },
    { key: "atu",    width: 10 },
    { key: "rej",    width: 12 },
    { key: "estrej", width: 18 },
  ];

  // Title
  ws.mergeCells("A1:K1");
  ws.getCell("A1").value = `Rekapitulasi Harian — ${data.branch.name} — ${monthName} ${period.year}`;
  ws.getCell("A1").font = boldFont(XL.white, 11);
  ws.getCell("A1").fill = headerFill();
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 22;
  ws.addRow([]);

  const hdr = ws.addRow(["No", "Tanggal", "Target Harian", "Omzet", "% Target", "Nota", "Produk", "ATV", "ATU", "Tertolak", "Est. Omzet Tertolak"]);
  applyHeaderRow(hdr);
  ws.views = [{ state: "frozen", ySplit: hdr.number }];

  const dateMap = new Map(dailyTotals.map((d) => [d.date, d]));
  let mtdOmzet = 0;

  for (let day = 1; day <= period.daysInMonth; day++) {
    const dateStr = `${period.year}-${pad2(period.month)}-${pad2(day)}`;
    const e = dateMap.get(dateStr);
    const omzet = e?.omzet ?? 0;
    const tx = e?.transactions ?? 0;
    const prod = e?.products ?? 0;
    const rej = e?.rejectedCustomers ?? 0;
    const atv = tx > 0 ? omzet / tx : 0;
    const atu = tx > 0 ? prod / tx : 0;
    const rejEst = rej * atv;
    const pctTgt = targetDaily > 0 ? (omzet / targetDaily) * 100 : null;
    mtdOmzet += omzet;

    const r = ws.addRow([]);
    r.getCell(1).value = day;
    r.getCell(2).value = `${pad2(day)}/${pad2(period.month)}/${period.year}`;
    if (targetDaily > 0) setRp(r.getCell(3), targetDaily);
    if (e) {
      setRp(r.getCell(4), omzet);
      if (pctTgt !== null) setPct(r.getCell(5), pctTgt);
      setNum(r.getCell(6), tx);
      setNum(r.getCell(7), prod);
      setRp(r.getCell(8), atv);
      setNum(r.getCell(9), atu, DEC_FMT);
      setNum(r.getCell(10), rej);
      if (rej > 0) setRp(r.getCell(11), rejEst);
    }

    const isAlt = day % 2 === 0;
    let highlight: string | undefined;
    if (e && pctTgt !== null) {
      highlight = pctTgt >= 100 ? "FFE8FDF0" : pctTgt > 0 ? "FFFFFBEB" : undefined;
    }
    applyDataRow(r, isAlt, highlight);

    r.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    r.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
    if (pctTgt !== null && e) {
      r.getCell(5).font = {
        ...(r.getCell(5).font ?? {}),
        bold: true,
        color: { argb: pctTgt >= 100 ? XL.green600 : XL.amber500 },
      };
    }
    if (rej > 0 && e) {
      r.getCell(10).font = { ...normalFont(), bold: true, color: { argb: XL.amber500 } };
      r.getCell(11).font = { ...normalFont(), bold: true, color: { argb: XL.amber500 } };
    }
  }

  // Total row
  const branchT = dailyTotals.reduce((acc, d) => ({
    omzet: acc.omzet + d.omzet, tx: acc.tx + d.transactions,
    prod: acc.prod + d.products, rej: acc.rej + d.rejectedCustomers,
  }), { omzet: 0, tx: 0, prod: 0, rej: 0 });
  const branchAtv = branchT.tx > 0 ? branchT.omzet / branchT.tx : 0;
  const branchAtu = branchT.tx > 0 ? branchT.prod / branchT.tx : 0;

  const totalRow = ws.addRow([]);
  totalRow.getCell(1).value = "Σ";
  totalRow.getCell(2).value = "TOTAL BULAN";
  if (targetMonthly > 0) setRp(totalRow.getCell(3), targetMonthly);
  setRp(totalRow.getCell(4), branchT.omzet);
  if (targetMonthly > 0) setPct(totalRow.getCell(5), (branchT.omzet / targetMonthly) * 100);
  setNum(totalRow.getCell(6), branchT.tx);
  setNum(totalRow.getCell(7), branchT.prod);
  setRp(totalRow.getCell(8), branchAtv);
  setNum(totalRow.getCell(9), branchAtu, DEC_FMT);
  setNum(totalRow.getCell(10), branchT.rej);
  setRp(totalRow.getCell(11), branchT.rej * branchAtv);
  applyTotalRow(totalRow);
  totalRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  totalRow.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
}

/** Sheet 3: Performa Karyawan (SARP) */
function buildPerforma(wb: ExcelJS.Workbook, data: ExportData) {
  const ws = wb.addWorksheet("Performa Karyawan");
  const { crew, crewDailyData, kpi, dailyTotals, period } = data;
  const monthName = MONTHS_ID[period.month - 1];

  const branchT = dailyTotals.reduce((acc, d) => ({
    omzet: acc.omzet + d.omzet, tx: acc.tx + d.transactions, prod: acc.prod + d.products,
  }), { omzet: 0, tx: 0, prod: 0 });
  const branchAtv = branchT.tx > 0 ? branchT.omzet / branchT.tx : 0;
  const branchAtu = branchT.tx > 0 ? branchT.prod / branchT.tx : 0;
  const refAtv = kpi && kpi.targetAtv > 0 ? kpi.targetAtv : branchAtv;
  const refAtu = kpi && kpi.targetAtu > 0 ? kpi.targetAtu : branchAtu;

  ws.columns = [
    { width: 6 }, { width: 24 }, { width: 18 }, { width: 10 }, { width: 10 },
    { width: 18 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 },
  ];

  ws.mergeCells("A1:J1");
  ws.getCell("A1").value = `Performa Karyawan — ${data.branch.name} — ${monthName} ${period.year}`;
  ws.getCell("A1").font = boldFont(XL.white, 11);
  ws.getCell("A1").fill = headerFill();
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 22;
  ws.addRow([]);

  // Reference info
  ws.mergeCells("A3:B3");
  ws.getCell("A3").value = `Referensi ATV: Rp ${Math.round(refAtv).toLocaleString("id-ID")} (${kpi && kpi.targetAtv > 0 ? "target KPI" : "rata-rata branch"})`;
  ws.getCell("A3").font = normalFont(XL.emeraldDark);
  ws.mergeCells("C3:D3");
  ws.getCell("C3").value = `Referensi ATU: ${refAtu.toFixed(1)} prd (${kpi && kpi.targetAtu > 0 ? "target KPI" : "rata-rata branch"})`;
  ws.getCell("C3").font = normalFont(XL.emeraldDark);
  ws.getRow(3).height = 16;
  ws.addRow([]);

  const hdr = ws.addRow(["No", "Nama Karyawan", "Total Omzet", "Nota", "Produk", "ATV", "ATU", "ATV%", "ATU%", "SARP%"]);
  applyHeaderRow(hdr);
  ws.views = [{ state: "frozen", ySplit: hdr.number }];

  const crewSorted = [...crew].sort((a, b) => {
    const ta = calcCrewTotals(a.userId, crewDailyData);
    const tb = calcCrewTotals(b.userId, crewDailyData);
    return tb.omzet - ta.omzet;
  });

  crewSorted.forEach((c, i) => {
    const t = calcCrewTotals(c.userId, crewDailyData);
    const s = calcSarp(t.omzet, t.tx, t.prod, refAtv, refAtu);
    const hasData = t.omzet > 0 || t.tx > 0;
    const r = ws.addRow([]);
    setCenter(r.getCell(1), i + 1);
    r.getCell(2).value = c.fullName;
    r.getCell(2).font = hasData ? boldFont(XL.slate900) : normalFont(XL.slate500);
    if (hasData) {
      setRp(r.getCell(3), t.omzet);
      setNum(r.getCell(4), t.tx);
      setNum(r.getCell(5), t.prod);
      setRp(r.getCell(6), s.atv);
      setNum(r.getCell(7), s.atu, DEC_FMT);
      setPct(r.getCell(8), s.atvPct);
      setPct(r.getCell(9), s.atuPct);
      setPct(r.getCell(10), s.sarp);

      // Color SARP%
      const sarpCell = r.getCell(10);
      sarpCell.font = boldFont(s.sarp >= 100 ? XL.green600 : XL.amber500);

      // Color ATV%, ATU%
      r.getCell(8).font = boldFont(s.atvPct >= 100 ? XL.green600 : XL.amber500);
      r.getCell(9).font = boldFont(s.atuPct >= 100 ? XL.green600 : XL.amber500);
    }

    const highlight = !hasData ? undefined : s.sarp >= 100 ? "FFE8FDF0" : s.sarp >= 70 ? "FFFFFBEB" : "FFFEF2F2";
    applyDataRow(r, i % 2 !== 0, highlight);
  });

  // Branch total
  const totalRow = ws.addRow([]);
  totalRow.getCell(1).value = "Σ";
  totalRow.getCell(2).value = "Branch Total";
  setRp(totalRow.getCell(3), branchT.omzet);
  setNum(totalRow.getCell(4), branchT.tx);
  setNum(totalRow.getCell(5), branchT.prod);
  setRp(totalRow.getCell(6), branchAtv);
  setNum(totalRow.getCell(7), branchAtu, DEC_FMT);
  applyTotalRow(totalRow);
  totalRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
}

/** Sheet 4: Matriks Harian */
function buildMatriks(wb: ExcelJS.Workbook, data: ExportData) {
  const ws = wb.addWorksheet("Matriks Harian");
  const { crew, crewDailyData, period } = data;
  const monthName = MONTHS_ID[period.month - 1];
  const days = Array.from({ length: period.daysInMonth }, (_, i) => i + 1);

  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 2 }];

  // Title row
  ws.mergeCells(1, 1, 1, days.length + 2);
  ws.getCell("A1").value = `Matriks Omzet Harian Per Karyawan — ${data.branch.name} — ${monthName} ${period.year}`;
  ws.getCell("A1").font = boldFont(XL.white, 11);
  ws.getCell("A1").fill = headerFill();
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 22;

  // Header row: Karyawan | 1 | 2 | ... | Total
  const hdrValues = ["Karyawan", ...days.map(String), "Total"];
  const hdrRow = ws.addRow(hdrValues);
  applyHeaderRow(hdrRow);
  hdrRow.getCell(1).font = boldFont(XL.white, 9);
  ws.getColumn(1).width = 24;
  for (let d = 1; d <= days.length; d++) ws.getColumn(d + 1).width = 9;
  ws.getColumn(days.length + 2).width = 16;

  // Lookup: userId → day → omzet
  const lookupClean = new Map<string, Map<number, number>>();
  for (const rec of crewDailyData) {
    const day = new Date(rec.date).getDate();
    if (!lookupClean.has(rec.userId)) lookupClean.set(rec.userId, new Map());
    const dm = lookupClean.get(rec.userId)!;
    dm.set(day, (dm.get(day) ?? 0) + rec.omzet);
  }

  crew.forEach((c, rowIdx) => {
    const dm = lookupClean.get(c.userId) ?? new Map<number, number>();
    const crewTotal = Array.from(dm.values()).reduce((s, v) => s + v, 0);
    const vals: (string | number)[] = [c.fullName, ...days.map((d) => dm.get(d) ?? 0), crewTotal];
    const r = ws.addRow(vals);
    applyDataRow(r, rowIdx % 2 !== 0);
    r.getCell(1).font = boldFont(XL.slate900);
    // Format numbers
    for (let d = 1; d <= days.length; d++) {
      const cell = r.getCell(d + 1);
      const v = (dm.get(d) ?? 0);
      if (v > 0) {
        cell.numFmt = '"Rp "#,##0';
        cell.alignment = { horizontal: "right", vertical: "middle" };
        cell.font = normalFont(XL.slate700, 8);
      } else {
        cell.value = "";
      }
    }
    const totalCell = r.getCell(days.length + 2);
    totalCell.numFmt = '"Rp "#,##0';
    totalCell.font = boldFont(crewTotal > 0 ? XL.emeraldDark : XL.slate500);
    totalCell.alignment = { horizontal: "right", vertical: "middle" };
  });

  // Day totals row
  const dayTotals = days.map((d) => {
    const dateStr = `${period.year}-${pad2(period.month)}-${pad2(d)}`;
    return crewDailyData.filter((r) => r.date === dateStr).reduce((s, r) => s + r.omzet, 0);
  });
  const grandTotal = dayTotals.reduce((s, v) => s + v, 0);
  const totRow = ws.addRow(["Total Harian", ...dayTotals, grandTotal]);
  applyTotalRow(totRow);
  totRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
  for (let d = 1; d <= days.length; d++) {
    const cell = totRow.getCell(d + 1);
    if (dayTotals[d - 1] > 0) {
      cell.numFmt = '"Rp "#,##0';
      cell.alignment = { horizontal: "right", vertical: "middle" };
    } else {
      cell.value = "";
    }
  }
  const gCell = totRow.getCell(days.length + 2);
  gCell.numFmt = '"Rp "#,##0';
  gCell.alignment = { horizontal: "right", vertical: "middle" };
}

/** Sheet 5: Tren 12 Bulan */
function buildTren(wb: ExcelJS.Workbook, data: ExportData) {
  const ws = wb.addWorksheet("Tren 12 Bulan");
  const { monthlyTrend, period } = data;
  const monthName = MONTHS_ID[period.month - 1];

  ws.columns = [
    { width: 6 }, { width: 22 }, { width: 20 }, { width: 14 }, { width: 30 },
  ];

  ws.mergeCells("A1:E1");
  ws.getCell("A1").value = `Tren Omzet 12 Bulan — ${data.branch.name} — s/d ${monthName} ${period.year}`;
  ws.getCell("A1").font = boldFont(XL.white, 11);
  ws.getCell("A1").fill = headerFill();
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 22;
  ws.addRow([]);

  const hdr = ws.addRow(["No", "Periode", "Omzet", "% vs Avg", "Proporsi"]);
  applyHeaderRow(hdr);

  const totalOmzet = monthlyTrend.reduce((s, t) => s + t.omzet, 0);
  const avgOmzet   = totalOmzet / 12;
  const maxOmzet   = Math.max(...monthlyTrend.map((t) => t.omzet), 1);

  monthlyTrend.forEach((t, i) => {
    const isCurrent = t.month === period.month && t.year === period.year;
    const vsAvg = avgOmzet > 0 ? (t.omzet / avgOmzet) * 100 : 0;
    const r = ws.addRow([]);
    setCenter(r.getCell(1), i + 1);
    r.getCell(2).value = `${MONTHS_ID[t.month - 1]} ${t.year}${isCurrent ? " ★" : ""}`;
    r.getCell(2).font = isCurrent ? boldFont(XL.emeraldDark) : normalFont();
    setRp(r.getCell(3), t.omzet);
    if (t.omzet > 0) {
      setPct(r.getCell(4), vsAvg);
      r.getCell(4).font = boldFont(vsAvg >= 100 ? XL.green600 : XL.amber500);
      r.getCell(5).value = "█".repeat(Math.round((t.omzet / maxOmzet) * 20));
      r.getCell(5).font = { color: { argb: isCurrent ? XL.emerald : "FFD1FAE5" }, size: 10 };
    }
    applyDataRow(r, i % 2 !== 0, isCurrent ? "FFE8FDF0" : undefined);
  });

  // Summary
  ws.addRow([]);
  const sumRow = ws.addRow(["", "Total 12 Bulan", totalOmzet, "", ""]);
  applyTotalRow(sumRow);
  setRp(sumRow.getCell(3), totalOmzet);

  const avgRow = ws.addRow(["", "Rata-rata/Bulan", avgOmzet, "", ""]);
  applyTotalRow(avgRow);
  setRp(avgRow.getCell(3), avgOmzet);
}

/** Sheet 6: Pelanggan Tertolak */
function buildTertolak(wb: ExcelJS.Workbook, data: ExportData) {
  const ws = wb.addWorksheet("Pelanggan Tertolak");
  const { dailyTotals, period } = data;
  const monthName = MONTHS_ID[period.month - 1];

  const branchOmzet = dailyTotals.reduce((s, d) => s + d.omzet, 0);
  const branchTx    = dailyTotals.reduce((s, d) => s + d.transactions, 0);
  const branchAtv   = branchTx > 0 ? branchOmzet / branchTx : 0;
  const totalRej    = dailyTotals.reduce((s, d) => s + d.rejectedCustomers, 0);

  ws.columns = [{ width: 6 }, { width: 16 }, { width: 16 }, { width: 22 }];

  ws.mergeCells("A1:D1");
  ws.getCell("A1").value = `Pelanggan Tertolak — ${data.branch.name} — ${monthName} ${period.year}`;
  ws.getCell("A1").font = boldFont(XL.white, 11);
  ws.getCell("A1").fill = headerFill();
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 22;
  ws.addRow([]);

  // Summary
  for (const [label, val] of [
    ["Total Tertolak", `${totalRej} pelanggan`],
    ["Est. Omzet Hilang", `Rp ${Math.round(totalRej * branchAtv).toLocaleString("id-ID")}`],
    ["ATV Referensi", `Rp ${Math.round(branchAtv).toLocaleString("id-ID")}`],
  ] as [string, string][]) {
    const r = ws.addRow([label, val]);
    r.getCell(1).font = boldFont(XL.emeraldDark);
    r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.emeraldBg } };
    r.getCell(1).border = thinBorder();
    r.getCell(2).border = thinBorder();
    r.height = 16;
  }
  ws.addRow([]);

  const hdr = ws.addRow(["No", "Tanggal", "Jml Tertolak", "Est. Omzet Hilang"]);
  applyHeaderRow(hdr);
  ws.views = [{ state: "frozen", ySplit: hdr.number }];

  const dateMap = new Map(dailyTotals.map((d) => [d.date, d]));

  for (let day = 1; day <= period.daysInMonth; day++) {
    const dateStr = `${period.year}-${pad2(period.month)}-${pad2(day)}`;
    const e = dateMap.get(dateStr);
    const rej = e?.rejectedCustomers ?? 0;
    const atv = e && e.transactions > 0 ? e.omzet / e.transactions : branchAtv;
    const estOmzet = rej * atv;
    const r = ws.addRow([]);
    setCenter(r.getCell(1), day);
    r.getCell(2).value = `${pad2(day)}/${pad2(period.month)}/${period.year}`;
    r.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
    if (e) {
      setNum(r.getCell(3), rej);
      r.getCell(3).alignment = { horizontal: "center", vertical: "middle" };
      if (rej > 0) {
        r.getCell(3).font = boldFont(XL.amber500);
        setRp(r.getCell(4), estOmzet);
        r.getCell(4).font = boldFont(XL.amber500);
      }
    }
    applyDataRow(r, day % 2 === 0, rej > 0 ? "FFFFFBEB" : undefined);
  }

  const totRow = ws.addRow([]);
  setCenter(totRow.getCell(1), "Σ");
  totRow.getCell(2).value = "Total";
  totRow.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
  setNum(totRow.getCell(3), totalRej);
  totRow.getCell(3).alignment = { horizontal: "center", vertical: "middle" };
  setRp(totRow.getCell(4), totalRej * branchAtv);
  applyTotalRow(totRow);
  totRow.getCell(3).font = boldFont(XL.amber500);
  totRow.getCell(4).font = boldFont(XL.amber500);
}

// ─── Main export function ─────────────────────────────────────────────────────
export async function buildExcelReport(data: ExportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BBA Portal";
  wb.created = new Date();
  wb.modified = new Date();

  buildRingkasan(wb, data);
  buildHarian(wb, data);
  buildPerforma(wb, data);
  buildMatriks(wb, data);
  buildTren(wb, data);
  buildTertolak(wb, data);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
