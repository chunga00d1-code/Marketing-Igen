import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { cloudinaryService } from "../cloudinary.service";

type RemotionRendererModule = typeof import("@remotion/renderer");
type RemotionBundlerModule = typeof import("@remotion/bundler");

// Bundle cache — reuse between renders to save 30-60s of bundling time per render
let _bundleCache: { location: string; entryPoint: string; createdAt: number } | null = null;
const BUNDLE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getOrCreateBundle(
  entryPoint: string,
  bundleModule: RemotionBundlerModule
): Promise<{ location: string; fromCache: boolean }> {
  const now = Date.now();
  if (
    _bundleCache &&
    _bundleCache.entryPoint === entryPoint &&
    now - _bundleCache.createdAt < BUNDLE_CACHE_TTL_MS
  ) {
    const bundlePath = _bundleCache.location.startsWith("file://")
      ? _bundleCache.location.slice(7)
      : _bundleCache.location;
    if (fs.existsSync(bundlePath)) {
      return { location: _bundleCache.location, fromCache: true };
    }
    _bundleCache = null;
  }
  const location = await bundleModule.bundle(entryPoint);
  _bundleCache = { location, entryPoint, createdAt: Date.now() };
  return { location, fromCache: false };
}

async function loadRemotionDependencies(): Promise<{
  bundler: RemotionBundlerModule;
  renderer: RemotionRendererModule;
}> {
  try {
    const [bundler, renderer] = await Promise.all([
      import("@remotion/bundler"),
      import("@remotion/renderer"),
    ]);
    return { bundler, renderer };
  } catch (error: any) {
    const wrappedError: any = new Error(
      "Tính năng tạo video Remotion chưa sẵn sàng trên máy này. Hãy cài đặt đầy đủ các gói Remotion trước khi sử dụng."
    );
    wrappedError.statusCode = 503;
    wrappedError.cause = error;
    throw wrappedError;
  }
}

/**
 * Chuyển đổi URL media không tương thích sang định dạng Chromium có thể phát.
 * - Cloudinary .mov/.mkv/.avi → thêm vc_h264,ac_aac + đổi extension .mp4
 * - Non-Cloudinary: chỉ đổi đuôi container không hỗ trợ sang .mp4
 */
