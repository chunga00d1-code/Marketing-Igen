/* eslint-disable @typescript-eslint/no-explicit-any, prefer-const */
import { cloudinaryService } from "../cloudinary.service";
import { loadAgentSkill } from "../agents/campaign-utils";
import {
  buildFaithfulVisualGuardrail,
  extractSourceBrief,
  GEMINI_HEAVY_MODEL,
  GEMINI_TEXT_MODEL,
  generateText,
  safeParseJson,
  Type,
} from "./core";

export class GeminiMarketingService {
  private _imageService?: { generateImage: (prompt: string, options?: any) => Promise<any> };
  private _videoService?: { generateVideo: (prompt: string, durationSec: number, options?: any) => Promise<any> };

  setMediaGenerators(generators: {
    imageService: { generateImage: (prompt: string, options?: any) => Promise<any> };
    videoService: { generateVideo: (prompt: string, durationSec: number, options?: any) => Promise<any> };
  }) {
    this._imageService = generators.imageService;
    this._videoService = generators.videoService;
  }

  async conductWebResearch(prompt: string): Promise<string> {
    try {
      console.log(`[geminiService] Conducting web research with OpenRouter for prompt: "${prompt}"`);

      const systemInstruction = `Bạn là một chuyên gia nghiên cứu thị trường và social listening. Hãy thực hiện tìm kiếm trên internet và các mạng xã hội để tổng hợp thông tin chi tiết về chủ đề sau:
"${prompt}"

Yêu cầu báo cáo bao gồm:
1. Xu hướng hiện tại (Trends) & các cuộc thảo luận liên quan trên mạng xã hội (Facebook, TikTok, v.v.).
2. Những vấn đề khó khăn, nỗi đau của khách hàng mục tiêu (Target Audience Pain Points).
3. Các góc tiếp cận/nhìn nhận độc đáo từ đối thủ cạnh tranh (Competitor Angles).
4. Đề xuất các công thức viết bài/loại hình nội dung thành công cho chủ đề này.

Hãy viết báo cáo bằng tiếng Việt, định dạng Markdown rõ ràng, chuyên nghiệp và súc tích.`;

      const response = await generateText("perplexity/sonar", prompt, {
        systemInstruction,
        temperature: 0.5,
        maxRetries: 1,
        timeoutMs: 25_000,
      });

      const researchText = response.text || "";
      console.log(`[geminiService] Web research completed via OpenRouter. Report length: ${researchText.length} characters.`);
      return researchText;
    } catch (error: any) {
      console.error("[geminiService] Web research via OpenRouter failed:", error);
      return `Lỗi trong quá trình nghiên cứu tự động: ${error?.message || error}`;
    }
  }

  normalizeMarketingChannel(rawChannel: string): string {
    if (!rawChannel) return "Facebook";
    const c = String(rawChannel).toLowerCase().trim();
    if (c.includes("facebook") || c === "fb") return "Facebook";
    if (c.includes("tiktok") || c.includes("tik tok")) return "TikTok";
    if (c.includes("linkedin") || c.includes("linked in")) return "LinkedIn";
    if (c.includes("instagram") || c === "ig" || c.includes("insta")) return "Instagram";
    if (c.includes("zalo")) return "Zalo";
    return "Facebook";
  }

  sanitizeHashtags(rawHashtags: unknown, fallbackTitle: string): string[] {
    const hashtags = Array.isArray(rawHashtags) ? rawHashtags : [];
    const normalized = hashtags
      .map((tag) => String(tag || "").trim())
      .filter(Boolean)
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
      .map((tag) => tag.replace(/\s+/g, ""))
      .filter((tag, index, arr) => arr.indexOf(tag) === index);

    if (normalized.length > 0) {
      return normalized.slice(0, 6);
    }

    const fallback = String(fallbackTitle || "")
      .split(/[^\p{L}\p{N}]+/u)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3)
      .slice(0, 3)
      .map((part) => `#${part}`);

