/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { CompanyModel } from "../../model/company.model";
import {
  AI_REPLY_COMMENT_MODEL,
  AI_REPLY_MESSAGE_MODEL,
  detectChatIntent,
  formatHumanLikeChatReply,
  GEMINI_TEXT_MODEL,
  generateText,
} from "./core";
import type { ChatRagContext } from "./types";

export class GeminiChatService {
  /**
   * Trợ lý Chat CRM Omni-Inbox
   */
  async chat(
    message: string,
    history: any[],
    aiConfig: any,
    ragContext?: ChatRagContext
  ): Promise<{ text: string; isMock: boolean }> {
    aiConfig = {
      ...aiConfig,
      autoClassify: true,
      autoCloseDeal: true,
      autoFeedback: true,
    };

    // Resolve companyName dynamically
    const companyCode = ragContext?.companyCode || aiConfig?.companyCode;
    let companyName = aiConfig?.companyName || "";

    if (!companyName && companyCode) {
      try {
        const company = await CompanyModel.findOne({ code: companyCode.toUpperCase() }).lean();
        if (company) {
          companyName = company.name;
        }
      } catch (err) {
        console.warn("[geminiService.chat] Error fetching company from DB:", err);
      }
    }
    if (!companyName) {
      companyName = "doanh nghiệp";
    }

    const getMockResponse = () => {
      return new Promise<{ text: string; isMock: boolean }>((resolve) => {
        setTimeout(() => {
          let replyText = `[Giả lập Trợ lý AI] Dạ, ${companyName} xin cảm ơn bạn đã liên hệ! Bên em đã ghi nhận thông tin và sẽ hỗ trợ giải đáp chi tiết ngay ạ.`;

          const msgLower = message.toLowerCase();
          if (msgLower.includes("giá") || msgLower.includes("bao nhiêu")) {
            replyText =
              `Dạ, em xin phép kiểm tra bảng giá chính xác nhất của ${companyName} và gửi thông tin chi tiết ngay cho mình nhé ạ!`;
          } else if (msgLower.includes("khuyến mãi") || msgLower.includes("ưu đãi")) {
            replyText =
              `Dạ, hiện tại ${companyName} đang có các chương trình ưu đãi hấp dẫn dành cho khách hàng. Anh/Chị quan tâm đến dòng sản phẩm hoặc dịch vụ nào để em tư vấn ưu đãi phù hợp nhất ạ?`;
          } else if (msgLower.includes("vận chuyển") || msgLower.includes("ship")) {
            replyText =
              `Dạ, bên em có hỗ trợ giao hàng tận nơi. Thời gian và phí vận chuyển sẽ được xác nhận cụ thể theo địa chỉ nhận hàng của mình ạ!`;
          }
          resolve({ text: replyText, isMock: true });
        }, 800);
      });
    };

    if (!process.env.OPENROUTER_API_KEY) {
      return getMockResponse();
    }

    const detectedIntent = detectChatIntent(message, history);
    const shouldRequireStrictKnowledge = detectedIntent === "product_pricing_policy" || detectedIntent === "company_faq";
    const hasCompanyKnowledge = !!ragContext?.contextText;

    const conversationPlaybook = `
QUY TẮC CHĂM SÓC KHÁCH HÀNG THÔNG MINH VÀ KHÉO LÉO:
- Chỉ chào đầy đủ ở đầu hội thoại. Ở các lượt sau, trả lời tự nhiên, ngắn gọn và đi thẳng vào nhu cầu của khách.
- Mỗi câu trả lời nên ưu tiên theo thứ tự: xác nhận nhu cầu, đưa gợi ý phù hợp từ knowledge, rồi kết bằng 1 câu hỏi ngắn để dẫn dắt bước tiếp theo.
- Không hỏi dồn quá nhiều câu trong một lượt. Chỉ hỏi 1-2 câu thật sự cần thiết.
- Nếu khách đã cung cấp đủ thông tin, không hỏi lại điều khách vừa nói. Hãy chuyển sang gợi ý hoặc chốt bước tiếp theo.
- Khi khách vừa cung cấp thêm thông tin, làm rõ nhu cầu, xác nhận lựa chọn, hoặc phản hồi tích cực, hãy cảm ơn ngắn gọn một cách tự nhiên trước khi tư vấn tiếp, ví dụ như "Dạ em cảm ơn Anh/Chị đã chia sẻ ạ".
- Khi knowledge có nhiều lựa chọn, chỉ chọn ra 1-3 phương án phù hợp nhất và giải thích rất ngắn gọn vì sao phù hợp.
- Nếu thiếu dữ liệu về giá, tồn kho, màu, size, phiên bản hoặc khuyến mãi, hãy nói rõ phần nào chưa đủ dữ liệu nhưng vẫn hỗ trợ tối đa bằng thông tin hiện có.
- Chỉ đề nghị chuyển nhân viên khi thực sự cần xác nhận thông tin ngoài knowledge hoặc cần thao tác mà AI không làm được.

QUY TẮC UPSELL VÀ CROSS-SELL:
- Upsell phải khéo, đúng ngữ cảnh và chỉ dựa trên knowledge của doanh nghiệp.
- Chỉ upsell khi khách đã thể hiện nhu cầu tương đối rõ hoặc đang quan tâm tới một sản phẩm/dịch vụ cụ thể.
- Ưu tiên upsell theo hướng giá trị: phiên bản phù hợp hơn, gói đầy đủ hơn, quy cách/kích thước tối ưu hơn, giải pháp tiết kiệm hơn, hoặc sản phẩm bổ trợ hợp lý.
- Không ép bán, không upsell quá sớm ngay ở lượt đầu.
- Nếu cross-sell, chỉ gợi ý thêm tối đa 1-2 sản phẩm bổ trợ thực sự liên quan trực tiếp.
- Không tự bịa combo, quà tặng hay ưu đãi nếu knowledge không có.

QUY TẮC CHỐT ĐƠN:
- Khi khách đã có ý định mua rõ, hãy chuyển từ tư vấn sang chốt nhẹ nhàng: xác nhận nhu cầu, tóm tắt lựa chọn phù hợp, rồi hỏi bước hành động tiếp theo.
- Bước hành động tiếp theo phải ngắn và cụ thể, ví dụ: xác nhận phiên bản, số lượng, biến thể, hoặc xin thông tin để nhân viên lên đơn.
- Không lặp lại câu xin chuyển nhân viên qua nhiều lượt liên tiếp. Nếu cần chuyển, hãy nêu rõ lý do và giá trị của bước chuyển đó.

QUY TẮC TÍNH TIỀN VÀ BÁO GIÁ:
- Khi khách hàng hỏi giá của một sản phẩm, hãy báo giá đơn vị chính xác theo thông tin sản phẩm (VND).
- Nếu khách hàng muốn mua sản phẩm với số lượng nhiều hơn 1 (ví dụ: lấy số lượng 2, 3, v.v.), hãy lấy giá đơn vị nhân với số lượng để tính toán tổng số tiền thanh toán thực tế và báo cho khách hàng tổng số tiền cụ thể đó kèm theo phép tính rõ ràng (ví dụ: số lượng * đơn giá = tổng tiền).
- Không đoán hoặc tự bịa đặt giá/chương trình ưu đãi nếu không có trong dữ liệu sản phẩm của doanh nghiệp.

QUY TẮC TƯ VẤN SẢN PHẨM KHI ĐÃ CÓ KNOWLEDGE:
- Nếu khách hỏi chung như "bên mình có gì" hoặc "shop có sản phẩm gì", hãy ưu tiên liệt kê các nhóm sản phẩm hoặc 3-5 sản phẩm tiêu biểu có trong knowledge thay vì mô tả ngành hàng chung chung.
- Nếu khách hỏi một sản phẩm cụ thể và knowledge có đúng tên đó, hãy xác nhận ngay và tóm tắt ngắn những điểm quan trọng có trong knowledge.
- Nếu khách yêu cầu xem sản phẩm, hãy ưu tiên mô tả hoặc liệt kê sản phẩm theo knowledge trước; chỉ nêu hạn chế về ảnh/video khi thật sự cần.
- Nếu đã có context phù hợp về sản phẩm, ưu tiên trả lời theo cấu trúc: xác nhận nhu cầu, nêu 1-3 lựa chọn phù hợp, tóm tắt ngắn lý do phù hợp, rồi mới hỏi thêm 1 câu ngắn nếu cần.
- Không lặp lại nguyên văn cùng một mẫu câu chào hỏi, xin chuyển nhân viên hoặc giải thích dài dòng ở nhiều lượt tiếp theo. Mỗi lượt phải có tiến triển mới.
`;

    const systemInstruction = `
Bạn là trợ lý AI thông minh đại diện cho ${companyName}.
Bạn đang trực tiếp hỗ trợ khách hàng trong khung chat của chính doanh nghiệp ${companyName}.

======================================================================
1. NGUỒN SỰ THẬT TỐI CAO - DỮ LIỆU KHO TRI THỨC (RAG) CỦA DOANH NGHIỆP:
======================================================================
Dữ liệu tri thức đã được truy xuất riêng cho doanh nghiệp ${ragContext?.companyCode || "hiện tại"}:
${ragContext?.contextText ? ragContext.contextText : "- Chưa có tài liệu riêng trong kho tri thức."}

NGUYÊN TẮC ĐỌC RAG VÀ TRẢ LỜI ĐÚNG YÊU CẦU CỦA NGƯỜI DÙNG:
- BẮT BUỘC ĐỌC KỸ TOÀN BỘ DỮ LIỆU TRI THỨC (RAG) Ở TRÊN (bao gồm tất cả các mục [Bảng giá], [Sản phẩm], [Hồ sơ doanh nghiệp], [Chính sách], [Dịch vụ], [FAQ]).
- BẠN CHỈ ĐƯỢC TƯ VẤN CÁC SẢN PHẨM / DỊCH VỤ THỰC TẾ XUẤT HIỆN TRONG KHO TRI THỨC CỦA DOANH NGHIỆP Ở TRÊN. TUYỆT ĐỐI KHÔNG tự bịa ra sản phẩm mỹ phẩm, kem dưỡng, son môi, quần áo hay bất kỳ sản phẩm nào không có trong dữ liệu.
- Khi khách hàng hỏi bất kỳ thông tin nào (sản phẩm, giá bán, tính năng, số lượng, quy cách, bảo hành, đổi trả, phí ship, địa chỉ, hotline, giờ mở cửa...), BẠN PHẢI TRÍCH XUẤT CHÍNH XÁC VÀ TRẢ LỜI ĐẦY ĐỦ, ĐÚNG TRỌNG TÂM CÂU HỎI của khách từ dữ liệu RAG.
- Nếu khách hỏi danh sách sản phẩm/dịch vụ, hãy liệt kê và tóm tắt đúng các sản phẩm có trong dữ liệu tri thức.
- Nếu khách hỏi giá hoặc mua nhiều sản phẩm, tính toán giá chính xác theo đơn giá có trong RAG (số lượng * đơn giá = tổng tiền).
- Tuyệt đối KHÔNG trả lời từ chối hoặc nói "chưa có thông tin" nếu dữ liệu đó ĐÃ CÓ trong kho tri thức ở trên.
- Nếu dữ liệu tri thức thực sự chưa có thông tin sản phẩm khách hỏi hoặc câu hỏi nằm ngoài phạm vi, hãy lịch sự thông báo bên em chưa có dữ liệu chi tiết về sản phẩm này và mời khách để lại thông tin để nhân viên tư vấn trực tiếp, TUYỆT ĐỐI KHÔNG tự bịa ra sản phẩm.

======================================================================
2. PHONG CÁCH VÀ CHỈ DẪN RIÊNG CỦA DOANH NGHIỆP (CÁ NHÂN HÓA CAO NHẤT):
======================================================================
Tùy từng doanh nghiệp sẽ có ngành nghề, phong cách thương hiệu (Tone of Voice) và quy tắc giao tiếp hoàn toàn khác nhau:
${aiConfig.advancedInstructions ? `👉 CHỈ DẪN ĐẶC BIỆT TỪ DOANH NGHIỆP (BẮT BUỘC TUÂN THỦ ƯU TIÊN HÀNG ĐẦU):
${aiConfig.advancedInstructions}` : "- Doanh nghiệp sử dụng phong cách chăm sóc khách hàng chuẩn mực, tự nhiên và thân thiện."}

- NGUYÊN TẮC TÙY BIẾN:
  + Nếu doanh nghiệp có chỉ dẫn riêng về cách xưng hô (ví dụ: "Shop - Bạn", "Em - Anh/Chị", "Chuyên viên - Quý khách"), hãy tuân thủ chính xác chỉ dẫn của doanh nghiệp đó.
  + Nếu doanh nghiệp có kịch bản tư vấn, chính sách chốt đơn, hoặc quy tắc ưu đãi riêng, hãy áp dụng đúng theo chỉ dẫn của doanh nghiệp.
  + BẮT BUỘC chỉ tư vấn đúng ngành nghề, sản phẩm, dịch vụ thực tế có trong kho tri thức của doanh nghiệp. TUYỆT ĐỐI KHÔNG tự bịa đặt các ngành hàng khác nếu kho tri thức doanh nghiệp không có.

======================================================================
3. QUY TẮC CHĂM SÓC KHÁCH HÀNG TỰ NHIÊN VÀ CHUYÊN NGHIỆP:
======================================================================
${conversationPlaybook}

- XƯNG HÔ VÀ GIAO TIẾP:
  + Nếu doanh nghiệp không có chỉ dẫn xưng hô riêng: Luôn mở đầu lịch sự ("Dạ, em chào anh/chị ạ!", "Dạ, ${companyName} xin chào anh/chị ạ!"), xưng "em"/"bên em" và gọi khách là "Anh/Chị" hoặc "Quý khách".
  + Sử dụng ngôn ngữ tự nhiên như nhân viên tư vấn thật đang nhắn tin, trả lời súc tích, dễ hiểu, tránh văn phong robot cứng nhắc.
  + Chỉ sử dụng icon/emoji khi thực sự phù hợp (tối đa 1 emoji), không lặp đi lặp lại ở mọi câu.
  + Tránh chia đoạn quá dài; tách các ý quan trọng thành các dòng ngắn gọn để khách hàng dễ đọc trên điện thoại.

${ragContext?.shouldAskProductConfirmation && ragContext?.productCandidateNames?.length
        ? `GỢI Ý XÁC NHẬN SẢN PHẨM:
- Khách có thể đang gõ chưa chuẩn tên sản phẩm. Hãy xác nhận nhẹ nhàng: "Dạ, anh/chị đang quan tâm đến sản phẩm ${ragContext.productCandidateNames[0]} đúng không ạ?".`
        : ""}

CẤU HÌNH TỰ ĐỘNG BỔ TRỢ:
- Tự động phân loại khách hàng: ${aiConfig.autoClassify ? "BẬT" : "TẮT"}
- Tự động định hướng chốt đơn: ${aiConfig.autoCloseDeal ? "BẬT (Khéo léo hỗ trợ khách chốt mua khi khách đã có nhu cầu rõ ràng)" : "TẮT"}
- Tự động xin feedback cuối cuộc trò chuyện: ${aiConfig.autoFeedback ? "BẬT" : "TẮT"}
`;

    const humanStyleOverride = `
STYLE OVERRIDE:
- Hãy trả lời như nhân viên tư vấn thật đang nhắn tin với khách hàng, ngôn phong tự nhiên, nhiệt tình, không nói máy móc giống bot.
- Tuân thủ chỉ dẫn riêng của doanh nghiệp về cách xưng hô và phong cách giao tiếp (nếu có ở mục 2).
- Nếu cần trình bày nhiều thông tin (bảng giá, danh sách sản phẩm, thông số, chính sách), hãy phân tách thành các dòng ngắn gọn, rõ ràng, dễ đọc trên điện thoại.
- Trả lời thẳng vào câu hỏi của khách hàng dựa trên dữ liệu RAG, không giải thích vòng vo.
`;

    const finalSystemInstruction = `${systemInstruction}\n${humanStyleOverride}`;

    const contents = history.map((h: any) => ({
      role: h.sender === "user" ? "user" : "model",
      parts: [{ text: h.text }],
    }));

    contents.push({
      role: "user",
      parts: [{ text: message }],
    });

    try {
      const selectedModel = aiConfig?.model || AI_REPLY_MESSAGE_MODEL;
      const fallbackNoKnowledgeReply =
        shouldRequireStrictKnowledge && !hasCompanyKnowledge
          ? `Dạ, hiện tại em chưa có đủ dữ liệu xác nhận chính xác thông tin này từ tài liệu nội bộ của ${companyName}. Em xin phép chuyển nhân viên hỗ trợ để tư vấn đúng và đầy đủ hơn ạ.`
          : null;

      if (detectedIntent === "out_of_scope") {
        return {
          text: formatHumanLikeChatReply(`Dạ, em đang hỗ trợ thông tin về sản phẩm, dịch vụ và chính sách của ${companyName}. Anh/chị cứ gửi giúp em câu hỏi liên quan đến doanh nghiệp để em hỗ trợ đúng hơn ạ.`),
          isMock: false,
        };
      }

      if (fallbackNoKnowledgeReply) {
        return {
          text: formatHumanLikeChatReply(fallbackNoKnowledgeReply),
          isMock: false,
        };
      }

      const response = await generateText(
        selectedModel,
        contents,
        {
          systemInstruction: finalSystemInstruction,
          temperature: detectedIntent === "small_talk" ? 0.75 : 0.35,
        }
      );

      response.text = formatHumanLikeChatReply(response.text || "Dạ, em kiểm tra lại rồi phản hồi mình ngay nhé ạ.");

      return {
        text: response.text || "Xin lỗi, tôi chưa thể xử lý yêu cầu lúc này. Vui lòng thử lại.",
        isMock: false,
      };
    } catch (error: any) {
      console.error("[geminiService.chat] Error:", error);
      throw error;
    }
  }

