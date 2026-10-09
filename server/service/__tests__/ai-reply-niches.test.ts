import assert from "node:assert/strict";
import test from "node:test";
import { extractWebsiteCategoryLinks, findRelevantWebsiteCategoryLink, geminiChatService } from "../gemini/chat.service";
import { aiKnowledgeService } from "../ai-knowledge.service";
import { resolveAiReplyScope } from "../../../src/utils/aiReplyScope";

const cakeKnowledge = "Dòng 2: Tên danh mục trên website: Bé gái | Link danh mục chính xác: https://cakes.example/products?category=be-gai | Từ khóa khách có thể dùng (gợi ý): bé gái; con gái";
const serviceKnowledge = "Dòng 3: Tên dịch vụ: Gói CRM | URL: https://software.example/plans?type=crm&ref=inbox | Từ khóa: CRM; quản lý khách hàng";

test("category links use uploaded names and exact URLs across business niches", () => {
  assert.deepEqual(extractWebsiteCategoryLinks(cakeKnowledge)[0], {
    name: "Bé gái", url: "https://cakes.example/products?category=be-gai", keywords: "bé gái; con gái",
  });
  assert.deepEqual(findRelevantWebsiteCategoryLink("Tư vấn quản lý khách hàng", [], serviceKnowledge), {
    name: "Gói CRM", url: "https://software.example/plans?type=crm&ref=inbox",
  });
  assert.equal(findRelevantWebsiteCategoryLink("Tư vấn CRM", [], cakeKnowledge), undefined);
});

test("a short answer retains the recipient but an unrelated question does not append old links", () => {
  const history = [{ sender: "user", text: "Đặt bánh cho bé gái" }, { sender: "model", text: "Bé bao nhiêu tuổi?" }];
  assert.equal(findRelevantWebsiteCategoryLink("3 tuổi", history, cakeKnowledge)?.url, "https://cakes.example/products?category=be-gai");
  assert.equal(findRelevantWebsiteCategoryLink("Cửa hàng mở lúc mấy giờ?", history, cakeKnowledge), undefined);
});

test("an acknowledgement to a pending link offer retrieves the category for the current page", async context => {
  const calls: Array<{ query: string; topK?: number }> = [];
  context.mock.method(aiKnowledgeService, "searchRelevantContext", async input => {
    calls.push({ query: input.query, topK: input.topK });
    const isCategoryLookup = input.topK === 12;
    return {
      contextText: "",
      items: isCategoryLookup ? [{ title: "Danh mục bánh", text: cakeKnowledge }] : [],
      matches: isCategoryLookup ? 1 : 0,
      bestScore: isCategoryLookup ? 1 : 0,
      productCandidateNames: [],
      shouldAskProductConfirmation: false,
    };
  });

  const result = await aiKnowledgeService.prepareChatContext({
    companyCode: "CAKE", channel: "facebook", pageId: "cake-page", message: "ok",
    history: [
      { sender: "user", text: "Chị muốn xem bánh sinh nhật cho bé gái" },
      { sender: "model", text: "Dạ em gửi link danh mục bé gái nhé" },
    ],
  });

  const categoryLookup = calls.find(call => call.topK === 12);
  assert.ok(categoryLookup, "a pending offer should request category retrieval");
  assert.match(categoryLookup.query, /bánh sinh nhật cho bé gái/);
  assert.match(result.contextText, /https:\/\/cakes\.example\/products\?category=be-gai/);
});

test("birthday and price follow-ups retain the girl's category from customer history", () => {
  const history = [
    { sender: "user", text: "Anh đặt bánh cho bé gái" },
    { sender: "model", text: "Bé bao nhiêu tuổi?" },
    { sender: "user", text: "5 tuổi" },
  ];
  for (const message of ["sinh nhật nhé", "1. 5 tuổi\n2. sinh nhật nhé", "cho anh xin giá"]) {
    assert.equal(findRelevantWebsiteCategoryLink(message, history, cakeKnowledge)?.url, "https://cakes.example/products?category=be-gai", message);
  }
  assert.equal(findRelevantWebsiteCategoryLink("Bánh trái tim", history, cakeKnowledge, true)?.url, "https://cakes.example/products?category=be-gai");
  assert.equal(findRelevantWebsiteCategoryLink("Giá dịch vụ CRM bao nhiêu?", history, cakeKnowledge), undefined);
});

