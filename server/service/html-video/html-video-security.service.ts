import sanitizeHtml from "sanitize-html";

export type HtmlVideoAspectRatio = "16:9" | "9:16" | "1:1";
export type HtmlVideoResolution = "720p" | "1080p";

export type HtmlVideoAssetRole = "background" | "hero" | "logo" | "overlay";

export type HtmlVideoAsset = {
  id: string;
  name: string;
  kind: "image";
  url: string;
  role?: HtmlVideoAssetRole;
  includeInVideo?: boolean;
};

export type HtmlVideoSource = {
  html: string;
  css: string;
  durationSeconds: number;
  aspectRatio: HtmlVideoAspectRatio;
  resolution: HtmlVideoResolution;
  assets?: HtmlVideoAsset[];
};

export type SafeHtmlVideoComposition = {
  sanitizedHtml: string;
  sanitizedCss: string;
  compositionHtml: string;
  width: number;
  height: number;
};

const maximumSourceBytes = 100 * 1024;
const maximumAssetCount = 6;
const mediaSlotAttribute = "data-media-slot";
const allowedTags = new Set([
  "article",
  "aside",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "i",
  "li",
  "main",
  "ol",
  "p",
  "pre",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
  "ul",
]);
const forbiddenAttributes =
  /\s(?:on[a-z0-9_-]*|style|href|src|srcset|poster|cite|action|formaction|background|xlink:href)\s*=/i;
const allowedAttributes = {
  "*": ["id", "class", "role", "title", "aria-label", "aria-hidden", mediaSlotAttribute],
};
const dimensions = {
  "16:9": { "720p": [1280, 720], "1080p": [1920, 1080] },
  "9:16": { "720p": [720, 1280], "1080p": [1080, 1920] },
  "1:1": { "720p": [720, 720], "1080p": [1080, 1080] },
} as const;

function assertSourceSize(value: string, label: "HTML" | "CSS") {
  if (Buffer.byteLength(value, "utf8") > maximumSourceBytes) {
    throw new Error(`${label} vượt quá 100 KiB.`);
  }
}

function normalizeHtml(value: string) {
  if (!value.trim()) {
    throw new Error("HTML không được để trống.");
  }
  assertSourceSize(value, "HTML");

  if (/<![^-]/i.test(value) || forbiddenAttributes.test(value)) {
    throw new Error("HTML chứa nội dung không được phép.");
  }

  const tagPattern = /<\/?\s*([a-z][a-z0-9-]*)\b/gi;
  for (const match of value.matchAll(tagPattern)) {
    if (!allowedTags.has(match[1].toLowerCase())) {
      throw new Error("HTML chứa nội dung không được phép.");
    }
  }

  return sanitizeHtml(value, {
    allowedTags: [...allowedTags],
    allowedAttributes,
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
  }).trim();
}

function escapeHtmlAttribute(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeAssets(value: unknown): HtmlVideoAsset[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximumAssetCount) {
    throw new Error("Số lượng ảnh tham chiếu không hợp lệ.");
  }
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== "object") {
      throw new Error("Ảnh tham chiếu không hợp lệ.");
    }
    const asset = candidate as Partial<HtmlVideoAsset>;
    const id = String(asset.id || "").trim();
    const url = String(asset.url || "").trim();
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || !url || url.length > 120_000) {
      throw new Error("Ảnh tham chiếu không hợp lệ.");
    }
    const isInlineImage = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(url);
    if (!isInlineImage) {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        throw new Error("URL ảnh tham chiếu không hợp lệ.");
      }
      if (
        parsedUrl.protocol !== "https:" ||
        parsedUrl.hostname !== "res.cloudinary.com" ||
        !parsedUrl.pathname.includes("/image/upload/") ||
        !parsedUrl.pathname.includes("/igen_erp/html-video-references/")
      ) {
        throw new Error("Ảnh tham chiếu phải được lưu trong kho Cloudinary được phép.");
      }
    }
    return {
      id,
      name: String(asset.name || "Ảnh tham chiếu").trim().slice(0, 180),
      kind: "image",
      url,
      role: asset.role,
      includeInVideo: asset.includeInVideo !== false,
    };
  });
}

