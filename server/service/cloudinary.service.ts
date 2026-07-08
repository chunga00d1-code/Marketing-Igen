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
   * Tải tệp tin (Base64 hoặc URL công khai) lên Cloudinary
   * @param fileStr Dữ liệu file dạng Base64 hoặc URL của ảnh/video
   * @param folder Thư mục lưu trữ trên Cloudinary
   * @returns URL công khai bảo mật (secure_url)
   */
  async uploadMedia(fileStr: string, folder: string): Promise<string> {
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      throw new Error("Cấu hình Cloudinary chưa đầy đủ trong biến môi trường (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).");
    }

    ensureConfigured();

    try {
      const response = await cloudinary.uploader.upload(fileStr, {
        folder: folder || "igen_erp",
        resource_type: "auto", // Tự động nhận diện ảnh/video
        timeout: 600000, // Tăng timeout lên 10 phút cho video dung lượng lớn
      });
      return response.secure_url;
    } catch (error: any) {
      console.error("[cloudinaryService.uploadMedia] Error:", error);
      throw new Error(`Tải lên Cloudinary thất bại: ${error.message || error}`);
    }
  },

  /**
   * Tải tệp tin dạng Buffer trực tiếp lên Cloudinary bằng stream
   * @param buffer Dữ liệu file dạng Buffer
   * @param folder Thư mục lưu trữ trên Cloudinary
   * @returns URL công khai bảo mật (secure_url)
   */
  async uploadMediaBuffer(buffer: Buffer, folder: string): Promise<string> {
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      throw new Error("Cấu hình Cloudinary chưa đầy đủ trong biến môi trường (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).");
    }

    ensureConfigured();

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: folder || "igen_erp",
          resource_type: "auto",
          timeout: 600000, // Tăng timeout lên 10 phút cho video lớn
        },
        (error, result) => {
          if (error) {
            console.error("[cloudinaryService.uploadMediaBuffer] Error:", error);
            reject(new Error(`Tải lên Cloudinary thất bại: ${error.message || error}`));
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
