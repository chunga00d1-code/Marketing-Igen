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
};
