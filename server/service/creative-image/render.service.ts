import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { cloudinaryService } from "../cloudinary.service";
import { renderHtmlImageInChromium } from "../bulk-create-chromium-renderer.service";

type RendererModule = typeof import("@remotion/renderer");
type BundlerModule = typeof import("@remotion/bundler");

let cachedBundle: { location: string; createdAt: number } | null = null;
const BUNDLE_CACHE_TTL_MS = 60 * 60 * 1000;

async function loadRemotion() {
  const [renderer, bundler] = await Promise.all([
    import("@remotion/renderer"),
    import("@remotion/bundler"),
  ]);
  return { renderer: renderer as RendererModule, bundler: bundler as BundlerModule };
}

async function getBundle(bundler: BundlerModule) {
  if (cachedBundle && Date.now() - cachedBundle.createdAt < BUNDLE_CACHE_TTL_MS) {
    const bundlePath = cachedBundle.location.startsWith("file://") ? cachedBundle.location.slice(7) : cachedBundle.location;
    if (fs.existsSync(bundlePath)) return cachedBundle.location;
  }
  const location = await bundler.bundle(path.join(process.cwd(), "server/remotion/creative-image-entry.tsx"));
  cachedBundle = { location, createdAt: Date.now() };
  return location;
}

export async function renderCreativeImage(input: {
  renderId: string;
  companyCode: string;
  templateId: string;
  canvas: { format: string; width: number; height: number };
  data: Record<string, string>;
}) {
  const { renderer, bundler } = await loadRemotion();
  const serveUrl = await getBundle(bundler);
  const output = path.join(os.tmpdir(), `creative-image-${input.renderId}.png`);
  try {
    const composition = await renderer.selectComposition({
      serveUrl,
      id: "creative-image",
      inputProps: { templateId: input.templateId, canvas: input.canvas, data: input.data },
    });
    await renderer.renderStill({
      composition,
      serveUrl,
      output,
      inputProps: { templateId: input.templateId, canvas: input.canvas, data: input.data },
      imageFormat: "png",
      chromiumOptions: { gl: "swiftshader", enableMultiProcessOnLinux: true },
      timeoutInMilliseconds: 180_000,
    });
    const buffer = await fs.promises.readFile(output);
    return cloudinaryService.uploadMediaBuffer(buffer, `igen_erp/creative-image/${input.companyCode}/${input.renderId}`, "output");
  } finally {
    await fs.promises.unlink(output).catch(() => undefined);
  }
}

export async function renderAiHtmlImage(input: {
  renderId: string;
  companyCode: string;
  canvas: { width: number; height: number };
  html: string;
}) {
  const buffer = await renderHtmlImageInChromium(input.html, input.canvas);
  return cloudinaryService.uploadMediaBuffer(
    buffer,
    `igen_erp/creative-image/${input.companyCode}/${input.renderId}`,
    "output"
  );
}
