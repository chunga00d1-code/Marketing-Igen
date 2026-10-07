import assert from "node:assert/strict";
import test from "node:test";
import { buildChatKnowledgeQuery, isSimpleAcknowledgement } from "../chat-context";
import { aiKnowledgeService } from "../ai-knowledge.service";
import { AIKnowledgeChunkModel, AIKnowledgeDocumentModel } from "../../model/ai-knowledge.model";

test("acknowledgements match whole messages, including grouped messages", () => {
  for (const text of ["dạ vâng", "vâng", "dạ", "ok", "oke", "oki", "ok e", "được rồi", "OK em!", "Dạ vâng ạ", "1. dạ\n2. ok e"]) {
    assert.equal(isSimpleAcknowledgement(text), true, text);
  }
  for (const text of ["", "ok, ship bao nhiêu?", "dạ lấy 2 cái", "vâng nhưng bánh có trứng không?", "không được rồi", "1. ok\n2. địa chỉ ở đâu?"]) {
    assert.equal(isSimpleAcknowledgement(text), false, text);
  }
});

test("follow-ups recover customer topic without treating old AI claims as facts", () => {
  const history = [
    { sender: "user", text: "Bánh tiramisu giá sao" },
    { sender: "model", text: "Để em check, chắc khoảng 900k" },
    { sender: "user", text: "ok" },
  ];
  for (const message of ["Check xong chưa", "Thành phần thế nào?", "Kích thước bao nhiêu?", "Loại đó bảo quản thế nào?", "phí ship bao nhiêu?", "Nó có trứng không?", "Có size nhỏ hơn không?"]) {
    const query = buildChatKnowledgeQuery(message, history);
    assert.ok(query.includes("tiramisu"), message);
    assert.ok(query.includes(message), message);
    assert.ok(!query.includes("900k"));
  }
  for (const message of ["Giá cheesecake bao nhiêu?", "Bánh mousse có trứng không?", "Địa chỉ cửa hàng ở đâu?", "ok"]) {
    assert.equal(buildChatKnowledgeQuery(message, history), message);
  }
});

test("retrieval follows the most recent topic and crosses successive follow-ups", () => {
  const history = [
    { sender: "user", text: "Tiramisu giá sao" },
    { sender: "model", text: "400k" },
    { sender: "user", text: "Bánh mousse thành phần là gì?" },
    { sender: "model", text: "Em chưa rõ" },
    { sender: "user", text: "Check xong chưa" },
  ];
  const query = buildChatKnowledgeQuery("Loại đó có trứng không?", history);
  assert.match(query, /mousse/);
  assert.doesNotMatch(query, /Tiramisu/);
  assert.equal(buildChatKnowledgeQuery("Check xong chưa", []), "Check xong chưa");
});

test("shared preparation applies the same scope to knowledge and scenario with conversation context", async (context) => {
  context.mock.method(aiKnowledgeService, "searchRelevantContext", async (input) => {
    assert.equal(input.companyCode, "SHOP");
    assert.equal(input.pageId, "page-1");
    assert.equal(input.channel, "facebook");
    assert.match(input.query, /Tiramisu/);
    assert.equal(input.strictDocumentTypes, true);
    const scenario = input.documentTypes.includes("scenario");
    assert.deepEqual(input.documentTypes, scenario ? ["scenario"] : ["product", "pricing"]);
    if (scenario) {
      assert.match(input.query, /Đã hỏi kích thước/);
      assert.equal(input.maxContextChars, 3500);
    }
    return { contextText: scenario ? "Trả lời câu hỏi trước, sau đó xác nhận số lượng" : "Tiramisu 22cm: 400k",
      matches: 1, bestScore: 1, productCandidateNames: [], shouldAskProductConfirmation: false };
  });
  const input = {
    companyCode: "SHOP", channel: "facebook" as const, pageId: "page-1",
    message: "Check xong chưa", trainingKnowledge: "Xưng em",
    history: [{ sender: "user", text: "Tiramisu giá sao" }, { sender: "model", text: "Đã hỏi kích thước" }],
  };
  const chat = await aiKnowledgeService.prepareChatContext(input);
  const preview = await aiKnowledgeService.prepareChatContext(input);
  assert.deepEqual(chat, preview);
  assert.match(chat.contextText, /400k/);
  assert.match(chat.contextText, /Xưng em/);
  assert.match(chat.scenarioContextText, /xác nhận số lượng/);
});

