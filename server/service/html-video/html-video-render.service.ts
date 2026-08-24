import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mongoose from "mongoose";
import { HtmlVideoGenerationModel } from "../../model/html-video-generation.model";
import {
  HtmlVideoRenderModel,
  type HtmlVideoRenderDocument,
  type HtmlVideoRenderStatus,
} from "../../model/html-video-render.model";
import {
  buildSafeHtmlVideoComposition,
  type HtmlVideoAsset,
  type HtmlVideoSource,
} from "./html-video-security.service";
import {
  VideoRenderAdapterError,
  type VideoRenderVoiceSegment,
} from "../video-edit/render-adapter";
import { defaultVideoRenderAdapterRegistry } from "../video-edit/video-render-adapters";
import { htmlVideoTtsService } from "./html-video-tts.service";
import { API_COSTS, walletService } from "../wallet.service";
import type { HtmlVideoPipelineMetadata } from "../../interface/html-video-pipeline.interface";
import type { HtmlVideoScenePlanItem } from "../../interface/html-video-pipeline.interface";

export type HtmlVideoActor = {
  id: string;
  companyCode: string;
};

export type CreateHtmlVideoRenderInput = HtmlVideoSource & {
  idempotencyKey: string;
  promptHistoryId?: string;
  generationId?: string;
  voiceScript?: string;
  pipeline?: HtmlVideoPipelineMetadata;
};

const MAX_VOICE_SCRIPT_LENGTH = 8_000;
const MAX_RENDER_DIAGNOSTIC_LENGTH = 4_096;

function generationBillingKey(generationId?: unknown) {
  const normalized = String(generationId || "").trim();
  return normalized ? `html-video-generation:${normalized}` : "";
}

function renderSourceWithPipeline(input: CreateHtmlVideoRenderInput): HtmlVideoSource {
  if (!input.pipeline) return input;
  const spec = input.pipeline.videoBrief.videoSpec;
  if (
    input.pipeline.version !== "2.0" ||
    spec.durationSeconds !== input.durationSeconds ||
    spec.aspectRatio !== input.aspectRatio ||
    spec.resolution !== input.resolution
  ) {
    throw new Error("Pipeline snapshot does not match the requested video settings.");
  }
  if (
    input.scenePlan &&
    JSON.stringify(input.scenePlan) !== JSON.stringify(input.pipeline.scenePlan)
  ) {
    throw new Error("Pipeline snapshot does not match the requested scene plan.");
  }
  return {
    ...input,
    scenePlan: input.pipeline.scenePlan,
  };
}

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

export type HtmlVideoRenderEditSource = {
  html: string;
  css: string;
  voiceScript: string;
  snapshotHash: string;
  pipeline?: HtmlVideoPipelineMetadata;
  assets?: HtmlVideoAsset[];
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

const htmlVideoTtsConcurrency = Math.min(
  Math.max(Number(process.env.HTML_VIDEO_TTS_CONCURRENCY) || 2, 1),
  3
);

async function mapWithBoundedConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index], index);
    }
  }));
  return results;
}

export function buildAudioFirstSceneTimeline(
  scenes: HtmlVideoScenePlanItem[],
  sourceDurationsSeconds: number[],
  durationSeconds: number,
  maximumPlaybackRate = 1.2
) {
  if (
    scenes.length === 0 ||
    scenes.length !== sourceDurationsSeconds.length ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    sourceDurationsSeconds.some((duration) => !Number.isFinite(duration) || duration <= 0)
  ) {
    throw new VideoRenderAdapterError(
      "RENDER_INPUT_INVALID",
      "Measured voice timing is incomplete."
    );
  }
  const transitionPaddingSeconds = Math.min(
    0.18,
    Math.max(0.06, durationSeconds / (scenes.length * 14))
  );
  const availableSpeechSeconds = Math.max(
    durationSeconds * 0.72,
    durationSeconds - transitionPaddingSeconds * scenes.length
  );
  const sourceSpeechSeconds = sourceDurationsSeconds.reduce((sum, value) => sum + value, 0);
  const playbackRate = Math.max(1, sourceSpeechSeconds / availableSpeechSeconds);
  if (playbackRate > maximumPlaybackRate + 0.001) {
    throw new VideoRenderAdapterError(
      "RENDER_INPUT_INVALID",
      "Voice narration is too long for the requested video duration.",
      {
        requiredPlaybackRate: Number(playbackRate.toFixed(3)),
        maximumPlaybackRate,
      }
    );
  }
  const effectiveDurations = sourceDurationsSeconds.map((value) => value / playbackRate);
  const baseDurations = effectiveDurations.map((value) => value + transitionPaddingSeconds);
  const remainingSeconds = Math.max(
    0,
    durationSeconds - baseDurations.reduce((sum, value) => sum + value, 0)
  );
  const weightTotal = effectiveDurations.reduce((sum, value) => sum + Math.max(0.25, value), 0);
  let cursor = 0;
  const scenePlan = scenes.map((scene, index) => {
    const startSeconds = Number(cursor.toFixed(3));
    const weightedRemainder = remainingSeconds * Math.max(0.25, effectiveDurations[index]) / weightTotal;
    const endSeconds = index === scenes.length - 1
      ? durationSeconds
      : Number((cursor + baseDurations[index] + weightedRemainder).toFixed(3));
    cursor = endSeconds;
    return { ...scene, startSeconds, endSeconds };
  });
  return {
    scenePlan,
    playbackRate: Number(playbackRate.toFixed(4)),
    transitionPaddingSeconds,
  };
}

