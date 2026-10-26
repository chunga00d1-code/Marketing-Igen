import { strict as assert } from "node:assert";
import { test } from "node:test";
import { extractChatContact, saveChatLead, summarizeChatConversation } from "../chat-lead.service";
import { CRMTicketModel } from "../../model/crm-ticket.model";
import { CompanyModel } from "../../model/company.model";
import { googleLeadSheetService } from "../google-lead-sheet.service";

const request = { sender: "model" as const, text: "Anh chị cho em xin tên và số điện thoại liên hệ nhé." };

test("captures explicit name and phone after contact request", () => {
  assert.deepEqual(extractChatContact("Anh là Nam, số 0900000000", [request]),
    { name: "Nam", phone: "0900000000" });
});

test("captures name and phone across two customer turns", () => {
  assert.deepEqual(extractChatContact("Số của tôi là 0900000000", [request,
    { sender: "user", text: "Tôi tên là Nguyễn Văn An" },
    { sender: "model", text: "Cảm ơn anh, cho em xin số điện thoại." }]),
    { name: "Nguyễn Văn An", phone: "0900000000" });
});

test("captures a phone without inventing a customer name", () => {
  assert.deepEqual(extractChatContact("Chưa có số đo, cứ trao đổi qua 0900000000 nhé", [request]),
    { name: "", phone: "0900000000" });
});

test("combines unsolicited name and later phone without a bot contact request", () => {
  assert.deepEqual(extractChatContact("SĐT 0900000001", [
    { sender: "user", text: "Tôi tên là TEST Tach Ten." },
    { sender: "model", text: "Nhà mình có mấy tầng?" },
  ]), { name: "TEST Tach Ten", phone: "0900000001" });
});

test("uses the new phone instead of the phone in history", () => {
  assert.deepEqual(extractChatContact("Sửa số điện thoại thành +84 900 000 003", [request,
    { sender: "user", text: "Tôi tên là Nam, số 0900000002" },
  ]), { name: "Nam", phone: "0900000003" });
});

test("keeps needs supplied alongside a phone correction", () => {
  const summary = summarizeChatConversation("Sửa số thành 0900000003. Nhà tôi có hai tầng.", []);
  assert.match(summary, /Nhà tôi có hai tầng/);
  assert.doesNotMatch(summary, /0900000003/);
});

test("allows unnamed chat leads but preserves required names for ordinary CRM tickets", () => {
  const chat = new CRMTicketModel({ companyCode: "TEST", sourceChannel: "test", phone: "0900000000", customerName: "" });
  assert.equal(chat.validateSync(), undefined);
  const manual = new CRMTicketModel({ companyCode: "TEST", phone: "0900000000", customerName: "" });
  assert.ok(manual.validateSync()?.errors.customerName);
});

test("saves phone-only lead then updates its name and phone on the same Sheet key", async t => {
  let stored: Record<string, unknown> | null = null;
  const sheetWrites: Array<{ key: string; name: string; phone: string; summary: string }> = [];
  t.mock.method(CRMTicketModel, "findOne", async () => stored);
  t.mock.method(CRMTicketModel, "findOneAndUpdate", async (filter: Record<string, unknown>, update: {
    $set: Record<string, unknown>; $setOnInsert?: Record<string, unknown>;
  }) => {
    if (filter._id) return stored;
    stored = { _id: "test-lead", ...update.$setOnInsert, ...stored, ...update.$set };
    return stored;
  });
  t.mock.method(CRMTicketModel, "updateOne", async () => ({}));
  t.mock.method(CompanyModel, "findOne", () => ({ select: () => ({ lean: async () => ({
    leadSheetConfig: { enabled: true, spreadsheetId: "test-sheet", sheetName: "Leads" },
  }) }) }));
  t.mock.method(googleLeadSheetService, "upsert", async (_id: string, _tab: string,
    row: typeof sheetWrites[number]) => { sheetWrites.push(row); });
  const base = { companyCode: "TEST", channel: "test" as const, conversationId: "same-conversation", history: [] };
  assert.equal(await saveChatLead({ ...base, message: "Tôi chưa muốn cung cấp liên hệ" }), null);
  assert.equal(await saveChatLead({ ...base, message: "Tôi tên là Nam" }), null);
  assert.equal((await saveChatLead({ ...base, message: "SĐT 0900000000" }))?.sheetSaved, true);
  assert.equal((await saveChatLead({ ...base, message: "Tôi tên là Nam" }))?.sheetSaved, true);
  assert.equal((await saveChatLead({ ...base, message: "Sửa số thành 0900000003. Nhà tôi hai tầng." }))?.sheetSaved, true);
  assert.deepEqual(sheetWrites.map(row => [row.name, row.phone]), [
    ["", "0900000000"], ["Nam", "0900000000"], ["Nam", "0900000003"],
  ]);
  assert.equal(new Set(sheetWrites.map(row => row.key)).size, 1);
  assert.match(sheetWrites[2].summary, /Nhà tôi hai tầng/);
});

test("captures short name and phone reply to a contact request", () => {
  assert.deepEqual(extractChatContact("Nam, 0900000000", [request]),
    { name: "Nam", phone: "0900000000" });
});

test("does not reuse old contact details after the contact request window", () => {
  assert.equal(extractChatContact("Tôi muốn hỏi về màu sơn", [
    { sender: "user", text: "Tôi là Nam, số 0900000000" },
    { sender: "model", text: "Mình đang chọn sơn cho phòng nào?" },
  ]), null);
});

test("summarizes customer needs and recent advice without duplicating the contact reply", () => {
  const summary = summarizeChatConversation("Anh là Nam, số 0900000000", [
    { sender: "user", text: "Tôi muốn sơn nhà mới" },
    { sender: "model", text: "Anh muốn sơn nội thất hay ngoại thất?" },
    { sender: "user", text: "Cả hai, nhà ba tầng" },
    { sender: "model", text: "Có thể chọn dòng sơn phù hợp từng khu vực." },
    request,
  ]);
  assert.match(summary, /sơn nhà mới/);
  assert.match(summary, /Cả hai, nhà ba tầng/);
  assert.match(summary, /Tư vấn gần nhất/);
  assert.doesNotMatch(summary, /0900000000/);
});

test("keeps the bot question beside short customer answers in the summary", () => {
  const summary = summarizeChatConversation("Anh là Nam, số 0900000000", [
    { sender: "user", text: "Tôi muốn sơn nhà" },
    { sender: "model", text: "Anh muốn sơn nội thất hay ngoại thất?" },
    { sender: "user", text: "Cả hai" },
    { sender: "model", text: "Nhà mình có mấy tầng?" },
    { sender: "user", text: "3" },
    request,
  ]);
  assert.match(summary, /nội thất hay ngoại thất\? → Cả hai/);
  assert.match(summary, /mấy tầng\? → 3/);
});
