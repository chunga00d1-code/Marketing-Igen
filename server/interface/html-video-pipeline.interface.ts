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

export type HtmlVideoPromptAssumptions = {
  requestSpecVersion?: "1.0";
  mode?: "create" | "revision";
  contentMode?: string;
  narrationLanguage?: string;
  languageLock?: string;
  durationPolicy?: "explicit" | "inferred" | "preserve-existing";
  durationSeconds?: number;
  aspectRatio?: HtmlVideoAspectRatio;
  imagePolicy?: "none" | "embed" | "reference" | "mixed";
  inputImageCount?: number;
  sourceOrder?: "preserve";
  preserveUnrequestedProperties?: boolean;
};

export type HtmlVideoPromptProvenance = {
  rawUserPrompt: string;
  masterPrompt?: string;
  inferredAssumptions?: HtmlVideoPromptAssumptions;
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
  assetId?: string;
  sourceText: string;
  normalizedText: string;
  sourceRefs: string[];
  sourceKind?: "prompt" | "document" | "image_ocr" | "history";
  confidence?: number;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
    coordinateSpace: "normalized";
  };
  required: boolean;
  requiredVerbatim: boolean;
};

export type HtmlVideoScenePurpose = "opening" | "content" | "closing";
export type HtmlVideoSceneTransition = "crossfade" | "slide-left" | "slide-right";

export type HtmlVideoTheme =
  | "ocean"
  | "midnight"
  | "sunset"
  | "emerald"
  | "violet"
  | "coral"
  | "gold"
  | "arctic"
  | "neon"
  | "earth"
  | "blush"
  | "slate";

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
  emphasis?: "hero" | "standard" | "climax";
  accentStyle?: "glow" | "border" | "gradient-shift" | "minimal";
  compositionStyle?: "editorial" | "kinetic" | "spotlight" | "showcase" | "minimal";
  surfaceStyle?: "glass" | "solid" | "outline" | "none";
  backgroundStyle?: "mesh" | "grid" | "rays" | "spotlight" | "gradient";
  motionPreset?: "soft-reveal" | "kinetic-slide" | "scale-pop" | "spotlight-sweep";
  visualMotif?: "rings" | "bars" | "device" | "checklist" | "spark" | "none";
  eyebrow: string;
  headline: string;
  body: string;
  cta: string;
  assetIds: string[];
};

export type HtmlVideoVisualComposition = {
  theme: HtmlVideoTheme;
  scenes: HtmlVideoVisualScene[];
};

export type HtmlVideoVoiceScene = {
  sceneId: string;
  text: string;
};

export type HtmlVideoVoiceComposition = {
  scenes: HtmlVideoVoiceScene[];
  fullScript: string;
  adjustedSceneIds?: string[];
};

export type HtmlVideoPipelineFinding = {
  stage: "grounding" | "planning" | "visual" | "voice" | "validation";
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  sceneId?: string;
};

export type HtmlVideoAudioSceneManifest = {
  sceneId: string;
  textHash: string;
  sourceDurationSeconds: number;
  playbackRate: number;
  startSeconds: number;
  endSeconds: number;
  adjustedFromApprovedText?: boolean;
};

export type HtmlVideoAudioManifest = {
  version: "1.0";
  provider: "openrouter" | "elevenlabs";
  model: string;
  voice: string;
  language: string;
  generatedAt: string;
  scenes: HtmlVideoAudioSceneManifest[];
};

export type HtmlVideoPipelineMetadata = {
  version: typeof HTML_VIDEO_PIPELINE_VERSION;
  sourceText: string;
  promptProvenance?: HtmlVideoPromptProvenance;
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
