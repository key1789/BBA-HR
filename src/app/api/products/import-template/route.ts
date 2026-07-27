import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { assertBbaAccess } from "@/lib/bba-portal-guard";

export async function GET() {
  const gate = await assertBbaAccess();
  if (!gate.ok) return new NextResponse("Forbidden", { status: 403 });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Produk");
  ws.columns = [{ header: "Nama Produk", key: "name", width: 44 }];
  ws.getRow(1).font = { bold: true };
  ws.addRow({ name: "Paracetamol 500mg" });
  ws.addRow({ name: "Amoxicillin 500mg" });
  ws.addRow({ name: "Vitamin C 1000mg" });

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template-produk-fokus.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
