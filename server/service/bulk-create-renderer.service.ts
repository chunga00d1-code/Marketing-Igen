import {
  BULK_FONT_FAMILIES,
  IBulkLayer,
  IBulkRenderJob,
} from "../interface/bulk-create.interface";
import { renderBulkImageInChromium } from "./bulk-create-chromium-renderer.service";

const MAX_ASSET_BYTES = 10 * 1024 * 1024;
const DEFAULT_ALLOWED_HOSTS = ["res.cloudinary.com"];
const IMAGE_CACHE_TTL_MS = 5 * 60 * 1000;
const configuredImageCacheMb = Number(process.env.BULK_CREATE_IMAGE_CACHE_MB || 64);
const MAX_IMAGE_CACHE_BYTES = Math.min(
  128 * 1024 * 1024,
  Math.max(
    16 * 1024 * 1024,
    (Number.isFinite(configuredImageCacheMb) ? configuredImageCacheMb : 64) * 1024 * 1024
  )
);
const imageCache = new Map<string, { buffer: Buffer; expiresAt: number }>();
const pendingImages = new Map<string, Promise<Buffer>>();
let imageCacheBytes = 0;
type SharpFactory = typeof import("sharp")["default"];
let sharpPromise: Promise<SharpFactory> | null = null;

function getSharp() {
  if (!sharpPromise) {
    sharpPromise = import("sharp")
      .then((module) => module.default)
      .catch((error) => {
        sharpPromise = null;
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Không thể nạp Sharp/libvips trên máy render. Hãy cài optional dependencies đúng runtime (${detail}).`
        );
      });
  }
  return sharpPromise;
}

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

export function assertSafeBulkImageSource(source: string) {
  const dataBuffer = parseDataUrl(source);
  if (dataBuffer) return;

  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error("Đường dẫn ảnh không hợp lệ.");
  }
  if (url.protocol !== "https:") throw new Error("Ảnh bên ngoài phải sử dụng HTTPS.");
  const allowedHosts = getAllowedHosts();
  const isAllowed = [...allowedHosts].some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`)
  );
  if (!isAllowed) throw new Error(`Tên miền ảnh ${url.hostname} chưa được cho phép.`);
}

function cachedImage(source: string) {
  const cached = imageCache.get(source);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    imageCache.delete(source);
    imageCacheBytes = Math.max(0, imageCacheBytes - cached.buffer.length);
    return null;
  }
  imageCache.delete(source);
  imageCache.set(source, cached);
  return cached.buffer;
}

function cacheImage(source: string, buffer: Buffer) {
  if (buffer.length > MAX_IMAGE_CACHE_BYTES) return;
  const previous = imageCache.get(source);
  if (previous) imageCacheBytes = Math.max(0, imageCacheBytes - previous.buffer.length);
  imageCache.delete(source);
  imageCache.set(source, {
    buffer,
    expiresAt: Date.now() + IMAGE_CACHE_TTL_MS,
  });
  imageCacheBytes += buffer.length;
  while (imageCacheBytes > MAX_IMAGE_CACHE_BYTES && imageCache.size > 0) {
    const oldestKey = imageCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    const oldest = imageCache.get(oldestKey);
    imageCache.delete(oldestKey);
    imageCacheBytes = Math.max(0, imageCacheBytes - (oldest?.buffer.length || 0));
  }
}

