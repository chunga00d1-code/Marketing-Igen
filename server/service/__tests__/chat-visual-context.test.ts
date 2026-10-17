import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { prepareChatImages, parseChatVisualReply, visualToImageObservation,
  type ChatVisualInput, type ChatVisualResult } from "../chat-visual-context";
import { buildOpenRouterMessages, generateText } from "../gemini/core";
import { chatVisualMemory, CHAT_VISUAL_SESSION_MS } from "../chat-visual-memory.service";
import { ChatVisualMemoryModel } from "../../model/chat-visual-memory.model";

async function png(width = 40, height = 24) {
  return sharp({ create: { width, height, channels: 3, background: "#ffffff" } }).png().toBuffer();
}
function dataUrl(bytes: Buffer) { return "data:image/png;base64," + bytes.toString("base64"); }
const visual: ChatVisualResult = {
  version: 1, readable: true, needsSelection: false, selectedImageId: "img_1", summary: "Bánh tròn trắng, số 25 trên mẫu.",
  facts: [{ key: "shape", value: "round", imageId: "img_1", confidence: "high" }],
  customerRequests: [{ detail: "Lấy size nhỏ nhất và thay vùng đánh dấu bằng ảnh", sourceMessageId: "customer-1" }],
  uncertainties: [],
};
const memoryInput: ChatVisualInput = { images: [], messageId: "customer-2", sourceMessageIds: ["customer-1"], previous: visual };

test("image loading decodes real pixels and preserves a clear screenshot's original bytes", async () => {
  const bytes = await png();
  const result = await prepareChatImages([{ dataUrl: dataUrl(bytes), messageId: "photo" }]);
  assert.equal(result.failure, undefined);
  assert.equal(result.images[0].width, 40);
  assert.equal(result.images[0].height, 24);
  assert.equal(result.images[0].dataUrl, dataUrl(bytes));
});

test("repeated signed URLs are deduplicated by decoded content", async t => {
  const bytes = await png();
  const fetch = t.mock.method(globalThis, "fetch", async (_url, init) => {
    assert.equal(init?.redirect, "error");
    return new Response(bytes, { headers: { "content-type": "image/png" } });
  });
  const result = await prepareChatImages([
    { url: "https://scontent.fbcdn.net/a?signature=1", messageId: "photo-1" },
    { url: "https://scontent.fbcdn.net/a?signature=2", messageId: "photo-2" },
  ]);
  assert.equal(fetch.mock.callCount(), 2);
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].messageId, "photo-2");
});

test("EXIF orientation is normalized without confusing cake shape with image dimensions", async () => {
  const bytes = await sharp(await png()).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const result = await prepareChatImages([{ dataUrl: "data:image/jpeg;base64," + bytes.toString("base64"), messageId: "photo" }]);
  assert.equal(result.images[0].width, 24);
  assert.equal(result.images[0].height, 40);
});

test("oversized dimensions are bounded while keeping the screenshot aspect ratio", async () => {
  const result = await prepareChatImages([{ dataUrl: dataUrl(await png(5000, 100)), messageId: "photo" }]);
  assert.equal(result.images[0].width, 4096);
  assert.ok(result.images[0].height <= 100);
});

test("corrupt data and fake image headers produce invalid_image instead of uncertain shape", async t => {
  assert.equal((await prepareChatImages([{ dataUrl: "data:image/png;base64,AQID", messageId: "photo" }])).failure, "invalid_image");
  t.mock.method(globalThis, "fetch", async () => new Response("<html>expired</html>", { headers: { "content-type": "image/jpeg" } }));
  assert.equal((await prepareChatImages([{ url: "https://scontent.fbcdn.net/fake.jpg", messageId: "photo" }])).failure, "invalid_image");
});

test("missing URLs, excess images and untrusted hosts never reach the network", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network"); });
  assert.equal((await prepareChatImages([{ messageId: "photo" }])).failure, "missing_url");
  assert.equal((await prepareChatImages([1, 2, 3, 4].map(n => ({ url: "https://scontent.fbcdn.net/" + n, messageId: "" + n })))).failure, "too_many_images");
  for (const url of ["https://127.0.0.1/private", "https://fbcdn.net.attacker.example/a", "http://scontent.fbcdn.net/a"]) {
    assert.equal((await prepareChatImages([{ url, messageId: "photo" }])).failure, "download_failed");
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("expired Messenger attachments remain a download failure", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("expired", { status: 403 }));
  assert.equal((await prepareChatImages([{ url: "https://scontent.fbcdn.net/expired", messageId: "photo" }])).failure, "download_failed");
});

