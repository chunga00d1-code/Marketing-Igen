import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { AIReplyLogModel } from "../model/ai-reply-log.model";
import { FBConversationModel } from "../model/fb-messenger.model";
import { FacebookAutoReplyJobModel } from "../model/facebook-auto-reply-job.model";
import { emitToMessengerAccount } from "../socket";

export async function reportFacebookReplyFailure(job: {
  conversationId: Types.ObjectId; pageId: string; messageId: string;
  text: string; lastError?: string; deliveryStartedAt?: Date;
}, companyCode: string) {
  if (!companyCode) throw new Error("Cannot route Facebook failure without a company owner.");
  const key = { channel: "facebook" as const, conversationId: job.conversationId, messageId: job.messageId, status: "failed" as const };
  if (!await FacebookAutoReplyJobModel.exists(key)) return;
  const logId = new Types.ObjectId(createHash("sha256")
    .update(JSON.stringify([companyCode, job.pageId, String(job.conversationId), job.messageId, "reply-failure"]))
    .digest("hex").slice(0, 24));
  // Stable log ID and set membership make a retry after restart idempotent.
  await AIReplyLogModel.updateOne({ _id: logId }, { $setOnInsert: {
    companyCode, channel: "facebook", conversationId: String(job.conversationId),
    customerMessage: job.text || "[Tin nhắn có tệp đính kèm]",
    aiResponse: `[CẦN NHÂN VIÊN KIỂM TRA] ${job.deliveryStartedAt
      ? "Phản hồi có thể đã gửi một phần. Kiểm tra hội thoại trước khi trả lời tiếp để tránh gửi trùng."
      : "AI chưa trả lời được sau các lần thử lại. Nhân viên cần tiếp nhận hội thoại."}\n${job.lastError || ""}`,
    mode: "default", status: "failed", latencyMs: 0,
  } }, { upsert: true });
  const conversation = await FBConversationModel.findOneAndUpdate({ _id: job.conversationId, pageId: job.pageId }, {
    $addToSet: { tags: "AI cần kiểm tra" }, $set: { status: "open" }, $max: { unreadCount: 1 },
  }, { new: true });
  if (conversation) emitToMessengerAccount("facebook", job.pageId, "conversation_updated", conversation);
  await FacebookAutoReplyJobModel.updateOne(key, { $set: { failureNotifiedAt: new Date() } });
}
