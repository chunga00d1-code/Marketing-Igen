import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import sharp from "sharp";
import { GeminiChatService } from "../chat.service";
import { prepareChatImages, type ChatVisualResult, type ChatVisualInput } from "../../chat-visual-context";

const service = new GeminiChatService();
type Request = { model: string; messages: Array<{ role: string; content: unknown }>; max_tokens?: number; reasoning?: { effort: string } };
function mockAI(t: TestContext, outputs: string[]) {
  const prior = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  t.after(() => { if (prior === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = prior; });
  const requests: Request[] = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(new URL(String(url)).hostname, "openrouter.ai");
    const output = outputs[requests.length];
    requests.push(JSON.parse(String(init?.body)));
    assert.notEqual(output, undefined, "Unexpected AI request");
    return new Response(JSON.stringify({ choices: [{ message: { content: output } }] }), { headers: { "content-type": "application/json" } });
  });
  return requests;
}
async function input(): Promise<ChatVisualInput> {
  const bytes = await sharp({ create: { width: 40, height: 24, channels: 3, background: "white" } }).png().toBuffer();
  const prepared = await prepareChatImages([{ dataUrl: "data:image/png;base64," + bytes.toString("base64"), messageId: "photo" }]);
  return { images: prepared.images, messageId: "customer", sourceMessageIds: ["photo", "customer"] };
}
function result(imageId: string, overrides: Partial<ChatVisualResult> = {}): ChatVisualResult {
  return { version: 1, readable: true, needsSelection: false, selectedImageId: imageId,
    summary: "Bánh tròn trắng, topper số 25 và một vùng được đánh dấu.",
    facts: [{ key: "shape", value: "round", imageId, confidence: "high" }],
    customerRequests: [{ detail: "Đổi vùng đánh dấu sang ảnh và lấy size nhỏ nhất", sourceMessageId: "customer" }],
    uncertainties: [], ...overrides };
}
const corrected = (text: string) => JSON.stringify({ compliant: true, correctedParts: [text] });
const verified = JSON.stringify({ compliant: true });
function imageRequests(requests: Request[]) { return requests.filter(request => JSON.stringify(request).includes('"type":"image_url"')); }

test("one main call sees the real image, customer request and prior conversation together", async t => {
  const visualInput = await input();
  const answer = "Mình gửi em ảnh muốn đặt vào chỗ đánh dấu nhé";
  const requests = mockAI(t, [JSON.stringify({ replyDraft: answer, visual: result(visualInput.images[0].id) })]);
  const response = await service.chat("Lấy size nhỏ nhất, thay chỗ này bằng ảnh giúp em", [
    { sender: "user", text: "Em chọn mẫu trắng" }, { sender: "model", text: "Mình gửi mẫu nhé" },
  ], { companyName: "Test shop" }, { visualInput });
  assert.equal(response.text, answer);
  assert.equal(response.visual?.customerRequests.length, 1);
  assert.equal(requests.length, 1);
  assert.equal(imageRequests(requests).length, 1);
  assert.match(JSON.stringify(requests[0]), /Lấy size nhỏ nhất/);
  assert.match(JSON.stringify(requests[0]), /Em chọn mẫu trắng/);
  assert.match(JSON.stringify(requests[0]), /screenshot TikTok/);
});

test("visual facts and requests reach both rule reviews without retransmitting the image", async t => {
  const visualInput = await input();
  const candidate = "anh/chị gửi em ảnh cần thay nhé";
  const answer = "anh - chị gửi em ảnh cần thay nhé";
  const requests = mockAI(t, [JSON.stringify({ replyDraft: candidate, visual: result(visualInput.images[0].id) }),
    corrected(candidate), verified]);
  const response = await service.chat("Thay chỗ này bằng ảnh", [], {
    companyName: "Test shop", customerAddressStyle: "anh - chị", advancedInstructions: "Dùng câu ngắn",
  }, { visualInput, contextText: "Shop có nhận thay trang trí bằng ảnh theo yêu cầu." });
  assert.equal(response.text, answer);
  assert.equal(requests.length, 3);
  assert.equal(imageRequests(requests).length, 1);
  for (const request of requests.slice(1)) {
    assert.match(JSON.stringify(request), /visualEvidence/);
    assert.match(JSON.stringify(request), /Đổi vùng đánh dấu/);
    assert.doesNotMatch(JSON.stringify(request), /data:image/);
    assert.deepEqual(request.reasoning, { effort: "low" });
    assert.equal(request.max_tokens, 2048);
  }
});

