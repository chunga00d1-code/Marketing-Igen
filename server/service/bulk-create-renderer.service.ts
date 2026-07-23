import sharp from "sharp";
import {
  BULK_FONT_FAMILIES,
  IBulkLayer,
  IBulkRenderJob,
} from "../interface/bulk-create.interface";
import { renderBulkImageInChromium } from "./bulk-create-chromium-renderer.service";

const MAX_ASSET_BYTES = 10 * 1024 * 1024;
const DEFAULT_ALLOWED_HOSTS = ["res.cloudinary.com"];

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;",
  })[character] || character);
}

function parseDataUrl(source: string): Buffer | null {
  const match = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(source);
  if (!match) return null;
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > MAX_ASSET_BYTES) throw new Error("Ảnh vượt quá giới hạn 10 MB.");
  return buffer;
}

function getAllowedHosts() {
  const configured = String(process.env.BULK_CREATE_ALLOWED_IMAGE_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_HOSTS, ...configured]);
}

async function loadImage(source: string): Promise<Buffer> {
  const dataBuffer = parseDataUrl(source);
  if (dataBuffer) return dataBuffer;

  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error("Đường dẫn ảnh không hợp lệ.");
  }
  if (url.protocol !== "https:") throw new Error("Ảnh bên ngoài phải sử dụng HTTPS.");
  const allowedHosts = getAllowedHosts();
  const isAllowed = [...allowedHosts].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  if (!isAllowed) throw new Error(`Tên miền ảnh ${url.hostname} chưa được cho phép.`);

  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Không thể tải ảnh (${response.status}).`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_ASSET_BYTES) throw new Error("Ảnh vượt quá giới hạn 10 MB.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_ASSET_BYTES) throw new Error("Ảnh vượt quá giới hạn 10 MB.");
  return buffer;
}

function normalizeColor(color: string | undefined, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(String(color || "")) ? String(color) : fallback;
}

function wrapText(text: string, maxCharacters: number) {
  const paragraphs = text.replace(/\r/g, "").split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxCharacters && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function transformText(value: string, transform: IBulkLayer["textTransform"]) {
  if (transform === "uppercase") return value.toLocaleUpperCase("vi-VN");
  if (transform === "lowercase") return value.toLocaleLowerCase("vi-VN");
  if (transform === "capitalize") {
    return value.replace(/(^|\s)(\S)/gu, (match) => match.toLocaleUpperCase("vi-VN"));
  }
  return value;
}

function renderTextLayer(layer: IBulkLayer, value: string, width: number, height: number) {
  const renderedValue = transformText(value, layer.textTransform);
  let fontSize = Math.max(8, Math.round(layer.fontSize || 32));
  const letterSpacing = layer.letterSpacing || 0;
  const lineHeightRatio = layer.lineHeight || 1.22;
  let lines = wrapText(renderedValue, Math.max(4, Math.floor(width / (fontSize * 0.58 + letterSpacing))));
  while (fontSize > 8 && lines.length * fontSize * lineHeightRatio > height) {
    fontSize -= 1;
    lines = wrapText(renderedValue, Math.max(4, Math.floor(width / (fontSize * 0.58 + letterSpacing))));
  }
  const align = layer.textAlign || "left";
  const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
  const x = align === "center" ? width / 2 : align === "right" ? width : 0;
  const lineHeight = fontSize * lineHeightRatio;
  const text = lines.slice(0, Math.max(1, Math.floor(height / lineHeight))).map((line, index) => (
    `<text x="${x}" y="${fontSize + index * lineHeight}" text-anchor="${anchor}">${escapeXml(line)}</text>`
  )).join("");
  const supportedFonts = new Set<string>(BULK_FONT_FAMILIES);
  const fontFamily = supportedFonts.has(layer.fontFamily || "") ? layer.fontFamily! : "DejaVu Sans";
  const color = normalizeColor(layer.color, "#ffffff");
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><style>text{font-family:'${fontFamily}',Arial,sans-serif;font-size:${fontSize}px;font-weight:${layer.fontWeight || 700};font-style:${layer.fontStyle || "normal"};text-decoration:${layer.textDecoration || "none"};letter-spacing:${letterSpacing}px;fill:${color};}</style>${text}</svg>`);
}

