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
import { filterRepeatedReferenceGridItems } from "./html-video-reference-grid.service";
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

export type HtmlVideoPipelineModelStage =
  | "planner"
  | "visual"
  | "voice"
  | "revision";

const stageModelEnvironmentNames: Record<HtmlVideoPipelineModelStage, string> = {
  planner: "HTML_VIDEO_PLANNER_MODEL",
  visual: "HTML_VIDEO_VISUAL_MODEL",
  voice: "HTML_VIDEO_VOICE_MODEL",
  revision: "HTML_VIDEO_REVISION_MODEL",
};

const stageFallbackModelEnvironmentNames: Record<HtmlVideoPipelineModelStage, string> = {
  planner: "HTML_VIDEO_PLANNER_FALLBACK_MODEL",
  visual: "HTML_VIDEO_VISUAL_FALLBACK_MODEL",
  voice: "HTML_VIDEO_VOICE_FALLBACK_MODEL",
  revision: "HTML_VIDEO_REVISION_FALLBACK_MODEL",
};

export function resolveHtmlVideoPipelineModels(
  stage: HtmlVideoPipelineModelStage,
  environment: Record<string, string | undefined> = process.env
) {
  return [
    environment[stageModelEnvironmentNames[stage]],
    environment[stageFallbackModelEnvironmentNames[stage]],
    environment.HTML_VIDEO_FALLBACK_MODEL,
    environment.HTML_VIDEO_MODEL,
    environment.GEMINI_MODEL,
    "google/gemini-2.5-flash",
  ].map((model) => String(model || "").trim()).filter(
    (model, index, models) => Boolean(model) && models.indexOf(model) === index
  );
}

