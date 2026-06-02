import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { PdfReport } from "@/lib/export/pdf-report";
import { fetchExportData } from "@/lib/export/fetch-export-data";
import { getSessionContext } from "@/lib/auth-context";

export const dynamic = "force-dynamic";

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9\s\-_.]/g, "").replace(/\s+/g, "_").slice(0, 60);
}

const MONTHS_ID = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

export async function GET(request: Request) {
  // Auth check
  const session = await getSessionContext();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  // Only global super admin or BBA portal staff (non-crew) can export
  const role = session.activeMembership?.role;
  const isAllowed =
    session.isGlobalSuperAdmin ||
    role === "super_admin_bba" ||
    role === "owner" ||
    session.bbaPortalStaffRole === "analyst";

  if (!isAllowed) {
    return new Response("Forbidden: akses laporan hanya untuk admin BBA.", { status: 403 });
  }

  // Parse query params
  const { searchParams } = new URL(request.url);
  const branchId = searchParams.get("branchId") ?? "";
  const monthRaw = searchParams.get("month") ?? "";
  const yearRaw  = searchParams.get("year")  ?? "";

  const month = parseInt(monthRaw, 10);
  const year  = parseInt(yearRaw, 10);

  if (!branchId || isNaN(month) || isNaN(year) || month < 1 || month > 12 || year < 2020 || year > 2100) {
    return new Response("Parameter tidak valid. Diperlukan: branchId, month (1-12), year.", { status: 400 });
  }

  // For non-global admins (including analysts), verify they belong to this branch
  if (!session.isGlobalSuperAdmin) {
    const hasBranchAccess = session.memberships.some((m) => m.tenantId === branchId);
    if (!hasBranchAccess) {
      return new Response("Forbidden: tidak punya akses ke cabang ini.", { status: 403 });
    }
  }

  // Fetch data
  const data = await fetchExportData(branchId, month, year);
  if (!data) {
    return new Response("Cabang tidak ditemukan.", { status: 404 });
  }

  // Generate PDF
  let pdfBuffer: Uint8Array;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfBuffer = await renderToBuffer(React.createElement(PdfReport, { data }) as any);
  } catch (err) {
    console.error("[export/pdf] renderToBuffer failed:", err);
    return new Response("Gagal membuat PDF. Silakan coba lagi.", { status: 500 });
  }

  const monthName = MONTHS_ID[month - 1];
  const filename  = sanitizeFilename(`${data.branch.name}_${monthName}_${year}`) + ".pdf";

  return new Response(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
