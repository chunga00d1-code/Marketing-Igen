import dotenv from "dotenv";
import { cloudinaryService } from "./cloudinary.service";

dotenv.config();

const KLING_API_KEY = process.env.KLING_API_KEY || "";
const KLING_API_BASE_URL = process.env.KLING_API_BASE_URL || "https://api.klingai.com";

console.log(`[Kling Service] API Key status: ${KLING_API_KEY ? `Present (${KLING_API_KEY.substring(0, 12)}...)` : "Missing"}`);

function getKlingHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${KLING_API_KEY}`,
  };
}

function mapKlingStatus(status: string): "pending" | "processing" | "completed" | "failed" {
  switch (status) {
    case "succeed": return "completed";
    case "failed": return "failed";
    case "submitted":
    case "waiting":
    case "processing": return "processing";
    default: return "processing";
  }
}

export const klingService = {
  async createMotionControlTask(params: {
    imageUrl: string;
    videoUrl: string;
    modelName?: string;
    prompt?: string;
    characterOrientation?: "video" | "image";
    keepOriginalSound?: boolean;
    mode?: "std" | "pro";
  }): Promise<{ taskId: string }> {
    if (!KLING_API_KEY) {
      throw new Error("Chưa cấu hình KLING_API_KEY trong biến môi trường.");
    }

    let finalImageUrl = params.imageUrl;
    let finalVideoUrl = params.videoUrl;

    if (params.imageUrl.startsWith("data:")) {
      console.log("[KlingService] Uploading reference image to Cloudinary...");
      finalImageUrl = await cloudinaryService.uploadMedia(params.imageUrl, "igen_erp/kling/image_refs");
      console.log(`[KlingService] Image uploaded: ${finalImageUrl}`);
    }

    if (params.videoUrl.startsWith("data:")) {
      console.log("[KlingService] Uploading reference video to Cloudinary...");
      finalVideoUrl = await cloudinaryService.uploadMedia(params.videoUrl, "igen_erp/kling/video_refs");
      console.log(`[KlingService] Video uploaded: ${finalVideoUrl}`);
    }

    const body: Record<string, any> = {
      model_name: params.modelName || "kling-v2-6",
      mode: params.mode || "std",
      image_url: finalImageUrl,
      video_url: finalVideoUrl,
      character_orientation: params.characterOrientation || "video",
    };

    if (params.prompt) {
      body.prompt = params.prompt;
    }

    console.log("[KlingService] Creating motion control task, body:", JSON.stringify(body));

    const response = await fetch(`${KLING_API_BASE_URL}/v1/videos/motion-control`, {
      method: "POST",
      headers: getKlingHeaders(),
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    console.log(`[KlingService] Response ${response.status}:`, responseText);

    if (!response.ok) {
      throw new Error(`Kling API lỗi ${response.status}: ${responseText}`);
    }

    const json: any = JSON.parse(responseText);
    if (json.code !== 0) {
      throw new Error(`Kling API từ chối yêu cầu: ${json.message || JSON.stringify(json)}`);
    }

    const taskId = json.data?.task_id;
    if (!taskId) {
      throw new Error("Kling không trả về task_id hợp lệ");
    }

    console.log(`[KlingService] Motion control task created: ${taskId}`);
    return { taskId };
  },

  async getMotionControlTaskStatus(taskId: string): Promise<{
    status: "pending" | "processing" | "completed" | "failed";
    url?: string;
    error?: string;
  }> {
    if (!KLING_API_KEY) {
      throw new Error("Chưa cấu hình KLING_API_KEY trong biến môi trường.");
    }

    const response = await fetch(`${KLING_API_BASE_URL}/v1/videos/motion-control/${taskId}`, {
      headers: getKlingHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kling status check lỗi ${response.status}: ${errorText}`);
    }

    const json: any = await response.json();
    if (json.code !== 0) {
      throw new Error(`Kling API lỗi khi kiểm tra trạng thái: ${json.message || JSON.stringify(json)}`);
    }

    const taskData = json.data;
    const klingStatus: string = taskData?.task_status || "processing";
    const mappedStatus = mapKlingStatus(klingStatus);

    if (mappedStatus === "completed") {
      const videos: any[] = taskData?.task_result?.videos || [];
      const url = videos[0]?.url;
      return { status: "completed", url };
    }

    if (mappedStatus === "failed") {
      return { status: "failed", error: taskData?.task_status_msg || "Tạo video Kling thất bại" };
    }

    return { status: mappedStatus };
  },
};
