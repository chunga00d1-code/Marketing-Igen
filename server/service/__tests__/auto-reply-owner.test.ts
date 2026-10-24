import assert from "node:assert/strict";
import test from "node:test";
import { AmbiguousAutoReplyOwnerError, assertPersonalAutoReplyOwnership, selectAutoReplyCompanyIntegration } from "../auto-reply-owner";
import { resolveAutoReplyOwner, ensureFacebookAutoReplyEnabled } from "../ai-auto-reply.service";
import { SocialIntegrationModel } from "../../model/social-integration.model";
import { UserModel } from "../../model/user.model";

test("a Page linked to different companies cannot choose an arbitrary knowledge owner", () => {
  const integrations = [
    { companyCode: "SYSTEM", aiAutoReplyConfig: { enabled: false } },
    { companyCode: "TUNA", aiAutoReplyConfig: { enabled: false } },
    { companyCode: "VIBARYCAKE", aiAutoReplyConfig: { enabled: true } },
  ];
  for (const candidates of [integrations, [...integrations].reverse()]) {
    assert.throws(() => selectAutoReplyCompanyIntegration(candidates), AmbiguousAutoReplyOwnerError);
  }
});

test("duplicate records within one company use its enabled config", () => {
  const disabled = { companyCode: " shop ", aiAutoReplyConfig: { enabled: false } };
  const enabled = { companyCode: "SHOP", aiAutoReplyConfig: { enabled: true } };
  assert.equal(selectAutoReplyCompanyIntegration([disabled, enabled]), enabled);
  assert.equal(selectAutoReplyCompanyIntegration([enabled, disabled]), enabled);
  assert.equal(selectAutoReplyCompanyIntegration([disabled]), disabled);
});

test("no company integration permits existing personal fallback; unknown ownership does not", () => {
  assert.equal(selectAutoReplyCompanyIntegration([]), null);
  assert.throws(() => selectAutoReplyCompanyIntegration([{ companyCode: "" }]), AmbiguousAutoReplyOwnerError);
});

test("owner resolution stops before reading users when a Page spans tenants", async (context) => {
  context.mock.method(SocialIntegrationModel, "find", () => ({ lean: async () => [
    { companyCode: "SYSTEM" }, { companyCode: "VIBARYCAKE", aiAutoReplyConfig: { enabled: true } },
  ] }));
  const users = context.mock.method(UserModel, "find", () => { throw new Error("Must not read tenant users"); });
  await assert.rejects(resolveAutoReplyOwner("facebook", "page-1"), AmbiguousAutoReplyOwnerError);
  assert.equal(users.mock.callCount(), 0);
});

test("Facebook activation updates the selected same-company record, not the first record", async (context) => {
  const updates: unknown[] = [];
  context.mock.method(SocialIntegrationModel, "updateOne", async (filter) => { updates.push(filter); });
  const selectedConfig = { enabled: true, commentReplyEnabled: false };
  const result = await ensureFacebookAutoReplyEnabled({
    companyCode: "SHOP", selectedUser: null, aiConfig: selectedConfig,
    source: "company_integration_enabled", userLevelOwners: [], uniqueCandidates: [],
    companyIntegrations: [
      { _id: "old", companyCode: "SHOP", aiAutoReplyConfig: { enabled: false } },
      { _id: "selected", companyCode: "SHOP", aiAutoReplyConfig: selectedConfig },
    ],
  });
  assert.deepEqual(updates, [{ _id: "selected" }]);
  assert.equal(result.companyCode, "SHOP");
});

test("Facebook activation cannot silently enable a conflicting company's integration", async (context) => {
  const update = context.mock.method(SocialIntegrationModel, "updateOne", () => { throw new Error("Must not update"); });
  await assert.rejects(ensureFacebookAutoReplyEnabled({
    companyCode: "VIBARYCAKE", selectedUser: null, aiConfig: { enabled: true },
    source: "company_integration_enabled", userLevelOwners: [], uniqueCandidates: [],
    companyIntegrations: [{ companyCode: "SYSTEM" }, { companyCode: "VIBARYCAKE" }],
  }), AmbiguousAutoReplyOwnerError);
  assert.equal(update.mock.callCount(), 0);
});

test("personal integrations cannot mix companies or users with unknown ownership", () => {
  assert.throws(() => assertPersonalAutoReplyOwnership([{ companyCode: "CAKE" }, { companyCode: "SOFTWARE" }]), AmbiguousAutoReplyOwnerError);
  assert.throws(() => assertPersonalAutoReplyOwnership([{}, {}]), AmbiguousAutoReplyOwnerError);
  assert.doesNotThrow(() => assertPersonalAutoReplyOwnership([{ companyCode: " shop " }, { companyCode: "SHOP" }]));
});

test("a Page's saved niche wins over an enabled company member's different niche", async (context) => {
  const pageConfig = { enabled: false, advancedInstructions: "Tư vấn phần mềm" };
  context.mock.method(SocialIntegrationModel, "find", () => ({ lean: async () => [
    { _id: "page-config", companyCode: "SHOP", aiAutoReplyConfig: pageConfig },
  ] }));
  context.mock.method(UserModel, "find", async () => [
    { _id: "user-1", companyCode: "SHOP", aiAutoReplyConfig: { enabled: true, advancedInstructions: "Bán bánh" } },
  ]);
  const owner = await resolveAutoReplyOwner("facebook", "page-1");
  assert.equal(owner.aiConfig, pageConfig);
  assert.equal(owner.source, "company_integration_fallback");
});

test("company membership alone does not donate another Page's rules", async (context) => {
  context.mock.method(SocialIntegrationModel, "find", () => ({ lean: async () => [
    { _id: "page-config", companyCode: "SHOP" },
  ] }));
  context.mock.method(UserModel, "find", async (filter) => filter.companyCode ? [
    { _id: "member", companyCode: "SHOP", aiAutoReplyConfig: { enabled: true, advancedInstructions: "Bán bánh" } },
  ] : []);
  const owner = await resolveAutoReplyOwner("facebook", "software-page");
  assert.equal(owner.companyCode, "SHOP");
  assert.equal(owner.aiConfig, null);
});
