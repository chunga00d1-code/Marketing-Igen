import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import sharp from "sharp";
import { prepareChatReplyContext, commitChatVisualContext, describeChatVisualContext } from "../chat-reply-context.service";
import { chatVisualMemory } from "../chat-visual-memory.service";
import { aiKnowledgeService } from "../ai-knowledge.service";
import { CakeCheckoutModel } from "../../model/cake-checkout.model";
import type { ChatVisualResult } from "../chat-visual-context";
import type { ChatVisualMemory } from "../../model/chat-visual-memory.model";

const at = new Date();
const photoUrl = "https://scontent.fbcdn.net/cake?signature=secret";
const visual: ChatVisualResult = {
  version: 1, readable: true, needsSelection: false, selectedImageId: "img_old",
  summary: "Bánh trắng tròn, số 25 trên mẫu.",
  facts: [{ key: "shape", value: "round", imageId: "img_old", confidence: "high" }],
  customerRequests: [{ detail: "Thay vùng đánh dấu bằng ảnh", sourceMessageId: "first" }], uncertainties: [],
};
const memory: ChatVisualMemory = {
  companyCode: "SHOP", channel: "facebook", platformId: "PAGE", conversationId: "CONV", sessionId: "SESSION",
  sourceMessageId: "first", sourceTimestamp: at, expiresAt: new Date(at.getTime() + 100_000),
  visual, images: [{ id: "img_old", url: photoUrl, messageId: "photo", hash: "hash", width: 40, height: 24 }],
};
const base = {
  companyCode: "SHOP", channel: "facebook" as const, platformId: "PAGE", conversationId: "CONV", sessionId: "SESSION",
  messageId: "latest", timestamp: at, message: "Size nhỏ nhất nhé", history: [],
  aiConfig: { imageReplyEnabled: true },
};
function setup(t: TestContext, saved: ChatVisualMemory | null = null) {
  t.mock.method(aiKnowledgeService, "prepareChatContext", async (input) => {
    assert.equal(input.companyCode, "SHOP");
    assert.equal(input.pageId, "PAGE");
    return { companyCode: "SHOP", contextText: "Shop test", scenarioContextText: "", matches: 1 } as Awaited<ReturnType<typeof aiKnowledgeService.prepareChatContext>>;
  });
  t.mock.method(aiKnowledgeService, "getFullPricingContext", async input => {
    assert.equal(input.pageId, "PAGE");
    return "Bảng giá của PAGE";
  });
  const read = t.mock.method(chatVisualMemory, "read", async scope => {
    assert.deepEqual(scope, { companyCode: "SHOP", channel: "facebook", platformId: "PAGE", conversationId: "CONV", sessionId: "SESSION" });
    return saved;
  });
  const checkout = t.mock.method(CakeCheckoutModel, "findOne", filter => {
    assert.equal(filter.companyCode, "SHOP");
    assert.equal(filter.pageId, "PAGE");
    assert.equal(filter.sessionId, "SESSION");
    return { lean: async () => null };
  });
  return { read, checkout };
}

test("preparation downloads new photos once and does not run the old AI classifier", async t => {
  setup(t);
  const bytes = await sharp({ create: { width: 40, height: 24, channels: 3, background: "white" } }).png().toBuffer();
  const fetch = t.mock.method(globalThis, "fetch", async url => {
    assert.equal(new URL(String(url)).hostname, "scontent.fbcdn.net");
    return new Response(bytes, { headers: { "content-type": "image/png" } });
  });
  const prepared = await prepareChatReplyContext({ ...base, message: "Chỗ này để ảnh, size bé nhất nhé",
    imageUrls: [photoUrl], messages: [
      { messageId: "photo", direction: "inbound", timestamp: at, attachments: [{ type: "image", url: photoUrl }] },
      { messageId: "latest", direction: "inbound", text: "Chỗ này để ảnh, size bé nhất nhé", timestamp: at },
    ],
  });
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(prepared.visualInput?.images.length, 1);
  assert.equal(prepared.ragContext.imageObservation, undefined);
  assert.equal(prepared.visualInput?.images[0].messageId, "photo");
  assert.equal(prepared.visualInput?.sourceMessages?.[1].messageId, "latest");
});

test("a size follow-up reads only the current session's memory and does not download or resend the photo", async t => {
  setup(t, memory);
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("No image network expected"); });
  const prepared = await prepareChatReplyContext(base);
  assert.deepEqual(prepared.visualInput?.previous, visual);
  assert.deepEqual(prepared.visualInput?.images, []);
  assert.equal(fetch.mock.callCount(), 0);
});

