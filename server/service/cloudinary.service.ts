/* eslint-disable @typescript-eslint/no-explicit-any */
import { v2 as cloudinary } from "cloudinary";

let isConfigured = false;

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

    const publicId = getCloudinaryVideoPublicId(videoUrl);
    try {
      const resource = await cloudinary.api.resource(publicId, {
        resource_type: "video",
        type: "upload",
      });
      const duration = Number(resource.duration || 0);
      if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error("Cloudinary chưa có metadata thời lượng cho video này.");
      }
      return duration;
    } catch (error: any) {
      console.error("[cloudinaryService.getVideoDurationSeconds] Error:", error);
      throw new Error(`Không thể xác minh thời lượng video TikTok: ${error.message || error}`);
    }
  },
};
