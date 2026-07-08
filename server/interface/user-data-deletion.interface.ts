import { Document } from "mongoose";

export interface IUserDataDeletion extends Document {
  facebookUserId: string;
  confirmationCode: string;
  status: "pending" | "processing" | "completed" | "failed";
  requestedAt: Date;
  completedAt?: Date;
  details?: string;
}
