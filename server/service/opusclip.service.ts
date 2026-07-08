import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const OPUSCLIP_API_KEY = process.env.OPUSCLIP_API_KEY || "";
const OPUSCLIP_API_BASE_URL = process.env.OPUSCLIP_API_BASE_URL || "https://api.opus.pro";
const OPUSCLIP_WEBHOOK_URL = process.env.OPUSCLIP_WEBHOOK_URL || "";

console.log(`[OpusClip Service] API Key status: ${OPUSCLIP_API_KEY ? `Present (${OPUSCLIP_API_KEY.substring(0, 10)}...)` : "Missing"}`);

function getHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${OPUSCLIP_API_KEY}`,
  };
}

// Bộ lưu trữ salt để chống replay attack (trong production thực tế nên dùng Redis TTL)
const seenSalts = new Set<string>();

export const opusclipService = {
  /**
   * Tạo dự án cắt clip AI từ video dài
   */
  async createProject(params: {
    videoUrl: string;
    name?: string;
    lengthOption?: "auto" | "<30s" | "30s-60s" | "60s-90s" | "90s-3m";
    sourceLang?: string;
    brandTemplateId?: string;
  }): Promise<any> {
    if (!OPUSCLIP_API_KEY) {
      throw new Error("Chưa cấu hình OPUSCLIP_API_KEY trong biến môi trường.");
    }

    const { videoUrl, name, lengthOption = "auto", sourceLang = "auto", brandTemplateId } = params;

    // Phân tách thời lượng clip mong muốn
    let clipDurations: number[][] = [];
    if (lengthOption === "<30s") {
      clipDurations = [[0, 30]];
    } else if (lengthOption === "30s-60s") {
      clipDurations = [[30, 60]];
    } else if (lengthOption === "60s-90s") {
      clipDurations = [[60, 90]];
    } else if (lengthOption === "90s-3m") {
      clipDurations = [[90, 180]];
    }

    // Thiết lập webhook callback
    const conclusionActions = [];
    if (OPUSCLIP_WEBHOOK_URL) {
      conclusionActions.push({
        type: "WEBHOOK",
        url: OPUSCLIP_WEBHOOK_URL,
        notifyFailure: true,
      });
    }

    const body: Record<string, any> = {
      videoUrl,
      conclusionActions,
      importPref: {
        sourceLang,
      },
      curationPref: {
        genre: "Auto",
        clipDurations,
      },
    };

    if (brandTemplateId) {
      body.brandTemplateId = brandTemplateId;
    }

    console.log(`[OpusClipService] Creating project with URL: ${videoUrl}, Config:`, JSON.stringify(body));

    const response = await fetch(`${OPUSCLIP_API_BASE_URL}/api/clip-projects`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    console.log(`[OpusClipService] Response Status: ${response.status}`);

    if (!response.ok) {
      throw new Error(`OpusClip API error (${response.status}): ${responseText}`);
    }

    return JSON.parse(responseText);
  },

  /**
   * Lấy chi tiết dự án cắt clip
   */
  async getProjectDetail(projectId: string): Promise<any> {
    if (!OPUSCLIP_API_KEY) {
      throw new Error("Chưa cấu hình OPUSCLIP_API_KEY.");
    }

    const response = await fetch(`${OPUSCLIP_API_BASE_URL}/api/clip-projects/${projectId}`, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpusClip Detail error (${response.status}): ${errText}`);
    }

    return response.json();
  },

  /**
   * Lấy danh sách clips ngắn (exportable clips) của dự án
   */
  async getClips(projectId: string, pageNum: number = 1, pageSize: number = 50): Promise<any> {
    if (!OPUSCLIP_API_KEY) {
      throw new Error("Chưa cấu hình OPUSCLIP_API_KEY.");
    }

    const url = `${OPUSCLIP_API_BASE_URL}/api/exportable-clips?q=findByProjectId&projectId=${projectId}&pageNum=${pageNum}&pageSize=${pageSize}`;
    const response = await fetch(url, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpusClip Clips query error (${response.status}): ${errText}`);
    }

    return response.json();
  },

  /**
   * Lấy danh sách Brand Templates hiện có trong tổ chức
   */
  async getBrandTemplates(): Promise<any> {
    if (!OPUSCLIP_API_KEY) {
      throw new Error("Chưa cấu hình OPUSCLIP_API_KEY.");
    }

    const response = await fetch(`${OPUSCLIP_API_BASE_URL}/api/brand-templates?q=mine`, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpusClip Templates error (${response.status}): ${errText}`);
    }

    return response.json();
  },

  /**
   * Xác thực chữ ký webhook từ OpusClip
   * Đảm bảo tính toàn vẹn (integrity) và nguồn gốc (authenticity)
   */
  verifyWebhookSignature(rawBody: string, headers: Record<string, string | undefined>): boolean {
    const salt = headers["x-opus-salt"];
    const signature = headers["x-opus-signature"];
    const timestampStr = headers["x-opus-timestamp"];

    if (!salt || !signature || !timestampStr) {
      console.warn("[OpusClipService] Webhook rejected: Missing security headers.");
      return false;
    }

    const timestamp = parseInt(timestampStr, 10);
    if (Number.isNaN(timestamp)) {
      console.warn("[OpusClipService] Webhook rejected: Invalid timestamp format.");
      return false;
    }

    // 1. Kiểm tra tính tươi mới của request (Timestamp freshness check - tối đa 5 phút)
    const currentUnix = Math.floor(Date.now() / 1000);
    if (Math.abs(currentUnix - timestamp) > 300) {
      console.warn(`[OpusClipService] Webhook rejected: Stale request. Latency: ${currentUnix - timestamp}s`);
      return false;
    }

    // 2. Chống Replay attack bằng cách lưu giữ các muối (salt) đã xử lý
    if (seenSalts.has(salt)) {
      console.warn(`[OpusClipService] Webhook rejected: Replay attack detected with salt: ${salt}`);
      return false;
    }

    // 3. Tính toán chữ ký HMAC-SHA256 (secretKey, body + salt)
    const expectedSignature = crypto
      .createHmac("sha256", OPUSCLIP_API_KEY)
      .update(rawBody + salt)
      .digest("hex");

    // 4. So sánh chữ ký ở chế độ Constant-time để tránh Timing attack
    try {
      const receivedBuffer = Buffer.from(signature, "hex");
      const expectedBuffer = Buffer.from(expectedSignature, "hex");

      const isValid = receivedBuffer.length === expectedBuffer.length && 
        crypto.timingSafeEqual(receivedBuffer, expectedBuffer);

      if (isValid) {
        // Lưu trữ salt lại để chống replay (clear bớt nếu bộ nhớ quá tải, ở đây đơn giản dùng Set)
        seenSalts.add(salt);
        // Tự động giải phóng bớt bộ nhớ nếu kích thước lưu trữ quá lớn
        if (seenSalts.size > 5000) {
          const firstElement = seenSalts.values().next().value;
          if (firstElement !== undefined) {
            seenSalts.delete(firstElement);
          }
        }
        return true;
      }
    } catch (e: any) {
      console.error("[OpusClipService] Error verifying signature:", e.message);
    }

    console.warn("[OpusClipService] Webhook rejected: Signature mismatch.");
    return false;
  }
};
