import mongoose from "mongoose";
import { UserModel } from "../model/user.model";
import { ZaloConversationModel, ZaloMessageModel } from "../model/zalo-messenger.model";
import { FBConversationModel, FBMessageModel } from "../model/fb-messenger.model";
import { TikTokConversationModel, TikTokMessageModel } from "../model/tiktok-messenger.model";
import { SocialIntegrationModel } from "../model/social-integration.model";
import { geminiService } from "./gemini.service";
import { zaloMessengerService } from "./zalo-messenger.service";
import { fbMessengerService } from "./fb-messenger.service";
import { tiktokMessengerService } from "./tiktok-messenger.service";
import { aiKnowledgeService } from "./ai-knowledge.service";

// In-memory timeouts map to manage debouncing per conversation.
// messageKey prevents polling/sync from pushing the same inbound message forever.
const pendingReplies = new Map<string, { timeout: NodeJS.Timeout; messageKey: string }>();
const generatingReplies = new Set<string>();
const HUMAN_INTERVENTION_GUARD_ENABLED = true;
const DEFAULT_MESSAGE_GROUPING_DELAY_MS = 7000;
const DEFAULT_BUBBLE_DELAY_MS = 2000;

function getBubbleDelayMs() {
  const configuredDelaySeconds = Number(process.env.AI_REPLY_BUBBLE_DELAY_SECONDS);
  if (Number.isFinite(configuredDelaySeconds) && configuredDelaySeconds >= 0) {
    return configuredDelaySeconds * 1000;
  }

  return DEFAULT_BUBBLE_DELAY_MS;
}

function getMessageGroupingDelayMs() {
  const configuredDelaySeconds = Number(process.env.AI_REPLY_GROUPING_DELAY_SECONDS);
  if (Number.isFinite(configuredDelaySeconds) && configuredDelaySeconds >= 0) {
    return configuredDelaySeconds * 1000;
  }

  return DEFAULT_MESSAGE_GROUPING_DELAY_MS;
}

function normalizeIncomingText(text: string) {
  return String(text || "").trim();
}

function splitReplyIntoMessageBubbles(text: string) {
  const normalized = String(text || "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) return [];

  const rawBlocks = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const bubbles: string[] = [];
  let currentBubble = "";

  const shouldStartNewBubble = (current: string, next: string) => {
    const currentTrimmed = current.trim();
    const nextTrimmed = next.trim();

    if (!currentTrimmed || !nextTrimmed) return false;
    if (currentTrimmed.length >= 210) return true;
    if (`${currentTrimmed} ${nextTrimmed}`.length > 260) return true;
    if (/^dạ[,.! ]/i.test(nextTrimmed)) return true;

    if (currentTrimmed.length <= 55 && nextTrimmed.length <= 170) {
      return false;
    }

    if (/^(ngoài ra|bên cạnh đó|đồng thời|tiếp theo|còn với|trường hợp|nếu|tuy nhiên)\b/i.test(nextTrimmed)) {
      return true;
    }

    if (/^(với|về|đối với)\b/i.test(nextTrimmed) && currentTrimmed.length >= 85) {
      return true;
    }

    return false;
  };

  const pushSegment = (segment: string) => {
    const cleanSegment = segment.trim();
    if (!cleanSegment) return;

    if (!currentBubble) {
      currentBubble = cleanSegment;
      return;
    }

    if (shouldStartNewBubble(currentBubble, cleanSegment)) {
      bubbles.push(currentBubble);
      currentBubble = cleanSegment;
      return;
    }

    const shouldKeepSeparated = false; /* legacy split rule disabled
      /^dạ[,.! ]/i.test(cleanSegment) ||
      /^(với|còn|ngoài ra|về|nếu|trường hợp)/i.test(cleanSegment);

    */
    if (shouldKeepSeparated || `${currentBubble} ${cleanSegment}`.length > 180) {
      bubbles.push(currentBubble);
      currentBubble = cleanSegment;
      return;
    }

    currentBubble = `${currentBubble} ${cleanSegment}`.trim();
  };

  for (const block of rawBlocks) {
    const sentences = block
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    for (const sentence of sentences) {
      pushSegment(sentence);
    }
  }

  if (currentBubble) {
    bubbles.push(currentBubble);
  }

  return bubbles.slice(0, 6);
}

function splitHistoryAndPendingInboundMessages(messages: any[]) {
  const pendingInboundMessages: any[] = [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.direction !== "inbound") {
      break;
    }

    const text = normalizeIncomingText(message.text);
    if (text) {
      pendingInboundMessages.unshift(message);
    }
  }

  const pendingIds = new Set(pendingInboundMessages.map((message) => String(message._id)));
  const historyMessages = messages.filter((message) => !pendingIds.has(String(message._id)));
  const pendingTexts = pendingInboundMessages
    .map((message) => normalizeIncomingText(message.text))
    .filter(Boolean);
  const combinedText = pendingTexts.length > 1
    ? pendingTexts.map((text, index) => `${index + 1}. ${text}`).join("\n")
    : pendingTexts[0] || "";

  return {
    historyMessages,
    combinedText,
    pendingMessageCount: pendingInboundMessages.length,
    latestPendingMessage: pendingInboundMessages[pendingInboundMessages.length - 1] || null,
  };
}

