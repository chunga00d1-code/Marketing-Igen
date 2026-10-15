import mongoose, { Document, Schema } from "mongoose";

export interface ICakeCustomerProfile extends Document {
  companyCode: string;
  phone: string;
  name?: string;
  channels: string[];
  completedOrderIds: string[];
  completedOrderCount: number;
  lifetimeValue: number;
  birthday?: string;
  marketingConsent: "unknown" | "granted" | "revoked";
  lastSeenAt: Date;
  lastOrderAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CakeCustomerProfileSchema = new Schema<ICakeCustomerProfile>(
  {
    companyCode: { type: String, required: true, uppercase: true, index: true },
    phone: { type: String, required: true, trim: true },
    name: { type: String, default: "", trim: true, maxlength: 300 },
    channels: { type: [String], default: [] },
    completedOrderIds: { type: [String], default: [] },
    completedOrderCount: { type: Number, default: 0, min: 0 },
    lifetimeValue: { type: Number, default: 0, min: 0 },
    birthday: { type: String, default: "", trim: true, maxlength: 10 },
    marketingConsent: { type: String, enum: ["unknown", "granted", "revoked"], default: "unknown" },
    lastSeenAt: { type: Date, default: Date.now },
    lastOrderAt: { type: Date },
  },
  { timestamps: true },
);

CakeCustomerProfileSchema.index({ companyCode: 1, phone: 1 }, { unique: true });
CakeCustomerProfileSchema.index({ companyCode: 1, lifetimeValue: -1 });

export const CakeCustomerProfileModel = mongoose.model<ICakeCustomerProfile>(
  "CakeCustomerProfile",
  CakeCustomerProfileSchema,
);

