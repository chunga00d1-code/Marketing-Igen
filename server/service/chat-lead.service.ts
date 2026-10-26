import { CRMTicketModel } from "../model/crm-ticket.model";

type ChatTurn = { sender: "user" | "model"; text: string };

const phonePattern = /(?:^|[^\d])((?:\+?84|0)[\s.-]?(?:\d[\s.-]?){9,10})(?!\d)/;
const namePattern = /(?:^|[,.!?\n]\s*)(?:tên\s+(?:tôi|mình|em|anh|chị)\s+là|(?:tôi|mình|em|anh|chị)\s+tên\s+là|(?:tôi|mình|em|anh|chị)\s+là|tên\s*[:-]?)\s+([\p{L}]+(?:\s+[\p{L}]+){0,4})/iu;
const shortContactPattern = /^\s*([\p{L}]+(?:\s+[\p{L}]+){0,3})\s*[,;:-]?\s*(?=(?:\+?84|0)\d)/iu;

export function extractChatContact(message: string, history: ChatTurn[]) {
  const recent = [...history, { sender: "user" as const, text: message }].slice(-12);
  let lastRequest = -1;
  recent.forEach((turn, index) => {
    if (turn.sender === "model" && /(?:tên|họ tên)/iu.test(turn.text)
      && /(?:số điện thoại|sđt)/iu.test(turn.text)) lastRequest = index;
  });
  const customerMessages = (lastRequest < 0 ? recent.slice(-1) : recent.slice(lastRequest + 1))
    .filter(turn => turn.sender === "user").map(turn => turn.text);
  const contactText = customerMessages.join("\n");
  const phone = contactText.match(phonePattern)?.[1]?.replace(/[^\d+]/g, "") || "";
  const normalizedPhone = phone.startsWith("+84") ? `0${phone.slice(3)}` : phone.startsWith("84") ? `0${phone.slice(2)}` : phone;
  if (!/^0\d{9}$/.test(normalizedPhone)) return null;

  const name = customerMessages.map(text => (text.match(namePattern)?.[1]
    || (lastRequest >= 0 ? text.match(shortContactPattern)?.[1] : ""))?.trim().replace(/\s+(?:số|sđt)$/iu, "")).find(Boolean);
  if (!name) return null;
  return { name, phone: normalizedPhone };
}

export async function saveChatLead(params: {
  companyCode: string;
  channel: "facebook" | "test";
  conversationId: string;
  message: string;
  history: ChatTurn[];
}) {
  const contact = extractChatContact(params.message, params.history);
  if (!contact) return null;
  const ticket = await CRMTicketModel.findOneAndUpdate({
    companyCode: params.companyCode,
    sourceChannel: params.channel,
    sourceConversationId: params.conversationId,
  }, {
    $set: { customerName: contact.name, phone: contact.phone,
      lastInteraction: params.channel === "test" ? "Khách cung cấp liên hệ trong hội thoại mô phỏng Facebook"
        : "Khách cung cấp liên hệ qua Facebook Messenger" },
    $setOnInsert: { companyCode: params.companyCode, sourceChannel: params.channel,
      sourceConversationId: params.conversationId, status: "cold" },
  }, { upsert: true, new: true });
  return ticket;
}