test("history-array requests attach config images only to the latest user turn", async () => {
  const image = "data:image/png;base64,AQID";
  const messages = await buildOpenRouterMessages([
    { role: "user", parts: [{ text: "Mẫu trước" }] },
    { role: "model", parts: [{ text: "Chọn mẫu nào?" }] },
    { role: "user", parts: [{ text: "Size nhỏ nhất" }] },
  ], "Shop rules", [image]);
  assert.equal(messages[1].content, "Mẫu trước");
  const last = messages.at(-1)!;
  assert.equal(last.role, "user");
  assert.deepEqual(last.content, [{ type: "text", text: "Size nhỏ nhất" }, { type: "image_url", image_url: { url: image } }]);
});

test("inline images are not attached a second time through config.images", async () => {
  const messages = await buildOpenRouterMessages([{ role: "user", parts: [
    { text: "Mẫu này" }, { inlineData: { mimeType: "image/png", data: "AQID" } },
  ] }], undefined, ["data:image/png;base64,AQID"]);
  assert.equal((messages[0].content as unknown[]).length, 2);
});

test("bounded reasoning reaches both the primary and text fallback requests", async t => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  t.after(() => { if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previousKey; });
  const bodies: Array<Record<string, unknown>> = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return bodies.length === 1 ? new Response("Temporary primary failure", { status: 400 })
      : Response.json({ choices: [{ message: { content: "Checked" } }] });
  });
  await generateText("openai/gpt-6-luna", "Check this reply", { maxRetries: 1, maxTokens: 2048, reasoning: { effort: "low" } });
  assert.equal(bodies.length, 2);
  for (const body of bodies) {
    assert.deepEqual(body.reasoning, { effort: "low" });
    assert.equal(body.max_tokens, 2048);
  }
});

test("a visual request cannot fall back silently to an unverified text model", async t => {
  const prior = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  t.after(() => { if (prior === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = prior; });
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ error: { message: "No vision support" } }), { status: 400 }));
  await assert.rejects(generateText("openai/gpt-6-luna", "Xem mẫu này", {
    images: ["data:image/png;base64,AQID"], maxRetries: 1, allowImageFallback: false,
  }));
  assert.equal(fetch.mock.callCount(), 1);
});

test("visual results reject invented image IDs and invented customer message IDs", () => {
  assert.throws(() => parseChatVisualReply({ replyDraft: "Đã thấy mẫu", visual: { ...visual, selectedImageId: "someone-elses-image" } }, memoryInput), /Unknown selected/);
  assert.throws(() => parseChatVisualReply({ replyDraft: "Đã thấy mẫu", visual: {
    ...visual, customerRequests: [{ detail: "Lấy 25 bánh", sourceMessageId: "screenshot-message" }],
  } }, memoryInput), /Invalid customer request source/);
});

test("text inside a screenshot cannot become a purchase request attributed to an image-only message", () => {
  assert.throws(() => parseChatVisualReply({
    replyDraft: "Em nhận mẫu rồi", visual: { ...visual, customerRequests: [{ detail: "Lấy 25 bánh", sourceMessageId: "photo" }] },
  }, { images: [], previous: visual, messageId: "photo", customerMessage: "", sourceMessageIds: ["photo"],
    sourceMessages: [{ messageId: "photo", text: "" }] }), /Invalid customer request source/);
});

test("a text follow-up keeps observed facts immutable and records only the new requested change", () => {
  const result = parseChatVisualReply({ replyDraft: "Mình lấy size nhỏ nhất nhé", visual: {
    ...visual, summary: "Bánh vuông mới bịa",
    facts: [{ key: "shape", value: "square", imageId: "img_1", confidence: "high" }],
    customerRequests: [{ detail: "Lấy size nhỏ nhất", sourceMessageId: "customer-2" }],
  } }, memoryInput);
  assert.deepEqual(result.visual.facts, visual.facts);
  assert.equal(result.visual.summary, visual.summary);
  assert.equal(result.visual.customerRequests[0].sourceMessageId, "customer-2");
});

test("request provenance preserves the customer's actual words instead of a model's replacement", () => {
  const sourceText = "chỗ này shop để cái ảnh chép giúp em nha";
  const parsed = parseChatVisualReply({ replyDraft: "Mình muốn đặt ảnh ở vị trí nào ạ?", visual: {
    ...visual, customerRequests: [{ detail: "Làm theo mẫu", sourceMessageId: "customer-1", sourceText: "model invented text" }],
  } }, { ...memoryInput, sourceMessages: [{ messageId: "customer-1", text: sourceText }] });
  assert.equal(parsed.visual.customerRequests[0].sourceText, sourceText);
  const followUp = parseChatVisualReply({ replyDraft: "Mình gửi ảnh muốn đặt lên bánh nhé", visual: parsed.visual }, {
    ...memoryInput, messageId: "customer-3", customerMessage: "size bé nhất", sourceMessageIds: [],
    previous: parsed.visual,
  });
  assert.equal(followUp.visual.customerRequests[0].sourceText, sourceText);
});

