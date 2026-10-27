import { CompanyModel } from "../model/company.model";
import { SocialIntegrationModel } from "../model/social-integration.model";
import { UserModel } from "../model/user.model";
import { AmbiguousAutoReplyOwnerError, assertPersonalAutoReplyOwnership,
  selectAutoReplyCompanyIntegration } from "./auto-reply-owner";

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

export async function getFacebookStorageIntegration(pageId: string, companyCode?: string) {
  const integrations = await SocialIntegrationModel.find({
    platform: "Facebook", username: pageId, isConnected: true,
  }).select("companyCode aiAutoReplyConfig.enabled chatSaveMode leadSheetMode leadSheetConfig").lean();
  const companies = new Set(integrations.map(item => String(item.companyCode || "").trim().toUpperCase()));
  if (companies.size > 1) throw new AmbiguousAutoReplyOwnerError();
  if (companies.has("")) {
    if (companyCode) throw new AmbiguousAutoReplyOwnerError();
    return integrations[0];
  }
  const integration = selectAutoReplyCompanyIntegration(integrations);
  if (integration && companyCode && integration.companyCode.trim().toUpperCase() !== companyCode.trim().toUpperCase()) {
    throw new AmbiguousAutoReplyOwnerError();
  }
  return integration;
}

export async function getLeadSheetConfig(companyCode: string, pageId?: string) {
  const integration = pageId ? await getFacebookStorageIntegration(pageId, companyCode) : null;
  if (integration?.leadSheetMode === "custom") return integration.leadSheetConfig;
  const company = await CompanyModel.findOne({ code: companyCode.trim().toUpperCase() }).select("leadSheetConfig").lean();
  return company?.leadSheetConfig;
}

export async function getChatSaveModeForPage(pageId: string): Promise<ChatSaveMode> {
  const integration = await getFacebookStorageIntegration(pageId);
  if (integration && !integration.companyCode) return "both";
  if (integration?.companyCode) {
    return integration.chatSaveMode && integration.chatSaveMode !== "inherit"
      ? normalizeChatSaveMode(integration.chatSaveMode) : getChatSaveMode(integration.companyCode);
  }
  const owners = await UserModel.find({ "facebookIntegration.isConnected": true,
    "facebookIntegration.pageId": pageId }).select("companyCode role").lean();
  assertPersonalAutoReplyOwnership(owners);
  const owner = owners[0];
  return getChatSaveMode(owner?.companyCode || (owner?.role === "superadmin" ? "SYSTEM" : ""));
}
