import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ExportData, ExportCrewDaily, ExportMonthlyTrend } from "./fetch-export-data";

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS_ID = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

const C = {
  emerald:       "#059669",
  emeraldDark:   "#047857",
  emeraldMid:    "#10b981",
  emeraldLight:  "#d1fae5",
  emeraldBg:     "#f0fdf4",
  white:         "#ffffff",
  slate900:      "#0f172a",
  slate800:      "#1e293b",
  slate700:      "#334155",
  slate600:      "#475569",
  slate500:      "#64748b",
  slate400:      "#94a3b8",
  slate300:      "#cbd5e1",
  slate200:      "#e2e8f0",
  slate100:      "#f1f5f9",
  slate50:       "#f8fafc",
  amber500:      "#f59e0b",
  amber50:       "#fffbeb",
  red500:        "#ef4444",
  green600:      "#16a34a",
  green50:       "#f0fdf4",
};

// ─── Formatters ───────────────────────────────────────────────────────────────
function rp(n: number): string {
  if (!n && n !== 0) return "Rp 0";
  const abs = Math.abs(Math.round(n));
  const f = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (n < 0 ? "-Rp " : "Rp ") + f;
}

function num(n: number, dec = 0): string {
  if (!isFinite(n)) return "0";
  const factor = Math.pow(10, dec);
  const rounded = Math.round(n * factor) / factor;
  const parts = rounded.toFixed(dec).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return parts.join(",");
}

function pct(n: number): string {
  if (!isFinite(n)) return "0,0%";
  return num(n, 1) + "%";
}

function shortRp(n: number): string {
  if (n === 0) return "0";
  if (Math.abs(n) >= 1_000_000_000) return num(n / 1_000_000_000, 1) + "M";
  if (Math.abs(n) >= 1_000_000) return num(n / 1_000_000, 1) + "jt";
  if (Math.abs(n) >= 1_000) return num(n / 1_000, 0) + "rb";
  return num(n);
}

function pad2(n: number) { return String(n).padStart(2, "0"); }

function dateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1);
}

// ─── Shared Styles ────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  pageP: {
    fontFamily: "Helvetica", fontSize: 8, color: C.slate800,
    backgroundColor: C.white, paddingTop: 20, paddingBottom: 30, paddingHorizontal: 24,
  },
  pageL: {
    fontFamily: "Helvetica", fontSize: 7, color: C.slate800,
    backgroundColor: C.white, paddingTop: 16, paddingBottom: 28, paddingHorizontal: 20,
  },
  // Page header
  bar:     { backgroundColor: C.emerald, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  barT:    { color: C.white, fontSize: 12, fontFamily: "Helvetica-Bold" },
  barS:    { color: "#a7f3d0", fontSize: 7 },
  // Section title
  secTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.emerald, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 14, borderBottomWidth: 1, borderBottomColor: C.emeraldLight, paddingBottom: 3 },
  // Table primitives
  tHead:   { backgroundColor: C.emerald, flexDirection: "row" },
  tRow:    { flexDirection: "row" },
  tRowAlt: { flexDirection: "row", backgroundColor: C.slate50 },
  tFoot:   { flexDirection: "row", backgroundColor: C.emeraldBg },
  // Table cells
  thCell:  { paddingHorizontal: 4, paddingVertical: 4, borderRightWidth: 0.5, borderRightColor: "#34d399", justifyContent: "center" },
  tdCell:  { paddingHorizontal: 4, paddingVertical: 3, borderRightWidth: 0.5, borderRightColor: C.slate200, borderBottomWidth: 0.5, borderBottomColor: C.slate200, justifyContent: "center" },
  // Text styles
  thTxt:   { fontSize: 8, color: C.white, fontFamily: "Helvetica-Bold" },
  thTxtC:  { fontSize: 8, color: C.white, fontFamily: "Helvetica-Bold", textAlign: "center" },
  thTxtR:  { fontSize: 8, color: C.white, fontFamily: "Helvetica-Bold", textAlign: "right" },
  tdTxt:   { fontSize: 8, color: C.slate800 },
  tdTxtC:  { fontSize: 8, color: C.slate800, textAlign: "center" },
  tdTxtR:  { fontSize: 8, color: C.slate800, textAlign: "right" },
  tdTxtRB: { fontSize: 8, color: C.emeraldDark, fontFamily: "Helvetica-Bold", textAlign: "right" },
  tdTxtCB: { fontSize: 8, color: C.emeraldDark, fontFamily: "Helvetica-Bold", textAlign: "center" },
  ftTxtR:  { fontSize: 8, color: C.emeraldDark, fontFamily: "Helvetica-Bold", textAlign: "right" },
  ftTxtC:  { fontSize: 8, color: C.emeraldDark, fontFamily: "Helvetica-Bold", textAlign: "center" },
  // Footer
  pgNum:   { position: "absolute", bottom: 10, left: 0, right: 0, textAlign: "center", fontSize: 7, color: C.slate400 },
});

// ─── Utility Components ───────────────────────────────────────────────────────
function PageFooter({ label }: { label: string }) {
  return <Text style={S.pgNum} fixed>{label}</Text>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={S.secTitle}>{children}</Text>;
}

// ─── Bar Chart Component (View-based, reliable) ───────────────────────────────
type BarItem = { label: string; subLabel?: string; value: number; highlight?: boolean };

