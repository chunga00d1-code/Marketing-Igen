import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mongoose from "mongoose";
import {
  HtmlVideoRenderModel,
  type HtmlVideoRenderDocument,
  type HtmlVideoRenderStatus,
} from "../../model/html-video-render.model";
import {
  buildSafeHtmlVideoComposition,
  type HtmlVideoSource,
} from "./html-video-security.service";
import { VideoRenderAdapterError } from "../video-edit/render-adapter";
import { defaultVideoRenderAdapterRegistry } from "../video-edit/video-render-adapters";
import { htmlVideoTtsService } from "./html-video-tts.service";

export type HtmlVideoActor = {
  id: string;
  companyCode: string;
};

export type CreateHtmlVideoRenderInput = HtmlVideoSource & {
  idempotencyKey: string;
  promptHistoryId?: string;
  voiceScript?: string;
};

const MAX_VOICE_SCRIPT_LENGTH = 8_000;
const MAX_RENDER_DIAGNOSTIC_LENGTH = 4_096;

export type HtmlVideoRenderPublic = {
  id: string;
  status: HtmlVideoRenderStatus;
  progress: number;
  stageMessage: string;
  aspectRatio: HtmlVideoRenderDocument["aspectRatio"];
  resolution: HtmlVideoRenderDocument["resolution"];
  durationSeconds: number;
  outputUrl: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  promptHistoryId: string | null;
  voiceEnabled: boolean;
  voiceStatus: "disabled" | "queued" | "generating" | "ready" | "failed";
};

export type HtmlVideoRenderHistoryFilter = "all" | "active" | "completed" | "failed";

export type HtmlVideoRenderListOptions = {
  page?: number;
  pageSize?: number;
  filter?: HtmlVideoRenderHistoryFilter;
};

export type HtmlVideoRenderPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type HtmlVideoRenderListResult = {
  items: HtmlVideoRenderPublic[];
  pagination: HtmlVideoRenderPagination;
};

type RenderRecord = Partial<HtmlVideoRenderDocument> & {
  _id: unknown;
  status: HtmlVideoRenderStatus;
  aspectRatio: HtmlVideoRenderDocument["aspectRatio"];
  resolution: HtmlVideoRenderDocument["resolution"];
  durationSeconds: number;
  voiceScript?: string;
  voiceStatus?: HtmlVideoRenderPublic["voiceStatus"];
};

function asPlainRecord(value: unknown): RenderRecord {
  if (
    value &&
    typeof value === "object" &&
    "toObject" in value &&
    typeof value.toObject === "function"
  ) {
    return value.toObject() as RenderRecord;
  }
  return value as RenderRecord;
}

function serializeRender(value: unknown): HtmlVideoRenderPublic {
  const render = asPlainRecord(value);
  const createdAt = render.createdAt ?? new Date(0);
  const updatedAt = render.updatedAt ?? createdAt;
  const voiceScript = String(render.voiceScript || "").trim();
  const voiceStatus = ["disabled", "queued", "generating", "ready", "failed"].includes(
    String(render.voiceStatus)
  )
    ? String(render.voiceStatus) as HtmlVideoRenderPublic["voiceStatus"]
    : voiceScript ? "queued" : "disabled";
  return {
    id: String(render._id),
    promptHistoryId: render.promptHistoryId ? String(render.promptHistoryId) : null,
    status: render.status,
    progress: Number(render.progress ?? 0),
    stageMessage: String(render.stageMessage ?? ""),
    aspectRatio: render.aspectRatio,
    resolution: render.resolution,
    durationSeconds: render.durationSeconds,
    outputUrl:
      render.status === "completed" && render.outputUrl
        ? String(render.outputUrl)
        : null,
    error: render.status === "failed" && render.error ? String(render.error) : null,
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: new Date(updatedAt).toISOString(),
    voiceEnabled: Boolean(voiceScript),
    voiceStatus,
  };
}

function scopedIdempotencyFilter(
  actor: HtmlVideoActor,
  idempotencyKey: string
) {
  return {
    userId: actor.id,
    companyCode: actor.companyCode,
    idempotencyKey,
  };
}

const htmlVideoRenderTimeoutMs = Math.max(
  Number(process.env.HTML_VIDEO_RENDER_TIMEOUT_MS) || 30 * 60 * 1000,
  60_000
);

function safeRenderFailure(error: unknown) {
  if (error instanceof VideoRenderAdapterError) {
    return {
      code: error.code,
      message: error.message,
    };
  }
  return {
    code: "RENDER_PROCESS_FAILED",
    message: "Không thể kết xuất video HTML.",
  };
}

