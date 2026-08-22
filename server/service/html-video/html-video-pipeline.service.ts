import type { openrouterChat } from "../openrouter.service";
import {
  HTML_VIDEO_PIPELINE_VERSION,
  type HtmlVideoBrief,
  type HtmlVideoContentUnit,
  type HtmlVideoPipelineMetadata,
  type HtmlVideoPlan,
  type HtmlVideoScenePlanItem,
  type HtmlVideoVisualComposition,
  type HtmlVideoVisualScene,
  type HtmlVideoVoiceComposition,
} from "../../interface/html-video-pipeline.interface";
import type { HtmlVideoDraftInput, HtmlVideoDraftReferenceSlot } from "./html-video-draft.service";
import { buildHtmlVideoGrounding } from "./html-video-grounding.service";
import {
  classifyHtmlVideoRevisionIntent,
  isVoiceOnlyRevision,
  planFromExistingPipeline,
} from "./html-video-revision.service";

type PipelineChat = typeof openrouterChat;

export type HtmlVideoPipelineStage =
  | "grounding"
  | "planning"
  | "composing"
  | "validation";

export type HtmlVideoPipelineCheckpoint = {
  grounding?: ReturnType<typeof buildHtmlVideoGrounding>;
  plan?: HtmlVideoPlan;
  visual?: HtmlVideoVisualComposition;
  revision?: { html: string; css: string };
  voice?: HtmlVideoVoiceComposition;
};

type HtmlVideoPipelineCheckpointKey = keyof HtmlVideoPipelineCheckpoint;

export class HtmlVideoPipelineProviderError extends Error {
  constructor(public readonly providerCause: unknown) {
    super("HTML video pipeline provider request failed.", { cause: providerCause });
    this.name = "HtmlVideoPipelineProviderError";
  }
}

export type HtmlVideoStructuredPipelineResult =
  | { kind: "legacy"; responseText: string }
  | {
      kind: "structured";
      html: string;
      css: string;
      voiceScript: string;
      pipeline: HtmlVideoPipelineMetadata;
    };

const modelName = () =>
  process.env.HTML_VIDEO_MODEL ||
  process.env.GEMINI_MODEL ||
  "google/gemini-2.5-flash";

const timeoutMs = () => Math.max(
  Number(process.env.HTML_VIDEO_DRAFT_TIMEOUT_MS) || 120_000,
  30_000
);

const maxRetries = () => Math.max(
  Number(process.env.HTML_VIDEO_DRAFT_MAX_RETRIES) || 1,
  1
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseJson(text: string): unknown {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(normalized);
  } catch {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Pipeline output is not valid JSON.");
    return JSON.parse(normalized.slice(start, end + 1));
  }
}

function stringValue(value: unknown, maximum = 2_000) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function stringArray(value: unknown, maximum = 12) {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item, 1_000)).filter(Boolean).slice(0, maximum)
    : [];
}

function inferPlatform(prompt: string, aspectRatio: HtmlVideoDraftInput["aspectRatio"]): HtmlVideoBrief["videoSpec"]["platform"] {
  if (/tiktok/i.test(prompt)) return "tiktok";
  if (/reels?/i.test(prompt)) return "reels";
  if (/shorts?/i.test(prompt)) return "shorts";
  if (/facebook/i.test(prompt)) return "facebook";
  return aspectRatio === "9:16" ? "tiktok" : "generic";
}

export function inferHtmlVideoNarrationLanguage(
  input: Pick<HtmlVideoDraftInput, "prompt" | "primaryPromptContext">
) {
  const source = String(input.primaryPromptContext || input.prompt || "");
  const englishVoiceRequest = /(?:gi\u1ecdng\s*\u0111\u1ecdc|voice|narration|narrator|ng\u00f4n\s*ng\u1eef|language).{0,120}(?:ti\u1ebfng\s*anh|english)/iu;
  const vietnameseVoiceRequest = /(?:gi\u1ecdng\s*\u0111\u1ecdc|voice|narration|narrator|ng\u00f4n\s*ng\u1eef|language).{0,120}(?:ti\u1ebfng\s*vi\u1ec7t|vietnamese)/iu;
  if (englishVoiceRequest.test(source)) return "English";
  if (vietnameseVoiceRequest.test(source)) return "Vietnamese";
  return "";
}

function isEnglishNarrationLanguage(value: string) {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /(?:^|\b)(?:en|english|tieng anh)(?:\b|$)/.test(normalized);
}

function assertNarrationLanguage(text: string, language: string, allowedForeignPhrases: string[] = []) {
  const cleanedText = allowedForeignPhrases.reduce((current, phrase) => {
    const trimmed = phrase.trim();
    if (!trimmed) return current;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return current.replace(new RegExp(escaped, "giu"), " ");
  }, text);
  const normalized = cleanedText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (isEnglishNarrationLanguage(language)) {
    const hasVietnameseLetters = /[\u0103\u00e2\u0111\u00ea\u00f4\u01a1\u01b0]/iu.test(cleanedText);
    const vietnameseWords = normalized.match(/\b(?:va|la|hay|ban|nghe|tiep|theo|chung|cung|bat|dau|ket|thuc|gioi|thieu|tu|vung|lap|lai)\b/g) || [];
    if (hasVietnameseLetters || vietnameseWords.length >= 2) {
      throw new Error("Voice narration does not match the explicitly requested English language.");
    }
    return;
  }
  const isVietnamese = /(?:^|\b)(?:vi|vietnamese|tieng viet)(?:\b|$)/.test(
    language.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  );
  if (!isVietnamese) return;
  const englishWords = normalized.match(/\b(?:the|is|are|and|you|your|we|our|to|of|in|for|this|that|with|from|can|will)\b/g) || [];
  if (englishWords.length >= 3) {
    throw new Error("Voice narration does not match the explicitly requested Vietnamese language.");
  }
}

function normalizeBrief(value: unknown, input: HtmlVideoDraftInput): HtmlVideoBrief {
  const record = isRecord(value) ? value : {};
  const requestedLanguage = inferHtmlVideoNarrationLanguage(input);
  return {
    objective: stringValue(record.objective) || input.prompt.trim(),
    tone: stringValue(record.tone, 200) || "clear and engaging",
    visualStyle: stringValue(record.visualStyle, 300) || "premium social video",
    voiceRequired: record.voiceRequired !== false,
    exactPhrases: stringArray(record.exactPhrases, 20),
    videoSpec: {
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      durationSeconds: input.durationSeconds,
      language: requestedLanguage || stringValue(record.language, 80) || "same as the user request",
      audience: stringValue(record.audience, 300) || "the intended audience in the request",
      platform: inferPlatform(input.prompt, input.aspectRatio),
      cta: stringValue(record.cta, 500),
    },
  };
}

function normalizePurpose(value: unknown, index: number, count: number): HtmlVideoScenePlanItem["purpose"] {
  if (value === "opening" || value === "content" || value === "closing") return value;
  if (index === 0) return "opening";
  return index === count - 1 ? "closing" : "content";
}

function normalizeTransition(value: unknown): HtmlVideoScenePlanItem["transition"] {
  return value === "slide-left" || value === "slide-right" ? value : "crossfade";
}

