import { Schema, model } from "mongoose";
import { IRolePermission } from "../interface/role-permission.interface";

const RolePermissionSchema = new Schema<IRolePermission>({
  companyCode: { type: String, required: true, index: true },
  role: { type: String, required: true, index: true },
  permissions: { type: [String], default: [] },
  level: { type: Number, required: true },
  displayName: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Đảm bảo tính duy nhất của cấu hình role trong cùng một doanh nghiệp
RolePermissionSchema.index({ companyCode: 1, role: 1 }, { unique: true });

export const RolePermissionModel = model<IRolePermission>("RolePermission", RolePermissionSchema);
