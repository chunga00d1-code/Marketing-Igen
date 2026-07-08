import { Request, Response } from "express";
import { cloudinaryService } from "../service/cloudinary.service";

export const mediaController = {
  /**
   * POST /api/v1/media/upload
   * Nhận file (base64 hoặc URL) và tải lên Cloudinary
   */
  async upload(req: Request, res: Response) {
    try {
      const { file, folder } = req.body;
      const secureUrl = await cloudinaryService.uploadMedia(file, folder);
      return res.status(200).json({
        status: "success",
        url: secureUrl,
      });
    } catch (error: any) {
      console.error("[mediaController.upload] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Lỗi kết nối hoặc xử lý tải lên đa phương tiện tới Cloudinary",
        details: error.message,
      });
    }
  },
};