function numericTokens(text: string) {
  return text.match(/\b\d+(?:[.,]\d+)?%?\b/g) || [];
}

export function rewriteMeasuredNarrationFromApprovedText(
  scenes: HtmlVideoScenePlanItem[],
  sourceDurationsSeconds: number[],
  durationSeconds: number
) {
  if (
    scenes.length === 0 ||
    scenes.length !== sourceDurationsSeconds.length ||
    sourceDurationsSeconds.some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    return { scenes, adjustedSceneIds: [] as string[] };
  }
  const transitionPaddingSeconds = Math.min(
    0.18,
    Math.max(0.06, durationSeconds / (scenes.length * 14))
  );
  const availableSpeechSeconds = Math.max(
    durationSeconds * 0.72,
    durationSeconds - transitionPaddingSeconds * scenes.length
  );
  const measuredSpeechSeconds = sourceDurationsSeconds.reduce((sum, value) => sum + value, 0);
  const targetFactor = Math.min(0.94, availableSpeechSeconds * 1.08 / measuredSpeechSeconds);
  if (!Number.isFinite(targetFactor) || targetFactor >= 0.94) {
    return { scenes, adjustedSceneIds: [] as string[] };
  }
  const adjustedSceneIds: string[] = [];
  const rewritten = scenes.map((scene) => {
    const originalText = String(scene.narration || "").replace(/\s+/g, " ").trim();
    const approvedText = (scene.onScreenText || [])
      .map((value) => String(value || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(". ")
      .replace(/\.{2,}/g, ".")
      .trim();
    const originalWords = originalText.split(/\s+/).filter(Boolean).length;
    const approvedWords = approvedText.split(/\s+/).filter(Boolean).length;
    const targetWords = Math.max(1, Math.floor(originalWords * targetFactor));
    const preservesNumericFacts = numericTokens(originalText).every((token) => approvedText.includes(token));
    if (
      !approvedText ||
      approvedText === originalText ||
      approvedWords >= originalWords ||
      approvedWords > targetWords ||
      !preservesNumericFacts
    ) {
      return scene;
    }
    adjustedSceneIds.push(scene.id);
    return {
      ...scene,
      narration: /[.!?]$/.test(approvedText) ? approvedText : `${approvedText}.`,
    };
  });
  return { scenes: rewritten, adjustedSceneIds };
}

function attributeValue(attributes: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escapedName}="([^"]*)"`, "i").exec(attributes)?.[1] || "";
}

