/* eslint-disable @typescript-eslint/no-explicit-any */
import { AIFaqCandidateModel, IAIFaqCandidate } from "../model/ai-faq-candidate.model";
import { AIReplyLogModel } from "../model/ai-reply-log.model";
import { FBMessageModel } from "../model/fb-messenger.model";
import { ZaloMessageModel } from "../model/zalo-messenger.model";
import { TikTokMessageModel } from "../model/tiktok-messenger.model";
import { AIKnowledgeDocumentModel } from "../model/ai-knowledge.model";
import { aiKnowledgeService } from "./ai-knowledge.service";
import { openrouterChat } from "./openrouter.service";
import { GEMINI_TEXT_MODEL, safeParseJson } from "./gemini/core";

function normalizeCompanyCode(code?: string): string {
  return String(code || "").trim().toUpperCase();
}

/**
 * Xóa bỏ thông tin định danh cá nhân (PII) trước khi đưa vào phân tích AI
 */
export function maskPII(text: string): string {
  if (!text) return "";
  let masked = text;

  // Mask Phone numbers: 09x, 08x, 07x, 05x, 03x, +84...
  masked = masked.replace(/(?:\+84|0)(?:3[2-9]|5[25689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}\b/g, "[SĐT]");
  // Mask generic 9-11 digit numbers
  masked = masked.replace(/\b\d{9,11}\b/g, "[SĐT/SỐ]");
  // Mask Email
  masked = masked.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]");
  // Mask bank card/account numbers
  masked = masked.replace(/\b(?:\d[ -]*?){13,19}\b/g, "[SỐ_TÀI_KHOẢN]");

  return masked.trim();
}

