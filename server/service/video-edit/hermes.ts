import { AIMediaModel } from "../../model/ai-media.model";
import { broadcastEvent } from "../../socket";

/**
 * Chuyển blueprint JSON thành mô tả văn bản cho Hermes Agent (dùng nội bộ / logging).
 */
function compileBlueprintToPrompt(blueprint: any): string {
  if (!blueprint?.timeline || !Array.isArray(blueprint.timeline)) return "";
  let desc = "\nHãy biên tập video theo kịch bản chính xác sau:\n";
  blueprint.timeline.forEach((item: any) => {
    if (item.type === "video") {
      desc += `- Đoạn video nguồn: từ ${item.start}s đến ${item.end}s, tốc độ phát ${item.playbackRate || 1.0}x`;
      if (item.filters) {
        if (item.filters.brightness !== undefined) desc += `, độ sáng: ${item.filters.brightness}`;
        if (item.filters.contrast !== undefined) desc += `, tương phản: ${item.filters.contrast}`;
        if (item.filters.saturate !== undefined) desc += `, bão hòa màu: ${item.filters.saturate}`;
        if (item.filters.grayscale !== undefined) desc += `, đen trắng: ${item.filters.grayscale}`;
        if (item.filters.sepia !== undefined) desc += `, sepia: ${item.filters.sepia}`;
        if (item.filters.blur !== undefined) desc += `, làm mờ: ${item.filters.blur}px`;
        if (item.filters.invert !== undefined) desc += `, đảo màu: ${item.filters.invert}`;
        if (item.filters.hueRotate !== undefined) desc += `, xoay màu: ${item.filters.hueRotate}deg`;
      }
      if (item.effects) {
        if (item.effects.zoom) desc += `, zoom: ${item.effects.zoom}`;
        if (item.effects.rotate) desc += `, xoay: ${item.effects.rotate}deg`;
        if (item.effects.transition) desc += `, chuyển cảnh: ${item.effects.transition}`;
      }
      if (item.volume !== undefined) desc += `, âm lượng: ${item.volume}`;
      desc += "\n";
    } else if (item.type === "text") {
      desc += `- Chữ: "${item.content}" từ ${item.start}s đến ${item.end}s`;
      if (item.style) {
        desc += ` tại ${item.style.position || "bottom-center"}, màu ${item.style.color || "#FFFFFF"}, cỡ ${item.style.fontSize || "32px"}`;
      }
      desc += "\n";
    } else if (item.type === "audio") {
      desc += `- Âm thanh: "${item.src}" từ ${item.start}s đến ${item.end}s, âm lượng ${item.volume || 0.5}\n`;
    }
  });
  return desc;
}

function getWorkerUrl(): string {
  return String(process.env.HERMES_WORKER_URL || "http://103.90.224.34:8643").replace(/\/$/, "");
}

function buildCloudinaryPrompt(): string {
  return `Sau khi hoàn thành chỉnh sửa video, bạn PHẢI tải kết quả lên Cloudinary với thông tin:
- CLOUDINARY_CLOUD_NAME: "${process.env.CLOUDINARY_CLOUD_NAME || ""}"
- CLOUDINARY_API_KEY: "${process.env.CLOUDINARY_API_KEY || ""}"
- CLOUDINARY_API_SECRET: "${process.env.CLOUDINARY_API_SECRET || ""}"

Trả về URL Cloudinary hợp lệ dạng: https://res.cloudinary.com/...`.trim();
}

const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 120; // 120 × 10s = 20 phút

