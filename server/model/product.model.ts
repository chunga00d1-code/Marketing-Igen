import { Schema, model } from "mongoose";
import { IProduct } from "../interface/product.interface";

const ProductSchema = new Schema<IProduct>({
  sku: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, index: true },
  category: { type: String, required: true, index: true },
  brand: { type: String, default: "" },
  unit: { type: String, required: true, default: "Cái" },
  stock: { type: Number, default: 0 },
  minStockAlert: { type: Number, default: 15 },
  price: { type: Number, required: true },
  description: { type: String, default: "" },
  status: { type: String, enum: ["Active", "Inactive"], default: "Active", required: true },
  demandForecast: { type: String, enum: ["Tăng mạnh", "Ổn định", "Giảm nhẹ"], default: "Ổn định" },
  imageUrl: { type: String, default: "" },
  companyCode: { type: String, required: true, index: true },
});

export const ProductModel = model<IProduct>("Product", ProductSchema);