type ResolvedAutoReplyOwner = {
  companyCode: string;
  selectedUser: any | null;
  aiConfig: any | null;
  source: "personal_enabled" | "personal_fallback" | "company_enabled" | "company_fallback" | "cross_company_fallback" | "company_integration_enabled" | "none";
  userLevelOwners: any[];
  companyIntegrations: any[];
  uniqueCandidates: any[];
};

async function collectCandidateUsers(
  channel: "facebook" | "zalo" | "tiktok",
  resolvedPlatformId: string
) {
  const candidateUsers: any[] = [];

  const userLevelQuery = channel === "zalo"
    ? { "zaloIntegration.isConnected": true, "zaloIntegration.oaId": resolvedPlatformId }
    : channel === "tiktok"
      ? { "tiktokIntegration.isConnected": true, "tiktokIntegration.username": resolvedPlatformId }
      : { "facebookIntegration.isConnected": true, "facebookIntegration.pageId": resolvedPlatformId };

  console.log(`[AI AutoReply] Dang tim tich hop ca nhan cho ${channel} bang query:`, JSON.stringify(userLevelQuery));
  const userLevelOwners = await UserModel.find(userLevelQuery);
  if (userLevelOwners.length > 0) {
    console.log(`[AI AutoReply] Tim thay ${userLevelOwners.length} users lien ket ca nhan:`, userLevelOwners.map((u) => u.email));
    candidateUsers.push(...userLevelOwners);
  }

  const companyIntegrations = await SocialIntegrationModel.find({
    platform: channel === "zalo" ? "Zalo" : channel === "tiktok" ? "TikTok" : "Facebook",
    username: resolvedPlatformId,
    isConnected: true
  }).lean();

  if (companyIntegrations.length > 0) {
    console.log(`[AI AutoReply] Tim thay ${companyIntegrations.length} tich hop doanh nghiep.`);
    for (const integration of companyIntegrations) {
      if (integration.createdBy) {
        const creator = mongoose.Types.ObjectId.isValid(integration.createdBy)
          ? await UserModel.findById(integration.createdBy)
          : await UserModel.findOne({ email: integration.createdBy });
        if (creator) {
          candidateUsers.push(creator);
        }
      }

      const companyUsers = await UserModel.find({ companyCode: integration.companyCode });
      if (companyUsers.length > 0) {
        candidateUsers.push(...companyUsers);
      }
    }
  }

  const uniqueCandidatesMap = new Map<string, any>();
  for (const candidate of candidateUsers) {
    uniqueCandidatesMap.set(candidate._id.toString(), candidate);
  }

  const uniqueCandidates = Array.from(uniqueCandidatesMap.values());
  console.log(
    `[AI AutoReply] Danh sach ung vien duy nhat:`,
    uniqueCandidates.map((u) => `${u.email} (AIEnabled: ${!!u.aiAutoReplyConfig?.enabled})`)
  );

  return {
    userLevelOwners,
    companyIntegrations,
    uniqueCandidates,
  };
}

