import sanitizeHtml from "sanitize-html";

export type HtmlVideoAspectRatio = "16:9" | "9:16" | "1:1";
export type HtmlVideoResolution = "720p" | "1080p";

export type HtmlVideoSource = {
  html: string;
  css: string;
  durationSeconds: number;
  aspectRatio: HtmlVideoAspectRatio;
  resolution: HtmlVideoResolution;
};

export type SafeHtmlVideoComposition = {
  sanitizedHtml: string;
  sanitizedCss: string;
  compositionHtml: string;
  width: number;
  height: number;
};

const maximumSourceBytes = 100 * 1024;
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
  "*": ["id", "class", "role", "title", "aria-label", "aria-hidden"],
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
    source.durationSeconds > 60
  ) {
    throw new Error("Thời lượng phải là số nguyên từ 1 đến 60 giây.");
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
  const sanitizedHtml = normalizeHtml(source.html);
  const sanitizedCss = normalizeCss(source.css);
  const [width, height] = dimensions[source.aspectRatio][source.resolution];

  const compositionHtml = `<!doctype html>
<html data-composition-id="html-video" data-composition-duration="${source.durationSeconds}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${width},height=${height},initial-scale=1">
  <style>
    html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#000}
    *{box-sizing:border-box}
    #html-video-root{position:relative;width:${width}px;height:${height}px;overflow:hidden}
    ${sanitizedCss}
  </style>
</head>
<body>
  <div id="html-video-root">${sanitizedHtml}</div>
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