test("image attachments prevent a short acknowledgement from bypassing visual understanding", async t => {
  const visualInput = await input();
  const answer = "Em thấy mẫu trắng rồi, mình gửi ảnh cần thay nhé";
  const requests = mockAI(t, [JSON.stringify({ replyDraft: answer, visual: result(visualInput.images[0].id) })]);
  const response = await service.chat("dạ đây ạ", [], { companyName: "Test shop" }, { visualInput });
  assert.equal(response.text, answer);
  assert.equal(imageRequests(requests).length, 1);
});

test("a readable design with unknown shape can still answer the decoration request", async t => {
  const visualInput = await input();
  const answer = "Mình gửi em ảnh muốn đặt ở vùng đã đánh dấu nhé";
  mockAI(t, [JSON.stringify({ replyDraft: answer, visual: result(visualInput.images[0].id, { facts: [] }) })]);
  const response = await service.chat("Chỗ đánh dấu để ảnh giúp em", [], { companyName: "Test shop" }, { visualInput });
  assert.equal(response.text, answer);
  assert.doesNotMatch(response.text, /hình gì|gửi ảnh rõ/);
});

test("memory follow-ups use saved visual facts without another image-bearing request", async t => {
  const firstInput = await input();
  const previous = result(firstInput.images[0].id);
  const answer = "Mình chọn size nhỏ nhất cho mẫu trắng nhé";
  const requests = mockAI(t, [JSON.stringify({ replyDraft: answer, visual: previous })]);
  const response = await service.chat("Lấy size nhỏ nhất", [], { companyName: "Test shop" }, {
    visualInput: { ...firstInput, images: [], previous }, visualContext: previous,
  });
  assert.equal(response.text, answer);
  assert.equal(imageRequests(requests).length, 0);
  assert.match(JSON.stringify(requests[0]), /topper số 25/);
});

test("a text fallback retains original customer wording without receiving image bytes", async t => {
  const firstInput = await input();
  const sourceText = "chỗ này shop để cái ảnh chép giúp em nha";
  const previous = result(firstInput.images[0].id, { customerRequests: [
    { detail: "Làm theo mẫu", sourceMessageId: "customer", sourceText },
  ] });
  const answer = "Mình muốn đặt ảnh ở vị trí nào trên bánh ạ?";
  const requests = mockAI(t, ["", JSON.stringify({ replyDraft: answer, visual: previous })]);
  const response = await service.chat("size bé nhất", [], { companyName: "Test shop" }, {
    visualInput: { images: [], messageId: "followup", customerMessage: "size bé nhất", sourceMessageIds: [], previous },
    visualContext: previous,
  });
  assert.equal(requests.length, 2);
  assert.notEqual(requests[0].model, requests[1].model);
  assert.equal(imageRequests(requests).length, 0);
  assert.match(JSON.stringify(requests[1]), /chỗ này shop để cái ảnh chép/);
  assert.equal(response.visual?.customerRequests[0].sourceText, sourceText);
  assert.deepEqual(response.visual?.facts, previous.facts);
});

test("a bounded rule repair receives the verifier's specific violations before being checked again", async t => {
  const visualInput = await input();
  const answer = "Mình gửi ảnh muốn đặt lên bánh giúp em nhé";
  const correctedAnswer = "Mình gửi ảnh muốn đặt lên bánh và chỉ vị trí muốn đặt giúp em nhé";
  const violation = "The customer points to an area, but its requested placement still needs clarification.";
  const requests = mockAI(t, [JSON.stringify({ replyDraft: answer, visual: result(visualInput.images[0].id) }),
    corrected(answer), JSON.stringify({ compliant: false, violations: [violation] }), corrected(correctedAnswer), verified]);
  const response = await service.chat("Đặt ảnh ở chỗ này nhé", [], { companyName: "Test shop", advancedInstructions: "Hỏi rõ vị trí khách chọn" }, { visualInput });
  assert.equal(response.text, correctedAnswer);
  assert.equal(requests.length, 5);
  const repair = JSON.parse(String(requests[3].messages.at(-1)?.content));
  assert.deepEqual(repair.verificationViolations, [violation]);
  assert.equal(imageRequests(requests).length, 1);
});

