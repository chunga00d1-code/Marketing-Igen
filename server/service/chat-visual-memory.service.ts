import { ChatVisualMemoryModel, type ChatVisualMemory } from "../model/chat-visual-memory.model";

export const CHAT_VISUAL_SESSION_MS = 12 * 60 * 60 * 1000;
export type ChatVisualScope = Pick<ChatVisualMemory, "companyCode" | "channel" | "platformId" | "conversationId" | "sessionId">;
function scopeFilter(scope: ChatVisualScope) {
  if (Object.values(scope).some(value => !value.trim())) throw new Error("Incomplete visual memory scope");
  return { ...scope, companyCode: scope.companyCode.trim().toUpperCase() };
}
export const chatVisualMemory = {
  async read(scope: ChatVisualScope, at = new Date()) {
    return ChatVisualMemoryModel.findOne({ ...scopeFilter(scope), expiresAt: { $gt: at } }).lean();
  },
  async save(scope: ChatVisualScope, value: Pick<ChatVisualMemory, "images" | "visual" | "sourceMessageId" | "sourceTimestamp">) {
    if (value.sourceTimestamp.getTime() + CHAT_VISUAL_SESSION_MS <= Date.now()) return;
    try {
      await ChatVisualMemoryModel.updateOne({
        ...scopeFilter(scope),
        $or: [{ sourceTimestamp: { $lt: value.sourceTimestamp } }, { sourceMessageId: value.sourceMessageId },
          { sourceTimestamp: { $exists: false } }],
      }, { $set: { ...value, expiresAt: new Date(value.sourceTimestamp.getTime() + CHAT_VISUAL_SESSION_MS) } }, { upsert: true });
    } catch (error) {
      // A stale completion can collide with the scope's newer record; never overwrite it.
      if ((error as { code?: number })?.code !== 11000) throw error;
    }
  },
  async reset(scope: ChatVisualScope, timestamp: Date) {
    await ChatVisualMemoryModel.deleteOne({ ...scopeFilter(scope), sourceTimestamp: { $lte: timestamp } });
  },
};