test("short answers to the shop's visual question retain the selected sample", async t => {
  setup(t, memory);
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("No image network expected"); });
  for (const message of ["Giữ nguyên giúp em", "25", "dạ đúng rồi"]) {
    const prepared = await prepareChatReplyContext({ ...base, message,
      history: [{ sender: "model", text: "Mình giữ số và chữ trên mẫu hay đổi nội dung khác?" }],
    });
    assert.deepEqual(prepared.visualInput?.previous, visual);
    assert.deepEqual(prepared.visualInput?.images, []);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("a question about an unrecorded layer count reopens the source image", async t => {
  setup(t, memory);
  const bytes = await sharp({ create: { width: 40, height: 24, channels: 3, background: "white" } }).png().toBuffer();
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(bytes, { headers: { "content-type": "image/png" } }));
  const prepared = await prepareChatReplyContext({ ...base, message: "Ảnh này có mấy tầng?" });
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(prepared.visualInput?.images.length, 1);
});

test("a decoration removal reuses memory without requiring the source photo to open again", async t => {
  setup(t, memory);
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Do not reopen an image for a text-only modification"); });
  const prepared = await prepareChatReplyContext({ ...base, message: "Bỏ topper giúp em nhé" });
  assert.deepEqual(prepared.visualInput?.previous, visual);
  assert.deepEqual(prepared.visualInput?.images, []);
  assert.equal(fetch.mock.callCount(), 0);
});

test("an explicit question about new visual detail reopens the correct original image", async t => {
  setup(t, memory);
  const bytes = await sharp({ create: { width: 40, height: 24, channels: 3, background: "white" } }).png().toBuffer();
  const fetch = t.mock.method(globalThis, "fetch", async url => {
    assert.equal(String(url), photoUrl);
    return new Response(bytes, { headers: { "content-type": "image/png" } });
  });
  const prepared = await prepareChatReplyContext({ ...base, message: "Trên ảnh ghi chữ gì?" });
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(prepared.visualInput?.images.length, 1);
});

test("a numeric answer to sample selection reopens the waiting samples even without a fixed assistant phrase", async t => {
  setup(t, { ...memory, visual: { ...visual, needsSelection: true, selectedImageId: "" } });
  const bytes = await sharp({ create: { width: 40, height: 24, channels: 3, background: "white" } }).png().toBuffer();
  t.mock.method(globalThis, "fetch", async () => new Response(bytes, { headers: { "content-type": "image/png" } }));
  const prepared = await prepareChatReplyContext({ ...base, message: "2" });
  assert.equal(prepared.visualInput?.images.length, 1);
});

test("an explicit new sample resets visual memory and excludes the old checkout snapshot", async t => {
  const { read, checkout } = setup(t, memory);
  const prepared = await prepareChatReplyContext({ ...base, message: "Đơn mới lấy mẫu khác nhé" });
  assert.equal(prepared.visualInput, undefined);
  assert.equal(prepared.resetMemory, true);
  assert.equal(read.mock.callCount(), 0);
  assert.equal(checkout.mock.callCount(), 0);
  const reset = t.mock.method(chatVisualMemory, "reset", async (scope, timestamp) => {
    assert.equal(scope.sessionId, "SESSION");
    assert.equal(timestamp, at);
  });
  await commitChatVisualContext(prepared);
  assert.equal(reset.mock.callCount(), 1);
});

test("a fresh purchase request clears the previous sample while selecting the current photo keeps it", async t => {
  const { read } = setup(t, memory);
  const fresh = await prepareChatReplyContext({ ...base, message: "Tôi muốn đặt bánh cho ngày mai" });
  assert.equal(fresh.resetMemory, true);
  assert.equal(fresh.visualInput, undefined);
  assert.equal(read.mock.callCount(), 0);
  const current = await prepareChatReplyContext({ ...base, message: "Em muốn đặt mẫu này, size nhỏ nhất" });
  assert.equal(current.resetMemory, false);
  assert.equal(current.visualInput?.previous?.summary, visual.summary);
});

test("an unrelated conversation topic does not import a previous photo's facts", async t => {
  const { read } = setup(t, memory);
  const prepared = await prepareChatReplyContext({ ...base, message: "Địa chỉ shop ở đâu?" });
  assert.equal(prepared.visualInput, undefined);
  assert.equal(read.mock.callCount(), 0);
});

test("a missing in-memory sample can be recovered from the current authorized message session", async t => {
  setup(t);
  const bytes = await sharp({ create: { width: 40, height: 24, channels: 3, background: "white" } }).png().toBuffer();
  t.mock.method(globalThis, "fetch", async () => new Response(bytes, { headers: { "content-type": "image/png" } }));
  const prepared = await prepareChatReplyContext({ ...base, messages: [
    { direction: "inbound", messageId: "photo", timestamp: at, attachments: [{ type: "image", url: photoUrl }] },
    { direction: "outbound", messageId: "shop", timestamp: at, text: "Mình chọn size nào?" },
  ] });
  assert.equal(prepared.visualInput?.images[0].messageId, "photo");
});