export async function resolveAutoReplyOwner(
  channel: "facebook" | "zalo" | "tiktok",
  resolvedPlatformId: string
): Promise<ResolvedAutoReplyOwner> {
  const {
    userLevelOwners,
    companyIntegrations,
    uniqueCandidates,
  } = await collectCandidateUsers(channel, resolvedPlatformId);

  const companyIntegration = companyIntegrations[0] || null;
  const companyCodeFromIntegration = companyIntegration?.companyCode || null;

  // 1. Prioritize page-specific integration custom configurations if enabled
  if (companyIntegration && companyIntegration.aiAutoReplyConfig?.enabled === true) {
    const representativeUser =
      uniqueCandidates.find((candidate: any) => candidate?.companyCode === companyCodeFromIntegration) ||
      uniqueCandidates[0] ||
      null;

    return {
      companyCode: companyCodeFromIntegration || "SYSTEM",
      selectedUser: representativeUser,
      aiConfig: companyIntegration.aiAutoReplyConfig || null,
      source: "company_integration_enabled",
      userLevelOwners,
      companyIntegrations,
      uniqueCandidates,
    };
  }

  const directEnabledUser =
    userLevelOwners.find((candidate: any) => candidate?.aiAutoReplyConfig?.enabled === true) || null;
  const directUserFallback = userLevelOwners[0] || null;

  if (directEnabledUser) {
    return {
      companyCode: directEnabledUser.companyCode || companyCodeFromIntegration || "SYSTEM",
      selectedUser: directEnabledUser,
      aiConfig: directEnabledUser.aiAutoReplyConfig || null,
      source: "personal_enabled",
      userLevelOwners,
      companyIntegrations,
      uniqueCandidates,
    };
  }

  const companyEnabledUser = companyCodeFromIntegration
    ? uniqueCandidates.find(
        (candidate: any) =>
          candidate?.companyCode === companyCodeFromIntegration &&
          candidate?.aiAutoReplyConfig?.enabled === true
      ) || null
    : null;

  if (companyEnabledUser) {
    return {
      companyCode: companyCodeFromIntegration || companyEnabledUser.companyCode || "SYSTEM",
      selectedUser: companyEnabledUser,
      aiConfig: companyEnabledUser.aiAutoReplyConfig || null,
      source: "company_enabled",
      userLevelOwners,
      companyIntegrations,
      uniqueCandidates,
    };
  }

  if (directUserFallback) {
    return {
      companyCode: directUserFallback.companyCode || companyCodeFromIntegration || "SYSTEM",
      selectedUser: directUserFallback,
      aiConfig: directUserFallback.aiAutoReplyConfig || null,
      source: "personal_fallback",
      userLevelOwners,
      companyIntegrations,
      uniqueCandidates,
    };
  }

  const companyFallbackUser = companyCodeFromIntegration
    ? uniqueCandidates.find((candidate: any) => candidate?.companyCode === companyCodeFromIntegration) || null
    : null;

  if (companyFallbackUser) {
    return {
      companyCode: companyCodeFromIntegration || companyFallbackUser.companyCode || "SYSTEM",
      selectedUser: companyFallbackUser,
      aiConfig: companyFallbackUser.aiAutoReplyConfig || null,
      source: "company_fallback",
      userLevelOwners,
      companyIntegrations,
      uniqueCandidates,
    };
  }

  const crossCompanyFallback =
    uniqueCandidates.find((candidate: any) => candidate?.aiAutoReplyConfig?.enabled === true) ||
    uniqueCandidates[0] ||
    null;

  if (crossCompanyFallback) {
    return {
      companyCode: crossCompanyFallback.companyCode || companyCodeFromIntegration || "SYSTEM",
      selectedUser: crossCompanyFallback,
      aiConfig: crossCompanyFallback.aiAutoReplyConfig || null,
      source: "cross_company_fallback",
      userLevelOwners,
      companyIntegrations,
      uniqueCandidates,
    };
  }

  return {
    companyCode: companyCodeFromIntegration || directUserFallback?.companyCode || "SYSTEM",
    selectedUser: null,
    aiConfig: null,
    source: "none",
    userLevelOwners,
    companyIntegrations,
    uniqueCandidates,
  };
}

async function logAutoReplyFailure(params: {
  companyCode?: string;
  channel: "facebook" | "zalo" | "tiktok";
  conversationId: string;
  customerMessage: string;
  reason: string;
  details?: Record<string, any>;
}) {
  const detailsText = params.details ? ` | details=${JSON.stringify(params.details)}` : "";
  console.warn(`[AI AutoReply] SKIPPED: ${params.reason}${detailsText}`);
  await aiKnowledgeService.createReplyLog({
    companyCode: params.companyCode || "SYSTEM",
    channel: params.channel,
    conversationId: params.conversationId,
    customerMessage: params.customerMessage || "[EMPTY_MESSAGE]",
    aiResponse: `[SKIPPED] ${params.reason}${detailsText}`,
    latencyMs: 0,
    status: "failed",
  }).catch((err) => {
    console.error("[AI AutoReply] Failed to persist skipped reply log:", err);
  });
}

