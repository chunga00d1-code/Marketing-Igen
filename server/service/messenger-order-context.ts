export interface MessengerOrderContextMessage {
  sender?: string;
  direction?: string;
  text?: string;
}

function normalize(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isNewOrderStartMessage(value: string) {
  const text = normalize(value);
  return /\b(muon|can)\s+(dat|mua|lay)\b/.test(text)
    || /\b(cho|minh|toi|em|anh|chi)\s+(minh|toi|em|anh|chi)?\s*(dat|mua)\b/.test(text)
    || /^(dat|mua|order)\s+(?!hang\b).{2,}/.test(text)
    || /\b(dat|order)\s+(giup|minh|toi|em)\b/.test(text);
}

function isCustomerMessage(message: MessengerOrderContextMessage) {
  return message.direction === "inbound" || message.sender === "user";
}

export function selectCurrentOrderContext<T extends MessengerOrderContextMessage>(
  messages: T[],
  currentCustomerText = "",
  fallbackLimit = 12
) {
  if (isNewOrderStartMessage(currentCustomerText)) return [] as T[];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (isCustomerMessage(message) && isNewOrderStartMessage(message.text || "")) {
      return messages.slice(index);
    }
  }

  return messages.slice(-fallbackLimit);
}
