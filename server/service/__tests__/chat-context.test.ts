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
  for (const message of ["Check xong chưa", "Thành phần thế nào?", "Kích thước bao nhiêu?", "Loại đó bảo quản thế nào?", "phí ship bao nhiêu?"]) {
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
    assert.equal(input.topK, 8);
    assert.match(input.query, /Tiramisu/);
    return { contextText: "Tiramisu 22cm: 400k", matches: 1 };
  });
  context.mock.method(aiKnowledgeService, "searchScenarioContext", async (input) => {
    assert.equal(input.pageId, "page-1");
    assert.equal(input.companyCode, "SHOP");
    assert.equal(input.topK, 5);
    assert.match(input.query, /Đã hỏi kích thước/);
    return { contextText: "Trả lời câu hỏi trước, sau đó xác nhận số lượng" };
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
