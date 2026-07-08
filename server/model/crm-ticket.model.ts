import { Schema, model } from "mongoose";
import { ICRMTicket } from "../interface/crm-ticket.interface";

const CRMTicketSchema = new Schema<ICRMTicket>({
  customerName: { type: String, required: true, index: true },
  company: { type: String, default: "" },
  value: { type: Number, default: 0 },
  phone: { type: String, default: "" },
  avatar: { type: String, default: "" },
  email: { type: String, default: "", index: true },
  productOfChoice: { type: String, default: "" },
  status: { type: String, enum: ["cold", "warm", "hot", "won", "upsell"], default: "cold", index: true },
  lastInteraction: { type: String },
  companyCode: { type: String, required: true, index: true },
  selectedProducts: {
    type: [{
      productId: { type: String },
      name: { type: String },
      price: { type: Number },
      quantity: { type: Number },
    }],
    default: [],
  },
});

export const CRMTicketModel = model<ICRMTicket>("CRMTicket", CRMTicketSchema);
