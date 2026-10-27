import { FBConversationModel, FBMessageModel } from "../model/fb-messenger.model";
import { FacebookAutoReplyJobModel } from "../model/facebook-auto-reply-job.model";
import { FacebookMessengerError } from "./fb-messenger-error";

export const FACEBOOK_AI_METADATA = "igen:automated-reply:v1";
export const HUMAN_REPLY_PAUSE_MS = 30 * 60 * 1000;

export async function pauseFacebookForHuman(pageId: string, conversationId: string, sentAt = new Date()) {
  const until = new Date(Math.min(sentAt.getTime(), Date.now()) + HUMAN_REPLY_PAUSE_MS);
  if (until <= new Date()) return null;
  const conversation = await FBConversationModel.findOneAndUpdate({ _id: conversationId, pageId }, {
    $max: { aiPausedUntil: until }, $set: { followUpStatus: "idle" },
  }, { new: true });
  if (!conversation) return null;
  await FacebookAutoReplyJobModel.updateOne({ channel: "facebook", conversationId,
    status: { $in: ["pending", "processing"] } }, {
    $set: { status: "cancelled", lastError: "Cancelled after a human agent replied." },
    $unset: { leaseToken: 1, leaseUntil: 1 },
  });
  return conversation;
}

export async function assertFacebookAiReplyAllowed(pageId: string, conversationId: string) {
  const paused = await FBConversationModel.exists({ _id: conversationId, pageId, aiPausedUntil: { $gt: new Date() } });
  if (paused) throw new FacebookMessengerError("AI đang tạm dừng vì nhân viên đã tiếp quản hội thoại.", 409, "FB_AI_PAUSED");
}

type Echo = {
  sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number;
  message?: { is_echo?: boolean; mid?: string; metadata?: string; text?: string;
    attachments?: Array<{ type?: string; payload?: { url?: string } }> };
};

export async function recordFacebookHumanEcho(pageId: string, event: Echo) {
  const message = event.message;
  const recipientId = event.recipient?.id;
  if (!message?.is_echo || event.sender?.id !== pageId || !recipientId || !message.mid
    || message.metadata === FACEBOOK_AI_METADATA) return null;
  const sentAt = new Date(event.timestamp ?? Date.now());
  if (!Number.isFinite(sentAt.getTime())) return null;
  const conversation = await FBConversationModel.findOne({ pageId, recipientId });
  if (!conversation) return null;
  const existing = await FBMessageModel.findOne({ messageId: message.mid, conversationId: conversation._id });
  if (existing?.senderType) return null;
  const updated = await pauseFacebookForHuman(pageId, String(conversation._id), sentAt);
  const saved = await FBMessageModel.findOneAndUpdate({ messageId: message.mid }, {
    $set: { senderType: "human" },
    $setOnInsert: { conversationId: conversation._id, senderId: pageId, recipientId,
      direction: "outbound", text: message.text || "", messageId: message.mid,
      timestamp: sentAt, status: "sent",
      attachments: (message.attachments || []).map(item => ({ type: item.type || "attachment", url: item.payload?.url || "" })) },
  }, { upsert: true, new: true });
  await FBConversationModel.updateOne({ _id: conversation._id, pageId, lastMessageAt: { $lte: sentAt } }, {
    $set: { lastMessageText: message.text || "[Tệp đính kèm]", lastMessageAt: sentAt, unreadCount: 0 },
  });
  return { conversation: updated || conversation, message: saved, shouldCancel: Boolean(updated) };
}