export function resolveHtmlVideoPipelineModel(
  stage: HtmlVideoPipelineModelStage,
  environment: Record<string, string | undefined> = process.env
) {
  return resolveHtmlVideoPipelineModels(stage, environment)[0];
}

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
  input: Pick<HtmlVideoDraftInput, "prompt" | "primaryPromptContext" | "promptProvenance">
) {
  const languageLock = String(
    input.promptProvenance?.inferredAssumptions?.languageLock ||
    input.promptProvenance?.inferredAssumptions?.narrationLanguage ||
    ""
  ).trim();
  if (languageLock && !/^same as\b/i.test(languageLock)) return languageLock;
  const source = String(
    input.promptProvenance?.rawUserPrompt ||
    input.primaryPromptContext ||
    input.prompt ||
    ""
  );
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
  const authoritativePrompt = input.promptProvenance?.rawUserPrompt?.trim() || input.prompt.trim();
  const sourceCorpus = [
    authoritativePrompt,
    input.primaryPromptContext || "",
    input.referenceContext || "",
  ].join("\n").replace(/\s+/g, " ").toLocaleLowerCase();
  const supportedExactPhrases = stringArray(record.exactPhrases, 20).filter((phrase) =>
    sourceCorpus.includes(phrase.replace(/\s+/g, " ").toLocaleLowerCase())
  );
  const proposedCta = stringValue(record.cta, 500);
  return {
    objective: stringValue(record.objective) || authoritativePrompt,
    tone: stringValue(record.tone, 200) || "clear and engaging",
    visualStyle: stringValue(record.visualStyle, 300) || "premium social video",
    voiceRequired: record.voiceRequired !== false,
    exactPhrases: supportedExactPhrases,
    videoSpec: {
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      durationSeconds: input.durationSeconds,
      language: requestedLanguage || stringValue(record.language, 80) || "same as the user request",
      audience: stringValue(record.audience, 300) || "the intended audience in the request",
      platform: inferPlatform(authoritativePrompt, input.aspectRatio),
      cta: proposedCta && sourceCorpus.includes(proposedCta.replace(/\s+/g, " ").toLocaleLowerCase())
        ? proposedCta
        : "",
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
  durationSeconds: number,
  language = ""
) {
  const wordsPerSecond = (isEnglishNarrationLanguage(language) ? 150 : 140) / 60;
  const weights = scenes.map((scene) => {
    const narrationWords = scene.narration.split(/\s+/).filter(Boolean).length;
    const speechSeconds = narrationWords / wordsPerSecond;
    return Math.max(1.6, speechSeconds / 0.88 + 0.35);
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
  const adjusted = fittedScenes.some((scene, index) => (
    Math.abs(scene.startSeconds - scenes[index].startSeconds) > 0.001 ||
    Math.abs(scene.endSeconds - scenes[index].endSeconds) > 0.001
  ));
  return { scenes: adjusted ? fittedScenes : scenes, adjusted };
}

export function normalizePlan(
  value: unknown,
  input: HtmlVideoDraftInput,
  contentUnits: HtmlVideoContentUnit[],
  allowedAssetIds: Set<string>
): HtmlVideoPlan {
  if (!isRecord(value) || !Array.isArray(value.scenePlan)) {
    throw new Error("Planner did not return a scenePlan.");
  }
  const videoBrief = normalizeBrief(value.videoBrief, input);
  const plannerScenes = value.scenePlan.slice(0, 24);
  if (plannerScenes.length === 0) throw new Error("Planner returned no scenes.");
  const orderedImageSequence = contentUnits.length >= 3 && contentUnits.every(
    (unit) => unit.sourceKind === "image_ocr"
  );
  const authoritativeRequest = String(
    input.promptProvenance?.rawUserPrompt || input.primaryPromptContext || input.prompt
  );
  const referencedPlannerUnitIds = plannerScenes.flatMap((candidate) => (
    isRecord(candidate) ? stringArray(candidate.sourceUnitIds, contentUnits.length) : []
  )).filter((id) => contentUnits.some((unit) => unit.id === id));
  const uniquePlannerUnitIds = new Set(referencedPlannerUnitIds);
  const repairDegenerateMultiUnitSequence = contentUnits.length >= 3
    && plannerScenes.length >= contentUnits.length
    && uniquePlannerUnitIds.size < Math.ceil(contentUnits.length * 0.5);
  const deterministicMultiUnitSequence = orderedImageSequence || (
    contentUnits.length >= 3 && (
      requestsExplicitOrderedUnitSequence(authoritativeRequest) ||
      requestsOrderedBackgroundSequence(authoritativeRequest)
    )
  ) || repairDegenerateMultiUnitSequence;
  const singleSourceUnit = contentUnits.length === 1;
  const oneUnitPerScene = contentUnits.length > 1 && contentUnits.length === plannerScenes.length;
  const rawScenes = deterministicMultiUnitSequence
    ? contentUnits.map((_, index) => plannerScenes[index] || {})
    : plannerScenes;
  const validUnitIds = new Set(contentUnits.map((unit) => unit.id));
  const parsedScenePlan = rawScenes.map((candidate, index): HtmlVideoScenePlanItem => {
    if (!isRecord(candidate)) throw new Error("Planner returned an invalid scene.");
    const sequenceUnit = deterministicMultiUnitSequence ? contentUnits[index] : undefined;
    const sourceUnitIds = sequenceUnit
      ? [sequenceUnit.id]
      : singleSourceUnit
        ? [contentUnits[0].id]
        : oneUnitPerScene
          ? [contentUnits[index].id]
          : stringArray(candidate.sourceUnitIds, contentUnits.length)
          .filter((id) => validUnitIds.has(id));
    const fallbackStart = (input.durationSeconds * index) / rawScenes.length;
    const fallbackEnd = (input.durationSeconds * (index + 1)) / rawScenes.length;
    const startSeconds = deterministicMultiUnitSequence ? fallbackStart : Number(candidate.startSeconds);
    const endSeconds = deterministicMultiUnitSequence ? fallbackEnd : Number(candidate.endSeconds);
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
      throw new Error("Planner returned invalid scene timing.");
    }
    return {
      id: deterministicMultiUnitSequence
        ? `scene-${index + 1}`
        : stringValue(candidate.id, 80) || `scene-${index + 1}`,
      order: index,
      purpose: deterministicMultiUnitSequence
        ? "content"
        : normalizePurpose(candidate.purpose, index, rawScenes.length),
      sourceUnitIds,
      onScreenText: orderedImageSequence
        ? [sequenceUnit!.normalizedText]
        : stringArray(candidate.onScreenText, 5).length > 0
          ? stringArray(candidate.onScreenText, 5)
          : [sequenceUnit?.normalizedText || ""].filter(Boolean),
      narration: orderedImageSequence
        ? sequenceUnit!.normalizedText
        : stringValue(candidate.narration, 2_000) || sequenceUnit?.normalizedText || "",
      startSeconds,
      endSeconds,
      transition: normalizeTransition(candidate.transition),
      assetIds: stringArray(candidate.assetIds, 6).filter((id) => allowedAssetIds.has(id)),
    };
  });
  const { scenes: scenePlan } = fitHtmlVideoSceneTimeline(
    parsedScenePlan,
    input.durationSeconds,
    videoBrief.videoSpec.language
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
    const usageCount = unitUseCount.get(unit.id) || 0;
    if (usageCount < 1) {
      throw new Error(`Required content unit ${unit.id} must appear at least once.`);
    }
  }

  return {
    videoBrief,
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
    currentEditRequest: input.promptProvenance?.rawUserPrompt || input.prompt,
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
    "You are the Visual Director. Choose a distinct but coherent composition, hierarchy, background treatment, surface treatment, and motion language for every approved scene.",
    "Do not generate HTML, CSS, scripts, URLs, timing, new scenes, or new factual copy.",
    "Use only text already present in each scene onScreenText and only approved asset IDs assigned to that scene.",
    "Make each scene visually complete and readable on a phone.",
    "Select the most fitting theme for the subject from: ocean (tech/SaaS), midnight (luxury), sunset (energy/passion), emerald (health/nature), violet (creative/arts), coral (fashion/beauty), gold (finance/real-estate), arctic (medical/science), neon (gaming/entertainment), earth (food/organic), blush (parenting/lifestyle), slate (corporate/B2B).",
    "For each scene, choose: layout (centered|split-left|split-right|statement|cta), emphasis (hero for opening/hook, standard for content, climax for CTA/offer), and accentStyle (glow|border|gradient-shift|minimal).",
    "Also choose compositionStyle (editorial|kinetic|spotlight|showcase|minimal), surfaceStyle (glass|solid|outline|none), backgroundStyle (mesh|grid|rays|spotlight|gradient), motionPreset (soft-reveal|kinetic-slide|scale-pop|spotlight-sweep), and visualMotif (rings|bars|device|checklist|spark|none).",
    "When a scene has no approved image asset, choose a meaningful visualMotif so the composition is not only animated text. Use none only for a deliberate typographic statement.",
    "Do not use glass surfaces for every scene. Kinetic scenes should favor none/outline, editorial scenes solid/outline, showcase scenes solid/glass, and minimal scenes none.",
    "Vary adjacent content scenes when the subject supports it, while keeping one theme and a coherent art direction across the video.",
  ].join("\n");
}

const NARRATION_WORDS_PER_SECOND = 2.1;

function voiceSystemPrompt(input: HtmlVideoDraftInput, plan: HtmlVideoPlan) {
  const sceneBudgets = plan.scenePlan.map((scene) => ({
    sceneId: scene.id,
    maximumWords: Math.max(1, Math.floor((scene.endSeconds - scene.startSeconds) * NARRATION_WORDS_PER_SECOND)),
  }));
  return [
    "You are the Voice Writer for one continuous social-video narrator.",
    ...(input.editSource ? [
      "This is a revision. If the current edit does not explicitly request changes to narration, preserve the existing narration wording and language as closely as the approved scene plan allows.",
      "If narration is explicitly changed, alter only the requested portions and keep all other scene segments stable.",
    ] : []),
    "REQUIRED NARRATION LANGUAGE: " + plan.videoBrief.videoSpec.language + ". Write all narration exclusively in this language. Do not code-switch or translate. A foreign word may appear only when it is explicitly present in the approved scene text or exact phrases.",
    "Use only facts and phrases in the approved scene plan. Do not add labels, timestamps, directions, sound effects, URLs, prices, or claims.",
    `Keep the complete narration under ${Math.ceil(input.durationSeconds * NARRATION_WORDS_PER_SECOND)} words and in scene order.`,
    "Return one non-empty narration segment for every scene and one fullScript containing those segments in the same order.",
    "Each scene segment must fit its own startSeconds..endSeconds interval at no more than 2.1 spoken words per second. End each segment as a complete sentence so the narrator can pause naturally at scene boundaries.",
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
  const compositionStyles = new Set(["editorial", "kinetic", "spotlight", "showcase", "minimal"]);
  const surfaceStyles = new Set(["glass", "solid", "outline", "none"]);
  const backgroundStyles = new Set(["mesh", "grid", "rays", "spotlight", "gradient"]);
  const motionPresets = new Set(["soft-reveal", "kinetic-slide", "scale-pop", "spotlight-sweep"]);
  const visualMotifs = new Set(["rings", "bars", "device", "checklist", "spark", "none"]);
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
    const defaultComposition = scene.purpose === "opening"
      ? "kinetic"
      : scene.purpose === "closing"
        ? "editorial"
        : scene.assetIds.length > 0
          ? "showcase"
          : index % 2 === 0 ? "spotlight" : "editorial";
    const rawComposition = String(raw.compositionStyle || "").toLowerCase().trim();
    const compositionStyle = compositionStyles.has(rawComposition) ? rawComposition : defaultComposition;
    const rawSurface = String(raw.surfaceStyle || "").toLowerCase().trim();
    const rawBackground = String(raw.backgroundStyle || "").toLowerCase().trim();
    const rawMotion = String(raw.motionPreset || "").toLowerCase().trim();
    const rawMotif = String(raw.visualMotif || "").toLowerCase().trim();
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
      compositionStyle: compositionStyle as HtmlVideoVisualScene["compositionStyle"],
      surfaceStyle: (surfaceStyles.has(rawSurface)
        ? rawSurface
        : compositionStyle === "kinetic" || compositionStyle === "minimal" ? "none" : "solid"
      ) as HtmlVideoVisualScene["surfaceStyle"],
      backgroundStyle: (backgroundStyles.has(rawBackground)
        ? rawBackground
        : compositionStyle === "kinetic" ? "rays" : compositionStyle === "editorial" ? "grid" : "mesh"
      ) as HtmlVideoVisualScene["backgroundStyle"],
      motionPreset: (motionPresets.has(rawMotion)
        ? rawMotion
        : compositionStyle === "kinetic"
          ? "kinetic-slide"
          : compositionStyle === "spotlight"
            ? "spotlight-sweep"
            : compositionStyle === "showcase" ? "scale-pop" : "soft-reveal"
      ) as HtmlVideoVisualScene["motionPreset"],
      visualMotif: (visualMotifs.has(rawMotif)
        ? rawMotif
        : scene.assetIds.length > 0
          ? "none"
          : (["rings", "bars", "device", "checklist", "spark"] as const)[index % 5]
      ) as HtmlVideoVisualScene["visualMotif"],
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

function usesDeterministicOrderedBoardTemplate(
  plan: HtmlVideoPlan,
  sourceText: string,
  assets: HtmlVideoDraftReferenceSlot[]
) {
  const regionCount = plan.contentUnits.filter((unit) => Boolean(unit.region)).length;
  return assets.some((asset) => asset.kind === "image")
    && requestsImageBackground(sourceText)
    && requestsOrderedBackgroundSequence(sourceText)
    && plan.contentUnits.length >= 4
    && plan.contentUnits.every((unit) => unit.sourceKind === "image_ocr")
    && regionCount >= Math.ceil(plan.contentUnits.length * 0.8)
    && plan.scenePlan.length === plan.contentUnits.length
    && plan.scenePlan.every((scene) => scene.purpose === "content" && scene.sourceUnitIds.length === 1);
}

function buildDeterministicOrderedBoardVisual(plan: HtmlVideoPlan): HtmlVideoVisualComposition {
  const unitsById = new Map(plan.contentUnits.map((unit) => [unit.id, unit]));
  return {
    theme: "arctic",
    scenes: plan.scenePlan.map((scene): HtmlVideoVisualScene => {
      const unit = unitsById.get(scene.sourceUnitIds[0]);
      const headline = unit?.normalizedText || scene.onScreenText[0] || "";
      return {
        sceneId: scene.id,
        layout: "statement",
        emphasis: "standard",
        accentStyle: "border",
        compositionStyle: "minimal",
        surfaceStyle: "none",
        backgroundStyle: "gradient",
        motionPreset: "spotlight-sweep",
        visualMotif: "none",
        eyebrow: "",
        headline,
        body: "",
        cta: "",
        assetIds: [],
      };
    }),
  };
}
export function fitHtmlVideoSceneNarration(
  requestedText: string,
  scene: HtmlVideoScenePlanItem
) {
  const maximumWords = Math.max(1, Math.floor((scene.endSeconds - scene.startSeconds) * NARRATION_WORDS_PER_SECOND));
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
  if (!fullScript || wordCount > Math.ceil(durationSeconds * NARRATION_WORDS_PER_SECOND)) {
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

function requestsOrderedBackgroundSequence(sourceText: string) {
  return /(?:highlight|spotlight|focus|sequence|in\s+order|read.{0,60}order|l\u1ea7n\s+l\u01b0\u1ee3t|theo\s+th\u1ee9\s+t\u1ef1|\u0111\u1ecdc.{0,60}th\u1ee9\s+t\u1ef1)/iu.test(sourceText);
}

function requestsExplicitOrderedUnitSequence(sourceText: string) {
  const orderedLines = sourceText.split(/\r?\n/).filter((line) => /^\s*\d{1,3}[.)]\s+\S/.test(line));
  return orderedLines.length >= 3;
}

function visualMotifMarkup(motif: HtmlVideoVisualScene["visualMotif"]) {
  if (!motif || motif === "none") return "";
  return `<div class="scene-motif motif-${motif}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>`;
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

type HtmlVideoBackgroundFocus = {
  order: number;
  total: number;
  unitId: string;
  assetId?: string;
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

function buildBackgroundFocusMap(plan: HtmlVideoPlan, enabled: boolean) {
  const result = new Map<number, HtmlVideoBackgroundFocus>();
  if (!enabled) return result;

  const candidates = plan.scenePlan.flatMap((scene, sceneIndex) => {
    if (scene.purpose !== "content" || !scene.onScreenText.some((text) => text.trim())) return [];
    const unit = scene.sourceUnitIds
      .map((unitId) => plan.contentUnits.find((candidate) => candidate.id === unitId))
      .find((candidate) => candidate?.region);
    return unit?.region
      ? [{ sceneIndex, unitId: unit.id, region: unit.region, assetId: unit.assetId }]
      : [];
  });
  const validatedCandidates = filterRepeatedReferenceGridItems(
    candidates,
    (candidate) => candidate.region
  );
  if (validatedCandidates.length < 4) return result;

  validatedCandidates.forEach((candidate, order) => {
    const { region } = candidate;
    const paddingX = Math.min(0.018, region.width * 0.12);
    const paddingY = Math.min(0.018, region.height * 0.12);
    const left = Math.max(0, (region.x - paddingX) * 100);
    const top = Math.max(0, (region.y - paddingY) * 100);
    const width = Math.min(100 - left, (region.width + paddingX * 2) * 100);
    const height = Math.min(100 - top, (region.height + paddingY * 2) * 100);
    result.set(candidate.sceneIndex, {
      order: order + 1,
      total: validatedCandidates.length,
      unitId: candidate.unitId,
      ...(candidate.assetId ? { assetId: candidate.assetId } : {}),
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
  const containedFrame = containedBackgroundFrame(plan, backgroundAssets[0]);
  const backgroundFrame = backgroundFocusMap.size > 0 && containedFrame.height < 72
    ? {
        left: 4,
        width: 92,
        height: containedFrame.height * 0.92,
        top: 95 - containedFrame.height * 0.92,
      }
    : containedFrame;
  const focusCardHeight = Math.max(22, Math.min(42, backgroundFrame.top - 18));
  const sequenceCopyTop = Math.max(48, Math.min(54, backgroundFrame.top - 7));
  const focusCss = [...backgroundFocusMap.entries()].map(([sceneIndex, focus]) => [
    `.scene-deck.has-background-media .scene-${sceneIndex + 1} .scene-focus{display:block;left:${focus.left.toFixed(3)}%;top:${focus.top.toFixed(3)}%;width:${focus.width.toFixed(3)}%;height:${focus.height.toFixed(3)}%}`,
    `.scene-deck.has-background-media .scene-${sceneIndex + 1} .scene-background-media{transform-origin:${focus.centerX.toFixed(3)}% ${focus.centerY.toFixed(3)}%}`,
    `.scene-deck.has-background-media .scene-${sceneIndex + 1} .scene-focus-card{display:block}`,
    `.scene-deck.has-background-media .scene-${sceneIndex + 1} .scene-focus-card .html-video-media-slot{position:absolute!important;left:${(-focus.left / focus.width * 100).toFixed(3)}%!important;top:${(-focus.top / focus.height * 100).toFixed(3)}%!important;width:${(10000 / focus.width).toFixed(3)}%!important;height:${(10000 / focus.height).toFixed(3)}%!important;max-width:none!important;max-height:none!important;margin:0!important}`,
  ].join("\n")).join("\n");
  const deckClasses = [
    "scene-deck",
    hasBackgroundMedia ? "has-background-media" : "",
    backgroundFocusMap.size > 0 ? "background-sequence" : "",
  ].filter(Boolean).join(" ");
  const html = `<main class="${deckClasses}">${visual.scenes.map((scene, index) => {
    const plannedScene = plan.scenePlan[index];
    const primaryUnitId = plannedScene?.sourceUnitIds[0] || "";
    const allUnitIds = plannedScene?.sourceUnitIds.join(" ") || "";
    const media = scene.assetIds
      .filter((id) => approvedAssets.has(id))
      .map((id) => `<div data-media-slot="${escapeHtml(id)}"></div>`)
      .join("");
    const motif = media ? "" : visualMotifMarkup(scene.visualMotif);
    const text = [
      scene.eyebrow ? `<p class="scene-eyebrow">${escapeHtml(scene.eyebrow)}</p>` : "",
      scene.headline ? `<h1 class="scene-headline">${escapeHtml(scene.headline)}</h1>` : "",
      scene.body ? `<p class="scene-body">${escapeHtml(scene.body)}</p>` : "",
      scene.cta ? `<p class="scene-cta">${escapeHtml(scene.cta)}</p>` : "",
    ].join("");
    const emphasisClass = `emphasis-${scene.emphasis || "standard"}`;
    const accentClass = `accent-${scene.accentStyle || "glow"}`;
    const compositionClass = `composition-${scene.compositionStyle || "editorial"}`;
    const surfaceClass = `surface-${scene.surfaceStyle || "solid"}`;
    const backgroundClass = `background-${scene.backgroundStyle || "mesh"}`;
    const motionClass = `motion-${scene.motionPreset || "soft-reveal"}`;
    const mediaClass = media ? "has-media" : motif ? "has-motif" : "no-media";
    const focus = backgroundFocusMap.get(index);
    const background = hasBackgroundMedia
      ? `<div class="scene-background-media">${backgroundSlots}</div>`
      : "";
    const focusOverlay = focus
      ? `<div class="scene-focus" data-unit-id="${escapeHtml(focus.unitId)}"><span class="scene-speaker" aria-hidden="true">&#128266;</span><span class="scene-counter">${focus.order} / ${focus.total}</span></div>`
      : "";
    const focusAsset = focus
      ? backgroundAssets.find((asset) => asset.id === focus.assetId) || backgroundAssets[0]
      : undefined;
    const focusCard = focusAsset
      ? `<div class="scene-focus-card" data-unit-id="${escapeHtml(focus!.unitId)}"><div data-media-slot="${escapeHtml(focusAsset.id)}"></div><span class="scene-focus-card-counter">${focus!.order} / ${focus!.total}</span></div>`
      : "";
    const backgroundStage = hasBackgroundMedia
      ? `<div class="scene-background-blur">${backgroundSlots}</div><div class="scene-background-stage">${background}${focusOverlay}</div>${focusCard}`
      : "";
    return `<section class="scene scene-${index + 1} layout-${scene.layout} ${compositionClass} ${surfaceClass} ${backgroundClass} ${motionClass} ${emphasisClass} ${accentClass} ${mediaClass}" data-scene-id="${escapeHtml(plannedScene?.id || scene.sceneId)}"${primaryUnitId ? ` data-unit-id="${escapeHtml(primaryUnitId)}" data-unit-ids="${escapeHtml(allUnitIds)}"` : ""}>${backgroundStage}<div class="scene-pattern"></div><div class="scene-band"></div><div class="scene-orb scene-orb-a"></div><div class="scene-orb scene-orb-b"></div><span class="scene-number">${String(index + 1).padStart(2, "0")}</span><div class="scene-frame"><div class="scene-copy">${text}</div>${media ? `<div class="scene-media">${media}</div>` : motif}</div></section>`;
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
.scene-motif{position:relative;z-index:2;flex:0 1 38%;width:38%;height:52%;min-width:260px;overflow:hidden;border:2px solid color-mix(in srgb,var(--accent2) 42%,transparent);border-radius:40px;background:radial-gradient(circle at 50% 38%,color-mix(in srgb,var(--accent) 32%,transparent),rgba(255,255,255,.05));box-shadow:inset 0 1px rgba(255,255,255,.24),0 28px 70px rgba(0,0,0,.28);animation:sceneMediaZoom .9s cubic-bezier(.16,1,.3,1) both}
.scene-motif i{position:absolute;display:block;background:linear-gradient(135deg,var(--accent),var(--accent2));box-shadow:0 0 30px var(--glow)}
.motif-rings i{inset:50% auto auto 50%;width:18%;aspect-ratio:1;border:8px solid var(--accent2);border-radius:34%;background:transparent;transform:translate(-50%,-50%) rotate(45deg);animation:motifOrbit 4s ease-in-out infinite alternate}
.motif-rings i:nth-child(2){width:34%;animation-delay:-.8s}.motif-rings i:nth-child(3){width:52%;animation-delay:-1.6s}.motif-rings i:nth-child(4){width:12%;border:0;background:var(--accent);animation:motifPulse 1.6s ease-in-out infinite}.motif-rings i:nth-child(5){display:none}
.motif-bars{display:flex;align-items:flex-end;justify-content:center;gap:7%;padding:18% 12%}.motif-bars i{position:relative;width:11%;height:26%;border-radius:999px 999px 12px 12px;animation:motifBar 2.4s ease-in-out infinite alternate}.motif-bars i:nth-child(2){height:48%;animation-delay:-.35s}.motif-bars i:nth-child(3){height:72%;animation-delay:-.7s}.motif-bars i:nth-child(4){height:58%;animation-delay:-1.05s}.motif-bars i:nth-child(5){height:88%;animation-delay:-1.4s}
.motif-device i:first-child{inset:13% 20%;border:5px solid var(--accent2);border-radius:30px;background:rgba(2,6,23,.36)}.motif-device i:nth-child(2){left:28%;right:28%;bottom:22%;height:8%;border-radius:999px;animation:motifSweep 2.2s ease-in-out infinite}.motif-device i:nth-child(3){left:28%;top:26%;width:18%;aspect-ratio:1;border-radius:50%;animation:motifPulse 1.8s ease-in-out infinite}.motif-device i:nth-child(4){left:50%;right:28%;top:28%;height:5%;border-radius:999px}.motif-device i:nth-child(5){left:50%;right:34%;top:40%;height:4%;border-radius:999px;opacity:.65}
.motif-checklist{padding:18%}.motif-checklist i{left:18%;right:18%;height:9%;border-radius:999px;animation:motifSweep 2.4s ease-in-out infinite}.motif-checklist i:nth-child(1){top:20%}.motif-checklist i:nth-child(2){top:36%;animation-delay:-.3s}.motif-checklist i:nth-child(3){top:52%;animation-delay:-.6s}.motif-checklist i:nth-child(4){top:68%;animation-delay:-.9s}.motif-checklist i:nth-child(5){display:none}
.motif-spark i{left:50%;top:50%;width:14%;aspect-ratio:1;border-radius:30% 70% 36% 64%;transform:translate(-50%,-50%) rotate(45deg);animation:motifSpark 2.8s ease-in-out infinite}.motif-spark i:nth-child(2){left:25%;top:30%;width:8%;animation-delay:-.5s}.motif-spark i:nth-child(3){left:74%;top:28%;width:10%;animation-delay:-1s}.motif-spark i:nth-child(4){left:26%;top:72%;width:11%;animation-delay:-1.5s}.motif-spark i:nth-child(5){left:76%;top:70%;width:7%;animation-delay:-2s}
.scene.has-motif .scene-frame{justify-content:space-between;text-align:left}.scene.has-motif .scene-copy{align-items:flex-start}.layout-centered.has-motif .scene-frame{flex-direction:row}.layout-statement.has-motif .scene-motif,.layout-cta.has-motif .scene-motif{display:block}
.scene.no-media .scene-frame{justify-content:center;text-align:center}
.scene.no-media .scene-copy{flex:1 1 100%;width:100%;max-width:92%;align-items:center}
.scene.no-media .scene-eyebrow,.scene.no-media .scene-cta{align-self:center}
.scene.no-media .scene-body{max-width:90%}
.scene-orb{position:absolute;border-radius:50%;filter:blur(30px);opacity:.75;pointer-events:none}
.scene-orb-a{top:-10%;right:-8%;width:42%;aspect-ratio:1;background:radial-gradient(circle,var(--accent) 0%,transparent 70%);animation:sceneOrbFloatA 7s ease-in-out infinite alternate}
.scene-orb-b{bottom:-14%;left:-10%;width:38%;aspect-ratio:1;background:radial-gradient(circle,var(--accent2) 0%,transparent 70%);animation:sceneOrbFloatB 6s ease-in-out infinite alternate}
.scene-pattern{position:absolute;inset:0;z-index:0;pointer-events:none;opacity:.42}
.scene-band{position:absolute;z-index:1;pointer-events:none}
.scene-number{position:absolute;right:8%;bottom:6%;z-index:4;color:color-mix(in srgb,var(--accent2) 46%,transparent);font-size:28px;font-weight:900;letter-spacing:.16em}
.background-grid .scene-pattern{background-image:linear-gradient(rgba(255,255,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.08) 1px,transparent 1px);background-size:64px 64px;mask-image:linear-gradient(90deg,#000,transparent 82%)}
.background-rays .scene-pattern{background:repeating-conic-gradient(from 225deg at 14% 82%,color-mix(in srgb,var(--accent) 18%,transparent) 0 7deg,transparent 7deg 18deg)}
.background-spotlight .scene-pattern{background:radial-gradient(circle at 50% 44%,color-mix(in srgb,var(--accent2) 32%,transparent),transparent 42%)}
.background-mesh .scene-pattern{background:radial-gradient(circle at 18% 25%,color-mix(in srgb,var(--accent) 30%,transparent),transparent 32%),radial-gradient(circle at 82% 72%,color-mix(in srgb,var(--accent2) 24%,transparent),transparent 30%)}
.background-gradient .scene-pattern{background:linear-gradient(115deg,transparent 5%,color-mix(in srgb,var(--accent) 22%,transparent) 48%,transparent 82%)}
.surface-solid .scene-frame{background:color-mix(in srgb,var(--bg1) 84%,#fff 16%);backdrop-filter:none}
.surface-outline .scene-frame{background:rgba(0,0,0,.08);backdrop-filter:none;border:3px solid color-mix(in srgb,var(--accent2) 58%,transparent)}
.surface-none .scene-frame{padding:5%;border:0;border-radius:0;background:transparent;box-shadow:none;backdrop-filter:none}
.composition-editorial .scene-frame{border-radius:8px;border-left:12px solid var(--accent);text-align:left}
.composition-editorial .scene-copy{align-items:flex-start}
.composition-editorial .scene-band{left:7%;top:8%;width:28%;height:8px;background:linear-gradient(90deg,var(--accent),transparent)}
.composition-kinetic .scene-frame{align-items:flex-end;justify-content:flex-start}
.composition-kinetic .scene-copy{flex:0 1 88%;align-items:flex-start}
.composition-kinetic .scene-headline{font-size:112px;line-height:.92;text-align:left;text-transform:uppercase}
.composition-kinetic .scene-band{right:-8%;top:18%;width:62%;height:18%;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--accent) 62%,transparent));transform:rotate(-12deg)}
.composition-spotlight .scene-frame{width:78%;height:72%;margin:14% auto;border-radius:56px;background:radial-gradient(circle at 50% 18%,color-mix(in srgb,var(--accent) 22%,transparent),color-mix(in srgb,var(--bg1) 92%,#fff 8%) 58%)}
.composition-spotlight .scene-copy{align-items:center;text-align:center}
.composition-showcase .scene-frame{border-radius:22px;border-top:10px solid var(--accent2)}
.composition-showcase .scene-copy{flex-basis:48%;align-items:flex-start}
.composition-showcase .scene-media{height:72%;border-radius:18px}
.composition-minimal .scene-frame{max-width:82%;height:auto;margin:auto;align-items:center}
.composition-minimal .scene-orb,.composition-minimal .scene-band{display:none}
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
.scene-deck.has-background-media .scene-background-blur{position:absolute;inset:-5%;z-index:0;overflow:hidden;background:#082f49;opacity:.32;filter:blur(26px) saturate(.8);transform:scale(1.12)}
.scene-deck.has-background-media .scene-background-blur .html-video-media-slot{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;margin:0!important}
.scene-deck.has-background-media .scene-background-blur img{width:100%!important;height:100%!important;object-fit:cover!important;animation:none!important}
.scene-deck.has-background-media .scene-background-stage{position:absolute;left:${backgroundFrame.left.toFixed(4)}%;top:${backgroundFrame.top.toFixed(4)}%;width:${backgroundFrame.width.toFixed(4)}%;height:${backgroundFrame.height.toFixed(4)}%;z-index:1;overflow:visible}
.scene-deck.has-background-media .scene-background-media{position:absolute;inset:0;z-index:0;overflow:hidden;transform:scale(1)}
.scene-deck.has-background-media .scene-background-media .html-video-media-slot{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;margin:0!important}
.scene-deck.has-background-media .scene-background-media img{width:100%!important;height:100%!important;object-fit:contain!important;object-position:center!important;animation:none!important;filter:none!important}
.scene-deck.has-background-media .scene-frame{z-index:3;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;backdrop-filter:none;overflow:visible;animation:none}
.scene-deck.has-background-media .scene-orb{display:none}
.scene-deck.has-background-media .scene-copy{position:absolute;top:${backgroundFocusMap.size > 0 ? sequenceCopyTop.toFixed(3) : "2.5"}%;left:50%;z-index:5;display:flex;flex:none;width:auto;min-width:260px;max-width:82%;padding:12px 30px;align-items:center;gap:8px;text-align:center;transform:translateX(-50%);border:2px solid rgba(255,255,255,.82);border-radius:999px;background:rgba(3,105,161,.92);box-shadow:0 14px 40px rgba(2,32,71,.24)}
.scene-deck.has-background-media .scene-copy:empty{display:none}
.scene-deck.has-background-media .scene-eyebrow,.scene-deck.has-background-media .scene-body,.scene-deck.has-background-media .scene-cta{align-self:center;margin:0;padding:0;border:0;background:none;box-shadow:none;color:#e0f2fe;font-size:24px;line-height:1.15}
.scene-deck.has-background-media .scene-headline{margin:0;font-size:52px;line-height:1;letter-spacing:.02em;text-transform:uppercase;background:none;-webkit-background-clip:initial;-webkit-text-fill-color:#fff;filter:none}
.scene-deck.has-background-media .scene-focus{position:absolute;z-index:2;display:none;overflow:visible;border:6px solid #0ea5e9;border-radius:28px;background:transparent;box-shadow:0 0 0 2200px rgba(7,34,53,.18),0 0 34px rgba(14,165,233,.9);pointer-events:none;animation:sceneFocusPulse 1.25s cubic-bezier(.16,1,.3,1) infinite alternate}
.scene-deck.has-background-media .scene-focus-card{position:absolute;left:8%;top:6%;z-index:4;display:none;width:84%;height:${focusCardHeight.toFixed(3)}%;overflow:hidden;border:6px solid rgba(255,255,255,.9);border-radius:38px;background:#e0f2fe;box-shadow:0 28px 70px rgba(2,32,71,.38),0 0 0 3px #0ea5e9;animation:sceneMediaZoom .8s cubic-bezier(.16,1,.3,1) both}
.scene-deck.has-background-media .scene-focus-card img{width:100%!important;height:100%!important;object-fit:contain!important;animation:none!important;filter:none!important}
.scene-deck.has-background-media .scene-focus-card-counter{position:absolute;right:18px;top:18px;z-index:5;padding:8px 14px;border:3px solid #fff;border-radius:999px;background:#0284c7;color:#fff;font-size:24px;font-weight:900;line-height:1}
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
@keyframes sceneFocusPulse{0%{border-color:#0ea5e9;box-shadow:0 0 0 2200px rgba(7,34,53,.18),0 0 20px rgba(14,165,233,.65);transform:scale(.985)}100%{border-color:#fbbf24;box-shadow:0 0 0 2200px rgba(7,34,53,.24),0 0 46px rgba(251,191,36,.95);transform:scale(1.025)}}
@keyframes motifOrbit{0%{transform:translate(-50%,-50%) rotate(25deg) scale(.92)}100%{transform:translate(-50%,-50%) rotate(75deg) scale(1.08)}}
@keyframes motifPulse{0%,100%{transform:translate(-50%,-50%) scale(.8);opacity:.62}50%{transform:translate(-50%,-50%) scale(1.2);opacity:1}}
@keyframes motifBar{0%{transform:scaleY(.72);filter:saturate(.8)}100%{transform:scaleY(1.08);filter:saturate(1.3)}}
@keyframes motifSweep{0%{transform:translateX(-10px);opacity:.62}100%{transform:translateX(14px);opacity:1}}
@keyframes motifSpark{0%,100%{transform:translate(-50%,-50%) rotate(35deg) scale(.72);opacity:.55}50%{transform:translate(-50%,-50%) rotate(58deg) scale(1.2);opacity:1}}
@keyframes sceneProgressFill{0%{width:0}100%{width:100%}}
`.trim();
  return { html, css };
}

function canFallbackHtmlVideoPipelineModel(error: unknown) {
  const status = typeof error === "object" && error !== null
    ? Number((error as { status?: unknown }).status)
    : 0;
  const message = error instanceof Error ? error.message : String(error);
  return status !== 401 && status !== 402 && !/OPENROUTER_API_KEY/i.test(message);
}

export async function structuredCall(
  chat: PipelineChat,
  stage: HtmlVideoPipelineModelStage,
  system: string,
  user: string,
  responseSchema: object,
  temperature: number,
  environment: Record<string, string | undefined> = process.env
) {
  const models = resolveHtmlVideoPipelineModels(stage, environment);
  let lastError: unknown;
  for (const [index, model] of models.entries()) {
    try {
      return await chat({
        model,
        temperature,
        jsonMode: true,
        responseSchema,
        strictJsonSchema: environment.HTML_VIDEO_STRICT_JSON_SCHEMA !== "false",
        maxRetries: maxRetries(),
        maxTokens: Math.max(
          2_048,
          Math.min(32_768, Number(environment.HTML_VIDEO_DRAFT_MAX_TOKENS) || 8_192)
        ),
        reasoning: { maxTokens: 1_024, exclude: true },
        timeoutMs: timeoutMs(),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
    } catch (error) {
      lastError = error;
      if (index === models.length - 1 || !canFallbackHtmlVideoPipelineModel(error)) break;
      console.warn("[HTML Video] Pipeline provider fallback", {
        stage,
        failedModel: model,
        fallbackModel: models[index + 1],
      });
    }
  }
  throw new HtmlVideoPipelineProviderError(lastError);
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
  const revisionIntent = classifyHtmlVideoRevisionIntent(
    input.draftInput.promptProvenance?.rawUserPrompt || input.draftInput.prompt,
    existingPipeline
  );
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
      "planner",
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
  const orderedBoardVisual = !editSource && usesDeterministicOrderedBoardTemplate(
    plan,
    grounding.sourceText,
    input.referenceAssets
  )
    ? buildDeterministicOrderedBoardVisual(plan)
    : null;
  const compositionPromise = editSource
    ? voiceOnlyRevision
      ? Promise.resolve({ html: editSource.html, css: editSource.css })
      : checkpoint.revision
        ? Promise.resolve(checkpoint.revision)
        : structuredCall(
            input.chat,
            "revision",
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
    : orderedBoardVisual
      ? Promise.resolve(orderedBoardVisual).then(async (value) => {
          await input.onCheckpoint?.("visual", value);
          return value;
        })
      : checkpoint.visual
      ? Promise.resolve(checkpoint.visual)
      : structuredCall(
          input.chat,
          "visual",
          visualSystemPrompt(),
          planJson,
          {
            theme: "ocean|midnight|sunset|emerald|violet|coral|gold|arctic|neon|earth|blush|slate",
            scenes: [{
              sceneId: "string", layout: "centered|split-left|split-right|statement|cta",
              emphasis: "hero|standard|climax", accentStyle: "glow|border|gradient-shift|minimal",
              compositionStyle: "editorial|kinetic|spotlight|showcase|minimal",
              surfaceStyle: "glass|solid|outline|none",
              backgroundStyle: "mesh|grid|rays|spotlight|gradient",
              motionPreset: "soft-reveal|kinetic-slide|scale-pop|spotlight-sweep",
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
        currentEditRequest: input.draftInput.promptProvenance?.rawUserPrompt || input.draftInput.prompt,
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
          "voice",
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
  const narrationAlignedScenePlan = plan.scenePlan.map((scene, index) => ({
    ...scene,
    narration: voice.scenes[index]?.text || scene.narration,
  }));
  const preserveExistingTimeline = Boolean(
    editSource
    && !revisionIntent.voice
    && !revisionIntent.content
    && !revisionIntent.timing
    && !revisionIntent.spec
    && !revisionIntent.fullRedesign
  );
  const timelineFit = preserveExistingTimeline
    ? { scenes: narrationAlignedScenePlan, adjusted: false }
    : fitHtmlVideoSceneTimeline(
        narrationAlignedScenePlan,
        input.draftInput.durationSeconds,
        plan.videoBrief.videoSpec.language
      );
  const finalPlan: HtmlVideoPlan = { ...plan, scenePlan: timelineFit.scenes };
  const composition = input.draftInput.editSource
    ? compositionOrVisual as { html: string; css: string }
    : compileHtmlVideoComposition(
        compositionOrVisual as HtmlVideoVisualComposition,
        finalPlan,
        input.referenceAssets,
        grounding.sourceText
      );
  return {
    kind: "structured",
    ...composition,
    voiceScript: voice.fullScript,
    pipeline: {
      version: HTML_VIDEO_PIPELINE_VERSION,
      sourceText: grounding.sourceText,
      promptProvenance: grounding.promptProvenance,
      sourceContextRefs: grounding.sourceContextRefs,
      videoBrief: plan.videoBrief,
      contentUnits: plan.contentUnits,
      scenePlan: finalPlan.scenePlan,
      findings: [{
        stage: "validation",
        code: "PROMPT_COVERAGE_VERIFIED",
        severity: "info",
        message: "All required content units are mapped to a contiguous scene timeline with validated provenance.",
      }, ...(orderedBoardVisual ? [{
        stage: "visual" as const,
        code: "DETERMINISTIC_ORDERED_BOARD_TEMPLATE_APPLIED",
        severity: "info" as const,
        message: "The ordered image board uses a validated deterministic template instead of model-generated layout.",
      }] : []), ...(timelineFit.adjusted ? [{
        stage: "voice" as const,
        code: "NARRATION_WEIGHTED_TIMELINE_APPLIED",
        severity: "info" as const,
        message: "Scene timing was recalculated from the final narration length and language cadence.",
      }] : []), ...(voice.adjustedSceneIds || []).map((sceneId) => ({
        stage: "voice" as const,
        code: "VOICE_NARRATION_FITTED_TO_SCENE",
        severity: "warning" as const,
        message: "Narration was shortened using approved scene text to fit the scene duration.",
        sceneId,
      }))],
    },
  };
}
