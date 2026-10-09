export type ChatContextMessage = { sender: string; text: string };

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export const ACKNOWLEDGEMENT_REPLY = "dạ vâng ạ";

export function combineChatScenarios(knowledgeScenario: string | undefined, configuredScenario: string): string {
  const knowledge = (knowledgeScenario || "").trim();
  const configured = configuredScenario.trim();
  if (knowledge === configured) return knowledge;
  return [
    knowledge && configured ? "Kịch bản cấu hình riêng của kênh ưu tiên hơn hướng dẫn dùng chung khi có mâu thuẫn; vẫn tuân thủ rule doanh nghiệp." : "",
    knowledge ? `[Kịch bản và hướng dẫn từ kho tri thức]\n${knowledge}` : "",
    configured ? `[Kịch bản cấu hình riêng của kênh]\n${configured}` : "",
  ].filter(Boolean).join("\n\n");
}

// Match the entire message, never just its opening ("ok, ship bao nhiêu?").
export function isSimpleAcknowledgement(message: string): boolean {
  const parts = message.split(/\n+/).map((part) => part.replace(/^\s*\d+[.)]\s+/, ""));
  return parts.length > 0 && parts.every((part) =>
    /^(?:(?:da|vang|uh|u|uhm|um|ok|oke|oki|okay|okie|duoc roi|duoc|dong y)(?:\s+|$))+(?:(?:e|em|a|anh|chi|nhe|nha|nhe em|nha em|a em)\s*)?$/.test(normalize(part))
  );
}

/** An acknowledgement to a concrete offer is a request to carry out that offer. */
export function isAcknowledgementToAssistantOffer(message: string, history: ChatContextMessage[] = []): boolean {
  if (!isSimpleAcknowledgement(message)) return false;
  const latestTurn = [...history].reverse().find((turn) => turn.text.trim());
  if (!latestTurn || latestTurn.sender === "user") return false;

  const assistantText = normalize(latestTurn.text);
  if (/\b(da|vua|moi)\s+gui\b/.test(assistantText) || /\bgui\b.{0,80}\b(roi|xong)\b/.test(assistantText)) return false;
  return /\b(gui|gui lai|gui them)\b.{0,80}\b(link|duong dan|mau|hinh|anh|danh sach|thong tin|bang gia|chi tiet)\b/.test(assistantText);
}

export function isContextualQuestion(message: string): boolean {
  const lines = message.split(/\n+/).map(line => line.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);
  if (lines.length > 1) return lines.every(line => isSimpleAcknowledgement(line) || isContextualQuestion(line));
  const text = normalize(message);
  const attributeQuestion = text
    .replace(/\b(gia|size|kich thuoc|thanh phan|chat lieu|mau sac|bao hanh|doi tra|phi ship|ship|giao hang|van chuyen|thanh toan|han su dung|bao quan|cach dung|tinh nang|thong so|con hang)\b/g, " ")
    .replace(/\b(da|vang|ok|oke|oki|con|the|vay|thi|la|gi|sao|nao|bao|nhieu|nhu|the|co|khong|ko|k|a|ah|em|e|anh|chi|minh|toi|ban|cho|hoi|xin|voi|nhe|nha|duoc|chua|het|roi)\b/g, " ")
    .trim();
  return /\b(check|kiem tra|tra cuu|xem) (lai )?(xong|chua|giup)\b/.test(text)
    || /^(?:da |dip |mung )?(sinh nhat|thoi noi|day thang|ky niem|khai truong|tan gia|dam cuoi)(?:\s+(?:a|nhe|nha|thoi|nhe em))*$/.test(text)
    || /^(?:(?:be|chau|con|nam nay)\s+)*\d{1,3}\s+(?:tuoi|thang tuoi)(?:\s+(?:a|roi|nhe|nha))*$/.test(text)
    || /^(?:be|con) (?:trai|gai)(?:\s+(?:a|nhe|nha))*$/.test(text)
    || /^(co (thong tin|ket qua) chua|sao roi|the nao roi|roi sao|tra loi (giup )?(em|minh|toi))\b/.test(text)
    || /\b(cai|loai|mau|banh|san pham|dich vu|goi) (do|nay|ay|vua roi)\b/.test(text)
    || /\b(no|cai do|cai nay)\b/.test(text)
    || /\b(size|kich thuoc) (nho|lon|to|be) hon\b/.test(text)
    || (attributeQuestion !== text && !attributeQuestion && text.split(" ").length <= 16);
}

/** Keep standalone questions clean; resolve follow-ups using customer turns only.
 * Previous assistant replies may contain ungrounded facts and are not search evidence.
 */
export function buildChatKnowledgeQuery(message: string, history: ChatContextMessage[] = []): string {
  const acknowledgesOffer = isAcknowledgementToAssistantOffer(message, history);
  if ((isSimpleAcknowledgement(message) && !acknowledgesOffer) || (!acknowledgesOffer && !isContextualQuestion(message))) {
    return message.slice(0, 4000);
  }
  const anchors: string[] = [];
  for (const turn of history.slice(-15).reverse()) {
    if (turn.sender !== "user" || !turn.text.trim() || isSimpleAcknowledgement(turn.text)) continue;
    if (normalize(turn.text) === normalize(message)) continue;
    anchors.unshift(turn.text.slice(0, 1000));
    if (!isContextualQuestion(turn.text) || anchors.length === 3) break;
  }
  return [...anchors, message].join("\n").slice(-4000);
}