async function pollTaskStatus(taskId: string): Promise<{ status: string; result_url?: string; error?: string }> {
  const workerUrl = getWorkerUrl();
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    try {
      const res = await fetch(`${workerUrl}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId }),
      });
      if (!res.ok) {
        console.warn(`[Hermes Poll] /status HTTP ${res.status}, retry ${i + 1}/${MAX_POLL_ATTEMPTS}`);
        continue;
      }
      const data = await res.json() as { status?: string; result_url?: string; error?: string };
      const status = data.status || "";
      console.log(`[Hermes Poll] task=${taskId} status=${status} attempt=${i + 1}`);
      if (status === "done" || status === "failed") {
        return { status, result_url: data.result_url, error: data.error };
      }
    } catch (err) {
      console.warn(`[Hermes Poll] Lỗi kết nối /status attempt ${i + 1}:`, err);
    }
  }
  return { status: "failed", error: "Timeout: Hermes Worker không hoàn thành sau 20 phút" };
}

export const hermesService = {
  async editVideo(
    userId: string,
    videoUrl: string,
    prompt: string,
    options?: {
      modelName?: string;
      aspectRatio?: string;
      resolution?: string;
      duration?: number;
      videoDurations?: number[];
      blueprint?: any;
      referenceVideoUrl?: string;
    }
  ): Promise<{ status: string; record: any; blueprint: any }> {
    const blueprint = options?.blueprint || {};
    const safePrompt = prompt || "";

    const record = await AIMediaModel.create({
      userId,
      mediaType: "video",
      url: `pending://hermes-worker/${userId}-${Date.now()}`,
      prompt: safePrompt,
      metadata: {
        status: "processing",
        progress: 5,
        provider: "hermes-worker",
        title: `Biên tập bằng Hermes Worker: ${safePrompt}`,
        description: "Đang gửi yêu cầu đến Hermes Worker Pool...",
        blueprint: JSON.stringify(blueprint),
        renderLogs: [
          "[Hermes] Khởi tạo yêu cầu biên tập video...",
          `[Hermes] Video đầu vào: ${videoUrl}`,
          options?.referenceVideoUrl ? `[Hermes] Video mẫu: ${options.referenceVideoUrl}` : "",
          `[Hermes] Yêu cầu: ${safePrompt}`,
        ].filter(Boolean),
        aspectRatio: options?.aspectRatio || "16:9",
        resolution: options?.resolution || "720p",
        referenceVideoUrl: options?.referenceVideoUrl,
      },
    });

    void this.executeHermesWorkerJob(record._id.toString(), userId, videoUrl, prompt, {
      blueprint,
      referenceVideoUrl: options?.referenceVideoUrl,
    });

    return { status: "success", record, blueprint };
  },

  async executeHermesWorkerJob(
    recordId: string,
    userId: string,
    videoUrl: string,
    prompt: string,
    options?: { blueprint?: any; referenceVideoUrl?: string }
  ): Promise<void> {
    const blueprint = options?.blueprint;
    const referenceVideoUrl = options?.referenceVideoUrl || "";
    const workerUrl = getWorkerUrl();
    console.log(`[Hermes Job] Starting for record=${recordId} workerUrl=${workerUrl}`);

    const logs: string[] = [
      "[Hermes] Khởi tạo kết nối với Hermes Worker Pool...",
      `[Hermes] Video đầu vào: ${videoUrl}`,
      referenceVideoUrl ? `[Hermes] Video mẫu: ${referenceVideoUrl}` : "",
      `[Hermes] Yêu cầu: ${prompt}`,
    ].filter(Boolean);

    if (blueprint && Object.keys(blueprint).length > 0) {
      logs.push("[Hermes] Đã nhận kịch bản cấu hình JSON Blueprint biên tập.");
    }

    const updateLogs = async (progress: number, description: string, newLog?: string) => {
      if (newLog) { logs.push(newLog); }
      const updatedRecord = await AIMediaModel.findByIdAndUpdate(
        recordId,
        { "metadata.progress": progress, "metadata.description": description, "metadata.renderLogs": [...logs] },
        { new: true }
      );
      if (updatedRecord) {
        broadcastEvent("video_status_updated", { videoId: recordId, status: "processing", updates: [updatedRecord.toObject()] });
      }
    };

    try {
      await updateLogs(10, "Đang gửi yêu cầu đến Hermes Worker Pool...", "[Hermes] Đang gọi POST /submit...");

      let fullPrompt = `Bạn là một AI Video Editor chuyên nghiệp tích hợp trong hệ thống Hermes.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📽️ TÀI NGUYÊN ĐẦU VÀO\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n- Video gốc cần biên tập: ${videoUrl}\n`;
      if (referenceVideoUrl) fullPrompt += `- Video mẫu (tham khảo phong cách dựng): ${referenceVideoUrl}\n`;

      fullPrompt += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎬 YÊU CẦU BIÊN TẬP\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"${prompt}"\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🚨 NGUYÊN TẮC\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n1. Đọc kỹ và thực hiện tất cả hành động chỉnh sửa (cắt, ghép, zoom, filter, text, nhạc) lên video gốc.\n2. Áp dụng chính xác lên ${videoUrl}.\n`;
      if (referenceVideoUrl) {
        fullPrompt += `3. Tham khảo phong cách từ ${referenceVideoUrl} (nhịp cắt, chuyển cảnh, text, filter, âm thanh).\n4. Đồng bộ timestamps theo dòng thời gian video nguồn.\n5. Không thay đổi phần không được yêu cầu.\n`;
      } else {
        fullPrompt += `3. Đồng bộ timestamps theo dòng thời gian video nguồn.\n4. Không thay đổi phần không được yêu cầu.\n`;
      }
      fullPrompt += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n☁️ KẾT XUẤT VÀ TẢI LÊN CLOUDINARY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${buildCloudinaryPrompt()}`;

      const submitRes = await fetch(`${workerUrl}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_url: videoUrl,
          ref_video_url: referenceVideoUrl,
          reference_video_url: referenceVideoUrl,
          prompt: fullPrompt,
          user_id: userId,
          blueprint: blueprint || {},
        }),
      });

      if (!submitRes.ok) {
        const errText = await submitRes.text();
        throw new Error(`Hermes Worker /submit lỗi ${submitRes.status}: ${errText}`);
      }

      const submitData = await submitRes.json() as { task_id?: string; status?: string };
      const taskId = submitData.task_id;
      if (!taskId) throw new Error("Hermes Worker không trả về task_id");

      console.log(`[Hermes Job] Submitted. task_id=${taskId}`);
      await AIMediaModel.findByIdAndUpdate(recordId, { "metadata.hermesTaskId": taskId });
      await updateLogs(20, `Task đã vào hàng đợi (ID: ${taskId}). Đang xử lý...`, `[Hermes] Submit thành công. Task ID: ${taskId}`);
      await updateLogs(25, "Hermes Worker đang xử lý video. Đang chờ kết quả...", "[Hermes] Bắt đầu polling trạng thái task...");

      const pollResult = await pollTaskStatus(taskId);

      if (pollResult.status === "done" && pollResult.result_url) {
        const updatedRecord = await AIMediaModel.findByIdAndUpdate(
          recordId,
          {
            url: pollResult.result_url,
            "metadata.status": "completed",
            "metadata.progress": 100,
            "metadata.description": "Video đã được biên tập và upload thành công!",
            "metadata.renderLogs": [...logs, "[Hermes] Xử lý hoàn tất!", `[Hermes] Video: ${pollResult.result_url}`],
          },
          { new: true }
        );
        console.log(`[Hermes Job] Completed. URL=${pollResult.result_url}`);
        if (updatedRecord) {
          broadcastEvent("video_status_updated", { videoId: recordId, status: "completed", updates: [updatedRecord.toObject()] });
        }
      } else {
        throw new Error(pollResult.error || "Worker không trả về kết quả");
      }
    } catch (error: any) {
      console.error("[Hermes Job] Failed:", error);
      const updatedRecord = await AIMediaModel.findByIdAndUpdate(
        recordId,
        {
          "metadata.status": "failed",
          "metadata.progress": 100,
          "metadata.error": error.message || String(error),
          "metadata.description": `Lỗi: ${error.message || String(error)}`,
          "metadata.renderLogs": [...logs, `[Hermes] ❌ Lỗi: ${error.message || String(error)}`],
        },
        { new: true }
      );
      if (updatedRecord) {
        broadcastEvent("video_status_updated", { videoId: recordId, status: "failed", updates: [updatedRecord.toObject()] });
      }
    }
  },
};
