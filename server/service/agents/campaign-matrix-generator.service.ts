import { openrouterChat } from "../openrouter.service";

export interface GeneratedMatrixAngle {
  title: string;
  funnel: "TOFU" | "MOFU" | "BOFU";
}

export interface GeneratedMatrixPillar {
  pillar: string;
  direction: string;
  targetPercentage: number;
  angles: GeneratedMatrixAngle[];
}

export class CampaignMatrixGeneratorService {
  /**
   * Generates a Content Strategy Matrix with Pillars, Directions, Angles, and Funnel levels (TOFU/MOFU/BOFU)
   * tailored to the brand's business brief.
   */
  public static async generateMatrix(
    sourceBrief: string,
    totalSlotCount: number
  ): Promise<GeneratedMatrixPillar[]> {
    const systemPrompt = `Bạn là Chuyên gia Chiến lược Content Marketing cao cấp (Content Director).
Nhiệm vụ của bạn là phân tích Brief doanh nghiệp và xây dựng BẢNG CONTENT STRATEGY MATRIX chuyên nghiệp.

YÊU CẦU ĐẦU RA (JSON ĐÚNG ĐỊNH DẠNG):
Trả về JSON là mảng gồm 3 đến 5 Trụ cột (Pillars). Mỗi Pillar gồm:
- "pillar": Tên trụ cột (Ví dụ: "1. Giới thiệu doanh nghiệp & Năng lực", "2. Hệ sinh thái sản phẩm / Dịch vụ", "3. Kiến thức chuyên môn & Hướng dẫn", "4. Trải nghiệm khách hàng & Chứng minh").
- "direction": Định hướng thông điệp chiến lược của trụ cột đó.
- "targetPercentage": Tỷ lệ % bài viết chiếm trong tháng (Tổng tất cả các pillars phải bằng 100).
- "angles": Mảng các góc tiếp cận/chủ đề cụ thể. Mỗi angle gồm:
    - "title": Tên góc tiếp cận/chủ đề bài viết cụ thể.
    - "funnel": Một trong 3 giá trị phễu marketing:
        + "TOFU" (Top of Funnel - Nhận biết): Bài rộng, chia sẻ mẹo, thông tin công ty, thu hút nhận diện.
        + "MOFU" (Middle of Funnel - Cân nhắc): Bài chuyên sâu, tính năng sản phẩm, hướng dẫn chọn, kết quả thử nghiệm/phòng lab.
        + "BOFU" (Bottom of Funnel - Chốt đơn/Hành động): Bài test sản phẩm trước/sau, ưu đãi đại lý, chứng nhận chất lượng, báo giá.

LƯU Ý QUAN TRỌNG:
- Toàn bộ pillar, direction và title trong angles phải viết bằng tiếng Việt tự nhiên, dễ hiểu; không dùng câu mô tả tiếng Anh, trừ tên riêng hoặc tên sản phẩm.
- Số lượng góc tiếp cận (angles) tổng cộng nên từ ${Math.min(12, totalSlotCount)} đến ${Math.min(30, Math.max(15, totalSlotCount))}.
- Đảm bảo có đủ cả 3 tầng phễu TOFU (khoảng 20-30%), MOFU (khoảng 50-60%), BOFU (khoảng 15-25%).
- ĐỐI TƯỢNG VÀ SẢN PHẨM PHẢI BÁM SÁT BRIEF DOANH NGHIỆP. Không viết chung chung.
- CHỈ TRẢ VỀ JSON KHÔNG KÈM MARKDOWN VĂN BẢN KHÁC.`;

    const userPrompt = `Dưới đây là Brief chiến dịch và thông tin doanh nghiệp:
---
${sourceBrief}
---
Tổng số bài viết trong chiến dịch: ${totalSlotCount} bài.
Hãy sinh ra Content Strategy Matrix dạng JSON theo yêu cầu.`;

    try {
      const model = process.env.GEMINI_HEAVY_MODEL || "gemini-3.5-flash";
      const response = await openrouterChat({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        jsonMode: true,
        temperature: 0.7,
        maxRetries: 1,
        timeoutMs: 45_000,
      });

      let parsed: GeneratedMatrixPillar[];
      try {
        const cleanedText = response.text.replace(/```json/g, "").replace(/```/g, "").trim();
        parsed = JSON.parse(cleanedText);
      } catch {
        console.warn("[MatrixGenerator] Lỗi parse JSON từ LLM, chuyển sang fallback matrix.");
        return this.getFallbackMatrix(totalSlotCount);
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        return this.getFallbackMatrix(totalSlotCount);
      }

      // Normalize and sanitize matrix
      return parsed.map((p, idx) => ({
        pillar: p.pillar || `${idx + 1}. Trụ cột nội dung`,
        direction: p.direction || "Định hướng phát triển thương hiệu",
        targetPercentage: p.targetPercentage || Math.round(100 / parsed.length),
        angles: (p.angles || []).map((a) => ({
          title: a.title || "Chủ đề chiến dịch",
          funnel: ["TOFU", "MOFU", "BOFU"].includes(a.funnel) ? a.funnel : "MOFU",
        })),
      }));
    } catch (err) {
      console.error("[MatrixGenerator] Lỗi sinh Matrix tự động:", err);
      return this.getFallbackMatrix(totalSlotCount);
    }
  }

  private static getFallbackMatrix(totalSlots: number): GeneratedMatrixPillar[] {
    void totalSlots;
    return [
      {
        pillar: "1. Định vị thương hiệu & Năng lực",
        direction: "Khẳng định uy tín và quy mô doanh nghiệp",
        targetPercentage: 20,
        angles: [
          { title: "Giới thiệu thương hiệu và sứ mệnh phục vụ khách hàng", funnel: "TOFU" },
          { title: "Năng lực sản xuất, cơ sở vật chất và quy chuẩn chất lượng", funnel: "MOFU" },
          { title: "Đội ngũ chuyên gia và kinh nghiệm nhiều năm trong ngành", funnel: "MOFU" },
        ],
      },
      {
        pillar: "2. Giải pháp sản phẩm & Dịch vụ trọng tâm",
        direction: "Giới thiệu hệ sinh thái sản phẩm và giá trị vượt trội",
        targetPercentage: 60,
        angles: [
          { title: "Tổng quan các dòng sản phẩm chủ lực và ưu điểm nổi bật", funnel: "TOFU" },
          { title: "Hướng dẫn lựa chọn sản phẩm phù hợp với nhu cầu", funnel: "MOFU" },
          { title: "Chi tiết tính năng và thông số kỹ thuật ấn tượng", funnel: "MOFU" },
          { title: "So sánh hiệu quả sử dụng trước và sau khi dùng giải pháp", funnel: "BOFU" },
          { title: "Ứng dụng thực tế của sản phẩm trong hoạt động kinh doanh", funnel: "BOFU" },
        ],
      },
      {
        pillar: "3. Kiến thức chuyên môn & Hướng dẫn sử dụng",
        direction: "Trao giá trị và giải đáp thắc mắc cho người dùng",
        targetPercentage: 20,
        angles: [
          { title: "Những sai lầm phổ biến người dùng hay gặp phải", funnel: "TOFU" },
          { title: "Bí quyết bảo quản và nâng cao tuổi thọ sản phẩm", funnel: "MOFU" },
          { title: "Giải đáp các câu hỏi thường gặp (FAQ) từ khách hàng", funnel: "MOFU" },
        ],
      },
    ];
  }
}