function injectMediaAssets(html: string, assets: HtmlVideoAsset[]) {
  let result = html;
  for (const asset of assets.filter((item) => item.includeInVideo !== false)) {
    const slotPattern = new RegExp(
      `<([a-z][a-z0-9-]*)\\b[^>]*\\s${mediaSlotAttribute}=["']${escapeRegExp(asset.id)}["'][^>]*>\\s*<\\/\\1>`,
      "gi"
    );
    const role = asset.role || "hero";
    const image = `<div class="html-video-media-slot html-video-media-slot-${role}" ${mediaSlotAttribute}="${escapeHtmlAttribute(asset.id)}"><img src="${escapeHtmlAttribute(asset.url)}" alt="${escapeHtmlAttribute(asset.name)}" /></div>`;
    const hadSlot = slotPattern.test(result);
    slotPattern.lastIndex = 0;
    result = result.replace(slotPattern, image);
    if (!hadSlot) {
      const fallbackSlot = `<div ${mediaSlotAttribute}="${escapeHtmlAttribute(asset.id)}"></div>`;
      result = /<\/main\s*>/i.test(result)
        ? result.replace(/<\/main\s*>/i, `${fallbackSlot}</main>`)
        : `${fallbackSlot}${result}`;
      result = result.replace(slotPattern, image);
    }
  }
  return result;
}

function normalizeCss(value: string) {
  assertSourceSize(value, "CSS");
  const withoutComments = value.replace(/\/\*[\s\S]*?\*\//g, "");
  const forbiddenCss =
    /@import\b|url\s*\(|expression\s*\(|javascript\s*:|-moz-binding\s*:|behavior\s*:|<|>|\\/i;
  const unsupportedAtRule = /@(?!keyframes\b|-webkit-keyframes\b)/i;
  if (forbiddenCss.test(withoutComments) || unsupportedAtRule.test(withoutComments)) {
    throw new Error("CSS chứa nội dung không được phép.");
  }
  return withoutComments.trim();
}

function assertSettings(source: HtmlVideoSource) {
  if (
    !Number.isInteger(source.durationSeconds) ||
    source.durationSeconds < 1 ||
    source.durationSeconds > 180
  ) {
    throw new Error("Thời lượng phải là số nguyên từ 1 đến 180 giây.");
  }
  if (!(source.aspectRatio in dimensions)) {
    throw new Error("Tỷ lệ video không được hỗ trợ.");
  }
  if (source.resolution !== "720p" && source.resolution !== "1080p") {
    throw new Error("Độ phân giải video không được hỗ trợ.");
  }
}

export function buildSafeHtmlVideoComposition(
  source: HtmlVideoSource
): SafeHtmlVideoComposition {
  assertSettings(source);
  const assets = normalizeAssets(source.assets);
  const sanitizedHtml = injectMediaAssets(normalizeHtml(source.html), assets);
  const sanitizedCss = normalizeCss(source.css);
  const [width, height] = dimensions[source.aspectRatio][source.resolution];
  const mediaCss = assets.length > 0
    ? ".html-video-media-slot{position:relative;display:block;overflow:hidden;z-index:0;pointer-events:none}.html-video-media-slot img{display:block;width:100%;height:100%;object-fit:contain;object-position:center}.html-video-media-slot.html-video-media-slot-background{position:absolute;inset:0;width:100%;height:100%;z-index:0}.html-video-media-slot.html-video-media-slot-hero{position:relative!important;inset:auto!important;width:72%!important;height:46%!important;max-width:78%!important;max-height:48%!important;margin:3% auto!important;z-index:0;flex:0 0 auto}.html-video-media-slot-hero img{filter:drop-shadow(0 24px 28px rgba(15,23,42,.2))}.html-video-media-slot.html-video-media-slot-logo{position:absolute;top:6%;right:7%;width:28%;height:14%;max-height:18%;z-index:3}.html-video-media-slot.html-video-media-slot-overlay{position:absolute;inset:0;width:100%;height:100%;z-index:2}"
    : "";

  const compositionHtml = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${width},height=${height},initial-scale=1">
  <style>
    html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#f1f5f9}
    *{box-sizing:border-box}
    #html-video-root{position:relative;width:${width}px;height:${height}px;overflow:hidden;background:linear-gradient(135deg,#e0f2fe 0%,#f8fafc 46%,#e0e7ff 100%);color:#0f172a;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    ${sanitizedCss}
    ${mediaCss}
  </style>
</head>
<body>
  <div id="html-video-root"
    data-composition-id="html-video"
    data-width="${width}"
    data-height="${height}"
    data-start="0"
    data-duration="${source.durationSeconds}"
    data-no-timeline>${sanitizedHtml}</div>
</body>
</html>`;

  return {
    sanitizedHtml,
    sanitizedCss,
    compositionHtml,
    width,
    height,
  };
}