function BarChart({
  data, height = 90, showValues = true, labelSize = 6,
}: {
  data: BarItem[]; height?: number; showValues?: boolean; labelSize?: number;
}) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const BASELINE_H = 1;
  const LABEL_H = labelSize + 4;
  const VALUE_H = showValues ? labelSize + 3 : 0;
  const BAR_AREA = height - BASELINE_H - LABEL_H - VALUE_H;

  return (
    <View style={{ height, borderLeftWidth: 0.5, borderLeftColor: C.slate200 }}>
      {/* Bar + value area */}
      <View style={{ height: BAR_AREA + VALUE_H, flexDirection: "row", alignItems: "flex-end" }}>
        {data.map((d, i) => {
          const barH = maxVal > 0 ? Math.max((d.value / maxVal) * BAR_AREA, d.value > 0 ? 3 : 0) : 0;
          const color = d.highlight ? C.emerald : C.emeraldLight;
          const textColor = d.highlight ? C.emeraldDark : C.slate400;
          return (
            <View key={i} style={{ flex: 1, flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}>
              {showValues && d.value > 0 && (
                <Text style={{ fontSize: labelSize - 1, color: textColor, textAlign: "center", marginBottom: 1, fontFamily: d.highlight ? "Helvetica-Bold" : "Helvetica" }}>
                  {shortRp(d.value)}
                </Text>
              )}
              <View style={{ width: "72%", height: barH, backgroundColor: color, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
            </View>
          );
        })}
      </View>
      {/* Baseline */}
      <View style={{ height: BASELINE_H, backgroundColor: C.slate200 }} />
      {/* X labels */}
      <View style={{ flexDirection: "row", marginTop: 3 }}>
        {data.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: labelSize, color: d.highlight ? C.emerald : C.slate500, textAlign: "center", fontFamily: d.highlight ? "Helvetica-Bold" : "Helvetica" }}>
              {d.label}
            </Text>
            {d.subLabel ? <Text style={{ fontSize: labelSize - 1, color: C.slate400, textAlign: "center" }}>{d.subLabel}</Text> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── SARP Progress Bar ────────────────────────────────────────────────────────
function SarpBar({ value, width = 80 }: { value: number; width?: number }) {
  const fill = Math.min(Math.max(value, 0), 200); // cap at 200%
  const fillW = (fill / 200) * width;
  const color = value >= 100 ? C.green600 : value >= 70 ? C.amber500 : C.red500;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View style={{ width, height: 6, backgroundColor: C.slate100, borderRadius: 3, overflow: "hidden" }}>
        <View style={{ width: fillW, height: 6, backgroundColor: color, borderRadius: 3 }} />
      </View>
      <Text style={{ fontSize: 7, color, fontFamily: "Helvetica-Bold", width: 35 }}>{pct(value)}</Text>
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function calcBranchTotals(dailyTotals: ExportData["dailyTotals"]) {
  return dailyTotals.reduce((acc, d) => ({
    omzet: acc.omzet + d.omzet,
    transactions: acc.transactions + d.transactions,
    products: acc.products + d.products,
    rejectedCustomers: acc.rejectedCustomers + d.rejectedCustomers,
  }), { omzet: 0, transactions: 0, products: 0, rejectedCustomers: 0 });
}

function calcCrewTotals(userId: string, crewDailyData: ExportCrewDaily[]) {
  return crewDailyData.filter((d) => d.userId === userId).reduce((acc, d) => ({
    omzet: acc.omzet + d.omzet,
    transactions: acc.transactions + d.transactions,
    products: acc.products + d.products,
  }), { omzet: 0, transactions: 0, products: 0 });
}

function calcSarp(omzet: number, tx: number, prod: number, refAtv: number, refAtu: number) {
  const atv = tx > 0 ? omzet / tx : 0;
  const atu = tx > 0 ? prod / tx : 0;
  const atvPct = refAtv > 0 ? (atv / refAtv) * 100 : 0;
  const atuPct = refAtu > 0 ? (atu / refAtu) * 100 : 0;
  return { atv, atu, atvPct, atuPct, sarp: (atvPct + atuPct) / 2 };
}

// ─── Page 1: Cover ────────────────────────────────────────────────────────────
function CoverPage({ data }: { data: ExportData }) {
  const { branch, owner, kpi, crew, period } = data;
  const monthName = MONTHS_ID[period.month - 1];

  // Split crew into two columns
  const half = Math.ceil(crew.length / 2);
  const leftCrew = crew.slice(0, half);
  const rightCrew = crew.slice(half);

  return (
    <Page size="A4" style={S.pageP}>
      {/* ── Top header ── */}
      <View style={S.bar}>
        <View>
          <Text style={S.barT}>LAPORAN JAGO JUALAN BBA</Text>
          <Text style={S.barS}>Laporan performa penjualan bulanan · BBA Portal</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ color: C.white, fontSize: 9, fontFamily: "Helvetica-Bold" }}>{monthName} {period.year}</Text>
          <Text style={{ color: "#a7f3d0", fontSize: 7 }}>Periode Laporan</Text>
        </View>
      </View>

      {/* ── Branch identity ── */}
      <View style={{ marginBottom: 14, paddingBottom: 12, borderBottomWidth: 1.5, borderBottomColor: C.emerald }}>
        <Text style={{ fontSize: 24, fontFamily: "Helvetica-Bold", color: C.slate900, letterSpacing: -0.5 }}>{branch.name}</Text>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 4, height: 4, backgroundColor: C.emerald, borderRadius: 2 }} />
            <Text style={{ fontSize: 8, color: C.emerald, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 }}>KODE: {branch.code}</Text>
          </View>
          {branch.phone && <Text style={{ fontSize: 8, color: C.slate500 }}>{branch.phone}</Text>}
        </View>
        {branch.address && <Text style={{ fontSize: 8, color: C.slate600, marginTop: 4 }}>{branch.address}</Text>}
      </View>

      {/* ── Info row ── */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
        <View style={{ flex: 1, backgroundColor: C.emeraldBg, borderRadius: 8, borderWidth: 1, borderColor: C.emeraldLight, padding: 10 }}>
          <Text style={{ fontSize: 7, color: C.slate500, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 3 }}>Periode</Text>
          <Text style={{ fontSize: 13, color: C.emerald, fontFamily: "Helvetica-Bold" }}>{monthName} {period.year}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: C.emeraldBg, borderRadius: 8, borderWidth: 1, borderColor: C.emeraldLight, padding: 10 }}>
          <Text style={{ fontSize: 7, color: C.slate500, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 3 }}>Owner</Text>
          <Text style={{ fontSize: 11, color: C.slate800, fontFamily: "Helvetica-Bold" }}>{owner?.fullName ?? "-"}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: C.emeraldBg, borderRadius: 8, borderWidth: 1, borderColor: C.emeraldLight, padding: 10 }}>
          <Text style={{ fontSize: 7, color: C.slate500, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 3 }}>Jumlah Crew</Text>
          <Text style={{ fontSize: 13, color: C.slate800, fontFamily: "Helvetica-Bold" }}>{crew.length} orang</Text>
        </View>
      </View>

      {/* ── KPI targets ── */}
      <SectionTitle>Target Bulanan</SectionTitle>
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
        {[
          { label: "Target Omzet", value: kpi ? rp(kpi.targetOmzet) : "Belum diset" },
          { label: "Target ATV", value: kpi && kpi.targetAtv > 0 ? rp(kpi.targetAtv) : "Belum diset" },
          { label: "Target ATU", value: kpi && kpi.targetAtu > 0 ? num(kpi.targetAtu, 1) + " produk" : "Belum diset" },
        ].map(({ label, value }) => (
          <View key={label} style={{ flex: 1, borderWidth: 1, borderColor: C.slate200, borderRadius: 8, padding: 10, backgroundColor: C.white }}>
            <Text style={{ fontSize: 7, color: C.slate500, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 }}>{label}</Text>
            <Text style={{ fontSize: 10, color: C.slate800, fontFamily: "Helvetica-Bold" }}>{value}</Text>
          </View>
        ))}
      </View>

      {/* ── Crew list ── */}
      <SectionTitle>Daftar Crew ({crew.length} Orang)</SectionTitle>

      {crew.length === 0 ? (
        <Text style={{ fontSize: 8, color: C.slate400, fontStyle: "italic" }}>Belum ada crew aktif terdaftar.</Text>
      ) : (
        <View style={{ borderWidth: 1, borderColor: C.slate200, borderRadius: 6, overflow: "hidden" }}>
          {/* Table header */}
          <View style={{ flexDirection: "row", backgroundColor: C.emerald }}>
            <View style={{ width: 28, paddingVertical: 5, paddingHorizontal: 4, borderRightWidth: 0.5, borderRightColor: "#34d399" }}>
              <Text style={{ fontSize: 7, color: C.white, fontFamily: "Helvetica-Bold", textAlign: "center" }}>No</Text>
            </View>
            <View style={{ flex: 1, paddingVertical: 5, paddingHorizontal: 6, borderRightWidth: 0.5, borderRightColor: "#34d399" }}>
              <Text style={{ fontSize: 7, color: C.white, fontFamily: "Helvetica-Bold" }}>Nama Karyawan</Text>
            </View>
            <View style={{ width: 28, paddingVertical: 5, paddingHorizontal: 4, borderRightWidth: 0.5, borderRightColor: "#34d399" }}>
              <Text style={{ fontSize: 7, color: C.white, fontFamily: "Helvetica-Bold", textAlign: "center" }}>No</Text>
            </View>
            <View style={{ flex: 1, paddingVertical: 5, paddingHorizontal: 6 }}>
              <Text style={{ fontSize: 7, color: C.white, fontFamily: "Helvetica-Bold" }}>Nama Karyawan</Text>
            </View>
          </View>

          {/* Crew rows (2 per row) */}
          {leftCrew.map((lc, rowIdx) => {
            const rc = rightCrew[rowIdx];
            const globalIdxL = rowIdx;
            const globalIdxR = rowIdx + half;
            const bg = rowIdx % 2 === 0 ? C.white : C.slate50;
            return (
              <View key={lc.userId} style={{ flexDirection: "row", backgroundColor: bg }}>
                {/* Left */}
                <View style={{ width: 28, paddingVertical: 5, paddingHorizontal: 4, borderRightWidth: 0.5, borderRightColor: C.slate200, borderTopWidth: 0.5, borderTopColor: C.slate100, justifyContent: "center", alignItems: "center" }}>
                  <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: C.emeraldLight, justifyContent: "center", alignItems: "center" }}>
                    <Text style={{ fontSize: 7, color: C.emeraldDark, fontFamily: "Helvetica-Bold" }}>{globalIdxL + 1}</Text>
                  </View>
                </View>
                <View style={{ flex: 1, paddingVertical: 6, paddingHorizontal: 6, borderRightWidth: 0.5, borderRightColor: C.slate200, borderTopWidth: 0.5, borderTopColor: C.slate100, justifyContent: "center" }}>
                  <Text style={{ fontSize: 8, color: C.slate800, fontFamily: "Helvetica-Bold" }}>{lc.fullName}</Text>
                </View>
                {/* Right */}
                {rc ? (
                  <>
                    <View style={{ width: 28, paddingVertical: 5, paddingHorizontal: 4, borderRightWidth: 0.5, borderRightColor: C.slate200, borderTopWidth: 0.5, borderTopColor: C.slate100, justifyContent: "center", alignItems: "center" }}>
                      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: C.emeraldLight, justifyContent: "center", alignItems: "center" }}>
                        <Text style={{ fontSize: 7, color: C.emeraldDark, fontFamily: "Helvetica-Bold" }}>{globalIdxR + 1}</Text>
                      </View>
                    </View>
                    <View style={{ flex: 1, paddingVertical: 6, paddingHorizontal: 6, borderTopWidth: 0.5, borderTopColor: C.slate100, justifyContent: "center" }}>
                      <Text style={{ fontSize: 8, color: C.slate800, fontFamily: "Helvetica-Bold" }}>{rc.fullName}</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={{ width: 28, borderTopWidth: 0.5, borderTopColor: C.slate100 }} />
                    <View style={{ flex: 1, borderTopWidth: 0.5, borderTopColor: C.slate100 }} />
                  </>
                )}
              </View>
            );
          })}
        </View>
      )}

      <PageFooter label={`Laporan Jago Jualan BBA · ${branch.name} · ${monthName} ${period.year}`} />
    </Page>
  );
}