async function createBackground(snapshot: IBulkRenderJob["templateSnapshot"]) {
  const { width, height } = snapshot.canvas;
  if (snapshot.background.type === "image" && snapshot.background.imageUrl) {
    return sharp(await loadImage(snapshot.background.imageUrl)).resize(width, height, { fit: "cover" }).png().toBuffer();
  }
  if (snapshot.background.type === "gradient") {
    const start = normalizeColor(snapshot.background.colors?.[0], "#1e3a8a");
    const end = normalizeColor(snapshot.background.colors?.[1], "#60a5fa");
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }
  return sharp({ create: { width, height, channels: 4, background: normalizeColor(snapshot.background.color, "#ffffff") } }).png().toBuffer();
}

export async function renderBulkImage(
  snapshot: IBulkRenderJob["templateSnapshot"],
  values: Record<string, string>
): Promise<Buffer> {
  const { width: canvasWidth, height: canvasHeight } = snapshot.canvas;
  if (canvasWidth < 320 || canvasHeight < 320 || canvasWidth > 4096 || canvasHeight > 4096) {
    throw new Error("Kích thước canvas không hợp lệ.");
  }

  const composites: Array<{ input: Buffer; left: number; top: number }> = [];
  const orderedLayers = [...snapshot.layers].sort((a, b) => a.zIndex - b.zIndex);
  for (const layer of orderedLayers) {
    const value = String(
      values[layer.id] ?? values[layer.fieldName] ?? layer.defaultValue ?? ""
    ).trim();
    if (!value) throw new Error(`Thiếu dữ liệu cho trường '${layer.fieldName}'.`);
    const targetWidth = Math.max(1, Math.round(canvasWidth * layer.width / 100));
    const targetHeight = Math.max(1, Math.round(canvasHeight * layer.height / 100));
    const left = Math.round(canvasWidth * layer.x / 100);
    const top = Math.round(canvasHeight * layer.y / 100);

    let input: Buffer;
    if (layer.type === "image") {
      input = await sharp(await loadImage(value))
        .resize(targetWidth, targetHeight, { fit: layer.fit || "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
    } else {
      input = renderTextLayer(layer, value, targetWidth, targetHeight);
    }
    if (layer.rotation) input = await sharp(input).rotate(layer.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    composites.push({ input, left: clampOverlay(left, canvasWidth), top: clampOverlay(top, canvasHeight) });
  }

  return sharp(await createBackground(snapshot)).composite(composites).png({ compressionLevel: 9 }).toBuffer();
}

let lastChromiumFallbackLogAt = 0;

async function renderBulkImageOptimized(
  snapshot: IBulkRenderJob["templateSnapshot"],
  values: Record<string, string>
) {
  const engine = String(process.env.BULK_CREATE_RENDER_ENGINE || "hybrid").toLowerCase();
  const useChromium =
    engine === "chromium" ||
    (engine === "hybrid" && Number(snapshot.sceneVersion || 1) >= 2);
  if (!useChromium) {
    return renderBulkImage(snapshot, values);
  }
  try {
    const chromiumOutput = await renderBulkImageInChromium(snapshot, values);
    return sharp(chromiumOutput).png({ compressionLevel: 9 }).toBuffer();
  } catch (error) {
    const now = Date.now();
    if (now - lastChromiumFallbackLogAt > 30_000) {
      lastChromiumFallbackLogAt = now;
      console.warn(
        "[BulkCreate] Chromium render failed, falling back to Sharp:",
        error instanceof Error ? error.message : error
      );
    }
    return renderBulkImage(snapshot, values);
  }
}

function clampOverlay(value: number, canvasSize: number) {
  return Math.min(Math.max(0, value), Math.max(0, canvasSize - 1));
}

export const bulkCreateRendererService = {
  renderBulkImage: renderBulkImageOptimized,
  renderBulkImageWithSharp: renderBulkImage,
};