export const aiAutoReplyService = {
  /**
   * Cancel any pending AI auto-reply for a conversation (e.g. when an agent replies manually)
   */
  cancelPendingReply(conversationId: string, reason: "debounce" | "human_reply" = "debounce") {
    if (reason === "human_reply" && !HUMAN_INTERVENTION_GUARD_ENABLED) {
      console.log(`[AI AutoReply] Human intervention guard is temporarily disabled. Keeping pending auto-reply for conversationId=${conversationId}.`);
      return;
    }

    const pending = pendingReplies.get(conversationId);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingReplies.delete(conversationId);
      console.log(`[AI AutoReply] Đã hủy phản hồi tự động đang lên lịch cho cuộc hội thoại: ${conversationId} do có sự can thiệp từ nhân viên.`);
    }
  },

  /**
   * Triggers the AI auto-reply process. Debounces incoming messages to wait for the customer to finish typing.
   */
  async triggerAutoReply(channel: "facebook" | "zalo" | "tiktok", platformId: string, conversationId: string, incomingText: string, incomingMessageId?: string) {
    try {
      const resolvedPlatformId = String(platformId).trim();
      const normalizedIncomingText = normalizeIncomingText(incomingText);
      console.log(`[AI AutoReply] Trigger start: channel=${channel}, platformId=${platformId} (resolved="${resolvedPlatformId}"), conversationId=${conversationId}, messageId=${incomingMessageId || "n/a"}, textLength=${normalizedIncomingText.length}`);

      // 1. Cancel any existing pending reply for this conversation immediately to debounce
      this.cancelPendingReply(conversationId);

      const messageKey = incomingMessageId || `${conversationId}:${normalizedIncomingText}:${Date.now()}`;
      const existingPending = pendingReplies.get(conversationId);
      if (existingPending?.messageKey === messageKey) {
        console.log(`[AI AutoReply] Đã có lịch phản hồi cho message ${messageKey}, bỏ qua trigger trùng.`);
        return;
      }

      // Find the user who owns this integration or the company-level integration
      let user = null;
      let aiConfig = null;

      const {
        companyCode: targetCompanyCode,
        selectedUser,
        aiConfig: resolvedAiConfig,
        source: ownerResolutionSource,
        userLevelOwners,
        companyIntegrations,
        uniqueCandidates,
      } = await resolveAutoReplyOwner(channel, resolvedPlatformId);

      console.log(`[AI AutoReply] Xác định targetCompanyCode cho hội thoại: ${targetCompanyCode}`);
      console.log(`[AI AutoReply] Ket qua resolve owner: source=${ownerResolutionSource}, selectedUser=${selectedUser?.email || "none"}`);

      if (selectedUser) {
        console.log(`[AI AutoReply] Owner resolve ok: ${selectedUser.email}`);
        console.log(`[AI AutoReply] Chọn được user thuộc công ty ${targetCompanyCode} đang BẬT AI: ${selectedUser.email}`);
      }

      if (!selectedUser) {
        await logAutoReplyFailure({
          channel,
          conversationId,
          customerMessage: normalizedIncomingText,
          reason: `No integration owner found for ${channel} platform ID ${resolvedPlatformId}`,
          details: {
            platformId: resolvedPlatformId,
            candidateCount: uniqueCandidates.length,
            userLevelOwnerCount: userLevelOwners.length,
            companyIntegrationCount: companyIntegrations.length,
          },
        });
        return;
      }

      user = selectedUser;
      aiConfig = resolvedAiConfig || selectedUser?.aiAutoReplyConfig;

      if (aiConfig && aiConfig.enabled === false && aiConfig.disabledAt) {
        const disabledTime = new Date(aiConfig.disabledAt).getTime();
        const AUTO_RE_ENABLE_DELAY_MS = 30 * 60 * 1000; // 30 phút
        if (Date.now() - disabledTime > AUTO_RE_ENABLE_DELAY_MS) {
          console.log(`[AI AutoReply] 🤖 TỰ ĐỘNG BẬT LẠI AI: Cấu hình AI đã bị tắt quá 30 phút (từ ${new Date(disabledTime).toISOString()}). Tiến hành tự động bật lại.`);
          
          if (resolvedAiConfig) {
            // Cập nhật cho Social Integration
            const { SocialIntegrationModel } = require("../model/social-integration.model");
            const integration = await SocialIntegrationModel.findOne({
              platform: channel === "zalo" ? "Zalo" : channel === "tiktok" ? "TikTok" : "Facebook",
              username: resolvedPlatformId,
              isConnected: true
            });
            if (integration) {
              await SocialIntegrationModel.findByIdAndUpdate(integration._id, {
                $set: {
                  "aiAutoReplyConfig.enabled": true,
                  "aiAutoReplyConfig.disabledAt": null
                }
              });
              console.log(`[AI AutoReply] Đã cập nhật database bật lại AI cho Integration: ${integration.displayName}`);
            }
          } else {
            // Cập nhật cho User
            await UserModel.findByIdAndUpdate(user._id, {
              $set: {
                "aiAutoReplyConfig.enabled": true,
                "aiAutoReplyConfig.disabledAt": null
              }
            });
            console.log(`[AI AutoReply] Đã cập nhật database bật lại AI cho User: ${user.email}`);
          }

          // Kích hoạt lại trong bộ nhớ để tin nhắn này được trả lời ngay lập tức
          aiConfig.enabled = true;
          aiConfig.disabledAt = null;
        }
      }

      if (aiConfig) {
        aiConfig = {
          ...aiConfig,
          autoClassify: true,
          autoCloseDeal: true,
          autoFeedback: true
        };
      }

      console.log(
        `[AI AutoReply] Owner selected: channel=${channel}, platformId=${resolvedPlatformId}, ` +
        `conversationId=${conversationId}, user=${user.email}, company=${targetCompanyCode} (userCompany=${user.companyCode || "SYSTEM"}), enabled=${!!aiConfig?.enabled}, source=${ownerResolutionSource}`
      );

      if (!aiConfig || !aiConfig.enabled) {
        await logAutoReplyFailure({
          companyCode: targetCompanyCode,
          channel,
          conversationId,
          customerMessage: normalizedIncomingText,
          reason: `AI auto-reply is disabled for selected user ${user.email}`,
          details: {
            selectedUserEmail: user.email,
            companyCode: targetCompanyCode,
            enabled: !!aiConfig?.enabled,
          },
        });
        return;
      }

      if (!normalizedIncomingText) {
        await logAutoReplyFailure({
          companyCode: targetCompanyCode,
          channel,
          conversationId,
          customerMessage: "[EMPTY_MESSAGE]",
          reason: "Inbound message has no text content",
          details: {
            selectedUserEmail: user.email,
            platformId: resolvedPlatformId,
            messageId: incomingMessageId || null,
          },
        });
        return;
      }

      const userDelayMs = (aiConfig.replyDelay || 15) * 1000;
      const groupingDelayMs = getMessageGroupingDelayMs();
      const delayMs = groupingDelayMs + userDelayMs;
      console.log(
        `[AI AutoReply] Schedule reply: channel=${channel}, conversationId=${conversationId}, ` +
        `groupingDelayMs=${groupingDelayMs}, userDelayMs=${userDelayMs}, totalDelayMs=${delayMs}, ` +
        `model=${aiConfig.model || "n/a"}, user=${user.email}`
      );
      console.log(`[AI AutoReply] 🕒 LÊN LỊCH: Đang gom tin ${groupingDelayMs / 1000}s rồi chờ thêm ${aiConfig.replyDelay}s cấu hình trước khi phản hồi hội thoại: ${conversationId} (User: ${user.email})`);

      const timeoutId = setTimeout(async () => {
        try {
          pendingReplies.delete(conversationId); // Remove from pending list since we are processing it now

          if (generatingReplies.has(conversationId)) {
            console.log(`[AI AutoReply] ⚠️ BỎ QUA: Bỏ qua tự động phản hồi hội thoại ${conversationId} vì đang có tiến trình sinh câu trả lời đang chạy.`);
            await aiKnowledgeService.createReplyLog({
              companyCode: targetCompanyCode,
              channel,
              conversationId,
              customerMessage: normalizedIncomingText,
              aiResponse: `[SKIPPED] Đang có tiến trình sinh câu trả lời cho cuộc hội thoại này`,
              latencyMs: 0,
              status: "failed",
            }).catch(() => {});
            return;
          }

          // Fetch the conversation to ensure it still exists and check if the last message is still inbound
          let lastMessageDirection = "inbound";
          let history: any[] = [];
          let latestDbMessage: any = null;
          let groupedCustomerMessage = normalizedIncomingText;
          let groupedMessageCount = 1;

          if (channel === "zalo") {
            const conv = await ZaloConversationModel.findById(conversationId);
            if (!conv) {
              console.error(`[AI AutoReply] ❌ LỖI: Không tìm thấy cuộc hội thoại Zalo ${conversationId} trong DB.`);
              await aiKnowledgeService.createReplyLog({
                companyCode: targetCompanyCode,
                channel,
                conversationId,
                customerMessage: normalizedIncomingText,
                aiResponse: `[FAILED] Không tìm thấy cuộc hội thoại Zalo trong DB`,
                latencyMs: 0,
                status: "failed",
              }).catch(() => {});
              return;
            }

            if (conv.aiPausedUntil && conv.aiPausedUntil > new Date()) {
              console.log(`[AI AutoReply] ⚠️ BỎ QUA: Cuộc hội thoại Zalo ${conversationId} đang tạm dừng AI đến ${conv.aiPausedUntil.toISOString()} do nhân viên can thiệp.`);
              await logAutoReplyFailure({
                companyCode: targetCompanyCode,
                channel,
                conversationId,
                customerMessage: normalizedIncomingText,
                reason: "AI is paused for this specific conversation due to human intervention",
                details: { aiPausedUntil: conv.aiPausedUntil },
              });
              return;
            }

            // Fetch last 15 messages for history context
            const dbMsgs = await ZaloMessageModel.find({ conversationId })
              .sort({ timestamp: -1 })
              .limit(15);
            
            dbMsgs.reverse();
            
            if (dbMsgs.length > 0) {
              latestDbMessage = dbMsgs[dbMsgs.length - 1];
              lastMessageDirection = latestDbMessage.direction;
            }

            const grouped = splitHistoryAndPendingInboundMessages(dbMsgs);
            groupedCustomerMessage = grouped.combinedText || normalizedIncomingText;
            groupedMessageCount = grouped.pendingMessageCount || 1;

            history = grouped.historyMessages.map(m => ({
              sender: m.direction === "inbound" ? "user" : "model",
              text: m.text || ""
            }));
          } else if (channel === "facebook") {
            const conv = await FBConversationModel.findById(conversationId);
            if (!conv) {
              console.error(`[AI AutoReply] ❌ LỖI: Không tìm thấy cuộc hội thoại FB ${conversationId} trong DB.`);
              await aiKnowledgeService.createReplyLog({
                companyCode: targetCompanyCode,
                channel,
                conversationId,
                customerMessage: normalizedIncomingText,
                aiResponse: `[FAILED] Không tìm thấy cuộc hội thoại FB trong DB`,
                latencyMs: 0,
                status: "failed",
              }).catch(() => {});
              return;
            }

            if (conv.aiPausedUntil && conv.aiPausedUntil > new Date()) {
              console.log(`[AI AutoReply] ⚠️ BỎ QUA: Cuộc hội thoại FB ${conversationId} đang tạm dừng AI đến ${conv.aiPausedUntil.toISOString()} do nhân viên can thiệp.`);
              await logAutoReplyFailure({
                companyCode: targetCompanyCode,
                channel,
                conversationId,
                customerMessage: normalizedIncomingText,
                reason: "AI is paused for this specific conversation due to human intervention",
                details: { aiPausedUntil: conv.aiPausedUntil },
              });
              return;
            }

            // Fetch last 15 messages for history context
            const dbMsgs = await FBMessageModel.find({ conversationId })
              .sort({ timestamp: -1 })
              .limit(15);
            
            dbMsgs.reverse();

            if (dbMsgs.length > 0) {
              latestDbMessage = dbMsgs[dbMsgs.length - 1];
              lastMessageDirection = latestDbMessage.direction;
            }

            const grouped = splitHistoryAndPendingInboundMessages(dbMsgs);
            groupedCustomerMessage = grouped.combinedText || normalizedIncomingText;
            groupedMessageCount = grouped.pendingMessageCount || 1;

            history = grouped.historyMessages.map(m => ({
              sender: m.direction === "inbound" ? "user" : "model",
              text: m.text || ""
            }));
          } else if (channel === "tiktok") {
            const conv = await TikTokConversationModel.findById(conversationId);
            if (!conv) {
              console.error(`[AI AutoReply] ❌ LỖI: Không tìm thấy cuộc hội thoại TikTok ${conversationId} trong DB.`);
              await aiKnowledgeService.createReplyLog({
                companyCode: targetCompanyCode,
                channel,
                conversationId,
                customerMessage: normalizedIncomingText,
                aiResponse: `[FAILED] Không tìm thấy cuộc hội thoại TikTok trong DB`,
                latencyMs: 0,
                status: "failed",
              }).catch(() => {});
              return;
            }

            if (conv.aiPausedUntil && conv.aiPausedUntil > new Date()) {
              console.log(`[AI AutoReply] ⚠️ BỎ QUA: Cuộc hội thoại TikTok ${conversationId} đang tạm dừng AI đến ${conv.aiPausedUntil.toISOString()} do nhân viên can thiệp.`);
              await logAutoReplyFailure({
                companyCode: targetCompanyCode,
                channel,
                conversationId,
                customerMessage: normalizedIncomingText,
                reason: "AI is paused for this specific conversation due to human intervention",
                details: { aiPausedUntil: conv.aiPausedUntil },
              });
              return;
            }

            const dbMsgs = await TikTokMessageModel.find({ conversationId })
              .sort({ timestamp: -1 })
              .limit(15);

            dbMsgs.reverse();

            if (dbMsgs.length > 0) {
              latestDbMessage = dbMsgs[dbMsgs.length - 1];
              lastMessageDirection = latestDbMessage.direction;
            }

            const grouped = splitHistoryAndPendingInboundMessages(dbMsgs);
            groupedCustomerMessage = grouped.combinedText || normalizedIncomingText;
            groupedMessageCount = grouped.pendingMessageCount || 1;

            history = grouped.historyMessages.map(m => ({
              sender: m.direction === "inbound" ? "user" : "model",
              text: m.text || ""
            }));
          }

          // Security check 1: if the last message in DB is outbound (meaning human agent replied in the meantime),
          // we do not auto-reply anymore.
          if (HUMAN_INTERVENTION_GUARD_ENABLED && lastMessageDirection === "outbound") {
            await logAutoReplyFailure({
              companyCode: targetCompanyCode,
              channel,
              conversationId,
              customerMessage: normalizedIncomingText,
              reason: "Latest message is outbound, likely handled by a human agent",
              details: {
                latestMessageId: latestDbMessage?.messageId || null,
                latestMessageAt: latestDbMessage?.timestamp || null,
              },
            });
            return;
          }

          // Security check 2: if a newer message has arrived from the customer, abort this task (since it was debounced and a newer task will execute instead)
          const isLatest = latestDbMessage && (
            (incomingMessageId && latestDbMessage.messageId === incomingMessageId) ||
            (!incomingMessageId && latestDbMessage.direction === "inbound" && normalizeIncomingText(latestDbMessage.text) === normalizedIncomingText)
          );
          if (!isLatest) {
            await logAutoReplyFailure({
              companyCode: targetCompanyCode,
              channel,
              conversationId,
              customerMessage: normalizedIncomingText,
              reason: "A newer message exists in the conversation",
              details: {
                incomingMessageId: incomingMessageId || null,
                latestMessageId: latestDbMessage?.messageId || null,
                latestDirection: latestDbMessage?.direction || null,
              },
            });
            return;
          }

          console.log(`[AI AutoReply] 🤖 KHỞI CHẠY: Bắt đầu gọi Gemini sinh câu trả lời cho hội thoại: ${conversationId} (${channel.toUpperCase()})`);
          console.log(`[AI AutoReply] Gemini start: conversationId=${conversationId}, channel=${channel}, historyCount=${history.length}, groupedMessageCount=${groupedMessageCount}, groupedTextLength=${groupedCustomerMessage.length}`);
          generatingReplies.add(conversationId);

          if (channel === "facebook") {
            await fbMessengerService.sendSenderAction(resolvedPlatformId, conversationId, "typing_on").catch(() => {});
          }

          try {
            const startedAt = Date.now();
            const companyCode = targetCompanyCode;
            const queryText = `${history.map((h) => h.text).join("\n")}\n${groupedCustomerMessage}`.trim();
            const ragContext = await aiKnowledgeService.searchRelevantContext({
              companyCode,
              query: queryText,
              channel,
              topK: 5,
            });

            const effectiveRagContext = aiKnowledgeService.buildEffectiveRagContext({
              companyCode,
              ragContext,
              trainingKnowledge: aiConfig.trainingKnowledge,
            });
            const effectiveRagContextDebug = aiKnowledgeService.describeEffectiveRagContext(effectiveRagContext as any);

            console.log(
              `[AI AutoReply] Context ready: conversationId=${conversationId}, channel=${channel}, ` +
              `matches=${effectiveRagContext.matches}, contextLength=${effectiveRagContext.contextText?.length || 0}, ` +
              `source=${(effectiveRagContext as any).source || "unknown"}`
            );

            console.log(
              `[AI AutoReply] 📚 TRUY XUẤT RAG: Context ready cho conversation=${conversationId}, matches=${effectiveRagContext.matches}, ` +
              `contextLength=${effectiveRagContext.contextText?.length || 0}`
            );

            console.log("[AI AutoReply] Context diagnostics:", JSON.stringify({
              conversationId,
              channel,
              ownerEmail: user?.email || null,
              ownerCompanyCode: companyCode,
              ...effectiveRagContextDebug,
            }));

            // Call Gemini Service
            console.log(`[AI AutoReply] 🧠 GEMINI CALL: Đang gửi request tới Gemini cho conversation=${conversationId}...`);
            console.log(`[AI AutoReply] Gemini call: conversationId=${conversationId}, channel=${channel}`);
            const aiResponse = await geminiService.chat(groupedCustomerMessage, history, aiConfig, effectiveRagContext);

            if (!aiResponse || !aiResponse.text) {
              console.error(`[AI AutoReply] ❌ LỖI API: Không nhận được câu trả lời từ Gemini cho hội thoại: ${conversationId}`);
              await aiKnowledgeService.createReplyLog({
                companyCode: targetCompanyCode,
                channel,
                conversationId,
                customerMessage: normalizedIncomingText,
                aiResponse: `[FAILED] Không nhận được câu trả lời từ Gemini (aiResponse trống)`,
                latencyMs: 0,
                status: "failed",
              }).catch(() => {});
              return;
            }

            // Pre-send check: verify if a human agent has replied during the Gemini inference
            let preSendDirection = "inbound";
            if (channel === "zalo") {
              const latestMsg = await ZaloMessageModel.findOne({ conversationId }).sort({ timestamp: -1 });
              if (latestMsg) preSendDirection = latestMsg.direction;
            } else if (channel === "tiktok") {
              const latestMsg = await TikTokMessageModel.findOne({ conversationId }).sort({ timestamp: -1 });
              if (latestMsg) preSendDirection = latestMsg.direction;
            } else {
              const latestMsg = await FBMessageModel.findOne({ conversationId }).sort({ timestamp: -1 });
              if (latestMsg) preSendDirection = latestMsg.direction;
            }

            if (HUMAN_INTERVENTION_GUARD_ENABLED && preSendDirection === "outbound") {
              console.log(`[AI AutoReply] ⚠️ CAN THIỆP PHÚT CUỐI: Nhân viên đã gửi tin nhắn thủ công trong thời gian Gemini sinh câu trả lời cho conversationId=${conversationId}. Huỷ bỏ việc gửi câu trả lời AI.`);
              await aiKnowledgeService.createReplyLog({
                companyCode: targetCompanyCode,
                channel,
                conversationId,
                customerMessage: normalizedIncomingText,
                aiResponse: `[SKIPPED] Nhân viên đã gửi tin nhắn thủ công trước khi AI gửi đi`,
                latencyMs: 0,
                status: "failed",
              }).catch(() => {});
              return;
            }

            console.log(`[AI AutoReply] 💬 GEMINI OK: Đã sinh xong câu trả lời (độ dài: ${aiResponse.text.length} ký tự). Tiến hành gửi qua ${channel}...`);

            console.log(`[AI AutoReply] Gemini ok: conversationId=${conversationId}, channel=${channel}, replyLength=${aiResponse.text.length}`);
            try {
              const replyBubbles = splitReplyIntoMessageBubbles(aiResponse.text);
              const fallbackReply = aiResponse.text.trim();
              const messagesToSend = replyBubbles.length > 0 ? replyBubbles : [fallbackReply];

              console.log(
                `[AI AutoReply] Reply bubbles prepared: conversationId=${conversationId}, channel=${channel}, bubbleCount=${messagesToSend.length}`
              );

              for (let index = 0; index < messagesToSend.length; index += 1) {
                const bubbleText = messagesToSend[index];
                if (!bubbleText) continue;

                if (channel === "zalo") {
                  await zaloMessengerService.sendReply(resolvedPlatformId, conversationId, bubbleText, "ai");
                } else if (channel === "tiktok") {
                  await tiktokMessengerService.sendReply(resolvedPlatformId, conversationId, bubbleText, "ai");
                } else {
                  await fbMessengerService.sendReply(resolvedPlatformId, conversationId, bubbleText, "ai");
                }

                if (index < messagesToSend.length - 1) {
                  if (channel === "facebook") {
                    await fbMessengerService.sendSenderAction(resolvedPlatformId, conversationId, "typing_on").catch(() => {});
                  }
                  await new Promise((resolve) => setTimeout(resolve, getBubbleDelayMs()));
                }
              }

              await aiKnowledgeService.createReplyLog({
                companyCode,
                channel,
                conversationId,
                customerMessage: groupedCustomerMessage,
                aiResponse: aiResponse.text,
                contextText: effectiveRagContext.contextText,
                contextMatches: effectiveRagContext.matches,
                latencyMs: Date.now() - startedAt,
                status: "sent",
              });
              console.log(`[AI AutoReply] Reply sent: conversationId=${conversationId}, channel=${channel}, latencyMs=${Date.now() - startedAt}`);
              console.log(`[AI AutoReply] ✅ THÀNH CÔNG: Đã gửi phản hồi tự động thành công cho hội thoại: ${conversationId} trong ${Date.now() - startedAt}ms`);
            } catch (sendErr: any) {
              console.error(`[AI AutoReply] ❌ LỖI GỬI TIN: Thất bại khi gửi tin nhắn qua API ${channel.toUpperCase()}:`, sendErr.message || sendErr);
              await aiKnowledgeService.createReplyLog({
                companyCode,
                channel,
                conversationId,
                customerMessage: normalizedIncomingText,
                aiResponse: `[SEND_FAILED] ${aiResponse.text}\n\nError: ${sendErr?.message || sendErr}`,
                contextText: effectiveRagContext.contextText,
                contextMatches: effectiveRagContext.matches,
                latencyMs: Date.now() - startedAt,
                status: "failed",
              });
              throw sendErr;
            }

          } finally {
            generatingReplies.delete(conversationId);
          }
        } catch (err: any) {
          console.error(`[AI AutoReply Timeout Execution] ❌ LỖI NGHIÊM TRỌNG khi thực hiện gửi phản hồi tự động:`, err.message || err);
          try {
            await aiKnowledgeService.createReplyLog({
              companyCode: user?.companyCode || "SYSTEM",
              channel,
              conversationId,
              customerMessage: normalizedIncomingText,
              aiResponse: `[ERROR] ${err.message || String(err)}`,
              latencyMs: 0,
              status: "failed",
            });
          } catch (logErr) {
            console.error(`[AI AutoReply] Không thể lưu log lỗi:`, logErr);
          }
        }
      }, delayMs);

      pendingReplies.set(conversationId, { timeout: timeoutId, messageKey });
    } catch (error: any) {
      console.error("[AI AutoReply triggerAutoReply] ❌ LỖI HỆ THỐNG khi xử lý trigger:", error.message || error);
    }
  }
};
