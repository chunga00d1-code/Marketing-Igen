import mongoose, { Schema, Document } from "mongoose";

export interface IMessengerOrderItem {
  productCode?: string;
  productName: string;
  variantSummary?: string;
  quantity: number;
  unitPrice?: number;
  lineTotal?: number;
  attributes?: Record<string, string>;
}

export interface IMessengerOrder extends Document {
  orderId: string;
  fingerprint: string;
  companyCode: string;
  integrationId: mongoose.Types.ObjectId;
  pageId: string;
  conversationId: mongoose.Types.ObjectId;
  sourceMessageId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  items: IMessengerOrderItem[];
  subtotal?: number;
  shippingFee?: number;
  discountAmount?: number;
  totalAmount?: number;
  paymentMethod?: string;
  depositRequired: boolean;
  depositPercent?: number;
  depositAmount?: number;
  depositStatus: "not_required" | "awaiting_receipt" | "receipt_received" | "verified";
  paymentCode?: string;
  sepayTransactionId?: string;
  sepayTransferAmount?: number;
  sepayVerifiedAt?: Date;
  sepayCustomerNotifiedAt?: Date;
  sepayCustomerNotificationError?: string;
  depositRequestedAt?: Date;
  receiptUrl?: string;
  receiptMessageId?: string;
  receiptReceivedAt?: Date;
  receiptSheetSyncError?: string;
  fulfillmentMethod?: "" | "pickup" | "delivery";
  fulfillmentLocation?: string;
  requestedFulfillmentTime?: string;
  customerNote?: string;
  internalNote?: string;
  selectedCakeImageUrl?: string;
  selectedCakeMessageId?: string;
  selectedCakeSelectedAt?: Date;
  selectedCakeSheetSyncError?: string;
  missingFields: string[];
  status: "draft" | "confirmed" | "synced" | "failed";
  syncAttempts: number;
  lastSyncError?: string;
  confirmedAt?: Date;
  syncedAt?: Date;
  telegramNotifiedAt?: Date;
  telegramNotificationError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MessengerOrderItemSchema = new Schema<IMessengerOrderItem>({
  productCode: { type: String, default: "", trim: true },
  productName: { type: String, required: true, trim: true },
  variantSummary: { type: String, default: "", trim: true },
  quantity: { type: Number, required: true, min: 1, max: 10000 },
  unitPrice: { type: Number, min: 0 },
  lineTotal: { type: Number, min: 0 },
  attributes: { type: Map, of: String, default: {} },
}, { _id: false });

const MessengerOrderSchema = new Schema<IMessengerOrder>({
  orderId: { type: String, required: true, unique: true, index: true },
  fingerprint: { type: String, required: true, unique: true, index: true },
  companyCode: { type: String, required: true, index: true },
  integrationId: { type: Schema.Types.ObjectId, ref: "SocialIntegration", required: true, index: true },
  pageId: { type: String, required: true, index: true },
  conversationId: { type: Schema.Types.ObjectId, ref: "FBConversation", required: true, index: true },
  sourceMessageId: { type: String, required: true, unique: true, index: true },
  customerName: { type: String, default: "", trim: true },
  customerPhone: { type: String, default: "", trim: true },
  deliveryAddress: { type: String, default: "", trim: true },
  items: { type: [MessengerOrderItemSchema], default: [] },
  subtotal: { type: Number, min: 0 },
  shippingFee: { type: Number, min: 0 },
  discountAmount: { type: Number, min: 0 },
  totalAmount: { type: Number, min: 0 },
  paymentMethod: { type: String, default: "", trim: true },
  depositRequired: { type: Boolean, default: false },
  depositPercent: { type: Number, min: 1, max: 100 },
  depositAmount: { type: Number, min: 0 },
  depositStatus: {
    type: String,
    enum: ["not_required", "awaiting_receipt", "receipt_received", "verified"],
    default: "not_required",
    index: true,
  },
  depositRequestedAt: { type: Date },
  receiptUrl: { type: String, default: "", trim: true },
  receiptMessageId: { type: String, default: "", trim: true },
  receiptReceivedAt: { type: Date },
  receiptSheetSyncError: { type: String, default: "" },
  paymentCode: { type: String, trim: true, uppercase: true },
  sepayTransactionId: { type: String, default: "", trim: true },
  sepayTransferAmount: { type: Number, min: 0 },
  sepayVerifiedAt: { type: Date },
  sepayCustomerNotifiedAt: { type: Date },
  sepayCustomerNotificationError: { type: String, default: "" },
  fulfillmentMethod: { type: String, enum: ["", "pickup", "delivery"], default: "" },
  fulfillmentLocation: { type: String, default: "", trim: true },
  requestedFulfillmentTime: { type: String, default: "", trim: true },
  customerNote: { type: String, default: "", trim: true },
  internalNote: { type: String, default: "", trim: true },
  selectedCakeImageUrl: { type: String, default: "", trim: true },
  selectedCakeMessageId: { type: String, default: "", trim: true },
  selectedCakeSelectedAt: { type: Date },
  selectedCakeSheetSyncError: { type: String, default: "" },
  missingFields: { type: [String], default: [] },
  status: { type: String, enum: ["draft", "confirmed", "synced", "failed"], default: "draft", index: true },
  syncAttempts: { type: Number, default: 0 },
  lastSyncError: { type: String, default: "" },
  confirmedAt: { type: Date },
  syncedAt: { type: Date },
  telegramNotifiedAt: { type: Date },
  telegramNotificationError: { type: String, default: "" },
}, { timestamps: true });

MessengerOrderSchema.index({ companyCode: 1, createdAt: -1 });
MessengerOrderSchema.index({ integrationId: 1, status: 1, updatedAt: -1 });
MessengerOrderSchema.index({ conversationId: 1, createdAt: -1 });
MessengerOrderSchema.index(
  { companyCode: 1, paymentCode: 1 },
  { unique: true, partialFilterExpression: { paymentCode: { $type: "string" } } },
);

export const MessengerOrderModel = mongoose.model<IMessengerOrder>("MessengerOrder", MessengerOrderSchema);
