import { Document } from "mongoose";

export interface IPermission extends Document {
  code: string;
  name: string;
  module: string;
  description?: string;
  createdAt: Date;
}
