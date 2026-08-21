import sanitizeHtml from "sanitize-html";
import type { HtmlVideoScenePlanItem } from "../../interface/html-video-pipeline.interface";

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
  scenePlan?: HtmlVideoScenePlanItem[];
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
  return withoutComments
    .replace(/-apple-system/gi, "sans-serif")
    .replace(/BlinkMacSystemFont/gi, "sans-serif")
    .trim();
}

function annotateVideoScenes(html: string) {
  let sceneCount = 0;
  const annotatedHtml = html.replace(
    /<([a-z][a-z0-9-]*)\b([^>]*)>/gi,
    (tag, _name: string, attributes: string) => {
      const className = /\bclass="([^"]*)"/i.exec(attributes)?.[1] || "";
      if (!className.split(/\s+/).includes("scene")) return tag;
      const sceneIndex = sceneCount;
      sceneCount += 1;
      return tag.replace(/>$/, ` data-html-video-scene="${sceneIndex}">`);
    }
  );
  return { annotatedHtml, sceneCount };
}

type NormalizedSceneMetadata = {
  startSeconds: number;
  endSeconds: number;
  purpose: "opening" | "content" | "closing";
  transition: "crossfade" | "slide-left" | "slide-right";
};

function normalizeSceneRanges(
  sceneCount: number,
  durationSeconds: number,
  scenePlan?: HtmlVideoScenePlanItem[]
): NormalizedSceneMetadata[] {
  if (!scenePlan) {
    const interval = durationSeconds / Math.max(1, sceneCount);
    return Array.from({ length: sceneCount }, (_, index) => ({
      startSeconds: index * interval,
      endSeconds: (index + 1) * interval,
      purpose: index === 0 ? "opening" : index === sceneCount - 1 ? "closing" : "content",
      transition: "crossfade",
    }));
  }
  if (scenePlan.length !== sceneCount) {
    throw new Error("Scene plan does not match the generated scene count.");
  }
  let previousEnd = 0;
  const ids = new Set<string>();
  const ranges = scenePlan.map((scene, index): NormalizedSceneMetadata => {
    if (
      !scene ||
      typeof scene.id !== "string" ||
      !scene.id ||
      ids.has(scene.id) ||
      scene.order !== index ||
      !Number.isFinite(scene.startSeconds) ||
      !Number.isFinite(scene.endSeconds) ||
      Math.abs(scene.startSeconds - previousEnd) > 0.05 ||
      scene.endSeconds <= scene.startSeconds ||
      scene.endSeconds > durationSeconds + 0.05
    ) {
      throw new Error("Scene plan timing is invalid.");
    }
    ids.add(scene.id);
    previousEnd = scene.endSeconds;
    const purpose = scene.purpose === "opening" || scene.purpose === "closing" || scene.purpose === "content"
      ? scene.purpose
      : (index === 0 ? "opening" : index === sceneCount - 1 ? "closing" : "content");
    const transition = scene.transition === "slide-left" || scene.transition === "slide-right"
      ? scene.transition
      : "crossfade";
    return {
      startSeconds: scene.startSeconds,
      endSeconds: scene.endSeconds,
      purpose,
      transition,
    };
  });
  if (Math.abs(previousEnd - durationSeconds) > 0.05) {
    throw new Error("Scene plan does not cover the complete video duration.");
  }
  return ranges;
}