test("chat selects relevant default sections and combines sections for mixed questions", async (context) => {
  const calls: string[][] = [];
  context.mock.method(aiKnowledgeService, "searchRelevantContext", async (input) => {
    assert.equal(input.strictDocumentTypes, true);
    calls.push(input.documentTypes);
    return { contextText: input.documentTypes.join(","), matches: 1, bestScore: 1,
      productCandidateNames: [], shouldAskProductConfirmation: false };
  });
  for (const [message, expected] of [
    ["Địa chỉ cửa hàng ở đâu?", [["company_profile"], ["scenario"]]],
    ["Đổi trả thế nào?", [["policy"], ["scenario"]]],
    ["Tiramisu giá sao, địa chỉ ở đâu, có giao hàng không?", [["company_profile"], ["policy"], ["product", "pricing"], ["scenario"]]],
  ] as const) {
    calls.length = 0;
    await aiKnowledgeService.prepareChatContext({ companyCode: "SHOP", message });
    assert.deepEqual(calls, expected, message);
  }
});

test("visit and pickup location questions include introduction without dropping other intents", async (context) => {
  const calls: string[][] = [];
  context.mock.method(aiKnowledgeService, "searchRelevantContext", async (input) => {
    calls.push(input.documentTypes);
    assert.equal(input.strictDocumentTypes, true);
    return { contextText: input.documentTypes.join(","), matches: 1, bestScore: 1,
      productCandidateNames: [], shouldAskProductConfirmation: false };
  });
  for (const message of [
    "Chị qua lấy bánh thì đến đâu?", "qua đâu?", "ghé chỗ nào?", "Tới đâu vậy em?",
    "Shop nằm ở đâu?", "Bên em ở đường nào?", "Tiệm ở quận nào?",
    "Lấy bánh ở đâu?", "Nhận hàng tại chỗ nào?", "chi qua lay banh thi den dau?",
    "1. ok\n2. đến đâu lấy bánh?", "Đến đâu lấy bánh, giá bao nhiêu, có giao hàng không?",
  ]) {
    calls.length = 0;
    await aiKnowledgeService.prepareChatContext({ companyCode: "SHOP", message });
    assert.deepEqual(calls[0], ["company_profile"], message);
    assert.ok(calls.some((types) => types.includes("scenario")), message);
    assert.ok(!calls.some((types) => types.includes("general")), message);
    if (message.includes("có giao hàng")) {
      assert.ok(calls.some((types) => types.includes("policy")));
      assert.ok(calls.some((types) => types.includes("pricing")));
    }
  }
  for (const message of ["Sản phẩm này sản xuất ở đâu?", "Sản phẩm này bảo quản ở đâu?", "Tiramisu giá sao?", "Đổi trả thế nào?"]) {
    calls.length = 0;
    await aiKnowledgeService.prepareChatContext({ companyCode: "SHOP", message });
    assert.ok(!calls.some((types) => types.includes("company_profile")), message);
  }
});

