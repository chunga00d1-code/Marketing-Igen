import { createHash } from "crypto";
import { IMarketingCampaign } from "../../interface/marketing-campaign.interface";
import { IMarketingCampaignSlot } from "../../interface/marketing-campaign-slot.interface";
import { OpenRouterContentPart, openrouterChat } from "../openrouter.service";
import { API_COSTS } from "../wallet.service";

const MAX_IMAGES_PER_BATCH = 8;
const DOWNLOAD_CONCURRENCY = 3;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MEDIA_HOSTS = new Set([
  "drive.google.com",
  "lh3.googleusercontent.com",
  "res.cloudinary.com",
]);

type VisualAnalysis = NonNullable<IMarketingCampaignSlot["visualAnalysis"]>;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function getDriveFileId(url: string): string | null {
  return url.match(/\/file\/d\/([\w-]+)/)?.[1]
    || new URL(url).searchParams.get("id");
}

function resolveVisionUrl(driveUrl: string | undefined, directUrl: string | undefined): string {
  if (driveUrl) {
    const fileId = getDriveFileId(driveUrl);
    if (fileId) return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`;
  }
  if (!directUrl) throw new Error("Slot thiếu URL ảnh thật để phân tích.");
  return directUrl;
}

async function downloadImageAsDataUrl(url: string): Promise<string> {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:" || !ALLOWED_MEDIA_HOSTS.has(parsedUrl.hostname)) {
    throw new Error("URL ảnh thật không thuộc nguồn media được phép.");
  }

  const response = await fetch(parsedUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Không thể tải ảnh để phân tích (${response.status}).`);

  const mimeType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!mimeType.startsWith("image/")) {
    throw new Error(`Nguồn media không trả về dữ liệu ảnh hợp lệ (${mimeType || "không rõ định dạng"}).`);
  }

  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_IMAGE_BYTES) throw new Error("Ảnh vượt quá giới hạn 8 MB để phân tích.");

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Ảnh rỗng hoặc vượt quá giới hạn 8 MB để phân tích.");
  }
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function downloadWithBoundedConcurrency(urls: string[]): Promise<string[]> {
  const results: string[] = [];
  for (let index = 0; index < urls.length; index += DOWNLOAD_CONCURRENCY) {
    const batch = urls.slice(index, index + DOWNLOAD_CONCURRENCY);
    results.push(...await Promise.all(batch.map(downloadImageAsDataUrl)));
  }
  return results;
}

export class VisualAnalystAgentService {
  public static fingerprint(slot: IMarketingCampaignSlot, campaign: IMarketingCampaign): string {
    return createHash("sha256")
      .update(JSON.stringify({
        driveUrls: slot.realImageDriveUrls || [],
        directUrls: slot.realImageDirectUrls || [],
        ingestedUrls: slot.ingestedMedia?.map((item) => item.url) || [],
        sourceBrief: campaign.sourceBrief,
        topicBrief: slot.topicBrief,
        qualityMode: campaign.qualityMode || "premium",
      }))
      .digest("hex");
  }