export function assertSemanticSceneMapping(
  compositionHtml: string,
  pipeline?: HtmlVideoPipelineMetadata
) {
  if (!pipeline || !/\bdata-scene-id="/i.test(compositionHtml)) return;
  const sections = [...compositionHtml.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/gi)];
  if (sections.length !== pipeline.scenePlan.length) {
    throw new VideoRenderAdapterError(
      "RENDER_INPUT_INVALID",
      "Semantic scene markers do not match the scene plan.",
      { expectedScenes: pipeline.scenePlan.length, foundScenes: sections.length }
    );
  }
  const unitMap = new Map(pipeline.contentUnits.map((unit) => [unit.id, unit]));
  const requiresFocus = /\bbackground-sequence\b/.test(compositionHtml);
  pipeline.scenePlan.forEach((scene, index) => {
    const attributes = sections[index][1];
    const content = sections[index][2];
    const sceneId = attributeValue(attributes, "data-scene-id");
    const primaryUnitId = attributeValue(attributes, "data-unit-id");
    const unitIds = new Set(attributeValue(attributes, "data-unit-ids").split(/\s+/).filter(Boolean));
    if (sceneId !== scene.id) {
      throw new VideoRenderAdapterError(
        "RENDER_INPUT_INVALID",
        "A rendered scene is mapped to the wrong scene ID.",
        { sceneIndex: index, expectedSceneId: scene.id, foundSceneId: sceneId }
      );
    }
    if (scene.sourceUnitIds.length > 0) {
      if (primaryUnitId !== scene.sourceUnitIds[0] || scene.sourceUnitIds.some((unitId) => !unitIds.has(unitId))) {
        throw new VideoRenderAdapterError(
          "RENDER_INPUT_INVALID",
          "A rendered scene is mapped to the wrong content unit.",
          { sceneId: scene.id, expectedUnitId: scene.sourceUnitIds[0], foundUnitId: primaryUnitId }
        );
      }
    }
    const focusUnit = scene.sourceUnitIds
      .map((unitId) => unitMap.get(unitId))
      .find((unit) => unit?.region);
    if (requiresFocus && focusUnit) {
      const focusPattern = new RegExp(
        `class="scene-focus"\\s+data-unit-id="${focusUnit.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
        "i"
      );
      if (!focusPattern.test(content)) {
        throw new VideoRenderAdapterError(
          "RENDER_INPUT_INVALID",
          "The visible highlight does not match the narrated content unit.",
          { sceneId: scene.id, expectedUnitId: focusUnit.id }
        );
      }
    }
  });
}

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
    for (const key of ["exitCode", "reason", "stdout", "stderr"] as const) {
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

function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function assetsFromCompositionSnapshot(compositionHtml: string) {
  const assets = new Map<string, HtmlVideoAsset>();
  const pattern = /<div class="html-video-media-slot html-video-media-slot-(background|hero|logo|overlay)" data-media-slot="([a-zA-Z0-9_-]{1,80})"><img src="([^"]+)" alt="([^"]*)"\s*\/><\/div>/gi;
  for (const match of compositionHtml.matchAll(pattern)) {
    const id = match[2];
    if (assets.has(id) || assets.size >= 6) continue;
    assets.set(id, {
      id,
      name: decodeHtmlAttribute(match[4]) || "Ảnh tham chiếu",
      kind: "image",
      url: decodeHtmlAttribute(match[3]),
      role: match[1].toLowerCase() as HtmlVideoAsset["role"],
      includeInVideo: true,
    });
  }
  return [...assets.values()];
}

export const htmlVideoRenderService = {
  async createRender(
    actor: HtmlVideoActor,
    input: CreateHtmlVideoRenderInput
  ): Promise<{ render: HtmlVideoRenderPublic; created: boolean }> {
    const renderSource = renderSourceWithPipeline(input);
    const safeComposition = buildSafeHtmlVideoComposition(renderSource);
    const voiceScript = String(input.voiceScript || "").trim().slice(0, MAX_VOICE_SCRIPT_LENGTH);
    const filter = scopedIdempotencyFilter(actor, input.idempotencyKey);
    const existing = await HtmlVideoRenderModel.findOne(filter).lean();
    if (existing) {
      return { render: serializeRender(existing), created: false };
    }

    if (input.generationId) {
      if (!mongoose.isValidObjectId(input.generationId)) {
        throw new Error("Mã tác vụ tạo bản dựng không hợp lệ.");
      }
      const generation = await HtmlVideoGenerationModel.findOne({
        _id: input.generationId,
        userId: actor.id,
        companyCode: actor.companyCode,
        status: "ready",
      }).select("_id").lean();
      if (!generation) {
        throw new Error("Không tìm thấy bản dựng đã hoàn tất để render.");
      }
      await walletService.reserveBalance(
        actor.id,
        API_COSTS.AI_HTML_CHAT,
        "Tạm giữ chi phí tạo và xác minh video HTML/CSS bằng AI",
        generationBillingKey(input.generationId)
      );
    }

    try {
      const created = await HtmlVideoRenderModel.create({
        ...filter,
        ...(input.promptHistoryId && mongoose.isValidObjectId(input.promptHistoryId)
          ? { promptHistoryId: input.promptHistoryId }
          : {}),
        ...(input.generationId ? { generationId: input.generationId } : {}),
        sourceHtml: input.html,
        sourceCss: input.css,
        sanitizedHtml: safeComposition.sanitizedHtml,
        sanitizedCss: safeComposition.sanitizedCss,
        compositionHtml: safeComposition.compositionHtml,
        ...(input.pipeline ? { pipelineSnapshot: input.pipeline } : {}),
        ...(input.assets?.length ? { assetsSnapshot: input.assets } : {}),
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

  async getRenderEditSource(
    actor: HtmlVideoActor,
    renderId: string
  ): Promise<HtmlVideoRenderEditSource> {
    if (!mongoose.isValidObjectId(renderId)) {
      throw new Error("Mã lần kết xuất video không hợp lệ.");
    }
    const render = await HtmlVideoRenderModel.findOne({
      _id: renderId,
      userId: actor.id,
      companyCode: actor.companyCode,
    })
      .select("+sanitizedHtml +sanitizedCss +voiceScript +pipelineSnapshot +assetsSnapshot +compositionHtml")
      .lean();
    if (!render) {
      throw new Error(
        "Không tìm thấy lần kết xuất video hoặc bạn không có quyền truy cập."
      );
    }
    const html = String(render.sanitizedHtml || "").trim();
    if (!html) {
      throw new Error("Bản dựng gốc của video không còn khả dụng để chỉnh sửa.");
    }
    return {
      html,
      css: String(render.sanitizedCss || ""),
      voiceScript: String(render.voiceScript || ""),
      snapshotHash: createHash("sha256")
        .update(JSON.stringify({
          html,
          css: String(render.sanitizedCss || ""),
          voiceScript: String(render.voiceScript || ""),
          pipeline: render.pipelineSnapshot || null,
        }))
        .digest("hex"),
      ...(render.pipelineSnapshot
        ? { pipeline: render.pipelineSnapshot as HtmlVideoPipelineMetadata }
        : {}),
      ...(() => {
        const assets = render.assetsSnapshot?.length
          ? render.assetsSnapshot
          : assetsFromCompositionSnapshot(String(render.compositionHtml || ""));
        return assets.length > 0 ? { assets } : {};
      })(),
    };
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
      .select("+compositionHtml +sourceHtml +sourceCss +assetsSnapshot +voiceScript +pipelineSnapshot")
      .lean();
    if (!render) return;

    const adapter = defaultVideoRenderAdapterRegistry.get("hyperframes");
    const temporaryDirectory = join(
      tmpdir(),
      `igen-html-video-${renderId}-${randomUUID()}`
    );
    const voiceScript = String(render.voiceScript || "").trim();
    const scenePlan = render.pipelineSnapshot?.scenePlan;
    try {
      let effectiveScenePlan = scenePlan;
      let effectiveCompositionHtml = render.compositionHtml;
      let voiceAudioPath: string | undefined;
      let voiceAudioFormat: "mp3" | "pcm" | undefined;
      let voiceAudioSampleRate: number | undefined;
      let voiceAudioChannels: number | undefined;
      let voiceSegments: VideoRenderVoiceSegment[] | undefined;
      let voiceProvenance: {
        voiceModel: string;
        voiceName: string;
        voiceFormat: "mp3" | "pcm";
        voiceSampleRate?: number;
        voiceChannels?: number;
        voicePlaybackRate: number;
        voiceGeneratedAt: Date;
      } | undefined;
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
        const narrationLanguage = render.pipelineSnapshot?.videoBrief?.videoSpec?.language;
        const hasSceneNarration = Array.isArray(scenePlan) &&
          scenePlan.length > 0 &&
          scenePlan.every((scene) => String(scene.narration || "").trim());
        if (hasSceneNarration) {
          const synthesizeScenes = (scenes: HtmlVideoScenePlanItem[]) => mapWithBoundedConcurrency(
            scenes,
            htmlVideoTtsConcurrency,
            async (scene, index) => {
              const voice = await htmlVideoTtsService.generate(scene.narration, {
                language: narrationLanguage,
              });
              const sourceDurationSeconds = Number(voice.durationSeconds);
              if (!Number.isFinite(sourceDurationSeconds) || sourceDurationSeconds <= 0) {
                throw new VideoRenderAdapterError(
                  "RENDER_INPUT_INVALID",
                  "TTS did not return measurable audio timing.",
                  { sceneId: String(scene.id || index + 1).slice(0, 80) }
                );
              }
              const audioPath = join(
                temporaryDirectory,
                `voice-scene-${String(index + 1).padStart(2, "0")}.${voice.format}`
              );
              await writeFile(audioPath, voice.buffer);
              return {
                voice,
                audioPath,
                sourceDurationSeconds,
              };
            }
          );
          let narrationScenes = scenePlan;
          let adjustedSceneIds = new Set<string>();
          let generatedSegments = await synthesizeScenes(narrationScenes);
          let timing;
          try {
            timing = buildAudioFirstSceneTimeline(
              narrationScenes,
              generatedSegments.map((segment) => segment.sourceDurationSeconds),
              render.durationSeconds
            );
          } catch (error) {
            const canRetryFromApprovedText = error instanceof VideoRenderAdapterError &&
              error.code === "RENDER_INPUT_INVALID" &&
              /too long for the requested video duration/i.test(error.message);
            if (!canRetryFromApprovedText) throw error;
            const rewritten = rewriteMeasuredNarrationFromApprovedText(
              narrationScenes,
              generatedSegments.map((segment) => segment.sourceDurationSeconds),
              render.durationSeconds
            );
            if (rewritten.adjustedSceneIds.length === 0) throw error;
            narrationScenes = rewritten.scenes;
            adjustedSceneIds = new Set(rewritten.adjustedSceneIds);
            generatedSegments = await synthesizeScenes(narrationScenes);
            timing = buildAudioFirstSceneTimeline(
              narrationScenes,
              generatedSegments.map((segment) => segment.sourceDurationSeconds),
              render.durationSeconds
            );
          }
          effectiveScenePlan = timing.scenePlan;
          if (render.sourceHtml && render.sourceCss !== undefined) {
            effectiveCompositionHtml = buildSafeHtmlVideoComposition({
              html: render.sourceHtml,
              css: render.sourceCss,
              durationSeconds: render.durationSeconds,
              aspectRatio: render.aspectRatio,
              resolution: render.resolution,
              assets: render.assetsSnapshot,
              scenePlan: effectiveScenePlan,
            }).compositionHtml;
          }
          voiceSegments = generatedSegments.map((generated, index) => ({
            audioPath: generated.audioPath,
            audioFormat: generated.voice.format,
            ...(generated.voice.sampleRate ? { audioSampleRate: generated.voice.sampleRate } : {}),
            ...(generated.voice.channels ? { audioChannels: generated.voice.channels } : {}),
            startSeconds: effectiveScenePlan![index].startSeconds,
            durationSeconds: effectiveScenePlan![index].endSeconds - effectiveScenePlan![index].startSeconds,
            sourceDurationSeconds: generated.sourceDurationSeconds,
            playbackRate: timing.playbackRate,
          } satisfies VideoRenderVoiceSegment));
          const generatedVoice = generatedSegments[0]?.voice;
          if (generatedVoice) {
            voiceProvenance = {
              voiceModel: generatedVoice.model,
              voiceName: generatedVoice.voice,
              voiceFormat: generatedVoice.format,
              ...(generatedVoice.sampleRate ? { voiceSampleRate: generatedVoice.sampleRate } : {}),
              ...(generatedVoice.channels ? { voiceChannels: generatedVoice.channels } : {}),
              voicePlaybackRate: timing.playbackRate,
              voiceGeneratedAt: new Date(),
            };
            await HtmlVideoRenderModel.updateOne(
              { _id: renderId, status: "rendering" },
              {
                $set: {
                  audioManifest: {
                    version: "1.0",
                    provider: generatedVoice.provider,
                    model: generatedVoice.model,
                    voice: generatedVoice.voice,
                    language: narrationLanguage || "",
                    generatedAt: new Date().toISOString(),
                    scenes: effectiveScenePlan.map((scene, index) => ({
                      sceneId: scene.id,
                      textHash: createHash("sha256").update(scene.narration).digest("hex"),
                      sourceDurationSeconds: Number(generatedSegments[index].sourceDurationSeconds.toFixed(4)),
                      playbackRate: timing.playbackRate,
                      startSeconds: scene.startSeconds,
                      endSeconds: scene.endSeconds,
                      ...(adjustedSceneIds.has(scene.id)
                        ? { adjustedFromApprovedText: true }
                        : {}),
                    })),
                  },
                },
              }
            );
          }
        } else {
          const voice = await htmlVideoTtsService.generate(voiceScript, {
            durationSeconds: render.durationSeconds,
            language: narrationLanguage,
          });
          voiceProvenance = {
            voiceModel: voice.model,
            voiceName: voice.voice,
            voiceFormat: voice.format,
            ...(voice.sampleRate ? { voiceSampleRate: voice.sampleRate } : {}),
            ...(voice.channels ? { voiceChannels: voice.channels } : {}),
            voicePlaybackRate: voice.playbackRate,
            voiceGeneratedAt: new Date(),
          };
          voiceAudioPath = join(
            temporaryDirectory,
            voice.format === "pcm" ? "voice.pcm" : "voice.mp3"
          );
          await writeFile(voiceAudioPath, voice.buffer);
          voiceAudioFormat = voice.format;
          voiceAudioSampleRate = voice.sampleRate;
          voiceAudioChannels = voice.channels;
        }
      }
      if (voiceProvenance) {
        await HtmlVideoRenderModel.updateOne(
          { _id: renderId, status: "rendering" },
          { $set: voiceProvenance }
        );
      }
      const verifyEveryScene = /\bbackground-sequence\b/.test(String(effectiveCompositionHtml || ""));
      const verificationSceneIndexes = Array.isArray(effectiveScenePlan) && effectiveScenePlan.length >= 3
        ? verifyEveryScene
          ? effectiveScenePlan.map((_, index) => index)
          : Array.from(new Set([0, Math.floor(effectiveScenePlan.length / 2), effectiveScenePlan.length - 1]))
        : [];
      const verificationTimesSeconds = verificationSceneIndexes.length > 0
        ? verificationSceneIndexes
            .map((index) => effectiveScenePlan?.[index])
            .filter(Boolean)
            .map((scene) => (scene.startSeconds + scene.endSeconds) / 2)
        : undefined;
      assertSemanticSceneMapping(effectiveCompositionHtml, render.pipelineSnapshot);
      const result = await adapter.render(
        {
          jobId: renderId,
          compositionHtml: effectiveCompositionHtml,
          aspectRatio: render.aspectRatio,
          resolution: render.resolution,
          durationSeconds: render.durationSeconds,
          ...(verificationTimesSeconds ? { verificationTimesSeconds } : {}),
          ...(voiceSegments ? { voiceSegments } : {}),
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
      const billingKey = generationBillingKey(render.generationId);
      if (billingKey) {
        await walletService.settleReservation(String(render.userId), billingKey).catch((billingError) => {
          console.error("[HTML Video] Unable to settle completed render reservation", {
            renderId,
            reason: sanitizeServerRenderDiagnostic(billingError instanceof Error ? billingError.message : billingError),
          });
        });
      }
    } catch (error) {
      const safeFailure = safeRenderFailure(error);
      const isTerminalInputFailure = safeFailure.code === "RENDER_INPUT_INVALID";
      logRenderFailure(renderId, error);
      await HtmlVideoRenderModel.updateOne(
        { _id: renderId, status: { $in: ["rendering", "uploading"] } },
        {
          $set: {
            status: isTerminalInputFailure ? "failed" : "queued",
            progress: 0,
            stageMessage: isTerminalInputFailure
              ? "Dữ liệu video hoặc lời đọc không phù hợp để kết xuất."
              : "Tác vụ sẽ được thử lại.",
            voiceStatus: voiceScript ? "failed" : "disabled",
            errorCode: safeFailure.code,
            error: safeFailure.message,
            ...(isTerminalInputFailure ? { completedAt: new Date() } : {}),
          },
        }
      );
      const billingKey = generationBillingKey(render.generationId);
      if (isTerminalInputFailure && billingKey) {
        await walletService.releaseReservation(String(render.userId), billingKey).catch((billingError) => {
          console.error("[HTML Video] Unable to release failed render reservation", {
            renderId,
            reason: sanitizeServerRenderDiagnostic(billingError instanceof Error ? billingError.message : billingError),
          });
        });
      }
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
      if (isTerminalInputFailure) return;
      throw error;
    }
  },

  async failRender(renderId: string, error: unknown): Promise<void> {
    const safeFailure = safeRenderFailure(error);
    const failedRender = await HtmlVideoRenderModel.findOneAndUpdate(
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
    const billingKey = generationBillingKey(failedRender?.generationId);
    if (failedRender && billingKey) {
      await walletService.releaseReservation(String(failedRender.userId), billingKey);
    }
  },
};
