import { CompanyModel } from "../model/company.model";
import { SocialIntegrationModel } from "../model/social-integration.model";
import { selectAutoReplyCompanyIntegration } from "./auto-reply-owner";

export type ChatSaveMode = "both" | "lead" | "order";

export function normalizeChatSaveMode(value: unknown): ChatSaveMode {
  return value === "lead" || value === "order" ? value : "both";
}

export function savesChatLead(mode: ChatSaveMode) {
  return mode !== "order";
}

export function processesChatOrder(mode: ChatSaveMode) {
  return mode !== "lead";
}

export async function getChatSaveMode(companyCode: string): Promise<ChatSaveMode> {
  if (!companyCode) return "both";
  const company = await CompanyModel.findOne({ code: companyCode.trim().toUpperCase() })
    .select("chatSaveMode").lean();
  return normalizeChatSaveMode(company?.chatSaveMode);
}

export async function getChatSaveModeForPage(pageId: string): Promise<ChatSaveMode> {
  const integrations = await SocialIntegrationModel.find({
    platform: "Facebook", username: pageId, isConnected: true,
  }).select("companyCode aiAutoReplyConfig.enabled").lean();
  const integration = selectAutoReplyCompanyIntegration(integrations);
  return getChatSaveMode(integration?.companyCode || "");
}
