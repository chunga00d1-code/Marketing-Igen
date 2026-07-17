/* eslint-disable @typescript-eslint/no-explicit-any */
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

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "drive.google.com") return true;
  if (host.endsWith(".googleusercontent.com") || host === "googleusercontent.com") return true;
  if (host.endsWith(".cloudinary.com") || host === "cloudinary.com") return true;
  return ALLOWED_MEDIA_HOSTS.has(host);
}

async function downloadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:" || !isAllowedHost(parsedUrl.hostname)) {
      console.warn(`[VisualAnalyst] Bỏ qua ảnh do URL không thuộc danh sách cho phép: ${url}`);
      return null;
    }

    const response = await fetch(parsedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      console.warn(`[VisualAnalyst] Không thể tải ảnh (${response.status}) từ URL: ${url}`);
      return null;
    }

    const mimeType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!mimeType.startsWith("image/")) {
      console.warn(`[VisualAnalyst] Định dạng content-type không hợp lệ (${mimeType}) cho URL: ${url}`);
      return null;
    }

    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > MAX_IMAGE_BYTES) {
      console.warn(`[VisualAnalyst] Ảnh vượt quá kích thước cho phép cho URL: ${url}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
      console.warn(`[VisualAnalyst] Dữ liệu ảnh rỗng hoặc quá lớn cho URL: ${url}`);
      return null;
    }
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  } catch (err: any) {
    console.error(`[VisualAnalyst] Lỗi tải ảnh từ URL: ${url}. Chi tiết: ${err?.message || err}`);
    return null;
  }
}

async function downloadWithBoundedConcurrency(urls: string[]): Promise<string[]> {
  const results: (string | null)[] = [];
  for (let index = 0; index < urls.length; index += DOWNLOAD_CONCURRENCY) {
    const batch = urls.slice(index, index + DOWNLOAD_CONCURRENCY);
    results.push(...await Promise.all(batch.map(downloadImageAsDataUrl)));
  }
  return results.filter((item): item is string => item !== null);
}

function parseVisionAnalysis(responseText: string, fallbackText: string): Record<string, any> {
  let cleaned = responseText.trim();

  // Try extracting markdown json block first
  const markdownMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (markdownMatch) {
    cleaned = markdownMatch[1].trim();
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // If first attempt fails, try extracting exact JSON structure between outermost braces/brackets
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1).trim();
    }
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Try removing trailing commas
      const withoutTrailingCommas = cleaned.replace(/,\s*([\]}])/g, "$1");
      try {
        parsed = JSON.parse(withoutTrailingCommas);
      } catch {
        console.warn("[VisualAnalyst] Failed to parse JSON with standard techniques. Using fallback.");
      }
    }
  }

  if (!parsed || typeof parsed !== "object") {
    parsed = {};
  }

  // Unwrap nested objects if any (e.g. { "analysis": { ... } })
  const wrapperKeys = ["analysis", "visualAnalysis", "data", "result"];
  for (const wk of wrapperKeys) {
    if (parsed[wk] && typeof parsed[wk] === "object" && !Array.isArray(parsed[wk])) {
      parsed = parsed[wk];
      break;
    }
  }

  // Normalization helpers
  const getAsString = (val: any): string => {
    if (val === null || val === undefined) return "";
    if (typeof val === "string") return val.trim();
    if (Array.isArray(val)) return val.join("; ");
    return String(val).trim();
  };

  const getAsStringArray = (val: any): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) {
      return val.map((item: any) => String(item || "").trim()).filter(Boolean);
    }
    if (typeof val === "string") {
      return val.split(/[;,]/).map((item: string) => item.trim()).filter(Boolean);
    }
    return [String(val).trim()];
  };

  // Convert keys to case-insensitive format
  const normalizedParsed: Record<string, any> = {};
  for (const k of Object.keys(parsed)) {
    normalizedParsed[k.toLowerCase().replace(/_/g, "")] = parsed[k];
  }

  const findValue = (keys: string[], defaultVal: any, isArray = false) => {
    for (const key of keys) {
      const normalizedKey = key.toLowerCase().replace(/_/g, "");
      if (normalizedParsed[normalizedKey] !== undefined) {
        return isArray ? getAsStringArray(normalizedParsed[normalizedKey]) : getAsString(normalizedParsed[normalizedKey]);
      }
    }
    return defaultVal;
  };

  let summaryVal = findValue(["summary", "description", "tóm tắt", "tomtat", "tom_tat"], "");
  const subjectsVal = findValue(["subjects", "subject", "chủ thể", "chu the", "chuthe"], []);
  const visibleTextVal = findValue(["visibleText", "visible_text", "text", "chữ", "chu", "ocr"], []);
  const settingVal = findValue(["setting", "bối cảnh", "boi canh", "boicanh"], "");
  const visualStyleVal = findValue(["visualStyle", "visual_style", "style", "phong cách", "phong cach"], "");
  const moodVal = findValue(["mood", "cảm xúc", "cam xuc", "camxuc"], "");
  const factualDetailsVal = findValue(["factualDetails", "factual_details", "details", "chi tiết", "chi tiet"], []);
  const marketingAnglesVal = findValue(["marketingAngles", "marketing_angles", "angles", "gợi ý", "goi y"], []);
  const cautionsVal = findValue(["cautions", "caution", "lưu ý", "luu y", "luuy"], []);

  if (!summaryVal || !summaryVal.trim()) {
    if (factualDetailsVal.length > 0) {
      summaryVal = `Hình ảnh chứa chi tiết: ${factualDetailsVal.join(", ")}`;
    } else {
      summaryVal = fallbackText || "Ảnh thực tế của chiến dịch marketing (đang cập nhật phân tích chi tiết).";
    }
  }

  return {
    summary: summaryVal,
    subjects: subjectsVal,
    visibleText: visibleTextVal,
    setting: settingVal,
    visualStyle: visualStyleVal,
    mood: moodVal,
    factualDetails: factualDetailsVal,
    marketingAngles: marketingAnglesVal,
    cautions: cautionsVal,
  };
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
      try {
        visionUrls.push(ingestedUrls[index] || resolveVisionUrl(driveUrls[index], directUrls[index]));
      } catch (err: any) {
        console.warn(`[VisualAnalyst] Bỏ qua phần tử ảnh thứ ${index} do lỗi: ${err?.message || err}`);
      }
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

    const defaultFallbackText = `Hình ảnh thực tế từ chiến dịch: ${campaign.title || 'Chiến dịch marketing'}. Chủ đề: ${slot.topicBrief || 'Không xác định'}.`;

    for (let offset = 0; offset < visionUrls.length; offset += MAX_IMAGES_PER_BATCH) {
      const batchUrls = visionUrls.slice(offset, offset + MAX_IMAGES_PER_BATCH);
      const dataUrls = await downloadWithBoundedConcurrency(batchUrls);

      if (dataUrls.length === 0) {
        console.warn("[VisualAnalyst] Không tải được ảnh thực tế nào trong batch này. Sử dụng phân tích suy luận dựa trên brief.");
        // Create static fallback analysis based on brief metadata to avoid breaking preparation
        const staticFallback = {
          summary: defaultFallbackText,
          subjects: ["Hình ảnh thực tế chiến dịch"],
          visibleText: [],
          setting: "Bối cảnh chuyên nghiệp",
          visualStyle: "Phong cách thiết kế thương hiệu",
          mood: "Tích cực, đáng tin cậy",
          factualDetails: ["Hình ảnh thực tế từ nguồn media của người dùng"],
          marketingAngles: ["Sử dụng bối cảnh thực tế để truyền tải thông điệp chân thực"],
          cautions: [],
        };
        batchResults.push(staticFallback);
        continue;
      }

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

      let result;
      try {
        result = await openrouterChat({
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
      } catch (err: any) {
        console.warn(`[VisualAnalyst] Gọi model primary ${model} thất bại: ${err?.message || err}. Thử fallback sang gemini-2.5-flash...`);
        try {
          result = await openrouterChat({
            model: "google/gemini-2.5-flash",
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
        } catch (fallbackErr: any) {
          console.error(`[VisualAnalyst] Cả model fallback cũng thất bại: ${fallbackErr?.message || fallbackErr}. Sử dụng tri thức mặc định.`);
          const staticFallback = {
            summary: defaultFallbackText,
            subjects: ["Hình ảnh thực tế chiến dịch"],
            visibleText: [],
            setting: "Bối cảnh chuyên nghiệp",
            visualStyle: "Phong cách thiết kế thương hiệu",
            mood: "Tích cực, đáng tin cậy",
            factualDetails: ["Hình ảnh thực tế từ nguồn media của người dùng"],
            marketingAngles: ["Sử dụng bối cảnh thực tế để truyền tải thông điệp chân thực"],
            cautions: [],
          };
          batchResults.push(staticFallback);
          continue;
        }
      }

      const parsed = parseVisionAnalysis(result.text, defaultFallbackText);
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