test("image recovery stops at a request to change sample instead of resurrecting the old photo", async t => {
  setup(t);
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Old photo must not be recovered"); });
  const prepared = await prepareChatReplyContext({ ...base, messages: [
    { direction: "inbound", messageId: "photo", timestamp: at, attachments: [{ type: "image", url: photoUrl }] },
    { direction: "outbound", messageId: "shop-1", text: "Mình lấy size nào?" },
    { direction: "inbound", messageId: "change", text: "Cho em mẫu khác nhé" },
    { direction: "outbound", messageId: "shop-2", text: "Mình gửi mẫu mới nhé" },
  ] });
  assert.equal(prepared.visualInput, undefined);
  assert.equal(fetch.mock.callCount(), 0);
});

test("a clearer crop retains verbatim customer requests even after the source turn leaves history", async t => {
  const sourceText = "chỗ này shop để cái ảnh chép giúp em nha";
  setup(t, { ...memory, visual: { ...visual, customerRequests: [
    { detail: "Làm theo mẫu", sourceMessageId: "first", sourceText },
  ] } });
  const bytes = await sharp({ create: { width: 40, height: 24, channels: 3, background: "white" } }).png().toBuffer();
  t.mock.method(globalThis, "fetch", async () => new Response(bytes, { headers: { "content-type": "image/png" } }));
  const prepared = await prepareChatReplyContext({ ...base, message: "dạ đây ạ", imageUrls: ["https://scontent.fbcdn.net/crop"] });
  assert.ok(prepared.visualInput?.sourceMessages?.some(message => message.messageId === "first" && message.text === sourceText));
});

test("download failures retain an operational reason and invalidate the old sample after the turn is accepted", async t => {
  setup(t, memory);
  t.mock.method(globalThis, "fetch", async () => new Response("expired", { status: 403 }));
  const prepared = await prepareChatReplyContext({ ...base, imageUrls: ["https://scontent.fbcdn.net/new"] });
  assert.equal(prepared.visualInput?.failure, "download_failed");
  const diagnostics = describeChatVisualContext(prepared);
  assert.equal(diagnostics.failure, "download_failed");
  assert.doesNotMatch(JSON.stringify(diagnostics), /signature|base64/);
  const reset = t.mock.method(chatVisualMemory, "reset", async () => undefined);
  await commitChatVisualContext(prepared);
  assert.equal(reset.mock.callCount(), 1);
});

test("a newly opened image with no readable product invalidates the previous sample", async t => {
  setup(t, memory);
  const bytes = await sharp({ create: { width: 40, height: 24, channels: 3, background: "white" } }).png().toBuffer();
  t.mock.method(globalThis, "fetch", async () => new Response(bytes, { headers: { "content-type": "image/png" } }));
  const prepared = await prepareChatReplyContext({ ...base, imageUrls: ["https://scontent.fbcdn.net/new"] });
  const reset = t.mock.method(chatVisualMemory, "reset", async () => undefined);
  const save = t.mock.method(chatVisualMemory, "save", async () => undefined);
  await commitChatVisualContext(prepared, { ...visual, readable: false, facts: [], summary: "Không có sản phẩm trong ảnh mới" });
  assert.equal(save.mock.callCount(), 0);
  assert.equal(reset.mock.callCount(), 1);
});

test("saved visual context contains references and provenance but no image bytes", async t => {
  setup(t, memory);
  const prepared = await prepareChatReplyContext(base);
  const save = t.mock.method(chatVisualMemory, "save", async (scope, value) => {
    assert.equal(scope.platformId, "PAGE");
    assert.doesNotMatch(JSON.stringify(value), /data:image|dataUrl|base64/);
    assert.equal(value.visual.customerRequests[0].sourceMessageId, "first");
  });
  await commitChatVisualContext(prepared, visual);
  assert.equal(save.mock.callCount(), 1);
});

test("source mappings do not reintroduce customer details removed from the current order history", async t => {
  setup(t, memory);
  const prepared = await prepareChatReplyContext({ ...base,
    history: [{ sender: "user", text: "Mẫu hiện tại", messageId: "current-photo" }],
    messages: [
      { direction: "inbound", messageId: "old-order", text: "Tên người nhận đơn cũ", timestamp: at },
      { direction: "outbound", messageId: "old-shop", text: "Đã chốt đơn cũ", timestamp: at },
      { direction: "inbound", messageId: "current-photo", text: "Mẫu hiện tại", timestamp: at },
      { direction: "outbound", messageId: "shop", text: "Chọn size nào?", timestamp: at },
      { direction: "inbound", messageId: "latest", text: "Size nhỏ nhất nhé", timestamp: at },
    ],
  });
  assert.doesNotMatch(JSON.stringify(prepared.visualInput?.sourceMessages), /đơn cũ/);
  assert.deepEqual(prepared.visualInput?.sourceMessageIds, ["current-photo", "latest"]);
});