function buildSceneIsolationCss(
  sceneCount: number,
  durationSeconds: number,
  scenePlan?: HtmlVideoScenePlanItem[]
) {
  if (sceneCount < 2) return "";
  const ranges = normalizeSceneRanges(sceneCount, durationSeconds, scenePlan);
  const rules = [
    ".scene-deck{position:relative!important;inset:0!important;width:100%!important;height:100%!important;overflow:hidden!important}",
    `[data-html-video-scene]{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;overflow:hidden!important;opacity:0;visibility:hidden;pointer-events:none!important;animation-duration:${durationSeconds}s!important;animation-delay:0s!important;animation-direction:normal!important;animation-play-state:running!important;animation-timing-function:linear!important;animation-iteration-count:1!important;animation-fill-mode:both!important}`,
  ];

  for (let index = 0; index < sceneCount; index += 1) {
    const range = ranges[index];
    const start = (range.startSeconds / durationSeconds) * 100;
    const end = (range.endSeconds / durationSeconds) * 100;
    const interval = end - start;
    const fadePercent = Math.min(interval * 0.12, (0.35 / durationSeconds) * 100);
    const startIn = Math.min(end - 0.01, start + fadePercent);
    const endOut = Math.max(start + 0.01, end - fadePercent);

    let frames: string;
    if (range.transition === "slide-left") {
      if (index === 0) {
        frames = `0%,${endOut.toFixed(4)}%{opacity:1;visibility:visible;transform:translateX(0)}${end.toFixed(4)}%,100%{opacity:0;visibility:hidden;transform:translateX(-60px)}`;
      } else if (index === sceneCount - 1) {
        frames = `0%,${start.toFixed(4)}%{opacity:0;visibility:hidden;transform:translateX(60px)}${startIn.toFixed(4)}%,100%{opacity:1;visibility:visible;transform:translateX(0)}`;
      } else {
        frames = `0%,${start.toFixed(4)}%{opacity:0;visibility:hidden;transform:translateX(60px)}${startIn.toFixed(4)}%,${endOut.toFixed(4)}%{opacity:1;visibility:visible;transform:translateX(0)}${end.toFixed(4)}%,100%{opacity:0;visibility:hidden;transform:translateX(-60px)}`;
      }
    } else if (range.transition === "slide-right") {
      if (index === 0) {
        frames = `0%,${endOut.toFixed(4)}%{opacity:1;visibility:visible;transform:translateX(0)}${end.toFixed(4)}%,100%{opacity:0;visibility:hidden;transform:translateX(60px)}`;
      } else if (index === sceneCount - 1) {
        frames = `0%,${start.toFixed(4)}%{opacity:0;visibility:hidden;transform:translateX(-60px)}${startIn.toFixed(4)}%,100%{opacity:1;visibility:visible;transform:translateX(0)}`;
      } else {
        frames = `0%,${start.toFixed(4)}%{opacity:0;visibility:hidden;transform:translateX(-60px)}${startIn.toFixed(4)}%,${endOut.toFixed(4)}%{opacity:1;visibility:visible;transform:translateX(0)}${end.toFixed(4)}%,100%{opacity:0;visibility:hidden;transform:translateX(60px)}`;
      }
    } else {
      if (index === 0) {
        frames = `0%,${endOut.toFixed(4)}%{opacity:1;visibility:visible}${end.toFixed(4)}%,100%{opacity:0;visibility:hidden}`;
      } else if (index === sceneCount - 1) {
        frames = `0%,${start.toFixed(4)}%{opacity:0;visibility:hidden}${startIn.toFixed(4)}%,100%{opacity:1;visibility:visible}`;
      } else {
        frames = `0%,${start.toFixed(4)}%{opacity:0;visibility:hidden}${startIn.toFixed(4)}%,${endOut.toFixed(4)}%{opacity:1;visibility:visible}${end.toFixed(4)}%,100%{opacity:0;visibility:hidden}`;
      }
    }

    const headlineKeyframe = range.purpose === "opening"
      ? `0%,${start.toFixed(4)}%{opacity:0;transform:translateX(-36px) scale(.92);filter:blur(10px)}${Math.min(end - 0.01, start + Math.min(interval * 0.28, (0.8 / durationSeconds) * 100)).toFixed(4)}%{opacity:1;transform:translateX(0) scale(1);filter:blur(0)}${endOut.toFixed(4)}%{opacity:1;transform:translateX(0)}${end.toFixed(4)}%,100%{opacity:0;transform:translateX(20px)}`
      : range.purpose === "closing"
        ? `0%,${start.toFixed(4)}%{opacity:0;transform:scale(1.06);filter:blur(4px)}${Math.min(end - 0.01, start + Math.min(interval * 0.24, (0.7 / durationSeconds) * 100)).toFixed(4)}%{opacity:1;transform:scale(1);filter:blur(0)}${endOut.toFixed(4)}%{opacity:1;transform:scale(1)}${end.toFixed(4)}%,100%{opacity:0;transform:scale(.95)}`
        : `0%,${start.toFixed(4)}%{opacity:0;transform:translateX(-36px);filter:blur(8px)}${Math.min(end - 0.01, start + Math.min(interval * 0.28, (0.8 / durationSeconds) * 100)).toFixed(4)}%{opacity:1;transform:translateX(0);filter:blur(0)}${endOut.toFixed(4)}%{opacity:1;transform:translateX(0)}${end.toFixed(4)}%,100%{opacity:0;transform:translateX(20px)}`;

    rules.push(
      `[data-html-video-scene="${index}"]{animation-name:html-video-scene-${index}!important}`,
      `@keyframes html-video-scene-${index}{${frames}}`,
      `[data-html-video-scene="${index}"] .scene-headline{animation:html-video-scene-${index}-headline ${durationSeconds}s cubic-bezier(.16,1,.3,1) both!important}`,
      `@keyframes html-video-scene-${index}-headline{${headlineKeyframe}}`,
      `[data-html-video-scene="${index}"] .scene-eyebrow{animation:html-video-scene-${index}-eyebrow ${durationSeconds}s cubic-bezier(.16,1,.3,1) both!important}`,
      `@keyframes html-video-scene-${index}-eyebrow{0%,${start.toFixed(4)}%{opacity:0;transform:translateX(-24px) scale(.92)}${Math.min(end - 0.01, start + Math.min(interval * 0.22, (0.6 / durationSeconds) * 100)).toFixed(4)}%{opacity:1;transform:translateX(0) scale(1)}${endOut.toFixed(4)}%{opacity:1;transform:translateX(0)}${end.toFixed(4)}%,100%{opacity:0;transform:translateX(14px)}}`,
      `[data-html-video-scene="${index}"] .scene-body{animation:html-video-scene-${index}-body ${durationSeconds}s cubic-bezier(.16,1,.3,1) both!important}`,
      `@keyframes html-video-scene-${index}-body{0%,${Math.min(end - 0.01, start + (0.12 / durationSeconds) * 100).toFixed(4)}%{opacity:0;transform:translateX(-24px)}${Math.min(end - 0.01, start + Math.min(interval * 0.36, (0.9 / durationSeconds) * 100)).toFixed(4)}%{opacity:1;transform:translateX(0)}${endOut.toFixed(4)}%{opacity:1;transform:translateX(0)}${end.toFixed(4)}%,100%{opacity:0;transform:translateX(14px)}}`,
      `[data-html-video-scene="${index}"] .scene-media{animation:html-video-scene-${index}-media ${durationSeconds}s cubic-bezier(.16,1,.3,1) both!important}`,
      `@keyframes html-video-scene-${index}-media{0%,${start.toFixed(4)}%{opacity:0;transform:scale(.88)}${Math.min(end - 0.01, start + Math.min(interval * 0.32, (0.8 / durationSeconds) * 100)).toFixed(4)}%{opacity:1;transform:scale(1)}${endOut.toFixed(4)}%{opacity:1;transform:scale(1)}${end.toFixed(4)}%,100%{opacity:0;transform:scale(.92)}}`,
      `[data-html-video-scene="${index}"] .scene-cta{animation:html-video-scene-${index}-cta ${durationSeconds}s cubic-bezier(.16,1,.3,1) both!important}`,
      `@keyframes html-video-scene-${index}-cta{0%,${Math.min(end - 0.01, start + (0.18 / durationSeconds) * 100).toFixed(4)}%{opacity:0;transform:scale(.9)}${Math.min(end - 0.01, start + Math.min(interval * 0.3, (0.7 / durationSeconds) * 100)).toFixed(4)}%{opacity:1;transform:scale(1)}${Math.min(end - 0.01, start + Math.min(interval * 0.6, (1.8 / durationSeconds) * 100)).toFixed(4)}%{transform:scale(1.06)}${Math.min(end - 0.01, start + Math.min(interval * 0.85, (2.6 / durationSeconds) * 100)).toFixed(4)}%{transform:scale(1)}${endOut.toFixed(4)}%{opacity:1;transform:scale(1)}${end.toFixed(4)}%,100%{opacity:0;transform:scale(.95)}}`
    );
  }
  return rules.join("");
}

