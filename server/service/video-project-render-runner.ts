import { VideoProjectRenderModel } from "../model/video-project-render.model";
import { runFFmpegFallback } from "./video-edit/ffmpeg";
import { remotionService } from "./remotion.service";
import {
  assertRenderTransition,
  editorProjectToBlueprint,
  getRenderDimensions,
  nextRenderProgress,
} from "./video-project-render-policy";

const MAX_RENDER_ATTEMPTS = 2;

type ActiveRenderStatus = "rendering" | "uploading";

export function sanitizeRenderError(error: unknown) {
  const rawMessage = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "Video rendering failed.";
  const firstLine = rawMessage
    .split(/[\r\n]+/)
    .find((line) => line.trim().length > 0)
    ?.trim()
    .replace(/^Error:\s*/i, "");
  const normalized = (firstLine || "").toLowerCase();
  const errorMessage = normalized.includes("ffmpeg")
    ? "FFmpeg fallback failed."
    : normalized.includes("upload") || normalized.includes("cloudinary")
      ? "Rendered video upload failed."
      : normalized.includes("media") ||
          normalized.includes("source") ||
          normalized.includes("download") ||
          normalized.includes("url")
        ? "A render media source could not be processed."
        : "Video rendering failed.";

  return {
    errorCode: "VIDEO_PROJECT_RENDER_FAILED",
    errorMessage,
  };
}

export function buildRenderFailurePersistence(
  renderId: string,
  error: unknown,
  completedAt: Date
) {
  const failure = sanitizeRenderError(error);
  return {
    filter: {
      _id: renderId,
      status: { $in: ["rendering", "uploading"] as const },
    },
    update: {
      $set: {
        status: "failed" as const,
        stageMessage: "Video render failed.",
        errorCode: failure.errorCode,
        errorMessage: failure.errorMessage,
        completedAt,
      },
    },
  };
}

export async function runWithPostClaimFailureBoundary(
  work: () => Promise<void>,
  onFailure: (error: unknown) => Promise<void>
): Promise<void> {
  try {
    await work();
  } catch (error: unknown) {
    await onFailure(error);
  }
}

async function persistRenderFailure(renderId: string, error: unknown) {
  assertRenderTransition("rendering", "failed");
  assertRenderTransition("uploading", "failed");
  const persistence = buildRenderFailurePersistence(
    renderId,
    error,
    new Date()
  );
  const result = await VideoProjectRenderModel.updateOne(
    persistence.filter,
    persistence.update
  );
  if (result.matchedCount === 0) {
    throw new Error("Render could not transition to failed.");
  }
}

export async function executeVideoProjectRender(renderId: string): Promise<void> {
  assertRenderTransition("queued", "rendering");
  const claimed = await VideoProjectRenderModel.findOneAndUpdate(
    {
      _id: renderId,
      status: "queued",
      attempt: { $lt: MAX_RENDER_ATTEMPTS },
    },
    {
      $set: {
        status: "rendering",
        startedAt: new Date(),
        stageMessage: "Starting video render.",
      },
      $inc: { attempt: 1 },
      $max: { progress: 1 },
    },
    { new: true }
  );
  if (!claimed) {
    return;
  }

  await runWithPostClaimFailureBoundary(async () => {
    const snapshot = claimed.snapshot as unknown as Record<string, unknown>;
    const blueprint = editorProjectToBlueprint(snapshot);
    const aspectRatio = claimed.aspectRatio;
    const resolution = claimed.resolution;
    let persistedProgress = Math.max(1, Number(claimed.progress) || 0);
    let activeStatus: ActiveRenderStatus = "rendering";
    let progressWrites = Promise.resolve();

    const persistProgress = async (requested: number, stageMessage?: string) => {
      const nextProgress = nextRenderProgress(persistedProgress, requested);
      const set: Record<string, unknown> = {};
      if (stageMessage) {
        set.stageMessage = stageMessage;
      }
      if (nextProgress >= 85 && activeStatus === "rendering") {
        assertRenderTransition("rendering", "uploading");
        set.status = "uploading";
      }

      const result = await VideoProjectRenderModel.updateOne(
        {
          _id: renderId,
          status: { $in: ["rendering", "uploading"] },
        },
        {
          ...(Object.keys(set).length > 0 ? { $set: set } : {}),
          $max: { progress: nextProgress },
        }
      );
      if (result.matchedCount === 0) {
        throw new Error("Render is no longer active.");
      }
      if (set.status === "uploading") {
        activeStatus = "uploading";
      }
      persistedProgress = nextProgress;
    };

    const queueProgress = (progress: number, stageMessage?: string) => {
      const pending = progressWrites.then(() =>
        persistProgress(progress, stageMessage)
      );
      progressWrites = pending;
      void pending.catch(() => undefined);
      return pending;
    };

    const complete = async (
      outputUrl: string,
      engine: "remotion" | "ffmpeg"
    ) => {
      await queueProgress(95, "Finalizing rendered video.");
      await progressWrites;
      assertRenderTransition("uploading", "completed");
      const result = await VideoProjectRenderModel.updateOne(
        { _id: renderId, status: "uploading" },
        {
          $set: {
            status: "completed",
            progress: 100,
            stageMessage: "Video render completed.",
            outputUrl,
            engine,
            completedAt: new Date(),
          },
          $unset: {
            errorCode: "",
            errorMessage: "",
          },
        }
      );
      if (result.matchedCount === 0) {
        throw new Error("Render could not transition to completed.");
      }
    };

    try {
      const outputUrl = await remotionService.renderVideo(
        blueprint,
        { aspectRatio, resolution },
        (progress, stageMessage) => {
          void queueProgress(progress, stageMessage);
        }
      );
      await progressWrites;
      await complete(outputUrl, "remotion");
      return;
    } catch {
      await progressWrites.catch(() => undefined);
    }

    progressWrites = Promise.resolve();
    await queueProgress(
      persistedProgress,
      "Primary renderer failed. Starting FFmpeg fallback."
    );
    const dimensions = getRenderDimensions(aspectRatio, resolution);
    const items = Array.isArray(snapshot.items) ? snapshot.items : [];
    const firstVideo = items.find((item) =>
      Boolean(
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        (item as Record<string, unknown>).type === "video" &&
        typeof (item as Record<string, unknown>).sourceUrl === "string"
      )
    ) as Record<string, unknown> | undefined;
    const firstVideoSource = firstVideo?.sourceUrl;
    if (typeof firstVideoSource !== "string" || !firstVideoSource) {
      throw new Error("No durable video source is available for FFmpeg fallback.");
    }

    const outputUrl = await runFFmpegFallback(
      renderId,
      firstVideoSource,
      blueprint,
      {
        aspectRatio,
        resolution,
        targetWidth: dimensions.width,
        targetHeight: dimensions.height,
      },
      queueProgress
    );
    await progressWrites;
    await complete(outputUrl, "ffmpeg");
  }, async (error) => {
    await persistRenderFailure(renderId, error);
  });
}
