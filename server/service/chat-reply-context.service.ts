import { aiKnowledgeService } from "./ai-knowledge.service";
import { analyzeChatImages, getChatImageUrls, isImagePriceInquiry, splitHistoryAndPendingInboundMessages } from "./chat-image-context";
import { prepareChatImages, type ChatImageReference, type ChatVisualInput, type ChatVisualResult, type PreparedChatImage } from "./chat-visual-context";
import { chatVisualMemory, CHAT_VISUAL_SESSION_MS, type ChatVisualScope } from "./chat-visual-memory.service";
import { CakeCheckoutModel } from "../model/cake-checkout.model";
import type { ChatRagContext } from "./gemini/types";
import type { ChatContextMessage } from "./chat-context";
import { isNewOrderStartMessage } from "./messenger-order-context";

export interface ChatSourceMessage {
  messageId?: string;
  direction?: string;
  text?: string;
  timestamp?: Date;
  consultationSessionId?: string;
  attachments?: Array<{ type?: string; url?: string }>;
}
export interface PreparedChatReplyContext {
  ragContext: ChatRagContext;
  visualInput?: ChatVisualInput;
  memoryScope?: ChatVisualScope;
  memoryImages: Omit<PreparedChatImage, "dataUrl">[];
  sourceMessageId: string;
  sourceTimestamp: Date;
  resetMemory: boolean;
}

function normalize(message: string) {
  return message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
}
export function startsNewVisualSubject(message: string) {
  const text = normalize(message);
  if (/\b(?:don moi|mau khac|banh khac|san pham khac|anh khac|dat moi|mua moi)\b/.test(text)) return true;
  return isNewOrderStartMessage(message)
    && !/\b(?:mau|size|kich thuoc|banh nay|cai nay|theo anh|anh nay|anh tren|anh vua gui|hinh nay|hinh tren)\b/.test(text);
}
export function refersToVisualSubject(message: string) {
  return isVisualSelectionAnswer(message)
    || /\b(?:anh|hinh|mau|size|kich thuoc|nho nhat|be nhat|lon nhat|gia|bao nhieu|trang tri|topper|hoa tiet|giu nguyen|cho nay|cho do|cai nay|cai do|nhu cu|giong vay|ben trai|ben phai|thu hai|thu nhat|chu tren|ghi chu)\b/.test(normalize(message));
}
function isVisualSelectionAnswer(message: string) {
  return /^(?:(?:mau|cai|banh|so)\s*)?(?:[123]|dau|cuoi)(?:\s+(?:a|nhe|nha))?$/.test(normalize(message).trim());
}
function needsAnotherLook(message: string) {
  const text = normalize(message);
  return /\b(?:doc|nhin|xem lai|phong to|chu tren|chu gi|ghi chu|ghi gi|mau gi|hinh gi|chi tiet|cho danh dau|ben trai|ben phai|thu hai|thu nhat|may tang|bao nhieu tang)\b/.test(text)
    || /\b(?:hoa tiet|topper|hinh dang|chu so|so)\b.{0,40}\b(?:gi|nao|may)\b/.test(text);
}
function answersVisualQuestion(message: string, history: ChatContextMessage[]) {
  if (!message.trim() || message.trim().length > 160 || /[?？]/u.test(message)) return false;
  const lastReply = [...history].reverse().find(item => item.sender === "model");
  return Boolean(lastReply && /\b(?:mau|size|trang tri|so va chu|chu tren|giu so|giu nguyen|doi noi dung|hinh dang)\b/.test(normalize(lastReply.text || "")));
}
function imageReferences(messages: ChatSourceMessage[], urls: string[], messageId: string): ChatImageReference[] {
  return urls.map(url => ({ url, messageId: [...messages].reverse().find(message =>
    message.direction === "inbound" && getChatImageUrls([message]).includes(url))?.messageId || messageId }));
}

