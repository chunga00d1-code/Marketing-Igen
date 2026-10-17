import assert from "node:assert/strict";
import test from "node:test";
import { analyzeChatImages, extractImageQuoteRows, getChatImageUrls, matchesObservedCakeShape, selectImageQuote, splitHistoryAndPendingInboundMessages } from "../chat-image-context";

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
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ readable: true, needsSelection: false,
      productType: "cake", cakeShape: "heart", shapeConfidence: "high", bodyOutline: "Thân có hai thùy, khe lõm và đầu nhọn", description: "Bánh hình trái tim" }) } }] }), {
      headers: { "content-type": "application/json" },
    });
  });
  const observation = await analyzeChatImages(["https://scontent.xx.fbcdn.net/cake.jpg"]);
  assert.equal(observation?.cakeShape, "heart");
  assert.equal(observation?.selectedImageUrl, "https://scontent.xx.fbcdn.net/cake.jpg");
  assert.equal(modelCalls, 1);
});

test("expired attachments never call the model without image bytes", async (context) => {
  let calls = 0;
  context.mock.method(globalThis, "fetch", async () => { calls++; return new Response("expired", { status: 403 }); });
  assert.equal((await analyzeChatImages(["https://scontent.xx.fbcdn.net/expired.jpg"]))?.status, "unavailable");
  assert.equal(calls, 1);
});

test("the legacy image reader cannot fall back to a text model when its vision request fails", async context => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  context.after(() => { if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previousKey; });
  const models: string[] = [];
  context.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).includes("fbcdn.net")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
    models.push(JSON.parse(String(init?.body)).model);
    return new Response("Vision request rejected", { status: 400 });
  });
  const result = await analyzeChatImages(["https://scontent.fbcdn.net/cake.jpg"]);
  assert.equal(result?.reason, "analysis_failed");
  assert.equal(models.length, 1);
});

test("the legacy price shape check also stops before a text fallback", async context => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  context.after(() => { if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previousKey; });
  const models: string[] = [];
  context.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).includes("fbcdn.net")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
    models.push(JSON.parse(String(init?.body)).model);
    if (models.length > 1) return new Response("Vision request rejected", { status: 400 });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      readable: true, needsSelection: false, productType: "cake", cakeShape: "round", shapeConfidence: "high", description: "Bánh tròn trắng",
    }) } }] }), { headers: { "content-type": "application/json" } });
  });
  const result = await analyzeChatImages(["https://scontent.fbcdn.net/cake.jpg"], "Giá bao nhiêu?");
  assert.equal(result?.reason, "analysis_failed");
  assert.equal(models.length, 2);
  assert.equal(new Set(models).size, 1);
});

test("a positional answer reuses only the screenshot awaiting selection", () => {
  const history = [
    { direction: "inbound", text: "", attachments: [{ type: "image", url: "https://scontent.xx.fbcdn.net/screen.png" }] },
    { direction: "outbound", text: "Ảnh có nhiều mẫu: bánh chữ nhật bên trái và hai bánh tròn." },
    { direction: "outbound", text: "Mình muốn hỏi mẫu nào trong ảnh ạ?" },
  ];
  assert.deepEqual(splitHistoryAndPendingInboundMessages([...history, { direction: "inbound", text: "cái bên trái nhé" }]).imageUrls, ["https://scontent.xx.fbcdn.net/screen.png"]);
  assert.deepEqual(splitHistoryAndPendingInboundMessages([...history, { direction: "inbound", text: "Địa chỉ shop ở đâu?" }]).imageUrls, []);
  assert.deepEqual(splitHistoryAndPendingInboundMessages([
    ...history, { direction: "inbound", text: "cái bên trái", attachments: [{ type: "image", url: "https://scontent.xx.fbcdn.net/new.png" }] },
  ]).imageUrls, ["https://scontent.xx.fbcdn.net/new.png"]);
});

test("a price follow-up retains the last customer photo across the shop acknowledgement", () => {
  const history = [
    { direction: "inbound", text: "", attachments: [{ type: "image", url: "https://scontent.xx.fbcdn.net/round-cake.jpg" }] },
    { direction: "outbound", text: "Dạ mẫu này tụi em làm được ạ" },
  ];
  for (const text of ["vậy mẫu gửi này giá bao nhiêu ạ", "giá bao nhiêu", "báo giá bánh này nhé"]) {
    assert.deepEqual(splitHistoryAndPendingInboundMessages([...history, { direction: "inbound", text }]).imageUrls,
      ["https://scontent.xx.fbcdn.net/round-cake.jpg"]);
  }
  for (const text of ["mẫu khác giá bao nhiêu", "bánh chữ nhật giá bao nhiêu", "shop ở đâu?"]) {
    assert.deepEqual(splitHistoryAndPendingInboundMessages([...history, { direction: "inbound", text }]).imageUrls, []);
  }
  assert.deepEqual(splitHistoryAndPendingInboundMessages([...history,
    { direction: "inbound", text: "tôi muốn hỏi việc khác" }, { direction: "outbound", text: "Bạn hỏi nhé" },
    { direction: "inbound", text: "giá bao nhiêu" }]).imageUrls, []);
});

