import { getAccessToken } from "./authService";
import type { HtmlVideoAspectRatio } from "./htmlVideoRenderService";

export type HtmlVideoContextSource = {
  documentId: string;
  title: string;
  kind: "brand_guideline" | "knowledge";
  relevance: number;
};

export type HtmlVideoContextPreview = {
  brandGuideline: {
    enabled: boolean;
    available: boolean;
    sourcesCount: number;
  };
  knowledge: {
    enabled: boolean;
    sourcesCount: number;
  };
  referencesCount: number;
  sources: HtmlVideoContextSource[];
  warnings: string[];
};

export type HtmlVideoContextPreviewInput = {
  prompt: string;
  aspectRatio: HtmlVideoAspectRatio;
  useKnowledge: boolean;
  useBrandGuideline: boolean;
  referenceNames: string[];
};

export const htmlVideoContextService = {
  async preview(input: HtmlVideoContextPreviewInput, signal?: AbortSignal) {
    const response = await fetch("/api/v1/html-video-renders/context-preview", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify(input),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.data) {
      throw new Error(payload?.message || "Không thể kiểm tra nguồn dữ liệu cho video.");
    }
    return payload.data as HtmlVideoContextPreview;
  },
};