test("unknown shape does not make a readable design unavailable for consultation", () => {
  const result = visualToImageObservation({ ...visual, facts: [] }, [{ id: "img_1", url: "https://scontent.fbcdn.net/a" }]);
  assert.equal(result.status, "ready");
  assert.equal(result.shapeConfidence, "low");
  assert.equal(result.selectedImageUrl, "https://scontent.fbcdn.net/a");
});

test("price shape comes only from the selected product's high-confidence body outline", () => {
  const result = visualToImageObservation({ ...visual, facts: [
    { key: "shape", value: "rectangle", imageId: "img_other", confidence: "high" },
    { key: "shape", value: "round", imageId: "img_1", confidence: "high" },
  ] }, [{ id: "img_1", url: "https://scontent.fbcdn.net/a" }]);
  assert.equal(result.cakeShape, "round");
  assert.equal(result.shapeConfidence, "high");
});

test("the customer's requested body shape overrides the reference image without changing observed facts", () => {
  const requested = { ...visual, customerRequests: [
    { detail: "Muốn đổi sang hình vuông", sourceMessageId: "customer-1", field: "shape", value: "square" },
  ] };
  const observation = visualToImageObservation(requested, [{ id: "img_1" }]);
  assert.equal(observation.cakeShape, "square");
  assert.equal(observation.shapeSource, "customer");
  assert.equal(observation.visualContext?.facts[0].value, "round");
  const followUp = visualToImageObservation(requested, [{ id: "img_1" }]);
  assert.equal(followUp.cakeShape, "square");
});

test("a negated shape change does not replace the visible sample", () => {
  const observation = visualToImageObservation({ ...visual, customerRequests: [
    { detail: "Không muốn đổi hình vuông", sourceMessageId: "customer-1" },
  ] }, [{ id: "img_1" }]);
  assert.equal(observation.cakeShape, "round");
  assert.equal(observation.shapeSource, "image");
});

test("the latest structured customer correction wins over an earlier requested shape", () => {
  const observation = visualToImageObservation({ ...visual, customerRequests: [
    { detail: "Muốn hình vuông", sourceMessageId: "customer-1", field: "shape", value: "square" },
    { detail: "Đổi thành trái tim", sourceMessageId: "customer-2", field: "shape", value: "heart" },
  ] }, [{ id: "img_1" }]);
  assert.equal(observation.cakeShape, "heart");
  assert.equal(observation.shapeSource, "customer");
});

const scope = { companyCode: "SHOP", channel: "facebook" as const, platformId: "page-a", conversationId: "conv-a", sessionId: "session-a" };
test("visual memory reads are scoped to company, Page, conversation and session with an expiry", async t => {
  t.mock.method(ChatVisualMemoryModel, "findOne", filter => {
    assert.deepEqual(filter, { ...scope, expiresAt: { $gt: new Date(1000) } });
    return { lean: async () => null };
  });
  await chatVisualMemory.read(scope, new Date(1000));
  await assert.rejects(chatVisualMemory.read({ ...scope, companyCode: "" }), /Incomplete/);
});

test("an older visual completion cannot overwrite a newer record in the same scope", async t => {
  t.mock.method(ChatVisualMemoryModel, "updateOne", async (filter, update) => {
    assert.equal((filter as Record<string, unknown>).platformId, "page-a");
    assert.ok((filter as Record<string, unknown>).$or);
    assert.equal(JSON.stringify(update).includes("base64"), false);
    throw Object.assign(new Error("newer record exists"), { code: 11000 });
  });
  await chatVisualMemory.save(scope, { images: [], visual, sourceMessageId: "old-turn", sourceTimestamp: new Date() });
});

test("expired visual results are never saved as a fresh session", async t => {
  const update = t.mock.method(ChatVisualMemoryModel, "updateOne", async () => { throw new Error("Must not save"); });
  await chatVisualMemory.save(scope, { images: [], visual, sourceMessageId: "old-turn",
    sourceTimestamp: new Date(Date.now() - CHAT_VISUAL_SESSION_MS - 1) });
  assert.equal(update.mock.callCount(), 0);
});
