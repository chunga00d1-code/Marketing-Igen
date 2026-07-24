import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openBrowser, type HeadlessBrowser } from "@remotion/renderer";
import {
  SceneCanvas,
  type BulkSceneDocument,
} from "../../src/components/content-studio/bulk-create/SceneCanvas";
import type { IBulkRenderJob } from "../interface/bulk-create.interface";

const configuredRenderConcurrency = Number(
  process.env.BULK_CREATE_CHROMIUM_CONCURRENCY || 2
);
const configuredRenderTimeout = Number(
  process.env.BULK_CREATE_CHROMIUM_TIMEOUT_MS || 30_000
);
const MAX_RENDER_CONCURRENCY = Number.isFinite(configuredRenderConcurrency)
  ? Math.min(4, Math.max(1, Math.floor(configuredRenderConcurrency)))
  : 2;
const RENDER_TIMEOUT_MS = Number.isFinite(configuredRenderTimeout)
  ? Math.min(60_000, Math.max(5_000, Math.floor(configuredRenderTimeout)))
  : 30_000;
const MAX_DATA_URL_LENGTH = 14_000_000;
const DEFAULT_ALLOWED_HOSTS = ["res.cloudinary.com"];
const GOOGLE_FONT_CSS_URLS = [
  "https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Inter:ital,wght@0,300..900;1,300..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&family=Space+Grotesk:wght@300..700&family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Lobster&family=Oswald:wght@200..700&family=Pacifico&family=Raleway:ital,wght@0,100..900;1,100..900&family=Roboto:ital,wght@0,100..900;1,100..900&family=Bebas+Neue&family=Dancing+Script:wght@400..700&family=Poppins:ital,wght@0,100..900;1,100..900&family=Lora:ital,wght@0,400..700;1,400..700&family=Permanent+Marker&family=Abril+Fatface&family=Righteous&family=Caveat:wght@400..700&family=Fredoka:wght@300..700&display=swap",
  "https://fonts.googleapis.com/css2?family=Anton&family=Manrope:wght@200..800&family=Merriweather:ital,wght@0,300..900;1,300..900&family=Noto+Sans:ital,wght@0,100..900;1,100..900&family=Noto+Serif:ital,wght@0,200..900;1,200..900&family=Nunito:ital,wght@0,200..1000;1,200..1000&family=Quicksand:wght@300..700&family=Sora:wght@100..800&display=swap",
];

let browserPromise: Promise<HeadlessBrowser> | null = null;
let activeRenders = 0;
let pageIndex = 0;
const renderWaiters: Array<() => void> = [];

function getAllowedHosts() {
  const configured = String(process.env.BULK_CREATE_ALLOWED_IMAGE_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_HOSTS, ...configured]);
}

function assertSafeImageSource(source: string) {
  if (!source) return;
  if (source.startsWith("data:image/")) {
    if (source.length > MAX_DATA_URL_LENGTH) {
      throw new Error("Ảnh nhúng vượt quá giới hạn cho phép.");
    }
    return;
  }
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error("Đường dẫn ảnh không hợp lệ.");
  }
  if (url.protocol !== "https:") {
    throw new Error("Ảnh bên ngoài phải sử dụng HTTPS.");
  }
  const allowedHosts = getAllowedHosts();
  const allowed = [...allowedHosts].some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`)
  );
  if (!allowed) {
    throw new Error(`Tên miền ảnh ${url.hostname} chưa được phép render.`);
  }
}

function validateSceneAssets(
  snapshot: IBulkRenderJob["templateSnapshot"],
  values: Record<string, string>
) {
  if (snapshot.background.type === "image") {
    assertSafeImageSource(snapshot.background.imageUrl || "");
  }
  for (const layer of snapshot.layers) {
    if (layer.type !== "image") continue;
    assertSafeImageSource(
      String(values[layer.id] ?? values[layer.fieldName] ?? layer.defaultValue ?? "")
    );
  }
}

async function acquireRenderSlot() {
  if (activeRenders >= MAX_RENDER_CONCURRENCY) {
    await new Promise<void>((resolve) => renderWaiters.push(resolve));
  }
  activeRenders += 1;
}

function releaseRenderSlot() {
  activeRenders = Math.max(0, activeRenders - 1);
  renderWaiters.shift()?.();
}

function getBrowser() {
  if (!browserPromise) {
    browserPromise = openBrowser("chrome", {
      browserExecutable:
        process.env.BULK_CREATE_CHROME_EXECUTABLE ||
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        null,
      chromeMode: "headless-shell",
      logLevel: "error",
      forceDeviceScaleFactor: 1,
      chromiumOptions: {
        enableMultiProcessOnLinux: true,
        gl: "swiftshader",
      },
    }).catch((error) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
}

function buildHtml(
  snapshot: IBulkRenderJob["templateSnapshot"],
  values: Record<string, string>
) {
  const scene = {
    sceneVersion: snapshot.sceneVersion || 1,
    canvas: snapshot.canvas,
    background: snapshot.background,
    layers: snapshot.layers,
  } as BulkSceneDocument;
  const markup = renderToStaticMarkup(
    React.createElement(SceneCanvas, { scene, values })
  );
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="light" />
    ${GOOGLE_FONT_CSS_URLS.map((url) => `<link rel="stylesheet" href="${url}" />`).join("")}
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
      body { -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision; }
      img { display: block; }
    </style>
  </head>
  <body>${markup}</body>
</html>`;
}

export async function renderBulkImageInChromium(
  snapshot: IBulkRenderJob["templateSnapshot"],
  values: Record<string, string>
) {
  validateSceneAssets(snapshot, values);
  await acquireRenderSlot();
  let page: Awaited<ReturnType<HeadlessBrowser["newPage"]>> | null = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage({
      context: () => null,
      logLevel: "error",
      indent: false,
      pageIndex: pageIndex++,
      onBrowserLog: null,
      onLog: () => undefined,
    });
    page.setDefaultTimeout(RENDER_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(RENDER_TIMEOUT_MS);
    await page.setViewport({
      width: snapshot.canvas.width,
      height: snapshot.canvas.height,
      deviceScaleFactor: 1,
    });
    await page.goto({ url: "about:blank", timeout: RENDER_TIMEOUT_MS });
    const html = buildHtml(snapshot, values);
    await page.evaluate((documentHtml) => {
      document.open();
      document.write(documentHtml);
      document.close();
    }, html);
    await page.evaluate(async () => {
      await Promise.race([
        (async () => {
          await document.fonts.ready;
          const images = Array.from(document.images);
          await Promise.all(
            images.map((image) => {
              if (image.complete && image.naturalWidth > 0) return Promise.resolve();
              if (image.complete) return Promise.reject(new Error("Không thể tải ảnh layer."));
              return new Promise<void>((resolve, reject) => {
                image.addEventListener("load", () => resolve(), { once: true });
                image.addEventListener(
                  "error",
                  () => reject(new Error("Không thể tải ảnh layer.")),
                  { once: true }
                );
              });
            })
          );
        })(),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error("Hết thời gian chờ font hoặc ảnh.")), 20_000)
        ),
      ]);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
    });
    const screenshot = await page._client().send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    return Buffer.from(screenshot.value.data, "base64");
  } finally {
    await page?.close().catch(() => undefined);
    releaseRenderSlot();
  }
}

export const bulkCreateChromiumRendererService = {
  renderBulkImageInChromium,
};
