import { aiKnowledgeService } from "../ai-knowledge.service";
import type { HtmlVideoAspectRatio } from "./html-video-security.service";

export type HtmlVideoContextActor = {
  id: string;
  companyCode: string;
};

export type HtmlVideoContextInput = {
  prompt: string;
  aspectRatio: HtmlVideoAspectRatio;
  useKnowledge: boolean;
  useBrandGuideline: boolean;
  referenceNames?: string[];
};

export type HtmlVideoKnowledgeSource = {
  documentId: string;
  title: string;
  kind: "brand_guideline" | "knowledge";
  relevance: number;
};

type RagResult = Awaited<ReturnType<typeof aiKnowledgeService.searchRelevantContext>>;

function inferKnowledgeChannel(prompt: string, aspectRatio: HtmlVideoAspectRatio) {
  const normalized = prompt.toLowerCase();
  if (/\btiktok\b/.test(normalized)) return "tiktok" as const;
  if (/\bzalo\b/.test(normalized)) return "zalo" as const;
  if (/\bfacebook\b/.test(normalized)) return "facebook" as const;
  return aspectRatio === "9:16" ? "tiktok" as const : "facebook" as const;
}

function sourceSummaries(result: RagResult, kind: HtmlVideoKnowledgeSource["kind"]) {
  const byDocument = new Map<string, HtmlVideoKnowledgeSource>();
  result.items.forEach((item) => {
    const current = byDocument.get(item.documentId);
    if (!current || item.score > current.relevance) {
      byDocument.set(item.documentId, {
        documentId: item.documentId,
        title: item.title,
        kind,
        relevance: Number(item.score.toFixed(3)),
      });
    }
  });
  return [...byDocument.values()].sort((left, right) => right.relevance - left.relevance);
}

async function emptyRagResult() {
  return {
    contextText: "",
    matches: 0,
    items: [],
  } as unknown as RagResult;
}

export const htmlVideoContextService = {
  async preview(actor: HtmlVideoContextActor, input: HtmlVideoContextInput) {
    const channel = inferKnowledgeChannel(input.prompt, input.aspectRatio);
    const [brand, knowledge] = await Promise.all([
      input.useBrandGuideline
        ? aiKnowledgeService.searchRelevantContext({
            companyCode: actor.companyCode,
            query: `${input.prompt}\nquy chuẩn nhận diện thương hiệu màu sắc font logo tone of voice chuyển động`,
            channel,
            purpose: "marketing",
            topK: 8,
            documentTypes: ["brand_guideline"],
          })
        : emptyRagResult(),
      input.useKnowledge
        ? aiKnowledgeService.searchRelevantContext({
            companyCode: actor.companyCode,
            query: input.prompt,
            channel,
            purpose: "marketing",
            topK: 8,
            documentTypes: ["company_profile", "product", "service", "policy", "pricing", "faq", "general"],
          })
        : emptyRagResult(),
    ]);
    const brandSources = sourceSummaries(brand, "brand_guideline");
    const knowledgeSources = sourceSummaries(knowledge, "knowledge");
    const warnings: string[] = [];
    if (input.useBrandGuideline && brandSources.length === 0) {
      warnings.push("Chưa tìm thấy Brand Guideline phù hợp trong kho tri thức.");
    }
    if (input.useKnowledge && knowledgeSources.length === 0) {
      warnings.push("Chưa tìm thấy kiến thức doanh nghiệp phù hợp với prompt.");
    }
    return {
      brandGuideline: {
        enabled: input.useBrandGuideline,
        available: brandSources.length > 0,
        sourcesCount: brandSources.length,
      },
      knowledge: {
        enabled: input.useKnowledge,
        sourcesCount: knowledgeSources.length,
      },
      referencesCount: input.referenceNames?.length || 0,
      sources: [...brandSources, ...knowledgeSources],
      warnings,
    };
  },
};
