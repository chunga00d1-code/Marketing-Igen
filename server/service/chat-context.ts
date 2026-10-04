export type ChatContextMessage = { sender: string; text: string };

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export const ACKNOWLEDGEMENT_REPLY = "dạ vâng ạ";

// Match the entire message, never just its opening ("ok, ship bao nhiêu?").
export function isSimpleAcknowledgement(message: string): boolean {
  const parts = message.split(/\n+/).map((part) => part.replace(/^\s*\d+[.)]\s+/, ""));
  return parts.length > 0 && parts.every((part) =>
    /^(?:(?:da|vang|uh|u|uhm|um|ok|oke|oki|okay|okie|duoc roi|duoc|dong y)(?:\s+|$))+(?:(?:e|em|a|anh|chi|nhe|nha|nhe em|nha em|a em)\s*)?$/.test(normalize(part))
  );
}

function isContextualQuestion(message: string): boolean {
  const text = normalize(message);
  const attributeQuestion = text
    .replace(/\b(gia|size|kich thuoc|thanh phan|chat lieu|mau sac|bao hanh|doi tra|phi ship|ship|giao hang|van chuyen|thanh toan|han su dung|bao quan|cach dung|tinh nang|thong so|con hang)\b/g, " ")
    .replace(/\b(da|vang|ok|oke|oki|con|the|vay|thi|la|gi|sao|nao|bao|nhieu|nhu|the|co|khong|ko|k|a|ah|em|e|anh|chi|minh|toi|ban|cho|hoi|xin|voi|nhe|nha|duoc|chua|het|roi)\b/g, " ")
    .trim();
  return /\b(check|kiem tra|tra cuu|xem) (lai )?(xong|chua|giup)\b/.test(text)
    || /^(co (thong tin|ket qua) chua|sao roi|the nao roi|roi sao|tra loi (giup )?(em|minh|toi))\b/.test(text)
    || /\b(cai|loai|mau|banh|san pham|dich vu|goi) (do|nay|ay|vua roi)\b/.test(text)
    || (attributeQuestion !== text && !attributeQuestion && text.split(" ").length <= 16);
}

/** Keep standalone questions clean; resolve follow-ups using customer turns only.
 * Previous assistant replies may contain ungrounded facts and are not search evidence.
 */
export function buildChatKnowledgeQuery(message: string, history: ChatContextMessage[] = []): string {
  if (isSimpleAcknowledgement(message) || !isContextualQuestion(message)) return message.slice(0, 4000);
  const anchors: string[] = [];
  for (const turn of history.slice(-15).reverse()) {
    if (turn.sender !== "user" || !turn.text.trim() || isSimpleAcknowledgement(turn.text)) continue;
    if (normalize(turn.text) === normalize(message)) continue;
    anchors.unshift(turn.text.slice(0, 1000));
    if (!isContextualQuestion(turn.text) || anchors.length === 3) break;
  }
  return [...anchors, message].join("\n").slice(-4000);
}
