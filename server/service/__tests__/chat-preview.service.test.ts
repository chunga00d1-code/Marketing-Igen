import assert from "node:assert/strict";
import test from "node:test";
import { prepareChatPreview } from "../chat-preview.service";
import { FBConversationModel, FBMessageModel } from "../../model/fb-messenger.model";
import { ZaloConversationModel, ZaloMessageModel } from "../../model/zalo-messenger.model";
import { TikTokConversationModel, TikTokMessageModel } from "../../model/tiktok-messenger.model";
import { UserModel } from "../../model/user.model";

test("preview uses actual conversation page and saved auto-reply configuration", async (context) => {
  context.mock.method(FBConversationModel, "findById", () => ({ select: () => ({ lean: async () => ({ pageId: "actual-page" }) }) }));
  context.mock.method(FBMessageModel, "find", (filter) => {
    assert.deepEqual(filter, { conversationId: "conversation-1" });
    return { sort: () => ({ limit: (limit: number) => {
      assert.equal(limit, 15);
      return { lean: async () => [
        { direction: "outbound", text: "Em kiểm tra" },
        { direction: "inbound", text: "Tiramisu giá sao" },
      ] };
    } }) };
  });
  const config = { model: "saved-model", trainingKnowledge: "Tiramisu 400k", customerServiceScript: "Hỏi số lượng sau khi tư vấn" };
  const result = await prepareChatPreview({
    userId: "user-1", companyCode: "SHOP", channel: "facebook", conversationId: "conversation-1", platformId: "wrong-page",
  }, async (channel, pageId) => {
    assert.equal(channel, "facebook");
    assert.equal(pageId, "actual-page");
    return { companyCode: "SHOP", aiConfig: config };
  });
  assert.deepEqual(result.aiConfig, config);
  assert.equal(result.pageId, "actual-page");
  assert.deepEqual(result.history, [
    { sender: "user", text: "Tiramisu giá sao" },
    { sender: "model", text: "Em kiểm tra" },
  ]);
});

test("preview rejects another tenant before accessing conversation messages", async (context) => {
  context.mock.method(FBConversationModel, "findById", () => ({ select: () => ({ lean: async () => ({ pageId: "other-page" }) }) }));
  const readMessages = context.mock.method(FBMessageModel, "find", () => { throw new Error("Must not read messages"); });
  await assert.rejects(prepareChatPreview({
    userId: "user-1", companyCode: "SHOP", channel: "facebook", conversationId: "conversation-1",
  }, async () => ({ companyCode: "OTHER", aiConfig: {} })), { status: 403 });
  assert.equal(readMessages.mock.callCount(), 0);
});

test("preview without selected channel account reads saved user config", async (context) => {
  context.mock.method(UserModel, "findById", () => ({ select: () => ({ lean: async () => ({ aiAutoReplyConfig: { model: "saved-user-model" } }) }) }));
  const result = await prepareChatPreview({ userId: "user-1", companyCode: "SHOP", channel: "facebook" }, async () => { throw new Error("No account to resolve"); });
  assert.equal(result.aiConfig.model, "saved-user-model");
  assert.deepEqual(result.history, []);
});

test("Zalo and TikTok previews resolve their own account and history", async (context) => {
  context.mock.method(ZaloConversationModel, "findById", () => ({ select: () => ({ lean: async () => ({ oaId: "oa-1" }) }) }));
  context.mock.method(TikTokConversationModel, "findById", () => ({ select: () => ({ lean: async () => ({ businessAccountId: "tt-1" }) }) }));
  for (const model of [ZaloMessageModel, TikTokMessageModel]) {
    context.mock.method(model, "find", () => ({ sort: () => ({ limit: () => ({ lean: async () => [{ direction: "inbound", text: "Giờ mở cửa?" }] }) }) }));
  }
  for (const channel of ["zalo", "tiktok"] as const) {
    const result = await prepareChatPreview({ userId: "user-1", companyCode: "SHOP", channel, conversationId: "conversation-1" }, async (resolvedChannel, account) => {
      assert.equal(resolvedChannel, channel);
      assert.equal(account, channel === "zalo" ? "oa-1" : "tt-1");
      return { companyCode: "SHOP", aiConfig: { model: channel } };
    });
    assert.equal(result.pageId, undefined);
    assert.equal(result.history[0].text, "Giờ mở cửa?");
  }
});

test("deleted conversation fails without resolving an unrelated account", async (context) => {
  context.mock.method(FBConversationModel, "findById", () => ({ select: () => ({ lean: async () => null }) }));
  await assert.rejects(prepareChatPreview({ userId: "user-1", companyCode: "SHOP", channel: "facebook", conversationId: "missing" }, async () => {
    throw new Error("Must not resolve missing conversation");
  }), { status: 404 });
});
