import { strict as assert } from "node:assert";
import { test } from "node:test";
import { getChatSaveModeForPage, normalizeChatSaveMode, processesChatOrder, savesChatLead } from "../chat-save-mode.service";
import { CompanyModel } from "../../model/company.model";
import { SocialIntegrationModel } from "../../model/social-integration.model";
import { UserModel } from "../../model/user.model";
import { AmbiguousAutoReplyOwnerError } from "../auto-reply-owner";

test("existing companies keep both storage flows by default", () => {
  assert.equal(normalizeChatSaveMode(undefined), "both");
  assert.equal(savesChatLead("both"), true);
  assert.equal(processesChatOrder("both"), true);
});

test("lead mode only saves customer information", () => {
  assert.equal(normalizeChatSaveMode("lead"), "lead");
  assert.equal(savesChatLead("lead"), true);
  assert.equal(processesChatOrder("lead"), false);
});

test("order mode only processes orders", () => {
  assert.equal(normalizeChatSaveMode("order"), "order");
  assert.equal(savesChatLead("order"), false);
  assert.equal(processesChatOrder("order"), true);
});

test("Facebook Page uses its linked company's save mode", async (context) => {
  context.mock.method(SocialIntegrationModel, "find", (filter) => {
    assert.deepEqual(filter, { platform: "Facebook", username: "page-1", isConnected: true });
    return { select: () => ({ lean: async () => [{ companyCode: "SHOP" }] }) };
  });
  context.mock.method(CompanyModel, "findOne", (filter) => {
    assert.deepEqual(filter, { code: "SHOP" });
    return { select: () => ({ lean: async () => ({ chatSaveMode: "lead" }) }) };
  });
  assert.equal(await getChatSaveModeForPage("page-1"), "lead");
});

test("Facebook Page linked to multiple companies cannot choose an arbitrary save mode", async (context) => {
  context.mock.method(SocialIntegrationModel, "find", () => ({ select: () => ({ lean: async () => [
    { companyCode: "SHOP" }, { companyCode: "OTHER" },
  ] }) }));
  const readCompany = context.mock.method(CompanyModel, "findOne", () => { throw new Error("Must not read a tenant"); });
  await assert.rejects(getChatSaveModeForPage("page-1"), AmbiguousAutoReplyOwnerError);
  assert.equal(readCompany.mock.callCount(), 0);
});

test("legacy Page without a company keeps the previous order and lead behavior", async (context) => {
  context.mock.method(SocialIntegrationModel, "find", () => ({ select: () => ({ lean: async () => [
    { companyCode: "" },
  ] }) }));
  const readCompany = context.mock.method(CompanyModel, "findOne", () => { throw new Error("Must not read a tenant"); });
  assert.equal(await getChatSaveModeForPage("legacy-page"), "both");
  assert.equal(readCompany.mock.callCount(), 0);
});

test("personally connected Facebook Page uses its owner's company mode", async (context) => {
  context.mock.method(SocialIntegrationModel, "find", () => ({ select: () => ({ lean: async () => [] }) }));
  context.mock.method(UserModel, "find", (filter) => {
    assert.deepEqual(filter, { "facebookIntegration.isConnected": true, "facebookIntegration.pageId": "personal-page" });
    return { select: () => ({ lean: async () => [{ companyCode: "SHOP", role: "admin" }] }) };
  });
  context.mock.method(CompanyModel, "findOne", () => ({ select: () => ({ lean: async () => ({ chatSaveMode: "lead" }) }) }));
  assert.equal(await getChatSaveModeForPage("personal-page"), "lead");
});
