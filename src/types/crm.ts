export type CRMSubTabType = "PHỄU KHÁCH HÀNG" | "OMNI-INBOX CHAT" | "AI COMMENT AUTO-REPLY";

export interface ChatMessage {
  id: string;
  sender: "user" | "ai" | "agent";
  text: string;
  timestamp: Date;
  status?: "sent" | "delivered" | "read";
  attachments?: Array<{
    type: string;
    url: string;
  }>;
  conversationId?: string;
}

export interface ChatPagination {
  limit: number;
  hasMore: boolean;
  nextBefore: string | null;
  loadingMore: boolean;
}

export interface CustomerInbox {
  id: string; // Mongo conversation _id used by inbox APIs
  recipientId?: string; // Real customer identifier from the provider (PSID/UID/OA-scoped ID)
  name: string;
  avatar: string;
  avatarUrl?: string;
  lastMessage: string;
  time: string;
  unreadCount: number;
  isVip: boolean;
  status: "online" | "offline";
  tags: string[];
  channel?: "facebook" | "zalo" | "tiktok";
  aiPausedUntil?: string | null;
  pageId?: string;
}

export interface AIChatConfig {
  enabled: boolean;
  commentReplyEnabled?: boolean;
  autoClassify: boolean;
  autoCloseDeal: boolean;
  autoFeedback: boolean;
  replyDelay: number; // in seconds
  advancedInstructions: string;
  trainingKnowledge: string;
  model?: string;
  disabledAt?: string | null;
}

export interface LeadCard {
  id: string;
  customerName: string;
  company: string;
  value: number;
  phone: string;
  avatar: string;
  email: string;
  productOfChoice: string;
  status: "cold" | "warm" | "hot" | "won" | "upsell";
  lastInteraction?: string;
}
