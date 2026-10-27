import { strict as assert } from "node:assert";
import { test } from "node:test";
import { pageLeadSheetService } from "../page-lead-sheet.service";
import { SocialIntegrationModel } from "../../model/social-integration.model";
import { companyLeadSheetService } from "../company-lead-sheet.service";
import { googleLeadSheetService } from "../google-lead-sheet.service";

test("Page configuration is tenant-scoped and rejects missing or foreign Pages", async t => {
  t.mock.method(SocialIntegrationModel, "findOne", filter => {
    assert.deepEqual(filter, { _id: "page-id", companyCode: "SHOP", platform: "Facebook" });
    return null;
  });
  await assert.rejects(pageLeadSheetService.getConfig("SHOP", "page-id"), /Không tìm thấy Page/);
  await assert.rejects(pageLeadSheetService.updateConfig("SHOP", "page-id", { chatSaveMode: "lead" }), /Không tìm thấy Page/);
  await assert.rejects(pageLeadSheetService.testConfig("SHOP", "page-id", {}), /Không tìm thấy Page/);
});

test("custom lead Sheet can be saved, disabled, and restored to inheritance without modifying orders", async t => {
  const page = new SocialIntegrationModel({ companyCode: "SHOP", platform: "Facebook", displayName: "Page",
    createdBy: "admin", orderSheetConfig: { enabled: true, spreadsheetId: "existing-orders" } });
  const orderBefore = JSON.stringify(page.orderSheetConfig);
  t.mock.method(page, "save", async () => page);
  t.mock.method(SocialIntegrationModel, "findOne", async () => page);
  t.mock.method(companyLeadSheetService, "getConfig", async () => ({ enabled: true, spreadsheetUrl: "shared",
    sheetName: "Leads", chatSaveMode: "order", serviceAccountEmail: "test@example.com" }));
  const prepare = t.mock.method(googleLeadSheetService, "prepare", async () => undefined);
  const inherited = await pageLeadSheetService.getConfig("SHOP", "page-id");
  assert.equal(inherited.chatSaveMode, "inherit");
  assert.equal(inherited.effectiveChatSaveMode, "order");
  await assert.rejects(pageLeadSheetService.updateConfig("SHOP", "page-id", {
    leadSheetMode: "custom", enabled: true,
  }), /Cần nhập link/);
  const custom = await pageLeadSheetService.updateConfig("SHOP", "page-id", {
    chatSaveMode: "lead", leadSheetMode: "custom", enabled: true,
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/12345678901234567890/edit", sheetName: "Page Leads",
  });
  assert.equal(custom.effectiveChatSaveMode, "lead");
  assert.equal(prepare.mock.callCount(), 1);
  await pageLeadSheetService.updateConfig("SHOP", "page-id", { enabled: false });
  assert.equal(page.leadSheetConfig?.enabled, false);
  assert.equal(page.leadSheetMode, "custom");
  const restored = await pageLeadSheetService.updateConfig("SHOP", "page-id", { chatSaveMode: "inherit", leadSheetMode: "inherit" });
  assert.equal(restored.effectiveChatSaveMode, "order");
  assert.equal(restored.leadSheetMode, "inherit");
  assert.equal(page.leadSheetConfig?.spreadsheetId, "12345678901234567890");
  assert.equal(JSON.stringify(page.orderSheetConfig), orderBefore);
});