// ─── Page 2: Daily Summary + Chart ────────────────────────────────────────────
function DailySummaryPage({ data }: { data: ExportData }) {
  const { dailyTotals, period, kpi } = data;
  const monthName = MONTHS_ID[period.month - 1];
  const totals = calcBranchTotals(dailyTotals);
  const branchAtv = totals.transactions > 0 ? totals.omzet / totals.transactions : 0;
  const branchAtu = totals.transactions > 0 ? totals.products / totals.transactions : 0;
  const targetMonthly = kpi?.targetOmzet ?? 0;
  const targetDaily = targetMonthly > 0 ? targetMonthly / period.daysInMonth : 0;

  // Fill all days
  const dateMap = new Map(dailyTotals.map((d) => [d.date, d]));
  const rows = Array.from({ length: period.daysInMonth }, (_, i) => {
    const day = i + 1;
    const dateStr = `${period.year}-${pad2(period.month)}-${pad2(day)}`;
    const e = dateMap.get(dateStr);
    return { day, date: dateStr, omzet: e?.omzet ?? 0, tx: e?.transactions ?? 0, prod: e?.products ?? 0, rej: e?.rejectedCustomers ?? 0, hasData: !!e };
  });

  // Chart data — all days of month
  const chartData: BarItem[] = rows.map((r) => ({
    label: String(r.day),
    value: r.omzet,
    highlight: r.omzet > 0,
  }));

  // Col widths
  const WNO = 18, WDATE = 42, WTGT = 48, WOMZET = 54, WPCT = 34, WTX = 32, WPRD = 32, WATV = 50, WATU = 30, WREJ = 32;

  return (
    <Page size="A4" style={S.pageP}>
      <View style={S.bar}>
        <Text style={S.barT}>Rekapitulasi Harian</Text>
        <Text style={S.barS}>{monthName} {period.year} · {data.branch.name}</Text>
      </View>

      {/* Omzet Chart */}
      <SectionTitle>Grafik Omzet Harian (Rp)</SectionTitle>
      <View style={{ marginBottom: 14, paddingHorizontal: 4 }}>
        <BarChart data={chartData} height={72} showValues={false} labelSize={5} />
      </View>

      {/* Summary KPI row */}
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
        {[
          { label: "Total Omzet", val: rp(totals.omzet), sub: targetMonthly > 0 ? `${pct((totals.omzet / targetMonthly) * 100)} dari target` : "" },
          { label: "ATV Rata-rata", val: rp(branchAtv), sub: "" },
          { label: "ATU Rata-rata", val: num(branchAtu, 1) + " prd", sub: "" },
          { label: "Total Nota", val: num(totals.transactions), sub: "" },
          { label: "Total Tertolak", val: num(totals.rejectedCustomers), sub: rp(totals.rejectedCustomers * branchAtv) + " est. hilang" },
        ].map(({ label, val, sub }) => (
          <View key={label} style={{ flex: 1, borderWidth: 1, borderColor: C.slate200, borderRadius: 6, padding: 6 }}>
            <Text style={{ fontSize: 6, color: C.slate500, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 2 }}>{label}</Text>
            <Text style={{ fontSize: 9, color: C.slate900, fontFamily: "Helvetica-Bold" }}>{val}</Text>
            {sub ? <Text style={{ fontSize: 6, color: C.slate400, marginTop: 1 }}>{sub}</Text> : null}
          </View>
        ))}
      </View>

      {/* Table */}
      <View style={{ borderWidth: 0.5, borderColor: C.slate200, borderRadius: 4, overflow: "hidden" }}>
        <View style={S.tHead}>
          <View style={{ ...S.thCell, width: WNO }}><Text style={S.thTxtC}>No</Text></View>
          <View style={{ ...S.thCell, width: WDATE }}><Text style={S.thTxtC}>Tgl</Text></View>
          {targetDaily > 0 && <View style={{ ...S.thCell, width: WTGT }}><Text style={S.thTxtR}>Target</Text></View>}
          <View style={{ ...S.thCell, width: WOMZET }}><Text style={S.thTxtR}>Omzet</Text></View>
          {targetDaily > 0 && <View style={{ ...S.thCell, width: WPCT }}><Text style={S.thTxtC}>%</Text></View>}
          <View style={{ ...S.thCell, width: WTX }}><Text style={S.thTxtC}>Nota</Text></View>
          <View style={{ ...S.thCell, width: WPRD }}><Text style={S.thTxtC}>Prd</Text></View>
          <View style={{ ...S.thCell, width: WATV }}><Text style={S.thTxtR}>ATV</Text></View>
          <View style={{ ...S.thCell, width: WATU }}><Text style={S.thTxtC}>ATU</Text></View>
          <View style={{ ...S.thCell, width: WREJ }}><Text style={S.thTxtC}>Tolak</Text></View>
          <View style={{ ...S.thCell, flex: 1 }}><Text style={S.thTxtC}>Est. Tertolak</Text></View>
        </View>

        {rows.map((r, i) => {
          const atv = r.tx > 0 ? r.omzet / r.tx : 0;
          const atu = r.tx > 0 ? r.prod / r.tx : 0;
          const rejOmzet = r.rej * atv;
          const pctTgt = targetDaily > 0 ? (r.omzet / targetDaily) * 100 : 0;
          const Row = i % 2 === 0 ? S.tRow : S.tRowAlt;
          const dimStyle = { color: C.slate300 };
          return (
            <View key={r.date} style={Row}>
              <View style={{ ...S.tdCell, width: WNO }}><Text style={{ ...S.tdTxtC, color: C.slate400 }}>{r.day}</Text></View>
              <View style={{ ...S.tdCell, width: WDATE }}><Text style={{ ...S.tdTxtC, ...(r.hasData ? {} : dimStyle) }}>{dateLabel(r.date)}</Text></View>
              {targetDaily > 0 && <View style={{ ...S.tdCell, width: WTGT }}><Text style={{ ...S.tdTxtR, color: C.slate400 }}>{shortRp(targetDaily)}</Text></View>}
              <View style={{ ...S.tdCell, width: WOMZET }}><Text style={{ ...S.tdTxtR, ...(r.hasData ? {} : dimStyle) }}>{r.hasData ? shortRp(r.omzet) : "-"}</Text></View>
              {targetDaily > 0 && (
                <View style={{ ...S.tdCell, width: WPCT }}>
                  <Text style={{ ...S.tdTxtC, color: r.hasData ? (pctTgt >= 100 ? C.green600 : pctTgt > 0 ? C.amber500 : C.slate300) : C.slate300 }}>
                    {r.hasData ? pct(pctTgt) : "-"}
                  </Text>
                </View>
              )}
              <View style={{ ...S.tdCell, width: WTX }}><Text style={{ ...S.tdTxtC, ...(r.hasData ? {} : dimStyle) }}>{r.hasData ? num(r.tx) : "-"}</Text></View>
              <View style={{ ...S.tdCell, width: WPRD }}><Text style={{ ...S.tdTxtC, ...(r.hasData ? {} : dimStyle) }}>{r.hasData ? num(r.prod) : "-"}</Text></View>
              <View style={{ ...S.tdCell, width: WATV }}><Text style={{ ...S.tdTxtR, ...(r.hasData ? {} : dimStyle) }}>{r.hasData ? rp(atv) : "-"}</Text></View>
              <View style={{ ...S.tdCell, width: WATU }}><Text style={{ ...S.tdTxtC, ...(r.hasData ? {} : dimStyle) }}>{r.hasData ? num(atu, 1) : "-"}</Text></View>
              <View style={{ ...S.tdCell, width: WREJ }}><Text style={{ ...S.tdTxtC, color: r.rej > 0 ? C.amber500 : r.hasData ? C.slate800 : C.slate300 }}>{r.hasData ? num(r.rej) : "-"}</Text></View>
              <View style={{ ...S.tdCell, flex: 1 }}><Text style={{ ...S.tdTxtR, color: r.rej > 0 ? C.amber500 : r.hasData ? C.slate800 : C.slate300 }}>{r.hasData && r.rej > 0 ? shortRp(rejOmzet) : "-"}</Text></View>
            </View>
          );
        })}

        {/* Footer */}
        <View style={S.tFoot}>
          <View style={{ ...S.tdCell, width: WNO }}><Text style={S.ftTxtC}>Σ</Text></View>
          <View style={{ ...S.tdCell, width: WDATE }}><Text style={S.ftTxtC}>Total</Text></View>
          {targetDaily > 0 && <View style={{ ...S.tdCell, width: WTGT }}><Text style={S.ftTxtR}>{rp(targetMonthly)}</Text></View>}
          <View style={{ ...S.tdCell, width: WOMZET }}><Text style={S.ftTxtR}>{rp(totals.omzet)}</Text></View>
          {targetDaily > 0 && <View style={{ ...S.tdCell, width: WPCT }}><Text style={{ ...S.ftTxtC, color: totals.omzet >= targetMonthly ? C.green600 : C.amber500 }}>{pct((totals.omzet / targetMonthly) * 100)}</Text></View>}
          <View style={{ ...S.tdCell, width: WTX }}><Text style={S.ftTxtC}>{num(totals.transactions)}</Text></View>
          <View style={{ ...S.tdCell, width: WPRD }}><Text style={S.ftTxtC}>{num(totals.products)}</Text></View>
          <View style={{ ...S.tdCell, width: WATV }}><Text style={S.ftTxtR}>{rp(branchAtv)}</Text></View>
          <View style={{ ...S.tdCell, width: WATU }}><Text style={S.ftTxtC}>{num(branchAtu, 1)}</Text></View>
          <View style={{ ...S.tdCell, width: WREJ }}><Text style={{ ...S.ftTxtC, color: totals.rejectedCustomers > 0 ? C.amber500 : C.emeraldDark }}>{num(totals.rejectedCustomers)}</Text></View>
          <View style={{ ...S.tdCell, flex: 1 }}><Text style={{ ...S.ftTxtR, color: totals.rejectedCustomers > 0 ? C.amber500 : C.emeraldDark }}>{rp(totals.rejectedCustomers * branchAtv)}</Text></View>
        </View>
      </View>

      <PageFooter label={`Rekapitulasi Harian · ${data.branch.name} · ${monthName} ${period.year}`} />
    </Page>
  );
}

