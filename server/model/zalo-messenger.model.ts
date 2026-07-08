import mongoose, { Schema, Document } from "mongoose";

// Interface cho Cuộc hội thoại Zalo
export interface IZaloConversation extends Document {
  recipientId: string;    // Zalo User ID (OA-Scoped ID) của khách hàng
  zaloConversationId?: string;
  senderName: string;     // Tên khách hàng Zalo
  avatarUrl: string;      // Ảnh đại diện khách hàng
  oaId: string;           // ID Zalo OA của mình
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

// Interface cho Tin nhắn chi tiết Zalo
export interface IZaloMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  senderId: string;       // User ID người gửi
  recipientId: string;    // User ID người nhận
  direction: "inbound" | "outbound"; // inbound: khách nhắn tới, outbound: mình gửi đi
  text: string;
  attachments: Array<{
    type: string;
    url: string;
  }>;
  messageId: string;      // ID tin nhắn của Zalo
  timestamp: Date;
  status: "sent" | "delivered" | "read";
  createdAt: Date;
}

// Schema Cuộc hội thoại
const ZaloConversationSchema: Schema = new Schema(
  {
    recipientId: { type: String, required: true },
    zaloConversationId: { type: String, default: "" },
    senderName: { type: String, default: "Khách hàng Zalo" },
    avatarUrl: { type: String, default: "" },
    oaId: { type: String, required: true },
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

// Ràng buộc unique theo Zalo OA và ID khách hàng
ZaloConversationSchema.index({ oaId: 1, recipientId: 1 }, { unique: true });
ZaloConversationSchema.index({ oaId: 1, lastMessageAt: -1 });

// Schema Tin nhắn
const ZaloMessageSchema: Schema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "ZaloConversation", required: true },
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

ZaloMessageSchema.index({ conversationId: 1, timestamp: -1 });

export const ZaloConversationModel = mongoose.model<IZaloConversation>("ZaloConversation", ZaloConversationSchema);
export const ZaloMessageModel = mongoose.model<IZaloMessage>("ZaloMessage", ZaloMessageSchema);
