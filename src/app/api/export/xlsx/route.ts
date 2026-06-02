import { buildExcelReport } from "@/lib/export/excel-report";
import { fetchExportData } from "@/lib/export/fetch-export-data";
import { getSessionContext } from "@/lib/auth-context";

export const dynamic = "force-dynamic";

const MONTHS_ID = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9\s\-_.]/g, "").replace(/\s+/g, "_").slice(0, 60);
}

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const role = session.activeMembership?.role;
  const isAllowed =
    session.isGlobalSuperAdmin ||
    role === "super_admin_bba" ||
    role === "owner" ||
    session.bbaPortalStaffRole === "analyst";

  if (!isAllowed) return new Response("Forbidden", { status: 403 });

  const { searchParams } = new URL(request.url);
  const branchId = searchParams.get("branchId") ?? "";
  const month    = parseInt(searchParams.get("month") ?? "", 10);
  const year     = parseInt(searchParams.get("year")  ?? "", 10);

  if (!branchId || isNaN(month) || isNaN(year) || month < 1 || month > 12 || year < 2020 || year > 2100) {
    return new Response("Parameter tidak valid.", { status: 400 });
  }

  if (!session.isGlobalSuperAdmin) {
    const hasBranchAccess = session.memberships.some((m) => m.tenantId === branchId);
    if (!hasBranchAccess) return new Response("Forbidden: tidak punya akses ke cabang ini.", { status: 403 });
  }

  const data = await fetchExportData(branchId, month, year);
  if (!data) return new Response("Cabang tidak ditemukan.", { status: 404 });

  let buffer: Buffer;
  try {
    buffer = await buildExcelReport(data);
  } catch (err) {
    console.error("[export/xlsx] buildExcelReport failed:", err);
    return new Response("Gagal membuat Excel. Silakan coba lagi.", { status: 500 });
  }

  const monthName = MONTHS_ID[month - 1];
  const filename  = sanitizeFilename(`${data.branch.name}_${monthName}_${year}`) + ".xlsx";

  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
