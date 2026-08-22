import { randomUUID } from "node:crypto";
import {
  HtmlVideoGenerationModel,
  type HtmlVideoGenerationRetryStage,
  type HtmlVideoGenerationStage,
} from "../../model/html-video-generation.model";
import type { HtmlVideoActor } from "./html-video-render.service";
import {
  HtmlVideoDraftError,
  htmlVideoDraftService,
  type HtmlVideoDraftInput,
} from "./html-video-draft.service";
import { API_COSTS, walletService } from "../wallet.service";

const leaseDurationMs = 10 * 60 * 1_000;
const stagePresentation: Record<
  Exclude<HtmlVideoGenerationStage, "ready" | "failed">,
  { progress: number; message: string }
> = {
  queued: { progress: 0, message: "Đang chờ phân tích prompt." },
  grounding: { progress: 10, message: "Đang chuẩn hóa yêu cầu và nguồn tham chiếu." },
  planning: { progress: 30, message: "Đang lập kịch bản và timeline theo prompt." },
  composing: { progress: 60, message: "Đang dựng hình ảnh và lời thoại theo từng cảnh." },
  validating: { progress: 85, message: "Đang kiểm tra bố cục, nội dung và timeline." },
};

function safeGenerationError(error: unknown) {
  if (error instanceof HtmlVideoDraftError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "INTERNAL",
    message: "Không thể hoàn tất bản dựng HTML-to-video lúc này. Vui lòng thử lại.",
  };
}

