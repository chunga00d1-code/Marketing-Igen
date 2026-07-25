import { randomUUID } from "crypto";
import mongoose from "mongoose";
import {
  CreateVideoCaptionProjectInput,
  ReplaceVideoCaptionSegmentsInput,
  UpdateVideoCaptionProjectInput,
  VideoCaptionJobDto,
  VideoCaptionJobOperation,
  VideoCaptionProjectDetailDto,
  VideoCaptionProjectDto,
  VideoCaptionProjectStatus,
  VideoCaptionSegmentDto,
} from "../../shared/video-caption.contract";
import {
  IVideoCaptionJob,
  IVideoCaptionProject,
  IVideoCaptionSegment,
} from "../interface/video-caption.interface";
import { VideoCaptionJobModel } from "../model/video-caption-job.model";
import { VideoCaptionProjectModel } from "../model/video-caption-project.model";
import { VideoCaptionSegmentModel } from "../model/video-caption-segment.model";
import {
  assertCaptionStatusTransition,
  buildCaptionJobIdempotencyKey,
  hashCaptionInput,
  normalizeCaptionCompanyCode,
  normalizeCaptionStyle,
} from "./video-caption-domain.service";
import {
  classifyVideoCaptionError,
  VideoCaptionError,
} from "./video-caption-error";
import { videoCaptionMediaService } from "./video-caption-media.service";
import { buildSpeechCaptionSegments } from "./video-caption-segmentation.service";
import {
  createSpeechTranscriptionProvider,
  normalizeElevenLabsTranscript,
  videoCaptionTranscriptionConfig,
} from "./video-caption-transcription.service";
import {
  serializeVideoCaptionSubtitles,
  VideoCaptionSubtitleFormat,
} from "./video-caption-subtitle.service";
import { createVideoCaptionRenderProvider } from "./video-caption-render.service";
import { videoCaptionContextService } from "./video-caption-context.service";

const JOB_LEASE_MS = 2 * 60 * 1000;
const MAX_TRANSITIONS = 100;
const DAILY_PROJECT_LIMIT = Math.max(
  1,
  Number(process.env.VIDEO_CAPTION_DAILY_PROJECT_LIMIT) || 100
);
const CAMPAIGN_DAILY_PROJECT_LIMIT = Math.max(
  1,
  Number(process.env.VIDEO_CAPTION_CAMPAIGN_DAILY_PROJECT_LIMIT) || 500
);

function logCaptionStt(event: string, data: Record<string, unknown>) {
  console.info(`[Video Caption STT Job] ${event}`, JSON.stringify(data));
}

function estimateDurationCost(
  durationMs: number | undefined,
  environmentKey:
    | "VIDEO_CAPTION_STT_COST_PER_MINUTE"
    | "VIDEO_CAPTION_CONTEXT_COST_PER_MINUTE"
    | "VIDEO_CAPTION_RENDER_COST_PER_MINUTE"
) {
  const rate = Number(process.env[environmentKey]) || 0;
  if (!durationMs || rate <= 0) return undefined;
  return Number(((durationMs / 60_000) * rate).toFixed(4));
}