test("pickup location retrieves an address from introduction even when product and policy have content", async (context) => {
  const documents = [
    { _id: "profile", sourceTitle: "Giới thiệu", documentType: "company_profile", text: "Cửa hàng ở số 128 Hoa Mai. Giờ mở cửa 8h đến 21h." },
    { _id: "product", sourceTitle: "Sản phẩm/Bảng giá", documentType: "product", text: "Bánh tiramisu 22cm: 400.000đ." },
    { _id: "policy", sourceTitle: "Chính sách", documentType: "policy", text: "Đến lấy bánh: đặt trước ít nhất 2 giờ." },
    { _id: "scenario", sourceTitle: "Kịch bản", documentType: "scenario", text: "Trả lời ngắn gọn theo tài liệu." },
  ];
  context.mock.method(AIKnowledgeDocumentModel, "find", (filter) => {
    assert.equal(filter.companyCode, "SHOP");
    const selected = documents.filter((doc) =>
      (!filter.documentType || filter.documentType.$in.includes(doc.documentType))
      && (!filter._id || filter._id.$in.includes(doc._id)));
    const chain = { select: () => chain, lean: async () => selected };
    return chain;
  });
  context.mock.method(AIKnowledgeChunkModel, "find", (filter) => {
    assert.equal(filter.companyCode, "SHOP");
    assert.deepEqual(filter.channelScope, { $in: ["all", "facebook"] });
    const chunks = documents.filter((doc) => filter.documentId.$in.includes(doc._id)).map((doc) => ({
      _id: `${doc._id}-chunk`, documentId: doc._id, text: doc.text,
      chunkIndex: 0, embedding: Array(96).fill(0), pageScope: "all",
    }));
    const chain = { sort: () => chain, limit: () => chain, lean: async () => chunks };
    return chain;
  });
  const result = await aiKnowledgeService.prepareChatContext({
    companyCode: "SHOP", channel: "facebook", message: "Chị qua lấy bánh thì đến đâu?",
    history: [{ sender: "user", text: "Chị lấy 1 tiramisu 22cm" }],
  });
  assert.match(result.contextText, /128 Hoa Mai/);
  assert.match(result.contextText, /400\.000đ/);
  assert.match(result.contextText, /đặt trước ít nhất 2 giờ/);
  assert.match(result.scenarioContextText, /Trả lời ngắn gọn/);
});

test("legacy documents are a bounded fallback only when default sections return no content", async (context) => {
  const calls: string[][] = [];
  context.mock.method(aiKnowledgeService, "searchRelevantContext", async (input) => {
    calls.push(input.documentTypes);
    const legacy = input.documentTypes.includes("general");
    if (legacy) assert.equal(input.maxContextChars, 4500);
    return { contextText: legacy ? "Giá cũ đã nhập" : "", matches: legacy ? 1 : 0, bestScore: 0,
      productCandidateNames: [], shouldAskProductConfirmation: false };
  });
  const result = await aiKnowledgeService.prepareChatContext({ companyCode: "SHOP", message: "Giá tiramisu" });
  assert.deepEqual(calls[0], ["product", "pricing"]);
  assert.ok(calls[calls.length - 1].includes("general"));
  assert.match(result.contextText, /Giá cũ/);
});

test("strict section retrieval never queries unrelated document types or broad fallback", async (context) => {
  const documentFilters: Record<string, unknown>[] = [];
  context.mock.method(AIKnowledgeDocumentModel, "find", (filter) => {
    documentFilters.push(filter);
    const chain = { select: () => chain, lean: async () => [{ _id: "policy-1", sourceTitle: "Chính sách", documentType: "policy" }] };
    return chain;
  });
  context.mock.method(AIKnowledgeChunkModel, "find", (filter) => {
    assert.deepEqual(filter.documentId, { $in: ["policy-1"] });
    return { sort: () => ({ limit: () => ({ lean: async () => [] }) }) };
  });
  const result = await aiKnowledgeService.searchRelevantContext({
    companyCode: "SHOP", query: "Đổi trả", documentTypes: ["policy"], strictDocumentTypes: true,
  });
  assert.deepEqual(documentFilters[0].documentType, { $in: ["policy"] });
  assert.equal(documentFilters.length, 2);
  assert.equal(result.contextText, "");
});

test("fallback knowledge retains channel and page restrictions", async (context) => {
  context.mock.method(AIKnowledgeDocumentModel, "find", () => {
    const chain = { select: () => chain, sort: () => chain, limit: () => chain, lean: async () => [{ _id: "doc-1", sourceTitle: "Bảng giá", documentType: "pricing" }] };
    return chain;
  });
  const filters: Record<string, unknown>[] = [];
  context.mock.method(AIKnowledgeChunkModel, "find", (filter) => {
    filters.push(filter);
    const chain = { sort: () => chain, limit: () => chain, lean: async () => [] };
    return chain;
  });
  await aiKnowledgeService.searchRelevantContext({ companyCode: "SHOP", channel: "facebook", pageId: "page-1", query: "Tiramisu" });
  assert.equal(filters.length, 2);
  assert.deepEqual(filters[1].$and, filters[0].$and);
  assert.deepEqual(filters[1].channelScope, { $in: ["all", "facebook"] });
  assert.equal(filters[1].companyCode, "SHOP");
});
