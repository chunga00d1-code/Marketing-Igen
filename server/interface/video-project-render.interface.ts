import type { Document, Types } from "mongoose";

export type VideoProjectRenderStatus = "queued" | "rendering" | "uploading" | "completed" | "failed";
export type VideoProjectRenderResolution = "720p" | "1080p";
export type VideoProjectRenderAspectRatio = "9:16" | "1:1" | "16:9" | "3:4";
export type VideoProjectRenderEngine = "shotstack" | "remotion" | "ffmpeg";
export type VideoProjectRenderSubmissionState = "attempting" | "confirmed" | "uncertain" | "rejected";
export type VideoProjectRenderPurpose = "project-export" | "template-preview";

export interface VideoProjectRenderSnapshot {
  title: string;
  tracks: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
  sourceEdit?: Record<string, unknown>;
}

export interface IVideoProjectRender extends Document {
  purpose: VideoProjectRenderPurpose;
  projectId?: Types.ObjectId;
  templateId?: Types.ObjectId;
  templateVersionId?: Types.ObjectId;
  templateSourceHash?: string;
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
  providerRenderId?: string;
  providerSubmissionState?: VideoProjectRenderSubmissionState;
  providerSubmissionAttemptId?: string;
  providerSubmissionStartedAt?: Date;
  providerSubmissionUnknownAt?: Date;
  providerStatus?: string;
  providerOutputUrl?: string;
  providerPollAttempt?: number;
  providerLastCheckedAt?: Date;
  providerNextPollAt?: Date;
  providerErrorCode?: string;
  providerErrorMessage?: string;
  transferAttempt: number;
  transferLeaseOwner?: string;
  transferLeaseUntil?: Date;
  attempt: number;
  idempotencyKey: string;
  errorCode?: string;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