export function fitHtmlVideoSceneTimeline(
  scenes: HtmlVideoScenePlanItem[],
  durationSeconds: number
) {
  let previousEnd = 0;
  const alreadyContiguous = scenes.every((scene, index) => {
    const startsAtExpectedTime = index === 0
      ? scene.startSeconds === 0
      : Math.abs(scene.startSeconds - previousEnd) <= 0.001;
    const hasPositiveBoundedDuration = scene.endSeconds > scene.startSeconds &&
      scene.endSeconds <= durationSeconds + 0.001;
    previousEnd = scene.endSeconds;
    return startsAtExpectedTime && hasPositiveBoundedDuration;
  }) && Math.abs(previousEnd - durationSeconds) <= 0.001;
  if (alreadyContiguous) return { scenes, adjusted: false };

  const weights = scenes.map((scene) => {
    const proposedDuration = scene.endSeconds - scene.startSeconds;
    if (Number.isFinite(proposedDuration) && proposedDuration > 0) {
      return proposedDuration;
    }
    const narrationWords = scene.narration.split(/\s+/).filter(Boolean).length;
    return Math.max(1, narrationWords);
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  const fittedScenes = scenes.map((scene, index) => {
    const startSeconds = Number(cursor.toFixed(3));
    const endSeconds = index === scenes.length - 1
      ? durationSeconds
      : Number((cursor + (durationSeconds * weights[index]) / totalWeight).toFixed(3));
    cursor = endSeconds;
    return { ...scene, startSeconds, endSeconds };
  });
  return { scenes: fittedScenes, adjusted: true };
}

function normalizePlan(
  value: unknown,
  input: HtmlVideoDraftInput,
  contentUnits: HtmlVideoContentUnit[],
  allowedAssetIds: Set<string>
): HtmlVideoPlan {
  if (!isRecord(value) || !Array.isArray(value.scenePlan)) {
    throw new Error("Planner did not return a scenePlan.");
  }
  const rawScenes = value.scenePlan.slice(0, 24);
  if (rawScenes.length === 0) throw new Error("Planner returned no scenes.");
  const validUnitIds = new Set(contentUnits.map((unit) => unit.id));
  const parsedScenePlan = rawScenes.map((candidate, index): HtmlVideoScenePlanItem => {
    if (!isRecord(candidate)) throw new Error("Planner returned an invalid scene.");
    const sourceUnitIds = stringArray(candidate.sourceUnitIds, contentUnits.length)
      .filter((id) => validUnitIds.has(id));
    const startSeconds = Number(candidate.startSeconds);
    const endSeconds = Number(candidate.endSeconds);
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
      throw new Error("Planner returned invalid scene timing.");
    }
    return {
      id: stringValue(candidate.id, 80) || `scene-${index + 1}`,
      order: index,
      purpose: normalizePurpose(candidate.purpose, index, rawScenes.length),
      sourceUnitIds,
      onScreenText: stringArray(candidate.onScreenText, 5),
      narration: stringValue(candidate.narration, 2_000),
      startSeconds,
      endSeconds,
      transition: normalizeTransition(candidate.transition),
      assetIds: stringArray(candidate.assetIds, 6).filter((id) => allowedAssetIds.has(id)),
    };
  });
  const { scenes: scenePlan } = fitHtmlVideoSceneTimeline(
    parsedScenePlan,
    input.durationSeconds
  );

  const ids = new Set<string>();
  const unitUseCount = new Map<string, number>();
  let previousEnd = 0;
  scenePlan.forEach((scene, index) => {
    if (ids.has(scene.id)) throw new Error("Planner returned duplicate scene IDs.");
    ids.add(scene.id);
    if (Math.abs(scene.startSeconds - previousEnd) > 0.05) {
      throw new Error("Scene timing contains a gap or overlap.");
    }
    if (scene.endSeconds <= scene.startSeconds || scene.endSeconds > input.durationSeconds + 0.05) {
      throw new Error("Scene timing falls outside the video duration.");
    }
    previousEnd = scene.endSeconds;
    scene.sourceUnitIds.forEach((unitId) => {
      unitUseCount.set(unitId, (unitUseCount.get(unitId) || 0) + 1);
    });
    if (scene.onScreenText.length === 0) {
      scene.onScreenText = scene.sourceUnitIds
        .map((unitId) => contentUnits.find((unit) => unit.id === unitId)?.normalizedText || "")
        .filter(Boolean)
        .slice(0, 3);
    }
    if (index === 0 && scene.startSeconds !== 0) {
      throw new Error("The first scene must start at zero.");
    }
  });
  if (Math.abs(previousEnd - input.durationSeconds) > 0.05) {
    throw new Error("Scene timing does not cover the full video duration.");
  }
  for (const unit of contentUnits.filter((item) => item.required)) {
    if (unitUseCount.get(unit.id) !== 1) {
      throw new Error(`Required content unit ${unit.id} must appear exactly once.`);
    }
  }

  return {
    videoBrief: normalizeBrief(value.videoBrief, input),
    contentUnits,
    scenePlan,
  };
}

function normalizeEditedContentUnits(
  value: unknown,
  fallback: HtmlVideoContentUnit[]
) {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  const usedIds = new Set<string>();
  const units = value.slice(0, 24).map((candidate, index): HtmlVideoContentUnit | null => {
    if (!isRecord(candidate)) return null;
    const sourceText = stringValue(candidate.sourceText || candidate.normalizedText, 4_000);
    if (!sourceText) return null;
    const proposedId = stringValue(candidate.id, 80) || `unit-${index + 1}`;
    const id = usedIds.has(proposedId) ? `unit-${index + 1}` : proposedId;
    usedIds.add(id);
    return {
      id,
      order: index,
      sourceText,
      normalizedText: stringValue(candidate.normalizedText, 4_000) || sourceText,
      sourceRefs: ["source-existing-video", "source-current-prompt"],
      required: candidate.required !== false,
      requiredVerbatim: candidate.requiredVerbatim === true,
    };
  }).filter((unit): unit is HtmlVideoContentUnit => Boolean(unit));
  return units.length > 0 ? units : fallback;
}

function revisionSystemPrompt(input: HtmlVideoDraftInput) {
  return [
    "You edit an existing safe HTML/CSS motion-graphic composition in place.",
    "Apply only the CURRENT EDIT REQUEST. Preserve every scene, layout, animation, style, text, asset slot, and timing rule that was not explicitly requested to change.",
    `The final video remains ${input.durationSeconds} seconds, ${input.aspectRatio}, ${input.resolution}.`,
    "Return a minimal JSON patch with baseSnapshotHash, htmlChanges and cssAppend. Never return the complete composition.",
    "Echo baseSnapshotHash exactly as supplied; it binds the patch to the approved composition snapshot.",
    "Each htmlChanges item must contain find, replace, and expectedOccurrences: 1. Copy find exactly from the supplied HTML and change only the requested fragment.",
    "Use cssAppend for scoped override rules and new keyframes. Keep it empty when CSS does not need to change.",
    "Never output scripts, event handlers, style attributes, style tags, URLs, external assets/fonts, img tags, SVG, iframe, forms, @import, @media, url(), CSS expressions, viewport units, or translateY().",
    "Use one position:absolute .scene per approved scene. Keep data-media-slot IDs unchanged unless the approved plan explicitly changes asset assignments.",
    "Animations must be visible and purposeful, remain inside the canvas, and use opacity or horizontal translateX movement only.",
  ].join("\n");
}

function revisionPrompt(input: HtmlVideoDraftInput, plan: HtmlVideoPlan) {
  const source = input.editSource;
  if (!source) throw new Error("Revision source is missing.");
  const approvedPlan = {
    videoBrief: plan.videoBrief,
    contentUnits: plan.contentUnits.map((unit) => ({
      id: unit.id,
      order: unit.order,
      text: unit.normalizedText.slice(0, 300),
    })),
    scenePlan: plan.scenePlan.map((scene) => ({
      id: scene.id,
      order: scene.order,
      purpose: scene.purpose,
      onScreenText: scene.onScreenText.slice(0, 5).map((text) => text.slice(0, 160)),
      startSeconds: scene.startSeconds,
      endSeconds: scene.endSeconds,
      assetIds: scene.assetIds,
    })),
  };
  const boundedHtml = source.html.length <= 24_000
    ? source.html
    : `${source.html.slice(0, 16_000)}\n<!-- BOUNDED MIDDLE -->\n${source.html.slice(-8_000)}`;
  const payload = {
    currentEditRequest: input.prompt,
    baseSnapshotHash: source.snapshotHash || "",
    approvedPlan,
    existingComposition: {
      html: boundedHtml,
      cssTail: source.css.slice(-4_000),
    },
  };
  const serialized = JSON.stringify(payload);
  if (serialized.length <= 42_000) return serialized;
  const emptySourceLength = JSON.stringify({
    ...payload,
    existingComposition: { html: "", cssTail: "" },
  }).length;
  const sourceBudget = Math.max(2_000, 42_000 - emptySourceLength - 500);
  const htmlBudget = Math.max(1_500, Math.floor(sourceBudget * 0.8));
  const cssBudget = Math.max(500, sourceBudget - htmlBudget);
  return JSON.stringify({
    ...payload,
    existingComposition: {
      html: `${source.html.slice(0, Math.floor(htmlBudget * 0.67))}\n<!-- BOUNDED MIDDLE -->\n${source.html.slice(-Math.floor(htmlBudget * 0.33))}`,
      cssTail: source.css.slice(-cssBudget),
    },
  });
}
function normalizeRevisionPatch(value: unknown, source: NonNullable<HtmlVideoDraftInput["editSource"]>) {
  if (!isRecord(value)) throw new Error("Revision Composer returned invalid JSON.");
  if (
    source.snapshotHash
    && value.baseSnapshotHash !== source.snapshotHash
  ) {
    throw new Error("Revision patch does not match the approved composition snapshot.");
  }
  const rawChanges = Array.isArray(value.htmlChanges) ? value.htmlChanges.slice(0, 16) : [];
  let html = source.html;
  let appliedChanges = 0;
  rawChanges.forEach((candidate) => {
    if (!isRecord(candidate)) throw new Error("Revision Composer returned an invalid HTML patch.");
    const find = typeof candidate.find === "string" ? candidate.find : "";
    const replace = typeof candidate.replace === "string" ? candidate.replace : "";
    if (!find || find.length > 24_000 || replace.length > 24_000 || candidate.expectedOccurrences !== 1) {
      throw new Error("Revision Composer returned an unsafe HTML patch.");
    }
    const occurrences = html.split(find).length - 1;
    if (occurrences !== 1) {
      throw new Error(`Revision patch target must occur exactly once; received ${occurrences}.`);
    }
    html = html.replace(find, replace);
    appliedChanges += 1;
  });
  const cssAppend = typeof value.cssAppend === "string"
    ? value.cssAppend.trim().slice(0, 60 * 1024)
    : "";
  if (appliedChanges === 0 && !cssAppend) {
    throw new Error("Revision Composer returned an empty patch.");
  }
  return {
    html,
    css: cssAppend ? `${source.css.trim()}\n\n${cssAppend}` : source.css,
  };
}

function plannerSystemPrompt(input: HtmlVideoDraftInput) {
  return [
    "You are the Requirement and Storyboard Planner for a production prompt-to-MP4 pipeline.",
    ...(input.editSource ? [
      "This is an in-place revision. Preserve the existing content units and scene plan unless the current edit explicitly changes content, order, or timing.",
      "Return the complete revised contentUnits array. For a visual-only or voice-only edit, return contentUnits equivalent to the existing video.",
    ] : []),
    "Return a structured plan only. Do not generate HTML, CSS, JavaScript, URLs, prices, claims, or facts absent from the supplied source.",
    `The video is ${input.durationSeconds} seconds, ${input.aspectRatio}, ${input.resolution}.`,
    "Use every required content unit exactly once and in order. One scene may contain multiple units only for a comparison explicitly requested by the source.",
    "Scene intervals must start at 0, be contiguous without overlap, and end exactly at the requested duration.",
    "Keep on-screen text concise and narration natural. Preserve requested exact phrases.",
    "Use only the supplied asset IDs. If no asset exists, plan a complete typography/CSS-illustration scene instead of an empty placeholder.",
  ].join("\n");
}

function plannerPrompt(
  generationPrompt: string,
  contentUnits: HtmlVideoContentUnit[],
  assets: HtmlVideoDraftReferenceSlot[]
) {
  const boundedUnits = contentUnits.map((unit) => ({
    id: unit.id,
    order: unit.order,
    text: unit.normalizedText.slice(0, 400),
    requiredVerbatim: unit.requiredVerbatim,
  }));
  const suffix = [
    "AUTHORITATIVE CONTENT UNITS:",
    JSON.stringify(boundedUnits),
    "APPROVED ASSET IDS:",
    JSON.stringify(assets.filter((asset) => asset.includeInVideo !== false).map(({ id, name, role }) => ({ id, name, role }))),
  ].join("\n\n");
  const availablePromptLength = Math.max(1, 42_000 - suffix.length - 2);
  const boundedPrompt = generationPrompt.length <= availablePromptLength
    ? generationPrompt
    : [
        generationPrompt.slice(0, Math.max(1, availablePromptLength - 4_200)),
        "[AUXILIARY CONTEXT BOUNDED]",
        generationPrompt.slice(-4_000),
      ].join("\n");
  return [boundedPrompt, suffix].join("\n\n");
}

function visualSystemPrompt() {
  return [
    "You are the Visual Composer. Choose hierarchy, layout, theme, and visual emphasis for the approved scene plan.",
    "Do not generate HTML, CSS, scripts, URLs, timing, new scenes, or new factual copy.",
    "Use only text already present in each scene onScreenText and only approved asset IDs assigned to that scene.",
    "Make each scene visually complete and readable on a phone.",
    "Select the most fitting theme for the subject from: ocean (tech/SaaS), midnight (luxury), sunset (energy/passion), emerald (health/nature), violet (creative/arts), coral (fashion/beauty), gold (finance/real-estate), arctic (medical/science), neon (gaming/entertainment), earth (food/organic), blush (parenting/lifestyle), slate (corporate/B2B).",
    "For each scene, choose: layout (centered|split-left|split-right|statement|cta), emphasis (hero for opening/hook, standard for content, climax for CTA/offer), and accentStyle (glow|border|gradient-shift|minimal).",
  ].join("\n");
}

function voiceSystemPrompt(input: HtmlVideoDraftInput, plan: HtmlVideoPlan) {
  const sceneBudgets = plan.scenePlan.map((scene) => ({
    sceneId: scene.id,
    maximumWords: Math.max(1, Math.floor((scene.endSeconds - scene.startSeconds) * 2.5)),
  }));
  return [
    "You are the Voice Writer for one continuous social-video narrator.",
    ...(input.editSource ? [
      "This is a revision. If the current edit does not explicitly request changes to narration, preserve the existing narration wording and language as closely as the approved scene plan allows.",
      "If narration is explicitly changed, alter only the requested portions and keep all other scene segments stable.",
    ] : []),
    "REQUIRED NARRATION LANGUAGE: " + plan.videoBrief.videoSpec.language + ". Write all narration exclusively in this language. Do not code-switch or translate. A foreign word may appear only when it is explicitly present in the approved scene text or exact phrases.",
    "Use only facts and phrases in the approved scene plan. Do not add labels, timestamps, directions, sound effects, URLs, prices, or claims.",
    `Keep the complete narration under ${Math.ceil(input.durationSeconds * 2.5)} words and in scene order.`,
    "Return one non-empty narration segment for every scene and one fullScript containing those segments in the same order.",
    "Each scene segment must fit its own startSeconds..endSeconds interval at no more than 2.5 spoken words per second. End each segment as a complete sentence so the narrator can pause naturally at scene boundaries.",
    `Hard per-scene word limits: ${JSON.stringify(sceneBudgets)}. Count words before returning and never exceed these limits.`,
  ].join("\n");
}

function normalizeVisual(
  value: unknown,
  plan: HtmlVideoPlan
): HtmlVideoVisualComposition {
  if (!isRecord(value) || !Array.isArray(value.scenes)) {
    throw new Error("Visual Composer returned no scenes.");
  }
  const themes = new Set([
    "ocean", "midnight", "sunset", "emerald", "violet",
    "coral", "gold", "arctic", "neon", "earth", "blush", "slate"
  ]);
  const layouts = new Set(["centered", "split-left", "split-right", "statement", "cta"]);
  const emphasisValues = new Set(["hero", "standard", "climax"]);
  const accentStyles = new Set(["glow", "border", "gradient-shift", "minimal"]);
  const byId = new Map<string, Record<string, unknown>>();
  value.scenes.forEach((scene) => {
    if (isRecord(scene)) byId.set(stringValue(scene.sceneId, 80), scene);
  });
  const scenes = plan.scenePlan.map((scene, index): HtmlVideoVisualScene => {
    const raw = byId.get(scene.id) || {};
    const approvedText = new Set(scene.onScreenText.map((text) => text.trim()).filter(Boolean));
    const takeApproved = (candidate: unknown, fallback = "") => {
      const text = stringValue(candidate, 1_000);
      return text && approvedText.has(text) ? text : fallback;
    };
    const available = [...approvedText];
    const approvedAssets = new Set(scene.assetIds);
    const rawEmphasis = String(raw.emphasis || "").toLowerCase().trim();
    const rawAccent = String(raw.accentStyle || "").toLowerCase().trim();
    const defaultEmphasis = index === 0 ? "hero" : index === plan.scenePlan.length - 1 ? "climax" : "standard";
    return {
      sceneId: scene.id,
      layout: layouts.has(String(raw.layout))
        ? String(raw.layout) as HtmlVideoVisualScene["layout"]
        : scene.purpose === "closing" ? "cta" : "centered",
      emphasis: emphasisValues.has(rawEmphasis)
        ? rawEmphasis as HtmlVideoVisualScene["emphasis"]
        : defaultEmphasis,
      accentStyle: accentStyles.has(rawAccent)
        ? rawAccent as HtmlVideoVisualScene["accentStyle"]
        : "glow",
      eyebrow: takeApproved(raw.eyebrow),
      headline: takeApproved(raw.headline, available[0] || ""),
      body: takeApproved(raw.body, available[1] || ""),
      cta: takeApproved(raw.cta, scene.purpose === "closing" ? available[2] || "" : ""),
      assetIds: stringArray(raw.assetIds, 6).filter((id) => approvedAssets.has(id)),
    };
  });
  return {
    theme: themes.has(String(value.theme))
      ? String(value.theme) as HtmlVideoVisualComposition["theme"]
      : "ocean",
    scenes,
  };
}

export function fitHtmlVideoSceneNarration(
  requestedText: string,
  scene: HtmlVideoScenePlanItem
) {
  const maximumWords = Math.max(1, Math.floor((scene.endSeconds - scene.startSeconds) * 2.5));
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  const words = (text: string) => normalize(text).split(/\s+/).filter(Boolean);
  const requested = normalize(requestedText);
  if (requested && words(requested).length <= maximumWords) {
    return { text: requested, adjusted: false, maximumWords };
  }

  const faithfulFallbacks = [
    normalize(scene.narration),
    normalize(scene.onScreenText.join(". ")),
  ].filter(Boolean);
  const fittingFallback = faithfulFallbacks.find((candidate) => words(candidate).length <= maximumWords);
  if (fittingFallback) {
    return { text: fittingFallback, adjusted: true, maximumWords };
  }

  const sourceText = faithfulFallbacks[0] || requested;
  const boundedWords = words(sourceText).slice(0, maximumWords);
  if (boundedWords.length === 0) {
    throw new Error(`Voice Writer returned no usable narration for scene ${scene.id}.`);
  }
  let text = boundedWords.join(" ").replace(/[,:;-]+$/g, "").trim();
  if (!/[.!?&]$/.test(text)) text += ".";
  return { text, adjusted: true, maximumWords };
}

function normalizeVoice(value: unknown, plan: HtmlVideoPlan, durationSeconds: number): HtmlVideoVoiceComposition {
  if (!isRecord(value) || !Array.isArray(value.scenes)) {
    throw new Error("Voice Writer returned no scene narration.");
  }
  const rawById = new Map<string, string>();
  value.scenes.forEach((scene) => {
    if (isRecord(scene)) rawById.set(stringValue(scene.sceneId, 80), stringValue(scene.text, 2_000));
  });
  const adjustedSceneIds: string[] = [];
  const scenes = plan.scenePlan.map((scene) => {
    const fitted = fitHtmlVideoSceneNarration(rawById.get(scene.id) || scene.narration, scene);
    if (fitted.adjusted) adjustedSceneIds.push(scene.id);
    return { sceneId: scene.id, text: fitted.text };
  });
  const fullScript = scenes.map((scene) => scene.text).filter(Boolean).join(" ").trim();
  const wordCount = fullScript.split(/\s+/).filter(Boolean).length;
  if (!fullScript || wordCount > Math.ceil(durationSeconds * 2.5)) {
    throw new Error("Voice narration does not fit the requested duration.");
  }
  assertNarrationLanguage(
    fullScript,
    plan.videoBrief.videoSpec.language,
    [
      ...plan.videoBrief.exactPhrases,
      ...plan.scenePlan.flatMap((scene) => scene.onScreenText),
    ]
  );
  return { scenes, fullScript, ...(adjustedSceneIds.length > 0 ? { adjustedSceneIds } : {}) };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

const themeCss: Record<HtmlVideoVisualComposition["theme"], string> = {
  ocean: "--bg1:#071a33;--bg2:#0b5f73;--accent:#38bdf8;--accent2:#67e8f9;--surface:rgba(7,26,51,.76);--glow:rgba(56,189,248,.4)",
  midnight: "--bg1:#070b1d;--bg2:#252054;--accent:#a78bfa;--accent2:#f0abfc;--surface:rgba(15,18,48,.8);--glow:rgba(167,139,250,.4)",
  sunset: "--bg1:#3b1025;--bg2:#9a3412;--accent:#fb7185;--accent2:#fbbf24;--surface:rgba(59,16,37,.78);--glow:rgba(251,113,133,.4)",
  emerald: "--bg1:#052e2b;--bg2:#065f46;--accent:#34d399;--accent2:#a7f3d0;--surface:rgba(5,46,43,.8);--glow:rgba(52,211,153,.4)",
  violet: "--bg1:#241044;--bg2:#5b21b6;--accent:#c084fc;--accent2:#f5d0fe;--surface:rgba(36,16,68,.78);--glow:rgba(192,132,252,.4)",
  coral: "--bg1:#2a0f1d;--bg2:#881337;--accent:#f43f5e;--accent2:#fda4af;--surface:rgba(42,15,29,.78);--glow:rgba(244,63,94,.4)",
  gold: "--bg1:#1c1404;--bg2:#78350f;--accent:#f59e0b;--accent2:#fde68a;--surface:rgba(28,20,4,.8);--glow:rgba(245,158,11,.4)",
  arctic: "--bg1:#0a192f;--bg2:#1e293b;--accent:#38bdf8;--accent2:#e0f2fe;--surface:rgba(15,23,42,.8);--glow:rgba(56,189,248,.35)",
  neon: "--bg1:#050811;--bg2:#0f172a;--accent:#22c55e;--accent2:#06b6d4;--surface:rgba(5,8,17,.85);--glow:rgba(34,197,94,.5)",
  earth: "--bg1:#1c1308;--bg2:#451a03;--accent:#d97706;--accent2:#fed7aa;--surface:rgba(28,19,8,.82);--glow:rgba(217,119,6,.4)",
  blush: "--bg1:#261020;--bg2:#701a75;--accent:#e879f9;--accent2:#fbcfe8;--surface:rgba(38,16,32,.78);--glow:rgba(232,121,249,.4)",
  slate: "--bg1:#0f172a;--bg2:#334155;--accent:#94a3b8;--accent2:#f8fafc;--surface:rgba(15,23,42,.82);--glow:rgba(148,163,184,.35)",
};

function requestsImageBackground(sourceText: string) {
  return /\bbackground\b|(?:image|\u1ea3nh).{0,100}(?:l\u00e0m|d\u00f9ng|s\u1eed\s+d\u1ee5ng|as).{0,60}(?:n\u1ec1n|background)|(?:n\u1ec1n|background).{0,100}(?:image|\u1ea3nh)/iu.test(sourceText);
}

function chooseSequenceGridColumns(itemCount: number) {
  const target = Math.sqrt(itemCount * 1.5);
  let bestColumns = Math.max(1, Math.ceil(target));
  let bestScore = Number.POSITIVE_INFINITY;
  for (let columns = 2; columns <= Math.min(itemCount, 8); columns += 1) {
    const rows = Math.ceil(itemCount / columns);
    if (columns < rows) continue;
    const emptyCells = columns * rows - itemCount;
    const score = Math.abs(columns - target) + emptyCells * 0.12;
    if (score < bestScore) {
      bestColumns = columns;
      bestScore = score;
    }
  }
  return bestColumns;
}

function requestsOrderedBackgroundSequence(sourceText: string) {
  return /(?:highlight|spotlight|focus|sequence|in\s+order|read.{0,60}order|l\u1ea7n\s+l\u01b0\u1ee3t|theo\s+th\u1ee9\s+t\u1ef1|\u0111\u1ecdc.{0,60}th\u1ee9\s+t\u1ef1)/iu.test(sourceText);
}

function containedBackgroundFrame(
  plan: HtmlVideoPlan,
  asset?: HtmlVideoDraftReferenceSlot
) {
  const canvasAspect = plan.videoBrief.videoSpec.aspectRatio === "16:9"
    ? 16 / 9
    : plan.videoBrief.videoSpec.aspectRatio === "9:16"
      ? 9 / 16
      : 1;
  const hasDimensions = Number(asset?.width) > 0 && Number(asset?.height) > 0;
  const assetAspect = hasDimensions ? Number(asset?.width) / Number(asset?.height) : canvasAspect;
  if (assetAspect >= canvasAspect) {
    const height = (canvasAspect / assetAspect) * 100;
    return { left: 0, top: (100 - height) / 2, width: 100, height };
  }
  const width = (assetAspect / canvasAspect) * 100;
  return { left: (100 - width) / 2, top: 0, width, height: 100 };
}

function buildBackgroundFocusMap(plan: HtmlVideoPlan, enabled: boolean) {  if (!enabled) return new Map<number, {
    order: number;
    total: number;
    left: number;
    top: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  }>();
  const candidates = plan.scenePlan
    .map((scene, sceneIndex) => ({
      sceneIndex,
      hasVisibleText: scene.onScreenText.some((text) => text.trim()),
      hasSourceUnit: scene.sourceUnitIds.length > 0,
    }))
    .filter((scene) => scene.hasSourceUnit && scene.hasVisibleText);
  const result = new Map<number, {
    order: number;
    total: number;
    left: number;
    top: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  }>();
  if (candidates.length < 4) return result;
  const columns = chooseSequenceGridColumns(candidates.length);
  const rows = Math.ceil(candidates.length / columns);
  const cellWidth = 84 / columns;
  const cellHeight = 79 / rows;
  candidates.forEach((candidate, order) => {
    const column = order % columns;
    const row = Math.floor(order / columns);
    const left = 8 + column * cellWidth + cellWidth * 0.05;
    const top = 14 + row * cellHeight + cellHeight * 0.05;
    const width = cellWidth * 0.9;
    const height = cellHeight * 0.9;
    result.set(candidate.sceneIndex, {
      order: order + 1,
      total: candidates.length,
      left,
      top,
      width,
      height,
      centerX: left + width / 2,
      centerY: top + height / 2,
    });
  });
  return result;
}

export function compileHtmlVideoComposition(
  visual: HtmlVideoVisualComposition,
  plan: HtmlVideoPlan,
  assets: HtmlVideoDraftReferenceSlot[],
  sourceText = ""
) {
  const explicitBackgroundRequest = requestsImageBackground(sourceText);
  const approvedAssetList = explicitBackgroundRequest && assets.length === 1
    ? assets
    : assets.filter((asset) => asset.includeInVideo !== false);
  const backgroundAssets = approvedAssetList.filter((asset) =>
    asset.role === "background" ||
    (explicitBackgroundRequest && approvedAssetList.length === 1)
  );
  const backgroundAssetIds = new Set(backgroundAssets.map((asset) => asset.id));
  const approvedAssets = new Set(approvedAssetList
    .filter((asset) => !backgroundAssetIds.has(asset.id))
    .map((asset) => asset.id));
  const usedAssets = new Set(visual.scenes.flatMap((scene) => scene.assetIds));
  const firstUnusedAsset = [...approvedAssets].find((id) => !usedAssets.has(id));
  if (firstUnusedAsset && visual.scenes.length > 0) {
    const targetIndex = visual.scenes.findIndex((_, index) => plan.scenePlan[index]?.purpose !== "closing");
    visual.scenes[Math.max(0, targetIndex)].assetIds.push(firstUnusedAsset);
  }
  const backgroundFocusMap = buildBackgroundFocusMap(plan, explicitBackgroundRequest && requestsOrderedBackgroundSequence(sourceText));
  const hasBackgroundMedia = backgroundAssets.length > 0;
  const backgroundSlots = backgroundAssets
    .map((asset) => `<div data-media-slot="${escapeHtml(asset.id)}"></div>`)
    .join("");
  const backgroundFrame = containedBackgroundFrame(plan, backgroundAssets[0]);
  const focusCss = [...backgroundFocusMap.entries()].map(([sceneIndex, focus]) => [
    `.scene-deck.has-background-media .scene-${sceneIndex + 1} .scene-focus{display:block;left:${focus.left.toFixed(3)}%;top:${focus.top.toFixed(3)}%;width:${focus.width.toFixed(3)}%;height:${focus.height.toFixed(3)}%}`,
    `.scene-deck.has-background-media .scene-${sceneIndex + 1} .scene-background-media{transform-origin:${focus.centerX.toFixed(3)}% ${focus.centerY.toFixed(3)}%}`,
  ].join("\n")).join("\n");
  const deckClasses = [
    "scene-deck",
    hasBackgroundMedia ? "has-background-media" : "",
    backgroundFocusMap.size > 0 ? "background-sequence" : "",
  ].filter(Boolean).join(" ");
  const html = `<main class="${deckClasses}">${visual.scenes.map((scene, index) => {
    const media = scene.assetIds
      .filter((id) => approvedAssets.has(id))
      .map((id) => `<div data-media-slot="${escapeHtml(id)}"></div>`)
      .join("");
    const text = [
      scene.eyebrow ? `<p class="scene-eyebrow">${escapeHtml(scene.eyebrow)}</p>` : "",
      scene.headline ? `<h1 class="scene-headline">${escapeHtml(scene.headline)}</h1>` : "",
      scene.body ? `<p class="scene-body">${escapeHtml(scene.body)}</p>` : "",
      scene.cta ? `<p class="scene-cta">${escapeHtml(scene.cta)}</p>` : "",
    ].join("");
    const emphasisClass = `emphasis-${scene.emphasis || "standard"}`;
    const accentClass = `accent-${scene.accentStyle || "glow"}`;
    const mediaClass = media ? "has-media" : "no-media";
    const focus = backgroundFocusMap.get(index);
    const background = hasBackgroundMedia
      ? `<div class="scene-background-media">${backgroundSlots}</div>`
      : "";
    const focusOverlay = focus
      ? `<div class="scene-focus"><span class="scene-speaker" aria-hidden="true">&#128266;</span><span class="scene-counter">${focus.order} / ${focus.total}</span></div>`
      : "";
    const backgroundStage = hasBackgroundMedia
      ? `<div class="scene-background-stage">${background}${focusOverlay}</div>`
      : "";
    return `<section class="scene scene-${index + 1} layout-${scene.layout} ${emphasisClass} ${accentClass} ${mediaClass}">${backgroundStage}<div class="scene-orb scene-orb-a"></div><div class="scene-orb scene-orb-b"></div><div class="scene-frame"><div class="scene-copy">${text}</div>${media ? `<div class="scene-media">${media}</div>` : ""}</div></section>`;
  }).join("")}${hasBackgroundMedia ? '<div class="scene-progress"></div>' : ""}</main>`;
  const css = `
