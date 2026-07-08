import { Document, Types } from "mongoose";

export interface IOpusClipProject extends Document {
  userId: Types.ObjectId;
  projectId: string;
  videoUrl: string;
  name: string;
  status: "pending" | "processing" | "completed" | "failed";
  lengthOption: string;
  language: string;
  brandTemplateId?: string;
  clips: Array<{
    clipId: string;
    videoUrl: string;
    title: string;
    description: string;
    hashtags: string;
    viralityScore: number;
    viralReason: string;
    duration: number;
    startTime: number;
    endTime: number;
  }>;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}
