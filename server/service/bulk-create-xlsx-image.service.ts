import path from "path";
import { createHash } from "crypto";
import AdmZip from "adm-zip";
import * as XLSX from "xlsx";
import { cloudinaryService } from "./cloudinary.service";

interface SheetActor {
  id: string;
  companyCode: string;
}

interface EmbeddedImage {
  row: number;
  column: number;
  mediaPart: string;
}

interface SheetCandidate {
  name: string;
  index: number;
  matrix: string[][];
  headerRow: number;
  firstColumn: number;
  columnCount: number;
  score: number;
  images: EmbeddedImage[];
}

interface ImportedColumn {
  key: string;
  label: string;
  type: "text" | "image";
  samples: string[];
}

const MAX_WORKSHEETS = 50;
const MAX_SHEET_ROWS_TO_SCAN = 5_000;
const MAX_SHEET_COLUMNS_TO_SCAN = 200;
const MAX_HEADER_ROWS_TO_SCAN = 500;
const MAX_IMPORTED_COLUMNS = 50;
const MAX_ARCHIVE_ENTRIES = 5_000;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;
const MAX_ARCHIVE_IMAGE_BYTES = 150 * 1024 * 1024;
const MAX_EMBEDDED_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMPORTED_IMAGES = 2_000;
const configuredImageUploadConcurrency = Number(
  process.env.BULK_CREATE_SHEET_IMAGE_CONCURRENCY || 6
);
const IMAGE_UPLOAD_CONCURRENCY = Number.isFinite(configuredImageUploadConcurrency)
  ? Math.min(8, Math.max(1, Math.floor(configuredImageUploadConcurrency)))
  : 6;
const zipIndexes = new WeakMap<AdmZip, Map<string, AdmZip.IZipEntry>>();

function decodeXml(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function attributes(fragment: string) {
  return Object.fromEntries(
    Array.from(fragment.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g))
      .map((match) => [match[1], decodeXml(match[2])])
  );
}

function zipText(zip: AdmZip, entryName: string) {
  const entry = zipEntry(zip, entryName);
  return entry ? entry.getData().toString("utf8") : "";
}

function zipEntry(zip: AdmZip, entryName: string) {
  const normalizedName = entryName.replace(/\\/g, "/");
  let index = zipIndexes.get(zip);
  if (!index) {
    index = new Map(
      zip.getEntries().map((entry) => [
        entry.entryName.replace(/\\/g, "/").toLocaleLowerCase(),
        entry,
      ])
    );
    zipIndexes.set(zip, index);
  }
  return index.get(normalizedName.toLocaleLowerCase()) || null;
}

function relationshipPart(partName: string) {
  return path.posix.join(path.posix.dirname(partName), "_rels", `${path.posix.basename(partName)}.rels`);
}

function resolvePart(partName: string, target: string) {
  if (target.startsWith("/")) return target.replace(/^\/+/, "");
  return path.posix.normalize(path.posix.join(path.posix.dirname(partName), target));
}

function relationships(zip: AdmZip, partName: string) {
  const result = new Map<string, string>();
  for (const match of zipText(zip, relationshipPart(partName)).matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = attributes(match[1]);
    if (attrs.Id && attrs.Target) result.set(attrs.Id, resolvePart(partName, attrs.Target));
  }
  return result;
}

function workbookSheetParts(zip: AdmZip) {
  const workbookPart = "xl/workbook.xml";
  const workbookRelationships = relationships(zip, workbookPart);
  const result = new Map<string, string>();
  for (const match of zipText(zip, workbookPart).matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = attributes(match[1]);
    const target = workbookRelationships.get(attrs["r:id"]);
    if (attrs.name && target) result.set(attrs.name, target);
  }
  return result;
}