.scene-deck{${themeCss[visual.theme] || themeCss.ocean};position:relative;width:100%;height:100%;overflow:hidden;background:linear-gradient(145deg,var(--bg1),var(--bg2));font-family:Inter,sans-serif;color:#fff}
.scene{position:absolute;inset:0;overflow:hidden;padding:7%;background:radial-gradient(circle at 50% 30%,color-mix(in srgb,var(--accent) 28%,transparent),transparent 65%),linear-gradient(145deg,var(--bg1),var(--bg2))}
.scene-frame{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:5%;width:100%;height:100%;padding:8%;border:2px solid rgba(255,255,255,.22);border-radius:44px;background:var(--surface);backdrop-filter:blur(24px);box-shadow:0 36px 100px rgba(0,0,0,.35),inset 0 1px 1px rgba(255,255,255,.2);overflow:hidden;animation:sceneFrameGlow 4s ease-in-out infinite alternate}
.scene-copy{position:relative;z-index:3;display:flex;flex:1 1 54%;min-width:0;flex-direction:column;justify-content:center;gap:24px}
.scene-eyebrow{margin:0;align-self:flex-start;display:inline-flex;align-items:center;padding:10px 24px;border-radius:999px;background:color-mix(in srgb,var(--accent) 20%,transparent);border:1.5px solid color-mix(in srgb,var(--accent2) 45%,transparent);color:var(--accent2);font-size:28px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;box-shadow:0 4px 24px color-mix(in srgb,var(--accent) 24%,transparent);animation:sceneEyebrowEntrance .7s cubic-bezier(.16,1,.3,1) both}
.scene-headline{margin:0;max-width:100%;font-size:92px;line-height:1.06;letter-spacing:-.04em;text-wrap:balance;background:linear-gradient(135deg,#ffffff 50%,var(--accent2) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 4px 20px var(--glow,color-mix(in srgb,var(--accent) 35%,transparent)));animation:sceneHeadlineEntrance .8s cubic-bezier(.16,1,.3,1) .1s both}
.scene-body{margin:0;max-width:94%;font-size:36px;line-height:1.4;color:rgba(255,255,255,.92);animation:sceneBodyEntrance .9s cubic-bezier(.16,1,.3,1) .2s both}
.scene-cta{align-self:flex-start;margin:8px 0 0;padding:20px 36px;border-radius:999px;background:linear-gradient(135deg,var(--accent),var(--accent2));box-shadow:0 16px 45px var(--glow,color-mix(in srgb,var(--accent) 45%,transparent));color:#06111f;font-size:32px;font-weight:900;letter-spacing:.02em;animation:sceneCtaPulse 2.2s ease-in-out infinite}
.scene-media{position:relative;z-index:2;display:flex;flex:0 1 42%;width:42%;height:58%;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,.2);border-radius:36px;background:linear-gradient(145deg,rgba(255,255,255,.16),rgba(255,255,255,.05));box-shadow:inset 0 1px rgba(255,255,255,.25),0 30px 80px rgba(0,0,0,.3);overflow:hidden;animation:sceneMediaZoom .9s cubic-bezier(.16,1,.3,1) both}
.scene-media .html-video-media-slot{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;margin:0!important}
.scene.no-media .scene-frame{justify-content:center;text-align:center}
.scene.no-media .scene-copy{flex:1 1 100%;width:100%;max-width:92%;align-items:center}
.scene.no-media .scene-eyebrow,.scene.no-media .scene-cta{align-self:center}
.scene.no-media .scene-body{max-width:90%}
.scene-orb{position:absolute;border-radius:50%;filter:blur(30px);opacity:.75;pointer-events:none}
.scene-orb-a{top:-10%;right:-8%;width:42%;aspect-ratio:1;background:radial-gradient(circle,var(--accent) 0%,transparent 70%);animation:sceneOrbFloatA 7s ease-in-out infinite alternate}
.scene-orb-b{bottom:-14%;left:-10%;width:38%;aspect-ratio:1;background:radial-gradient(circle,var(--accent2) 0%,transparent 70%);animation:sceneOrbFloatB 6s ease-in-out infinite alternate}
.layout-centered .scene-frame,.layout-statement .scene-frame,.layout-cta .scene-frame{justify-content:center;text-align:center}
.layout-centered .scene-frame{flex-direction:column}
.layout-centered .scene-copy,.layout-statement .scene-copy,.layout-cta .scene-copy{align-items:center;max-width:92%}
.layout-centered .scene-copy{flex:1 1 auto}
.layout-centered .scene-eyebrow,.layout-statement .scene-eyebrow,.layout-cta .scene-eyebrow{align-self:center}
.layout-centered .scene-body,.layout-statement .scene-body,.layout-cta .scene-body{max-width:90%}
.layout-centered .scene-media{display:flex;flex:0 1 34%;width:58%;height:34%}
.layout-statement .scene-media,.layout-cta .scene-media{display:none}
.layout-cta .scene-cta{align-self:center}
.layout-split-right .scene-frame{flex-direction:row-reverse}
.emphasis-hero .scene-headline{font-size:96px;filter:drop-shadow(0 6px 28px var(--glow,rgba(255,255,255,.35)))}
.emphasis-climax .scene-frame{border-color:color-mix(in srgb,var(--accent2) 55%,transparent);box-shadow:0 36px 100px rgba(0,0,0,.4),0 0 50px var(--glow,transparent)}
.emphasis-climax .scene-cta{padding:22px 42px;font-size:34px}
.accent-border .scene-frame{border:2.5px solid color-mix(in srgb,var(--accent2) 60%,transparent)}
.accent-minimal .scene-orb{opacity:.35}
.scene-deck.has-background-media{background:#dff4ff;color:#082f49}
.scene-deck.has-background-media .scene{padding:0;background:transparent}
.scene-deck.has-background-media .scene-background-stage{position:absolute;left:${backgroundFrame.left.toFixed(4)}%;top:${backgroundFrame.top.toFixed(4)}%;width:${backgroundFrame.width.toFixed(4)}%;height:${backgroundFrame.height.toFixed(4)}%;z-index:1;overflow:visible}
.scene-deck.has-background-media .scene-background-media{position:absolute;inset:0;z-index:0;overflow:hidden;transform:scale(1)}
.scene-deck.has-background-media .scene-background-media .html-video-media-slot{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;margin:0!important}
.scene-deck.has-background-media .scene-background-media img{width:100%!important;height:100%!important;object-fit:contain!important;object-position:center!important;animation:none!important;filter:none!important}
.scene-deck.has-background-media .scene-frame{z-index:3;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;backdrop-filter:none;overflow:visible;animation:none}
.scene-deck.has-background-media .scene-orb{display:none}
.scene-deck.has-background-media .scene-copy{position:absolute;top:2.5%;left:50%;z-index:5;display:flex;flex:none;width:auto;min-width:260px;max-width:72%;padding:12px 30px;align-items:center;gap:8px;text-align:center;transform:translateX(-50%);border:2px solid rgba(255,255,255,.82);border-radius:999px;background:rgba(3,105,161,.88);box-shadow:0 14px 40px rgba(2,32,71,.24)}
.scene-deck.has-background-media .scene-copy:empty{display:none}
.scene-deck.has-background-media .scene-eyebrow,.scene-deck.has-background-media .scene-body,.scene-deck.has-background-media .scene-cta{align-self:center;margin:0;padding:0;border:0;background:none;box-shadow:none;color:#e0f2fe;font-size:24px;line-height:1.15}
.scene-deck.has-background-media .scene-headline{margin:0;font-size:52px;line-height:1;letter-spacing:.02em;text-transform:uppercase;background:none;-webkit-background-clip:initial;-webkit-text-fill-color:#fff;filter:none}
.scene-deck.has-background-media .scene-focus{position:absolute;z-index:2;display:none;border:6px solid #0ea5e9;border-radius:28px;box-shadow:0 0 0 2200px rgba(7,34,53,.2),0 0 34px rgba(14,165,233,.9);pointer-events:none}
.scene-deck.has-background-media .scene-speaker{position:absolute;top:-30px;left:-24px;display:flex;width:54px;height:54px;align-items:center;justify-content:center;border:3px solid #fff;border-radius:50%;background:#0284c7;box-shadow:0 8px 22px rgba(2,132,199,.35);font-size:28px}
.scene-deck.has-background-media .scene-counter{position:absolute;top:-30px;right:-24px;padding:8px 14px;border:3px solid #fff;border-radius:999px;background:#0284c7;color:#fff;font-size:24px;font-weight:900;line-height:1}
.scene-deck.has-background-media .scene-progress{position:absolute;left:0;bottom:0;z-index:10;width:0;height:10px;border-radius:0 999px 999px 0;background:linear-gradient(90deg,#0284c7,#38bdf8,#fbbf24);box-shadow:0 -2px 12px rgba(14,165,233,.45);animation:sceneProgressFill ${plan.videoBrief.videoSpec.durationSeconds}s linear both}
${focusCss}
@keyframes sceneEyebrowEntrance{0%{opacity:0;transform:translateX(-24px) scale(.92)}100%{opacity:1;transform:translateX(0) scale(1)}}
@keyframes sceneHeadlineEntrance{0%{opacity:0;transform:translateX(-36px) scale(.94);filter:blur(8px)}100%{opacity:1;transform:translateX(0) scale(1);filter:blur(0)}}
@keyframes sceneBodyEntrance{0%{opacity:0;transform:translateX(-24px)}100%{opacity:1;transform:translateX(0)}}
@keyframes sceneMediaZoom{0%{opacity:0;transform:scale(.88)}100%{opacity:1;transform:scale(1)}}
@keyframes sceneCtaPulse{0%,100%{transform:scale(1);box-shadow:0 16px 45px var(--glow,color-mix(in srgb,var(--accent) 45%,transparent))}50%{transform:scale(1.07);box-shadow:0 24px 65px var(--glow,color-mix(in srgb,var(--accent) 75%,transparent))}}
@keyframes sceneOrbFloatA{0%,100%{transform:translate(0,0) scale(1);opacity:.65}50%{transform:translate(45px,-35px) scale(1.3);opacity:.9}}
@keyframes sceneOrbFloatB{0%,100%{transform:translate(0,0) scale(1);opacity:.6}50%{transform:translate(-40px,35px) scale(1.25);opacity:.85}}
@keyframes sceneFrameGlow{0%,100%{scale:1;box-shadow:0 36px 100px rgba(0,0,0,.35),0 0 40px var(--glow,color-mix(in srgb,var(--accent) 20%,transparent))}50%{scale:1.008;box-shadow:0 40px 120px rgba(0,0,0,.45),0 0 70px var(--glow,color-mix(in srgb,var(--accent) 45%,transparent))}}
@keyframes sceneProgressFill{0%{width:0}100%{width:100%}}
`.trim();
  return { html, css };
}

async function structuredCall(
  chat: PipelineChat,
  system: string,
  user: string,
  responseSchema: object,
  temperature: number
) {
  try {
    return await chat({
      model: modelName(),
      temperature,
      jsonMode: true,
      responseSchema,
      maxRetries: maxRetries(),
      maxTokens: 8_192,
      reasoning: { maxTokens: 1_024, exclude: true },
      timeoutMs: timeoutMs(),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
  } catch (error) {
    throw new HtmlVideoPipelineProviderError(error);
  }
}

function isLegacyDraftValue(value: unknown) {
  if (!isRecord(value)) return false;
  return [value, value.data, value.result, value.composition].some(
    (candidate) =>
      isRecord(candidate) &&
      typeof candidate.html === "string" &&
      typeof candidate.css === "string"
  );
}

export async function runHtmlVideoStructuredPipeline(input: {
  chat: PipelineChat;
  draftInput: HtmlVideoDraftInput;
  generationPrompt: string;
  referenceAssets: HtmlVideoDraftReferenceSlot[];
  checkpoint?: HtmlVideoPipelineCheckpoint;
  onStage?: (stage: HtmlVideoPipelineStage) => void | Promise<void>;
  onCheckpoint?: <K extends HtmlVideoPipelineCheckpointKey>(
    key: K,
    value: NonNullable<HtmlVideoPipelineCheckpoint[K]>
  ) => void | Promise<void>;
}): Promise<HtmlVideoStructuredPipelineResult> {
  const checkpoint = { ...(input.checkpoint || {}) };
  const editSource = input.draftInput.editSource;
  const existingPipeline = editSource?.pipeline;
  const revisionIntent = classifyHtmlVideoRevisionIntent(input.draftInput.prompt, existingPipeline);
  if (editSource && !existingPipeline && !revisionIntent.fullRedesign) {
    throw new Error("Existing video is missing its structured pipeline and cannot be revised safely in place.");
  }
  await input.onStage?.("grounding");
  const grounding = checkpoint.grounding || buildHtmlVideoGrounding(input.draftInput);
  if (!checkpoint.grounding) {
    checkpoint.grounding = grounding;
    await input.onCheckpoint?.("grounding", grounding);
  }
  const allowedAssetIds = new Set(input.referenceAssets
    .filter((asset) => asset.includeInVideo !== false)
    .map((asset) => asset.id));
  const canReuseExistingPlan = Boolean(
    editSource
    && existingPipeline
    && !revisionIntent.content
    && !revisionIntent.timing
    && !revisionIntent.spec
    && !revisionIntent.fullRedesign
  );
  let plan = checkpoint.plan;
  if (!plan && canReuseExistingPlan && existingPipeline) {
    plan = planFromExistingPipeline(existingPipeline, input.draftInput);
    checkpoint.plan = plan;
    await input.onCheckpoint?.("plan", plan);
  }
  if (!plan) {
    await input.onStage?.("planning");
    const plannerResponse = await structuredCall(
      input.chat,
      plannerSystemPrompt(input.draftInput),
      plannerPrompt(input.generationPrompt, grounding.contentUnits, input.referenceAssets),
      {
        contentUnits: [{
          id: "string", sourceText: "string", normalizedText: "string",
          required: "boolean", requiredVerbatim: "boolean",
        }],
        videoBrief: {
          objective: "string", tone: "string", visualStyle: "string", voiceRequired: "boolean",
          language: "string", audience: "string", cta: "string", exactPhrases: ["string"],
        },
        scenePlan: [{
          id: "string", purpose: "opening|content|closing", sourceUnitIds: ["unit-id"],
          onScreenText: ["string"], narration: "string", startSeconds: "number",
          endSeconds: "number", transition: "crossfade|slide-left|slide-right", assetIds: ["asset-id"],
        }],
      },
      0.2
    );
    const plannerValue = parseJson(plannerResponse.text);
    if (isLegacyDraftValue(plannerValue)) {
      return { kind: "legacy", responseText: plannerResponse.text };
    }
    const plannedContentUnits = input.draftInput.editSource
      ? normalizeEditedContentUnits(
          isRecord(plannerValue) ? plannerValue.contentUnits : undefined,
          grounding.contentUnits
        )
      : grounding.contentUnits;
    plan = normalizePlan(plannerValue, input.draftInput, plannedContentUnits, allowedAssetIds);
    checkpoint.plan = plan;
    await input.onCheckpoint?.("plan", plan);
  }
  const planJson = JSON.stringify(plan);
  await input.onStage?.("composing");
  const voiceOnlyRevision = isVoiceOnlyRevision(revisionIntent);
  const compositionPromise = editSource
    ? voiceOnlyRevision
      ? Promise.resolve({ html: editSource.html, css: editSource.css })
      : checkpoint.revision
        ? Promise.resolve(checkpoint.revision)
        : structuredCall(
            input.chat,
            revisionSystemPrompt(input.draftInput),
            revisionPrompt(input.draftInput, plan),
            {
              baseSnapshotHash: editSource.snapshotHash || "",
              htmlChanges: [{ find: "exact existing HTML", replace: "replacement HTML", expectedOccurrences: 1 }],
              cssAppend: "scoped CSS overrides and keyframes",
            },
            0.15
          ).then(async (response) => {
            const value = normalizeRevisionPatch(parseJson(response.text), editSource);
            await input.onCheckpoint?.("revision", value);
            return value;
          })
    : checkpoint.visual
      ? Promise.resolve(checkpoint.visual)
      : structuredCall(
          input.chat,
          visualSystemPrompt(),
          planJson,
          {
            theme: "ocean|midnight|sunset|emerald|violet|coral|gold|arctic|neon|earth|blush|slate",
            scenes: [{
              sceneId: "string", layout: "centered|split-left|split-right|statement|cta",
              emphasis: "hero|standard|climax", accentStyle: "glow|border|gradient-shift|minimal",
              eyebrow: "string", headline: "string", body: "string", cta: "string", assetIds: ["asset-id"],
            }],
          },
          0.3
        ).then(async (response) => {
          const value = normalizeVisual(parseJson(response.text), plan);
          await input.onCheckpoint?.("visual", value);
          return value;
        });
  const preserveExistingVoice = !revisionIntent.voice
    && !revisionIntent.content
    && !revisionIntent.timing
    && !revisionIntent.spec
    && !revisionIntent.fullRedesign;
  const preservedVoice: HtmlVideoVoiceComposition | null = editSource
    && existingPipeline
    && preserveExistingVoice
    && editSource.voiceScript
    ? {
        scenes: plan.scenePlan.map((scene, index) => ({
          sceneId: scene.id,
          text: existingPipeline.scenePlan[index]?.narration || scene.narration,
        })),
        fullScript: editSource.voiceScript,
      }
    : null;
  const voiceInput = editSource
    ? JSON.stringify({
        approvedPlan: plan,
        currentEditRequest: input.draftInput.prompt,
        existingVoiceScript: editSource.voiceScript || "",
      })
    : planJson;
  const [compositionOrVisual, voice] = await Promise.all([
    compositionPromise,
    preservedVoice
      ? Promise.resolve(preservedVoice)
      : checkpoint.voice
        ? Promise.resolve(checkpoint.voice)
        : structuredCall(
          input.chat,
          voiceSystemPrompt(input.draftInput, plan),
          voiceInput,
          { scenes: [{ sceneId: "string", text: "string" }], fullScript: "string" },
          0.25
        ).then(async (response) => {
          const value = normalizeVoice(parseJson(response.text), plan, input.draftInput.durationSeconds);
          await input.onCheckpoint?.("voice", value);
          return value;
        }),
  ]);
  await input.onStage?.("validation");
  const composition = input.draftInput.editSource
    ? compositionOrVisual as { html: string; css: string }
    : compileHtmlVideoComposition(
        compositionOrVisual as HtmlVideoVisualComposition,
        plan,
        input.referenceAssets,
        grounding.sourceText
      );
  const alignedScenePlan = plan.scenePlan.map((scene, index) => ({
    ...scene,
    narration: voice.scenes[index]?.text || scene.narration,
  }));
  return {
    kind: "structured",
    ...composition,
    voiceScript: voice.fullScript,
    pipeline: {
      version: HTML_VIDEO_PIPELINE_VERSION,
      sourceText: grounding.sourceText,
      sourceContextRefs: grounding.sourceContextRefs,
      videoBrief: plan.videoBrief,
      contentUnits: plan.contentUnits,
      scenePlan: alignedScenePlan,
      findings: [{
        stage: "validation",
        code: "PROMPT_COVERAGE_VERIFIED",
        severity: "info",
        message: "All required content units are mapped exactly once to a contiguous scene timeline.",
      }, ...(voice.adjustedSceneIds || []).map((sceneId) => ({
        stage: "voice" as const,
        code: "VOICE_NARRATION_FITTED_TO_SCENE",
        severity: "warning" as const,
        message: "Narration was shortened using approved scene text to fit the scene duration.",
        sceneId,
      }))],
    },
  };
}