test("review distinguishes a missing customization photo from a readable product reference", async t => {
  const visualInput = await input();
  const answer = "Mình gửi ảnh muốn chép vào vị trí đó trên bánh giúp em nhé";
  const requests = mockAI(t, [JSON.stringify({ replyDraft: answer, visual: result(visualInput.images[0].id) }), corrected(answer), verified]);
  const response = await service.chat("Chỗ này để ảnh giúp em nhé", [], { companyName: "Test shop", advancedInstructions: "Giữ đủ yêu cầu của khách" }, { visualInput });
  assert.equal(response.text, answer);
  for (const request of requests.slice(1)) {
    assert.match(String(request.messages[0].content), /separate photo\/artwork/);
    assert.match(String(request.messages[0].content), /Asking for the missing customization photo or its placement is allowed/);
  }
});

test("a price inquiry quotes only the configured group matching the observed cake body", async t => {
  const visualInput = await input();
  const quote = "Bánh tròn size 14cm giá 200k.";
  const answer = "Giá tham khảo theo nhóm mẫu này:\n" + quote;
  const requests = mockAI(t, [JSON.stringify({ replyDraft: "Giá 999k", visual: result(visualInput.images[0].id) }),
    corrected(answer), verified]);
  const response = await service.chat("Mẫu này giá bao nhiêu?", [], { companyName: "Test shop" }, {
    visualInput, pricingContextText:
      "Dòng 1: Mã nhóm: ROUND | Nhóm bánh: Bánh tròn | Nội dung báo giá nguyên văn: " + quote + "\n"
      + "Dòng 2: Mã nhóm: RECT | Nhóm bánh: Bánh chữ nhật | Nội dung báo giá nguyên văn: Bánh chữ nhật 500k.",
  });
  assert.equal(response.text, answer);
  assert.doesNotMatch(response.text, /999k|500k/);
  assert.equal(imageRequests(requests).length, 1);
});

test("a later rule review cannot replace the selected image quote with another group's price", async t => {
  const visualInput = await input();
  mockAI(t, [JSON.stringify({ replyDraft: "Giá 200k", visual: result(visualInput.images[0].id) }),
    corrected("Bánh chữ nhật size 25cm giá 500k"), verified]);
  await assert.rejects(service.chat("Mẫu này giá bao nhiêu?", [], { companyName: "Test shop" }, {
    visualInput, pricingContextText: "Dòng 1: Mã nhóm: ROUND | Nhóm bánh: Bánh tròn | Nội dung báo giá nguyên văn: Bánh tròn size 14cm giá 200k.",
  }), /changed the verified image quote/);
});

test("several distinct samples retain the targeted selection question", async t => {
  const visualInput = await input();
  const answer = "Mình chọn mẫu tròn bên trái hay mẫu tim bên phải ạ?";
  mockAI(t, [JSON.stringify({ replyDraft: answer, visual: result(visualInput.images[0].id, {
    needsSelection: true, selectedImageId: "", uncertainties: ["Chưa chọn một trong hai mẫu"],
  }) })]);
  const response = await service.chat("Giá sao?", [], { companyName: "Test shop" }, { visualInput });
  assert.equal(response.text, answer);
  assert.equal(response.visual?.needsSelection, true);
});

test("load failures are described as an inability to open the image, not uncertainty about shape", async t => {
  const answer = "Ảnh chưa mở được, mình gửi lại giúp em nhé";
  const requests = mockAI(t, [answer]);
  const response = await service.chat("Dạ đây", [], { companyName: "Test shop" }, {
    visualInput: { images: [], messageId: "customer", sourceMessageIds: [], failure: "download_failed" },
  });
  assert.equal(response.text, answer);
  assert.equal(imageRequests(requests).length, 0);
  assert.match(JSON.stringify(requests[0]), /Không nói ảnh mờ/);
});

test("backend order wording uses the configured address and keeps exact amounts", async t => {
  const backend = "anh/chị đặt cọc 100.000đ, còn lại 200.000đ nhé";
  const expected = "anh - chị đặt cọc 100.000đ, còn lại 200.000đ nhé";
  const requests = mockAI(t, [corrected(backend), verified]);
  const response = await service.reviewReply("xác nhận chốt đơn", [], { customerAddressStyle: "anh - chị" }, backend, {});
  assert.equal(response.text, expected);
  assert.equal(requests.length, 2);
  assert.equal(imageRequests(requests).length, 0);
});

test("a rule review cannot change a backend deposit or payment URL", async t => {
  mockAI(t, [corrected("Mình chuyển cọc 999.000đ nhé"), verified]);
  await assert.rejects(service.reviewReply("xác nhận", [], { customerAddressStyle: "bạn" },
    "Mình chuyển cọc 100.000đ nhé", {}), /changed verified/);
});