function projectDto(project: IVideoCaptionProject): VideoCaptionProjectDto {
  return {
    id: String(project._id),
    name: project.name,
    mode: project.mode,
    source: {
      kind: project.source.kind,
      url: project.source.url,
      mediaId: project.source.mediaId,
      fingerprint: project.source.fingerprint,
      originalName: project.source.originalName,
    },
    video: {
      durationMs: project.video?.durationMs,
      width: project.video?.width,
      height: project.video?.height,
      fps: project.video?.fps,
      hasAudio: project.video?.hasAudio,
      language: project.video?.language,
      proxyUrl: project.video?.proxyUrl,
      contentType: project.video?.contentType,
      contentLength: project.video?.contentLength,
    },
    contextLinks: project.contextLinks
      ? {
          marketingContentId: project.contextLinks.marketingContentId,
          campaignId: project.contextLinks.campaignId,
          campaignSlotId: project.contextLinks.campaignSlotId,
        }
      : undefined,
    contextBrief: project.contextBrief,
    knowledgeSnapshot: project.knowledgeSnapshot
      ? {
          purpose: "caption",
          sourceIds: project.knowledgeSnapshot.sourceIds || [],
          indexVersion: project.knowledgeSnapshot.indexVersion,
          retrievedAt:
            project.knowledgeSnapshot.retrievedAt?.toISOString(),
        }
      : undefined,
    style: {
      preset: project.style.preset,
      fontFamily: project.style.fontFamily,
      fontSize: project.style.fontSize,
      fontWeight: project.style.fontWeight,
      textColor: project.style.textColor,
      backgroundColor: project.style.backgroundColor,
      backgroundOpacity: project.style.backgroundOpacity,
      position: project.style.position,
      maxLines: project.style.maxLines,
      safeAreaPercent: project.style.safeAreaPercent,
    },
    status: project.status,
    currentVersion: project.currentVersion,
    progress: project.progress
      ? {
          stage: project.progress.stage,
          percent: project.progress.percent,
          message: project.progress.message,
        }
      : undefined,
    output: project.output
      ? {
          subtitleUrl: project.output.subtitleUrl,
          captionedVideoUrl: project.output.captionedVideoUrl,
          previewUrl: project.output.previewUrl,
          renderHash: project.output.renderHash,
        }
      : undefined,
    lastError: project.lastError
      ? {
          type: project.lastError.type,
          code: project.lastError.code,
          message: project.lastError.message,
          retryable: project.lastError.retryable,
          occurredAt: project.lastError.occurredAt.toISOString(),
        }
      : undefined,
    createdBy: project.createdBy,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function segmentDto(segment: IVideoCaptionSegment): VideoCaptionSegmentDto {
  return {
    id: String(segment._id),
    projectId: String(segment.projectId),
    version: segment.version,
    lane: segment.lane,
    startMs: segment.startMs,
    endMs: segment.endMs,
    text: segment.text,
    sceneId: segment.sceneId,
    confidence: segment.confidence,
    sourceReferences: segment.sourceReferences || [],
    styleOverride: segment.styleOverride,
    lockedByUser: segment.lockedByUser,
    sortOrder: segment.sortOrder,
    createdAt: segment.createdAt.toISOString(),
    updatedAt: segment.updatedAt.toISOString(),
  };
}

function jobDto(job: IVideoCaptionJob): VideoCaptionJobDto {
  return {
    id: String(job._id),
    projectId: String(job.projectId),
    operation: job.operation,
    status: job.status,
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    progress: {
      stage: job.progress.stage,
      percent: job.progress.percent,
      message: job.progress.message,
    },
    provider: job.provider,
    model: job.providerModel,
    estimatedCost: job.estimatedCost,
    actualCost: job.actualCost,
    lastError: job.lastError
      ? {
          type: job.lastError.type,
          code: job.lastError.code,
          message: job.lastError.message,
          retryable: job.lastError.retryable,
          occurredAt: job.lastError.occurredAt.toISOString(),
        }
      : undefined,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

async function requireProject(
  companyCode: string,
  projectId: string
): Promise<IVideoCaptionProject> {
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    throw new VideoCaptionError(
      "Mã dự án caption không hợp lệ.",
      "INVALID_PROJECT_ID",
      "validation",
      false,
      400
    );
  }

  const project = await VideoCaptionProjectModel.findOne({
    _id: projectId,
    companyCode: normalizeCaptionCompanyCode(companyCode),
  });

  if (!project) {
    throw new VideoCaptionError(
      "Không tìm thấy dự án caption.",
      "CAPTION_PROJECT_NOT_FOUND",
      "validation",
      false,
      404
    );
  }
  return project;
}

async function transitionProject(input: {
  project: IVideoCaptionProject;
  to: VideoCaptionProjectStatus;
  operation?: VideoCaptionJobOperation | "create" | "update" | "cancel";
  actorId?: string;
  jobId?: string;
  message?: string;
  set?: Record<string, unknown>;
}) {
  const from = input.project.status;
  assertCaptionStatusTransition(from, input.to);
  const transition = {
    from,
    to: input.to,
    operation: input.operation,
    actorId: input.actorId,
    jobId:
      input.jobId && mongoose.Types.ObjectId.isValid(input.jobId)
        ? new mongoose.Types.ObjectId(input.jobId)
        : undefined,
    message: input.message,
    at: new Date(),
  };

  const updated = await VideoCaptionProjectModel.findOneAndUpdate(
    {
      _id: input.project._id,
      companyCode: input.project.companyCode,
      status: from,
    },
    {
      $set: {
        status: input.to,
        ...(input.set || {}),
      },
      $push: {
        transitions: {
          $each: [transition],
          $slice: -MAX_TRANSITIONS,
        },
      },
    },
    { returnDocument: "after", runValidators: true }
  );

  if (!updated) {
    throw new VideoCaptionError(
      "Trạng thái dự án vừa thay đổi. Vui lòng tải lại trước khi thử lại.",
      "PROJECT_STATE_CONFLICT",
      "transient",
      true,
      409
    );
  }
  return updated;
}

function validateSegmentTimeline(
  input: ReplaceVideoCaptionSegmentsInput,
  durationMs?: number
) {
  for (const segment of input.segments) {
    if (segment.endMs <= segment.startMs) {
      throw new VideoCaptionError(
        "Thời điểm kết thúc caption phải lớn hơn thời điểm bắt đầu.",
        "INVALID_SEGMENT_DURATION",
        "validation",
        false,
        400
      );
    }
    if (durationMs && segment.endMs > durationMs) {
      throw new VideoCaptionError(
        "Caption nằm ngoài thời lượng video.",
        "SEGMENT_OUT_OF_RANGE",
        "validation",
        false,
        400
      );
    }
  }

  for (const lane of ["speech", "context"] as const) {
    const laneSegments = input.segments
      .filter((segment) => segment.lane === lane)
      .sort((a, b) => a.startMs - b.startMs);
    for (let index = 1; index < laneSegments.length; index += 1) {
      if (laneSegments[index].startMs < laneSegments[index - 1].endMs) {
        throw new VideoCaptionError(
          `Các caption trong lane ${lane} đang chồng thời gian.`,
          "SEGMENT_OVERLAP",
          "validation",
          false,
          400
        );
      }
    }
  }
}

async function replaceGeneratedLane(input: {
  project: IVideoCaptionProject;
  lane: "speech" | "context";
  segments: Array<
    Omit<
      VideoCaptionSegmentDto,
      "id" | "projectId" | "version" | "createdAt" | "updatedAt"
    >
  >;
}) {
  const nextVersion = input.project.currentVersion + 1;
  const retained = await VideoCaptionSegmentModel.find({
    companyCode: input.project.companyCode,
    projectId: input.project._id,
    version: input.project.currentVersion,
    lane: { $ne: input.lane },
  }).lean();
  const documents = [
    ...retained.map((segment) => ({
      companyCode: input.project.companyCode,
      projectId: input.project._id,
      version: nextVersion,
      lane: segment.lane,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text,
      sceneId: segment.sceneId,
      confidence: segment.confidence,
      sourceReferences: segment.sourceReferences || [],
      styleOverride: segment.styleOverride,
      lockedByUser: segment.lockedByUser,
      sortOrder: segment.sortOrder,
    })),
    ...input.segments.map((segment, index) => ({
      ...segment,
      companyCode: input.project.companyCode,
      projectId: input.project._id,
      version: nextVersion,
      sortOrder: index,
    })),
  ];

  if (documents.length) {
    await VideoCaptionSegmentModel.insertMany(documents, {
      ordered: true,
    });
  }
  return nextVersion;
}

type NormalizedSpeechTranscript = {
  language?: string;
  words: Array<{
    text: string;
    startMs: number;
    endMs: number;
    confidence?: number;
  }>;
  cost?: number;
};

async function completeSpeechTranscription(input: {
  job: IVideoCaptionJob;
  project: IVideoCaptionProject;
  transcript: NormalizedSpeechTranscript;
  lockId: string;
}) {
  const { job, transcript, lockId } = input;
  let project = input.project;
  const refreshedJob = await VideoCaptionJobModel.findById(job._id);
  if (refreshedJob?.cancelRequestedAt || refreshedJob?.status === "cancelled") {
    await VideoCaptionJobModel.updateOne(
      { _id: job._id, lockId },
      {
        $set: {
          status: "cancelled",
          completedAt: new Date(),
          progress: {
            stage: "cancelled",
            percent: 0,
            message: "Tác vụ đã được hủy.",
          },
        },
        $unset: { lockId: 1, lockedAt: 1, lockExpiresAt: 1 },
      }
    );
    return;
  }

  await Promise.all([
    VideoCaptionJobModel.updateOne(
      { _id: job._id, lockId },
      {
        $set: {
          progress: {
            stage: "segmenting",
            percent: 80,
            message: "Đang chia lời nói thành các đoạn phụ đề dễ đọc.",
          },
          lockExpiresAt: new Date(Date.now() + JOB_LEASE_MS),
        },
      }
    ),
    VideoCaptionProjectModel.updateOne(
      { _id: project._id, companyCode: project.companyCode },
      {
        $set: {
          progress: {
            stage: "segmenting",
            percent: 80,
            message: "Đang chia lời nói thành các đoạn phụ đề dễ đọc.",
          },
        },
      }
    ),
  ]);

  const segments = buildSpeechCaptionSegments(
    transcript.words,
    project.video.durationMs
  ).map((segment) => ({
    ...segment,
    sourceReferences: segment.sourceReferences.map((reference) => ({
      ...reference,
      sourceId: String(job._id),
    })),
  }));

  let nextVersion = project.currentVersion;
  if (segments.length) {
    nextVersion = await replaceGeneratedLane({
      project,
      lane: "speech",
      segments,
    });
  }

  project = await VideoCaptionProjectModel.findById(project._id);
  if (!project || project.status === "cancelled") return;
  const noSpeech = segments.length === 0;
  await transitionProject({
    project,
    to: "ready_for_review",
    operation: "transcribe",
    jobId: String(job._id),
    message: noSpeech
      ? "Không phát hiện lời nói trong video."
      : `Đã tạo ${segments.length} đoạn phụ đề lời nói.`,
    set: {
      currentVersion: nextVersion,
      "video.language": transcript.language || project.video.language,
      progress: {
        stage: noSpeech ? "no_speech" : "transcription_completed",
        percent: 100,
        message: noSpeech
          ? "Không phát hiện lời nói. Bạn vẫn có thể dùng caption ngữ cảnh."
          : `Đã tạo ${segments.length} đoạn phụ đề. Hãy kiểm tra trước khi kết xuất.`,
      },
      lastError: null,
    },
  });

  await VideoCaptionJobModel.updateOne(
    { _id: job._id, lockId },
    {
      $set: {
        status: "completed",
        completedAt: new Date(),
        providerModel: videoCaptionTranscriptionConfig.model,
        actualCost: transcript.cost,
        progress: {
          stage: noSpeech ? "no_speech" : "completed",
          percent: 100,
          message: noSpeech
            ? "Không phát hiện lời nói."
            : "Nhận diện lời nói hoàn tất.",
        },
      },
      $unset: { lockId: 1, lockedAt: 1, lockExpiresAt: 1 },
    }
  );
  logCaptionStt("completed", {
    jobId: String(job._id),
    projectId: String(project._id),
    companyCode: project.companyCode,
    providerRequestId: job.providerRequestId || null,
    language: transcript.language || null,
    inputWordCount: transcript.words.length,
    segmentCount: segments.length,
    noSpeech,
    version: nextVersion,
  });
}

export const videoCaptionService = {
  async createProject(
    companyCode: string,
    userId: string,
    input: CreateVideoCaptionProjectInput
  ) {
    const normalizedCompanyCode =
      normalizeCaptionCompanyCode(companyCode);
    const preliminaryFingerprint = hashCaptionInput({
      url: input.source.url.trim(),
      mediaId: input.source.mediaId,
    });
    const existingProject = await VideoCaptionProjectModel.findOne({
      companyCode: normalizedCompanyCode,
      creationIdempotencyKey: input.idempotencyKey,
    });
    if (existingProject) {
      return { project: projectDto(existingProject), created: false };
    }
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const dailyProjectLimit =
      input.source.kind === "campaign"
        ? CAMPAIGN_DAILY_PROJECT_LIMIT
        : DAILY_PROJECT_LIMIT;
    const projectsToday = await VideoCaptionProjectModel.countDocuments({
      companyCode: normalizedCompanyCode,
      createdBy: userId,
      "source.kind": input.source.kind,
      createdAt: { $gte: startOfDay },
    });
    if (projectsToday >= dailyProjectLimit) {
      throw new VideoCaptionError(
        `Bạn đã đạt giới hạn ${dailyProjectLimit} dự án caption trong ngày.`,
        "CAPTION_DAILY_PROJECT_LIMIT",
        "budget",
        false,
        429
      );
    }

    try {
      const project = await VideoCaptionProjectModel.create({
        companyCode: normalizedCompanyCode,
        createdBy: userId,
        creationIdempotencyKey: input.idempotencyKey,
        name: input.name.trim(),
        mode: input.mode,
        source: {
          ...input.source,
          url: input.source.url.trim(),
          fingerprint: preliminaryFingerprint,
        },
        video: {},
        contextLinks: input.contextLinks,
        contextBrief: input.contextBrief?.trim(),
        style: normalizeCaptionStyle(input.style),
        status: "draft",
        currentVersion: 1,
        progress: {
          stage: "draft",
          percent: 0,
          message: "Dự án đã được lưu.",
        },
        transitions: [
          {
            to: "draft",
            operation: "create",
            actorId: userId,
            message: "Khởi tạo dự án caption.",
            at: new Date(),
          },
        ],
      });
      return { project: projectDto(project), created: true };
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === 11000
      ) {
        const existing = await VideoCaptionProjectModel.findOne({
          companyCode: normalizedCompanyCode,
          creationIdempotencyKey: input.idempotencyKey,
        });
        if (existing) {
          return { project: projectDto(existing), created: false };
        }
      }
      throw error;
    }
  },

  async listProjects(
    companyCode: string,
    options: {
      page: number;
      limit: number;
      status?: VideoCaptionProjectStatus;
      mode?: string;
    }
  ) {
    const filter: Record<string, unknown> = {
      companyCode: normalizeCaptionCompanyCode(companyCode),
    };
    if (options.status) filter.status = options.status;
    if (options.mode) filter.mode = options.mode;

    const [projects, total] = await Promise.all([
      VideoCaptionProjectModel.find(filter)
        .sort({ updatedAt: -1 })
        .skip((options.page - 1) * options.limit)
        .limit(options.limit),
      VideoCaptionProjectModel.countDocuments(filter),
    ]);

    return {
      projects: projects.map(projectDto),
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        totalPages: Math.ceil(total / options.limit),
      },
    };
  },

  async getProjectDetail(
    companyCode: string,
    projectId: string
  ): Promise<VideoCaptionProjectDetailDto> {
    const project = await requireProject(companyCode, projectId);
    const [segments, jobs] = await Promise.all([
      VideoCaptionSegmentModel.find({
        companyCode: project.companyCode,
        projectId: project._id,
        version: project.currentVersion,
      }).sort({ lane: 1, sortOrder: 1 }),
      VideoCaptionJobModel.find({
        companyCode: project.companyCode,
        projectId: project._id,
      })
        .sort({ createdAt: -1 })
        .limit(20),
    ]);

    return {
      project: projectDto(project),
      segments: segments.map(segmentDto),
      jobs: jobs.map(jobDto),
    };
  },

  async updateProject(
    companyCode: string,
    projectId: string,
    actorId: string,
    input: UpdateVideoCaptionProjectInput
  ) {
    const project = await requireProject(companyCode, projectId);
    const set: Record<string, unknown> = {};
    if (input.name !== undefined) set.name = input.name.trim();
    if (input.mode !== undefined) set.mode = input.mode;
    if (input.contextLinks !== undefined) {
      set.contextLinks = input.contextLinks;
    }
    if (input.contextBrief !== undefined) {
      set.contextBrief = input.contextBrief.trim();
    }
    if (input.style !== undefined) {
      set.style = normalizeCaptionStyle({
        ...project.style,
        ...input.style,
      });
    }

    const updated = await VideoCaptionProjectModel.findOneAndUpdate(
      { _id: project._id, companyCode: project.companyCode },
      {
        $set: set,
        $push: {
          transitions: {
            $each: [
              {
                from: project.status,
                to: project.status,
                operation: "update",
                actorId,
                message: "Cập nhật thông tin dự án.",
                at: new Date(),
              },
            ],
            $slice: -MAX_TRANSITIONS,
          },
        },
      },
      { returnDocument: "after", runValidators: true }
    );

    if (!updated) {
      throw new VideoCaptionError(
        "Không thể cập nhật dự án caption.",
        "CAPTION_PROJECT_UPDATE_FAILED",
        "transient",
        true,
        409
      );
    }
    return projectDto(updated);
  },

  async prepareAnalysisJob(
    companyCode: string,
    projectId: string,
    actorId: string
  ) {
    let project = await requireProject(companyCode, projectId);
    if (
      !["draft", "ready_for_review", "completed", "failed", "cancelled"].includes(
        project.status
      )
    ) {
      const running = await VideoCaptionJobModel.findOne({
        companyCode: project.companyCode,
        projectId: project._id,
        operation: "analyze",
        status: {
          $in: ["queued", "processing", "awaiting_provider", "retrying"],
        },
      }).sort({ createdAt: -1 });
      if (running) return jobDto(running);
      throw new VideoCaptionError(
        "Dự án đang được xử lý ở một bước khác.",
        "PROJECT_BUSY",
        "validation",
        false,
        409
      );
    }

    const settingsHash = hashCaptionInput({
      source: project.source,
      style: project.style,
    });
    const idempotencyKey = buildCaptionJobIdempotencyKey({
      companyCode: project.companyCode,
      projectId: String(project._id),
      fingerprint:
        project.source.fingerprint ||
        hashCaptionInput(project.source.url),
      mode: project.mode,
      inputVersion: project.currentVersion,
      settingsHash,
      operation: "analyze",
    });

    let job = await VideoCaptionJobModel.findOne({
      companyCode: project.companyCode,
      idempotencyKey,
    });

    if (job?.status === "completed") return jobDto(job);
    if (job) {
      job.status = "queued";
      job.progress = {
        stage: "queued",
        percent: 0,
        message: "Đã đưa lại tác vụ phân tích vào hàng đợi.",
      };
      job.lastError = undefined;
      job.cancelRequestedAt = undefined;
      job.lockId = undefined;
      job.lockedAt = undefined;
      job.lockExpiresAt = undefined;
      await job.save();
    } else {
      job = await VideoCaptionJobModel.create({
        companyCode: project.companyCode,
        projectId: project._id,
        operation: "analyze",
        status: "queued",
        idempotencyKey,
        inputHash: settingsHash,
        attempt: 0,
        maxAttempts: 3,
        progress: {
          stage: "queued",
          percent: 0,
          message: "Đang chờ phân tích video.",
        },
      });
    }

    project = await transitionProject({
      project,
      to: "queued_analysis",
      operation: "analyze",
      actorId,
      jobId: String(job._id),
      message: "Đưa tác vụ phân tích video vào hàng đợi.",
      set: {
        progress: {
          stage: "queued_analysis",
          percent: 0,
          message: "Đang chờ worker phân tích video.",
        },
        lastError: null,
      },
    });
    return { ...jobDto(job), project: projectDto(project) };
  },

  async prepareTranscriptionJob(
    companyCode: string,
    projectId: string,
    actorId: string
  ) {
    let project = await requireProject(companyCode, projectId);
    if (!["speech", "combined"].includes(project.mode)) {
      throw new VideoCaptionError(
        "Dự án đang ở chế độ caption ngữ cảnh nên không thể nhận diện lời nói.",
        "SPEECH_MODE_REQUIRED",
        "validation",
        false,
        409
      );
    }
    if (
      !["ready_for_review", "failed", "cancelled"].includes(
        project.status
      )
    ) {
      const running = await VideoCaptionJobModel.findOne({
        companyCode: project.companyCode,
        projectId: project._id,
        operation: "transcribe",
        status: {
          $in: ["queued", "processing", "awaiting_provider", "retrying"],
        },
      }).sort({ createdAt: -1 });
      if (running) return jobDto(running);
      throw new VideoCaptionError(
        "Hãy chờ phân tích video hoàn tất trước khi tạo phụ đề lời nói.",
        "VIDEO_ANALYSIS_REQUIRED",
        "validation",
        false,
        409
      );
    }
    if (project.video.hasAudio === false) {
      throw new VideoCaptionError(
        "Video không có luồng âm thanh để nhận diện lời nói.",
        "VIDEO_HAS_NO_AUDIO",
        "validation",
        false,
        422
      );
    }

    const settingsHash = hashCaptionInput({
      sourceFingerprint: project.source.fingerprint,
      language: project.video.language,
      model: videoCaptionTranscriptionConfig.model,
    });
    const idempotencyKey = buildCaptionJobIdempotencyKey({
      companyCode: project.companyCode,
      projectId: String(project._id),
      fingerprint:
        project.source.fingerprint ||
        hashCaptionInput(project.source.url),
      mode: project.mode,
      inputVersion: project.currentVersion,
      settingsHash,
      operation: "transcribe",
    });

    let job = await VideoCaptionJobModel.findOne({
      companyCode: project.companyCode,
      idempotencyKey,
    });
    if (job?.status === "completed") return jobDto(job);
    if (job) {
      job.status = "queued";
      job.progress = {
        stage: "queued",
        percent: 0,
        message: "Đã đưa lại tác vụ nhận diện lời nói vào hàng đợi.",
      };
      job.lastError = undefined;
      job.cancelRequestedAt = undefined;
      job.lockId = undefined;
      job.lockedAt = undefined;
      job.lockExpiresAt = undefined;
      await job.save();
    } else {
      job = await VideoCaptionJobModel.create({
        companyCode: project.companyCode,
        projectId: project._id,
        operation: "transcribe",
        status: "queued",
        idempotencyKey,
        inputHash: settingsHash,
        attempt: 0,
        maxAttempts: 3,
        provider: videoCaptionTranscriptionConfig.provider,
        providerModel: videoCaptionTranscriptionConfig.model,
        estimatedCost: estimateDurationCost(
          project.video.durationMs,
          "VIDEO_CAPTION_STT_COST_PER_MINUTE"
        ),
        progress: {
          stage: "queued",
          percent: 0,
          message: "Đang chờ nhận diện lời nói.",
        },
      });
    }

    if (project.status === "failed" || project.status === "cancelled") {
      project = await transitionProject({
        project,
        to: "retrying",
        operation: "transcribe",
        actorId,
        jobId: String(job._id),
        message: "Khôi phục tác vụ nhận diện lời nói.",
      });
    }
    project = await transitionProject({
      project,
      to: "transcribing",
      operation: "transcribe",
      actorId,
      jobId: String(job._id),
      message: "Đưa tác vụ nhận diện lời nói vào hàng đợi.",
      set: {
        progress: {
          stage: "queued_transcription",
          percent: 0,
          message: "Đang chờ worker nhận diện lời nói.",
        },
        lastError: null,
      },
    });
    return { ...jobDto(job), project: projectDto(project) };
  },

  async prepareRenderJob(
    companyCode: string,
    projectId: string,
    actorId: string,
    preview: boolean
  ) {
    let project = await requireProject(companyCode, projectId);
    if (
      !["ready_for_review", "completed", "failed", "cancelled"].includes(
        project.status
      )
    ) {
      const running = await VideoCaptionJobModel.findOne({
        companyCode: project.companyCode,
        projectId: project._id,
        operation: preview ? "render_preview" : "render_final",
        status: { $in: ["queued", "processing", "retrying"] },
      }).sort({ createdAt: -1 });
      if (running) return jobDto(running);
      throw new VideoCaptionError(
        "Dự án đang được xử lý ở một bước khác.",
        "PROJECT_BUSY",
        "validation",
        false,
        409
      );
    }

    const segmentCount = await VideoCaptionSegmentModel.countDocuments({
      companyCode: project.companyCode,
      projectId: project._id,
      version: project.currentVersion,
    });
    if (!segmentCount) {
      throw new VideoCaptionError(
        "Dự án chưa có caption để kết xuất.",
        "CAPTION_SEGMENTS_REQUIRED",
        "validation",
        false,
        422
      );
    }

    const operation = preview ? "render_preview" : "render_final";
    const settingsHash = hashCaptionInput({
      version: project.currentVersion,
      style: project.style,
      preview,
    });
    const idempotencyKey = buildCaptionJobIdempotencyKey({
      companyCode: project.companyCode,
      projectId: String(project._id),
      fingerprint:
        project.source.fingerprint ||
        hashCaptionInput(project.source.url),
      mode: project.mode,
      inputVersion: project.currentVersion,
      settingsHash,
      operation,
    });

    let job = await VideoCaptionJobModel.findOne({
      companyCode: project.companyCode,
      idempotencyKey,
    });
    if (job?.status === "completed") return jobDto(job);
    if (job) {
      job.status = "queued";
      job.progress = {
        stage: "queued",
        percent: 0,
        message: "Đã đưa lại tác vụ kết xuất vào hàng đợi.",
      };
      job.lastError = undefined;
      job.cancelRequestedAt = undefined;
      job.lockId = undefined;
      job.lockedAt = undefined;
      job.lockExpiresAt = undefined;
      await job.save();
    } else {
      job = await VideoCaptionJobModel.create({
        companyCode: project.companyCode,
        projectId: project._id,
        operation,
        status: "queued",
        idempotencyKey,
        inputHash: settingsHash,
        attempt: 0,
        maxAttempts: 3,
        provider: "ffmpeg-ass",
        estimatedCost: estimateDurationCost(
          project.video.durationMs,
          "VIDEO_CAPTION_RENDER_COST_PER_MINUTE"
        ),
        progress: {
          stage: "queued",
          percent: 0,
          message: preview
            ? "Đang chờ kết xuất bản xem thử."
            : "Đang chờ kết xuất video hoàn chỉnh.",
        },
      });
    }

    if (project.status === "failed" || project.status === "cancelled") {
      project = await transitionProject({
        project,
        to: "retrying",
        operation,
        actorId,
        jobId: String(job._id),
        message: "Khôi phục tác vụ kết xuất.",
      });
    }
    project = await transitionProject({
      project,
      to: "queued_render",
      operation,
      actorId,
      jobId: String(job._id),
      message: preview
        ? "Đưa bản xem thử vào hàng đợi kết xuất."
        : "Đưa video hoàn chỉnh vào hàng đợi kết xuất.",
      set: {
        progress: {
          stage: "queued_render",
          percent: 0,
          message: "Đang chờ worker kết xuất video.",
        },
        lastError: null,
      },
    });
    return { ...jobDto(job), project: projectDto(project) };
  },

  async prepareContextJob(
    companyCode: string,
    projectId: string,
    actorId: string
  ) {
    let project = await requireProject(companyCode, projectId);
    if (!["context", "combined"].includes(project.mode)) {
      throw new VideoCaptionError(
        "Dự án đang ở chế độ phụ đề lời nói nên không thể tạo caption ngữ cảnh.",
        "CONTEXT_MODE_REQUIRED",
        "validation",
        false,
        409
      );
    }
    if (
      !["ready_for_review", "failed", "cancelled"].includes(
        project.status
      )
    ) {
      const running = await VideoCaptionJobModel.findOne({
        companyCode: project.companyCode,
        projectId: project._id,
        operation: "generate_context",
        status: { $in: ["queued", "processing", "retrying"] },
      }).sort({ createdAt: -1 });
      if (running) return jobDto(running);
      throw new VideoCaptionError(
        "Hãy chờ bước xử lý hiện tại hoàn tất trước khi tạo caption ngữ cảnh.",
        "PROJECT_BUSY",
        "validation",
        false,
        409
      );
    }

    const settingsHash = hashCaptionInput({
      sourceFingerprint: project.source.fingerprint,
      contextBrief: project.contextBrief,
      contextLinks: project.contextLinks,
      model: process.env.VIDEO_CAPTION_CONTEXT_MODEL || "gemini-2.5-flash",
    });
    const idempotencyKey = buildCaptionJobIdempotencyKey({
      companyCode: project.companyCode,
      projectId: String(project._id),
      fingerprint:
        project.source.fingerprint ||
        hashCaptionInput(project.source.url),
      mode: project.mode,
      inputVersion: project.currentVersion,
      settingsHash,
      operation: "generate_context",
    });
    let job = await VideoCaptionJobModel.findOne({
      companyCode: project.companyCode,
      idempotencyKey,
    });
    if (job?.status === "completed") return jobDto(job);
    if (job) {
      job.status = "queued";
      job.progress = {
        stage: "queued",
        percent: 0,
        message: "Đã đưa lại tác vụ caption ngữ cảnh vào hàng đợi.",
      };
      job.lastError = undefined;
      job.cancelRequestedAt = undefined;
      job.lockId = undefined;
      job.lockedAt = undefined;
      job.lockExpiresAt = undefined;
      await job.save();
    } else {
      job = await VideoCaptionJobModel.create({
        companyCode: project.companyCode,
        projectId: project._id,
        operation: "generate_context",
        status: "queued",
        idempotencyKey,
        inputHash: settingsHash,
        attempt: 0,
        maxAttempts: 3,
        provider: "gemini",
        providerModel:
          process.env.VIDEO_CAPTION_CONTEXT_MODEL || "gemini-2.5-flash",
        estimatedCost: estimateDurationCost(
          project.video.durationMs,
          "VIDEO_CAPTION_CONTEXT_COST_PER_MINUTE"
        ),
        progress: {
          stage: "queued",
          percent: 0,
          message: "Đang chờ phân tích video và truy xuất tri thức.",
        },
      });
    }

    if (project.status === "failed" || project.status === "cancelled") {
      project = await transitionProject({
        project,
        to: "retrying",
        operation: "generate_context",
        actorId,
        jobId: String(job._id),
        message: "Khôi phục tác vụ caption ngữ cảnh.",
      });
    }
    project = await transitionProject({
      project,
      to: "generating_context",
      operation: "generate_context",
      actorId,
      jobId: String(job._id),
      message: "Đưa tác vụ caption ngữ cảnh vào hàng đợi.",
      set: {
        progress: {
          stage: "queued_context",
          percent: 0,
          message: "Đang chờ worker tạo caption ngữ cảnh.",
        },
        lastError: null,
      },
    });
    return { ...jobDto(job), project: projectDto(project) };
  },

  async processJob(jobId: string) {
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      throw new VideoCaptionError(
        "Mã tác vụ caption không hợp lệ.",
        "INVALID_JOB_ID",
        "validation",
        false,
        400
      );
    }

    const now = new Date();
    const lockId = randomUUID();
    const job = await VideoCaptionJobModel.findOneAndUpdate(
      {
        _id: jobId,
        status: { $in: ["queued", "retrying"] },
        $or: [
          { lockExpiresAt: { $exists: false } },
          { lockExpiresAt: null },
          { lockExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: {
          status: "processing",
          lockId,
          lockedAt: now,
          lockExpiresAt: new Date(now.getTime() + JOB_LEASE_MS),
          startedAt: now,
          progress: {
            stage: "starting",
            percent: 5,
            message: "Worker đã nhận tác vụ.",
          },
        },
        $inc: { attempt: 1 },
      },
      { returnDocument: "after" }
    );

    if (!job) return;

    let project = await VideoCaptionProjectModel.findOne({
      _id: job.projectId,
      companyCode: job.companyCode,
    });
    if (!project) {
      throw new VideoCaptionError(
        "Dự án của tác vụ caption không còn tồn tại.",
        "CAPTION_PROJECT_NOT_FOUND",
        "terminal",
        false,
        404
      );
    }

    const updateProgress = async (
      stage: string,
      percent: number,
      message: string
    ) => {
      await Promise.all([
        VideoCaptionJobModel.updateOne(
          { _id: job._id, lockId, status: "processing" },
          {
            $set: {
              progress: { stage, percent, message },
              lockExpiresAt: new Date(Date.now() + JOB_LEASE_MS),
            },
          }
        ),
        VideoCaptionProjectModel.updateOne(
          { _id: project!._id, companyCode: project!.companyCode },
          { $set: { progress: { stage, percent, message } } }
        ),
      ]);
    };
    const heartbeat = setInterval(() => {
      void VideoCaptionJobModel.updateOne(
        { _id: job._id, lockId, status: "processing" },
        {
          $set: {
            lockExpiresAt: new Date(Date.now() + JOB_LEASE_MS),
          },
        }
      ).catch((error) => {
        console.error(
          `[Video Caption Worker] Lease heartbeat failed for ${job._id}:`,
          error
        );
      });
    }, 30_000);
    heartbeat.unref();

    try {
      if (job.operation === "generate_context") {
        if (project.status !== "generating_context") {
          project = await transitionProject({
            project,
            to: "generating_context",
            operation: "generate_context",
            jobId: String(job._id),
            message: "Bắt đầu phân tích video và truy xuất tri thức.",
            set: {
              progress: {
                stage: "retrieving_context",
                percent: 10,
                message: "Đang đọc bài viết, chiến dịch và tài liệu doanh nghiệp.",
              },
            },
          });
        }
        await updateProgress(
          "analyzing_scenes",
          25,
          "Đang nhận diện các khoảnh khắc phù hợp để đặt caption."
        );
        const generated = await videoCaptionContextService.generate(
          project,
          job.idempotencyKey
        );
        if (!generated.segments.length) {
          throw new VideoCaptionError(
            "Không tạo được caption nào có nguồn tham chiếu đủ tin cậy.",
            "CONTEXT_NO_GROUNDED_CAPTIONS",
            "validation",
            false,
            422
          );
        }

        const refreshedJob = await VideoCaptionJobModel.findById(job._id);
        if (refreshedJob?.cancelRequestedAt) {
          await VideoCaptionJobModel.updateOne(
            { _id: job._id, lockId },
            {
              $set: {
                status: "cancelled",
                completedAt: new Date(),
                progress: {
                  stage: "cancelled",
                  percent: 0,
                  message: "Tác vụ đã được hủy.",
                },
              },
              $unset: {
                lockId: 1,
                lockedAt: 1,
                lockExpiresAt: 1,
              },
            }
          );
          return;
        }

        await updateProgress(
          "saving_context_captions",
          85,
          "Đang lưu caption cùng nguồn trích dẫn."
        );
        const nextVersion = await replaceGeneratedLane({
          project,
          lane: "context",
          segments: generated.segments,
        });
        project = await VideoCaptionProjectModel.findById(project._id);
        if (!project || project.status === "cancelled") return;
        await transitionProject({
          project,
          to: "ready_for_review",
          operation: "generate_context",
          jobId: String(job._id),
          message: `Đã tạo ${generated.segments.length} caption ngữ cảnh có trích dẫn.`,
          set: {
            currentVersion: nextVersion,
            "video.language":
              generated.language || project.video.language,
            knowledgeSnapshot: {
              purpose: "caption",
              sourceIds: generated.knowledgeSourceIds,
              indexVersion: hashCaptionInput(
                generated.knowledgeSourceIds
              ).slice(0, 16),
              retrievedAt: new Date(),
            },
            progress: {
              stage: "context_completed",
              percent: 100,
              message: `Đã tạo ${generated.segments.length} caption ngữ cảnh. Hãy kiểm tra nguồn trước khi kết xuất.`,
            },
            lastError: null,
          },
        });
        await VideoCaptionJobModel.updateOne(
          { _id: job._id, lockId },
          {
            $set: {
              status: "completed",
              completedAt: new Date(),
              provider: generated.provider,
              providerModel: generated.model,
              progress: {
                stage: "completed",
                percent: 100,
                message: "Tạo caption ngữ cảnh hoàn tất.",
              },
            },
            $unset: {
              lockId: 1,
              lockedAt: 1,
              lockExpiresAt: 1,
            },
          }
        );
        return;
      }

      if (
        job.operation === "render_preview" ||
        job.operation === "render_final"
      ) {
        const preview = job.operation === "render_preview";
        if (project.status !== "rendering") {
          project = await transitionProject({
            project,
            to: "rendering",
            operation: job.operation,
            jobId: String(job._id),
            message: preview
              ? "Bắt đầu kết xuất bản xem thử."
              : "Bắt đầu kết xuất video hoàn chỉnh.",
            set: {
              progress: {
                stage: "rendering",
                percent: 10,
                message: "Đang ghép caption vào video.",
              },
            },
          });
        }

        const segments = await VideoCaptionSegmentModel.find({
          companyCode: project.companyCode,
          projectId: project._id,
          version: project.currentVersion,
        }).sort({ startMs: 1, lane: 1, sortOrder: 1 });
        if (!segments.length) {
          throw new VideoCaptionError(
            "Dự án chưa có caption để kết xuất.",
            "CAPTION_SEGMENTS_REQUIRED",
            "validation",
            false,
            422
          );
        }

        await updateProgress(
          "rendering",
          35,
          preview
            ? "Đang tạo bản xem thử 15 giây."
            : "Đang kết xuất toàn bộ video."
        );
        const provider = createVideoCaptionRenderProvider(
          project.video.width,
          project.video.height
        );
        const rendered = await provider.render({
          videoUrl: project.source.url,
          segments: segments.map(segmentDto),
          style: project.style,
          preview,
          idempotencyKey: job.idempotencyKey,
        });

        const refreshedJob = await VideoCaptionJobModel.findById(job._id);
        if (refreshedJob?.cancelRequestedAt) {
          await VideoCaptionJobModel.updateOne(
            { _id: job._id, lockId },
            {
              $set: {
                status: "cancelled",
                completedAt: new Date(),
                progress: {
                  stage: "cancelled",
                  percent: 0,
                  message: "Tác vụ đã được hủy.",
                },
              },
              $unset: {
                lockId: 1,
                lockedAt: 1,
                lockExpiresAt: 1,
              },
            }
          );
          return;
        }

        project = await VideoCaptionProjectModel.findById(project._id);
        if (!project || project.status === "cancelled") return;
        await transitionProject({
          project,
          to: preview ? "ready_for_review" : "completed",
          operation: job.operation,
          jobId: String(job._id),
          message: preview
            ? "Kết xuất bản xem thử hoàn tất."
            : "Kết xuất video có caption hoàn tất.",
          set: {
            [preview
              ? "output.previewUrl"
              : "output.captionedVideoUrl"]: rendered.outputUrl,
            "output.renderHash": job.inputHash,
            progress: {
              stage: preview ? "preview_completed" : "render_completed",
              percent: 100,
              message: preview
                ? "Bản xem thử đã sẵn sàng."
                : "Video có caption đã sẵn sàng tải xuống.",
            },
            lastError: null,
          },
        });
        await VideoCaptionJobModel.updateOne(
          { _id: job._id, lockId },
          {
            $set: {
              status: "completed",
              completedAt: new Date(),
              provider: provider.name,
              providerRequestId: rendered.providerRequestId,
              actualCost: rendered.cost,
              progress: {
                stage: "completed",
                percent: 100,
                message: preview
                  ? "Kết xuất bản xem thử hoàn tất."
                  : "Kết xuất video hoàn tất.",
              },
            },
            $unset: {
              lockId: 1,
              lockedAt: 1,
              lockExpiresAt: 1,
            },
          }
        );
        return;
      }

      if (job.operation === "transcribe") {
        if (project.status !== "transcribing") {
          project = await transitionProject({
            project,
            to: "transcribing",
            operation: "transcribe",
            jobId: String(job._id),
            message: "Bắt đầu nhận diện lời nói trong video.",
            set: {
              progress: {
                stage: "transcribing",
                percent: 10,
                message: "Đang gửi video tới dịch vụ nhận diện lời nói.",
              },
            },
          });
        }

        await updateProgress(
          "transcribing",
          25,
          "Đang nhận diện lời nói và timestamp theo từng từ."
        );
        const provider = createSpeechTranscriptionProvider(
          project.createdBy
        );
        const submission = await provider.start({
          videoUrl: project.source.url,
          language: project.video.language,
          idempotencyKey: job.idempotencyKey,
          webhookMetadata: {
            jobId: String(job._id),
            projectId: String(project._id),
            companyCode: project.companyCode,
          },
        });
        logCaptionStt("provider_accepted", {
          jobId: String(job._id),
          projectId: String(project._id),
          companyCode: project.companyCode,
          provider: provider.name,
          providerRequestId: submission.providerRequestId,
        });

        await VideoCaptionJobModel.updateOne(
          { _id: job._id, lockId },
          {
            $set: {
              status: "awaiting_provider",
              provider: provider.name,
              providerModel: videoCaptionTranscriptionConfig.model,
              providerRequestId: submission.providerRequestId,
              progress: {
                stage: "awaiting_provider",
                percent: 45,
                message: "ElevenLabs đang xử lý. Kết quả sẽ được nhận qua webhook.",
              },
            },
            $unset: { lockId: 1, lockedAt: 1, lockExpiresAt: 1 },
          }
        );
        await VideoCaptionProjectModel.updateOne(
          { _id: project._id, companyCode: project.companyCode },
          {
            $set: {
              progress: {
                stage: "awaiting_provider",
                percent: 45,
                message: "ElevenLabs đang xử lý phụ đề ở chế độ nền.",
              },
            },
          }
        );
        logCaptionStt("awaiting_webhook", {
          jobId: String(job._id),
          projectId: String(project._id),
          providerRequestId: submission.providerRequestId,
        });
        return;
      }

      if (job.operation !== "analyze") {
        throw new VideoCaptionError(
          `Operation ${job.operation} chưa có provider trong phase hiện tại.`,
          "OPERATION_NOT_IMPLEMENTED",
          "terminal",
          false,
          501
        );
      }

      if (project.status !== "analyzing") {
        project = await transitionProject({
          project,
          to: "analyzing",
          operation: "analyze",
          jobId: String(job._id),
          message: "Bắt đầu xác minh và đọc metadata video.",
          set: {
            progress: {
              stage: "validating_source",
              percent: 10,
              message: "Đang xác minh nguồn video.",
            },
          },
        });
      }

      await updateProgress(
        "validating_source",
        20,
        "Đang kiểm tra quyền truy cập và định dạng video."
      );
      const inspection = await videoCaptionMediaService.inspect(
        project.source.url
      );

      const refreshedJob = await VideoCaptionJobModel.findById(job._id);
      if (refreshedJob?.cancelRequestedAt) {
        await VideoCaptionJobModel.updateOne(
          { _id: job._id, lockId },
          {
            $set: {
              status: "cancelled",
              completedAt: new Date(),
              progress: {
                stage: "cancelled",
                percent: 0,
                message: "Tác vụ đã được hủy.",
              },
            },
            $unset: {
              lockId: 1,
              lockedAt: 1,
              lockExpiresAt: 1,
            },
          }
        );
        return;
      }

      await updateProgress(
        "metadata_ready",
        85,
        "Đã đọc xong metadata và tạo nguồn preview."
      );
      project = await VideoCaptionProjectModel.findById(project._id);
      if (!project || project.status === "cancelled") return;

      await transitionProject({
        project,
        to: "ready_for_review",
        operation: "analyze",
        jobId: String(job._id),
        message: "Phân tích nền hoàn tất.",
        set: {
          "source.url": inspection.sourceUrl,
          "source.fingerprint": inspection.fingerprint,
          video: inspection.metadata,
          progress: {
            stage: "analysis_completed",
            percent: 100,
            message:
              "Video đã sẵn sàng. Bước tiếp theo là tạo phụ đề.",
          },
          lastError: null,
        },
      });

      await VideoCaptionJobModel.updateOne(
        { _id: job._id, lockId },
        {
          $set: {
            status: "completed",
            completedAt: new Date(),
            progress: {
              stage: "completed",
              percent: 100,
              message: "Phân tích video hoàn tất.",
            },
          },
          $unset: {
            lockId: 1,
            lockedAt: 1,
            lockExpiresAt: 1,
          },
        }
      );
    } catch (error) {
      const classified = classifyVideoCaptionError(error);
      const shouldRetry =
        classified.retryable && job.attempt < job.maxAttempts;
      await VideoCaptionJobModel.updateOne(
        { _id: job._id, lockId },
        {
          $set: {
            status: shouldRetry ? "retrying" : "failed",
            lastError: {
              ...classified,
              occurredAt: new Date(classified.occurredAt),
            },
            progress: {
              stage: shouldRetry ? "retrying" : "failed",
              percent: 0,
              message: classified.message,
            },
            ...(shouldRetry ? {} : { completedAt: new Date() }),
          },
          $unset: {
            lockId: 1,
            lockedAt: 1,
            lockExpiresAt: 1,
          },
        }
      );

      const currentProject = await VideoCaptionProjectModel.findById(
        project._id
      );
      if (currentProject && currentProject.status !== "cancelled") {
        await transitionProject({
          project: currentProject,
          to: shouldRetry ? "retrying" : "failed",
          operation: job.operation,
          jobId: String(job._id),
          message: classified.message,
          set: {
            lastError: {
              ...classified,
              occurredAt: new Date(classified.occurredAt),
            },
            progress: {
              stage: shouldRetry ? "retrying" : "failed",
              percent: 0,
              message: classified.message,
            },
          },
        }).catch(() => undefined);
      }
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
  },

  async failJob(jobId: string, error: unknown) {
    if (!mongoose.Types.ObjectId.isValid(jobId)) return;
    const classified = classifyVideoCaptionError(error);
    const job = await VideoCaptionJobModel.findByIdAndUpdate(
      jobId,
      {
        $set: {
          status: "failed",
          completedAt: new Date(),
          lastError: {
            ...classified,
            occurredAt: new Date(classified.occurredAt),
          },
          progress: {
            stage: "failed",
            percent: 0,
            message: classified.message,
          },
        },
        $unset: {
          lockId: 1,
          lockedAt: 1,
          lockExpiresAt: 1,
        },
      },
      { returnDocument: "after" }
    );
    if (!job) return;
    const project = await VideoCaptionProjectModel.findOne({
      _id: job.projectId,
      companyCode: job.companyCode,
    });
    if (project && project.status !== "failed" && project.status !== "cancelled") {
      await transitionProject({
        project,
        to: "failed",
        operation: job.operation,
        jobId: String(job._id),
        message: classified.message,
        set: {
          lastError: {
            ...classified,
            occurredAt: new Date(classified.occurredAt),
          },
          progress: {
            stage: "failed",
            percent: 0,
            message: classified.message,
          },
        },
      }).catch(() => undefined);
    }
  },

  async completeTranscriptionWebhook(input: {
    jobId: string;
    projectId: string;
    companyCode: string;
    providerRequestId: string;
    transcription: Parameters<typeof normalizeElevenLabsTranscript>[0];
  }) {
    if (
      !mongoose.Types.ObjectId.isValid(input.jobId) ||
      !mongoose.Types.ObjectId.isValid(input.projectId)
    ) {
      throw new VideoCaptionError(
        "Webhook ElevenLabs không chứa mã tác vụ hợp lệ.",
        "ELEVENLABS_WEBHOOK_INVALID_METADATA",
        "validation",
        false,
        400
      );
    }

    const existing = await VideoCaptionJobModel.findOne({
      _id: input.jobId,
      projectId: input.projectId,
      companyCode: normalizeCaptionCompanyCode(input.companyCode),
      operation: "transcribe",
    });
    logCaptionStt("webhook_job_lookup", {
      jobId: input.jobId,
      projectId: input.projectId,
      companyCode: input.companyCode,
      providerRequestId: input.providerRequestId,
      found: Boolean(existing),
      status: existing?.status || null,
      storedProviderRequestId: existing?.providerRequestId || null,
    });
    if (!existing) {
      throw new VideoCaptionError(
        "Không tìm thấy tác vụ caption tương ứng với webhook ElevenLabs.",
        "ELEVENLABS_WEBHOOK_JOB_NOT_FOUND",
        "validation",
        false,
        404
      );
    }
    if (existing.status === "completed" || existing.status === "cancelled") {
      logCaptionStt("webhook_duplicate_terminal", {
        jobId: input.jobId,
        status: existing.status,
      });
      return { duplicate: true };
    }
    if (
      existing.providerRequestId &&
      existing.providerRequestId !== input.providerRequestId
    ) {
      throw new VideoCaptionError(
        "Mã yêu cầu ElevenLabs không khớp với tác vụ caption.",
        "ELEVENLABS_WEBHOOK_REQUEST_MISMATCH",
        "permission",
        false,
        403
      );
    }

    const lockId = randomUUID();
    const now = new Date();
    const job = await VideoCaptionJobModel.findOneAndUpdate(
      {
        _id: existing._id,
        status: "awaiting_provider",
        $or: [
          { providerRequestId: input.providerRequestId },
          { providerRequestId: { $exists: false } },
        ],
      },
      {
        $set: {
          status: "processing",
          providerRequestId: input.providerRequestId,
          lockId,
          lockedAt: now,
          lockExpiresAt: new Date(now.getTime() + JOB_LEASE_MS),
          progress: {
            stage: "processing_webhook",
            percent: 70,
            message: "Đã nhận kết quả từ ElevenLabs.",
          },
        },
      },
      { returnDocument: "after" }
    );
    if (!job) return { duplicate: true };
    logCaptionStt("webhook_job_claimed", {
      jobId: String(job._id),
      projectId: String(job.projectId),
      providerRequestId: input.providerRequestId,
      lockId,
    });

    const project = await VideoCaptionProjectModel.findOne({
      _id: job.projectId,
      companyCode: job.companyCode,
    });
    if (!project || project.status === "cancelled") {
      await VideoCaptionJobModel.updateOne(
        { _id: job._id, lockId },
        {
          $set: { status: "cancelled", completedAt: new Date() },
          $unset: { lockId: 1, lockedAt: 1, lockExpiresAt: 1 },
        }
      );
      return { duplicate: false };
    }

    try {
      await completeSpeechTranscription({
        job,
        project,
        transcript: normalizeElevenLabsTranscript(input.transcription),
        lockId,
      });
      return { duplicate: false };
    } catch (error) {
      await VideoCaptionJobModel.updateOne(
        { _id: job._id, lockId },
        {
          $set: {
            status: "awaiting_provider",
            progress: {
              stage: "awaiting_provider",
              percent: 45,
              message: "Đang chờ xử lý lại kết quả webhook ElevenLabs.",
            },
          },
          $unset: { lockId: 1, lockedAt: 1, lockExpiresAt: 1 },
        }
      );
      throw error;
    }
  },

  async reconcileAwaitingTranscriptions(limit = 20) {
    const jobs = await VideoCaptionJobModel.find({
      operation: "transcribe",
      status: "awaiting_provider",
      providerRequestId: { $exists: true, $ne: "" },
      updatedAt: { $lte: new Date(Date.now() - 2 * 60 * 1000) },
    })
      .sort({ updatedAt: 1 })
      .limit(limit);
    if (jobs.length) {
      logCaptionStt("reconcile_batch_started", {
        jobCount: jobs.length,
        limit,
      });
    }

    let completed = 0;
    for (const job of jobs) {
      try {
        const project = await VideoCaptionProjectModel.findOne({
          _id: job.projectId,
          companyCode: job.companyCode,
        });
        if (!project || !job.providerRequestId) continue;
        const provider = createSpeechTranscriptionProvider(project.createdBy);
        const transcript = await provider.retrieve(job.providerRequestId);
        if (!transcript) continue;
        await this.completeTranscriptionWebhook({
          jobId: String(job._id),
          projectId: String(project._id),
          companyCode: project.companyCode,
          providerRequestId: job.providerRequestId,
          transcription: {
            language_code: transcript.language,
            words: transcript.words.map((word) => ({
              text: word.text,
              start: word.startMs / 1000,
              end: word.endMs / 1000,
              type: "word" as const,
              logprob:
                word.confidence && word.confidence > 0
                  ? Math.log(word.confidence)
                  : undefined,
            })),
          },
        });
        completed += 1;
      } catch (error) {
        console.error(
          `[Video Caption Reconcile] Job ${job._id} failed:`,
          error
        );
      }
    }
    if (jobs.length) {
      logCaptionStt("reconcile_batch_finished", {
        jobCount: jobs.length,
        completed,
      });
    }
    return completed;
  },

  async recoverStaleJobs() {
    const now = new Date();
    await VideoCaptionJobModel.updateMany(
      {
        operation: "transcribe",
        status: "processing",
        providerRequestId: { $exists: true, $ne: "" },
        lockExpiresAt: { $lte: now },
      },
      {
        $set: {
          status: "awaiting_provider",
          progress: {
            stage: "awaiting_provider",
            percent: 45,
            message: "Khôi phục trạng thái chờ kết quả từ ElevenLabs.",
          },
        },
        $unset: {
          lockId: 1,
          lockedAt: 1,
          lockExpiresAt: 1,
        },
      }
    );
    await VideoCaptionJobModel.updateMany(
      {
        status: "processing",
        lockExpiresAt: { $lte: now },
      },
      {
        $set: {
          status: "retrying",
          progress: {
            stage: "retrying",
            percent: 0,
            message: "Khôi phục tác vụ sau khi worker bị gián đoạn.",
          },
        },
        $unset: {
          lockId: 1,
          lockedAt: 1,
          lockExpiresAt: 1,
        },
      }
    );

    const jobs = await VideoCaptionJobModel.find({
      status: { $in: ["queued", "retrying"] },
    })
      .sort({ createdAt: 1 })
      .limit(200)
      .select("_id");
    return jobs.map((job) => String(job._id));
  },

  async cancelProject(
    companyCode: string,
    projectId: string,
    actorId: string
  ) {
    const project = await requireProject(companyCode, projectId);
    if (project.status === "cancelled") return projectDto(project);
    if (project.status === "completed") {
      throw new VideoCaptionError(
        "Dự án đã hoàn thành nên không thể hủy.",
        "COMPLETED_PROJECT_CANNOT_CANCEL",
        "validation",
        false,
        409
      );
    }

    const now = new Date();
    await VideoCaptionJobModel.updateMany(
      {
        companyCode: project.companyCode,
        projectId: project._id,
        status: { $in: ["queued", "awaiting_provider", "retrying"] },
      },
      {
        $set: {
          status: "cancelled",
          cancelRequestedAt: now,
          completedAt: now,
          progress: {
            stage: "cancelled",
            percent: 0,
            message: "Tác vụ đã được hủy.",
          },
        },
      }
    );
    await VideoCaptionJobModel.updateMany(
      {
        companyCode: project.companyCode,
        projectId: project._id,
        status: "processing",
      },
      { $set: { cancelRequestedAt: now } }
    );

    const updated = await transitionProject({
      project,
      to: "cancelled",
      operation: "cancel",
      actorId,
      message: "Người dùng hủy dự án.",
      set: {
        progress: {
          stage: "cancelled",
          percent: 0,
          message: "Dự án đã được hủy.",
        },
      },
    });
    return projectDto(updated);
  },

  async retryProject(
    companyCode: string,
    projectId: string,
    actorId: string
  ) {
    const project = await requireProject(companyCode, projectId);
    if (!["failed", "cancelled"].includes(project.status)) {
      throw new VideoCaptionError(
        "Chỉ có thể thử lại dự án đã lỗi hoặc đã hủy.",
        "PROJECT_NOT_RETRYABLE",
        "validation",
        false,
        409
      );
    }
    const latestFailedJob = await VideoCaptionJobModel.findOne({
      companyCode: project.companyCode,
      projectId: project._id,
      status: { $in: ["failed", "cancelled"] },
    }).sort({ createdAt: -1 });
    if (latestFailedJob?.operation === "transcribe") {
      return this.prepareTranscriptionJob(
        project.companyCode,
        String(project._id),
        actorId
      );
    }
    if (latestFailedJob?.operation === "generate_context") {
      return this.prepareContextJob(
        project.companyCode,
        String(project._id),
        actorId
      );
    }
    if (
      latestFailedJob?.operation === "render_preview" ||
      latestFailedJob?.operation === "render_final"
    ) {
      return this.prepareRenderJob(
        project.companyCode,
        String(project._id),
        actorId,
        latestFailedJob.operation === "render_preview"
      );
    }
    return this.prepareAnalysisJob(
      project.companyCode,
      String(project._id),
      actorId
    );
  },

  async listJobs(companyCode: string, projectId: string) {
    const project = await requireProject(companyCode, projectId);
    const jobs = await VideoCaptionJobModel.find({
      companyCode: project.companyCode,
      projectId: project._id,
    })
      .sort({ createdAt: -1 })
      .limit(50);
    return jobs.map(jobDto);
  },

  async exportSubtitles(
    companyCode: string,
    projectId: string,
    format: VideoCaptionSubtitleFormat
  ) {
    const project = await requireProject(companyCode, projectId);
    const segments = await VideoCaptionSegmentModel.find({
      companyCode: project.companyCode,
      projectId: project._id,
      version: project.currentVersion,
    }).sort({ startMs: 1, lane: 1, sortOrder: 1 });
    if (!segments.length) {
      throw new VideoCaptionError(
        "Dự án chưa có đoạn caption nào để tải xuống.",
        "CAPTION_SEGMENTS_REQUIRED",
        "validation",
        false,
        422
      );
    }
    return {
      content: serializeVideoCaptionSubtitles(
        segments.map(segmentDto),
        format
      ),
      filename: `${project.name
        .replace(/[^\p{L}\p{N}._-]+/gu, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "caption"}.${format}`,
    };
  },

  async replaceSegments(
    companyCode: string,
    projectId: string,
    input: ReplaceVideoCaptionSegmentsInput
  ) {
    const project = await requireProject(companyCode, projectId);
    if (project.currentVersion !== input.expectedVersion) {
      throw new VideoCaptionError(
        "Dự án đã có phiên bản mới hơn. Vui lòng tải lại trước khi lưu.",
        "SEGMENT_VERSION_CONFLICT",
        "transient",
        true,
        409
      );
    }
    validateSegmentTimeline(input, project.video?.durationMs);
    const nextVersion = project.currentVersion + 1;

    const created = await VideoCaptionSegmentModel.insertMany(
      input.segments.map((segment, index) => ({
        companyCode: project.companyCode,
        projectId: project._id,
        version: nextVersion,
        lane: segment.lane,
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text.trim(),
        sceneId: segment.sceneId,
        confidence: segment.confidence,
        sourceReferences: segment.sourceReferences || [],
        styleOverride: segment.styleOverride,
        lockedByUser: segment.lockedByUser,
        sortOrder: index,
      }))
    );

    const updated = await VideoCaptionProjectModel.findOneAndUpdate(
      {
        _id: project._id,
        companyCode: project.companyCode,
        currentVersion: input.expectedVersion,
      },
      {
        $set: {
          currentVersion: nextVersion,
          status: "ready_for_review",
        },
      },
      { returnDocument: "after" }
    );

    if (!updated) {
      await VideoCaptionSegmentModel.deleteMany({
        companyCode: project.companyCode,
        projectId: project._id,
        version: nextVersion,
      });
      throw new VideoCaptionError(
        "Không thể lưu vì dự án vừa được cập nhật ở nơi khác.",
        "SEGMENT_VERSION_CONFLICT",
        "transient",
        true,
        409
      );
    }

    return {
      project: projectDto(updated),
      segments: created.map(segmentDto),
    };
  },
};