// ─── Page 3: Crew Performance + Rankings ──────────────────────────────────────
function CrewPerformancePage({ data }: { data: ExportData }) {
  const { crew, crewDailyData, kpi, period, dailyTotals, allActiveUserIds } = data;
  const monthName = MONTHS_ID[period.month - 1];

  // Merge active crew + ex-crew with data
  const crewMap = new Map(crew.map((c) => [c.userId, c.fullName]));
  const allCrew = [...crew];
  allActiveUserIds.forEach((uid) => {
    if (!crewMap.has(uid)) allCrew.push({ userId: uid, fullName: `(ex-crew)` });
  });

  const branchT = calcBranchTotals(dailyTotals);
  const branchAtv = branchT.transactions > 0 ? branchT.omzet / branchT.transactions : 0;
  const branchAtu = branchT.transactions > 0 ? branchT.products / branchT.transactions : 0;
  const refAtv = kpi && kpi.targetAtv > 0 ? kpi.targetAtv : branchAtv;
  const refAtu = kpi && kpi.targetAtu > 0 ? kpi.targetAtu : branchAtu;

  type CM = { userId: string; fullName: string; omzet: number; tx: number; prod: number; atv: number; atu: number; atvPct: number; atuPct: number; sarp: number };
  const crewMetrics: CM[] = allCrew.map((c) => {
    const t = calcCrewTotals(c.userId, crewDailyData);
    const s = calcSarp(t.omzet, t.transactions, t.products, refAtv, refAtu);
    return { userId: c.userId, fullName: c.fullName, omzet: t.omzet, tx: t.transactions, prod: t.products, ...s };
  }).sort((a, b) => b.omzet - a.omzet);

  const byOmzet = [...crewMetrics].sort((a, b) => b.omzet - a.omzet);
  const bySarp  = [...crewMetrics].sort((a, b) => b.sarp - a.sarp);
  const byAtv   = [...crewMetrics].sort((a, b) => b.atv - a.atv);
  const byAtu   = [...crewMetrics].sort((a, b) => b.atu - a.atu);

  // Chart: SARP per crew
  const sarpChartData: BarItem[] = crewMetrics.map((c) => ({
    label: c.fullName.split(" ")[0], // first name
    value: c.sarp,
    highlight: c.sarp >= 100,
  }));

  const WRANK = 22, WNAME = 96, WOMZET = 56, WTX = 32, WPRD = 32, WATV = 50, WATU = 30;

  return (
    <Page size="A4" style={S.pageP}>
      <View style={S.bar}>
        <Text style={S.barT}>Performa Per Karyawan</Text>
        <Text style={S.barS}>{monthName} {period.year} · {data.branch.name}</Text>
      </View>

      {/* SARP Chart */}
      <SectionTitle>Grafik SARP% Per Karyawan</SectionTitle>
      <View style={{ marginBottom: 10, paddingHorizontal: 4 }}>
        <BarChart data={sarpChartData} height={66} showValues={true} labelSize={5} />
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        {[
          { label: "Ref. ATV", val: rp(refAtv), note: kpi && kpi.targetAtv > 0 ? "dari target KPI" : "rata-rata branch" },
          { label: "Ref. ATU", val: num(refAtu, 1) + " prd", note: kpi && kpi.targetAtu > 0 ? "dari target KPI" : "rata-rata branch" },
        ].map(({ label, val, note }) => (
          <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.emeraldBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: C.emeraldLight }}>
            <Text style={{ fontSize: 7, color: C.slate500 }}>{label}:</Text>
            <Text style={{ fontSize: 8, color: C.emeraldDark, fontFamily: "Helvetica-Bold" }}>{val}</Text>
            <Text style={{ fontSize: 6, color: C.slate400 }}>({note})</Text>
          </View>
        ))}
      </View>

      {/* Per-crew table */}
      <SectionTitle>Ringkasan Kumulatif + SARP</SectionTitle>
      <View style={{ borderWidth: 0.5, borderColor: C.slate200, borderRadius: 4, overflow: "hidden", marginBottom: 14 }}>
        <View style={S.tHead}>
          <View style={{ ...S.thCell, width: WRANK }}><Text style={S.thTxtC}>#</Text></View>
          <View style={{ ...S.thCell, width: WNAME }}><Text style={S.thTxt}>Nama</Text></View>
          <View style={{ ...S.thCell, width: WOMZET }}><Text style={S.thTxtR}>Omzet</Text></View>
          <View style={{ ...S.thCell, width: WTX }}><Text style={S.thTxtC}>Nota</Text></View>
          <View style={{ ...S.thCell, width: WPRD }}><Text style={S.thTxtC}>Prd</Text></View>
          <View style={{ ...S.thCell, width: WATV }}><Text style={S.thTxtR}>ATV</Text></View>
          <View style={{ ...S.thCell, width: WATU }}><Text style={S.thTxtC}>ATU</Text></View>
          <View style={{ ...S.thCell, flex: 1 }}><Text style={S.thTxtC}>SARP% (bar)</Text></View>
        </View>

        {crewMetrics.map((c, i) => {
          const hasData = c.omzet > 0 || c.tx > 0;
          const Row = i % 2 === 0 ? S.tRow : S.tRowAlt;
          const dim = { color: C.slate300 };
          return (
            <View key={c.userId} style={Row}>
              <View style={{ ...S.tdCell, width: WRANK }}><Text style={{ ...S.tdTxtC, color: C.slate400 }}>{i + 1}</Text></View>
              <View style={{ ...S.tdCell, width: WNAME }}><Text style={{ ...S.tdTxt, fontFamily: hasData ? "Helvetica-Bold" : "Helvetica" }}>{c.fullName}</Text></View>
              <View style={{ ...S.tdCell, width: WOMZET }}><Text style={{ ...S.tdTxtR, ...(hasData ? {} : dim) }}>{hasData ? rp(c.omzet) : "-"}</Text></View>
              <View style={{ ...S.tdCell, width: WTX }}><Text style={{ ...S.tdTxtC, ...(hasData ? {} : dim) }}>{hasData ? num(c.tx) : "-"}</Text></View>
              <View style={{ ...S.tdCell, width: WPRD }}><Text style={{ ...S.tdTxtC, ...(hasData ? {} : dim) }}>{hasData ? num(c.prod) : "-"}</Text></View>
              <View style={{ ...S.tdCell, width: WATV }}><Text style={{ ...S.tdTxtR, ...(hasData ? {} : dim) }}>{hasData ? rp(c.atv) : "-"}</Text></View>
              <View style={{ ...S.tdCell, width: WATU }}><Text style={{ ...S.tdTxtC, ...(hasData ? {} : dim) }}>{hasData ? num(c.atu, 1) : "-"}</Text></View>
              <View style={{ ...S.tdCell, flex: 1, justifyContent: "center" }}>
                {hasData ? <SarpBar value={c.sarp} width={88} /> : <Text style={{ ...S.tdTxtC, ...dim }}>-</Text>}
              </View>
            </View>
          );
        })}

        <View style={S.tFoot}>
          <View style={{ ...S.tdCell, width: WRANK }}><Text style={S.ftTxtC}>≡</Text></View>
          <View style={{ ...S.tdCell, width: WNAME }}><Text style={S.ftTxtR}>Branch Total</Text></View>
          <View style={{ ...S.tdCell, width: WOMZET }}><Text style={S.ftTxtR}>{rp(branchT.omzet)}</Text></View>
          <View style={{ ...S.tdCell, width: WTX }}><Text style={S.ftTxtC}>{num(branchT.transactions)}</Text></View>
          <View style={{ ...S.tdCell, width: WPRD }}><Text style={S.ftTxtC}>{num(branchT.products)}</Text></View>
          <View style={{ ...S.tdCell, width: WATV }}><Text style={S.ftTxtR}>{rp(branchAtv)}</Text></View>
          <View style={{ ...S.tdCell, width: WATU }}><Text style={S.ftTxtC}>{num(branchAtu, 1)}</Text></View>
          <View style={{ ...S.tdCell, flex: 1 }} />
        </View>
      </View>

      {/* Rankings */}
      <SectionTitle>Rankings Bulan Ini</SectionTitle>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {[
          { label: "Omzet", items: byOmzet, fmt: (c: CM) => shortRp(c.omzet) },
          { label: "SARP%", items: bySarp,  fmt: (c: CM) => pct(c.sarp) },
          { label: "ATV",   items: byAtv,   fmt: (c: CM) => shortRp(c.atv) },
          { label: "ATU",   items: byAtu,   fmt: (c: CM) => num(c.atu, 1) },
        ].map(({ label, items, fmt }) => (
          <View key={label} style={{ flex: 1, borderWidth: 1, borderColor: C.slate200, borderRadius: 6, overflow: "hidden" }}>
            <View style={{ backgroundColor: C.emerald, paddingVertical: 5, paddingHorizontal: 6 }}>
              <Text style={{ fontSize: 8, color: C.white, fontFamily: "Helvetica-Bold", textAlign: "center" }}>{label}</Text>
            </View>
            {items.slice(0, 4).map((c, rank) => (
              <View key={c.userId} style={{ flexDirection: "row", paddingHorizontal: 6, paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: C.slate100, backgroundColor: rank === 0 ? C.amber50 : C.white }}>
                <Text style={{ fontSize: 7, color: rank === 0 ? C.amber500 : C.slate400, width: 14, fontFamily: rank === 0 ? "Helvetica-Bold" : "Helvetica" }}>{rank + 1}.</Text>
                <Text style={{ fontSize: 7, color: C.slate800, flex: 1, fontFamily: rank === 0 ? "Helvetica-Bold" : "Helvetica" }}>{c.fullName.split(" ").slice(0, 2).join(" ")}</Text>
                <Text style={{ fontSize: 7, color: rank === 0 ? C.amber500 : C.emerald, fontFamily: "Helvetica-Bold" }}>{fmt(c)}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      <PageFooter label={`Performa Karyawan · ${data.branch.name} · ${monthName} ${period.year}`} />
    </Page>
  );
}

// ─── Page 4: Daily Matrix (Landscape) ─────────────────────────────────────────
function CrewMatrixPage({ data }: { data: ExportData }) {
  const { crew, crewDailyData, period } = data;
  const monthName = MONTHS_ID[period.month - 1];
  const days = Array.from({ length: period.daysInMonth }, (_, i) => i + 1);

  const lookup = new Map<string, Map<number, number>>();
  for (const rec of crewDailyData) {
    const day = new Date(rec.date).getDate();
    if (!lookup.has(rec.userId)) lookup.set(rec.userId, new Map());
    const dm = lookup.get(rec.userId)!;
    dm.set(day, (dm.get(day) ?? 0) + rec.omzet);
  }

  // Col widths: landscape 842 - 40 margins = 802pt
  const WNAME = 88, WTOTAL = 50;
  const WDAY = Math.floor((802 - WNAME - WTOTAL) / days.length);

  return (
    <Page size="A4" orientation="landscape" style={S.pageL}>
      <View style={{ ...S.bar, marginBottom: 10 }}>
        <Text style={S.barT}>Matriks Omzet Harian Per Karyawan</Text>
        <Text style={S.barS}>{monthName} {period.year} · {data.branch.name}</Text>
      </View>

      <View style={{ borderWidth: 0.5, borderColor: C.slate200, borderRadius: 4, overflow: "hidden" }}>
        {/* Header */}
        <View style={S.tHead}>
          <View style={{ ...S.thCell, width: WNAME }}><Text style={{ fontSize: 7, color: C.white, fontFamily: "Helvetica-Bold" }}>Karyawan</Text></View>
          {days.map((d) => (
            <View key={d} style={{ ...S.thCell, width: WDAY }}>
              <Text style={{ fontSize: 5.5, color: C.white, textAlign: "center", fontFamily: "Helvetica-Bold" }}>{d}</Text>
            </View>
          ))}
          <View style={{ ...S.thCell, width: WTOTAL }}>
            <Text style={{ fontSize: 6.5, color: C.white, fontFamily: "Helvetica-Bold", textAlign: "right" }}>Total</Text>
          </View>
        </View>

        {/* Crew rows */}
        {crew.map((c, rowIdx) => {
          const dm = lookup.get(c.userId) ?? new Map<number, number>();
          const crewTotal = Array.from(dm.values()).reduce((s, v) => s + v, 0);
          const Row = rowIdx % 2 === 0 ? S.tRow : S.tRowAlt;
          const maxDayOmzet = Math.max(...Array.from(dm.values()), 1);
          return (
            <View key={c.userId} style={Row}>
              <View style={{ ...S.tdCell, width: WNAME }}>
                <Text style={{ fontSize: 7, color: C.slate800, fontFamily: "Helvetica-Bold" }}>{c.fullName}</Text>
              </View>
              {days.map((d) => {
                const val = dm.get(d) ?? 0;
                const isTop = val > 0 && val === maxDayOmzet;
                return (
                  <View key={d} style={{ ...S.tdCell, width: WDAY, backgroundColor: val > 0 ? (isTop ? "#dcfce7" : undefined) : undefined }}>
                    <Text style={{ fontSize: 5, textAlign: "center", color: val > 0 ? (isTop ? C.green600 : C.slate700) : C.slate200, fontFamily: isTop ? "Helvetica-Bold" : "Helvetica" }}>
                      {val > 0 ? shortRp(val) : ""}
                    </Text>
                  </View>
                );
              })}
              <View style={{ ...S.tdCell, width: WTOTAL }}>
                <Text style={{ fontSize: 6.5, textAlign: "right", fontFamily: "Helvetica-Bold", color: crewTotal > 0 ? C.emeraldDark : C.slate300 }}>
                  {crewTotal > 0 ? rp(crewTotal) : "-"}
                </Text>
              </View>
            </View>
          );
        })}

        {/* Day totals */}
        <View style={S.tFoot}>
          <View style={{ ...S.tdCell, width: WNAME }}><Text style={{ fontSize: 7, color: C.emeraldDark, fontFamily: "Helvetica-Bold" }}>Total Harian</Text></View>
          {days.map((d) => {
            const dateStr = `${period.year}-${pad2(period.month)}-${pad2(d)}`;
            const dayTotal = crewDailyData.filter((r) => r.date === dateStr).reduce((s, r) => s + r.omzet, 0);
            return (
              <View key={d} style={{ ...S.tdCell, width: WDAY }}>
                <Text style={{ fontSize: 5, textAlign: "center", color: dayTotal > 0 ? C.emeraldDark : C.slate300, fontFamily: dayTotal > 0 ? "Helvetica-Bold" : "Helvetica" }}>
                  {dayTotal > 0 ? shortRp(dayTotal) : ""}
                </Text>
              </View>
            );
          })}
          <View style={{ ...S.tdCell, width: WTOTAL }}>
            <Text style={{ fontSize: 6.5, textAlign: "right", fontFamily: "Helvetica-Bold", color: C.emeraldDark }}>
              {rp(crewDailyData.reduce((s, r) => s + r.omzet, 0))}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ marginTop: 8, flexDirection: "row", gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 10, height: 10, backgroundColor: "#dcfce7", borderRadius: 2, borderWidth: 0.5, borderColor: C.green600 }} />
          <Text style={{ fontSize: 6, color: C.slate500 }}>Omzet tertinggi per karyawan</Text>
        </View>
        <Text style={{ fontSize: 6, color: C.slate400 }}>Nilai: omzet harian (shortform)</Text>
      </View>

      <PageFooter label={`Matriks Harian · ${data.branch.name} · ${monthName} ${period.year}`} />
    </Page>
  );
}

// ─── Page 5: 12-Month Trend + Chart ───────────────────────────────────────────
function TrendPage({ data }: { data: ExportData }) {
  const { monthlyTrend, period } = data;
  const monthName = MONTHS_ID[period.month - 1];

  const chartData: BarItem[] = monthlyTrend.map((t) => ({
    label: MONTHS_ID[t.month - 1].slice(0, 3),
    subLabel: t.month === 1 || (t.month === period.month && t.year === period.year) ? String(t.year) : undefined,
    value: t.omzet,
    highlight: t.month === period.month && t.year === period.year,
  }));

  const totalOmzet  = monthlyTrend.reduce((s, t) => s + t.omzet, 0);
  const peakMonth   = [...monthlyTrend].sort((a, b) => b.omzet - a.omzet)[0];
  const avgOmzet    = totalOmzet / 12;

  return (
    <Page size="A4" style={S.pageP}>
      <View style={S.bar}>
        <Text style={S.barT}>Tren Omzet 12 Bulan</Text>
        <Text style={S.barS}>{data.branch.name} · s/d {monthName} {period.year}</Text>
      </View>

      {/* Summary chips */}
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
        {[
          { label: "Total 12 Bulan", val: rp(totalOmzet) },
          { label: "Rata-rata/Bulan", val: rp(avgOmzet) },
          { label: "Bulan Puncak", val: peakMonth && peakMonth.omzet > 0 ? `${MONTHS_ID[peakMonth.month - 1]} ${peakMonth.year}` : "-" },
          { label: "Omzet Puncak", val: peakMonth && peakMonth.omzet > 0 ? rp(peakMonth.omzet) : "-" },
        ].map(({ label, val }) => (
          <View key={label} style={{ flex: 1, borderWidth: 1, borderColor: C.slate200, borderRadius: 6, padding: 8 }}>
            <Text style={{ fontSize: 6.5, color: C.slate500, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 3 }}>{label}</Text>
            <Text style={{ fontSize: 9, color: C.slate800, fontFamily: "Helvetica-Bold" }}>{val}</Text>
          </View>
        ))}
      </View>

      {/* Bar chart — full width */}
      <SectionTitle>Grafik Omzet Bulanan (12 Bulan Terakhir)</SectionTitle>
      <View style={{ marginBottom: 14, paddingHorizontal: 2 }}>
        <BarChart data={chartData} height={110} showValues={true} labelSize={6} />
      </View>

      {/* Table */}
      <SectionTitle>Detail Per Periode</SectionTitle>
      <View style={{ borderWidth: 0.5, borderColor: C.slate200, borderRadius: 4, overflow: "hidden" }}>
        <View style={S.tHead}>
          <View style={{ ...S.thCell, width: 28 }}><Text style={S.thTxtC}>No</Text></View>
          <View style={{ ...S.thCell, width: 110 }}><Text style={S.thTxt}>Periode</Text></View>
          <View style={{ ...S.thCell, width: 90 }}><Text style={S.thTxtR}>Omzet</Text></View>
          <View style={{ ...S.thCell, width: 50 }}><Text style={S.thTxtR}>% Avg</Text></View>
          <View style={{ ...S.thCell, flex: 1 }}><Text style={S.thTxt}>Proporsi</Text></View>
        </View>

        {monthlyTrend.map((t, i) => {
          const isCurrent = t.month === period.month && t.year === period.year;
          const vsAvg = avgOmzet > 0 ? (t.omzet / avgOmzet) * 100 : 0;
          const barW = totalOmzet > 0 ? (t.omzet / Math.max(...monthlyTrend.map(x => x.omzet), 1)) * 140 : 0;
          const Row = i % 2 === 0 ? S.tRow : S.tRowAlt;
          return (
            <View key={`${t.year}-${t.month}`} style={{ ...Row, backgroundColor: isCurrent ? C.green50 : (i % 2 === 0 ? C.white : C.slate50) }}>
              <View style={{ ...S.tdCell, width: 28 }}><Text style={{ ...S.tdTxtC, color: C.slate400 }}>{i + 1}</Text></View>
              <View style={{ ...S.tdCell, width: 110 }}>
                <Text style={{ ...S.tdTxt, fontFamily: isCurrent ? "Helvetica-Bold" : "Helvetica", color: isCurrent ? C.emerald : C.slate800 }}>
                  {MONTHS_ID[t.month - 1]} {t.year}{isCurrent ? " ★" : ""}
                </Text>
              </View>
              <View style={{ ...S.tdCell, width: 90 }}>
                <Text style={{ ...S.tdTxtR, fontFamily: t.omzet > 0 ? "Helvetica-Bold" : "Helvetica", color: t.omzet > 0 ? C.slate800 : C.slate300 }}>
                  {t.omzet > 0 ? rp(t.omzet) : "-"}
                </Text>
              </View>
              <View style={{ ...S.tdCell, width: 50 }}>
                <Text style={{ ...S.tdTxtR, color: vsAvg >= 100 ? C.green600 : vsAvg > 0 ? C.amber500 : C.slate300 }}>
                  {t.omzet > 0 ? pct(vsAvg) : "-"}
                </Text>
              </View>
              <View style={{ ...S.tdCell, flex: 1, justifyContent: "center" }}>
                {t.omzet > 0 && (
                  <View style={{ height: 8, width: barW, backgroundColor: isCurrent ? C.emerald : C.emeraldLight, borderRadius: 2 }} />
                )}
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ marginTop: 10, padding: 8, backgroundColor: C.slate50, borderRadius: 6, borderWidth: 1, borderColor: C.slate200 }}>
        <Text style={{ fontSize: 7, color: C.slate500 }}>
          ★ Periode yang dipilih. Data 12 bulan dari leaderboard snapshots (data terverifikasi).
          Bulan tanpa data mungkin belum memiliki snapshot tersimpan.
        </Text>
      </View>

      <PageFooter label={`Tren 12 Bulan · ${data.branch.name} · s/d ${monthName} ${period.year}`} />
    </Page>
  );
}

// ─── Page 6: Rejected Customers ───────────────────────────────────────────────
function RejectedPage({ data }: { data: ExportData }) {
  const { dailyTotals, period } = data;
  const monthName = MONTHS_ID[period.month - 1];

  const totalRej = dailyTotals.reduce((s, d) => s + d.rejectedCustomers, 0);
  const totalOmz = dailyTotals.reduce((s, d) => s + d.omzet, 0);
  const totalTx  = dailyTotals.reduce((s, d) => s + d.transactions, 0);
  const branchAtv = totalTx > 0 ? totalOmz / totalTx : 0;

  const dateMap = new Map(dailyTotals.map((d) => [d.date, d]));
  const rows = Array.from({ length: period.daysInMonth }, (_, i) => {
    const day = i + 1;
    const dateStr = `${period.year}-${pad2(period.month)}-${pad2(day)}`;
    const e = dateMap.get(dateStr);
    const atv = e && e.transactions > 0 ? e.omzet / e.transactions : branchAtv;
    return { day, date: dateStr, rej: e?.rejectedCustomers ?? 0, atv, hasData: !!e };
  });

  // Chart
  const chartData: BarItem[] = rows.map((r) => ({
    label: String(r.day),
    value: r.rej,
    highlight: r.rej > 0,
  }));

  return (
    <Page size="A4" style={S.pageP}>
      <View style={S.bar}>
        <Text style={S.barT}>Pelanggan Tertolak</Text>
        <Text style={S.barS}>{monthName} {period.year} · {data.branch.name}</Text>
      </View>

      {/* Summary */}
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
        {[
          { label: "Total Tertolak", val: num(totalRej) + " pelanggan", color: C.amber500 },
          { label: "Est. Omzet Hilang", val: rp(totalRej * branchAtv), color: C.amber500 },
          { label: "ATV Ref. (rata-rata)", val: rp(branchAtv), color: C.slate800 },
          { label: "Hari dengan Penolakan", val: num(rows.filter(r => r.rej > 0).length) + " hari", color: C.slate800 },
        ].map(({ label, val, color }) => (
          <View key={label} style={{ flex: 1, borderWidth: 1, borderColor: C.slate200, borderRadius: 6, padding: 8, backgroundColor: color === C.amber500 ? "#fff7ed" : C.white }}>
            <Text style={{ fontSize: 6.5, color: C.slate500, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 3 }}>{label}</Text>
            <Text style={{ fontSize: 9, color, fontFamily: "Helvetica-Bold" }}>{val}</Text>
          </View>
        ))}
      </View>

      {/* Rejection chart */}
      <SectionTitle>Grafik Penolakan Harian</SectionTitle>
      <View style={{ marginBottom: 14, paddingHorizontal: 4 }}>
        <BarChart data={chartData} height={66} showValues={false} labelSize={5} />
      </View>

      {/* Table */}
      <SectionTitle>Detail Per Tanggal</SectionTitle>
      <View style={{ borderWidth: 0.5, borderColor: C.slate200, borderRadius: 4, overflow: "hidden" }}>
        <View style={S.tHead}>
          <View style={{ ...S.thCell, width: 28 }}><Text style={S.thTxtC}>No</Text></View>
          <View style={{ ...S.thCell, width: 62 }}><Text style={S.thTxtC}>Tanggal</Text></View>
          <View style={{ ...S.thCell, width: 80 }}><Text style={S.thTxtC}>Jml Tertolak</Text></View>
          <View style={{ ...S.thCell, flex: 1 }}><Text style={S.thTxtR}>Est. Omzet Hilang</Text></View>
        </View>

        {rows.map((r, i) => {
          const estOmzet = r.rej * r.atv;
          const hasRej = r.rej > 0;
          const Row = i % 2 === 0 ? S.tRow : S.tRowAlt;
          return (
            <View key={r.date} style={{ ...Row, backgroundColor: hasRej ? "#fff7ed" : (i % 2 === 0 ? C.white : C.slate50) }}>
              <View style={{ ...S.tdCell, width: 28 }}><Text style={{ ...S.tdTxtC, color: C.slate400 }}>{r.day}</Text></View>
              <View style={{ ...S.tdCell, width: 62 }}><Text style={S.tdTxtC}>{dateLabel(r.date)}</Text></View>
              <View style={{ ...S.tdCell, width: 80 }}>
                <Text style={{ ...S.tdTxtC, fontFamily: hasRej ? "Helvetica-Bold" : "Helvetica", color: hasRej ? C.amber500 : (r.hasData ? C.slate800 : C.slate300) }}>
                  {r.hasData ? num(r.rej) : "-"}
                </Text>
              </View>
              <View style={{ ...S.tdCell, flex: 1 }}>
                <Text style={{ ...S.tdTxtR, color: hasRej ? C.amber500 : (r.hasData ? C.slate800 : C.slate300) }}>
                  {r.hasData && hasRej ? rp(estOmzet) : r.hasData ? "-" : "-"}
                </Text>
              </View>
            </View>
          );
        })}

        <View style={S.tFoot}>
          <View style={{ ...S.tdCell, width: 28 }}><Text style={S.ftTxtC}>Σ</Text></View>
          <View style={{ ...S.tdCell, width: 62 }}><Text style={S.ftTxtC}>Total</Text></View>
          <View style={{ ...S.tdCell, width: 80 }}><Text style={{ ...S.ftTxtC, color: C.amber500 }}>{num(totalRej)}</Text></View>
          <View style={{ ...S.tdCell, flex: 1 }}><Text style={{ ...S.ftTxtR, color: C.amber500 }}>{rp(totalRej * branchAtv)}</Text></View>
        </View>
      </View>

      <PageFooter label={`Pelanggan Tertolak · ${data.branch.name} · ${monthName} ${period.year}`} />
    </Page>
  );
}

// ─── Main Document ─────────────────────────────────────────────────────────────
export function PdfReport({ data }: { data: ExportData }) {
  return (
    <Document
      title={`Laporan Jago Jualan - ${data.branch.name} - ${MONTHS_ID[data.period.month - 1]} ${data.period.year}`}
      author="BBA Portal"
      creator="BBA Portal"
    >
      <CoverPage data={data} />
      <DailySummaryPage data={data} />
      <CrewPerformancePage data={data} />
      <CrewMatrixPage data={data} />
      <TrendPage data={data} />
      <RejectedPage data={data} />
    </Document>
  );
}
