import { GoogleGenAI } from "@google/genai";
import {
  ContextualCaptionProvider,
  VideoCaptionSourceReference,
} from "../../shared/video-caption.contract";
import { IVideoCaptionProject } from "../interface/video-caption.interface";
import { MarketingCampaignSlotModel } from "../model/marketing-campaign-slot.model";
import { MarketingCampaignModel } from "../model/marketing-campaign.model";
import { MarketingContentModel } from "../model/marketing-content.model";
import { aiKnowledgeService } from "./ai-knowledge.service";
import {
  VideoContentAnalysis,
  videoBlueprintService,
} from "./video-blueprint.service";
import { VideoCaptionError } from "./video-caption-error";

const CONTEXT_MODEL =
  process.env.VIDEO_CAPTION_CONTEXT_MODEL?.trim() ||
  "gemini-2.5-flash";

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

function safeJson<T>(value: string): T {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(cleaned) as T;
}

function buildScenes(
  analysis: VideoContentAnalysis,
  durationMs: number
) {
  const moments = (analysis.keyMoments || [])
    .filter((moment) => Number.isFinite(moment.fraction))
    .sort((a, b) => a.fraction - b.fraction)
    .slice(0, 6);
  const fallback = [0.12, 0.48, 0.82].map((fraction, index) => ({
    fraction,
    description:
      index === 0
        ? analysis.suggestedTitle || "Mở đầu video"
        : index === 2
          ? analysis.suggestedCTA || "Kết thúc video"
          : (analysis.mainTopics || []).join(", ") || "Nội dung chính",
  }));
  const rawScenes = (moments.length ? moments : fallback).map(
    (moment, index) => {
    const centerMs = Math.round(
      Math.max(0, Math.min(1, moment.fraction)) * durationMs
    );
    const startMs = Math.max(0, centerMs - 800);
    const endMs = Math.min(
      durationMs,
      Math.max(startMs + 1_800, centerMs + 2_400)
    );
    return {
      id: `scene-${index + 1}`,
      startMs,
      endMs,
      summary: moment.description,
    };
    }
  );
  const scenes: typeof rawScenes = [];
  for (const scene of rawScenes) {
    const previous = scenes[scenes.length - 1];
    const startMs = previous
      ? Math.max(scene.startMs, previous.endMs + 120)
      : scene.startMs;
    if (startMs >= durationMs - 500) continue;
    const endMs = Math.min(
      durationMs,
      Math.max(startMs + 1_200, scene.endMs)
    );
    scenes.push({ ...scene, startMs, endMs });
  }
  return scenes;
}

class GeminiContextualCaptionProvider
  implements ContextualCaptionProvider
{
  readonly name = "gemini";

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
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new VideoCaptionError(
        "Chưa cấu hình GEMINI_API_KEY để tạo caption ngữ cảnh.",
        "GEMINI_API_KEY_REQUIRED",
        "authentication",
        false,
        422
      );
    }
    const ai = new GoogleGenAI({ apiKey });
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
    const response = await ai.models.generateContent({
      model: CONTEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.25,
      },
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
    const [analysis, sources] = await Promise.all([
      videoBlueprintService.analyzeVideoContent(
        project.source.url,
        durationMs / 1000
      ),
      buildContextSources(project),
    ]);
    if (!sources.length) {
      throw new VideoCaptionError(
        "Chưa có tài liệu, bài viết, chiến dịch hoặc yêu cầu để tạo caption ngữ cảnh.",
        "CONTEXT_SOURCE_REQUIRED",
        "validation",
        false,
        422
      );
    }

    const scenes = buildScenes(analysis, durationMs);
    const provider = new GeminiContextualCaptionProvider();
    const context = sources
      .map(
        (source) =>
          `[Nguồn ${source.index}] ${source.reference.title || source.reference.kind}\n${source.text}`
      )
      .join("\n\n---\n\n");
    const generated = await provider.generate({
      scenes,
      context,
      idempotencyKey,
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
      language: analysis.language,
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
