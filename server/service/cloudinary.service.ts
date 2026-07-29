/* eslint-disable @typescript-eslint/no-explicit-any */
import { v2 as cloudinary } from "cloudinary";
import { spawn } from "child_process";
import { resolveMediaBinary } from "./media-binary.service";

let isConfigured = false;
const TIKTOK_DURATION_PROBE_TIMEOUT_MS = 30_000;

function ensureConfigured() {
  if (isConfigured) return;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  isConfigured = true;
}

function getCloudinaryVideoPublicId(videoUrl: string): string {
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const parsedUrl = new URL(videoUrl);
  if (parsedUrl.hostname !== "res.cloudinary.com" || !cloudName) {
    throw new Error("Video TikTok phải được lưu trên Cloudinary để xác minh thời lượng.");
  }

  const uploadMarker = `/${cloudName}/video/upload/`;
  const markerIndex = parsedUrl.pathname.indexOf(uploadMarker);
  if (markerIndex < 0) {
    throw new Error("Không thể xác định video Cloudinary để kiểm tra thời lượng TikTok.");
  }

  const pathSegments = decodeURIComponent(parsedUrl.pathname.slice(markerIndex + uploadMarker.length))
    .split("/")
    .filter(Boolean);
  const versionIndex = pathSegments.findIndex((segment) => /^v\d+$/.test(segment));
  const assetPath = (versionIndex >= 0 ? pathSegments.slice(versionIndex + 1) : pathSegments)
    .join("/")
    .replace(/\.[a-z0-9]{2,5}$/i, "");
  if (!assetPath) {
    throw new Error("Không thể xác định video Cloudinary để kiểm tra thời lượng TikTok.");
  }
  return assetPath;
}

function probeVideoDurationSeconds(videoUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      resolveMediaBinary("ffprobe", process.env.TIKTOK_FFPROBE_PATH),
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        videoUrl,
      ],
      { shell: false, windowsHide: true }
    );
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finishWithError = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => {
      child.kill();
      finishWithError(new Error("Hết thời gian đọc thời lượng video."));
    }, TIKTOK_DURATION_PROBE_TIMEOUT_MS);
    timer.unref();

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      finishWithError(
        new Error(
          error.code === "ENOENT"
            ? "Máy chủ chưa cài ffprobe để đọc thời lượng video."
            : `Không thể chạy ffprobe: ${error.message}`
        )
      );
    });
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        finishWithError(new Error(`Không thể đọc metadata video: ${stderr.slice(-300)}`));
        return;
      }
      const duration = Number.parseFloat(stdout.trim());
      if (!Number.isFinite(duration) || duration <= 0) {
        finishWithError(new Error("ffprobe không trả về thời lượng video hợp lệ."));
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(duration);
    });
  });
}

export const cloudinaryService = {
  /**
   * Táº£i tá»‡p tin (Base64 hoáº·c URL cÃ´ng khai) lÃªn Cloudinary
   * @param fileStr Dá»¯ liá»‡u file dáº¡ng Base64 hoáº·c URL cá»§a áº£nh/video
   * @param folder ThÆ° má»¥c lÆ°u trá»¯ trÃªn Cloudinary
   * @returns URL cÃ´ng khai báº£o máº­t (secure_url)
   */
  async uploadMedia(fileStr: string, folder: string): Promise<string> {
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      throw new Error("Cáº¥u hÃ¬nh Cloudinary chÆ°a Ä‘áº§y Ä‘á»§ trong biáº¿n mÃ´i trÆ°á»ng (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).");
    }

    ensureConfigured();

    try {
      const response = await cloudinary.uploader.upload(fileStr, {
        folder: folder || "igen_erp",
        resource_type: "auto", // Tá»± Ä‘á»™ng nháº­n diá»‡n áº£nh/video
        timeout: 600000, // TÄƒng timeout lÃªn 10 phÃºt cho video dung lÆ°á»£ng lá»›n
      });
      return response.secure_url;
    } catch (error: any) {
      console.error("[cloudinaryService.uploadMedia] Error:", error);
      throw new Error(`Táº£i lÃªn Cloudinary tháº¥t báº¡i: ${error.message || error}`);
    }
  },

  /**
   * Táº£i tá»‡p tin dáº¡ng Buffer trá»±c tiáº¿p lÃªn Cloudinary báº±ng stream
   * @param buffer Dá»¯ liá»‡u file dáº¡ng Buffer
   * @param folder ThÆ° má»¥c lÆ°u trá»¯ trÃªn Cloudinary
   * @returns URL cÃ´ng khai báº£o máº­t (secure_url)
   */
  async uploadMediaBuffer(buffer: Buffer, folder: string, publicId?: string): Promise<string> {
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      throw new Error("Cáº¥u hÃ¬nh Cloudinary chÆ°a Ä‘áº§y Ä‘á»§ trong biáº¿n mÃ´i trÆ°á»ng (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).");
    }

    ensureConfigured();

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: folder || "igen_erp",
          ...(publicId ? { public_id: publicId, overwrite: true, unique_filename: false } : {}),
          resource_type: "auto",
          timeout: 600000, // TÄƒng timeout lÃªn 10 phÃºt cho video lá»›n
        },
        (error, result) => {
          if (error) {
            console.error("[cloudinaryService.uploadMediaBuffer] Error:", error);
            reject(new Error(`Táº£i lÃªn Cloudinary tháº¥t báº¡i: ${error.message || error}`));
          } else {
            resolve(result!.secure_url);
          }
        }
      );
      uploadStream.write(buffer);
      uploadStream.end();
    });
  },

  async getVideoDurationSeconds(videoUrl: string): Promise<number> {
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      throw new Error("Thiếu cấu hình Cloudinary để xác minh thời lượng video TikTok.");
    }
    ensureConfigured();

    try {
      const publicId = getCloudinaryVideoPublicId(videoUrl);
      const resource = await cloudinary.api.resource(publicId, {
        resource_type: "video",
        type: "upload",
      });
      const duration = Number(resource.duration || 0);
      if (Number.isFinite(duration) && duration > 0) return duration;
      throw new Error("Cloudinary chưa có metadata thời lượng cho video này.");
    } catch (error: any) {
      console.warn(
        "[cloudinaryService.getVideoDurationSeconds] Cloudinary metadata unavailable; probing the published video:",
        error.message || error
      );
      try {
        return await probeVideoDurationSeconds(videoUrl);
      } catch (probeError: any) {
        console.error("[cloudinaryService.getVideoDurationSeconds] Error:", probeError);
        throw new Error(`Không thể xác minh thời lượng video TikTok: ${probeError.message || probeError}`);
      }
    }
  },
};
