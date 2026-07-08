import { Document } from "mongoose";

export interface ILeadProductSelection {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface ICRMTicket extends Document {
  customerName: string;
  company: string;
  value: number;
  phone: string;
  avatar: string;
  email: string;
  productOfChoice: string;
  status: "cold" | "warm" | "hot" | "won" | "upsell";
  lastInteraction?: string;
  companyCode: string;
  selectedProducts?: ILeadProductSelection[];
}
