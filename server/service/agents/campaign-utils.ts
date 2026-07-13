import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { MarketingCampaignModel } from "../../model/marketing-campaign.model";
import { MarketingCampaignSlotModel } from "../../model/marketing-campaign-slot.model";
import { SocialIntegrationModel } from "../../model/social-integration.model";
import { UserModel } from "../../model/user.model";

export function loadAgentSkill(name: string): string {
  try {
    const filePath = path.join(process.cwd(), "server", "service", "agents", "skills", `${name}.md`);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
    // Fallback search
    const fallbackPath = path.join(__dirname, "skills", `${name}.md`);
    if (fs.existsSync(fallbackPath)) {
      return fs.readFileSync(fallbackPath, "utf-8");
    }
    return "";
  } catch (error) {
    console.error(`[loadAgentSkill] Error loading skill ${name}:`, error);
    return "";
  }
}

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function contentHash(value: string): string {
  return createHash("sha256").update(normalizeText(value)).digest("hex");
}

export function similarity(left: string, right: string): number {
  const a = new Set(normalizeText(left).split(" ").filter((word) => word.length > 2));
  const b = new Set(normalizeText(right).split(" ").filter((word) => word.length > 2));
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((word) => b.has(word)).length;
  return intersection / (a.size + b.size - intersection);
}

export async function assertReachableMedia(url: string): Promise<void> {
  if (!/^https:\/\//i.test(url)) {
    throw new Error("Media URL không dùng HTTPS.");
  }
  const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    throw new Error(`Media URL không truy cập được (${response.status}).`);
  }
}

export async function resolveFacebookCredentials(input: {
  companyCode: string;
  createdBy: string;
  integrationId?: unknown;
}) {
  if (input.integrationId) {
    const integration = await SocialIntegrationModel.findOne({
      _id: input.integrationId,
      companyCode: input.companyCode,
      platform: "Facebook",
      isConnected: true,
    }).lean();
    if (!integration?.username || !integration.accessToken) {
      throw new Error("Liên kết Facebook doanh nghiệp thiếu Page ID hoặc access token.");
    }
    return { pageId: integration.username, accessToken: integration.accessToken };
  }
  const user = await UserModel.findById(input.createdBy).select("companyCode facebookIntegration").lean();
  if (!user || user.companyCode !== input.companyCode || !user.facebookIntegration?.isConnected) {
    throw new Error("Không tìm thấy Facebook Page cá nhân đang kết nối.");
  }
  if (!user.facebookIntegration.pageId || !user.facebookIntegration.pageAccessToken) {
    throw new Error("Facebook Page cá nhân thiếu Page ID hoặc access token.");
  }
  return { pageId: user.facebookIntegration.pageId, accessToken: user.facebookIntegration.pageAccessToken };
}

export async function releaseWithFailure(
  slotId: unknown,
  lockId: string,
  stage: string,
  error: unknown
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const slot = await MarketingCampaignSlotModel.findOne({ _id: slotId, lockId })
    .select("attemptCount status campaignId")
    .lean();
  if (!slot) return;

  const terminal = slot.attemptCount >= 2;
  const targetStatus = terminal ? "needs_attention" : slot.status;

  const result = await MarketingCampaignSlotModel.updateOne(
    { _id: slotId, lockId },
    {
      $set: {
        status: targetStatus,
        lockId: null,
        lockedAt: null,
        lockExpiresAt: null,
        lastError: { type: terminal ? "terminal" : "provider", message, occurredAt: new Date() },
      },
      $inc: { attemptCount: 1 },
      $push: {
        transitions: {
          from: slot.status,
          to: targetStatus,
          reason: `${stage}: ${message}`,
          at: new Date(),
        },
      },
    }
  );

  if (terminal && result.modifiedCount > 0) {
    await MarketingCampaignModel.updateOne({ _id: slot.campaignId }, { $inc: { "statistics.failedSlots": 1 } });
  }
}