function extractDrawingImages(zip: AdmZip, worksheetPart: string) {
  const worksheetRelationships = relationships(zip, worksheetPart);
  const images: EmbeddedImage[] = [];
  for (const drawingMatch of zipText(zip, worksheetPart).matchAll(/<drawing\b([^>]*)\/?>/g)) {
    const drawingPart = worksheetRelationships.get(attributes(drawingMatch[1])["r:id"]);
    if (!drawingPart) continue;
    const drawingRelationships = relationships(zip, drawingPart);
    for (const anchorMatch of zipText(zip, drawingPart).matchAll(
      /<xdr:(oneCellAnchor|twoCellAnchor)\b[^>]*>([\s\S]*?)<\/xdr:\1>/g
    )) {
      const anchorXml = anchorMatch[2];
      const from = anchorXml.match(/<xdr:from>([\s\S]*?)<\/xdr:from>/)?.[1] || "";
      const column = Number(from.match(/<xdr:col>(\d+)<\/xdr:col>/)?.[1]);
      const row = Number(from.match(/<xdr:row>(\d+)<\/xdr:row>/)?.[1]);
      const relationshipId = anchorXml.match(/<a:blip\b[^>]*r:embed="([^"]+)"/)?.[1];
      const mediaPart = relationshipId ? drawingRelationships.get(relationshipId) : undefined;
      if (
        Number.isInteger(row) &&
        Number.isInteger(column) &&
        mediaPart &&
        zipEntry(zip, mediaPart)
      ) {
        images.push({ row, column, mediaPart });
      }
    }
  }
  return images;
}

function cellCoordinates(reference: string) {
  const match = reference.toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  let column = 0;
  for (const character of match[1]) {
    column = column * 26 + character.charCodeAt(0) - 64;
  }
  return { row: Number(match[2]) - 1, column: column - 1 };
}

function xmlChildren(xml: string, name: string) {
  const pattern = new RegExp(
    `<(?:[\\w-]+:)?${name}\\b([^>]*)>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${name}>`,
    "g"
  );
  return Array.from(xml.matchAll(pattern)).map((match) => ({
    attrs: attributes(match[1]),
    body: match[2],
  }));
}

function xmlValues(xml: string) {
  return xmlChildren(xml, "v").map((item) => decodeXml(item.body.trim()));
}

function extractRichValueImages(zip: AdmZip, worksheetPart: string) {
  const metadataBlocks = xmlChildren(zipText(zip, "xl/metadata.xml"), "bk");
  const richValues = xmlChildren(zipText(zip, "xl/richData/richvalue.xml"), "rv");
  const structures = xmlChildren(
    zipText(zip, "xl/richData/rdrichvaluestructure.xml"),
    "s"
  );
  const richValueRelPart = "xl/richData/richValueRel.xml";
  const richValueRelationships = relationships(zip, richValueRelPart);
  const richValueRels = Array.from(
    zipText(zip, richValueRelPart).matchAll(/<(?:[\w-]+:)?rel\b([^>]*)\/?>/g)
  ).map((match) => attributes(match[1])["r:id"]);
  if (
    metadataBlocks.length === 0 ||
    richValues.length === 0 ||
    structures.length === 0 ||
    richValueRels.length === 0
  ) {
    return [];
  }

  const images: EmbeddedImage[] = [];
  for (const cell of xmlChildren(zipText(zip, worksheetPart), "c")) {
    const metadataIndex = Number(cell.attrs.vm);
    const coordinates = cellCoordinates(cell.attrs.r || "");
    if (!coordinates || !Number.isInteger(metadataIndex) || metadataIndex < 1) continue;
    const metadataReference = (metadataBlocks[metadataIndex - 1]?.body || "")
      .match(/<(?:[\w-]+:)?rc\b([^>]*)\/?>/);
    const richValueIndex = Number(
      metadataReference ? attributes(metadataReference[1]).v : Number.NaN
    );
    const richValue = richValues[richValueIndex];
    if (!richValue) continue;
    const structure = structures[Number(richValue.attrs.s)];
    if (!structure) continue;
    const keys = Array.from(
      structure.body.matchAll(/<(?:[\w-]+:)?k\b([^>]*)\/?>/g)
    ).map((match) => attributes(match[1]).n);
    const localImageIndex = keys.indexOf("_rvRel:LocalImageIdentifier");
    if (localImageIndex < 0) continue;
    const relationshipIndex = Number(xmlValues(richValue.body)[localImageIndex]);
    const relationshipId = richValueRels[relationshipIndex];
    const mediaPart = relationshipId
      ? richValueRelationships.get(relationshipId)
      : undefined;
    if (mediaPart && zipEntry(zip, mediaPart)) {
      images.push({ ...coordinates, mediaPart });
    }
  }
  return images;
}

