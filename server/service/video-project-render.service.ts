import mongoose from "mongoose";
import type {
  VideoProjectRenderAspectRatio,
  VideoProjectRenderResolution,
  VideoProjectRenderSnapshot,
} from "../interface/video-project-render.interface";
import type { VideoTemplateIdentity } from "../interface/video-template.interface";
import { VideoProjectRenderModel } from "../model/video-project-render.model";
import { VideoProjectModel } from "../model/video-project.model";
import { videoProjectRenderQueue } from "../queue/video-project-render-queue";
import {
  assertRenderableProject,
  editorProjectToBlueprint,
} from "./video-project-render-policy";
import {
  getVideoTemplateRenderEngine,
  reconcileShotstackRender,
} from "./shotstack-render.service";

type CreateRenderInput = {
  resolution: VideoProjectRenderResolution;
  idempotencyKey: string;
};

type RenderRecord = Record<string, unknown> & {
  toObject?: () => Record<string, unknown>;
};

type VideoProjectRenderErrorStatus = 400 | 404;

export class VideoProjectRenderError extends Error {
  constructor(
    readonly status: VideoProjectRenderErrorStatus,
    message: string
  ) {
    super(message);
    this.name = "VideoProjectRenderError";
  }
}

export function getVideoProjectRenderErrorStatus(error: unknown): VideoProjectRenderErrorStatus | undefined {
  return error instanceof VideoProjectRenderError ? error.status : undefined;
}

function assertObjectId(value: string, label: string) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new VideoProjectRenderError(400, `${label} không hợp lệ.`);
  }
}

async function getScopedProject(identity: VideoTemplateIdentity, projectId: string) {
  const project = await VideoProjectModel.findOne({
    _id: projectId,
    userId: identity.userId,
    companyCode: identity.companyCode,
  }).lean();
  if (!project) {
    throw new VideoProjectRenderError(404, "Không tìm thấy dự án video.");
  }
  return project;
}

function asPlainRecord(record: RenderRecord): Record<string, unknown> {
  return typeof record.toObject === "function" ? record.toObject() : record;
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === 11000
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isShotstackSourceEdit(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value.timeline) || !isRecord(value.output)) {
    return false;
  }
  return Array.isArray(value.timeline.tracks);
}

export function buildVideoProjectRenderSnapshot(
  project: Record<string, unknown>,
  resolution: VideoProjectRenderResolution
): VideoProjectRenderSnapshot & {
  aspectRatio: VideoProjectRenderAspectRatio;
  duration: number;
} {
  const editorState = isRecord(project.editorState) ? project.editorState : {};
  const tracks = Array.isArray(editorState.tracks)
    ? structuredClone(editorState.tracks)
    : [];
  const items = Array.isArray(editorState.items)
    ? structuredClone(editorState.items)
    : [];
  const aspectRatio = String(project.aspectRatio) as VideoProjectRenderAspectRatio;
  const duration = Number(editorState.duration ?? 0);
  return {
    title: String(project.title),
    aspectRatio,
    duration,
    tracks,
    items,
    settings: {
      resolution,
      aspectRatio,
      fps: 30,
    },
    ...(isShotstackSourceEdit(project.blueprint)
      ? { sourceEdit: structuredClone(project.blueprint) }
      : {}),
  };
}

export function serializeVideoProjectRender(record: RenderRecord) {
  const render = asPlainRecord(record);
  return {
    id: String(render._id),
    projectId: String(render.projectId),
    status: render.status,
    progress: Number(render.progress ?? 0),
    stageMessage: render.stageMessage,
    outputUrl: render.outputUrl,
    engine: render.engine,
    resolution: render.resolution,
    aspectRatio: render.aspectRatio,
    duration: Number(render.duration ?? 0),
    attempt: Number(render.attempt ?? 0),
    errorCode: render.errorCode,
    errorMessage: render.errorMessage,
    startedAt: render.startedAt,
    completedAt: render.completedAt,
    createdAt: render.createdAt,
    updatedAt: render.updatedAt,
  };
}

export async function createRender(
  identity: VideoTemplateIdentity,
  projectId: string,
  input: CreateRenderInput
) {
  assertObjectId(projectId, "ID dự án");
  if (input.resolution !== "720p" && input.resolution !== "1080p") {
    throw new VideoProjectRenderError(400, "Độ phân giải kết xuất không hợp lệ.");
  }

  const project = await getScopedProject(identity, projectId);

  const projectRecord = project as unknown as Record<string, unknown>;
  const snapshot = buildVideoProjectRenderSnapshot(projectRecord, input.resolution);
  const { aspectRatio, duration } = snapshot;

  try {
    assertRenderableProject(snapshot);
    void editorProjectToBlueprint(snapshot);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Dự án không thể kết xuất.";
    throw new VideoProjectRenderError(400, message);
  }

  const idempotencyFilter = {
    userId: identity.userId,
    companyCode: identity.companyCode,
    idempotencyKey: input.idempotencyKey,
  };
  const existing = await VideoProjectRenderModel.findOne(idempotencyFilter).lean();
  if (existing) {
    return serializeVideoProjectRender(existing as unknown as RenderRecord);
  }

  try {
    const created = await VideoProjectRenderModel.create({
      projectId,
      userId: identity.userId,
      companyCode: identity.companyCode,
      status: "queued",
      resolution: input.resolution,
      aspectRatio,
      duration,
      snapshot,
      progress: 0,
      stageMessage: "Queued for video rendering.",
      engine: getVideoTemplateRenderEngine(),
      attempt: 0,
      transferAttempt: 0,
      idempotencyKey: input.idempotencyKey,
    });
    if (!created) {
      throw new Error("Không thể tạo bản kết xuất video.");
    }
    await videoProjectRenderQueue.add(String(created._id));
    return serializeVideoProjectRender(created as unknown as RenderRecord);
  } catch (error: unknown) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
    const duplicate = await VideoProjectRenderModel.findOne(idempotencyFilter).lean();
    if (!duplicate) {
      throw error;
    }
    return serializeVideoProjectRender(duplicate as unknown as RenderRecord);
  }
}

export async function getRender(
  identity: VideoTemplateIdentity,
  projectId: string,
  renderId: string
) {
  assertObjectId(projectId, "ID dự án");
  assertObjectId(renderId, "ID bản kết xuất");
  let render = await VideoProjectRenderModel.findOne({
    _id: renderId,
    projectId,
    userId: identity.userId,
    companyCode: identity.companyCode,
  }).lean();
  if (!render) {
    throw new VideoProjectRenderError(404, "Không tìm thấy bản kết xuất video.");
  }
  if (
    render.engine === "shotstack" &&
    (render.status === "rendering" || render.status === "uploading") &&
    render.providerRenderId
  ) {
    await reconcileShotstackRender(renderId);
    const reconciled = await VideoProjectRenderModel.findOne({
      _id: renderId,
      projectId,
      userId: identity.userId,
      companyCode: identity.companyCode,
    }).lean();
    if (reconciled) render = reconciled;
  }
  return serializeVideoProjectRender(render as unknown as RenderRecord);
}

export async function listRenders(
  identity: VideoTemplateIdentity,
  projectId: string
) {
  assertObjectId(projectId, "ID dự án");
  await getScopedProject(identity, projectId);
  const renders = await VideoProjectRenderModel.find({
    projectId,
    userId: identity.userId,
    companyCode: identity.companyCode,
  })
    .sort({ createdAt: -1 })
    .lean();
  return {
    items: renders.map((render) =>
      serializeVideoProjectRender(render as unknown as RenderRecord)
    ),
  };
}