export function isRetryableHtmlVideoGenerationError(error: unknown) {
  return error instanceof HtmlVideoDraftError && error.code === "AI_UNAVAILABLE";
}
function serializeGeneration(document: Record<string, unknown>) {
  const status = String(document.status) as HtmlVideoGenerationStage;
  const data: Record<string, unknown> = {
    id: String(document._id),
    status,
    currentStage: String(document.currentStage || status),
    progress: Number(document.progress || 0),
    stageMessage: String(document.stageMessage || ""),
    error: status === "failed" ? String(document.error || "") : null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
  if (status === "ready") {
    data.draft = {
      html: String(document.html || ""),
      css: String(document.css || ""),
      ...(document.voiceScript ? { voiceScript: String(document.voiceScript) } : {}),
      ...(document.pipeline ? { pipeline: document.pipeline } : {}),
    };
  }
  return data;
}

function checkpointUnset(stage: HtmlVideoGenerationRetryStage) {
  if (stage === "planning") {
    return {
      "checkpoint.plan": "",
      "checkpoint.visual": "",
      "checkpoint.voice": "",
    };
  }
  if (stage === "visual") return { "checkpoint.visual": "" };
  if (stage === "voice") return { "checkpoint.voice": "" };
  return { "checkpoint.visual": "" };
}

export const htmlVideoGenerationService = {
  async createGeneration(
    actor: HtmlVideoActor,
    input: HtmlVideoDraftInput & { idempotencyKey: string }
  ) {
    await walletService.checkBalance(actor.id, API_COSTS.AI_HTML_CHAT);
    const { idempotencyKey, ...draftInput } = input;
    try {
      const created = await HtmlVideoGenerationModel.create({
        userId: actor.id,
        companyCode: actor.companyCode,
        idempotencyKey,
        input: draftInput,
      });
      return { generation: serializeGeneration(created.toObject()), created: true };
    } catch (error) {
      const duplicate = typeof error === "object" && error !== null
        && Number((error as { code?: unknown }).code) === 11000;
      if (!duplicate) throw error;
      const existing = await HtmlVideoGenerationModel.findOne({
        userId: actor.id,
        companyCode: actor.companyCode,
        idempotencyKey,
      }).lean();
      if (!existing) throw error;
      return { generation: serializeGeneration(existing as never), created: false };
    }
  },

  async getGeneration(actor: HtmlVideoActor, generationId: string) {
    const generation = await HtmlVideoGenerationModel.findOne({
      _id: generationId,
      userId: actor.id,
      companyCode: actor.companyCode,
    })
      .select("+html +css +voiceScript +pipeline")
      .lean();
    if (!generation) throw new Error("Không tìm thấy tác vụ tạo video.");
    return serializeGeneration(generation as never);
  },

  async processGeneration(generationId: string) {
    const leaseOwner = randomUUID();
    const now = new Date();
    const generation = await HtmlVideoGenerationModel.findOneAndUpdate(
      {
        _id: generationId,
        status: "queued",
        $or: [
          { leaseExpiresAt: { $exists: false } },
          { leaseExpiresAt: { $lte: now } },
          { leaseOwner: "" },
        ],
      },
      {
        $set: {
          status: "grounding",
          currentStage: "grounding",
          progress: stagePresentation.grounding.progress,
          stageMessage: stagePresentation.grounding.message,
          leaseOwner,
          leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
          startedAt: now,
          errorCode: "",
          error: "",
        },
        $inc: { attempts: 1 },
      },
      { returnDocument: "after" }
    )
      .select("+input +checkpoint")
      .lean();
    if (!generation) return;

    const updateStage = async (stage: "grounding" | "planning" | "composing" | "validation") => {
      const persistedStage = stage === "validation" ? "validating" : stage;
      const presentation = stagePresentation[persistedStage];
      await HtmlVideoGenerationModel.updateOne(
        { _id: generationId, leaseOwner },
        {
          $set: {
            status: persistedStage,
            currentStage: persistedStage,
            progress: presentation.progress,
            stageMessage: presentation.message,
            leaseExpiresAt: new Date(Date.now() + leaseDurationMs),
          },
        }
      );
    };

    try {
      const draft = await htmlVideoDraftService.generate(
        { id: String(generation.userId), companyCode: generation.companyCode },
        generation.input,
        {
          checkpoint: generation.checkpoint,
          billingIdempotencyKey: `html-video-generation:${generationId}`,
          onPipelineStage: updateStage,
          onPipelineCheckpoint: async (key, value) => {
            await HtmlVideoGenerationModel.updateOne(
              { _id: generationId, leaseOwner },
              {
                $set: {
                  [`checkpoint.${key}`]: value,
                  leaseExpiresAt: new Date(Date.now() + leaseDurationMs),
                },
              }
            );
          },
          onPipelineCheckpointReset: async (keys) => {
            const unset = Object.fromEntries(
              keys.map((key) => [`checkpoint.${key}`, ""])
            );
            await HtmlVideoGenerationModel.updateOne(
              { _id: generationId, leaseOwner },
              { $unset: unset }
            );
          },
        }
      );
      await HtmlVideoGenerationModel.updateOne(
        { _id: generationId, leaseOwner },
        {
          $set: {
            html: draft.html,
            css: draft.css,
            voiceScript: draft.voiceScript || "",
            pipeline: draft.pipeline,
            status: "ready",
            currentStage: "ready",
            progress: 100,
            stageMessage: "Bản dựng đã sẵn sàng để xem trước và render.",
            errorCode: "",
            error: "",
            leaseOwner: "",
            completedAt: new Date(),
          },
          $unset: { leaseExpiresAt: "" },
        }
      );
    } catch (error) {
      const safe = safeGenerationError(error);
      const retryable = isRetryableHtmlVideoGenerationError(error);
      await HtmlVideoGenerationModel.updateOne(
        { _id: generationId, leaseOwner },
        {
          $set: {
            status: retryable ? "queued" : "failed",
            currentStage: retryable ? "queued" : "failed",
            progress: 0,
            stageMessage: retryable
              ? "Dịch vụ AI đang giới hạn hoặc tạm gián đoạn. Tác vụ sẽ được thử lại."
              : "Tạo bản dựng HTML-to-video thất bại.",
            errorCode: safe.code,
            error: safe.message,
            leaseOwner: "",
            ...(!retryable ? { completedAt: new Date() } : {}),
          },
          $unset: { leaseExpiresAt: "" },
        }
      );
      if (retryable) throw error;
    }
  },

  async failGeneration(generationId: string, error: unknown) {
    const safe = safeGenerationError(error);
    await HtmlVideoGenerationModel.updateOne(
      { _id: generationId, status: { $ne: "ready" } },
      {
        $set: {
          status: "failed",
          currentStage: "failed",
          progress: 0,
          stageMessage: "Tạo bản dựng HTML-to-video thất bại.",
          errorCode: safe.code,
          error: safe.message,
          leaseOwner: "",
          completedAt: new Date(),
        },
        $unset: { leaseExpiresAt: "" },
      }
    );
  },

  async retryGeneration(
    actor: HtmlVideoActor,
    generationId: string,
    stage: HtmlVideoGenerationRetryStage
  ) {
    const generation = await HtmlVideoGenerationModel.findOneAndUpdate(
      {
        _id: generationId,
        userId: actor.id,
        companyCode: actor.companyCode,
        status: "failed",
      },
      {
        $set: {
          status: "queued",
          currentStage: "queued",
          progress: 0,
          stageMessage: `Đang chờ thử lại stage ${stage}.`,
          errorCode: "",
          error: "",
          leaseOwner: "",
        },
        $unset: {
          ...checkpointUnset(stage),
          html: "",
          css: "",
          voiceScript: "",
          pipeline: "",
          completedAt: "",
          leaseExpiresAt: "",
        },
      },
      { returnDocument: "after" }
    ).lean();
    if (!generation) throw new Error("Không tìm thấy tác vụ lỗi để thử lại.");
    return serializeGeneration(generation as never);
  },

  async recoverPendingGenerations() {
    const staleBefore = new Date(Date.now() - leaseDurationMs);
    await HtmlVideoGenerationModel.updateMany(
      {
        status: { $in: ["grounding", "planning", "composing", "validating"] },
        updatedAt: { $lte: staleBefore },
      },
      {
        $set: {
          status: "queued",
          currentStage: "queued",
          progress: 0,
          stageMessage: "Khôi phục tác vụ tạo bản dựng bị gián đoạn.",
          leaseOwner: "",
        },
        $unset: { leaseExpiresAt: "" },
      }
    );
    const pending = await HtmlVideoGenerationModel.find({ status: "queued" })
      .sort({ createdAt: 1 })
      .limit(200)
      .select("_id")
      .lean();
    return pending.map((item) => String(item._id));
  },
};