/** Shared by live replies and read-only previews; this function never changes an order or sends a message. */
export async function prepareChatReplyContext(input: {
  companyCode: string;
  channel: ChatVisualScope["channel"];
  platformId?: string;
  conversationId?: string;
  sessionId?: string;
  messageId: string;
  timestamp?: Date;
  message: string;
  history: ChatContextMessage[];
  messages?: ChatSourceMessage[];
  imageUrls?: string[];
  uploadedImages?: string[];
  aiConfig: { imageReplyEnabled?: boolean; trainingKnowledge?: string };
  deadlineAt?: number;
}): Promise<PreparedChatReplyContext> {
  const timestamp = input.timestamp || new Date();
  const messages = input.messages || [];
  const historyIds = new Set(input.history.map(message => message.messageId).filter(Boolean));
  const pendingMessages = new Set(splitHistoryAndPendingInboundMessages(messages).pendingMessages);
  const contextualMessages = messages.filter(message => pendingMessages.has(message) || historyIds.has(message.messageId));
  const sourceMessageIds = contextualMessages.filter(message => message.direction === "inbound")
    .map(message => message.messageId).filter((id): id is string => Boolean(id));
  const sourceMessages = contextualMessages.filter(message => message.direction === "inbound" && message.messageId)
    .map(message => ({ messageId: message.messageId!, text: message.text || "" }));
  const memoryScope: ChatVisualScope | undefined = input.conversationId && input.platformId ? {
    companyCode: input.companyCode, channel: input.channel, platformId: input.platformId,
    conversationId: input.conversationId, sessionId: input.sessionId || "conversation",
  } : undefined;
  const resetMemory = startsNewVisualSubject(input.message);
  let references = imageReferences(messages, input.imageUrls || [], input.messageId);
  if (input.uploadedImages?.length) references = input.uploadedImages.map(dataUrl => ({ dataUrl, messageId: input.messageId }));
  let visualInput: ChatVisualInput | undefined;
  let memoryImages: Omit<PreparedChatImage, "dataUrl">[] = [];
  let observation;
  if (input.aiConfig.imageReplyEnabled === true) {
    const detailQuestion = needsAnotherLook(input.message);
    const visualFollowUp = refersToVisualSubject(input.message) || answersVisualQuestion(input.message, input.history) || detailQuestion;
    const memory = memoryScope && !resetMemory && (references.length || visualFollowUp)
      ? await chatVisualMemory.read(memoryScope) : undefined;
    for (const request of memory?.visual.customerRequests || []) {
      if (request.sourceText && !sourceMessages.some(message => message.messageId === request.sourceMessageId)) {
        sourceMessages.push({ messageId: request.sourceMessageId, text: request.sourceText });
        sourceMessageIds.push(request.sourceMessageId);
      }
    }
    const sameImages = Boolean(memory && references.length && references.every(ref =>
      memory.images.some(image => image.url === ref.url && ref.url)));
    const lookAgain = detailQuestion || Boolean(memory?.visual.needsSelection && isVisualSelectionAnswer(input.message));
    if (!references.length && !memory && !resetMemory && visualFollowUp) {
      for (const message of [...messages].reverse()) {
        if (message.direction !== "inbound") continue;
        if (getChatImageUrls([message]).length) {
          const age = message.timestamp ? timestamp.getTime() - new Date(message.timestamp).getTime() : Infinity;
          if (age >= 0 && age < CHAT_VISUAL_SESSION_MS) references = imageReferences(messages, getChatImageUrls([message]), input.messageId);
          break;
        }
        if (startsNewVisualSubject(message.text || "")) break;
      }
    }
    if (memory && (!references.length || sameImages) && !lookAgain) {
      memoryImages = memory.images;
      visualInput = { images: [], messageId: input.messageId, customerMessage: input.message, sourceMessageIds, sourceMessages, previous: memory.visual };
    } else if (references.length || (memory && lookAgain)) {
      const chosen = references.length ? references : memory!.images.filter(image => Boolean(image.url))
        .map(image => ({ url: image.url, messageId: image.messageId }));
      const loaded = await prepareChatImages(chosen);
      memoryImages = loaded.images.map(({ dataUrl: _dataUrl, ...image }) => image);
      visualInput = { ...loaded, messageId: input.messageId, customerMessage: input.message, sourceMessageIds, sourceMessages,
        ...(sameImages || !references.length ? { previous: memory?.visual } : {}) };
    }
  } else {
    observation = await analyzeChatImages(input.imageUrls || [], input.message);
  }
  const retrievalMessage = observation?.status === "ready"
    ? input.message + "\nKhách gửi ảnh sản phẩm cần tư vấn: " + observation.description
    : visualInput?.previous ? input.message + "\nMẫu khách đang tham khảo: " + visualInput.previous.summary
      : visualInput ? input.message + "\nKhách cần tư vấn mẫu trong ảnh đính kèm." : input.message;
  const [ragContext, pricingContextText, checkout] = await Promise.all([
    aiKnowledgeService.prepareChatContext({
      companyCode: input.companyCode, message: retrievalMessage, history: input.history, channel: input.channel,
      pageId: input.channel === "facebook" ? input.platformId : undefined, trainingKnowledge: input.aiConfig.trainingKnowledge,
    }),
    visualInput || (observation && isImagePriceInquiry(input.message))
      ? aiKnowledgeService.getFullPricingContext({ companyCode: input.companyCode, channel: input.channel,
        pageId: input.channel === "facebook" ? input.platformId : undefined }) : Promise.resolve(""),
    visualInput && !resetMemory && memoryScope?.channel === "facebook"
      ? CakeCheckoutModel.findOne({ companyCode: memoryScope.companyCode, pageId: memoryScope.platformId,
        conversationId: memoryScope.conversationId, ...(input.sessionId ? { sessionId: input.sessionId } : {}) }).lean()
      : Promise.resolve(null),
  ]);
  const orderContext = checkout ? JSON.stringify({
    state: checkout.state, details: checkout.details,
    totals: checkout.snapshot ? { total: checkout.snapshot.total, deposit: checkout.snapshot.deposit, balance: checkout.snapshot.balance } : undefined,
  }) : "";
  return {
    ragContext: { ...ragContext, imageObservation: observation, imageDescription: observation?.description,
      visualInput, visualContext: visualInput?.previous, pricingContextText,
      replyDeadlineAt: input.deadlineAt,
      contextText: [ragContext.contextText, orderContext ? "Dữ liệu đơn hiện tại từ backend: " + orderContext : ""].filter(Boolean).join("\n\n") },
    visualInput, memoryScope, memoryImages, sourceMessageId: input.messageId, sourceTimestamp: timestamp, resetMemory,
  };
}

