import mongoose, { Schema, Document } from "mongoose";

// Interface cho Cuộc hội thoại
export interface IFBConversation extends Document {
  recipientId: string;    // Facebook PSID (Page-Scoped User ID) của khách hàng
  facebookConversationId?: string;
  senderName: string;     // Tên khách hàng (lấy từ Graph API)
  avatarUrl: string;      // Ảnh đại diện khách hàng
  pageId: string;         // ID Fanpage của mình
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

// Interface cho Tin nhắn chi tiết
export interface IFBMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  senderId: string;       // PSID người gửi
  recipientId: string;    // PSID người nhận
  direction: "inbound" | "outbound"; // inbound: khách nhắn tới, outbound: mình gửi đi
  text: string;
  attachments: Array<{
    type: string;
    url: string;
  }>;
  messageId: string;      // ID tin nhắn của Facebook (mid...)
  timestamp: Date;
  status: "sent" | "delivered" | "read";
  createdAt: Date;
}

// Schema Cuộc hội thoại
const FBConversationSchema: Schema = new Schema(
  {
    recipientId: { type: String, required: true },
    facebookConversationId: { type: String, default: undefined },
    senderName: { type: String, default: "Khách hàng Facebook" },
    avatarUrl: { type: String, default: "" },
    pageId: { type: String, required: true },
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

// PSID is only unique within a specific Facebook page, not globally.
FBConversationSchema.index({ pageId: 1, recipientId: 1 }, { unique: true });
FBConversationSchema.index(
  { pageId: 1, facebookConversationId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      facebookConversationId: { $exists: true, $type: "string", $ne: "" },
    },
  }
);
FBConversationSchema.index({ pageId: 1, lastMessageAt: -1 });

// Schema Tin nhắn
const FBMessageSchema: Schema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "FBConversation", required: true },
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

FBMessageSchema.index({ conversationId: 1, timestamp: -1 });

export const FBConversationModel = mongoose.model<IFBConversation>("FBConversation", FBConversationSchema);
export const FBMessageModel = mongoose.model<IFBMessage>("FBMessage", FBMessageSchema);
