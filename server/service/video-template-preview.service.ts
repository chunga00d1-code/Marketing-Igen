import type { VideoTemplateAspectRatio } from "../interface/video-template.interface";
import { VideoProjectRenderModel } from "../model/video-project-render.model";
import { videoProjectRenderQueue } from "../queue/video-project-render-queue";

export interface RequestVideoTemplatePreviewInput {
  templateId: string;
  templateVersionId: string;
  sourceHash: string;
  title: string;
  aspectRatio: VideoTemplateAspectRatio;
  duration: number;
  normalizedEditorState: Record<string, unknown>;
  sourceEdit: Record<string, unknown>;
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code: unknown }).code === 11000
  );
}

export async function requestVideoTemplatePreview(
  input: RequestVideoTemplatePreviewInput,
  options: { force?: boolean } = {}
): Promise<{ renderId: string; created: boolean; uncertain?: boolean }> {
  const {
    templateId,
    templateVersionId,
    sourceHash,
    title,
    aspectRatio,
    duration,
    normalizedEditorState,
    sourceEdit,
  } = input;

  const idempotencyKey = `template-preview:${templateVersionId}:${sourceHash}`;
  const filter = {
    purpose: "template-preview" as const,
    templateVersionId,
    templateSourceHash: sourceHash,
  };

  const existing = await VideoProjectRenderModel.findOne(filter).lean();
  if (existing) {
    const existingRecord = existing as unknown as Record<string, unknown>;
    const renderId = String(existingRecord._id);

    if (existingRecord.status === "failed") {
      const isUncertain =
        existingRecord.providerSubmissionState === "uncertain" ||
        existingRecord.errorCode === "VIDEO_PROJECT_RENDER_SUBMISSION_UNCERTAIN" ||
        Boolean(existingRecord.providerRenderId);

      if (isUncertain && !options.force) {
        return {
          renderId,
          created: false,
          uncertain: true,
        };
      }
      await VideoProjectRenderModel.updateOne(
        { _id: renderId, status: "failed" },
        {
          $set: {
            status: "queued",
            progress: 0,
            attempt: 0,
            transferAttempt: 0,
            providerPollAttempt: 0,
            stageMessage: "Queued for video rendering retry.",
          },
          $unset: {
            errorCode: "",
            errorMessage: "",
            providerErrorCode: "",
            providerErrorMessage: "",
            providerRenderId: "",
            providerStatus: "",
            providerOutputUrl: "",
            providerSubmissionState: "",
            providerSubmissionAttemptId: "",
            startedAt: "",
            completedAt: "",
          },
        }
      );
      await videoProjectRenderQueue.add(renderId);
      return { renderId, created: true };
    }

    if (existingRecord.status === "queued") {
      await videoProjectRenderQueue.add(renderId);
      return { renderId, created: false };
    }

    return {
      renderId,
      created: false,
    };
  }

  const tracks = Array.isArray(normalizedEditorState?.tracks)
    ? structuredClone(normalizedEditorState.tracks)
    : [];
  const items = Array.isArray(normalizedEditorState?.items)
    ? structuredClone(normalizedEditorState.items)
    : [];

  const snapshot = {
    title,
    tracks,
    items,
    settings: {
      resolution: "720p",
      aspectRatio,
      fps: 30,
    },
    sourceEdit: structuredClone(sourceEdit),
  };

  try {
    const created = await VideoProjectRenderModel.create({
      purpose: "template-preview",
      templateId,
      templateVersionId,
      templateSourceHash: sourceHash,
      userId: "system",
      companyCode: "system",
      status: "queued",
      resolution: "720p",
      aspectRatio,
      duration,
      snapshot,
      progress: 0,
      stageMessage: "Queued for video rendering.",
      engine: "shotstack",
      attempt: 0,
      transferAttempt: 0,
      idempotencyKey,
    });

    const renderId = String(created._id);
    await videoProjectRenderQueue.add(renderId);

    return {
      renderId,
      created: true,
    };
  } catch (error: unknown) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
    const duplicate = await VideoProjectRenderModel.findOne(filter).lean();
    if (!duplicate) {
      throw error;
    }
    return {
      renderId: String((duplicate as unknown as Record<string, unknown>)._id),
      created: false,
    };
  }
}