/** Call only after checking that the live inbound turn is still current. Preview never calls this. */
export async function commitChatVisualContext(prepared: PreparedChatReplyContext, visual?: ChatVisualResult) {
  if (!prepared.memoryScope) return;
  if (visual?.readable && prepared.memoryImages.length) {
    await chatVisualMemory.save(prepared.memoryScope, { images: prepared.memoryImages, visual,
      sourceMessageId: prepared.sourceMessageId, sourceTimestamp: prepared.sourceTimestamp });
  } else if (prepared.resetMemory || prepared.visualInput?.failure || (prepared.visualInput?.images.length && visual?.readable === false)) {
    await chatVisualMemory.reset(prepared.memoryScope, prepared.sourceTimestamp);
  }
}

export function describeChatVisualContext(prepared: PreparedChatReplyContext) {
  return {
    mode: prepared.visualInput ? "multimodal" as const : "legacy" as const,
    imageCount: prepared.visualInput?.images.length || 0,
    hasMemory: Boolean(prepared.visualInput?.previous),
    imageSizes: prepared.visualInput?.images.map(({ width, height }) => ({ width, height })) || [],
    failure: prepared.visualInput?.failure || "",
  };
}

export function buildChatConversationInstructions(advancedInstructions?: string) {
  return [advancedInstructions,
    "Cách trò chuyện: trả lời như người bán đang nhắn trực tiếp với khách. Trả lời ý khách vừa hỏi trước, sau đó mới hỏi gộp những thông tin liên quan còn thiếu. Dùng câu ngắn, tự nhiên, không mở mọi tin bằng cùng một câu 'Dạ em đã ghi nhận'. Không dùng giọng biểu mẫu, mô tả quy trình nội bộ hay nói 'chuyển shop/bộ phận/nhân viên kiểm tra'. Không hỏi lại thông tin đã có, không nhắc lại toàn bộ đơn ở mỗi lượt. Giữ cách xưng hô theo rule và cách khách tự xưng; không đoán từ tên hay người được tặng bánh, không đổi anh/chị tùy tiện. Khi chưa rõ cách gọi, có thể lược bỏ đại từ thay vì lặp 'anh chị'. Không tự nhận mình là người thật. Không hứa hành động chưa được thực hiện. Chính sách giao hàng và phí lấy từ tri thức đúng Page, không tự suy đoán. Khi khách nói bất tiện hoặc khó đến lấy, phản hồi ngắn gọn, quan tâm đúng tình huống rồi giải quyết nhu cầu giao hàng. Ưu tiên một tin nhắn gọn; chỉ dùng danh sách khi báo nhiều lựa chọn hoặc xác nhận đơn.",
  ].filter(Boolean).join("\n");
}