  async chatComment(message: string, aiConfig: any, ragContext?: any) {
    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.trim() === "") {
      throw new Error("Chưa cấu hình OPENROUTER_API_KEY trên hệ thống.");
    }

    const companyCode = ragContext?.companyCode || aiConfig?.companyCode;
    let companyName = aiConfig?.companyName || "";

    if (!companyName && companyCode) {
      try {
        const company = await CompanyModel.findOne({ code: companyCode.toUpperCase() }).lean();
        if (company) {
          companyName = company.name;
        }
      } catch (err) {
        console.warn("[geminiService.chatComment] Error fetching company from DB:", err);
      }
    }
    if (!companyName) {
      companyName = "doanh nghiệp";
    }

    const systemInstruction = `
Bạn là trợ lý chăm sóc khách hàng của ${companyName}.
Nhiệm vụ của bạn là phản hồi bình luận công khai (comment) của khách hàng trên bài viết Facebook bằng hai nội dung:
1. Một câu trả lời bình luận công khai (publicComment).
2. Một tin nhắn inbox riêng tư gửi trực tiếp cho khách hàng (privateInbox).

======================================================================
1. NGUỒN SỰ THẬT TỐI CAO - DỮ LIỆU KHO TRI THỨC (RAG) CỦA DOANH NGHIỆP:
======================================================================
Dữ liệu tri thức đã truy xuất riêng cho doanh nghiệp ${ragContext?.companyCode || "hiện tại"}:
${ragContext?.contextText ? ragContext.contextText : "- Không tìm thấy tri thức phù hợp trong kho dữ liệu."}

======================================================================
2. CHỈ DẪN RIÊNG VÀ PHONG CÁCH CỦA DOANH NGHIỆP:
======================================================================
${aiConfig.advancedInstructions ? `👉 CHỈ DẪN ĐẶC BIỆT TỪ DOANH NGHIỆP:
${aiConfig.advancedInstructions}` : "- Doanh nghiệp sử dụng phong cách chăm sóc khách hàng lịch thiệp, chu đáo."}

QUY TẮC PHẢN HỒI BÌNH LUẬN CÔNG KHAI (publicComment):
- ĐỘ DÀI: Cực kỳ ngắn gọn và súc tích, tối đa khoảng 1 đến 2 câu ngắn.
- ĐỊNH DẠNG: Viết trên MỘT DÒNG DUY NHẤT (single line). KHÔNG được xuống dòng, không dùng gạch đầu dòng, không dùng dấu * hoặc **.
- NỘI DUNG: Trả lời ngắn hoặc kêu gọi hành động lịch sự hướng khách check tin nhắn riêng tư/inbox.
- TUYỆT ĐỐI KHÔNG tự nhận bán mỹ phẩm hay bịa đặt sản phẩm ngành hàng khác nếu dữ liệu doanh nghiệp không có.

QUY TẮC TIN NHẮN RIÊNG TƯ (privateInbox):
- NỘI DUNG: Đọc kỹ RAG và trả lời chi tiết, chính xác câu hỏi của khách hàng (giá bán, tính năng, sản phẩm, bảo hành, địa chỉ, v.v.). CHỈ tư vấn đúng sản phẩm trong dữ liệu RAG, KHÔNG tự bịa ngành hàng khác.
- NGÔN PHONG: Lịch sự, chuyên nghiệp, tự nhiên. Tuân thủ cách xưng hô theo chỉ dẫn của doanh nghiệp.
`;

