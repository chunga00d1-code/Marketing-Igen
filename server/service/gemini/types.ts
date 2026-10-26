import type { OpenRouterChatParams } from "../openrouter.service";

export type ChatIntent = "small_talk" | "company_faq" | "product_pricing_policy" | "out_of_scope";

export type NormalizedImageRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export interface GenerateTextConfig {
  systemInstruction?: string;
  temperature?: number;
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
  images?: string[];
  maxRetries?: number;
  timeoutMs?: number;
  deadlineAt?: number;
  fallbackModel?: string;
  allowImageFallback?: boolean;
  fallbackMaxRetries?: number;
  fallbackTimeoutMs?: number;
  maxTokens?: number;
  reasoning?: OpenRouterChatParams["reasoning"];
  provider?: "openrouter";
}

export interface ChatRagContext {
  imageObservation?: import("../chat-image-context").ChatImageObservation;
  imageDescription?: string;
  visualInput?: import("../chat-visual-context").ChatVisualInput;
  visualContext?: import("../chat-visual-context").ChatVisualResult;
  replyDeadlineAt?: number;
  pricingContextText?: string;
  contextText?: string;
  companyCode?: string;
  matches?: number;
  sourceTitles?: string[];
  bestScore?: number;
  productCandidateNames?: string[];
  shouldAskProductConfirmation?: boolean;
  scenarioContextText?: string;
}

export interface SourceBriefExtraction {
  userRequest: string;
  attachedDocumentName: string;
  attachedDocumentExcerpt: string;
  normalizedBrief: string;
}

export interface FaithFulVisualGuardrailInput {
  sourceBrief?: string;
  title?: string;
  summary?: string;
  suggestedContent?: string;
  outline?: string;
  bodyText?: string;
  channels?: string[];
  selectedPillars?: string[];
}
