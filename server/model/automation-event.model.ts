import mongoose, { Document, Schema } from "mongoose";

export interface IAutomationEvent extends Document {
  companyCode: string;
  operation: string;
  eventId: string;
  requestHash: string;
  state: "processing" | "completed";
  response: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const AutomationEventSchema = new Schema<IAutomationEvent>(
  {
    companyCode: { type: String, required: true, uppercase: true, index: true },
    operation: { type: String, required: true, trim: true, maxlength: 80 },
    eventId: { type: String, required: true, trim: true, maxlength: 200 },
    requestHash: { type: String, required: true, trim: true },
    response: { type: Schema.Types.Mixed, required: true },
    state: { type: String, enum: ["processing", "completed"], default: "completed", index: true },
  },
  { timestamps: true },
);

AutomationEventSchema.index({ companyCode: 1, operation: 1, eventId: 1 }, { unique: true });
AutomationEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const AutomationEventModel = mongoose.model<IAutomationEvent>("AutomationEvent", AutomationEventSchema);