function extractWorksheetImages(zip: AdmZip, worksheetPart: string) {
  const drawingImages = extractDrawingImages(zip, worksheetPart);
  const richValueImages = extractRichValueImages(zip, worksheetPart);
  const images = [...drawingImages, ...richValueImages];
  const seen = new Set<string>();
  return images.filter((image) => {
    const key = `${image.row}:${image.column}:${image.mediaPart}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizedCell(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeColumnKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d")
    .trim().toLocaleLowerCase("vi-VN").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function looksLikeImageColumn(label: string, samples: string[]) {
  if (/(ảnh|hình|image|photo|logo|avatar|thumbnail)/i.test(label)) return true;
  return samples.some((value) => /^https:\/\/\S+\.(png|jpe?g|webp|gif)(\?\S*)?$/i.test(value));
}

function sheetMatrix(sheet: XLSX.WorkSheet) {
  const worksheetRange = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  return XLSX.utils.sheet_to_json<Array<string | number | boolean>>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    range: {
      s: { r: 0, c: 0 },
      e: {
        r: Math.min(worksheetRange.e.r, MAX_SHEET_ROWS_TO_SCAN - 1),
        c: Math.min(worksheetRange.e.c, MAX_SHEET_COLUMNS_TO_SCAN - 1),
      },
    },
  }).map((row) => row.map(normalizedCell));
}

function exactCandidate(workbook: XLSX.WorkBook, zip: AdmZip, labels: string[], sampleRows: string[][]) {
  const sheetParts = workbookSheetParts(zip);
  let best: SheetCandidate | null = null;
  workbook.SheetNames.forEach((name, index) => {
    const matrix = sheetMatrix(workbook.Sheets[name]);
    const worksheetPart = sheetParts.get(name);
    const images = worksheetPart ? extractWorksheetImages(zip, worksheetPart) : [];
    const width = matrix.reduce((maximum, row) => Math.max(maximum, row.length), 0);
    matrix.forEach((_, headerRow) => {
      for (let firstColumn = 0; firstColumn <= width - labels.length; firstColumn += 1) {
        const matches = labels.every((label, offset) =>
          normalizedCell(matrix[headerRow]?.[firstColumn + offset]).toLocaleLowerCase("vi-VN") ===
          label.toLocaleLowerCase("vi-VN"));
        if (!matches) continue;
        let sampleMatches = 0;
        sampleRows.slice(0, 4).forEach((sample, rowOffset) => {
          sample.forEach((value, columnOffset) => {
            if (value && normalizedCell(matrix[headerRow + rowOffset + 1]?.[firstColumn + columnOffset]) === value) {
              sampleMatches += 1;
            }
          });
        });
        const score = labels.length * 10_000 + sampleMatches;
        if (!best || score > best.score) {
          best = { name, index, matrix, headerRow, firstColumn, columnCount: labels.length, score, images };
        }
      }
    });
  });
  return best;
}

function automaticCandidate(workbook: XLSX.WorkBook, zip: AdmZip) {
  const sheetParts = workbookSheetParts(zip);
  let best: SheetCandidate | null = null;
  workbook.SheetNames.forEach((name, index) => {
    const matrix = sheetMatrix(workbook.Sheets[name]);
    const worksheetPart = sheetParts.get(name);
    const images = worksheetPart ? extractWorksheetImages(zip, worksheetPart) : [];
    matrix.slice(0, Math.min(MAX_HEADER_ROWS_TO_SCAN, matrix.length - 1)).forEach((row, headerRow) => {
      const headerColumns = row.map((value, column) => normalizedCell(value) ? column : -1)
        .filter((column) => column >= 0);
      if (headerColumns.length === 0) return;
      const firstColumn = headerColumns[0];
      const lastColumn = headerColumns[headerColumns.length - 1];
      const columnCount = lastColumn - firstColumn + 1;
      if (columnCount > MAX_IMPORTED_COLUMNS) return;
      const labels = row.slice(firstColumn, lastColumn + 1).map(normalizedCell);
      if (labels.some((label) => !label)) return;
      const candidateRows = matrix.slice(
        headerRow + 1,
        Math.min(matrix.length, headerRow + 501)
      );
      const supported = labels.filter((_, offset) => {
        const column = firstColumn + offset;
        return candidateRows.some((dataRow) => normalizedCell(dataRow[column])) ||
          images.some((image) => image.row > headerRow && image.column === column);
      }).length;
      if (supported === 0) return;
      const dataRows = new Set<number>();
      candidateRows.forEach((dataRow, offset) => {
        if (labels.some((_, columnOffset) => normalizedCell(dataRow[firstColumn + columnOffset]))) {
          dataRows.add(headerRow + offset + 1);
        }
      });
      images.forEach((image) => {
        if (image.row > headerRow && image.column >= firstColumn && image.column <= lastColumn) {
          dataRows.add(image.row);
        }
      });
      const relevantImageCount = images.filter((image) =>
        image.row > headerRow && image.column >= firstColumn && image.column <= lastColumn).length;
      const score = supported * 10_000 + labels.length * 1_000 + dataRows.size * 10 + relevantImageCount;
      if (!best || score > best.score) {
        best = { name, index, matrix, headerRow, firstColumn, columnCount, score, images };
      }
    });
  });
  return best;
}

async function mapWithConcurrency<T, R>(
  items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

interface WorkbookImportInput {
  actor: SheetActor;
  sourceId: string;
  labels?: string[];
  sourceRows?: string[][];
  columns?: ImportedColumn[];
  maxBytes: number;
}

async function importWorkbookBuffer(input: WorkbookImportInput, buffer: Buffer) {
  if (buffer.length > input.maxBytes) {
    throw new Error("Bảng tính có quá nhiều ảnh hoặc vượt quá dung lượng cho phép.");
  }
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error("Tệp không phải định dạng XLSX hợp lệ.");
  }

  const zip = new AdmZip(buffer);
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false });
  const entries = zip.getEntries();
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error("Bảng tính chứa quá nhiều thành phần để xử lý an toàn.");
  }
  const uncompressedBytes = entries.reduce((total, entry) => total + entry.header.size, 0);
  if (uncompressedBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
    throw new Error("Dữ liệu giải nén của bảng tính vượt quá giới hạn 250 MB.");
  }
  const imageEntries = entries.filter((entry) =>
    /^xl\/media\//i.test(entry.entryName.replace(/\\/g, "/"))
  );
  const imageBytes = imageEntries.reduce((total, entry) => total + entry.header.size, 0);
  if (imageBytes > MAX_ARCHIVE_IMAGE_BYTES) {
    throw new Error("Tổng dung lượng ảnh trong bảng tính vượt quá giới hạn 150 MB.");
  }
  if (imageEntries.some((entry) => entry.header.size > MAX_EMBEDDED_IMAGE_BYTES)) {
    throw new Error("Mỗi ảnh trong bảng tính chỉ được tối đa 10 MB.");
  }
  if (workbook.SheetNames.length > MAX_WORKSHEETS) {
    throw new Error(`Bảng tính chỉ được tối đa ${MAX_WORKSHEETS} tab.`);
  }
  const candidate = input.labels?.length
    ? exactCandidate(workbook, zip, input.labels, input.sourceRows || [])
    : automaticCandidate(workbook, zip);
  if (!candidate) throw new Error("Không thể tự xác định tab chứa bảng dữ liệu.");

  const labels = input.labels?.length ? input.labels :
    candidate.matrix[candidate.headerRow]
      .slice(candidate.firstColumn, candidate.firstColumn + candidate.columnCount).map(normalizedCell);
  if (labels.length > MAX_IMPORTED_COLUMNS) {
    throw new Error(`Bảng dữ liệu chỉ được tối đa ${MAX_IMPORTED_COLUMNS} cột.`);
  }
  const keys = labels.map(normalizeColumnKey);
  if (labels.some((label) => !label) || keys.some((key) => !key)) {
    throw new Error("Dòng tiêu đề có cột để trống hoặc tên cột không hợp lệ.");
  }
  if (new Set(keys).size !== keys.length) throw new Error("Dòng tiêu đề có tên cột bị trùng.");

  const imageColumns = new Set<number>();
  candidate.images.forEach((image) => {
    const relativeColumn = image.column - candidate.firstColumn;
    if (relativeColumn >= 0 && relativeColumn < labels.length) imageColumns.add(relativeColumn);
  });
  const columns: ImportedColumn[] = labels.map((label, index) => {
    const supplied = input.columns?.[index];
    return {
      key: supplied?.key || keys[index],
      label,
      type: imageColumns.has(index) ? "image" : supplied?.type || "text",
      samples: supplied?.samples || [],
    };
  });

  const lastMatrixRow = candidate.matrix.length - 1;
  const lastImageRow = candidate.images.reduce((maximum, image) => Math.max(maximum, image.row), candidate.headerRow);
  const lastRow = Math.max(lastMatrixRow, lastImageRow);
  const sourceRowIndexes = Array.from(
    { length: Math.max(0, lastRow - candidate.headerRow) },
    (_, index) => candidate.headerRow + index + 1
  ).filter((rowIndex) =>
    columns.some((_, columnIndex) =>
      normalizedCell(candidate.matrix[rowIndex]?.[candidate.firstColumn + columnIndex])) ||
    candidate.images.some((image) => image.row === rowIndex &&
      image.column >= candidate.firstColumn &&
      image.column < candidate.firstColumn + columns.length)
  ).slice(0, 100);

  const includedRows = new Set(sourceRowIndexes);
  const relevantImages = candidate.images.filter((image) =>
    includedRows.has(image.row) &&
    image.column >= candidate.firstColumn &&
    image.column < candidate.firstColumn + columns.length);
  if (relevantImages.length > MAX_IMPORTED_IMAGES) {
    throw new Error(
      `Bảng có quá nhiều ảnh. Mỗi lần chỉ có thể nhập tối đa ${MAX_IMPORTED_IMAGES} ảnh.`
    );
  }
  const occupiedImageCells = new Set<string>();
  for (const image of relevantImages) {
    const cellKey = `${image.row}:${image.column}`;
    if (occupiedImageCells.has(cellKey)) {
      throw new Error(
        "Một ô đang chứa nhiều ảnh chồng lên nhau. Hãy để mỗi ô tối đa một ảnh rồi nhập lại."
      );
    }
    occupiedImageCells.add(cellKey);
  }
  const safeCompanyCode = input.actor.companyCode.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  const uploadedUrls = await mapWithConcurrency(
    relevantImages,
    IMAGE_UPLOAD_CONCURRENCY,
    (image, index) => {
      const entry = zipEntry(zip, image.mediaPart);
      if (!entry) throw new Error("Không thể đọc một ảnh nhúng trong bảng tính.");
      if (entry.header.size > MAX_EMBEDDED_IMAGE_BYTES) {
        throw new Error("Mỗi ảnh trong bảng tính chỉ được tối đa 10 MB.");
      }
      return cloudinaryService.uploadMediaBuffer(
        entry.getData(),
        `igen_erp/bulk-create/${safeCompanyCode}/${input.actor.id}/sheet-images`,
        `${input.sourceId}-${candidate.index}-${image.row}-${image.column}-${index}`
      );
    }
  );
  const imageUrls = new Map(
    relevantImages.map((image, index) => [`${image.row}:${image.column}`, uploadedUrls[index]])
  );
  const rows = sourceRowIndexes.map((sourceRow, rowIndex) => ({
    id: `sheet-row-${rowIndex + 1}`,
    selected: true,
    cells: Object.fromEntries(columns.map((column, columnIndex) => {
      const absoluteColumn = candidate.firstColumn + columnIndex;
      return [column.key, imageUrls.get(`${sourceRow}:${absoluteColumn}`) ||
        normalizedCell(candidate.matrix[sourceRow]?.[absoluteColumn])];
    })),
  }));

  return {
    sheetName: candidate.name,
    columns: columns.map((column) => {
      const samples = rows.map((row) => row.cells[column.key]).filter(Boolean).slice(0, 4);
      return { ...column, samples, type: looksLikeImageColumn(column.label, samples) ? "image" as const : column.type };
    }),
    rows,
    embeddedImageCount: uploadedUrls.length,
  };
}

export async function importEmbeddedGoogleSheetImages(input: {
  actor: SheetActor;
  spreadsheetId: string;
  labels?: string[];
  sourceRows?: string[][];
  columns?: ImportedColumn[];
  maxBytes: number;
}) {
  const exportUrl = new URL(`https://docs.google.com/spreadsheets/d/${input.spreadsheetId}/export`);
  exportUrl.searchParams.set("format", "xlsx");
  const response = await fetch(exportUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Không thể tải bản XLSX của Google Sheet (${response.status}).`);
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > input.maxBytes) {
    throw new Error("Google Sheet có quá nhiều ảnh hoặc vượt quá dung lượng cho phép.");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return importWorkbookBuffer({
    ...input,
    sourceId: input.spreadsheetId,
  }, buffer);
}

export async function importUploadedWorkbookImages(input: {
  actor: SheetActor;
  buffer: Buffer;
  maxBytes: number;
}) {
  const sourceId = createHash("sha256").update(input.buffer).digest("hex").slice(0, 24);
  return importWorkbookBuffer({
    actor: input.actor,
    sourceId,
    maxBytes: input.maxBytes,
  }, input.buffer);
}
