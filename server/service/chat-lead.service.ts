import { CRMTicketModel } from "../model/crm-ticket.model";
import { ICRMTicket } from "../interface/crm-ticket.interface";
import { CompanyModel } from "../model/company.model";
import { googleLeadSheetService } from "./google-lead-sheet.service";
import { randomUUID } from "node:crypto";

type ChatTurn = { sender: "user" | "model"; text: string };

const phonePattern = /(?:^|[^\d])((?:\+?84|0)[\s.-]?(?:\d[\s.-]?){9,10})(?!\d)/;
const namePattern = /(?:^|[,.!?\n]\s*)(?:tên\s+(?:tôi|mình|em|anh|chị)\s+là|(?:tôi|mình|em|anh|chị)\s+tên\s+là|(?:tôi|mình|em|anh|chị)\s+là|tên\s*[:-]?)\s+([\p{L}]+(?:\s+[\p{L}]+){0,4})/iu;
const shortContactPattern = /^\s*([\p{L}]+(?:\s+[\p{L}]+){0,3})\s*[,;:-]?\s*(?=(?:\+?84|0)\d)/iu;

export function extractChatContact(message: string, history: ChatTurn[]) {
  const recent = [...history, { sender: "user" as const, text: message }].slice(-12);
  const contactRequested = history.some(turn => turn.sender === "model"
    && /(?:tên|họ tên|số điện thoại|sđt)/iu.test(turn.text));
  const readName = (text: string) => (text.match(namePattern)?.[1]
    || (contactRequested && !/^\s*(?:số|sđt|điện thoại|phone|liên hệ)(?:\s|:)/iu.test(text)
      ? text.match(shortContactPattern)?.[1] : ""))?.trim()
    .replace(/\s+(?:số|sđt)$/iu, "") || "";
  const phone = [...message.matchAll(new RegExp(phonePattern.source, "g"))].at(-1)?.[1]
    ?.replace(/[^\d+]/g, "") || "";
  const normalizedPhone = phone.startsWith("+84") ? `0${phone.slice(3)}` : phone.startsWith("84") ? `0${phone.slice(2)}` : phone;
  const validPhone = /^0\d{9}$/.test(normalizedPhone) ? normalizedPhone : "";
  const currentName = readName(message);
  if (!validPhone && !currentName) return null;
  const name = currentName || (validPhone ? recent.filter(turn => turn.sender === "user")
    .reverse().map(turn => readName(turn.text)).find(Boolean) : "") || "";
  return { name, phone: validPhone };
}

export function summarizeChatConversation(message: string, history: ChatTurn[]) {
  const turns = [...history, { sender: "user" as const, text: message }];
  const details: string[] = [];
  turns.forEach((turn, index) => {
    if (turn.sender !== "user") return;
    const text = turn.text.replace(new RegExp(phonePattern.source, "g"), match =>
      /^\d|^\+/.test(match) ? "" : match[0]).replace(/\s+/g, " ").trim();
    if (!text) return;
    const previousBot = [...turns.slice(0, index)].reverse().find(item => item.sender === "model")?.text || "";
    const question = previousBot.match(/[^.!?]*\?/g)?.at(-1)?.replace(/\s+/g, " ").trim();
    const detail = text.length <= 20 && question ? `${question} → ${text}` : text;
    if (!details.includes(detail)) details.push(detail);
  });
  const selected = details.slice(-7);
  const lastAdvice = [...history].reverse().find(turn => turn.sender === "model"
    && !/(?:tên|họ tên).*(?:số điện thoại|sđt)/iu.test(turn.text))?.text.replace(/\s+/g, " ").trim();
  return [selected.length ? `Nhu cầu và diễn biến: ${selected.join("; ")}` : "Khách đã cung cấp thông tin liên hệ.",
    lastAdvice ? `Tư vấn gần nhất: ${lastAdvice}` : ""].filter(Boolean).join(". ").slice(0, 1500);
}

