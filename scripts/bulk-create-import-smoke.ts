import assert from "node:assert/strict";
import AdmZip from "adm-zip";
import * as XLSX from "xlsx";
import { cloudinaryService } from "../server/service/cloudinary.service";
import { bulkCreateService } from "../server/service/bulk-create.service";
import { assertSafeBulkImageSource } from "../server/service/bulk-create-renderer.service";
import { importUploadedWorkbookImages } from "../server/service/bulk-create-xlsx-image.service";

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlK0AAAAASUVORK5CYII=",
  "base64"
);

function workbookWithEmbeddedImages() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Ghi chú"],
      ["Không phải bảng dữ liệu chính"],
    ]),
    "Ghi chú"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["", "tiêu đề", "ảnh 1", "ảnh 2"],
      ["", "Mẫu A", "", ""],
      ["", "Mẫu B", "", ""],
    ]),
    "Dữ liệu"
  );

  const zip = new AdmZip(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
  const worksheetPart = "xl/worksheets/sheet2.xml";
  const worksheet = zip.getEntry(worksheetPart)?.getData().toString("utf8");
  assert.ok(worksheet, "Thiếu worksheet cần kiểm thử.");
  const worksheetWithDrawing = worksheet
    .replace(
      "<worksheet ",
      '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    )
    .replace("</worksheet>", '<drawing r:id="rId1"/></worksheet>');
  zip.updateFile(worksheetPart, Buffer.from(worksheetWithDrawing));
  zip.addFile(
    "xl/worksheets/_rels/sheet2.xml.rels",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`)
  );
  zip.addFile(
    "xl/drawings/drawing1.xml",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  ${[
    { column: 2, row: 1, relationshipId: "rId1" },
    { column: 3, row: 1, relationshipId: "rId2" },
    { column: 2, row: 2, relationshipId: "rId3" },
  ].map(({ column, row, relationshipId }, index) => `
  <xdr:oneCellAnchor>
    <xdr:from><xdr:col>${column}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:ext cx="952500" cy="952500"/>
    <xdr:pic>
      <xdr:nvPicPr><xdr:cNvPr id="${index + 1}" name="Ảnh ${index + 1}"/><xdr:cNvPicPr/></xdr:nvPicPr>
      <xdr:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
      <xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:oneCellAnchor>`).join("")}
</xdr:wsDr>`)
  );
  zip.addFile(
    "xl/drawings/_rels/drawing1.xml.rels",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.png"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image3.png"/>
</Relationships>`)
  );
  zip.addFile("xl/media/image1.png", tinyPng);
  zip.addFile("xl/media/image2.png", tinyPng);
  zip.addFile("xl/media/image3.png", tinyPng);
  return zip.toBuffer();
}

async function smokeDatabaseFallbackQueue() {
  const previousHost = process.env.REDIS_HOST;
  const previousPort = process.env.REDIS_PORT;
  process.env.REDIS_HOST = "127.0.0.1";
  process.env.REDIS_PORT = "1";
  const { enqueueBulkCreateJob } = await import("../server/queue/bulk-create-queue");
  const originalProcessJob = bulkCreateService.processJob;
  const originalFailJob = bulkCreateService.failJob;
  const calls = new Map<string, number>();
  let active = 0;
  let maximumActive = 0;
  let completed = 0;
  let resolveCompleted: (() => void) | undefined;
  const allCompleted = new Promise<void>((resolve) => {
    resolveCompleted = resolve;
  });

  bulkCreateService.processJob = async (jobId) => {
    calls.set(jobId, (calls.get(jobId) || 0) + 1);
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise<void>((resolve) => setTimeout(resolve, 40));
    active -= 1;
    completed += 1;
    if (completed === 4) resolveCompleted?.();
  };
  bulkCreateService.failJob = async () => undefined;

  try {
    await Promise.all([
      enqueueBulkCreateJob("job-1"),
      enqueueBulkCreateJob("job-1"),
      enqueueBulkCreateJob("job-2"),
      enqueueBulkCreateJob("job-3"),
      enqueueBulkCreateJob("job-4"),
    ]);
    await Promise.race([
      allCompleted,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Database fallback queue bị timeout.")), 2_000)
      ),
    ]);
    assert.equal(calls.get("job-1"), 1);
    assert.equal(calls.size, 4);
    assert.ok(maximumActive <= 2, `Fallback vượt concurrency: ${maximumActive}`);
  } finally {
    bulkCreateService.processJob = originalProcessJob;
    bulkCreateService.failJob = originalFailJob;
    if (previousHost === undefined) delete process.env.REDIS_HOST;
    else process.env.REDIS_HOST = previousHost;
    if (previousPort === undefined) delete process.env.REDIS_PORT;
    else process.env.REDIS_PORT = previousPort;
  }
}

async function main() {
  assert.doesNotThrow(() =>
    assertSafeBulkImageSource("https://res.cloudinary.com/smoke/image/upload/example.png")
  );
  assert.throws(
    () => assertSafeBulkImageSource("http://127.0.0.1/private.png"),
    /HTTPS/
  );
  assert.throws(
    () => assertSafeBulkImageSource("https://example.com/private.png"),
    /chưa được cho phép/
  );
  const originalUpload = cloudinaryService.uploadMediaBuffer;
  cloudinaryService.uploadMediaBuffer = async (_buffer, _folder, publicId) =>
    `https://res.cloudinary.com/smoke/image/upload/${publicId || "image"}.png`;
  try {
    const result = await importUploadedWorkbookImages({
      actor: { id: "smoke-user", companyCode: "SMOKE" },
      buffer: workbookWithEmbeddedImages(),
      maxBytes: 10 * 1024 * 1024,
    });
    assert.equal(result.sheetName, "Dữ liệu");
    assert.deepEqual(
      result.columns.map((column) => [column.label, column.type]),
      [["tiêu đề", "text"], ["ảnh 1", "image"], ["ảnh 2", "image"]]
    );
    assert.equal(result.rows.length, 2);
    assert.equal(result.embeddedImageCount, 3);
    assert.match(result.rows[0].cells["anh-1"], /^https:\/\/res\.cloudinary\.com\//);
    assert.match(result.rows[0].cells["anh-2"], /^https:\/\/res\.cloudinary\.com\//);
    assert.match(result.rows[1].cells["anh-1"], /^https:\/\/res\.cloudinary\.com\//);
    assert.equal(result.rows[1].cells["anh-2"], "");
    await smokeDatabaseFallbackQueue();
    console.log("Bulk Create import/queue smoke tests passed.");
  } finally {
    cloudinaryService.uploadMediaBuffer = originalUpload;
  }
}

void main();
