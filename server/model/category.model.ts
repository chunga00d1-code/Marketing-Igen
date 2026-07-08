import { Schema, model } from "mongoose";
import { ICategory } from "../interface/category.interface";

const CategorySchema = new Schema<ICategory>({
  name: { type: String, required: true, index: true },
  code: { type: String, required: true, index: true },
  description: { type: String },
  colorClass: { type: String, default: "bg-blue-100 text-blue-800" },
  status: { type: String, enum: ["Đang dùng", "Tạm khóa"], default: "Đang dùng" },
  companyCode: { type: String, required: true, index: true },
});

// Đảm bảo tính duy nhất của tên/mã danh mục trong cùng doanh nghiệp
CategorySchema.index({ companyCode: 1, name: 1 }, { unique: true });
CategorySchema.index({ companyCode: 1, code: 1 }, { unique: true });

export const CategoryModel = model<ICategory>("Category", CategorySchema);