async function loadImage(source: string): Promise<Buffer> {
  const dataBuffer = parseDataUrl(source);
  if (dataBuffer) return dataBuffer;

  assertSafeBulkImageSource(source);
  const cached = cachedImage(source);
  if (cached) return cached;

  let pending = pendingImages.get(source);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(new URL(source), {
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Không thể tải ảnh (${response.status}).`);
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > MAX_ASSET_BYTES) throw new Error("Ảnh vượt quá giới hạn 10 MB.");
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > MAX_ASSET_BYTES) throw new Error("Ảnh vượt quá giới hạn 10 MB.");
      cacheImage(source, buffer);
      return buffer;
    })();
    pendingImages.set(source, pending);
  }
  try {
    return await pending;
  } finally {
    if (pendingImages.get(source) === pending) pendingImages.delete(source);
  }
}

function normalizeColor(color: string | undefined, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(String(color || "")) ? String(color) : fallback;
}

export function resolveBulkSourceCropPixels(
  crop: NonNullable<IBulkLayer['sourceCrop']>,
  sourceWidth: number,
  sourceHeight: number
) {
  const left = Math.min(sourceWidth - 1, Math.max(0, Math.floor(sourceWidth * crop.x / 100)));
  const top = Math.min(sourceHeight - 1, Math.max(0, Math.floor(sourceHeight * crop.y / 100)));
  const right = Math.min(sourceWidth, Math.max(left + 1, Math.ceil(sourceWidth * (crop.x + crop.width) / 100)));
  const bottom = Math.min(sourceHeight, Math.max(top + 1, Math.ceil(sourceHeight * (crop.y + crop.height) / 100)));
  return { left, top, width: right - left, height: bottom - top };
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
  const padding = Math.max(0, Math.round(layer.padding || 0));
  const contentWidth = Math.max(1, width - padding * 2);
  const contentHeight = Math.max(1, height - padding * 2);
  let lines = wrapText(renderedValue, Math.max(4, Math.floor(contentWidth / (fontSize * 0.58 + letterSpacing))));
  while (fontSize > 8 && lines.length * fontSize * lineHeightRatio > contentHeight) {
    fontSize -= 1;
    lines = wrapText(renderedValue, Math.max(4, Math.floor(contentWidth / (fontSize * 0.58 + letterSpacing))));
  }
  const align = layer.textAlign || "left";
  const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
  const x = align === "center" ? width / 2 : align === "right" ? width - padding : padding;
  const lineHeight = fontSize * lineHeightRatio;
  const visibleLines = lines.slice(0, Math.max(1, Math.floor(contentHeight / lineHeight)));
  const verticallyCentered =
    layer.layerKind === "badge" || layer.layerKind === "cta" || layer.layerKind === "icon";
  const firstBaseline = verticallyCentered
    ? Math.max(fontSize, (height - visibleLines.length * lineHeight) / 2 + fontSize)
    : padding + fontSize;
  const supportedFonts = new Set<string>(BULK_FONT_FAMILIES);
  const fontFamily = supportedFonts.has(layer.fontFamily || "") ? layer.fontFamily! : "DejaVu Sans";
  const color = normalizeColor(layer.color, "#ffffff");
  const fill = layer.fillColor ? normalizeColor(layer.fillColor, "transparent") : "transparent";
  const stroke = layer.borderWidth && layer.borderColor
    ? normalizeColor(layer.borderColor, color)
    : "none";
  const radius = Math.max(0, Math.min(Math.min(width, height), layer.borderRadius || 0));
  const opacity = Number.isFinite(layer.opacity) ? Math.max(0.05, Math.min(1, layer.opacity || 1)) : 1;
  const textStrokeWidth = Math.max(0, Math.min(20, layer.textStrokeWidth || 0));
  const textStroke = textStrokeWidth > 0
    ? normalizeColor(layer.textStrokeColor, color)
    : "none";
  const textShadowBlur = Math.max(0, Math.min(40, layer.textShadowBlur || 0));
  const textShadowColor = normalizeColor(layer.textShadowColor, color);
  const glowDefs = textShadowBlur > 0
    ? `<defs><filter id="text-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceAlpha" stdDeviation="${textShadowBlur}" result="blur"/><feFlood flood-color="${textShadowColor}" result="glow-color"/><feComposite in="glow-color" in2="blur" operator="in" result="glow"/><feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`
    : "";
  const textFilter = textShadowBlur > 0 ? "url(#text-glow)" : "";
  const text = visibleLines.map((line, index) => (
    `<text x="${x}" y="${firstBaseline + index * lineHeight}" text-anchor="${anchor}"${textFilter ? ` filter="${textFilter}"` : ""}>${escapeXml(line)}</text>`
  )).join("");
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${glowDefs}<style>text{font-family:'${fontFamily}',Arial,sans-serif;font-size:${fontSize}px;font-weight:${layer.fontWeight || 700};font-style:${layer.fontStyle || "normal"};text-decoration:${layer.textDecoration || "none"};letter-spacing:${letterSpacing}px;fill:${color};stroke:${textStroke};stroke-width:${textStrokeWidth}px;paint-order:stroke fill;stroke-linejoin:round;}</style><g opacity="${opacity}"><rect width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${layer.borderWidth || 0}"/>${text}</g></svg>`);
}

function renderShapeLayer(layer: IBulkLayer, width: number, height: number) {
  const fill = normalizeColor(layer.fillColor, "#e2e8f0");
  const stroke = layer.borderWidth && layer.borderColor
    ? normalizeColor(layer.borderColor, "#0f172a")
    : "none";
  const radius = Math.max(0, Math.min(Math.min(width, height), layer.borderRadius || 0));
  const opacity = Number.isFinite(layer.opacity) ? Math.max(0.05, Math.min(1, layer.opacity || 1)) : 1;
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${layer.borderWidth || 0}" opacity="${opacity}"/></svg>`
  );
}