  public static async analyze(
    slot: IMarketingCampaignSlot,
    campaign: IMarketingCampaign
  ): Promise<VisualAnalysis> {
    const driveUrls = slot.realImageDriveUrls || [];
    const directUrls = slot.realImageDirectUrls || [];
    const ingestedUrls = slot.ingestedMedia?.map((item) => item.url) || [];
    const sourceCount = Math.max(driveUrls.length, directUrls.length, ingestedUrls.length);
    if (sourceCount === 0) throw new Error("Slot chưa có ảnh thật để Vision Agent phân tích.");

    const selectedSourceUrls: string[] = [];
    const visionUrls: string[] = [];
    for (let index = 0; index < sourceCount; index++) {
      selectedSourceUrls.push(driveUrls[index] || directUrls[index] || ingestedUrls[index]);
      visionUrls.push(ingestedUrls[index] || resolveVisionUrl(driveUrls[index], directUrls[index]));
    }

    const responseSchema = {
      type: "object",
      properties: {
        summary: { type: "string" },
        subjects: { type: "array", items: { type: "string" } },
        visibleText: { type: "array", items: { type: "string" } },
        setting: { type: "string" },
        visualStyle: { type: "string" },
        mood: { type: "string" },
        factualDetails: { type: "array", items: { type: "string" } },
        marketingAngles: { type: "array", items: { type: "string" } },
        cautions: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "subjects", "visibleText", "setting", "visualStyle", "mood", "factualDetails", "marketingAngles", "cautions"],
    };
    const model = campaign.qualityMode === "budget"
      ? process.env.CAMPAIGN_VISION_BUDGET_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash"
      : process.env.GEMINI_HEAVY_MODEL || "gemini-3.5-flash";
    const batchResults: Record<string, unknown>[] = [];

    for (let offset = 0; offset < visionUrls.length; offset += MAX_IMAGES_PER_BATCH) {
      const batchUrls = visionUrls.slice(offset, offset + MAX_IMAGES_PER_BATCH);
      const dataUrls = await downloadWithBoundedConcurrency(batchUrls);
      const content: OpenRouterContentPart[] = [{
        type: "text",
        text: `Phân tích batch ${Math.floor(offset / MAX_IMAGES_PER_BATCH) + 1}/${Math.ceil(sourceCount / MAX_IMAGES_PER_BATCH)} của album ảnh thật cho một slot marketing.

Brief chiến dịch: ${campaign.sourceBrief}
Chủ đề slot: ${slot.topicBrief}
Mục tiêu: ${slot.objective}
Nền tảng: ${slot.platform}

Chỉ ghi nhận những gì thực sự nhìn thấy. Đọc chính xác chữ xuất hiện trong ảnh bằng OCR. Không tự suy diễn giá, tính năng, thương hiệu, công dụng hoặc danh tính con người. Tách rõ chi tiết quan sát được và gợi ý marketing. Nếu không chắc chắn, ghi vào cautions.`,
      }];
      dataUrls.forEach((dataUrl, index) => {
        content.push({ type: "text", text: `Ảnh ${offset + index + 1}/${sourceCount}:` });
        content.push({ type: "image_url", image_url: { url: dataUrl } });
      });

      const result = await openrouterChat({
        model,
        messages: [
          {
            role: "system",
            content: "Bạn là Vision Analyst cho chiến dịch marketing. Phân tích ảnh khách quan, chi tiết, không bịa đặt và trả về JSON tiếng Việt.",
          },
          { role: "user", content },
        ],
        temperature: 0.2,
        jsonMode: true,
        responseSchema,
      });
      const parsed = JSON.parse(result.text) as Record<string, unknown>;
      if (!String(parsed.summary || "").trim()) {
        throw new Error("Vision Agent không trả về bản phân tích ảnh hợp lệ.");
      }
      batchResults.push(parsed);
    }

    const uniqueStrings = (key: string) => [...new Set(batchResults.flatMap((item) => asStringArray(item[key])))];
    const joinFields = (key: string) => [...new Set(batchResults.map((item) => String(item[key] || "").trim()).filter(Boolean))].join("; ");
    const summary = batchResults
      .map((item, index) => `Nhóm ${index + 1}: ${String(item.summary || "").trim()}`)
      .join("\n");
    const batchCount = batchResults.length;

    return {
      fingerprint: this.fingerprint(slot, campaign),
      sourceUrls: selectedSourceUrls,
      summary,
      subjects: uniqueStrings("subjects"),
      visibleText: uniqueStrings("visibleText"),
      setting: joinFields("setting"),
      visualStyle: joinFields("visualStyle"),
      mood: joinFields("mood"),
      factualDetails: uniqueStrings("factualDetails"),
      marketingAngles: uniqueStrings("marketingAngles"),
      cautions: uniqueStrings("cautions"),
      model,
      analyzedAt: new Date(),
      cost: API_COSTS.CAMPAIGN_VISION * batchCount,
    };
  }

  public static formatForCopywriter(analysis: VisualAnalysis): string {
    return `PHÂN TÍCH ẢNH THẬT CỦA SLOT (ưu tiên sự thật trực quan):
- Tóm tắt: ${analysis.summary}
- Chủ thể: ${analysis.subjects.join("; ") || "Không xác định"}
- Chữ nhìn thấy trong ảnh: ${analysis.visibleText.join("; ") || "Không có"}
- Bối cảnh: ${analysis.setting || "Không xác định"}
- Phong cách hình ảnh: ${analysis.visualStyle || "Không xác định"}
- Cảm xúc: ${analysis.mood || "Không xác định"}
- Chi tiết quan sát được: ${analysis.factualDetails.join("; ") || "Không có"}
- Góc nội dung phù hợp: ${analysis.marketingAngles.join("; ") || "Không có"}
- Điều không chắc chắn/cần tránh: ${analysis.cautions.join("; ") || "Không có"}

Không được biến gợi ý marketing thành sự thật sản phẩm nếu brief hoặc ảnh không xác nhận.`;
  }
}
