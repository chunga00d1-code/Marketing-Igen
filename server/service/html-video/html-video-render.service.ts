import { randomUUID } from "node:crypto";
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

export type HtmlVideoActor = {
  id: string;
  companyCode: string;
};

export type CreateHtmlVideoRenderInput = HtmlVideoSource & {
  idempotencyKey: string;
  promptHistoryId?: string;
};

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
};

type RenderRecord = Partial<HtmlVideoRenderDocument> & {
  _id: unknown;
  status: HtmlVideoRenderStatus;
  aspectRatio: HtmlVideoRenderDocument["aspectRatio"];
  resolution: HtmlVideoRenderDocument["resolution"];
  durationSeconds: number;
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

const htmlVideoRenderTimeoutMs = 15 * 60 * 1000;

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

export const htmlVideoRenderService = {
  async createRender(
    actor: HtmlVideoActor,
    input: CreateHtmlVideoRenderInput
  ): Promise<{ render: HtmlVideoRenderPublic; created: boolean }> {
    const safeComposition = buildSafeHtmlVideoComposition(input);
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

  async listRenders(actor: HtmlVideoActor): Promise<HtmlVideoRenderPublic[]> {
    const renders = await HtmlVideoRenderModel.find({
      userId: actor.id,
      companyCode: actor.companyCode,
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return renders.map(serializeRender);
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
      .select("+compositionHtml")
      .lean();
    if (!render) return;

    const adapter = defaultVideoRenderAdapterRegistry.get("hyperframes");
    try {
      const result = await adapter.render(
        {
          jobId: renderId,
          compositionHtml: render.compositionHtml,
          aspectRatio: render.aspectRatio,
          resolution: render.resolution,
        },
        {
          signal: new AbortController().signal,
          timeoutMs: htmlVideoRenderTimeoutMs,
          temporaryDirectory: join(
            tmpdir(),
            `igen-html-video-${renderId}-${randomUUID()}`
          ),
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
            errorCode: "",
            error: "",
            completedAt: new Date(),
          },
        }
      );
    } catch (error) {
      const safeFailure = safeRenderFailure(error);
      await HtmlVideoRenderModel.updateOne(
        { _id: renderId, status: { $in: ["rendering", "uploading"] } },
        {
          $set: {
            status: "queued",
            progress: 0,
            stageMessage: "Tác vụ sẽ được thử lại.",
            errorCode: safeFailure.code,
            error: safeFailure.message,
          },
        }
      );
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
