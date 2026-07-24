import { Document, Types } from "mongoose";
import {
  VideoCaptionClassifiedError,
  VideoCaptionContextLinks,
  VideoCaptionJobOperation,
  VideoCaptionJobStatus,
  VideoCaptionKnowledgeSnapshot,
  VideoCaptionLane,
  VideoCaptionMetadata,
  VideoCaptionMode,
  VideoCaptionOutput,
  VideoCaptionProgress,
  VideoCaptionProjectStatus,
  VideoCaptionSource,
  VideoCaptionSourceReference,
  VideoCaptionStyle,
} from "../../shared/video-caption.contract";

export interface IVideoCaptionTransition {
  from?: VideoCaptionProjectStatus;
  to: VideoCaptionProjectStatus;
  operation?: VideoCaptionJobOperation | "create" | "update" | "cancel";
  actorId?: string;
  jobId?: Types.ObjectId;
  message?: string;
  at: Date;
}

export interface IVideoCaptionProject extends Document {
  companyCode: string;
  createdBy: string;
  creationIdempotencyKey: string;
  name: string;
  mode: VideoCaptionMode;
  source: VideoCaptionSource;
  video: VideoCaptionMetadata;
  contextLinks?: VideoCaptionContextLinks;
  contextBrief?: string;
  knowledgeSnapshot?: Omit<VideoCaptionKnowledgeSnapshot, "retrievedAt"> & {
    retrievedAt?: Date;
  };
  style: VideoCaptionStyle;
  status: VideoCaptionProjectStatus;
  currentVersion: number;
  progress?: VideoCaptionProgress;
  output?: VideoCaptionOutput;
  lastError?: Omit<VideoCaptionClassifiedError, "occurredAt"> & {
    occurredAt: Date;
  };
  transitions: IVideoCaptionTransition[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IVideoCaptionSegment extends Document {
  companyCode: string;
  projectId: Types.ObjectId;
  version: number;
  lane: VideoCaptionLane;
  startMs: number;
  endMs: number;
  text: string;
  sceneId?: string;
  confidence?: number;
  sourceReferences: VideoCaptionSourceReference[];
  styleOverride?: Partial<VideoCaptionStyle>;
  lockedByUser: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IVideoCaptionJob extends Document {
  companyCode: string;
  projectId: Types.ObjectId;
  operation: VideoCaptionJobOperation;
  status: VideoCaptionJobStatus;
  idempotencyKey: string;
  inputHash: string;
  attempt: number;
  maxAttempts: number;
  progress: VideoCaptionProgress;
  provider?: string;
  providerModel?: string;
  estimatedCost?: number;
  actualCost?: number;
  providerRequestId?: string;
  lockId?: string;
  lockedAt?: Date;
  lockExpiresAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelRequestedAt?: Date;
  lastError?: Omit<VideoCaptionClassifiedError, "occurredAt"> & {
    occurredAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}
