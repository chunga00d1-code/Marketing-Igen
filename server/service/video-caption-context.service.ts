import {
  ContextualCaptionProvider,
  VideoCaptionSourceReference,
} from "../../shared/video-caption.contract";
import { IVideoCaptionProject } from "../interface/video-caption.interface";
import { MarketingCampaignSlotModel } from "../model/marketing-campaign-slot.model";
import { MarketingCampaignModel } from "../model/marketing-campaign.model";
import { MarketingContentModel } from "../model/marketing-content.model";
import { VideoCaptionSegmentModel } from "../model/video-caption-segment.model";
import { aiKnowledgeService } from "./ai-knowledge.service";
import { openrouterChat } from "./openrouter.service";
import { VideoCaptionError } from "./video-caption-error";

const CONTEXT_MODEL =
  process.env.VIDEO_CAPTION_CONTEXT_MODEL?.trim() ||
  "google/gemini-2.5-flash";

type ContextSource = {
  index: number;
  text: string;
  reference: VideoCaptionSourceReference;
};

type GeneratedCandidate = {
  sceneId?: string;
  text?: string;
  sourceIndexes?: number[];
};

type ContextScene = {
  id: string;
  startMs: number;
  endMs: number;
  summary: string;
};

function safeJson<T>(value: string): T {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(cleaned) as T;
}

