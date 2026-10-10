import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { GeminiChatService } from "../chat.service";

type RequestBody = { messages: { role: string; content: string }[] };

function mockAI(context: TestContext, outputs: string[]) {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  context.after(() => {
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  });
  const requests: RequestBody[] = [];
  context.mock.method(globalThis, "fetch", async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)) as RequestBody);
    const content = outputs[requests.length - 1];
    assert.notEqual(content, undefined, "Unexpected AI call");
    return new Response(JSON.stringify({
      choices: [{ message: { content } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  return requests;
}

const service = new GeminiChatService();
const baseConfig = { companyName: "Test Shop", model: "deepseek-v4-flash-0731" };
const corrected = (text: string) => JSON.stringify({ compliant: true, correctedParts: [text] });
const verified = JSON.stringify({ compliant: true });

test("image quotes send only the selected group's configured prices", async (context) => {
  const quote = "Bánh trái tim size 14cm cao 7cm giá 180k, size 18cm cao 10cm giá 330k.";
  const reply = `Dạ mẫu này tụi em làm được ạ.\n\n${quote}`;
  const requests = mockAI(context, [JSON.stringify({ groupId: "TIM" })]);
  const result = await service.chat("Giá sao?", [], baseConfig, {
    imageObservation: { status: "ready", description: "Một bánh hình trái tim." },
    contextText: `Dòng 2: Mã nhóm: TRON | Nhóm bánh: Bánh tròn | Nội dung báo giá nguyên văn: Bánh tròn size 5cm giá 65k.\nDòng 3: Mã nhóm: TIM | Nhóm bánh: Bánh trái tim | Nội dung báo giá nguyên văn: ${quote}`,
  });
  assert.equal(result.text, reply);
  assert.equal(requests.length, 1);
  assert.doesNotMatch(result.text, /65k/);
});

test("an unreadable image with a price question returns the complete grouped price list", async (context) => {
  const requests = mockAI(context, []);
  const result = await service.chat("Giá sao?", [], baseConfig, {
    imageObservation: { status: "unavailable", description: "Chưa đọc được ảnh" },
    pricingContextText: "Dòng 2: Mã nhóm: TRON | Nhóm bánh: Bánh tròn | Nội dung báo giá nguyên văn: Bánh tròn 65k.\nDòng 3: Mã nhóm: TIM | Nhóm bánh: Bánh trái tim | Nội dung báo giá nguyên văn: Bánh trái tim 180k.",
  });
  assert.match(result.text, /mẫu này tụi em làm được/);
  assert.match(result.text, /Bánh tròn 65k/);
  assert.match(result.text, /Bánh trái tim 180k/);
  assert.doesNotMatch(result.text, /chưa đọc|gửi lại ảnh/);
  assert.equal(requests.length, 0);
});

test("an image without a price question only confirms the sample can be made", async (context) => {
  const requests = mockAI(context, []);
  const result = await service.chat("Mẫu này shop làm được không?", [], baseConfig, {
    imageObservation: { status: "ready", description: "Một bánh hình tròn" },
  });
  assert.equal(result.text, "Dạ mẫu này tụi em làm được ạ");
  assert.equal(requests.length, 0);
});

test("ambiguous images and unknown group IDs return every configured price group", async (context) => {
  mockAI(context, [JSON.stringify({ groupId: "UNKNOWN" })]);
  const result = await service.chat("Bao nhiêu?", [], baseConfig, {
    imageObservation: { status: "ready", description: "Chưa rõ hình dạng." },
    pricingContextText: "Dòng 2: Mã nhóm: TRON | Nhóm bánh: Bánh tròn | Nội dung báo giá nguyên văn: Bánh tròn size 5cm giá 65k.",
  });
  assert.match(result.text, /Bánh tròn size 5cm giá 65k/);
  assert.doesNotMatch(result.text, /cho em biết loại sản phẩm/);
});

test("a round cake with an uncertain price group receives the full price list", async (context) => {
  mockAI(context, [JSON.stringify({ groupId: "UNKNOWN" })]);
  const result = await service.chat("Giá sao?", [], baseConfig, {
    imageObservation: { status: "ready", description: "Một bánh kem hình tròn, trang trí màu hồng." },
    pricingContextText: "Dòng 2: Mã nhóm: TIM | Nhóm bánh: Bánh trái tim | Nội dung báo giá nguyên văn: Bánh trái tim 180k.",
  });
  assert.match(result.text, /mẫu này tụi em làm được/);
  assert.match(result.text, /Bánh trái tim 180k/);
  assert.doesNotMatch(result.text, /hình dạng sản phẩm|chưa xác định/);
});

test("image quotes ignore old price lists in conversation history", async (context) => {
  const wrong = "Bánh trái tim 180k. Bánh tròn 65k.";
  mockAI(context, [JSON.stringify({ groupId: "TIM" })]);
  const result = await service.chat("Giá sao?", [{ sender: "model", text: wrong }], baseConfig, {
    imageObservation: { status: "ready", description: "Bánh trái tim" },
    contextText: "Dòng 2: Mã nhóm: TIM | Nhóm bánh: Bánh trái tim | Nội dung báo giá nguyên văn: Bánh trái tim 180k.\nDòng 3: Mã nhóm: TRON | Nhóm bánh: Bánh tròn | Nội dung báo giá nguyên văn: Bánh tròn 65k.",
  });
  assert.match(result.text, /Bánh trái tim 180k/);
  assert.doesNotMatch(result.text, /Bánh tròn 65k/);
});

test("chat combines knowledge and configured scenarios without losing either workflow", async (context) => {
  const requests = mockAI(context, ["Dạ chị ạ", corrected("Dạ chị ạ"), verified]);
  await service.chat("Tí chị xuống lấy", [{ sender: "user", text: "Chị lấy 1 bánh 22cm" }], {
    ...baseConfig, customerServiceScript: "Khi đến lấy hướng dẫn vào cửa bên trái",
  }, { contextText: "Giờ mở cửa 8h đến 21h", scenarioContextText: "Ghi nhận khách đến lấy, không hỏi lại số lượng" });
  const prompt = requests[0].messages[0].content;
  assert.match(prompt, /Khi đến lấy hướng dẫn vào cửa bên trái/);
  assert.match(prompt, /Ghi nhận khách đến lấy, không hỏi lại số lượng/);
  assert.match(prompt, /không chứng minh đơn cụ thể đã được chuẩn bị/);
  assert.match(prompt, /Không hỏi lại sản phẩm, kích thước hoặc số lượng khách đã nói rõ/);
});

test("simple acknowledgements return exactly the fixed reply despite scenario and style settings", async (context) => {
  const requests = mockAI(context, []);
  for (const message of ["dạ vâng", "vâng", "dạ", "ok", "oke", "oki", "ok e", "được rồi", "1. dạ\n2. ok"]) {
    const result = await service.chat(message, [{ sender: "ai", text: "Anh chị lấy mấy cái?" }], {
      ...baseConfig, advancedInstructions: "Luôn hỏi thêm một câu", customerAddressStyle: "chị",
      customerServiceScript: "Sau khi xác nhận hãy xin số điện thoại",
    });
    assert.equal(result.text, "dạ vâng ạ");
  }
  assert.equal(requests.length, 0);
});

test("acknowledgements containing a question still use knowledge and retain conversation", async (context) => {
  const requests = mockAI(context, ["Dạ phí ship 30k ạ", corrected("Dạ phí ship 30k ạ"), verified]);
  const result = await service.chat("ok, ship bao nhiêu?", [
    { sender: "user", text: "Tôi muốn mua bánh tiramisu" },
    { sender: "ai", text: "Để em check" },
  ], baseConfig, { contextText: "Phí ship 30k", scenarioContextText: "Khách đã chọn bánh, trả lời câu hỏi rồi xác nhận số lượng" });
  assert.equal(result.text, "Dạ phí ship 30k ạ");
  const prompt = requests[0].messages[0].content;
  assert.match(prompt, /Phí ship 30k/);
  assert.match(prompt, /Khách đã chọn bánh/);
  assert.match(prompt, /câu trả lời cũ của trợ lý không phải nguồn sự thật/);
  assert.match(prompt, /chỉ trả lời chính xác: dạ vâng ạ/);
  assert.ok(requests[0].messages.some((message) => message.content === "Tôi muốn mua bánh tiramisu"));
});

test("blank settings keep the default prompt without running a review when no company knowledge is available", async (context) => {
  const requests = mockAI(context, ["dạ anh chị cần mẫu nào?"]);
  const result = await service.chat("Tư vấn giúp tôi", [], {
    ...baseConfig, advancedInstructions: "  ", customerAddressStyle: "\n",
  });
  assert.equal(result.text, "dạ anh chị cần mẫu nào?");
  assert.equal(requests.length, 1);
  const prompt = requests[0].messages.find((message) => message.role === "system")?.content || "";
  assert.match(prompt, /Mặc định gọi khách là "anh chị"/);
  assert.match(prompt, /Không đặt dấu chấm/);
  assert.doesNotMatch(prompt, /Cách gọi khách bắt buộc:/);
});

test("address-only settings trigger correction and final verification", async (context) => {
  const requests = mockAI(context, ["Quý khách cần gì?", corrected("chị cần mẫu nào?"), verified]);
  const result = await service.chat("Tư vấn giúp tôi", [], { ...baseConfig, customerAddressStyle: " chị " });
  assert.equal(result.text, "chị cần mẫu nào?");
  assert.equal(requests.length, 3);
  assert.match(requests[0].messages[0].content, /Cách gọi khách bắt buộc: “chị”/);
  assert.doesNotMatch(requests[0].messages[0].content, /Có vô tình dùng "Anh\/Chị" thay vì "anh chị" không/);
  assert.match(JSON.stringify(requests[1]), /chị/);
  assert.match(JSON.stringify(requests[2]), /chị cần mẫu nào/);
});

test("rule-only settings can override default address and punctuation", async (context) => {
  const rule = "Xưng tôi, gọi khách là bạn. Kết thúc bằng dấu chấm.";
  const requests = mockAI(context, ["em hỗ trợ anh chị nhé", corrected("Tôi hỗ trợ bạn."), verified]);
  const result = await service.chat("Tư vấn giúp tôi", [], { ...baseConfig, advancedInstructions: rule });
  assert.equal(result.text, "Tôi hỗ trợ bạn.");
  assert.match(requests[0].messages[0].content, /Nếu rule có chỉ dẫn cách gọi khách thì tuân theo rule/);
  assert.ok(JSON.stringify(requests[1]).includes(rule));
});

test("explicit address priority is shared by generation and review", async (context) => {
  const requests = mockAI(context, ["bạn cần gì?", corrected("chị cần gì?"), verified]);
  const result = await service.chat("Tư vấn giúp tôi", [], {
    ...baseConfig, customerAddressStyle: "chị", advancedInstructions: "Gọi khách là bạn",
  });
  assert.equal(result.text, "chị cần gì?");
  assert.match(requests[0].messages[0].content, /Ưu tiên ô cấu hình này nếu rule/);
  assert.match(requests[1].messages[0].content, /explicit customer address setting overrides/);
});

test("failed final verification blocks the response", async (context) => {
  mockAI(context, ["bạn cần gì?", corrected("bạn cần gì?"), JSON.stringify({ compliant: false })]);
  await assert.rejects(
    service.chat("Tư vấn giúp tôi", [], { ...baseConfig, customerAddressStyle: "chị" }),
    /could not confirm a compliant reply/,
  );
});

test("the final independent review can approve a valid correction after an uncertain first review", async (context) => {
  const expected = "chị cần mẫu nào ạ?";
  const requests = mockAI(context, [
    "bạn cần gì?",
    JSON.stringify({ compliant: false, correctedParts: [expected] }),
    verified,
  ]);

  const result = await service.chat("Tư vấn giúp tôi", [], { ...baseConfig, customerAddressStyle: "chị" });

  assert.equal(result.text, expected);
  assert.equal(requests.length, 3);
});

test("empty corrected output cannot bypass review via a fallback reply", async (context) => {
  const requests = mockAI(context, ["bạn cần gì?", corrected(" ")]);
  await assert.rejects(
    service.chat("Tư vấn giúp tôi", [], { ...baseConfig, customerAddressStyle: "chị" }),
    /could not produce a valid corrected reply/,
  );
  assert.equal(requests.length, 2);
});

test("chat preserves a scenario product URL and makes markdown-escaped schemes clickable", async (context) => {
  const escapedUrl = "https\\://vibarycake.com/products?category=banh-sinh-nhat";
  const candidate = `Dạ chị xem mẫu tại ${escapedUrl} nha`;
  const requests = mockAI(context, [candidate, corrected("Dạ chị xem mẫu tại https://vibarycake.com/products?category=banh-sinh-nhat nha"), verified]);

  const result = await service.chat("Chị muốn đặt một bánh sinh nhật", [], baseConfig, {
    contextText: "Các mẫu bánh sinh nhật theo yêu cầu",
    scenarioContextText: `Nếu khách chưa có mẫu, bắt buộc gửi ${escapedUrl}`,
  });

  assert.equal(result.text, "Dạ chị xem mẫu tại https://vibarycake.com/products?category=banh-sinh-nhat nha");
  const prompt = requests[0].messages[0].content;
  assert.match(prompt, /phải chép nguyên vẹn URL đầy đủ/);
  assert.match(prompt, /khách đã có mẫu thì không gửi link/);
});

test("an acknowledgement to a pending category-link offer sends the exact matching URL", async (context) => {
  const url = "https://cakes.example/products?category=be-gai";
  const knowledge = `Dòng 2: Tên danh mục trên website: Bé gái | Link danh mục chính xác: ${url} | Từ khóa khách có thể dùng: bé gái; con gái`;
  const history = [
    { sender: "user", text: "Chị muốn xem bánh sinh nhật cho bé gái" },
    { sender: "model", text: "Dạ em gửi chị link danh mục mẫu bé gái nhé" },
  ];
  const expected = `Dạ em gửi chị nhé\n\nTham khảo Bé gái tại đây:\n${url}`;
  const requests = mockAI(context, ["Dạ em gửi chị nhé", corrected(expected), verified]);

  const result = await service.chat("Ok", history, baseConfig, { contextText: knowledge });

  assert.equal(result.text, expected);
  const reviewPayload = JSON.parse(requests[1].messages.at(-1)?.content || "{}");
  assert.equal(reviewPayload.companyKnowledge, knowledge);
  assert.match(reviewPayload.customerVisibleResponses[0], new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(JSON.stringify(requests[0].messages), /Chị muốn xem bánh sinh nhật cho bé gái/);
});

test("fact review corrects unsupported prices and setup fees from company knowledge", async (context) => {
  const knowledge = "Gói CRM: 1.200.000đ/tháng. Phí setup: 500.000đ.";
  const incorrect = "Gói CRM chỉ 900.000đ/tháng và miễn phí setup";
  const correctedReply = "Gói CRM là 1.200.000đ/tháng, phí setup 500.000đ";
  const requests = mockAI(context, [incorrect, corrected(correctedReply), verified]);

  const result = await service.chat("Gói CRM giá bao nhiêu, phí setup thế nào?", [], baseConfig, { contextText: knowledge });

  assert.equal(result.text, correctedReply);
  const reviewPayload = JSON.parse(requests[1].messages.at(-1)?.content || "{}");
  assert.equal(reviewPayload.companyKnowledge, knowledge);
  assert.match(requests[1].messages[0].content, /Use companyKnowledge and explicit factual statements in configured business rules or scenarios/);
  assert.match(JSON.stringify(reviewPayload.customerVisibleResponses), /900\.000đ/);
});

test("changing the gift recipient keeps the confirmed occasion and supersedes the old recipient", async (context) => {
  const history = [
    { sender: "user", text: "Sinh nhật nha bé" },
    { sender: "model", text: "Dạ bé nhà mình là trai hay gái ạ, bao nhiêu tuổi rồi ạ?" },
    { sender: "user", text: "Bé gái 3 tuổi" },
    { sender: "model", text: "Bé thích nhân vật gì để em gửi mẫu nha?" },
  ];
  const response = "Dạ mình đổi người nhận sang chồng chị, dịp sinh nhật vẫn giữ nguyên nha. Chị thích mẫu bánh phong cách nào ạ?";
  const requests = mockAI(context, [response]);

  const result = await service.chat("Chị đặt cho chồng", history, baseConfig);

  assert.equal(result.text, response);
  const generationPrompt = requests[0].messages[0].content;
  assert.match(generationPrompt, /A change to the recipient/);
  assert.match(generationPrompt, /Keep the occasion and other confirmed details/);
  assert.match(generationPrompt, /Do not ask again for details already confirmed/);
  assert.ok(requests[0].messages.some((message) => message.content === "Sinh nhật nha bé"));
});
