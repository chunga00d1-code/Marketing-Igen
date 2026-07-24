import type { Document, Types } from "mongoose";

export type VideoProjectRenderStatus = "queued" | "rendering" | "uploading" | "completed" | "failed";
export type VideoProjectRenderResolution = "720p" | "1080p";
export type VideoProjectRenderAspectRatio = "9:16" | "1:1" | "16:9" | "3:4";
export type VideoProjectRenderEngine = "remotion" | "ffmpeg";

export interface VideoProjectRenderSnapshot {
  title: string;
  tracks: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
}

export interface IVideoProjectRender extends Document {
  projectId: Types.ObjectId;
  userId: string;
  companyCode: string;
  status: VideoProjectRenderStatus;
  resolution: VideoProjectRenderResolution;
  aspectRatio: VideoProjectRenderAspectRatio;
  duration: number;
  snapshot: VideoProjectRenderSnapshot;
  progress: number;
  stageMessage?: string;
  outputUrl?: string;
  engine?: VideoProjectRenderEngine;
  attempt: number;
  idempotencyKey: string;
  errorCode?: string;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
