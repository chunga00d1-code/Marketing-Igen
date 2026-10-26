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

export async function getChatSaveModeForPage(pageId: string): Promise<ChatSaveMode> {
  const integrations = await SocialIntegrationModel.find({
    platform: "Facebook", username: pageId, isConnected: true,
  }).select("companyCode aiAutoReplyConfig.enabled").lean();
  const companies = new Set(integrations.map(item => String(item.companyCode || "").trim().toUpperCase()));
  if (companies.size > 1) throw new AmbiguousAutoReplyOwnerError();
  if (companies.has("")) return "both";
  const integration = selectAutoReplyCompanyIntegration(integrations);
  if (integration?.companyCode) return getChatSaveMode(integration.companyCode);
  const owners = await UserModel.find({ "facebookIntegration.isConnected": true,
    "facebookIntegration.pageId": pageId }).select("companyCode role").lean();
  assertPersonalAutoReplyOwnership(owners);
  const owner = owners[0];
  return getChatSaveMode(owner?.companyCode || (owner?.role === "superadmin" ? "SYSTEM" : ""));
}