    return fallback.length > 0 ? fallback : ["#Marketing"];
  }

  async getMarketingSuggestions(): Promise<string[]> {
    const fallbackSuggestions = [
      "Chiến dịch tri ân khách hàng thân thiết và tặng quà tri ân kỷ niệm thành lập",
      "Chương trình khuyến mãi mùa hè giảm giá cực sốc kích cầu mua sắm",
      "Sự kiện ra mắt dòng sản phẩm mới hướng tới phong cách sống xanh bảo vệ môi trường",
    ];

    if (!process.env.OPENROUTER_API_KEY) {
      return fallbackSuggestions;
    }

    try {
      const prompt = `Bạn là trợ lý AI Marketing chuyên nghiệp. Hãy đề xuất đúng 3 ý tưởng/chủ đề chiến dịch marketing chung, mang tính phổ quát cao để nhiều loại hình doanh nghiệp hoặc công ty khác nhau đều có thể áp dụng được (ví dụ: chiến dịch khuyến mãi theo mùa, sự kiện tri ân khách hàng, ra mắt dòng sản phẩm mới, chương trình ưu đãi đặc biệt).
Mỗi ý tưởng đề xuất phải là một câu ngắn gọn (dưới 25 từ) sẵn sàng làm mục tiêu marketing, ví dụ: 'Chiến dịch tri ân khách hàng thân thiết và tặng quà tri ân'.
Trả về kết quả ở định dạng JSON phù hợp chính xác với cấu trúc yêu cầu.`;

      const response = await generateText(
        GEMINI_TEXT_MODEL,
        prompt,
        {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Danh sách đúng 3 ý tưởng/chủ đề gợi ý ngắn gọn",
              },
            },
            required: ["suggestions"],
          },
        }
      );

      const responseText = response.text || "{}";
      const parsedData = safeParseJson(responseText);
      return parsedData.suggestions || fallbackSuggestions;
    } catch (error: any) {
      console.error("[geminiService.getMarketingSuggestions] Fallback to mock suggestions:", error);
      return fallbackSuggestions;
    }
  }

  /**
   * Content Pillars
   */
  async analyzeMarketingPillars(campaignTopic: string, images?: string[]): Promise<{ pillars: any[]; isMock: boolean }> {
    const getMockPillars = () => {
      let mockPillars = [
        {
          id: "giao_duc_gia_tri",
          title: "Giáo dục & Giá trị hữu ích",
          ratio: "35% tỷ trọng",
          description: `Giải đáp trực quan, hướng dẫn tối ưu và chia sẻ kiến thức nền tảng giúp khách hàng hiểu sâu về giá trị dòng sản phẩm liên quan "${campaignTopic || "Sản phẩm công nghệ"}".`,
        },
        {
          id: "cau_chuyen_social_proof",
          title: "Trải nghiệm & Câu chuyện thực tế",
          ratio: "40% tỷ trọng",
          description: `Kịch bản review thực tế, kết quả và phát biểu từ khách hàng uy tín, tạo dựng lòng tin tuyệt đối cho thương hiệu.`,
        },
        {
          id: "uu_dai_tuong_tac",
          title: "Ưu đãi & Kích cầu hành động",
          ratio: "25% tỷ trọng",
          description:
            "Chiến dịch giá hời, đặc quyền dùng thử hoặc voucher độc quyền nhằm thúc giục khách hàng ra quyết định mua sắm ngay lập tức.",
        },
      ];

      const topicLower = campaignTopic ? campaignTopic.toLowerCase() : "";
      if (topicLower.includes("bàn phím") || topicLower.includes("keyboard") || topicLower.includes("workspace")) {
        mockPillars = [
          {
            id: "kien_thuc_cong_thai_hoc",
            title: "Kiến thức & Trải nghiệm Công thái học",
            ratio: "35% tỷ trọng",
            description:
              "Hướng dẫn tư thế ngồi gõ phím chuẩn khoa học, cách test switch phím cơ, mẹo lập trình không mỏi tay cho coder chuyên nghiệp.",
          },
          {
            id: "review_coder_thuc_te",
            title: "Đánh giá & Trải nghiệm Lập trình viên",
            ratio: "40% tỷ trọng",
            description:
              "Cảm âm đằm chắc của iGen Workspace V2, quá trình tăng 150% hiệu suất viết mã của kiến trúc sư phần mềm.",
          },
          {
            id: "uu_dai_ra_mat",
            title: "Ưu đãi đặc quyền Early Bird",
            ratio: "25% tỷ trọng",
            description:
              "Quà tặng kệ kê tay gỗ sồi cao cấp và chiết khấu 10% ra mắt độc quyền dành cho 50 khách hàng đầu tiên.",
          },
        ];
      } else if (topicLower.includes("tai nghe") || topicLower.includes("nghe nhạc") || topicLower.includes("pro max")) {
        mockPillars = [
          {
            id: "am_thanh_bao_ve_tai",
            title: "Khoa học Âm thanh & Sức khỏe tai",
            ratio: "30% tỷ trọng",
            description:
              "Nguyên lý hoạt động của chống ồn chủ động ANC và cách bảo vệ thính lực khi đeo tai nghe cường độ cao thường xuyên.",
          },
          {
            id: "phong_cach_unboxing",
            title: "Đập hộp & Định hình Phong cách sống",
            ratio: "45% tỷ trọng",
            description:
              "Phối đồ thời trang dạo phố sành điệu cùng Pro Max, tạo phong thái năng động tự tin cho giới trẻ công nghệ.",
          },
          {
            id: "uu_dai_gio_vang",
            title: "Flash Sale giờ vàng - Săn cực đỉnh",
            ratio: "25% tỷ trọng",
            description:
              "Cơ hội săn deal giảm giá sốc đến 45% độc quyền trong khung giờ trưa từ 12h - 14h, số lượng cực hạn.",
          },
        ];
      } else if (topicLower.includes("vip") || topicLower.includes("voucher") || topicLower.includes("tri ân")) {
        mockPillars = [
          {
            id: "dac_quyen_thanh_vien",
            title: "Giá trị Đặc quyền Tri ân",
            ratio: "35% tỷ trọng",
            description:
              "Chi tiết đặc quyền thăng hạng thành viên, chính sách bảo hành trọn đời và tích điểm đổi quà VIP của hệ sinh thái iGen.",
          },
          {
            id: "cau_chuyen_thanh_cong",
            title: "Khoảnh khắc & Khách hàng VIP",
            ratio: "40% tỷ trọng",
            description:
              "Ghi dấu những bức ảnh, cuộc hẹn và cảm ơn chân thành từ iGen Marketing tới các đối tác doanh nghiệp lớn đồng hành lâu năm.",
          },
          {
            id: "uu_dai_han_muc",
            title: "Quà tặng và Voucher Độc bản",
            ratio: "25% tỷ trọng",
            description:
              "Gửi mã voucher VIP-10 độc bản kèm hộp quà tặng chạm khắc thủ công đặc biệt thiết kế riêng cho khách hàng VIP.",
          },
        ];
      }

      return mockPillars;
    };

    if (!process.env.OPENROUTER_API_KEY) {
      return { pillars: getMockPillars(), isMock: true };
    }

    try {
      const prompt = `Phân tích mục tiêu/chủ đề chiến dịch marketing sau: "${campaignTopic}"
Hãy đề xuất chính xác 3 trụ cột nội dung cốt lõi (Content Pillars) giúp doanh nghiệp định hình khung nội dung (framework) chuẩn chỉnh ngay từ đầu, đảm bảo tỷ lệ nội dung phân bổ đa dạng, tránh việc chỉ đăng bài bán hàng gây nhàm chán và mất tương tác.

Mỗi trụ cột phải có thông tin:
1. id: chuỗi ngắn gọn, không dấu cách, viết thường (ví dụ: "kien_thuc_huong_dan", "trai_nghiem_khach_hang", "khuyen_mai_dac_quyen")
2. title: Tiêu đề trụ cột nội dung tối ưu sáng tạo bằng tiếng Việt (Ví dụ: "Giáo dục & Hướng dẫn", "Câu chuyện khách hàng", "Ưu đãi & Khuyến mãi", "Giá trị cốt lõi")
3. ratio: Tỷ lệ phần trăm phân bổ hợp lý hiển thị dưới dạng chuỗi (Ví dụ: "35% tỷ trọng", "40% tỷ trọng") đảm bảo tổng 3 cái là 100%. Đa dạng tỷ trọng, tránh bán hàng quá nhiều.
4. description: Mô tả ngắn gọn trực quan bằng tiếng Việt hướng dẫn cách triển khai cụ thể trụ cột này đối với chiến dịch "${campaignTopic}".

Trả về kết quả ở định dạng JSON phù hợp chính xác với cấu trúc yêu cầu.`;

      const response = await generateText(
        GEMINI_TEXT_MODEL,
        prompt,
        {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              pillars: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING, description: "ID ngắn gọn viết liền không dấu" },
                    title: { type: Type.STRING, description: "Tiêu đề tiếng Việt của trụ cột" },
                    ratio: { type: Type.STRING, description: "Tỷ lệ phân bổ" },
                    description: { type: Type.STRING, description: "Mô tả triển khai chi tiết" },
                  },
                  required: ["id", "title", "ratio", "description"],
                },
                description: "Danh sách đúng 3 trụ cột nội dung",
              },
            },
            required: ["pillars"],
          },
          images
        }
      );

      const responseText = response.text || "{}";
      const parsedData = safeParseJson(responseText);
      return { pillars: parsedData.pillars || [], isMock: false };
    } catch (error: any) {
      console.error("[geminiService.analyzeMarketingPillars] Error, fallback to mock pillars:", error);
      return { pillars: getMockPillars(), isMock: true };
    }
  }

  /**
   * Thay thế 1 Content Pillar bằng 1 Trụ cột khác mới hoàn toàn
   */
  async swapMarketingPillar(
    campaignTopic: string,
    currentPillars: any[],
    pillarIdToReplace: string,
    images?: string[]
  ): Promise<{ pillar: any; isMock: boolean }> {
    const getMockSwapPillar = () => {
      const replacementOptions = [
        {
          id: "kien_thuc_chuyen_sau",
          title: "Pillar D: Kiến thức chuyên sâu & Khác biệt",
          ratio: "35% tỷ trọng",
          description: "Chia sẻ những phân tích độc quyền, thông số kỹ thuật ấn tượng và so sánh chi tiết để chứng minh tính ưu việt vượt trội của sản phẩm.",
        },
        {
          id: "phong_cach_loi_song",
          title: "Pillar E: Phong cách sống & Cảm hứng",
          ratio: "30% tỷ trọng",
          description: "Truyền tải thông điệp tích cực, xây dựng phong cách cá nhân hiện đại và kết nối sản phẩm với thói quen hàng ngày của khách hàng mục tiêu.",
        },
        {
          id: "tu_ong_tuong_tac",
          title: "Pillar F: Hỏi đáp & Tương tác Cộng đồng",
          ratio: "25% tỷ trọng",
          description: "Tổ chức các buổi mini-game, thảo luận mở hoặc giải đáp thắc mắc trực tiếp nhằm gắn kết người dùng và gia tăng tỷ lệ phản hồi tự nhiên.",
        },
        {
          id: "cam_nhan_chuyen_gia",
          title: "Pillar G: Góc nhìn Chuyên gia & Uy tín",
          ratio: "40% tỷ trọng",
          description: "Trích dẫn nhận xét từ các chuyên gia đầu ngành, người có sức ảnh hưởng (KOLs) để bảo chứng chất lượng và nâng cao vị thế thương hiệu.",
        }
      ];

      const existingIds = new Set(currentPillars.map(p => p.id));
      const available = replacementOptions.filter(opt => !existingIds.has(opt.id));
      const selected = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : replacementOptions[0];

      const targetPillar = currentPillars.find(p => p.id === pillarIdToReplace);
      if (targetPillar) {
        selected.ratio = targetPillar.ratio;
      }
      return selected;
    };

    if (!process.env.OPENROUTER_API_KEY) {
      return { pillar: getMockSwapPillar(), isMock: true };
    }

    try {
      const existingPillarsStr = currentPillars
        .map(p => `- ID: "${p.id}", Tiêu đề: "${p.title}", Mô tả: "${p.description}"`)
        .join("\n");

      const toReplace = currentPillars.find(p => p.id === pillarIdToReplace);
      const replaceStr = toReplace
        ? `ID: "${toReplace.id}", Tiêu đề: "${toReplace.title}" (Tỷ lệ phân bổ: ${toReplace.ratio})`
        : pillarIdToReplace;

      const prompt = `Phân tích mục tiêu/chủ đề chiến dịch marketing sau: "${campaignTopic}"
Hiện tại, chúng tôi đang sử dụng các trụ cột nội dung (Content Pillars) sau đây:
${existingPillarsStr}

Chúng tôi muốn THAY THẾ (đổi) trụ cột sau đây:
${replaceStr}

YÊU CẦU:
Hãy đề xuất 1 trụ cột nội dung (Content Pillar) mới và hoàn toàn KHÁC BIỆT so với các trụ cột hiện có ở trên để thay thế cho trụ cột muốn đổi. Trụ cột mới này phải bổ trợ tốt cho chiến dịch và mục tiêu "${campaignTopic}".
Trụ cột mới phải có thông tin cấu trúc sau:
1. id: chuỗi ngắn gọn, không dấu cách, viết thường (ví dụ: "kien_thuc_chuyen_sau", "goc_nhin_chuyen_gia") và KHÔNG ĐƯỢC TRÙNG với bất kỳ ID nào của các trụ cột hiện tại.
2. title: Tiêu đề trụ cột nội dung mới tối ưu bằng tiếng Việt (Ví dụ: "Pillar D: Kiến thức chuyên sâu", "Pillar E: Phong cách sống").
3. ratio: Tỷ lệ phân bổ hợp lý hiển thị dưới dạng chuỗi (Ví dụ: "35% tỷ trọng"). Hãy giữ nguyên tỷ lệ của trụ cột cũ là: "${toReplace?.ratio || "33% tỷ trọng"}".
4. description: Mô tả ngắn gọn trực quan bằng tiếng Việt hướng dẫn cách triển khai cụ thể trụ cột này đối với chiến dịch "${campaignTopic}".

Trả về kết quả ở định dạng JSON phù hợp chính xác với cấu trúc yêu cầu.`;

      const response = await generateText(
        GEMINI_TEXT_MODEL,
        prompt,
        {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, description: "ID ngắn gọn viết liền không dấu, không trùng ID hiện tại" },
              title: { type: Type.STRING, description: "Tiêu đề tiếng Việt của trụ cột" },
              ratio: { type: Type.STRING, description: "Tỷ lệ phân bổ (giữ nguyên tỷ lệ cũ)" },
              description: { type: Type.STRING, description: "Mô tả triển khai chi tiết" },
            },
            required: ["id", "title", "ratio", "description"],
          },
          images
        }
      );

      const responseText = response.text || "{}";
      const parsedPillar = safeParseJson(responseText);
      return { pillar: parsedPillar, isMock: false };
    } catch (error: any) {
      console.error("[geminiService.swapMarketingPillar] Error, fallback to mock swap pillar:", error);
      return { pillar: getMockSwapPillar(), isMock: true };
    }
  }

  /**
   * Phát sinh bản nháp ý tưởng chiến dịch
   */
  async generateMarketingIdeas(
    campaignTopic: string,
    selectedPillars: string[],
    channels?: string[],
    mediaType?: string,
    images?: string[]
  ): Promise<{ concepts: any[]; isMock: boolean }> {
    const pillarsStr =
      selectedPillars && selectedPillars.length > 0
        ? `(Định hướng Trụ cột nội dung: ${selectedPillars.join(", ")})`
        : "";

    const getMockConcepts = () => {
      const concepts = [
        {
          title: `Chiến dịch: Chạm Đột Phá - ${campaignTopic || "Mua Sắm Cuối Năm"}`,
          matchPercent: 95,
          summary: `Đột phá doanh số nhắm vào đối tượng trẻ tuổi. ${pillarsStr
            ? `Tập trung sâu vào định hướng truyền thông từ các trụ cột lựa chọn: ${selectedPillars.join(", ")}.`
            : "Tạo lối sống trải nghiệm công nghệ đeo và phong cách sống lành mạnh."
            }`,
          channels: channels && channels.length > 0 ? channels : ["TikTok", "Facebook", "Zalo"],
          suggestedContent:
            "Kịch bản Tiktok: Biến đổi phong cách thường ngày thành phong cách năng động thể thao chỉ sau 1 cái chạm màn hình X1.",
          hashtags: ["#iGenX1", "#SmartWearable", "#NangTamCuocSong"],
          mediaPrompt: `A dynamic lifestyle photoshoot featuring a young professional using ${campaignTopic || "smart wearable device"} in an urban setting, bright natural lighting, modern cityscape background, energetic mood, 8k high-resolution product photography.`,
        },
        {
          title: `Trải nghiệm Đỉnh Cao - Tri Ân Hội Viên`,
          matchPercent: 88,
          summary: `Quảng bá giá trị cốt lõi bền vững thông qua chuỗi bài viết phỏng vấn các đối tác trung thành thực tế đang nâng tầm công việc cùng Workspace V2. ${pillarsStr ? `Điều phối theo: ${selectedPillars.join(", ")}.` : ""}`,
          channels: channels && channels.length > 0 ? channels : ["Facebook", "Zalo"],
          suggestedContent:
            "Facebook Post: 'Gặp gỡ anh Hùng, Giám đốc Sáng tạo, người đã nâng cấp 200% tốc độ gõ phím cơ Workspace V2...'",
          hashtags: ["#WorkspaceV2", "#KeyboardMechanic", "#TangHieuSuat"],
          mediaPrompt: `A premium flatlay product photograph of a mechanical keyboard on a clean wooden desk, warm ambient lighting, coffee cup and notebook nearby, professional workspace aesthetic, detailed textures, 4k resolution.`,
        },
        {
          title: `Lựa Chọn Tối Ưu - Bứt Phá Doanh Số`,
          matchPercent: 92,
          summary: `Tập trung vào hiệu quả đầu tư và giải pháp tiết kiệm chi phí thông qua chuỗi case study thực tế từ các doanh nghiệp đầu ngành.`,
          channels: channels && channels.length > 0 ? channels : ["LinkedIn", "Facebook"],
          suggestedContent:
            "LinkedIn Article: 'Làm thế nào doanh nghiệp vừa và nhỏ tối ưu 35% chi phí vận hành với giải pháp thông minh...'",
          hashtags: ["#ToiUuDoanhNghiep", "#TietKiemChiPhi", "#ChuyenDoiSo"],
          mediaPrompt: `A modern corporate office scene with a diverse team collaborating around a digital dashboard, professional lighting, clean aesthetic.`,
        },
      ];
      return concepts;
    };

    if (!process.env.OPENROUTER_API_KEY) {
      return { concepts: getMockConcepts(), isMock: true };
    }

    try {
      const sourceExtraction = extractSourceBrief(campaignTopic);
      const prompt = `Phân tích mục tiêu/chủ đề chiến dịch marketing sau: "${campaignTopic}"
${pillarsStr ? `BẮT BUỘC ĐỊNH HƯỚNG THEO CÁC TRỤ CỘT NỘI DUNG (Content Pillars): ${selectedPillars.join(", ")}.` : ""}
${Array.isArray(channels) && channels.length > 0 ? `BẮT BUỘC ĐỊNH HƯỚNG THEO CÁC KÊNH MỤC TIÊU: ${channels.join(", ")}.` : ""}

YÊU CẦU:
1. Đề xuất đúng 3 concept/ý tưởng chiến dịch marketing sáng tạo, bám sát các trụ cột nội dung đã chọn ở trên.
2. Mỗi concept bao gồm:
   - title: Tiêu đề ý tưởng chiến dịch thu hút bằng tiếng Việt (ngắn gọn, dưới 15 từ).
   - matchPercent: Tỷ lệ phù hợp với mục tiêu (số nguyên từ 80 đến 98).
   - summary: Tóm tắt định hướng triển khai chiến dịch bằng tiếng Việt (2-3 câu).
   - channels: Danh sách các kênh truyền thông phù hợp nhất (ví dụ: ["Facebook", "TikTok", "LinkedIn"]).
   - suggestedContent: Gợi ý nội dung cụ thể ban đầu bằng tiếng Việt (1 đoạn văn ngắn).
   - hashtags: Danh sách 3-5 hashtag đề xuất liên quan (ví dụ: ["#Marketing", "#Campaign"]).
   - mediaPrompt: Mô tả chi tiết trực quan bằng TIẾNG ANH (visual prompt) để sinh ảnh hoặc video AI phù hợp nhất với concept này.

NGUỒN SỰ THẬT:
${sourceExtraction.normalizedBrief || campaignTopic}

Trả về kết quả ở định dạng JSON phù hợp chính xác với cấu trúc yêu cầu.`;

      const response = await generateText(
        GEMINI_TEXT_MODEL,
        prompt,
        {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              concepts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    matchPercent: { type: Type.INTEGER },
                    summary: { type: Type.STRING },
                    channels: { type: Type.ARRAY, items: { type: Type.STRING } },
                    suggestedContent: { type: Type.STRING },
                    hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
                    mediaPrompt: { type: Type.STRING },
                  },
                  required: ["title", "matchPercent", "summary", "channels", "suggestedContent", "hashtags", "mediaPrompt"],
                },
                description: "Danh sách 3 concept ý tưởng chiến dịch",
              },
            },
            required: ["concepts"],
          },
          images,
        }
      );

      const responseText = response.text || "{}";
      const parsedData = safeParseJson(responseText);
      const concepts = (parsedData.concepts || []).map((c: any) => ({
        title: String(c.title || "").trim(),
        matchPercent: Number(c.matchPercent) || 90,
        summary: String(c.summary || "").trim(),
        channels: Array.isArray(c.channels) ? c.channels.map((ch: any) => this.normalizeMarketingChannel(ch)) : ["Facebook"],
        suggestedContent: String(c.suggestedContent || "").trim(),
        hashtags: this.sanitizeHashtags(c.hashtags, c.title),
        mediaPrompt: String(c.mediaPrompt || "").trim(),
      }));

      return { concepts: concepts.length > 0 ? concepts : getMockConcepts(), isMock: false };
    } catch (error: any) {
      console.error("[geminiService.generateMarketingIdeas] Failed to generate grounded concepts:", error);
      throw new Error(error?.message || "Không thể phát sinh ý tưởng marketing từ AI.");
    }
  }

  async generateScheduledCampaign(input: {
    prompt: string;
    startDate: string;
    endDate: string;
    postsPerDay: number;
    postingTimes: string[];
    channels: string[];
    images?: string[];
    customSchedule?: Record<string, string[]>;
    researchReport?: string;
    rules?: {
      requiredCta?: string;
      requiredHashtags?: string[];
      forbiddenTerms?: string[];
      allowTextOnlyFallback?: boolean;
    };
  }): Promise<{
    campaignTitle: string;
    contentPillars: string[];
    slots: Array<{
      scheduledDate: string;
      scheduledTime: string;
      channel: "Facebook" | "TikTok";
      pillar: string;
      objective: string;
      topicBrief: string;
      mediaType: "text" | "image" | "video" | "human-video";
    }>;
  }> {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not configured.");
    }

    const start = new Date(`${input.startDate}T00:00:00Z`);
    const end = new Date(`${input.endDate}T00:00:00Z`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) {
      throw new Error("Khoảng ngày chiến dịch không hợp lệ.");
    }

    const dayCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    if (dayCount > 90) {
      throw new Error("Mỗi chiến dịch tối đa 90 ngày.");
    }

    const slots: Array<{ scheduledDate: string; scheduledTime: string; channel: string }> = [];
    let slotCounter = 0;
    for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
      const date = new Date(start.getTime() + dayIndex * 86400000);
      const scheduledDate = date.toISOString().slice(0, 10);
      const dayTimes = input.customSchedule?.[scheduledDate] || input.postingTimes;
      for (const time of dayTimes) {
        slots.push({
          scheduledDate,
          scheduledTime: time,
          channel: input.channels[slotCounter % input.channels.length],
        });
        slotCounter += 1;
      }
    }

    const totalPosts = slots.length;
    if (totalPosts > 450) {
      throw new Error("Mỗi chiến dịch tối đa 450 bài đăng.");
    }

    const researchSection = input.researchReport
      ? `\n\nTÀI LIỆU NGHIÊN CỨU & XU HƯỚNG TỪ GOOGLE/MXH (Sử dụng dữ liệu này để lập chiến lược sát với thực tế nhất):\n${input.researchReport}`
      : "";

    const strategistSkill = loadAgentSkill("strategist");
    const skillPrefix = strategistSkill ? `KỸ NĂNG & HƯỚNG DẪN CHIẾN LƯỢC GIA:\n${strategistSkill}\n\n` : "";

    const rulesSection = input.rules
      ? `\n\nQUY TẮC CHIẾN DỊCH BẮT BUỘC:\n` +
      (input.rules.requiredCta ? `- Kêu gọi hành động (CTA) bắt buộc: ${input.rules.requiredCta}\n` : "") +
      (input.rules.requiredHashtags?.length ? `- Hashtags bắt buộc: ${input.rules.requiredHashtags.join(", ")}\n` : "") +
      (input.rules.forbiddenTerms?.length ? `- Các từ ngữ cấm sử dụng: ${input.rules.forbiddenTerms.join(", ")}\n` : "") +
      (input.rules.allowTextOnlyFallback !== undefined ? `- Cho phép bài viết chỉ có chữ (text-only fallback): ${input.rules.allowTextOnlyFallback ? "Có" : "Không"}\n` : "")
      : "";

    const prompt = `${skillPrefix}Bạn là chiến lược gia marketing đa kênh.
Từ brief duy nhất bên dưới, hãy lập chiến lược và brief riêng cho đúng các slot đăng đã định sẵn.
KHÔNG viết nội dung bài đăng hoàn chỉnh, caption, outline quay hay media prompt ở bước này.

BRIEF CHIẾN DỊCH:
${input.prompt}${researchSection}${rulesSection}

LỊCH BẮT BUỘC (giữ nguyên scheduledDate, scheduledTime và channel của từng phần tử):
${JSON.stringify(slots)}

Yêu cầu:
- Viết toàn bộ nội dung hướng tới người dùng bằng tiếng Việt tự nhiên, gồm campaignTitle, contentPillars, pillar, objective và topicBrief. Không dùng câu mô tả tiếng Anh, trừ tên riêng, tên sản phẩm hoặc thuật ngữ không có cách gọi tiếng Việt phù hợp.
- Đề xuất 3-6 content pillars xuyên suốt chiến dịch.
- Trả về đúng ${totalPosts} slot, theo đúng thứ tự lịch.
- Giữ nguyên scheduledDate, scheduledTime và channel của mỗi slot.
- Mỗi slot chỉ gồm pillar, objective, topicBrief và mediaType để worker dùng gần giờ đăng.
- Phân bổ hành trình hợp lý giữa nhận diện, cung cấp giá trị, tương tác, social proof và chuyển đổi.
- topicBrief phải đủ cụ thể để sau này sinh nhiều phương án khác nhau nhưng không được là bài viết hoàn chỉnh.
- TikTok ưu tiên mediaType video; Facebook có thể text hoặc image tùy chiến lược.
- Đảm bảo các slot được lập lịch tuân thủ các quy tắc chiến dịch bắt buộc nếu có.

Trả về JSON đúng schema.`;

    const response = await generateText(GEMINI_HEAVY_MODEL, prompt, {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          campaignTitle: { type: Type.STRING },
          contentPillars: { type: Type.ARRAY, items: { type: Type.STRING } },
          slots: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                scheduledDate: { type: Type.STRING },
                scheduledTime: { type: Type.STRING },
                channel: { type: Type.STRING },
                pillar: { type: Type.STRING },
                objective: { type: Type.STRING },
                topicBrief: { type: Type.STRING },
                mediaType: { type: Type.STRING },
              },
              required: ["scheduledDate", "scheduledTime", "channel", "pillar", "objective", "topicBrief", "mediaType"],
            },
          },
        },
        required: ["campaignTitle", "contentPillars", "slots"],
      },
      images: input.images,
      maxRetries: 1,
      timeoutMs: 60_000,
    });

    const parsed = safeParseJson(response.text || "{}");
    const generatedSlots = Array.isArray(parsed.slots) ? parsed.slots : [];
    if (generatedSlots.length !== slots.length) {
      throw new Error(`AI trả về ${generatedSlots.length}/${slots.length} slot. Vui lòng thử lại.`);
    }

    const plannedSlots = slots.map((slot, index) => {
      const item = generatedSlots[index] || {};
      const channel: "Facebook" | "TikTok" = slot.channel === "TikTok" ? "TikTok" : "Facebook";
      const requestedMediaType = String(item.mediaType || "").trim();
      const mediaType = channel === "TikTok"
        ? "video"
        : (["text", "image", "video", "human-video"].includes(requestedMediaType) ? requestedMediaType : "image");
      return {
        ...slot,
        channel,
        pillar: String(item.pillar || "Nội dung cốt lõi").trim(),
        objective: String(item.objective || "Tăng nhận diện").trim(),
        topicBrief: String(item.topicBrief || "").trim(),
        mediaType: mediaType as "text" | "image" | "video" | "human-video",
      };
    });

    if (plannedSlots.some((slot) => !slot.topicBrief)) {
      throw new Error("AI trả về slot chưa có topic brief.");
    }
    const contentPillars = (Array.isArray(parsed.contentPillars) ? parsed.contentPillars : [])
      .map((pillar: unknown) => String(pillar || "").trim())
      .filter(Boolean)
      .slice(0, 6);
    return {
      campaignTitle: String(parsed.campaignTitle || "Chiến dịch AI").trim(),
      contentPillars: contentPillars.length > 0 ? contentPillars : ["Nội dung cốt lõi"],
      slots: plannedSlots,
    };
  }

  async generateCampaignCandidate(input: {
    sourceBrief: string;
    campaignTitle: string;
    pillar: string;
    objective: string;
    topicBrief: string;
    platform: "Facebook" | "TikTok";
    mediaType: "text" | "image" | "video" | "human-video";
    variant: string;
    requiredCta?: string;
    requiredHashtags?: string[];
    forbiddenTerms?: string[];
    recentTitles?: string[];
    model?: string;
  }): Promise<{ title: string; outline: string; bodyText: string; mediaPrompt: string; voiceScript: string }> {
    const prompt = `Bạn là AI Copywriter chuyên nghiệp. Viết MỘT phương án nội dung cho slot chiến dịch.

BRIEF GỐC: ${input.sourceBrief}
CHIẾN DỊCH: ${input.campaignTitle}
CONTENT PILLAR: ${input.pillar}
MỤC TIÊU SLOT: ${input.objective}
TOPIC BRIEF: ${input.topicBrief}
NỀN TẢNG: ${input.platform}
LOẠI MEDIA: ${input.mediaType}
GÓC SÁNG TẠO BẮT BUỘC: ${input.variant}
CTA BẮT BUỘC: ${input.requiredCta || "Tự đề xuất phù hợp"}
HASHTAG BẮT BUỘC: ${(input.requiredHashtags || []).join(", ") || "Không có"}
TỪ CẤM: ${(input.forbiddenTerms || []).join(", ") || "Không có"}
TIÊU ĐỀ GẦN ĐÂY CẦN TRÁNH LẶP: ${(input.recentTitles || []).join(" | ") || "Không có"}

Yêu cầu:
- Bám sát tuyệt đối brief và topic, không bịa thông tin sản phẩm.
- Viết tiếng Việt tự nhiên, có hook và CTA rõ ràng.
- Facebook: bodyText là bài đăng sạch. TikTok: bodyText chỉ là caption, outline là storyboard video ngắn.
- mediaPrompt viết bằng tiếng Anh và trung thành với nội dung.
- voiceScript chỉ cần có khi mediaType là human-video, ngược lại trả chuỗi rỗng.
- Không chứa placeholder hoặc ghi chú nội bộ.
Trả về JSON đúng schema.`;
    const response = await generateText(input.model || GEMINI_HEAVY_MODEL, prompt, {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          outline: { type: Type.STRING },
          bodyText: { type: Type.STRING },
          mediaPrompt: { type: Type.STRING },
          voiceScript: { type: Type.STRING },
        },
        required: ["title", "outline", "bodyText", "mediaPrompt", "voiceScript"],
      },
    });
    const parsed = safeParseJson(response.text || "{}");
    return {
      title: String(parsed.title || "").trim(),
      outline: String(parsed.outline || "").trim(),
      bodyText: String(parsed.bodyText || "").trim(),
      mediaPrompt: String(parsed.mediaPrompt || "").trim(),
      voiceScript: String(parsed.voiceScript || "").trim(),
    };
  }

  async scoreCampaignCandidate(input: {
    sourceBrief: string;
    objective: string;
    platform: "Facebook" | "TikTok";
    title: string;
    bodyText: string;
    recentTitles?: string[];
  }): Promise<{
    fidelity: number;
    objective: number;
    platform: number;
    hook: number;
    conversion: number;
    readability: number;
    novelty: number;
  }> {
    const prompt = `Chấm điểm nghiêm khắc nội dung marketing theo đúng trọng số tối đa của từng trường.
Brief: ${input.sourceBrief}
Mục tiêu: ${input.objective}
Nền tảng: ${input.platform}
Tiêu đề: ${input.title}
Nội dung: ${input.bodyText}
Tiêu đề gần đây để đánh giá độ mới: ${(input.recentTitles || []).join(" | ") || "Không có"}

Giới hạn điểm: fidelity 0-25, objective 0-15, platform 0-15, hook 0-15, conversion 0-10, readability 0-10, novelty 0-10. Trả JSON.`;
    const response = await generateText(GEMINI_HEAVY_MODEL, prompt, {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          fidelity: { type: Type.INTEGER }, objective: { type: Type.INTEGER }, platform: { type: Type.INTEGER },
          hook: { type: Type.INTEGER }, conversion: { type: Type.INTEGER }, readability: { type: Type.INTEGER }, novelty: { type: Type.INTEGER },
        },
        required: ["fidelity", "objective", "platform", "hook", "conversion", "readability", "novelty"],
      },
    });
    const parsed = safeParseJson(response.text || "{}");
    const clamp = (value: unknown, max: number) => Math.max(0, Math.min(max, Number(value) || 0));
    return {
      fidelity: clamp(parsed.fidelity, 25), objective: clamp(parsed.objective, 15), platform: clamp(parsed.platform, 15),
      hook: clamp(parsed.hook, 15), conversion: clamp(parsed.conversion, 10), readability: clamp(parsed.readability, 10), novelty: clamp(parsed.novelty, 10),
    };
  }

  async developMarketingIdea(
    title: string,
    summary: string,
    suggestedContent: string,
    channels: string[],
    mediaOptions?: {
      mediaType?: string;
      imageModel?: string;
      imageResolution?: string;
      imageAspectRatio?: string;
      videoModel?: string;
      videoQuality?: string;
      videoDuration?: number;
      videoAspectRatio?: string;
      mediaPrompt?: string;
      humanVoiceId?: string;
      humanVoiceModel?: string;
      humanDurationSeconds?: number;
    }
  ): Promise<{ posts: any[]; isMock: boolean }> {
    const sourceBriefText = String(mediaOptions?.mediaPrompt || suggestedContent || `${title}. ${summary}`).trim();

    const normalizeChannel = (chan: string): string => {
      if (!chan) return "Facebook";
      const c = chan.toLowerCase().trim();
      if (c.includes("facebook") || c.includes("fb")) return "Facebook";
      if (c.includes("tiktok") || c.includes("tik tok") || c.includes("reels") || c.includes("video ngắn")) return "TikTok";
      if (c.includes("linkedin") || c.includes("linked in") || c.includes("link")) return "LinkedIn";
      if (c.includes("instagram") || c.includes("insta") || c.includes("ig")) return "Instagram";
      if (c.includes("zalo")) return "Zalo";
      return "Facebook";
    };

    let targetChannels = (Array.isArray(channels) ? channels : ["Facebook"])
      .map(ch => normalizeChannel(ch))
      .filter((v, i, a) => a.indexOf(v) === i);

    if (targetChannels.length === 0) {
      targetChannels = ["Facebook"];
    }

    let posts: any[] = [];
    let isMock = false;

    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not configured.");
    } else {
      try {
        const isHumanVideo = mediaOptions?.mediaType === "human-video";
        const humanDurationSeconds = Number(mediaOptions?.humanDurationSeconds || 15);
        const videoDurationSeconds = Number(mediaOptions?.videoDuration || 8);
        const minWords = Math.floor(humanDurationSeconds * 2.2);
        const maxWords = Math.ceil(humanDurationSeconds * 2.8);
        const humanVoiceRules = isHumanVideo
          ? `

YÊU CẦU RIÊNG CHO VIDEO NGƯỜI THẬT:
1. Mọi bài viết bắt buộc phải có thêm trường "voiceScript" bằng tiếng Việt tự nhiên, mượt mà, chuẩn văn phong nói tiếng Việt và không bị cảm giác dịch máy.
2. "voiceScript" phải là đoạn lời thoại hoàn chỉnh để đưa trực tiếp sang bộ chuyển đổi Text-to-Speech (TTS). Tuyệt đối không chứa ký hiệu markdown, không chứa gạch đầu dòng (bullet points), không chứa bất kỳ nhãn dẫn hay lời ghi chú nào (ví dụ: không có "MC:", "Voiceover:", "Cảnh 1:", v.v.).
3. RÀNG BUỘC ĐỘ DÀI VÀ THỜI LƯỢNG NGHIÊM NGẶT: Thời lượng đọc mục tiêu là đúng ${humanDurationSeconds} giây. Để đảm bảo điều này, số lượng từ/âm tiết tiếng Việt trong "voiceScript" bắt buộc phải nằm trong giới hạn từ ${minWords} đến ${maxWords} từ. Tránh việc viết quá dài hoặc quá ngắn sẽ làm hỏng thời lượng video.
4. "bodyText" vẫn là phần caption/nội dung ngắn gọn đăng lên kênh mạng xã hội, còn "voiceScript" mới là kịch bản thoại được đọc thành tiếng. Hai trường này phải nhất quán nhưng tách biệt.
5. "outline" phải mô tả các cảnh quay, góc máy, nhịp cắt khớp hoàn hảo với diễn biến của "voiceScript".
6. "motionText" là mô tả chi tiết bằng TIẾNG VIỆT về cử chỉ, biểu cảm gương mặt, cử động cơ thể và hành động của avatar người thật trong video (ví dụ: "Người thuyết trình tự tin, gật đầu nhẹ nhàng, biểu cảm thân thiện, cử chỉ tay cởi mở"). Mô tả phải tự nhiên, bám sát nội dung và ngữ điệu lời thoại.
7. Tuyệt đối không viết "voiceScript" chung chung. Nội dung phải tập trung làm nổi bật tiêu đề, tóm tắt chiến dịch, insight khách hàng và thông điệp bán hàng cụ thể được cung cấp.
`
          : "";

        const prompt = `Bạn là một chuyên gia viết kịch bản và AI Copywriter xuất sắc.
Hãy lập Dàn Ý (Outline) và viết Bản Nháp nội dung (Draft Content) cho các kênh sau đây: ${targetChannels.join(", ")}

QUY TẮC PHÂN TÍCH DỮ LIỆU BẮT BUỘC CHO TỪNG KÊNH:
1. Đối với kênh TikTok:
   - Trường "outline" (Dàn Ý): PHẢI chứa toàn bộ kịch bản quay chi tiết (Shooting Script / Storyboard), bao gồm phân đoạn visual (hình ảnh/hành động), audio (lời thoại/âm thanh/voiceover) và mốc thời gian (Timeline dạng [0:00 - 0:03], [0:03 - 0:08]...) cho từng cảnh. Tổng thời lượng kịch bản không được vượt quá ${videoDurationSeconds} giây.
   - Trường "bodyText" (Nội dung chính): PHẢI là Caption/Description giới thiệu video sạch, cuốn hút kèm hashtag để đăng tải trực tiếp lên TikTok (ví dụ: "Cứu tinh deadline của bạn đây... #iGenMarketing..."). TUYỆT ĐỐI không chứa bất kỳ mốc thời gian timeline, phân cảnh, Visual hay Audio nào ở trường này.
2. Đối với các kênh khác (Facebook, LinkedIn, Instagram...):
   - Trường "outline": Lập dàn ý chi tiết, cụ thể và tối ưu của bài viết.
   - Trường "bodyText": Lưu bản nháp nội dung bài viết sạch hoàn chỉnh để đăng tải trực tiếp (không chứa dàn ý hay tiêu đề nháp).
3. Đối với mọi kênh: Sinh thêm trường "mediaPrompt" là một đoạn mô tả chi tiết bằng tiếng Anh (visual prompt) mô phỏng chính xác nội dung trực quan (hình ảnh hoặc video) phù hợp cho bài viết này để gợi tới AI Generator.
4. mediaPrompt phải là bản dịch trung thành sang tiếng Anh từ dữ liệu gốc, không được đổi nghĩa, không được tự ý thêm chi tiết không có trong input hoặc tài liệu đính kèm, không được biến thành bối cảnh generic.
${humanVoiceRules}

Thông tin chiến dịch marketing:
- Tiêu đề ý tưởng: "${title}"
- Tóm tắt ý tưởng: "${summary}"
- Nội dung gợi ý ban đầu: "${suggestedContent}"

NGUỒN SỰ THẬT BẮT BUỘC:
${extractSourceBrief(sourceBriefText).normalizedBrief || sourceBriefText}

Trả về kết quả ở định dạng JSON phù hợp chính xác với cấu trúc yêu cầu.`;

        const response = await generateText(
          GEMINI_HEAVY_MODEL,
          prompt,
          {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                posts: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      channel: { type: Type.STRING, description: "Kênh đăng bài (ví dụ: Facebook, TikTok, LinkedIn, Instagram, Zalo)" },
                      contentType: { type: Type.STRING, description: "Loại nội dung" },
                      outline: {
                        type: Type.STRING,
                        description: `Dàn ý chi tiết của bài viết. ĐẶC BIỆT với TikTok: Phải lưu KỊCH BẢN QUAY (timeline video script) chi tiết bao gồm Visual, Audio và mốc thời gian dạng [0:00 - 0:03], [0:03 - 0:08]... với tổng thời lượng tối đa không quá ${videoDurationSeconds} giây.`
                      },
                      bodyText: {
                        type: Type.STRING,
                        description: "Nội dung bài đăng/caption sạch để đăng tải trực tiếp. ĐẶC BIỆT với TikTok: Chỉ là Caption/Description giới thiệu video kèm hashtag và call-to-action (TUYỆT ĐỐI không chứa kịch bản quay, visual, audio hay timeline video ở trường này)."
                      },
                      mediaPrompt: {
                        type: Type.STRING,
                        description: "A detailed visual description prompt in English for generating a matching image or video (e.g. scenic views, product display, lifestyle scene, characters, setting details)."
                      },
                      voiceScript: {
                        type: Type.STRING,
                        description: "Natural Vietnamese narration script for human-video voice generation. Strictly limited to " + minWords + "-" + maxWords + " words/syllables. Keep empty string when not needed."
                      },
                      motionText: {
                        type: Type.STRING,
                        description: "Short motion and expression direction in Vietnamese for the avatar/presenter (e.g., 'Người thuyết trình tự tin, gật đầu thân thiện, cử chỉ tay mở rộng'). Keep empty string when not needed."
                      }
                    },
                    required: ["channel", "contentType", "outline", "bodyText", "mediaPrompt"],
                  },
                },
              },
              required: ["posts"],
            },
          }
        );

        const responseText = response.text || "{}";
        const parsedData = safeParseJson(responseText);
        posts = (parsedData.posts || []).map((post: any) => {
          const groundedPrompt = buildFaithfulVisualGuardrail({
            sourceBrief: sourceBriefText,
            title,
            summary,
            suggestedContent,
            outline: post?.outline,
            bodyText: post?.bodyText,
            channels: [this.normalizeMarketingChannel(post.channel)],
          });

          return {
            ...post,
            channel: this.normalizeMarketingChannel(post.channel),
            contentType: String(post?.contentType || "").trim(),
            outline: String(post?.outline || "").trim(),
            bodyText: String(post?.bodyText || "").trim(),
            voiceScript: typeof post?.voiceScript === "string" ? post.voiceScript.trim() : "",
            motionText: typeof post?.motionText === "string" ? post.motionText.trim() : "",
            mediaPrompt: post?.mediaPrompt
              ? `${groundedPrompt} ${post.mediaPrompt}`.trim()
              : groundedPrompt,
          };
        }).filter((post: any) => post.channel && post.contentType && post.bodyText);

        if (posts.length === 0) {
          throw new Error("AI khong tra ve post hop le.");
        }
      } catch (error: any) {
        console.error("[geminiService.developMarketingIdea] Failed to develop grounded posts:", error);
        throw new Error(error?.message || "Không thể phát triển nội dung marketing từ AI.");
      }
    }

    // Auto-generate media if mediaType is requested
    if (mediaOptions && mediaOptions.mediaType && mediaOptions.mediaType !== "none") {
      console.log(`[developMarketingIdea] Generating media of type: ${mediaOptions.mediaType}`);
      for (const post of posts) {
        if (mediaOptions.mediaType === "image" && this._imageService) {
          try {
            const promptToUse = post.mediaPrompt || mediaOptions.mediaPrompt || `A professional photo matching the campaign topic: ${title}`;
            const imageResult = await this._imageService.generateImage(promptToUse, {
              modelName: mediaOptions.imageModel,
              resolution: mediaOptions.imageResolution,
              aspectRatio: mediaOptions.imageAspectRatio,
            });

            if (imageResult.isMock) {
              post.imageUrl = imageResult.url;
            } else {
              post.imageUrl = imageResult.url;
            }
          } catch (err) {
            console.error(`[developMarketingIdea] Error generating image for post on ${post.channel}:`, err);
            const seed = Math.floor(Math.random() * 1000000);
            post.imageUrl = `https://picsum.photos/seed/${seed}/800/600`;
            console.log(`[developMarketingIdea] Fallback to mock image: ${post.imageUrl}`);
          }
        } else if (mediaOptions.mediaType === "video" && this._videoService) {
          try {
            const promptToUse = post.mediaPrompt || mediaOptions.mediaPrompt || `A cinematic video clip matching the campaign topic: ${title}`;
            const durationSec = mediaOptions.videoDuration ? Number(mediaOptions.videoDuration) : 6;
            const videoResult = await this._videoService.generateVideo(promptToUse, durationSec, {
              modelName: mediaOptions.videoModel,
              resolution: mediaOptions.videoQuality,
              aspectRatio: mediaOptions.videoAspectRatio,
            });

            if (videoResult.isMock) {
              post.videoUrl = videoResult.url;
            } else {
              try {
                const uploadedUrl = await cloudinaryService.uploadMedia(videoResult.url, "igen_erp");
                post.videoUrl = uploadedUrl;
              } catch (clErr) {
                console.error("[developMarketingIdea] Cloudinary upload video failed, fallback to raw url:", clErr);
                post.videoUrl = videoResult.url;
              }
            }
          } catch (err) {
            console.error(`[developMarketingIdea] Error generating video for post on ${post.channel}:`, err);
            post.videoUrl = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
            console.log(`[developMarketingIdea] Fallback to mock video: ${post.videoUrl}`);
          }
        }
      }
    }

    return { posts, isMock };
  }
}

export const geminiMarketingService = new GeminiMarketingService();