async function createBackground(snapshot: IBulkRenderJob["templateSnapshot"]) {
  const sharp = await getSharp();
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
  const sharp = await getSharp();
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
    if (!value && layer.layerKind !== "shape") {
      throw new Error(`Thiếu dữ liệu cho trường '${layer.fieldName}'.`);
    }
    const targetWidth = Math.max(1, Math.round(canvasWidth * layer.width / 100));
    const targetHeight = Math.max(1, Math.round(canvasHeight * layer.height / 100));
    const left = Math.round(canvasWidth * layer.x / 100);
    const top = Math.round(canvasHeight * layer.y / 100);

    let input: Buffer;
    const isShapeImage = layer.layerKind === "shape" && Boolean(value);
    if (layer.layerKind === "shape" && !isShapeImage) {
      input = renderShapeLayer(layer, targetWidth, targetHeight);
    } else if (layer.type === "image" || isShapeImage) {
      const source = await loadImage(value);
      let image = sharp(source);
      if (layer.sourceCrop) {
        const metadata = await image.metadata();
        if (!metadata.width || !metadata.height) throw new Error('Không thể đọc kích thước ảnh nguồn để crop.');
        image = sharp(source).extract(resolveBulkSourceCropPixels(
          layer.sourceCrop,
          metadata.width,
          metadata.height
        ));
      }
      input = await image
        .resize(targetWidth, targetHeight, { fit: layer.fit || (isShapeImage ? "cover" : "contain"), background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

      const radius = Math.max(0, Math.min(Math.min(targetWidth, targetHeight) / 2, layer.borderRadius || 0));
      if (radius > 0) {
        const svgQuote = String.fromCharCode(34);
        const roundedMask = Buffer.from(
          '<svg width=' + svgQuote + targetWidth + svgQuote + ' height=' + svgQuote + targetHeight + svgQuote + ' xmlns=' + svgQuote + 'http://www.w3.org/2000/svg' + svgQuote + '><rect width=' + svgQuote + targetWidth + svgQuote + ' height=' + svgQuote + targetHeight + svgQuote + ' rx=' + svgQuote + radius + svgQuote + ' fill=' + svgQuote + '#ffffff' + svgQuote + '/></svg>'
        );
        input = await sharp(input)
          .composite([{ input: roundedMask, blend: 'dest-in' }])
          .png()
          .toBuffer();
      }
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
    return await renderBulkImageInChromium(snapshot, values);
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
