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
  fallbackModel?: string;
  fallbackMaxRetries?: number;
  fallbackTimeoutMs?: number;
  maxTokens?: number;
  provider?: "openrouter";
}

export interface ChatRagContext {
  contextText?: string;
  companyCode?: string;
  matches?: number;
  bestScore?: number;
  productCandidateNames?: string[];
  shouldAskProductConfirmation?: boolean;
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
