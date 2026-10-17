import { FBConversationModel, FBMessageModel } from "../model/fb-messenger.model";
import { ZaloConversationModel, ZaloMessageModel } from "../model/zalo-messenger.model";
import { TikTokConversationModel, TikTokMessageModel } from "../model/tiktok-messenger.model";
import { UserModel } from "../model/user.model";
import type { ChatContextMessage } from "./chat-context";
import type { ChatSourceMessage } from "./chat-reply-context.service";

type Channel = "facebook" | "zalo" | "tiktok";
type PreviewConfig = { model?: string; trainingKnowledge?: string; imageReplyEnabled?: boolean; [key: string]: unknown };
type OwnerResolver = (channel: Channel, platformId: string) => Promise<{
  companyCode: string;
  aiConfig: PreviewConfig | null;
}>;

function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

/** Read the same saved configuration as auto-reply. Authorize before reading messages. */
export async function prepareChatPreview(input: {
  userId: string;
  companyCode: string;
  channel: Channel;
  conversationId?: string;
  platformId?: string;
  withImages?: boolean;
}, resolveOwner: OwnerResolver) {
  const { channel, conversationId } = input;
  let platformId = input.platformId;
  if (conversationId) {
    if (channel === "facebook") {
      const conversation = await FBConversationModel.findById(conversationId).select("pageId").lean();
      if (!conversation) fail(404, "Không tìm thấy hội thoại để kiểm định AI.");
      platformId = conversation.pageId;
    } else if (channel === "zalo") {
      const conversation = await ZaloConversationModel.findById(conversationId).select("oaId").lean();
      if (!conversation) fail(404, "Không tìm thấy hội thoại để kiểm định AI.");
      platformId = conversation.oaId;
    } else {
      const conversation = await TikTokConversationModel.findById(conversationId).select("businessAccountId").lean();
      if (!conversation) fail(404, "Không tìm thấy hội thoại để kiểm định AI.");
      platformId = conversation.businessAccountId;
    }
  }

  let aiConfig: PreviewConfig = {};
  if (platformId) {
    const owner = await resolveOwner(channel, platformId);
    if (!input.companyCode || owner.companyCode.toUpperCase() !== input.companyCode.toUpperCase()) {
      fail(403, "Bạn không có quyền kiểm định AI cho hội thoại này.");
    }
    aiConfig = owner.aiConfig || {};
  } else {
    const user = await UserModel.findById(input.userId).select("aiAutoReplyConfig").lean();
    aiConfig = (user?.aiAutoReplyConfig || {}) as PreviewConfig;
  }

  let history: ChatContextMessage[] = [];
  let sourceMessages: ChatSourceMessage[] = [];
  let sessionId: string | undefined;
  if (conversationId) {
    const filter = { conversationId };
    const visualHistory = aiConfig.imageReplyEnabled === true || input.withImages === true;
    const limit = visualHistory ? 60 : 15;
    const messages = channel === "facebook"
      ? await FBMessageModel.find(filter).sort({ timestamp: -1 }).limit(limit).lean()
      : channel === "zalo"
        ? await ZaloMessageModel.find(filter).sort({ timestamp: -1 }).limit(limit).lean()
        : await TikTokMessageModel.find(filter).sort({ timestamp: -1 }).limit(limit).lean();
    sourceMessages = messages.reverse();
    sessionId = channel === "facebook" && visualHistory
      ? [...sourceMessages].reverse().find(message => message.direction === "inbound")?.consultationSessionId : undefined;
    if (sessionId) sourceMessages = sourceMessages.filter(message => message.consultationSessionId === sessionId);
    history = sourceMessages.map((message) => ({
      sender: message.direction === "inbound" ? "user" : "model",
      text: message.text || "",
      ...(visualHistory ? { messageId: message.messageId } : {}),
    }));
  }
  return { aiConfig, history, channel, sourceMessages, sessionId, platformId, pageId: channel === "facebook" ? platformId : undefined };
}