function sanitizeServerRenderDiagnostic(value: unknown) {
  return String(value ?? "")
    .slice(-MAX_RENDER_DIAGNOSTIC_LENGTH)
    .replace(/\b(Bearer)\s+\S+/gi, "$1 [redacted]")
    .replace(
      /\b([A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]"
    )
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[redacted]@");
}

function logRenderFailure(renderId: string, error: unknown) {
  const failure = safeRenderFailure(error);
  const diagnostic: Record<string, string | number | boolean | null> = {
    renderId,
    code: failure.code,
    message: failure.message,
  };

  if (error instanceof VideoRenderAdapterError && error.diagnostics) {
    for (const key of ["exitCode", "reason", "stderr"] as const) {
      const value = error.diagnostics[key];
      if (value === undefined || value === null || value === "") continue;
      diagnostic[key] =
        typeof value === "string"
          ? sanitizeServerRenderDiagnostic(value)
          : value;
    }
  }

  console.error("[HTML Video] Render attempt failed", diagnostic);
}

export const htmlVideoRenderService = {
  async createRender(
    actor: HtmlVideoActor,
    input: CreateHtmlVideoRenderInput
  ): Promise<{ render: HtmlVideoRenderPublic; created: boolean }> {
    const safeComposition = buildSafeHtmlVideoComposition(input);
    const voiceScript = String(input.voiceScript || "").trim().slice(0, MAX_VOICE_SCRIPT_LENGTH);
    const filter = scopedIdempotencyFilter(actor, input.idempotencyKey);
    const existing = await HtmlVideoRenderModel.findOne(filter).lean();
    if (existing) {
      return { render: serializeRender(existing), created: false };
    }

    try {
      const created = await HtmlVideoRenderModel.create({
        ...filter,
        ...(input.promptHistoryId && mongoose.isValidObjectId(input.promptHistoryId)
          ? { promptHistoryId: input.promptHistoryId }
          : {}),
        sourceHtml: input.html,
        sourceCss: input.css,
        sanitizedHtml: safeComposition.sanitizedHtml,
        sanitizedCss: safeComposition.sanitizedCss,
        compositionHtml: safeComposition.compositionHtml,
        voiceScript,
        voiceStatus: voiceScript ? "queued" : "disabled",
        durationSeconds: input.durationSeconds,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        status: "queued",
        progress: 0,
        stageMessage: "Đã xếp hàng kết xuất video.",
      });
      return { render: serializeRender(created), created: true };
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const duplicate = await HtmlVideoRenderModel.findOne(filter).lean();
        if (duplicate) {
          return { render: serializeRender(duplicate), created: false };
        }
      }
      throw error;
    }
  },

  async getRender(
    actor: HtmlVideoActor,
    renderId: string
  ): Promise<HtmlVideoRenderPublic> {
    if (!mongoose.isValidObjectId(renderId)) {
      throw new Error("Mã lần kết xuất video không hợp lệ.");
    }
    const render = await HtmlVideoRenderModel.findOne({
      _id: renderId,
      userId: actor.id,
      companyCode: actor.companyCode,
    }).lean();
    if (!render) {
      throw new Error(
        "Không tìm thấy lần kết xuất video hoặc bạn không có quyền truy cập."
      );
    }
    return serializeRender(render);
  },

  async deleteRender(
    actor: HtmlVideoActor,
    renderId: string
  ): Promise<{ success: boolean; id: string }> {
    if (!mongoose.isValidObjectId(renderId)) {
      throw new Error("Mã lần kết xuất video không hợp lệ.");
    }
    const result = await HtmlVideoRenderModel.findOneAndDelete({
      _id: renderId,
      userId: actor.id,
      companyCode: actor.companyCode,
    }).lean();
    if (!result) {
      throw new Error(
        "Không tìm thấy lần kết xuất video hoặc bạn không có quyền truy cập."
      );
    }
    return { success: true, id: renderId };
  },

  async listRenders(
    actor: HtmlVideoActor,
    options: HtmlVideoRenderListOptions = {}
  ): Promise<HtmlVideoRenderListResult> {
    const requestedPage = Math.max(1, Math.floor(Number(options.page) || 1));
    const pageSize = Math.min(50, Math.max(1, Math.floor(Number(options.pageSize) || 12)));
    const historyFilter = options.filter || "all";
    const query: Record<string, unknown> = {
      userId: actor.id,
      companyCode: actor.companyCode,
    };

    if (historyFilter === "active") {
      query.status = { $in: ["queued", "rendering", "uploading"] };
    } else if (historyFilter !== "all") {
      query.status = historyFilter;
    }

    const total = await HtmlVideoRenderModel.countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const renders = await HtmlVideoRenderModel.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    return {
      items: renders.map(serializeRender),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  },

  async recoverPendingRenders(): Promise<string[]> {
    const staleBefore = new Date(Date.now() - htmlVideoRenderTimeoutMs);
    await HtmlVideoRenderModel.updateMany(
      {
        status: { $in: ["rendering", "uploading"] },
        updatedAt: { $lte: staleBefore },
      },
      {
        $set: {
          status: "queued",
          progress: 0,
          stageMessage: "Khôi phục tác vụ kết xuất bị gián đoạn.",
          errorCode: "",
          error: "",
        },
      }
    );
    const pending = await HtmlVideoRenderModel.find({ status: "queued" })
      .sort({ createdAt: 1 })
      .limit(200)
      .select("_id")
      .lean();
    return pending.map((render) => String(render._id));
  },

  async processRender(renderId: string): Promise<void> {
    const render = await HtmlVideoRenderModel.findOneAndUpdate(
      { _id: renderId, status: "queued" },
      {
        $set: {
          status: "rendering",
          progress: 1,
          stageMessage: "Bắt đầu kết xuất video HTML.",
          startedAt: new Date(),
          errorCode: "",
          error: "",
        },
        $inc: { attempts: 1 },
      },
      { new: true }
    )
      .select("+compositionHtml +voiceScript")
      .lean();
    if (!render) return;

    const adapter = defaultVideoRenderAdapterRegistry.get("hyperframes");
    const temporaryDirectory = join(
      tmpdir(),
      `igen-html-video-${renderId}-${randomUUID()}`
    );
    const voiceScript = String(render.voiceScript || "").trim();
    try {
      let voiceAudioPath: string | undefined;
      let voiceAudioFormat: "mp3" | "pcm" | undefined;
      let voiceAudioSampleRate: number | undefined;
      let voiceAudioChannels: number | undefined;
      if (voiceScript) {
        await mkdir(temporaryDirectory, { recursive: true });
        await HtmlVideoRenderModel.updateOne(
          { _id: renderId, status: "rendering" },
          {
            $set: {
              voiceStatus: "generating",
              progress: 5,
              stageMessage: "Generating contextual voice audio.",
            },
          }
        );
        const voice = await htmlVideoTtsService.generate(voiceScript, { durationSeconds: render.durationSeconds });
        voiceAudioPath = join(
          temporaryDirectory,
          voice.format === "pcm" ? "voice.pcm" : "voice.mp3"
        );
        await writeFile(voiceAudioPath, voice.buffer);
        voiceAudioFormat = voice.format;
        voiceAudioSampleRate = voice.sampleRate;
        voiceAudioChannels = voice.channels;
      }
      const result = await adapter.render(
        {
          jobId: renderId,
          compositionHtml: render.compositionHtml,
          aspectRatio: render.aspectRatio,
          resolution: render.resolution,
          ...(voiceAudioPath
            ? {
                voiceAudioPath,
                ...(voiceAudioFormat ? { voiceAudioFormat } : {}),
                ...(voiceAudioSampleRate ? { voiceAudioSampleRate } : {}),
                ...(voiceAudioChannels ? { voiceAudioChannels } : {}),
                voiceDurationSeconds: render.durationSeconds,
              }
            : {}),
        },
        {
          signal: new AbortController().signal,
          timeoutMs: htmlVideoRenderTimeoutMs,
          temporaryDirectory,
          onProgress: async ({ stage, progress, message }) => {
            const status = stage === "uploading" ? "uploading" : "rendering";
            await HtmlVideoRenderModel.updateOne(
              { _id: renderId, status: { $in: ["rendering", "uploading"] } },
              {
                $set: {
                  status,
                  progress: Math.min(99, Math.max(1, Math.round(progress))),
                  stageMessage: message,
                },
              }
            );
          },
        }
      );
      await HtmlVideoRenderModel.updateOne(
        { _id: renderId, status: { $in: ["rendering", "uploading"] } },
        {
          $set: {
            status: "completed",
            progress: 100,
            stageMessage: "Kết xuất video HTML hoàn tất.",
            outputUrl: result.outputUrl,
            voiceStatus: voiceScript ? "ready" : "disabled",
            errorCode: "",
            error: "",
            completedAt: new Date(),
          },
        }
      );
    } catch (error) {
      const safeFailure = safeRenderFailure(error);
      logRenderFailure(renderId, error);
      await HtmlVideoRenderModel.updateOne(
        { _id: renderId, status: { $in: ["rendering", "uploading"] } },
        {
          $set: {
            status: "queued",
            progress: 0,
            stageMessage: "Tác vụ sẽ được thử lại.",
            voiceStatus: voiceScript ? "failed" : "disabled",
            errorCode: safeFailure.code,
            error: safeFailure.message,
          },
        }
      );
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  },

  async failRender(renderId: string, error: unknown): Promise<void> {
    const safeFailure = safeRenderFailure(error);
    await HtmlVideoRenderModel.findOneAndUpdate(
      { _id: renderId, status: { $in: ["queued", "rendering", "uploading"] } },
      {
        $set: {
          status: "failed",
          progress: 0,
          stageMessage: "Kết xuất video HTML thất bại.",
          errorCode: safeFailure.code,
          error: safeFailure.message,
          completedAt: new Date(),
        },
      },
      { new: true }
    );
  },
};
