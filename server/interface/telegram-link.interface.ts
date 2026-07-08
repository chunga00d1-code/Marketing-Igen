export interface TelegramLinkStatus {
  linked: boolean;
  telegramChatId: number | null;
  telegramUserId: number | null;
  linkedAt: Date | null;
  pendingCode: string | null;
  pendingCodeExpiresAt: Date | null;
  botUsername: string;
}