export const aiKnowledgeLearningService = {
  /**
   * Lấy danh sách các câu hỏi thường gặp được đề xuất
   */
  async listFaqCandidates(companyCode?: string, status?: string) {
    const normalizedCompanyCode = normalizeCompanyCode(companyCode);
    if (!normalizedCompanyCode) {
      return { candidates: [], total: 0 };
    }

    const query: any = { companyCode: normalizedCompanyCode };
    if (status && status !== "all") {
      query.status = status;
    }

    const candidates = await AIFaqCandidateModel.find(query)
      .sort({ status: 1, frequency: -1, updatedAt: -1 })
      .lean();

    const stats = {
      pending: candidates.filter((c) => c.status === "pending").length,
      approved: candidates.filter((c) => c.status === "approved").length,
      rejected: candidates.filter((c) => c.status === "rejected").length,
    };

    return { candidates, total: candidates.length, stats };
  },

  /**
   * Quét lịch sử hội thoại, tin nhắn khách và phản hồi của nhân viên để tổng hợp FAQ mới
   */
  async analyzeConversationsAndExtractFaqs(companyCode?: string) {
    const normalizedCompanyCode = normalizeCompanyCode(companyCode);
    if (!normalizedCompanyCode) {
      throw new Error("Mã doanh nghiệp không hợp lệ");
    }

    console.log(`[AI Learning] Bắt đầu quét và phân tích hội thoại cho doanh nghiệp: ${normalizedCompanyCode}`);

    // 1. Thu thập các tin nhắn và log gần nhất
    const [aiLogs, fbMessages, zaloMessages, tiktokMessages, existingDocs] = await Promise.all([
      AIReplyLogModel.find({ companyCode: normalizedCompanyCode })
        .sort({ createdAt: -1 })
        .limit(150)
        .select("customerMessage aiResponse feedback status channel")
        .lean(),
      FBMessageModel.find({ companyCode: normalizedCompanyCode })
        .sort({ timestamp: -1 })
        .limit(150)
        .select("text direction timestamp")
        .lean(),
      ZaloMessageModel.find({ companyCode: normalizedCompanyCode })
        .sort({ timestamp: -1 })
        .limit(80)
        .select("text direction timestamp")
        .lean(),
      TikTokMessageModel.find({ companyCode: normalizedCompanyCode })
        .sort({ timestamp: -1 })
        .limit(80)
        .select("text direction timestamp")
        .lean(),
      AIKnowledgeDocumentModel.find({ companyCode: normalizedCompanyCode, status: "active" })
        .select("sourceTitle documentType")
        .lean(),
    ]);

    // 2. Gom và làm sạch danh sách tin nhắn
    const customerQuestions: string[] = [];
    const staffInterventions: Array<{ question: string; staffAnswer: string }> = [];

    // Từ AI Reply Logs
    for (const log of aiLogs) {
      const q = maskPII(log.customerMessage);
      if (q && q.length >= 4 && !q.startsWith("[") && !q.includes("http")) {
        customerQuestions.push(q);
      }
    }

    // Từ FB Messages: Tìm cặp câu hỏi của khách (inbound) và câu trả lời của nhân viên (outbound)
    for (let i = 0; i < fbMessages.length - 1; i++) {
      const current = fbMessages[i];
      const next = fbMessages[i + 1];
      if (current.direction === "inbound" && next.direction === "outbound") {
        const cleanQ = maskPII(current.text || "");
        const cleanA = maskPII(next.text || "");
        if (cleanQ.length >= 6 && cleanA.length >= 6) {
          staffInterventions.push({ question: cleanQ, staffAnswer: cleanA });
          customerQuestions.push(cleanQ);
        }
      } else if (current.direction === "inbound") {
        const cleanQ = maskPII(current.text || "");
        if (cleanQ.length >= 4) customerQuestions.push(cleanQ);
      }
    }

    // Từ Zalo & TikTok
    for (const m of [...zaloMessages, ...tiktokMessages]) {
      if (m.direction === "inbound") {
        const cleanQ = maskPII(m.text || "");
        if (cleanQ.length >= 4) customerQuestions.push(cleanQ);
      }
    }

    // Nếu không có đủ tin nhắn để phân tích
    if (customerQuestions.length < 3 && staffInterventions.length === 0) {
      return {
        success: true,
        extractedCount: 0,
        message: "Chưa có đủ dữ liệu tin nhắn hội thoại để phân tích. Hãy kích hoạt lại khi có thêm tin nhắn từ khách hàng.",
        candidates: [],
      };
    }

    // 3. Chuẩn bị Prompt phân tích cho AI
    const sampleQuestionsSample = Array.from(new Set(customerQuestions)).slice(0, 80);
    const staffInterventionSample = staffInterventions.slice(0, 20);
    const existingDocTitles = existingDocs.map((d) => `[${d.documentType}] ${d.sourceTitle}`).join(", ");

    const systemPrompt = `Bạn là Chuyên gia Khai phá Tri thức Doanh nghiệp (AI Knowledge Engineer).
Nhiệm vụ của bạn là phân tích các câu hỏi thực tế của khách hàng và các câu trả lời của nhân viên tư vấn, sau đó tổng hợp thành BỘ CÂU HỎI THƯỜNG GẶP (FAQs) chuẩn xác.

NGUYÊN TẮC:
1. Gom nhóm các câu hỏi có cùng ý định (vd: "ship bao lâu", "khi nào nhận được", "ở HN bao lâu tới" -> Gom thành 1 chủ đề chung về Thời gian giao hàng).
2. Viết câu hỏi chuẩn hóa (question) rõ ràng, lịch thiệp, dễ hiểu.
3. Câu trả lời đề xuất (suggestedAnswer):
   - ƯU TIÊN HÀNG ĐẦU: Nếu có câu trả lời mẫu của nhân viên (staff_answer), hãy chuẩn hóa và kế thừa từ đó.
   - Nếu chưa có câu trả lời của nhân viên, hãy viết câu trả lời mẫu lịch sự, chuẩn nghiệp vụ, nêu rõ hướng dẫn cho khách.
4. Gắn nhãn phân loại (category): "pricing" | "shipping" | "product" | "warranty" | "payment" | "service" | "policy" | "general".
5. Bỏ qua các câu chào hỏi đơn thuần, tin rác, troll hoặc tin không có nội dung nghiệp vụ.
6. Trả về định dạng JSON thuần.`;

    const userPrompt = `DỮ LIỆU ĐẦU VÀO:
- Danh sách tài liệu hiện có trong kho tri thức của doanh nghiệp: ${existingDocTitles || "Chưa có"}
- Các câu hỏi thực tế của khách hàng gần đây (${sampleQuestionsSample.length} câu):
${sampleQuestionsSample.map((q, idx) => `${idx + 1}. "${q}"`).join("\n")}

- Các lượt tư vấn thực tế của Nhân viên thật (${staffInterventionSample.length} mẫu):
${staffInterventionSample.map((s, idx) => `${idx + 1}. Khách hỏi: "${s.question}" -> Nhân viên trả lời: "${s.staffAnswer}"`).join("\n")}

YÊU CẦU ĐẦU RA (JSON FORMAT):
{
  "faqs": [
    {
      "question": "Câu hỏi chuẩn hóa (ngắn gọn, bao quát ý định)",
      "suggestedAnswer": "Câu trả lời đề xuất hoàn chỉnh, tự nhiên và chuyên nghiệp",
      "category": "pricing | shipping | product | warranty | payment | service | policy | general",
      "sampleCustomerMessages": ["2-4 câu hỏi gốc thực tế của khách"],
      "frequency": 3, // Ước lượng số lần khách đã hỏi về ý định này
      "source": "agent_response | customer_chat",
      "confidenceScore": 85 // 0-100
    }
  ]
}`;

    try {
      const response = await openrouterChat({
        model: GEMINI_TEXT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        jsonMode: true,
        temperature: 0.3,
      });

      const rawJson = safeParseJson(response.text);
      const extractedFaqs = Array.isArray(rawJson?.faqs) ? rawJson.faqs : [];

      console.log(`[AI Learning] AI đã trích xuất được ${extractedFaqs.length} câu hỏi FAQ tiềm năng.`);

      const savedCandidates: IAIFaqCandidate[] = [];

      for (const item of extractedFaqs) {
        if (!item.question || !item.suggestedAnswer) continue;

        // Kiểm tra xem câu hỏi tương tự đã có trong database chưa
        const existing = await AIFaqCandidateModel.findOne({
          companyCode: normalizedCompanyCode,
          question: item.question.trim(),
        });

        if (existing) {
          existing.frequency += item.frequency || 1;
          existing.lastAskedAt = new Date();
          if (item.suggestedAnswer && existing.status === "pending") {
            existing.suggestedAnswer = item.suggestedAnswer;
          }
          if (Array.isArray(item.sampleCustomerMessages)) {
            existing.sampleCustomerMessages = Array.from(
              new Set([...existing.sampleCustomerMessages, ...item.sampleCustomerMessages])
            ).slice(0, 6);
          }
          await existing.save();
          savedCandidates.push(existing);
        } else {
          const created = await AIFaqCandidateModel.create({
            companyCode: normalizedCompanyCode,
            question: item.question.trim(),
            suggestedAnswer: item.suggestedAnswer.trim(),
            sampleCustomerMessages: Array.isArray(item.sampleCustomerMessages) ? item.sampleCustomerMessages.slice(0, 6) : [],
            frequency: item.frequency || 1,
            category: item.category || "general",
            source: item.source || "customer_chat",
            confidenceScore: item.confidenceScore || 80,
            status: "pending",
            lastAskedAt: new Date(),
          });
          savedCandidates.push(created);
        }
      }

      return {
        success: true,
        extractedCount: savedCandidates.length,
        message: `Đã phân tích thành công và trích xuất ${savedCandidates.length} câu hỏi thường gặp!`,
        candidates: savedCandidates,
      };
    } catch (err: any) {
      console.error("[AI Learning] Lỗi khi phân tích hội thoại:", err);
      throw new Error(`Không thể phân tích hội thoại: ${err.message || err}`);
    }
  },

  /**
   * Duyệt câu hỏi đề xuất và ghi trực tiếp vào Kho Tri Thức của Doanh Nghiệp
   */
  async approveFaqCandidate(params: {
    candidateId: string;
    customAnswer?: string;
    companyCode?: string;
    userId?: string;
  }) {
    const normalizedCompanyCode = normalizeCompanyCode(params.companyCode);
    const candidate = await AIFaqCandidateModel.findOne({
      _id: params.candidateId,
      companyCode: normalizedCompanyCode,
    });

    if (!candidate) {
      throw new Error("Không tìm thấy câu hỏi đề xuất hoặc bạn không có quyền thao tác.");
    }

    const finalAnswer = (params.customAnswer || candidate.suggestedAnswer || "").trim();
    if (!finalAnswer) {
      throw new Error("Câu trả lời không được để trống khi duyệt vào kho tri thức.");
    }

    candidate.suggestedAnswer = finalAnswer;
    candidate.status = "approved";
    candidate.reviewedBy = params.userId || "admin";
    candidate.reviewedAt = new Date();
    await candidate.save();

    // Đồng bộ lại tài liệu FAQ tổng của công ty trong AIKnowledgeDocumentModel
    await this.syncApprovedFaqsToKnowledgeBase(normalizedCompanyCode, params.userId);

    return {
      success: true,
      message: `Đã duyệt câu hỏi “${candidate.question}” vào Kho tri thức thành công!`,
      candidate,
    };
  },

  /**
   * Bỏ qua / Từ chối câu hỏi đề xuất
   */
  async rejectFaqCandidate(params: {
    candidateId: string;
    companyCode?: string;
    userId?: string;
  }) {
    const normalizedCompanyCode = normalizeCompanyCode(params.companyCode);
    const candidate = await AIFaqCandidateModel.findOneAndUpdate(
      {
        _id: params.candidateId,
        companyCode: normalizedCompanyCode,
      },
      {
        $set: {
          status: "rejected",
          reviewedBy: params.userId || "admin",
          reviewedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!candidate) {
      throw new Error("Không tìm thấy câu hỏi đề xuất.");
    }

    return {
      success: true,
      message: "Đã bỏ qua câu hỏi đề xuất.",
      candidate,
    };
  },

  /**
   * Xóa vĩnh viễn đề xuất FAQ
   */
  async deleteFaqCandidate(params: {
    candidateId: string;
    companyCode?: string;
    userId?: string;
  }) {
    const normalizedCompanyCode = normalizeCompanyCode(params.companyCode);
    const candidate = await AIFaqCandidateModel.findOneAndDelete({
      _id: params.candidateId,
      companyCode: normalizedCompanyCode,
    });

    if (!candidate) {
      throw new Error("Không tìm thấy đề xuất cần xóa.");
    }

    // Nếu trước đó candidate đã được approved, đồng bộ lại để loại bỏ khỏi kho tri thức
    if (candidate.status === "approved") {
      await this.syncApprovedFaqsToKnowledgeBase(normalizedCompanyCode, params.userId);
    }

    return {
      success: true,
      message: "Đã xóa đề xuất câu hỏi.",
    };
  },

  /**
   * Gom tất cả các FAQ đã approved của doanh nghiệp và cập nhật vào tài liệu Kho Tri Thức
   */
  async syncApprovedFaqsToKnowledgeBase(companyCode: string, userId?: string) {
    const approvedList = await AIFaqCandidateModel.find({
      companyCode,
      status: "approved",
    }).sort({ category: 1, frequency: -1 });

    const docTitle = "[Tự động] Bộ câu hỏi thường gặp từ khách hàng (FAQs)";
    const sourceUrl = "ai_learned_faq_knowledge";

    if (approvedList.length === 0) {
      // Nếu không còn câu nào approved, xóa document FAQ tương ứng
      await aiKnowledgeService.deleteKnowledgeDocumentByUrl(companyCode, sourceUrl).catch(() => {});
      return;
    }

    // Nhóm theo Category
    const categoryLabels: Record<string, string> = {
      pricing: "Giá & Báo giá",
      shipping: "Giao hàng & Vận chuyển",
      product: "Sản phẩm & Tồn kho",
      warranty: "Bảo hành & Đổi trả",
      payment: "Thanh toán",
      service: "Dịch vụ & Lịch hẹn",
      policy: "Chính sách",
      general: "Thông tin chung",
    };

    const grouped: Record<string, IAIFaqCandidate[]> = {};
    for (const item of approvedList) {
      const cat = item.category || "general";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    }

    const contentLines: string[] = [
      `# BỘ CÂU HỎI THƯỜNG GẶP (FAQs) TỪ KHÁCH HÀNG THỰC TẾ`,
      `Tài liệu này được tự động tổng hợp từ các cuộc hội thoại thực tế của khách hàng và đã được người quản trị kiểm duyệt.`,
      `Tổng số câu hỏi: ${approvedList.length} câu.`,
      ``,
    ];

    for (const [cat, items] of Object.entries(grouped)) {
      const catName = categoryLabels[cat] || "Chủ đề khác";
      contentLines.push(`## ${catName.toUpperCase()}`);
      items.forEach((item, index) => {
        contentLines.push(`### ${index + 1}. ${item.question}`);
        contentLines.push(`- **Hỏi:** ${item.question}`);
        if (item.sampleCustomerMessages && item.sampleCustomerMessages.length > 0) {
          contentLines.push(`- **Khách thường hỏi:** ${item.sampleCustomerMessages.join("; ")}`);
        }
        contentLines.push(`- **Trả lời chính thức:** ${item.suggestedAnswer}`);
        contentLines.push(``);
      });
    }

    const fullDocumentText = contentLines.join("\n");

    // Upsert vào Kho Tri Thức và Chunking
    await aiKnowledgeService.upsertKnowledgeFromText({
      companyCode,
      sourceType: "auto_learned" as any,
      sourceTitle: docTitle,
      sourceUrl,
      text: fullDocumentText,
      createdBy: userId,
      channelScope: ["all"],
      purposeScope: ["all"],
      pageScope: "all",
      documentType: "faq",
    });

    console.log(`[AI Learning] Đã đồng bộ ${approvedList.length} câu hỏi FAQ vào kho tri thức của ${companyCode}!`);
  },
};