export function normalizeMediaUrl(url: string): string {
  if (!url || !url.startsWith("http")) return url;

  const isCloudinary = url.includes("cloudinary.com");

  if (isCloudinary) {
    const parts = url.split("?");
    let pathPart = parts[0];
    const queryPart = parts[1] ? `?${parts[1]}` : "";

    const uploadMarker = "/video/upload/";
    const uploadIdx = pathPart.indexOf(uploadMarker);
    if (uploadIdx !== -1) {
      const afterUpload = pathPart.slice(uploadIdx + uploadMarker.length);
      // Only transcode non-mp4 files — mp4 is already H264, applying vc_h264 causes
      // Cloudinary on-the-fly streaming which triggers ERR_HTTP2_PROTOCOL_ERROR in Chromium
      const isAlreadyMp4 = /\.mp4(\?|$)/i.test(afterUpload);
      const hasTransform = !afterUpload.match(/^v\d+\//i);
      if (!isAlreadyMp4) {
        if (!hasTransform) {
          pathPart = pathPart.slice(0, uploadIdx + uploadMarker.length) + "vc_h264,ac_aac/" + afterUpload;
        } else if (!pathPart.includes("vc_h264")) {
          pathPart = pathPart.slice(0, uploadIdx + uploadMarker.length) + "vc_h264,ac_aac/" + afterUpload;
        }
      }
    }

    const extRegex = /\.(mov|mkv|avi|wmv|flv|3gp|webm|ogg)$/i;
    pathPart = pathPart.replace(extRegex, ".mp4");
    const normalized = pathPart + queryPart;
    if (normalized !== url) {
      console.log(`[Remotion] URL normalize (Cloudinary H264): ${url}`);
      console.log(`[Remotion]                           → ${normalized}`);
    }
    return normalized;
  }

  const unsupportedExts = /\.(mov|mkv|avi|wmv|flv|3gp)(\?.*)?$/i;
  const match = url.match(unsupportedExts);
  if (match) {
    const normalized = url.replace(unsupportedExts, `.mp4${match[2] || ""}`);
    console.log(`[Remotion] URL normalize (non-Cloudinary): ${url} → ${normalized}`);
    return normalized;
  }

  return url;
}

function normalizeBlueprintUrls(blueprint: any): any {
  if (!blueprint?.timeline) return blueprint;
  return {
    ...blueprint,
    timeline: blueprint.timeline.map((item: any) =>
      item.src ? { ...item, src: normalizeMediaUrl(item.src) } : item
    ),
  };
}

export const remotionService = {
  async renderVideo(
    blueprint: any,
    options?: { aspectRatio?: string; resolution?: string },
    onProgress?: (progress: number, logMessage?: string) => void
  ): Promise<string> {
    const renderJobId = `render_${Date.now()}`;
    const entryPoint = path.join(process.cwd(), "server/remotion/entry.tsx");
    const outputPath = path.join(os.tmpdir(), `remotion_out_${Date.now()}.mp4`);
    const resolution = options?.resolution || "720p";
    const aspectRatio = options?.aspectRatio || "16:9";
    const is1080p = resolution === "1080p";

    console.log(`\n${"=".repeat(60)}`);
    console.log(`[Remotion] ▶ BẤT ĐẦU RENDER | Job: ${renderJobId}`);
    console.log(`[Remotion] EntryPoint : ${entryPoint} | Tồn tại: ${fs.existsSync(entryPoint)}`);
    console.log(`[Remotion] OutputPath : ${outputPath}`);
    console.log(`[Remotion] Options    : aspect=${aspectRatio}, res=${resolution}`);

    const normalizedBlueprint = normalizeBlueprintUrls(blueprint);
    const timeline = normalizedBlueprint?.timeline || [];
    const videoUrls = timeline.filter((t: any) => t.type === "video").map((t: any) => t.src);
    const audioUrls = timeline.filter((t: any) => t.type === "audio").map((t: any) => t.src);
    const imageUrls = timeline.filter((t: any) => t.type === "image").map((t: any) => t.src);

    console.log(`[Remotion] Blueprint timeline: ${timeline.length} items`);
    videoUrls.forEach((url: string, i: number) => console.log(`  [Video ${i + 1}] ${url || "(EMPTY)"}`));
    audioUrls.forEach((url: string, i: number) => console.log(`  [Audio ${i + 1}] ${url || "(EMPTY)"}`));
    imageUrls.forEach((url: string, i: number) => console.log(`  [Image ${i + 1}] ${url || "(EMPTY)"}`));

    // Preflight / pre-warm CDN cache
    const allMediaUrls = [...videoUrls, ...audioUrls, ...imageUrls].filter(Boolean);
    for (const mediaUrl of allMediaUrls) {
      if (!mediaUrl.startsWith("http") || mediaUrl.includes("localhost") || mediaUrl.includes("127.0.0.1")) continue;
      try {
        const startPrewarm = Date.now();
        const res = await fetch(mediaUrl, { method: "GET", signal: AbortSignal.timeout(90000) });
        if (!res.ok) {
          console.error(`  [❌ HTTP ${res.status}] ${mediaUrl}`);
        } else {
          const buffer = await res.arrayBuffer();
          console.log(`  [✅ READY] ${mediaUrl} | ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB | ${Date.now() - startPrewarm}ms`);
        }
      } catch (fetchErr: any) {
        console.error(`  [❌ FETCH_ERROR] ${mediaUrl} → ${fetchErr.message}`);
      }
    }

    if (onProgress) onProgress(45, "[Remotion Engine] Đang đóng gói mã React...");

    try {
      const { bundler, renderer } = await loadRemotionDependencies();
      const { renderMedia, selectComposition } = renderer;

      const bundleStart = Date.now();
      const { location: bundleLocation, fromCache } = await getOrCreateBundle(entryPoint, bundler);
      if (fromCache) {
        console.log(`[Remotion] ✅ Bundle từ cache (${Math.round((Date.now() - _bundleCache!.createdAt) / 1000)}s tuổi)`);
      } else {
        console.log(`[Remotion] ✅ Bundle hoàn tất trong ${Date.now() - bundleStart}ms`);
      }

      if (onProgress) onProgress(55, `[Remotion Engine] Khởi chạy Chromium headless${fromCache ? " (bundle cached)" : ""}...`);

      const inputProps = {
        blueprint: { ...normalizedBlueprint, aspectRatio, resolution },
      };

      const composition = await selectComposition({ serveUrl: bundleLocation, id: "video-edit", inputProps });
      console.log(`[Remotion] ✅ Composition: ${composition.durationInFrames} frames @ ${composition.fps}fps | ${composition.width}x${composition.height}`);

      if (onProgress) onProgress(65, "[Remotion Engine] Bắt đầu kết xuất...");

      const renderStart = Date.now();
      await renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: "h264",
        audioCodec: "aac",
        audioBitrate: "320k",
        outputLocation: outputPath,
        inputProps,
        timeoutInMilliseconds: 600_000, // 10 phút — đủ cho 1080p dài
        crf: is1080p ? 18 : 22,        // chất lượng cao hơn cho 1080p
        chromiumOptions: {
          enableMultiProcessOnLinux: true,
          gl: "swiftshader",
        },
        onBrowserLog: (log) => {
          const msg = log.text;
          const msgLower = msg.toLowerCase();
          if (log.type === "error" || msgLower.includes("403") || msgLower.includes("net::err") || msgLower.includes("blocked")) {
            console.error(`[Remotion:Chromium:ERROR] ${msg}`);
          }
        },
        onProgress: (progressData) => {
          const percent = Math.round(65 + progressData.progress * 20);
          if (onProgress) onProgress(percent, `[Remotion Engine] ${percent}% (frame ${progressData.renderedFrames}/${composition.durationInFrames})`);
        },
      });
      console.log(`[Remotion] ✅ renderMedia hoàn tất trong ${((Date.now() - renderStart) / 1000).toFixed(1)}s`);

      if (onProgress) onProgress(85, "[Remotion Engine] Đang tải lên Cloudinary...");

      const outputBuffer = fs.readFileSync(outputPath);
      const secureUrl = await cloudinaryService.uploadMediaBuffer(outputBuffer, "igen_erp/marketing/video");
      try { fs.unlinkSync(outputPath); } catch {}

      console.log(`[Remotion] ✅ RENDER HOÀN TẤT | Job: ${renderJobId} | URL: ${secureUrl}`);
      console.log(`${"=".repeat(60)}\n`);
      return secureUrl;
    } catch (error: any) {
      console.error(`[Remotion] ❌ LỖI | Job: ${renderJobId} | ${error?.message}`);
      if (error?.cause) console.error(`[Remotion] Caused by: ${error.cause?.message || error.cause}`);
      console.error(`[Remotion] Stack:\n${error?.stack}`);
      throw error;
    }
  },
};