test("occasion-only replies retrieve links from legacy sheets under the same Page scope", async context => {
  let categoryCalls = 0;
  context.mock.method(aiKnowledgeService, "searchRelevantContext", async input => {
    assert.equal(input.companyCode, "SHOP");
    assert.equal(input.pageId, "page-1");
    assert.equal(input.channel, "facebook");
    const category = input.topK === 12;
    if (category) {
      categoryCalls++;
      assert.ok(input.documentTypes.includes("general"));
      assert.match(input.query, /bé gái/);
    }
    return { contextText: category ? "" : "Bánh size 14cm giá 180k", items: category ? [{ title: "Sheet URL cũ", text: cakeKnowledge }] : [],
      matches: 1, bestScore: 1, productCandidateNames: [], shouldAskProductConfirmation: false };
  });
  const result = await aiKnowledgeService.prepareChatContext({ companyCode: "SHOP", channel: "facebook", pageId: "page-1",
    message: "sinh nhật nhé", history: [{ sender: "user", text: "bé gái" }, { sender: "user", text: "5 tuổi" }] });
  assert.equal(categoryCalls, 1);
  assert.match(result.contextText, /https:\/\/cakes.example\/products\?category=be-gai/);
});

test("an explicit resend request can repeat a previously sent category URL", () => {
  const history = [
    { sender: "user", text: "Cho xem mẫu bé gái" },
    { sender: "model", text: "https://cakes.example/products?category=be-gai" },
  ];
  assert.equal(findRelevantWebsiteCategoryLink("3 tuổi", history, cakeKnowledge), undefined);
  assert.equal(findRelevantWebsiteCategoryLink("Gửi lại link", history, cakeKnowledge)?.url, "https://cakes.example/products?category=be-gai");
});

test("configuration scope follows the actual account on every channel", () => {
  for (const channel of ["facebook", "zalo", "tiktok"] as const) {
    const input = { activeChannel: channel, facebookId: "fb-1", zaloId: "oa-2", tiktokId: "tt-3" };
    const selected = resolveAiReplyScope(input);
    assert.equal(selected.accountId, channel === "facebook" ? "fb-1" : channel === "zalo" ? "oa-2" : "tt-3");
    assert.equal(resolveAiReplyScope({ ...input, customer: { channel, pageId: "actual-account" } }).key, `${channel}:actual-account`);
  }
  assert.equal(resolveAiReplyScope({ activeChannel: "all", facebookId: "fb-1" }).key, "facebook:fb-1");
});

test("service, promotion and FAQ knowledge remain available alongside product facts", async context => {
  context.mock.method(aiKnowledgeService, "searchRelevantContext", async input => {
    assert.equal(input.companyCode, "SOFTWARE");
    assert.equal(input.pageId, "software-page");
    assert.equal(input.strictDocumentTypes, true);
    const text = input.documentTypes.includes("service") ? "CRM: triển khai 7 ngày"
      : input.documentTypes.includes("faq") ? "Hướng dẫn kích hoạt tài khoản"
      : input.documentTypes.includes("promotion") ? "Ưu đãi gói năm" : "Thông tin sản phẩm";
    return { contextText: text, matches: 1, bestScore: 1, productCandidateNames: [], shouldAskProductConfirmation: false };
  });
  for (const [message, expected] of [
    ["Tư vấn dịch vụ CRM", /triển khai 7 ngày/],
    ["Ưu đãi gói năm", /Ưu đãi gói năm/],
    ["Hướng dẫn kích hoạt tài khoản", /Hướng dẫn kích hoạt/],
  ] as const) {
    const result = await aiKnowledgeService.prepareChatContext({ companyCode: "SOFTWARE", pageId: "software-page", channel: "facebook", message });
    assert.match(result.contextText, expected);
  }
});

test("links are checked against the Page's scenario before sending and are not reattached", async context => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  context.after(() => { if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = originalKey; });
  let callCount = 0;
  const checkedText = "Quý khách cho biết ngân sách để mình tư vấn gói phù hợp nhé";
  context.mock.method(globalThis, "fetch", async (_url, options) => {
    const request = JSON.parse(String(options?.body));
    assert.equal(request.model, "openai/gpt-6-luna");
    let content: string;
    if (callCount++ === 0) {
      assert.match(request.messages[0].content, /Never assume a business sells physical goods/);
      content = "Mình có gói CRM phù hợp";
    } else {
      const review = JSON.parse(request.messages.at(-1).content);
      assert.match(review.rules, /Chỉ gửi link sau khi biết ngân sách/);
      if (callCount === 2) {
        assert.match(review.customerVisibleResponses[0], /https:\/\/software.example\/plans\?type=crm&ref=inbox/);
        content = JSON.stringify({ compliant: true, correctedParts: [checkedText] });
      } else {
        assert.equal(review.customerVisibleResponses[0], checkedText);
        content = JSON.stringify({ compliant: true });
      }
    }
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  });
  const result = await geminiChatService.chat("Tư vấn CRM", [], {
    companyName: "Phần mềm", model: "openai/gpt-6-luna", customerAddressStyle: "Quý khách",
    customerServiceScript: "Chỉ gửi link sau khi biết ngân sách",
  }, { companyCode: "SOFTWARE", contextText: serviceKnowledge });
  assert.equal(result.text, checkedText);
  assert.equal(callCount, 3);
});
