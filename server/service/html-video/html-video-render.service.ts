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

export type HtmlVideoActor = {
  id: string;
  companyCode: string;
};

export type CreateHtmlVideoRenderInput = HtmlVideoSource & {
  idempotencyKey: string;
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
};
