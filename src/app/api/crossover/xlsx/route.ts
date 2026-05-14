import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { listProducts } from "@/lib/store/products";

export const runtime = "nodejs";

// GET /api/crossover/xlsx → XLSX matching the original example schema:
// factory · factory name · factory color · Trinity name · Trinity color · factory link
export async function GET() {
  const products = await listProducts();

  const wb = new ExcelJS.Workbook();
  wb.creator = "Quick Flip Brochures";
  wb.created = new Date();
  const ws = wb.addWorksheet("Crossover");

  ws.columns = [
    { header: "factory", key: "factory", width: 22 },
    { header: "factory name", key: "factoryName", width: 22 },
    { header: "factory color", key: "factoryColor", width: 18 },
    { header: "Trinity name", key: "trinityName", width: 18 },
    { header: "Trinity color", key: "trinityColor", width: 18 },
    { header: "factory link", key: "factoryUrl", width: 50 },
  ];

  ws.getRow(1).font = { bold: true };

  for (const p of products) {
    if (p.colors.length === 0) {
      ws.addRow({
        factory: p.factory,
        factoryName: p.factoryName,
        factoryColor: "",
        trinityName: p.trinityName,
        trinityColor: "",
        factoryUrl: p.factoryUrl,
      });
    } else {
      for (const c of p.colors) {
        ws.addRow({
          factory: p.factory,
          factoryName: p.factoryName,
          factoryColor: c.trinityName, // until we track factory colors separately
          trinityName: p.trinityName,
          trinityColor: c.trinityName,
          factoryUrl: p.factoryUrl,
        });
      }
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const filename = `quick-flip-crossover-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
