import { Schema, model } from "mongoose";
import { IPermission } from "../interface/permission.interface";

const PermissionSchema = new Schema<IPermission>({
  code: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, index: true },
  module: { type: String, required: true, index: true },
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export const PermissionModel = model<IPermission>("Permission", PermissionSchema);
