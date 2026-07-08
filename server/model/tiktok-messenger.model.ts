import mongoose, { Schema, Document } from "mongoose";

// Interface cho Cuộc hội thoại TikTok
export interface ITikTokConversation extends Document {
  openId: string;           // TikTok Open ID (App-Scoped User ID) của khách hàng
  tiktokConversationId?: string;
  senderName: string;       // Tên hiển thị khách hàng TikTok
  avatarUrl: string;        // Ảnh đại diện khách hàng
  businessAccountId: string; // TikTok Business Account ID (username) của mình
  lastMessageText: string;
  lastMessageAt: Date;
  unreadCount: number;
  status: "open" | "closed";
  tags: string[];
  isVip: boolean;
  aiPausedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Interface cho Tin nhắn chi tiết TikTok
export interface ITikTokMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  senderId: string;       // User ID người gửi (open_id hoặc business account)
  recipientId: string;    // User ID người nhận
  direction: "inbound" | "outbound"; // inbound: khách nhắn tới, outbound: mình gửi đi
  text: string;
  attachments: Array<{
    type: string;
    url: string;
  }>;
  messageId: string;      // ID tin nhắn của TikTok
  timestamp: Date;
  status: "sent" | "delivered" | "read";
  createdAt: Date;
}

// Schema Cuộc hội thoại
const TikTokConversationSchema: Schema = new Schema(
  {
    openId: { type: String, required: true },
    tiktokConversationId: { type: String, default: "" },
    senderName: { type: String, default: "Khách hàng TikTok" },
    avatarUrl: { type: String, default: "" },
    businessAccountId: { type: String, required: true },
    lastMessageText: { type: String, default: "" },
    lastMessageAt: { type: Date, default: Date.now },
    unreadCount: { type: Number, default: 0 },
    status: { type: String, enum: ["open", "closed"], default: "open" },
    tags: { type: [String], default: [] },
    isVip: { type: Boolean, default: false },
    aiPausedUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

// Ràng buộc unique theo Business Account và Open ID khách hàng
TikTokConversationSchema.index({ businessAccountId: 1, openId: 1 }, { unique: true });
TikTokConversationSchema.index({ businessAccountId: 1, lastMessageAt: -1 });

// Schema Tin nhắn
const TikTokMessageSchema: Schema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "TikTokConversation", required: true },
    senderId: { type: String, required: true },
    recipientId: { type: String, required: true },
    direction: { type: String, enum: ["inbound", "outbound"], required: true },
    text: { type: String, default: "" },
    attachments: [
      {
        type: { type: String },
        url: { type: String }
      }
    ],
    messageId: { type: String, required: true, unique: true },
    timestamp: { type: Date, required: true },
    status: { type: String, enum: ["sent", "delivered", "read"], default: "sent" },
  },
  { timestamps: true }
);

TikTokMessageSchema.index({ conversationId: 1, timestamp: -1 });

export const TikTokConversationModel = mongoose.model<ITikTokConversation>("TikTokConversation", TikTokConversationSchema);
export const TikTokMessageModel = mongoose.model<ITikTokMessage>("TikTokMessage", TikTokMessageSchema);
