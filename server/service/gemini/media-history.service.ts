/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { AIMediaModel } from "../../model/ai-media.model";
import { cloudinaryService } from "../cloudinary.service";
import { openrouterVideoService } from "../openrouter-video.service";
import { piapiService } from "../piapi.service";

export class GeminiMediaHistoryService {
  /**
   * Lấy lịch sử tạo đa phương tiện theo user và loại
   */
  async getMediaHistory(userId: string, mediaType: "image" | "video" | "voice") {
    try {
      const records = await AIMediaModel.find({ userId, mediaType })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      if (mediaType === "video") {
        await Promise.all(
          records.map(async (record: any) => {
            if (record.url && record.url.startsWith("pending://piapi/")) {
              const taskId = record.url.replace("pending://piapi/", "");
              try {
                const result = await piapiService.getTaskStatus(taskId);
                if (result.status === "completed" && result.url) {
                  const cloudinaryUrl = await cloudinaryService.uploadMedia(result.url, "igen_erp/marketing/video");
                  await AIMediaModel.updateOne(
                    { _id: record._id },
                    { url: cloudinaryUrl, "metadata.status": "completed", "metadata.progress": 100 }
                  );
                  record.url = cloudinaryUrl;
                  record.metadata = { ...record.metadata, status: "completed", progress: 100 };

                  const activeCardId = record.metadata?.activeCardId;
                  if (activeCardId) {
                    const { MarketingContentModel } = require("../../model/marketing-content.model");
                    await MarketingContentModel.findByIdAndUpdate(activeCardId, { videoUrl: cloudinaryUrl });
                    console.log(`[PiAPI Background Poll] Updated target card ${activeCardId} with videoUrl: ${cloudinaryUrl}`);
                  }
                } else if (result.status === "failed") {
                  await AIMediaModel.updateOne(
                    { _id: record._id },
                    { "metadata.status": "failed", "metadata.error": result.error || "Failed", "metadata.progress": 0 }
                  );
                  record.metadata = { ...record.metadata, status: "failed", error: result.error, progress: 0 };
                } else {
                  const currentProgress = result.progress !== undefined ? result.progress : 0;
                  await AIMediaModel.updateOne(
                    { _id: record._id },
                    { "metadata.progress": currentProgress }
                  );
                  record.metadata = { ...record.metadata, progress: currentProgress };
                }
              } catch (err) {
                console.error(`[getMediaHistory] Error refreshing pending task ${taskId}:`, err);
              }
            } else if (record.url && record.url.startsWith("pending://openrouter/")) {
              const jobId = record.url.replace("pending://openrouter/", "");
              try {
                const result = await openrouterVideoService.getTaskStatus(jobId);
                if (result.status === "completed") {
                  const videoBuffer = await openrouterVideoService.downloadVideo(jobId, result.unsignedUrl);
                  const cloudinaryUrl = await cloudinaryService.uploadMediaBuffer(
                    videoBuffer,
                    "igen_erp/marketing/video",
                    `openrouter_${jobId}`
                  );
                  await AIMediaModel.updateOne(
                    { _id: record._id },
                    { url: cloudinaryUrl, "metadata.status": "completed", "metadata.progress": 100 }
                  );
                  record.url = cloudinaryUrl;
                  record.metadata = { ...record.metadata, status: "completed", progress: 100 };

                  const activeCardId = record.metadata?.activeCardId;
                  if (activeCardId) {
                    const { MarketingContentModel } = require("../../model/marketing-content.model");
                    await MarketingContentModel.findByIdAndUpdate(activeCardId, { videoUrl: cloudinaryUrl });
                  }
                } else if (result.status === "failed") {
                  await AIMediaModel.updateOne(
                    { _id: record._id },
                    { "metadata.status": "failed", "metadata.error": result.error || "Failed", "metadata.progress": 0 }
                  );
                  record.metadata = { ...record.metadata, status: "failed", error: result.error, progress: 0 };
                } else {
                  const currentProgress = result.progress !== undefined ? result.progress : 0;
                  await AIMediaModel.updateOne(
                    { _id: record._id },
                    { "metadata.progress": currentProgress }
                  );
                  record.metadata = { ...record.metadata, progress: currentProgress };
                }
              } catch (err) {
                console.error(`[getMediaHistory] Error refreshing OpenRouter video job ${jobId}:`, err);
              }
            }
          })
        );
      }
      return records;
    } catch (error: any) {
      console.error("[geminiService.getMediaHistory] Error:", error);
      throw error;
    }
  }

  /**
   * Xóa một bản ghi lịch sử
   */
  async deleteMediaHistory(userId: string, id: string) {
    try {
      const result = await AIMediaModel.deleteOne({ _id: id, userId });
      if (result.deletedCount === 0) {
        throw new Error("Không tìm thấy bản ghi hoặc không có quyền xóa");
      }
      return { status: "success" };
    } catch (error: any) {
      console.error("[geminiService.deleteMediaHistory] Error:", error);
      throw error;
    }
  }

  /**
   * Đồng bộ lưu trữ nâng cao của Image/Video sau khi sinh thành công
   */
  async saveGeneratedMediaRecord(userId: string, mediaType: "image" | "video", base64OrUrl: string, prompt: string, metadata?: any) {
    try {
      let finalUrl = base64OrUrl;
      if (base64OrUrl.startsWith("data:")) {
        finalUrl = await cloudinaryService.uploadMedia(base64OrUrl, `igen_erp/marketing/${mediaType}`);
      }

      const record = await AIMediaModel.create({
        userId,
        mediaType,
        url: finalUrl,
        prompt,
        metadata,
      });
      return record;
    } catch (error: any) {
      console.error("[geminiService.saveGeneratedMediaRecord] Error:", error);
      throw error;
    }
  }
}

export const geminiMediaHistoryService = new GeminiMediaHistoryService();
