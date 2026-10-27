import { SocialIntegrationModel } from "../model/social-integration.model";
import { companyLeadSheetService, type LeadSheetInput } from "./company-lead-sheet.service";
import { googleLeadSheetService, parseLeadSpreadsheetId, validateLeadSheetName } from "./google-lead-sheet.service";

export type PageLeadSheetInput = Omit<LeadSheetInput, "chatSaveMode"> & {
  chatSaveMode?: "inherit" | "both" | "lead" | "order";
  leadSheetMode?: "inherit" | "custom";
};

async function pageRecord(companyCode: string, id: string) {
  const page = await SocialIntegrationModel.findOne({ _id: id,
    companyCode: companyCode.trim().toUpperCase(), platform: "Facebook" });
  if (!page) throw new Error("Không tìm thấy Page thuộc doanh nghiệp của bạn.");
  return page;
}

export const pageLeadSheetService = {
  async getConfig(companyCode: string, id: string) {
    const page = await pageRecord(companyCode, id);
    const company = await companyLeadSheetService.getConfig(companyCode);
    const custom = page.leadSheetConfig;
    return {
      chatSaveMode: page.chatSaveMode || "inherit",
      effectiveChatSaveMode: page.chatSaveMode && page.chatSaveMode !== "inherit" ? page.chatSaveMode : company.chatSaveMode,
      leadSheetMode: page.leadSheetMode || "inherit",
      enabled: Boolean(custom?.enabled), spreadsheetUrl: custom?.spreadsheetUrl || "",
      sheetName: custom?.sheetName || "Leads", serviceAccountEmail: company.serviceAccountEmail,
      inheritedSheet: { enabled: company.enabled, spreadsheetUrl: company.spreadsheetUrl, sheetName: company.sheetName },
    };
  },
  async testConfig(companyCode: string, id: string, input: PageLeadSheetInput) {
    const page = await pageRecord(companyCode, id);
    if ((input.leadSheetMode ?? page.leadSheetMode ?? "inherit") === "inherit") {
      return companyLeadSheetService.testConfig(companyCode, {});
    }
    return googleLeadSheetService.test(
      parseLeadSpreadsheetId(input.spreadsheetUrl ?? page.leadSheetConfig?.spreadsheetUrl ?? ""),
      validateLeadSheetName(input.sheetName ?? page.leadSheetConfig?.sheetName ?? "Leads"));
  },
  async updateConfig(companyCode: string, id: string, input: PageLeadSheetInput) {
    const page = await pageRecord(companyCode, id);
    const current = page.leadSheetConfig;
    const mode = input.leadSheetMode ?? page.leadSheetMode ?? "inherit";
    const enabled = input.enabled ?? current?.enabled ?? false;
    const spreadsheetUrl = String(input.spreadsheetUrl ?? current?.spreadsheetUrl ?? "").trim();
    const sheetName = validateLeadSheetName(input.sheetName ?? current?.sheetName ?? "Leads");
    const spreadsheetId = spreadsheetUrl ? parseLeadSpreadsheetId(spreadsheetUrl) : "";
    if (mode === "custom" && enabled && !spreadsheetId) throw new Error("Cần nhập link Google Sheet trước khi bật lưu lead.");
    const changed = mode !== (page.leadSheetMode || "inherit") || enabled !== Boolean(current?.enabled)
      || spreadsheetId !== current?.spreadsheetId || sheetName !== current?.sheetName;
    if (mode === "custom" && enabled && changed) await googleLeadSheetService.prepare(spreadsheetId, sheetName);
    page.chatSaveMode = input.chatSaveMode ?? page.chatSaveMode ?? "inherit";
    page.leadSheetMode = mode;
    page.leadSheetConfig = { enabled, spreadsheetUrl, spreadsheetId, sheetName,
      updatedAt: changed ? new Date() : current?.updatedAt };
    await page.save();
    return this.getConfig(companyCode, id);
  },
};