function buildAmbientMotionCss(durationSeconds: number) {
  return [
    `#html-video-root{background-size:140% 140%!important;animation:html-video-background-motion ${durationSeconds}s ease-in-out both!important}`,
    `#html-video-root>:first-child{transform-origin:center center;animation:html-video-root-motion ${durationSeconds}s ease-in-out both!important}`,
    `#html-video-root>:not(.scene-deck) :is(h1,h2,h3,p,li){animation:html-video-content-reveal ${durationSeconds}s cubic-bezier(.16,1,.3,1) both!important}`,
    `#html-video-root .html-video-media-slot img{transform-origin:center center;animation:html-video-media-motion ${durationSeconds}s ease-in-out both!important}`,
    "@keyframes html-video-background-motion{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:35% 50%}}",
    "@keyframes html-video-root-motion{0%{scale:1}45%{scale:1.006}100%{scale:1.012}}",
    "@keyframes html-video-content-reveal{0%{opacity:0;translate:-24px 0;filter:blur(6px)}10%,88%{opacity:1;translate:0 0;filter:blur(0)}100%{opacity:.96;translate:8px 0;filter:blur(0)}}",
    "@keyframes html-video-media-motion{0%{scale:1}50%{scale:1.035}100%{scale:1.015}}",
  ].join("");
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
  const { annotatedHtml, sceneCount } = annotateVideoScenes(sanitizedHtml);
  const [width, height] = dimensions[source.aspectRatio][source.resolution];
  const mediaCss = assets.length > 0
    ? ".html-video-media-slot{position:relative;display:block;overflow:hidden;z-index:0;pointer-events:none}.html-video-media-slot img{display:block;width:100%;height:100%;object-fit:contain;object-position:center}.html-video-media-slot.html-video-media-slot-background{position:absolute;inset:0;width:100%;height:100%;z-index:0}.html-video-media-slot.html-video-media-slot-hero{position:relative!important;inset:auto!important;width:72%!important;height:46%!important;max-width:78%!important;max-height:48%!important;margin:3% auto!important;z-index:0;flex:0 0 auto}.html-video-media-slot-hero img{filter:drop-shadow(0 24px 28px rgba(15,23,42,.2))}.html-video-media-slot.html-video-media-slot-logo{position:absolute;top:6%;right:7%;width:28%;height:14%;max-height:18%;z-index:3}.html-video-media-slot.html-video-media-slot-overlay{position:absolute;inset:0;width:100%;height:100%;z-index:2}"
    : "";
  const sceneIsolationCss = buildSceneIsolationCss(
    sceneCount,
    source.durationSeconds,
    source.scenePlan
  );
  const ambientMotionCss = buildAmbientMotionCss(source.durationSeconds);

  const compositionHtml = `<!doctype html>
<html data-no-timeline>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${width},height=${height},initial-scale=1">
  <style>
    html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#f1f5f9}
    *{box-sizing:border-box}
    #html-video-root{position:relative;width:${width}px;height:${height}px;overflow:hidden;background:linear-gradient(135deg,#e0f2fe 0%,#f8fafc 46%,#e0e7ff 100%);color:#0f172a;font-family:Inter,sans-serif}
    ${sanitizedCss}
    ${mediaCss}
    ${sceneIsolationCss}
    ${ambientMotionCss}
  </style>
</head>
<body>
  <div id="html-video-root"
    data-composition-id="html-video"
    data-width="${width}"
    data-height="${height}"
    data-start="0"
    data-duration="${source.durationSeconds}"
    data-no-timeline>${annotatedHtml}</div>
  <script>window.__timelines = window.__timelines || {};</script>
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