test("a clear round body on a rectangular board has structured shape data and cannot select the rectangular quote", async t => {
  const prior = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  t.after(() => { if (prior === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = prior; });
  let classificationCalls = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).includes("fbcdn.net")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } });
    const body = JSON.parse(String(init?.body));
    const hasImage = JSON.stringify(body.messages).includes("data:image/jpeg");
    if (hasImage) return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      readable: true, needsSelection: false, productType: "cake", cakeShape: "round", shapeConfidence: "high",
      bodyOutline: "Đường viền thân tròn, không có khe lõm",
      description: "Thân bánh tròn bo phồng màu vàng, nơ đỏ, đồng xu trên mặt. Tấm đế hình chữ nhật.",
    }) } }] }));
    classificationCalls++;
    const sent = JSON.stringify(body.messages);
    assert.match(sent, /ROUND/); assert.doesNotMatch(sent, /RECTANGLE/);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ groupId: "RECTANGLE" }) } }] }));
  });
  const observation = await analyzeChatImages(["https://scontent.xx.fbcdn.net/round-cake.jpg"]);
  assert.equal(observation?.cakeShape, "round"); assert.equal(observation?.shapeConfidence, "high");
  const knowledge = "Dòng 2: Mã nhóm: ROUND | Nhóm bánh: Bánh tròn | Nội dung báo giá nguyên văn: Size 10cm giá 100k.\n"
    + "Dòng 3: Mã nhóm: RECTANGLE | Nhóm bánh: Bánh chữ nhật | Nội dung báo giá nguyên văn: Size 25x35cm giá 500k.";
  assert.equal((await selectImageQuote(knowledge, observation!, "mẫu này bao nhiêu"))?.id, "ROUND");
  assert.equal(classificationCalls, 0);
  const ambiguousRoundRows = `${knowledge}\nDòng 4: Mã nhóm: ROUND_ALT | Nhóm bánh: Bánh tròn khác | Nội dung báo giá nguyên văn: Size 14cm giá 180k.`;
  assert.equal(await selectImageQuote(ambiguousRoundRows, observation!, "mẫu này bao nhiêu"), null);
  assert.equal(classificationCalls, 1);
  assert.equal(matchesObservedCakeShape("Bánh chữ nhật", "round"), false);
});

test("repeated uploads with different URLs analyze one sample and select its exact image", async t => {
  const prior = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  t.after(() => { if (prior === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = prior; });
  let modelCalls = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).includes("fbcdn.net")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } });
    modelCalls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.messages.flatMap((m: { content: unknown }) => Array.isArray(m.content) ? m.content : [])
      .filter((part: { type: string }) => part.type === "image_url").length, 1);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ readable: true, needsSelection: false,
      productType: "cake", cakeShape: "heart", shapeConfidence: "high", description: "Một bánh trái tim, hai ảnh lặp",
      bodyOutline: "Hai thùy và khe lõm thuộc đường viền thân, đầu nhọn phía trước" }) } }] }));
  });
  const observation = await analyzeChatImages(["https://scontent.xx.fbcdn.net/first.jpg", "https://scontent.xx.fbcdn.net/repeated.jpg"], "bánh này thì sao nhỉ");
  assert.equal(observation?.status, "ready");
  assert.equal(observation?.cakeShape, "heart");
  assert.equal(observation?.selectedImageUrl, "https://scontent.xx.fbcdn.net/repeated.jpg");
  assert.equal(modelCalls, 1);
});

test("two independent visual passes must agree before a cake shape can be priced", async t => {
  const prior = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  t.after(() => { if (prior === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = prior; });
  let modelCalls = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).includes("fbcdn.net")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } });
    modelCalls++;
    const body = JSON.parse(String(init?.body));
    assert.match(JSON.stringify(body.messages), /data:image\/jpeg/);
    if (modelCalls === 2) assert.doesNotMatch(JSON.stringify(body.messages), /đơn cũ|giá 100k|khách hỏi bánh tròn/);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(modelCalls === 1
      ? { readable: true, needsSelection: false, productType: "cake", cakeShape: "round", shapeConfidence: "high", description: "Thân tròn" }
      : { cakeShape: "heart", shapeConfidence: "high", bodyOutline: "Hai thùy, khe lõm, đầu nhọn" }) } }] }));
  });
  const observation = await analyzeChatImages(["https://scontent.xx.fbcdn.net/heart.jpg"], "khách hỏi bánh tròn giá 100k");
  assert.equal(observation?.status, "unavailable");
  assert.equal(observation?.reason, "uncertain_shape");
  assert.equal(observation?.cakeShape, "unknown");
  assert.equal(await selectImageQuote("", observation!, "giá sao"), null);
});