async function syncLeadSheet(ticket: ICRMTicket | null, unchanged: boolean) {
  if (!ticket) return { sheetEnabled: false, sheetSaved: false, sheetError: "" };
  const company = await CompanyModel.findOne({ code: ticket.companyCode }).select("leadSheetConfig").lean();
  const config = company?.leadSheetConfig;
  if (!config?.enabled || !config.spreadsheetId) return { sheetEnabled: false, sheetSaved: false, sheetError: "" };
  if (unchanged && ticket.leadSheetStatus === "synced" && ticket.leadSheetSyncedAt
    && ticket.leadSheetSyncedAt >= (config.updatedAt || new Date(0))) {
    return { sheetEnabled: true, sheetSaved: true, sheetError: "" };
  }
  const leaseId = randomUUID();
  const now = new Date();
  const claimed = await CRMTicketModel.findOneAndUpdate({ _id: ticket._id,
    $or: [{ leadSheetLeaseUntil: { $exists: false } }, { leadSheetLeaseUntil: { $lt: now } }],
  }, { $set: { leadSheetStatus: "syncing", leadSheetLeaseId: leaseId,
    leadSheetLeaseUntil: new Date(now.getTime() + 120_000) } }, { new: true });
  if (!claimed) return { sheetEnabled: true, sheetSaved: false, sheetError: "Đang đồng bộ lead vào Sheet." };
  try {
    await googleLeadSheetService.upsert(config.spreadsheetId, config.sheetName, {
      key: `${ticket.companyCode}:${ticket.sourceChannel}:${ticket.sourceConversationId}`,
      name: ticket.customerName, phone: ticket.phone, summary: ticket.conversationSummary || "",
    });
    await CRMTicketModel.updateOne({ _id: ticket._id, leadSheetLeaseId: leaseId }, {
      $set: { leadSheetStatus: "synced", leadSheetError: "", leadSheetSyncedAt: new Date() },
      $unset: { leadSheetLeaseId: 1, leadSheetLeaseUntil: 1 },
    });
    return { sheetEnabled: true, sheetSaved: true, sheetError: "" };
  } catch (error) {
    const sheetError = error instanceof Error ? error.message : String(error);
    await CRMTicketModel.updateOne({ _id: ticket._id, leadSheetLeaseId: leaseId }, {
      $set: { leadSheetStatus: "failed", leadSheetError: sheetError.slice(0, 500) },
      $unset: { leadSheetLeaseId: 1, leadSheetLeaseUntil: 1 },
    });
    return { sheetEnabled: true, sheetSaved: false, sheetError };
  }
}

export async function saveChatLead(params: {
  companyCode: string;
  channel: "facebook" | "test";
  conversationId: string;
  message: string;
  history: ChatTurn[];
}) {
  const contact = extractChatContact(params.message, params.history);
  const key = { companyCode: params.companyCode, sourceChannel: params.channel,
    sourceConversationId: params.conversationId };
  const existing = await CRMTicketModel.findOne(key);
  if (!contact?.phone && !existing) return null;
  const summary = summarizeChatConversation(params.message, params.history);
  const name = contact?.name || existing?.customerName || "";
  const phone = contact?.phone || existing?.phone || "";
  const unchanged = Boolean(existing && existing.customerName === name && existing.phone === phone
    && existing.conversationSummary === summary);
  const ticket = await CRMTicketModel.findOneAndUpdate({
    ...key,
  }, {
    $set: { customerName: name, phone, conversationSummary: summary,
      lastInteraction: params.channel === "test" ? "Khách cung cấp liên hệ trong hội thoại mô phỏng Facebook"
        : "Khách cung cấp liên hệ qua Facebook Messenger" },
    $setOnInsert: { companyCode: params.companyCode, sourceChannel: params.channel,
      sourceConversationId: params.conversationId, status: "cold" },
  }, { upsert: true, new: true });
  return { ticket, ...await syncLeadSheet(ticket, unchanged) };
}