    const responseSchema = {
      type: "object",
      properties: {
        publicComment: {
          type: "string",
          description: "Câu trả lời bình luận công khai. Phải trên một dòng duy nhất, có CTA hướng dẫn khách kiểm tra inbox."
        },
        privateInbox: {
          type: "string",
          description: "Nội dung tin nhắn inbox gửi riêng tư cho khách hàng. Trả lời chi tiết dựa trên dữ liệu RAG."
        }
      },
      required: ["publicComment", "privateInbox"]
    };

    try {
      const selectedModel = aiConfig?.model || AI_REPLY_COMMENT_MODEL;
      const response = await generateText(
        selectedModel,
        `Nội dung bình luận của khách hàng:\n"${message}"`,
        {
          systemInstruction,
          temperature: 0.35,
          responseSchema,
        }
      );

      let parsed: any;
      try {
        parsed = JSON.parse(response.text);
      } catch (e) {
        console.warn("[geminiService.chatComment] Failed to parse JSON response:", response.text);
        parsed = {
          publicComment: "Dạ chào anh/chị, bên em đã gửi thông tin chi tiết qua inbox cho mình rồi ạ. Anh/Chị check tin nhắn giúp em nhé!",
          privateInbox: response.text || "Dạ chào anh/chị. Cảm ơn anh/chị đã quan tâm đến sản phẩm của bên em. Anh/Chị cần bên em hỗ trợ tư vấn thông tin gì cụ thể ạ?"
        };
      }

      let publicComment = parsed.publicComment || "Dạ chào anh/chị, bên em đã gửi thông tin chi tiết cho mình rồi ạ. Anh/Chị check tin nhắn giúp em nhé!";
      let privateInbox = parsed.privateInbox || "Dạ chào anh/chị. Cảm ơn anh/chị đã quan tâm đến dịch vụ bên em.";

      // Clean up publicComment to guarantee single line
      publicComment = publicComment.replace(/[*#]/g, "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
      // Clean up privateInbox formatting
      privateInbox = privateInbox.replace(/[*#]/g, "").trim();

      return {
        publicComment,
        privateInbox,
        isMock: false,
      };
    } catch (error: any) {
      console.error("[geminiService.chatComment] Error:", error);
      throw error;
    }
  }

  /**
   * Sinh tin nhắn chăm sóc tự động (Follow-up) cho khách hàng im lặng sau khi hỏi giá/tư vấn
   */
  async generateFollowUpMessage(params: {
    history: Array<{ sender: "user" | "ai" | "agent"; text: string }>;
    aiConfig?: any;
    ragContext?: {
      contextText?: string;
      matches?: number;
      bestScore?: number;
      productCandidateNames?: string[];
      shouldAskProductConfirmation?: boolean;
      companyCode?: string;
    };
  }): Promise<{ text: string; isMock?: boolean }> {
    const { history, aiConfig, ragContext } = params;
    const companyCode = ragContext?.companyCode || aiConfig?.companyCode;
    let companyName = aiConfig?.companyName || "";

    if (!companyName && companyCode) {
      try {
        const company = await CompanyModel.findOne({ code: companyCode.toUpperCase() }).lean();
        if (company) {
          companyName = company.name;
        }
      } catch (err) {
        console.warn("[geminiService.generateFollowUpMessage] Error fetching company from DB:", err);
      }
    }
    if (!companyName) {
      companyName = "doanh nghiệp";
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return {
        text: `Dạ em chào anh/chị ạ! Không biết mình còn cần bên em hỗ trợ tư vấn thêm thông tin nào về sản phẩm nữa không ạ?`,
        isMock: true,
      };
    }

    const conversationExcerpt = history
      .slice(-6)
      .map((item) => `${item.sender === "user" ? "Khách hàng" : "Trợ lý"}: ${item.text}`)
      .join("\n");

    const customPrompt = aiConfig?.followUpPrompt || aiConfig?.advancedInstructions || "";
    const systemInstruction = `
Bạn là Trợ lý Chăm sóc Khách hàng chuyên nghiệp của ${companyName}.
Nhiệm vụ: Viết MỘT tin nhắn ngắn gọn (1-2 câu), tự nhiên, lịch sự, ấm áp để FOLLOW-UP (chăm sóc lại) một khách hàng đã nhắn tin hỏi về sản phẩm/dịch vụ trước đó nhưng hiện đang im lặng.

Yêu cầu nghiêm ngặt:
1. Đọc lịch sử cuộc trò chuyện để nhắc đúng sản phẩm hoặc nhu cầu mà khách hàng đã quan tâm.
2. Tuyệt đối không ép mua hàng, không thúc giục hay tỏ ra phiền hà.
3. Thể hiện sự sẵn sàng hỗ trợ, giải đáp thắc mắc thêm về mẫu mã, kích thước, phí ship hoặc ưu đãi nếu có.
4. Xưng hô "em", gọi khách là "anh/chị" hoặc xưng hô lịch sự phù hợp với ngữ cảnh.
${ragContext?.contextText ? `\nNgữ cảnh tài liệu nội bộ:\n${ragContext.contextText.slice(0, 2000)}` : ""}
${customPrompt ? `\nLưu ý đặc biệt từ doanh nghiệp:\n${customPrompt}` : ""}
`.trim();

    const userPrompt = `
Lịch sử cuộc trò chuyện trước đó:
${conversationExcerpt}

Hãy viết 1 tin nhắn Follow-up ngắn gọn, ấm áp để hỏi thăm và hỗ trợ khách hàng:
`.trim();

    try {
      const selectedModel = aiConfig?.model || GEMINI_TEXT_MODEL;
      const response = await generateText(
        selectedModel,
        [{ role: "user", parts: [{ text: userPrompt }] }],
        {
          systemInstruction,
          temperature: 0.6,
        }
      );

      const replyText = formatHumanLikeChatReply(response.text || "");
      return { text: replyText, isMock: false };
    } catch (error) {
      console.error("[geminiService.generateFollowUpMessage] Error:", error);
      return {
        text: `Dạ em chào anh/chị ạ! Không biết mình còn băn khoăn hay cần bên em hỗ trợ giải đáp thêm thông tin nào nữa không ạ?`,
        isMock: true,
      };
    }
  }

  /**
   * Tự động băm/chuyển đổi tài liệu dài thành danh sách FAQs rút gọn
   */
  async convertDocToFAQ(docText: string): Promise<string> {
    const getMockFAQ = () => {
      return `--- BẢN FAQ ĐÃ ĐƯỢC CHUẨN HÓA (CHẾ ĐỘ MÔ PHỎNG AI) ---
Q: Tài liệu này nói về chủ đề gì?
A: Tài liệu giới thiệu thông tin vận hành, chính sách bán hàng của doanh nghiệp.

Q: Làm thế nào để liên hệ hỗ trợ?
A: Vui lòng liên hệ hotline hoặc email hỗ trợ được công bố của doanh nghiệp.

Q: Chính sách vận chuyển của chúng tôi là gì?
A: Giao hàng toàn quốc. Miễn phí vận chuyển cho đơn hàng trị giá từ 500k trở lên.`;
    };

    if (!process.env.OPENROUTER_API_KEY) {
      return getMockFAQ();
    }

    try {
      const prompt = `Bạn là một chuyên gia huấn luyện AI bán hàng và chăm sóc khách hàng.
Hãy đọc kỹ tài liệu bán hàng/quy trình/chính sách sau đây của doanh nghiệp và chuyển đổi toàn bộ thông tin quan trọng thành một danh sách các câu hỏi thường gặp FAQs định dạng chuẩn để làm dữ liệu huấn luyện cho Chatbot.

QUY TẮC:
1. Định dạng câu trả lời bắt buộc là:
Q: [Câu hỏi của khách hàng]
A: [Câu trả lời chuẩn mực của AI]

Q: [Câu hỏi tiếp theo]
A: [Câu trả lời tiếp theo]

2. Hãy chắt lọc toàn bộ số hotline, bảng giá dịch vụ/sản phẩm, chính sách giao hàng, chính sách đổi trả/bảo hành, giờ mở cửa.
3. Không tự tiện bịa đặt thông tin không có trong tài liệu.
4. Trả lời bằng tiếng Việt lịch sự, súc tích và chính xác.

NỘI DUNG TÀI LIỆU CẦN CHUYỂN ĐỔI:
${docText}
`;

      const response = await generateText(
        GEMINI_TEXT_MODEL,
        prompt
      );

      return response.text || "Không thể trích xuất được dữ liệu FAQ từ tài liệu.";
    } catch (error: any) {
      console.error("[geminiService.convertDocToFAQ] Error, fallback to mock FAQ:", error);
      return getMockFAQ();
    }
  }
}

export const geminiChatService = new GeminiChatService();
