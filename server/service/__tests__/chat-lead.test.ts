import { strict as assert } from "node:assert";
import { test } from "node:test";
import { extractChatContact, summarizeChatConversation } from "../chat-lead.service";

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

test("does not capture a phone without an explicit customer name", () => {
  assert.equal(extractChatContact("Chưa có số đo, cứ trao đổi qua 0900000000 nhé", [request]), null);
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
