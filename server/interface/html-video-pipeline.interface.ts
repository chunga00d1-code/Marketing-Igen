import type {
  HtmlVideoAspectRatio,
  HtmlVideoResolution,
} from "../service/html-video/html-video-security.service";

export const HTML_VIDEO_PIPELINE_VERSION = "2.0" as const;

export type HtmlVideoSourceReference = {
  id: string;
  type: "prompt" | "prompt_file" | "reference" | "asset" | "history";
  label: string;
};

export type HtmlVideoSpec = {
  aspectRatio: HtmlVideoAspectRatio;
  resolution: HtmlVideoResolution;
  durationSeconds: number;
  language: string;
  audience: string;
  platform: "tiktok" | "reels" | "shorts" | "facebook" | "generic";
  cta: string;
};

export type HtmlVideoBrief = {
  objective: string;
  tone: string;
  visualStyle: string;
  voiceRequired: boolean;
  exactPhrases: string[];
  videoSpec: HtmlVideoSpec;
};

export type HtmlVideoContentUnit = {
  id: string;
  order: number;
  sourceText: string;
  normalizedText: string;
  sourceRefs: string[];
  required: boolean;
  requiredVerbatim: boolean;
};

export type HtmlVideoScenePurpose = "opening" | "content" | "closing";
export type HtmlVideoSceneTransition = "crossfade" | "slide-left" | "slide-right";

export type HtmlVideoScenePlanItem = {
  id: string;
  order: number;
  purpose: HtmlVideoScenePurpose;
  sourceUnitIds: string[];
  onScreenText: string[];
  narration: string;
  startSeconds: number;
  endSeconds: number;
  transition: HtmlVideoSceneTransition;
  assetIds: string[];
};

export type HtmlVideoVisualScene = {
  sceneId: string;
  layout: "centered" | "split-left" | "split-right" | "statement" | "cta";
  eyebrow: string;
  headline: string;
  body: string;
  cta: string;
  assetIds: string[];
};

export type HtmlVideoVisualComposition = {
  theme: "ocean" | "midnight" | "sunset" | "emerald" | "violet";
  scenes: HtmlVideoVisualScene[];
};

export type HtmlVideoVoiceScene = {
  sceneId: string;
  text: string;
};

export type HtmlVideoVoiceComposition = {
  scenes: HtmlVideoVoiceScene[];
  fullScript: string;
};

export type HtmlVideoPipelineFinding = {
  stage: "grounding" | "planning" | "visual" | "voice" | "validation";
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  sceneId?: string;
};

export type HtmlVideoPipelineMetadata = {
  version: typeof HTML_VIDEO_PIPELINE_VERSION;
  sourceText: string;
  sourceContextRefs: HtmlVideoSourceReference[];
  videoBrief: HtmlVideoBrief;
  contentUnits: HtmlVideoContentUnit[];
  scenePlan: HtmlVideoScenePlanItem[];
  findings: HtmlVideoPipelineFinding[];
};

export type HtmlVideoPlan = Pick<
  HtmlVideoPipelineMetadata,
  "videoBrief" | "contentUnits" | "scenePlan"
>;
