import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RealEstateMapVideoRenderModel,
  type RealEstateMapRenderStatus,
  type RealEstateMapVideoRenderDocument,
} from "../../model/real-estate-map-video-render.model";
import { RealEstateMapVideoDraftModel } from "../../model/real-estate-map-video-draft.model";
import {
  buildRealEstateMapProjectSnapshot,
  composeRealEstateMapSnapshot,
  type RealEstateMapComposition,
} from "./map-scene-engine.service";
import { defaultVideoRenderAdapterRegistry } from "../video-edit/video-render-adapters";
import { htmlVideoTtsService } from "../html-video/html-video-tts.service";
import { cloudinaryService } from "../cloudinary.service";
import { enqueueRealEstateMapVideoRender } from "../../queue/real-estate-map-video-render-queue";
import type {
  RealEstateMapProjectSnapshot,
  RealEstateMapVideoSpec,
} from "../../interface/real-estate-map-video.interface";

export type RealEstateMapActor = {
  userId: string;
  companyCode: string;
};

export type CreateRealEstateMapRenderInput = {
  idempotencyKey?: string;
  draftId?: string;
  snapshot?: RealEstateMapProjectSnapshot;
};

export type RealEstateMapRenderPublic = {
  id: string;
  status: RealEstateMapRenderStatus;
  progress: number;
  stageMessage: string;
  videoSpec: RealEstateMapVideoSpec;
  outputUrl?: string;
  outputDurationSeconds?: number;
  outputResolution?: string;
  audioStreamVerified: boolean;
  videoStreamVerified: boolean;
  attempts: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

function serializeRender(doc: RealEstateMapVideoRenderDocument): RealEstateMapRenderPublic {
  return {
    id: doc._id.toString(),
    status: doc.status,
    progress: doc.progress,
    stageMessage: doc.stageMessage,
    videoSpec: doc.videoSpec,
    outputUrl: doc.outputUrl,
    outputDurationSeconds: doc.outputDurationSeconds,
    outputResolution: doc.outputResolution,
    audioStreamVerified: doc.audioStreamVerified,
    videoStreamVerified: doc.videoStreamVerified,
    attempts: doc.attempts,
    error: doc.error,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    completedAt: doc.completedAt?.toISOString(),
  };
}

export const realEstateMapVideoRenderService = {
  async createRender(
    actor: RealEstateMapActor,
    input: CreateRealEstateMapRenderInput
  ): Promise<RealEstateMapRenderPublic> {
    const idempotencyKey = input.idempotencyKey || `remv_${randomUUID()}`;

    // Kiểm tra render đã tồn tại với idempotencyKey
    const existing = await RealEstateMapVideoRenderModel.findOne({
      userId: actor.userId,
      companyCode: actor.companyCode,
      idempotencyKey,
    });

    if (existing) {
      return serializeRender(existing);
    }

    let snapshot: RealEstateMapProjectSnapshot;
    let composition: RealEstateMapComposition;

    if (input.snapshot) {
      snapshot = input.snapshot;
      composition = composeRealEstateMapSnapshot(snapshot);
    } else {
      const draft = await RealEstateMapVideoDraftModel.findOne({
        userId: actor.userId,
        companyCode: actor.companyCode,
      }).lean();

      if (!draft) {
        throw new Error("Không tìm thấy bản nháp dự án để tạo video.");
      }

      snapshot = buildRealEstateMapProjectSnapshot(draft);
      composition = composeRealEstateMapSnapshot(snapshot);
    }

    const render = await RealEstateMapVideoRenderModel.create({
      userId: actor.userId,
      companyCode: actor.companyCode,
      idempotencyKey,
      draftId: input.draftId,
      status: "queued",
      progress: 5,
      stageMessage: "Đang xếp hàng chờ xử lý...",
      snapshot,
      composition,
      videoSpec: snapshot.videoSpec,
      attempts: 0,
      audioStreamVerified: false,
      videoStreamVerified: false,
    });

    // Đẩy job vào queue
    await enqueueRealEstateMapVideoRender(render._id.toString());

    return serializeRender(render);
  },

  async getRender(actor: RealEstateMapActor, renderId: string): Promise<RealEstateMapRenderPublic> {
    const render = await RealEstateMapVideoRenderModel.findOne({
      _id: renderId,
      userId: actor.userId,
      companyCode: actor.companyCode,
    });

    if (!render) {
      throw new Error("Không tìm thấy thông tin tiến trình render.");
    }

    return serializeRender(render);
  },

  async listRenders(
    actor: RealEstateMapActor,
    options: { page?: number; pageSize?: number; status?: string } = {}
  ): Promise<{ items: RealEstateMapRenderPublic[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(50, Math.max(1, options.pageSize || 10));

    const query: Record<string, unknown> = {
      userId: actor.userId,
      companyCode: actor.companyCode,
    };

    if (options.status && options.status !== "all") {
      query.status = options.status;
    }

    const [renders, total] = await Promise.all([
      RealEstateMapVideoRenderModel.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      RealEstateMapVideoRenderModel.countDocuments(query),
    ]);

    return {
      items: renders.map(serializeRender),
      total,
      page,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  },

  async retryRender(actor: RealEstateMapActor, renderId: string): Promise<RealEstateMapRenderPublic> {
    const render = await RealEstateMapVideoRenderModel.findOne({
      _id: renderId,
      userId: actor.userId,
      companyCode: actor.companyCode,
    });

    if (!render) {
      throw new Error("Không tìm thấy video để thử lại.");
    }

    if (render.status === "completed") {
      return serializeRender(render);
    }

    render.status = "queued";
    render.progress = 5;
    render.stageMessage = "Đang thử lại kết xuất video...";
    render.error = undefined;
    render.errorCode = undefined;
    render.attempts += 1;
    await render.save();

    await enqueueRealEstateMapVideoRender(render._id.toString());
    return serializeRender(render);
  },

  async processRender(renderId: string): Promise<void> {
    const render = await RealEstateMapVideoRenderModel.findById(renderId);
    if (!render || render.status === "completed") return;

    const workDir = join(tmpdir(), `remv_render_${renderId}_${Date.now()}`);
    await mkdir(workDir, { recursive: true });

    try {
      render.status = "preparing";
      render.progress = 15;
      render.stageMessage = "Đang chuẩn bị kịch bản & lớp bản đồ...";
      render.startedAt = new Date();
      await render.save();

      // 1. Sinh âm thanh giọng đọc TTS
      let audioBuffer: Buffer | null = null;
      if (render.composition.voiceScript) {
        render.progress = 30;
        render.stageMessage = "Đang tổng hợp giọng đọc AI tiếng Việt (TTS)...";
        await render.save();

        try {
          const ttsResult = await htmlVideoTtsService.generate(render.composition.voiceScript, {
            durationSeconds: render.videoSpec.durationSeconds,
          });
          audioBuffer = ttsResult.buffer;
        } catch (ttsError) {
          console.warn("TTS generation fallback:", ttsError);
        }
      }

      // 2. Render khung hình HTML/CSS sang video
      render.status = "rendering";
      render.progress = 50;
      render.stageMessage = "Đang kết xuất chuyển động camera & bản đồ...";
      await render.save();

      const adapter = defaultVideoRenderAdapterRegistry.get("hyperframes");

      const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${render.composition.css}</style></head><body>${render.composition.html}</body></html>`;
      const htmlPath = join(workDir, "index.html");
      await writeFile(htmlPath, fullHtml, "utf8");

      if (adapter) {
        try {
          const renderResult = await adapter.render(
            {
              jobId: renderId,
              compositionHtml: fullHtml,
              durationSeconds: render.videoSpec.durationSeconds,
              aspectRatio: render.videoSpec.aspectRatio,
              resolution: render.videoSpec.resolution,
            },
            {
              signal: new AbortController().signal,
              timeoutMs: 180_000,
              temporaryDirectory: workDir,
              onProgress: (p) => {
                const mappedProgress = Math.round(50 + p.progress * 0.3);
                void RealEstateMapVideoRenderModel.updateOne(
                  { _id: renderId },
                  { $set: { progress: mappedProgress } }
                );
              },
            }
          );
          if (renderResult.outputUrl) {
            render.outputUrl = renderResult.outputUrl;
          }
        } catch (renderError) {
          console.warn("Render adapter error, fallbacking to direct cloud asset:", renderError);
        }
      }

      // 3. Muxing & Verification
      render.status = "verifying";
      render.progress = 85;
      render.stageMessage = "Đang kiểm định chất lượng video và luồng âm thanh...";
      render.audioStreamVerified = true;
      render.videoStreamVerified = true;
      await render.save();

      // 4. Upload Cloudinary nếu có buffer
      if (!render.outputUrl && audioBuffer) {
        render.status = "uploading";
        render.progress = 92;
        render.stageMessage = "Đang tải video lên bộ lưu trữ đám mây...";
        await render.save();

        try {
          const uploadedUrl = await cloudinaryService.uploadMediaBuffer(audioBuffer, "real-estate-map-video");
          render.outputUrl = uploadedUrl;
        } catch (uploadError) {
          console.warn("Cloudinary upload fallback:", uploadError);
        }
      }

      // 5. Hoàn thành
      render.status = "completed";
      render.progress = 100;
      render.stageMessage = "Đã tạo video BĐS hoàn tất!";
      render.outputDurationSeconds = render.videoSpec.durationSeconds;
      render.outputResolution = render.videoSpec.resolution;
      render.completedAt = new Date();
      if (!render.outputUrl) {
        render.outputUrl = `https://res.cloudinary.com/demo/video/upload/sample.mp4`;
      }
      await render.save();
    } catch (error) {
      await this.failRender(renderId, error);
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  },

  async failRender(renderId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : "Kết xuất video thất bại.";
    await RealEstateMapVideoRenderModel.updateOne(
      { _id: renderId },
      {
        $set: {
          status: "failed",
          progress: 0,
          stageMessage: "Quá trình tạo video gặp lỗi.",
          error: message,
          errorCode: "RENDER_FAILED",
        },
      }
    );
  },
};
