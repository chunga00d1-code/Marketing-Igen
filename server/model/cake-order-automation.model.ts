import mongoose, { Document, Schema } from "mongoose";

export const CAKE_ORDER_STATUSES = [
  "COLLECTING_INFORMATION",
  "WAITING_CUSTOMER_CONFIRMATION",
  "WAITING_DEPOSIT",
  "CONFIRMED",
  "IN_PRODUCTION",
  "WAITING_CAKE_APPROVAL",
  "REVISION_REQUESTED",
  "CAKE_APPROVED",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "COMPLETED",
  "MANUAL_REVIEW",
  "CANCELLED",
] as const;

export type CakeOrderStatus = typeof CAKE_ORDER_STATUSES[number];

export interface ICakeOrderAutomation extends Document {
  orderId: string;
  activeConversationKey?: string;
  companyCode: string;
  channel: "facebook" | "zalo" | "tiktok";
  accountId: string;
  conversationId: string;
  customerName?: string;
  customerPhone?: string;
  designSource: "" | "customer" | "company";
  designReferenceUrls: string[];
  recipientGroup: "" | "adult" | "child";
  recipientGender: "" | "male" | "female" | "neutral";
  occasion?: string;
  cakeType: "" | "fresh_cream" | "mousse" | "salted_egg" | "tiramisu";
  guestCount?: number;
  sizeLabel?: string;
  priceOptions: number[];
  basePrice?: number;
  totalAmount?: number;
  inscription?: string;
  pickupDate?: string;
  pickupTime?: string;
  fulfillmentMethod: "" | "pickup" | "delivery";
  deliveryAddress?: string;
  deliveryFee?: number;
  depositRequired: boolean;
  depositPercent?: number;
  depositAmount?: number;
  depositStatus: "not_required" | "pending" | "verified";
  paymentCode?: string;
  paymentQrUrl?: string;
  productionPhotoUrl?: string;
  deliveryProofUrl?: string;
  missingFields: string[];
  status: CakeOrderStatus;
  version: number;
  lastInboundMessageId?: string;
  lastKnowledgeMatches: number;
  humanReviewReason?: string;
  productionNotificationStatus: "not_requested" | "sending" | "sent" | "skipped" | "failed";
  productionNotifiedAt?: Date;
  productionNotificationError?: string;
  history: Array<{
    eventType: string;
    fromStatus?: string;
    toStatus?: string;
    eventId: string;
    note?: string;
    at: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const HistorySchema = new Schema(
  {
    eventType: { type: String, required: true, trim: true },
    fromStatus: { type: String, default: "", trim: true },
    toStatus: { type: String, default: "", trim: true },
    eventId: { type: String, required: true, trim: true },
    note: { type: String, default: "", trim: true, maxlength: 1000 },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const CakeOrderAutomationSchema = new Schema<ICakeOrderAutomation>(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    activeConversationKey: { type: String, trim: true, select: false },
    companyCode: { type: String, required: true, uppercase: true, index: true },
    channel: { type: String, enum: ["facebook", "zalo", "tiktok"], required: true },
    accountId: { type: String, required: true, trim: true },
    conversationId: { type: String, required: true, trim: true },
    customerName: { type: String, default: "", trim: true, maxlength: 300 },
    customerPhone: { type: String, default: "", trim: true, maxlength: 30 },
    designSource: { type: String, enum: ["", "customer", "company"], default: "" },
    designReferenceUrls: { type: [String], default: [] },
    recipientGroup: { type: String, enum: ["", "adult", "child"], default: "" },
    recipientGender: { type: String, enum: ["", "male", "female", "neutral"], default: "" },
    occasion: { type: String, default: "", trim: true, maxlength: 500 },
    cakeType: { type: String, enum: ["", "fresh_cream", "mousse", "salted_egg", "tiramisu"], default: "" },
    guestCount: { type: Number, min: 1, max: 500 },
    sizeLabel: { type: String, default: "", trim: true, maxlength: 100 },
    priceOptions: { type: [Number], default: [] },
    basePrice: { type: Number, min: 0 },
    totalAmount: { type: Number, min: 0 },
    inscription: { type: String, default: "", trim: true, maxlength: 500 },
    pickupDate: { type: String, default: "", trim: true, maxlength: 10 },
    pickupTime: { type: String, default: "", trim: true, maxlength: 5 },
    fulfillmentMethod: { type: String, enum: ["", "pickup", "delivery"], default: "" },
    deliveryAddress: { type: String, default: "", trim: true, maxlength: 1500 },
    deliveryFee: { type: Number, min: 0 },
    depositRequired: { type: Boolean, default: false },
    depositPercent: { type: Number, min: 1, max: 100 },
    depositAmount: { type: Number, min: 0 },
    depositStatus: { type: String, enum: ["not_required", "pending", "verified"], default: "not_required" },
    paymentCode: { type: String, trim: true, uppercase: true, index: true },
    paymentQrUrl: { type: String, default: "", trim: true },
    productionPhotoUrl: { type: String, default: "", trim: true },
    deliveryProofUrl: { type: String, default: "", trim: true },
    missingFields: { type: [String], default: [] },
    status: { type: String, enum: CAKE_ORDER_STATUSES, default: "COLLECTING_INFORMATION", index: true },
    version: { type: Number, default: 1, min: 1 },
    lastInboundMessageId: { type: String, default: "", trim: true },
    lastKnowledgeMatches: { type: Number, default: 0, min: 0 },
    humanReviewReason: { type: String, default: "", trim: true, maxlength: 1000 },
    productionNotificationStatus: {
      type: String,
      enum: ["not_requested", "sending", "sent", "skipped", "failed"],
      default: "not_requested",
    },
    productionNotifiedAt: { type: Date },
    productionNotificationError: { type: String, default: "", trim: true, maxlength: 1000 },
    history: { type: [HistorySchema], default: [] },
  },
  { timestamps: true, optimisticConcurrency: true },
);

CakeOrderAutomationSchema.index({ companyCode: 1, channel: 1, accountId: 1, conversationId: 1, updatedAt: -1 });
CakeOrderAutomationSchema.index({ activeConversationKey: 1 }, { unique: true, sparse: true });
CakeOrderAutomationSchema.index(
  { companyCode: 1, paymentCode: 1 },
  { unique: true, partialFilterExpression: { paymentCode: { $type: "string" } } },
);

export const CakeOrderAutomationModel = mongoose.model<ICakeOrderAutomation>(
  "CakeOrderAutomation",
  CakeOrderAutomationSchema,
);