test("different cake photos require selection and the positional follow-up recovers all photos", async t => {
  const prior = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  t.after(() => { if (prior === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = prior; });
  const urls = ["https://scontent.xx.fbcdn.net/one.jpg", "https://scontent.xx.fbcdn.net/two.jpg"];
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("fbcdn.net")) return new Response(new Uint8Array([String(url).includes("one.jpg") ? 1 : 2]), { headers: { "Content-Type": "image/jpeg" } });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ readable: true, needsSelection: true,
      productType: "cake", description: "Một bánh tròn và một bánh trái tim" }) } }] }));
  });
  assert.equal((await analyzeChatImages(urls))?.status, "needs_selection");
  const result = splitHistoryAndPendingInboundMessages([
    { direction: "inbound", text: "", attachments: [{ type: "image", url: urls[0] }] },
    { direction: "inbound", text: "", attachments: [{ type: "image", url: urls[1] }] },
    { direction: "outbound", text: "Ảnh có nhiều mẫu: một bánh tròn và một bánh trái tim. Mình chọn mẫu nào?" },
    { direction: "inbound", text: "thứ hai" },
  ]);
  assert.deepEqual(result.imageUrls, urls);
});

test("uncertain cake shape asks for clarification and does not trigger quote selection", async t => {
  const prior = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  t.after(() => { if (prior === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = prior; });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    calls++;
    if (String(url).includes("fbcdn.net")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ readable: true, needsSelection: false,
      productType: "cake", cakeShape: "unknown", shapeConfidence: "low", description: "Chỉ thấy hộp bánh." }) } }] }));
  });
  const observation = await analyzeChatImages(["https://scontent.xx.fbcdn.net/unclear.jpg"]);
  assert.equal(observation?.status, "unavailable");
  assert.equal(await selectImageQuote("Dòng 2: Mã nhóm: RECTANGLE | Nhóm bánh: Bánh chữ nhật | Nội dung báo giá nguyên văn: 500k", observation!, "giá bao nhiêu"), null);
  assert.equal(calls, 2);
});

test("live synthetic cake silhouettes are recognized from actual image bytes", { skip: process.env.CAKE_LIVE_IMAGE_TEST !== "1", timeout: 600000 }, async t => {
  assert.ok(process.env.OPENROUTER_API_KEY, "Live image verification needs the configured provider key");
  const { default: sharp } = await import("sharp");
  const liveFetch = globalThis.fetch;
  const shapes = [
    { name: "heart", svg: '<path d="M260 155 C160 45 65 150 125 235 L260 355 L395 235 C455 150 360 45 260 155 Z" fill="#fff4f4" stroke="#ae3440" stroke-width="18"/>' },
    { name: "round", svg: '<ellipse cx="260" cy="225" rx="145" ry="125" fill="#fff4f4" stroke="#ae3440" stroke-width="18"/>' },
    { name: "square", svg: '<rect x="145" y="110" width="230" height="230" rx="5" fill="#fff4f4" stroke="#ae3440" stroke-width="18"/>' },
    { name: "rectangle", svg: '<rect x="100" y="145" width="320" height="160" rx="5" fill="#fff4f4" stroke="#ae3440" stroke-width="18"/>' },
  ];
  const fixtures = new Map<string, Buffer>();
  for (const shape of shapes) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="470"><rect width="520" height="470" fill="#d6f0ed"/><rect x="35" y="45" width="450" height="365" rx="10" fill="#fff"/>${shape.svg}<text x="200" y="220" font-size="20" fill="#84212b">Happy birthday</text></svg>`;
    fixtures.set(`https://res.cloudinary.com/synthetic-fixture/image/upload/${shape.name}.png`, await sharp(Buffer.from(svg)).png().toBuffer());
  }
  t.mock.method(globalThis, "fetch", (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const fixture = fixtures.get(url);
    if (fixture) return Promise.resolve(new Response(new Uint8Array(fixture), { headers: { "Content-Type": "image/png" } }));
    assert.equal(new URL(url).hostname, "openrouter.ai", "Only synthetic fixtures may be sent to the configured AI provider");
    return liveFetch(input, init);
  });
  const failures: string[] = [];
  for (const shape of shapes.filter(shape => !process.env.CAKE_LIVE_IMAGE_SHAPE || shape.name === process.env.CAKE_LIVE_IMAGE_SHAPE)) {
    const url = `https://res.cloudinary.com/synthetic-fixture/image/upload/${shape.name}.png`;
    const observation = await analyzeChatImages([url], "bánh này thì sao nhỉ");
    console.log("LIVE_IMAGE_SHAPE", JSON.stringify({ expected: shape.name, observation }));
    if (observation?.status !== "ready" || observation.cakeShape !== shape.name) failures.push(shape.name);
  }
  assert.deepEqual(failures, []);
});
