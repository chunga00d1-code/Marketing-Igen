import { Document } from "mongoose";

export interface ICategory extends Document {
  name: string;
  code: string;
  description: string;
  colorClass: string;
  status: "Đang dùng" | "Tạm khóa";
  companyCode: string;
}