function normalizeContextGenerationError(error: unknown) {
  if (error instanceof VideoCaptionError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  const providerStatus =
    typeof (error as { status?: unknown })?.status === "number"
      ? (error as { status: number }).status
      : undefined;
  const hasStatus = (status: number) =>
    providerStatus === status ||
    normalized.includes(` ${status}`) ||
    normalized.includes(`:${status}`) ||
    normalized.includes(`"status":${status}`);
  if (
    normalized.includes("prepayment credits are depleted") ||
    normalized.includes("credits are depleted") ||
    normalized.includes("billing#prepay")
  ) {
    return new VideoCaptionError(
      "Tài khoản AI đã hết credit. Hãy nạp credit cho OpenRouter rồi thử lại.",
      "AI_CONTEXT_CREDITS_EXHAUSTED",
      "budget",
      false,
      402
    );
  }
  if (
    normalized.includes("openrouter_api_key") ||
    (normalized.includes("openrouter api") && hasStatus(401)) ||
    hasStatus(401)
  ) {
    return new VideoCaptionError(
      "Không thể xác thực OpenRouter. Hãy kiểm tra OPENROUTER_API_KEY.",
      "OPENROUTER_CONTEXT_AUTHENTICATION_FAILED",
      "authentication",
      false,
      422
    );
  }
  if (hasStatus(402)) {
    return new VideoCaptionError(
      "OpenRouter không còn đủ credit để tạo chữ AI. Hãy nạp credit rồi thử lại.",
      "OPENROUTER_CONTEXT_CREDITS_EXHAUSTED",
      "budget",
      false,
      402
    );
  }
  const isTransient =
    hasStatus(429) ||
    (providerStatus !== undefined && providerStatus >= 500) ||
    normalized.includes("fetch failed") ||
    normalized.includes("timeout");
  return new VideoCaptionError(
    "Không thể tạo chữ AI qua OpenRouter. Hãy thử lại sau ít phút.",
    "OPENROUTER_CONTEXT_GENERATION_FAILED",
    isTransient ? "transient" : "provider",
    isTransient,
    isTransient ? 502 : 422
  );
}

function normalizeContextScenes(
  scenes: ContextScene[],
  durationMs: number
) {
  const normalized: ContextScene[] = [];
  for (const scene of scenes) {
    const previous = normalized[normalized.length - 1];
    const startMs = previous
      ? Math.max(scene.startMs, previous.endMs + 120)
      : Math.max(0, scene.startMs);
    if (startMs >= durationMs - 500) continue;
    const endMs = Math.min(
      durationMs,
      Math.max(startMs + 1_200, scene.endMs)
    );
    normalized.push({ ...scene, startMs, endMs });
  }
  return normalized;
}

async function buildContextScenes(
  project: IVideoCaptionProject,
  fallbackSummary: string
) {
  const durationMs = project.video.durationMs || 0;
  const speechSegments = await VideoCaptionSegmentModel.find({
    companyCode: project.companyCode,
    projectId: project._id,
    version: project.currentVersion,
    lane: "speech",
  })
    .sort({ startMs: 1 })
    .select("startMs endMs text")
    .lean();

  if (speechSegments.length) {
    const sceneCount = Math.min(
      6,
      Math.max(2, Math.ceil(speechSegments.length / 5))
    );
    const selectedIndexes = Array.from({ length: sceneCount }, (_, index) =>
      Math.round(
        (index * Math.max(0, speechSegments.length - 1)) /
          Math.max(1, sceneCount - 1)
      )
    );
    return normalizeContextScenes(
      selectedIndexes.map((segmentIndex, index) => {
        const segment = speechSegments[segmentIndex];
        return {
          id: `speech-scene-${index + 1}`,
          startMs: Math.max(0, segment.startMs - 300),
          endMs: Math.min(
            durationMs,
            Math.max(segment.endMs + 1_500, segment.startMs + 2_000)
          ),
          summary: segment.text,
        };
      }),
      durationMs
    );
  }

  const fallbackFractions = [0.12, 0.5, 0.84];
  return normalizeContextScenes(
    fallbackFractions.map((fraction, index) => {
      const centerMs = Math.round(durationMs * fraction);
      const startMs = Math.max(0, centerMs - 900);
      return {
        id: `fallback-scene-${index + 1}`,
        startMs,
        endMs: Math.min(durationMs, Math.max(startMs + 2_400, centerMs + 1_500)),
        summary: fallbackSummary,
      };
    }),
    durationMs
  );
}

class OpenRouterContextualCaptionProvider
  implements ContextualCaptionProvider
{
  readonly name = "openrouter";

  async generate(input: {
    scenes: Array<{
      id: string;
      startMs: number;
      endMs: number;
      summary: string;
    }>;
    context: string;
    idempotencyKey: string;
  }) {
    if (!process.env.OPENROUTER_API_KEY?.trim()) {
      throw new VideoCaptionError(
        "Chưa cấu hình OPENROUTER_API_KEY để tạo caption ngữ cảnh.",
        "OPENROUTER_CONTEXT_API_KEY_REQUIRED",
        "authentication",
        false,
        422
      );
    }
    const prompt = `Bạn tạo text overlay ngắn cho video marketing.

NGUYÊN TẮC BẮT BUỘC:
- Chỉ dùng sự thật trong NGUỒN THAM CHIẾU.
- Mỗi caption tối đa 12 từ, tự nhiên, dễ đọc trong 2-5 giây.
- Không biến lời thoại thành phụ đề; đây là text bổ sung theo ngữ cảnh.
- Không bịa giá, ưu đãi, tính năng hay cam kết.
- sourceIndexes chỉ chứa số nguồn thực sự hỗ trợ caption.
- Có thể bỏ qua scene nếu không có nguồn phù hợp.

SCENES:
${JSON.stringify(input.scenes)}

NGUỒN THAM CHIẾU:
${input.context}

Trả về JSON:
{"candidates":[{"sceneId":"scene-1","text":"...","sourceIndexes":[0]}]}`;
    const response = await openrouterChat({
      model: CONTEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      jsonMode: true,
      temperature: 0.25,
      maxRetries: 2,
    });
    const parsed = safeJson<{ candidates?: GeneratedCandidate[] }>(
      response.text || "{}"
    );
    return {
      candidates: (parsed.candidates || [])
        .filter(
          (candidate) =>
            Boolean(candidate.sceneId) && Boolean(candidate.text?.trim())
        )
        .map((candidate) => ({
          sceneId: String(candidate.sceneId),
          text: String(candidate.text).trim().slice(0, 180),
          sourceReferences: (candidate.sourceIndexes || []).map(
            (sourceIndex) => ({
              kind: "user_input" as const,
              sourceId: String(sourceIndex),
            })
          ),
        })),
    };
  }
}

async function buildContextSources(project: IVideoCaptionProject) {
  const sources: ContextSource[] = [];
  const push = (
    text: string | undefined,
    reference: VideoCaptionSourceReference
  ) => {
    const normalized = String(text || "").trim();
    if (!normalized) return;
    sources.push({
      index: sources.length,
      text: normalized.slice(0, 3500),
      reference,
    });
  };

  push(project.contextBrief, {
    kind: "user_input",
    sourceId: String(project._id),
    title: "Yêu cầu caption của người dùng",
    excerpt: project.contextBrief?.slice(0, 500),
  });

  let marketingText = "";
  const marketingContentId = project.contextLinks?.marketingContentId;
  if (marketingContentId) {
    const content = await MarketingContentModel.findOne({
      _id: marketingContentId,
      companyCode: project.companyCode,
    }).lean();
    if (!content) {
      throw new VideoCaptionError(
        "Bài viết đã chọn không tồn tại trong doanh nghiệp.",
        "CONTEXT_MARKETING_CONTENT_NOT_FOUND",
        "validation",
        false,
        404
      );
    }
    marketingText = [
      content.title,
      content.bodyText,
      content.sourceBrief,
      content.outline,
      content.voiceScript,
    ]
      .filter(Boolean)
      .join("\n");
    push(marketingText, {
      kind: "marketing_content",
      sourceId: String(content._id),
      title: content.title,
      excerpt: content.bodyText.slice(0, 500),
    });
  }

  let campaignText = "";
  const campaignId = project.contextLinks?.campaignId;
  if (campaignId) {
    const campaign = await MarketingCampaignModel.findOne({
      _id: campaignId,
      companyCode: project.companyCode,
    }).lean();
    if (!campaign) {
      throw new VideoCaptionError(
        "Chiến dịch đã chọn không tồn tại trong doanh nghiệp.",
        "CONTEXT_CAMPAIGN_NOT_FOUND",
        "validation",
        false,
        404
      );
    }
    campaignText = [
      campaign.title,
      campaign.sourceBrief,
      campaign.contentPillars?.join(", "),
      campaign.rules?.requiredCta,
      campaign.rules?.requiredHashtags?.join(" "),
    ]
      .filter(Boolean)
      .join("\n");
    push(campaignText, {
      kind: "campaign_slot",
      sourceId: String(campaign._id),
      title: campaign.title,
      excerpt: campaign.sourceBrief.slice(0, 500),
    });
  }

  const campaignSlotId = project.contextLinks?.campaignSlotId;
  if (campaignSlotId) {
    const slot = await MarketingCampaignSlotModel.findOne({
      _id: campaignSlotId,
      companyCode: project.companyCode,
    }).lean();
    if (!slot) {
      throw new VideoCaptionError(
        "Lịch nội dung đã chọn không tồn tại trong doanh nghiệp.",
        "CONTEXT_CAMPAIGN_SLOT_NOT_FOUND",
        "validation",
        false,
        404
      );
    }
    push(
      [
        slot.pillar,
        slot.objective,
        slot.topicBrief,
        slot.customBodyText,
      ]
        .filter(Boolean)
        .join("\n"),
      {
        kind: "campaign_slot",
        sourceId: String(slot._id),
        title: slot.topicBrief,
        excerpt: slot.objective.slice(0, 500),
      }
    );
  }

  const ragQuery = [
    project.contextBrief,
    marketingText,
    campaignText,
    "thông tin doanh nghiệp sản phẩm dịch vụ lợi ích khách hàng",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 5000);
  const rag = await aiKnowledgeService.searchRelevantContext({
    companyCode: project.companyCode,
    query: ragQuery,
    channel: "tiktok",
    purpose: "caption",
    topK: 8,
  });
  for (const item of rag.items || []) {
    push(item.text, {
      kind: "knowledge_chunk",
      sourceId: item.documentId,
      documentId: item.documentId,
      chunkId: item.chunkId,
      title: item.title,
      version: item.version,
      excerpt: item.text.slice(0, 500),
    });
  }
  return sources;
}

export const videoCaptionContextService = {
  async listOptions(companyCode: string) {
    const [contents, campaigns] = await Promise.all([
      MarketingContentModel.find({ companyCode })
        .sort({ generatedAt: -1 })
        .limit(50)
        .select("_id title channel status generatedAt campaignId campaignSlotId")
        .lean(),
      MarketingCampaignModel.find({ companyCode })
        .sort({ updatedAt: -1 })
        .limit(30)
        .select("_id title status updatedAt")
        .lean(),
    ]);
    return {
      contents: contents.map((content) => ({
        id: String(content._id),
        title: content.title,
        channel: content.channel,
        status: content.status,
        generatedAt: content.generatedAt?.toISOString(),
        campaignId: content.campaignId,
        campaignSlotId: content.campaignSlotId
          ? String(content.campaignSlotId)
          : undefined,
      })),
      campaigns: campaigns.map((campaign) => ({
        id: String(campaign._id),
        title: campaign.title,
        status: campaign.status,
        updatedAt: campaign.updatedAt?.toISOString(),
      })),
    };
  },

  async generate(project: IVideoCaptionProject, idempotencyKey: string) {
    const durationMs = project.video.durationMs;
    if (!durationMs) {
      throw new VideoCaptionError(
        "Chưa xác định được thời lượng video.",
        "VIDEO_DURATION_REQUIRED",
        "validation",
        false,
        422
      );
    }
    const sources = await buildContextSources(project);
    if (!sources.length) {
      throw new VideoCaptionError(
        "Chưa có tài liệu, bài viết, chiến dịch hoặc yêu cầu để tạo caption ngữ cảnh.",
        "CONTEXT_SOURCE_REQUIRED",
        "validation",
        false,
        422
      );
    }

    const scenes = await buildContextScenes(
      project,
      sources[0]?.text.slice(0, 500) || "Nội dung video"
    );
    const provider = new OpenRouterContextualCaptionProvider();
    const context = sources
      .map(
        (source) =>
          `[Nguồn ${source.index}] ${source.reference.title || source.reference.kind}\n${source.text}`
      )
      .join("\n\n---\n\n");
    const generated = await provider
      .generate({
        scenes,
        context,
        idempotencyKey,
      })
      .catch((error: unknown) => {
        throw normalizeContextGenerationError(error);
      });
    const sceneMap = new Map(scenes.map((scene) => [scene.id, scene]));
    const segments = generated.candidates
      .map((candidate, index) => {
        const scene = sceneMap.get(candidate.sceneId);
        if (!scene) return null;
        const referencedIndexes = candidate.sourceReferences
          .map((reference) => Number(reference.sourceId))
          .filter(
            (sourceIndex) =>
              Number.isInteger(sourceIndex) &&
              sourceIndex >= 0 &&
              sourceIndex < sources.length
          );
        const sourceReferences = Array.from(
          new Set(referencedIndexes)
        ).map((sourceIndex) => sources[sourceIndex].reference);
        if (!sourceReferences.length) return null;
        sourceReferences.push({
          kind: "video_scene",
          sourceId: scene.id,
          excerpt: scene.summary.slice(0, 500),
        });
        return {
          lane: "context" as const,
          startMs: scene.startMs,
          endMs: scene.endMs,
          text: candidate.text,
          sceneId: scene.id,
          sourceReferences,
          lockedByUser: false,
          sortOrder: index,
        };
      })
      .filter((segment): segment is NonNullable<typeof segment> =>
        Boolean(segment)
      )
      .sort((a, b) => a.startMs - b.startMs);

    return {
      provider: provider.name,
      model: CONTEXT_MODEL,
      language: project.video.language,
      segments,
      knowledgeSourceIds: sources
        .filter(
          (source) =>
            source.reference.kind === "knowledge_chunk"
        )
        .map((source) => String(source.reference.documentId))
        .filter((value, index, all) => all.indexOf(value) === index),
    };
  },
};
