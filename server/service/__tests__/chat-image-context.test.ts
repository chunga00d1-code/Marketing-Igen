import assert from "node:assert/strict";
import test from "node:test";
import { analyzeChatImages, extractImageQuoteRows, getChatImageUrls, splitHistoryAndPendingInboundMessages } from "../chat-image-context";

test("pending image-only messages remain in the current customer turn", () => {
  const result = splitHistoryAndPendingInboundMessages([
    { _id: "old", direction: "inbound", text: "mẫu cũ", attachments: [{ type: "image", url: "https://old.example/a.jpg" }] },
    { _id: "reply", direction: "outbound", text: "Chị chọn mẫu nào?" },
    { _id: "image", direction: "inbound", text: "", attachments: [{ type: "image", url: "https://scontent.xx.fbcdn.net/new.jpg" }] },
    { _id: "text", direction: "inbound", text: "Báo giá mẫu này" },
  ]);
  assert.equal(result.pendingMessageCount, 2);
  assert.deepEqual(result.imageUrls, ["https://scontent.xx.fbcdn.net/new.jpg"]);
  assert.equal(result.combinedText, "Báo giá mẫu này");
  assert.equal(result.historyMessages.length, 2);
});

test("missing image URLs are preserved and fail closed without an AI request", async (context) => {
  context.mock.method(globalThis, "fetch", async () => { throw new Error("Must not fetch"); });
  assert.deepEqual(getChatImageUrls([{ attachments: [{ type: "image" }, { type: "video", url: "x" }] }]), [""]);
  assert.equal((await analyzeChatImages([""]))?.status, "unavailable");
  assert.equal((await analyzeChatImages(["https://127.0.0.1/a.png"]))?.status, "unavailable");
  assert.equal((await analyzeChatImages(["https://fbcdn.net.evil.example/a.png"]))?.status, "unavailable");
  assert.equal((await analyzeChatImages(["a", "b"]))?.status, "unavailable");
  assert.equal(await analyzeChatImages([]), undefined);
});

test("the sheet parser preserves the configured quote verbatim", () => {
  const quote = "Bánh trái tim size 14cm cao 7cm giá 180k, size 18cm cao 10cm giá 330k.";
  const rows = extractImageQuoteRows(`[Nguon 0]\nDòng 3: Mã nhóm: TIM | Nhóm bánh: Bánh trái tim | Gợi ý nhận diện: Trái tim | Khi cần xác nhận: Chưa rõ hình | Nội dung báo giá nguyên văn: ${quote}`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quote, quote);
});

test("image analysis downloads the attachment and sends actual image bytes to the model", async (context) => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  context.after(() => {
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  });
  let modelCalls = 0;
  context.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).startsWith("https://scontent.xx.fbcdn.net/")) {
      assert.equal(init?.redirect, "error");
      return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
    }
    modelCalls++;
    const body = JSON.parse(String(init?.body));
    assert.ok(JSON.stringify(body.messages).includes("data:image/jpeg;base64,AQID"));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ readable: true, description: "Bánh hình trái tim" }) } }] }), {
      headers: { "content-type": "application/json" },
    });
  });
  assert.deepEqual(await analyzeChatImages(["https://scontent.xx.fbcdn.net/cake.jpg"]), { status: "ready", description: "Bánh hình trái tim" });
  assert.equal(modelCalls, 1);
});

test("expired attachments never call the model without image bytes", async (context) => {
  let calls = 0;
  context.mock.method(globalThis, "fetch", async () => { calls++; return new Response("expired", { status: 403 }); });
  assert.equal((await analyzeChatImages(["https://scontent.xx.fbcdn.net/expired.jpg"]))?.status, "unavailable");
  assert.equal(calls, 1);
});
