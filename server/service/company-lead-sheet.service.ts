import { CompanyModel } from "../model/company.model";
import { googleLeadSheetService, parseLeadSpreadsheetId, validateLeadSheetName } from "./google-lead-sheet.service";

export interface LeadSheetInput {
  enabled?: boolean;
  spreadsheetUrl?: string;
  sheetName?: string;
}

async function companyRecord(companyCode: string) {
  const company = await CompanyModel.findOne({ code: companyCode.trim().toUpperCase() });
  if (!company) throw new Error("Không tìm thấy doanh nghiệp của tài khoản.");
  return company;
}

export const companyLeadSheetService = {
  async getConfig(companyCode: string) {
    const company = await companyRecord(companyCode);
    const config = company.leadSheetConfig;
    return {
      enabled: Boolean(config?.enabled),
      spreadsheetUrl: String(config?.spreadsheetUrl || ""),
      sheetName: String(config?.sheetName || "Leads"),
      serviceAccountEmail: googleLeadSheetService.serviceAccountEmail(),
    };
  },

  async testConfig(companyCode: string, input: LeadSheetInput) {
    const company = await companyRecord(companyCode);
    const spreadsheetUrl = String(input.spreadsheetUrl ?? company.leadSheetConfig?.spreadsheetUrl ?? "").trim();
    const sheetName = validateLeadSheetName(String(input.sheetName ?? company.leadSheetConfig?.sheetName ?? "Leads"));
    const spreadsheetId = parseLeadSpreadsheetId(spreadsheetUrl);
    return googleLeadSheetService.test(spreadsheetId, sheetName);
  },

  async updateConfig(companyCode: string, input: LeadSheetInput) {
    const company = await companyRecord(companyCode);
    const current = company.leadSheetConfig;
    const enabled = input.enabled ?? current?.enabled ?? false;
    const spreadsheetUrl = String(input.spreadsheetUrl ?? current?.spreadsheetUrl ?? "").trim();
    const sheetName = validateLeadSheetName(String(input.sheetName ?? current?.sheetName ?? "Leads"));
    const spreadsheetId = spreadsheetUrl ? parseLeadSpreadsheetId(spreadsheetUrl) : "";
    if (enabled && !spreadsheetId) throw new Error("Cần nhập link Google Sheet trước khi bật lưu lead.");
    if (enabled) await googleLeadSheetService.prepare(spreadsheetId, sheetName);
    company.leadSheetConfig = { enabled, spreadsheetUrl, spreadsheetId, sheetName, updatedAt: new Date() };
    await company.save();
    return this.getConfig(company.code);
  },
};
