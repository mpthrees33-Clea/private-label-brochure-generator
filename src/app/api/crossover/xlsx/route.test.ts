import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";

describe("crossover xlsx route", () => {
  it("returns a workbook from the route handler", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "qfb-xlsx-"));
    const previous = process.env.QFB_DATA_DIR;
    process.env.QFB_DATA_DIR = dir;
    try {
      const { GET } = await import("./route");
      const res = await GET();
      assert.equal(res.status, 200);
      assert.equal(
        res.headers.get("content-type"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      assert.match(
        res.headers.get("content-disposition") ?? "",
        /attachment; filename="quick-flip-crossover-\d{4}-\d{2}-\d{2}\.xlsx"/,
      );

      const bytes = new Uint8Array(await res.arrayBuffer());
      assert.equal(Buffer.from(bytes.subarray(0, 2)).toString(), "PK");
      assert.equal(res.headers.get("content-length"), String(bytes.byteLength));

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof wb.xlsx.load>[0]);
      const ws = wb.getWorksheet("Crossover");
      assert.ok(ws);
      assert.deepEqual(
        [1, 2, 3, 4, 5, 6].map((col) => ws.getRow(1).getCell(col).value),
        [
          "factory",
          "factory name",
          "factory color",
          "Trinity name",
          "Trinity color",
          "factory link",
        ],
      );
      assert.ok((ws.rowCount ?? 0) >= 2);
    } finally {
      if (previous === undefined) delete process.env.QFB_DATA_DIR;
      else process.env.QFB_DATA_DIR = previous;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("exceljs can write a workbook without Node's ESM require()", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--no-experimental-require-module",
        "--input-type=commonjs",
        "-e",
        `
          const ExcelJS = require("exceljs");
          const wb = new ExcelJS.Workbook();
          const ws = wb.addWorksheet("Crossover");
          ws.columns = [{ header: "factory", key: "factory", width: 22 }];
          ws.getRow(1).font = { bold: true };
          ws.addRow({ factory: "Del Conca USA" });
          wb.xlsx.writeBuffer().then((buf) => {
            if (!Buffer.isBuffer(buf) || buf.length < 4 || buf.slice(0, 2).toString() !== "PK") {
              process.exit(2);
            }
            process.exit(0);
          }).catch((err) => {
            console.error(err);
            process.exit(1);
          });
        `,
      ],
      { encoding: "utf8" },
    );
    assert.equal(
      result.status,
      0,
      result.stderr || result.stdout || `exit ${result.status}`,
    );
  });
});
