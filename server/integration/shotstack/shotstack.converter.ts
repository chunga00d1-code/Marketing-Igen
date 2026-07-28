import type { VideoProjectRenderSnapshot } from "../../interface/video-project-render.interface";
import type {
  ShotstackAsset,
  ShotstackClip,
  ShotstackEdit,
  ShotstackOutput,
} from "./shotstack.types";

type SupportedAspectRatio = "9:16" | "16:9" | "1:1" | "3:4";
type SupportedItemType = "video" | "image" | "audio" | "text";

interface ProviderBinding {
  provider: "shotstack";
  trackIndex: number;
  clipIndex: number;
  rawTransition?: Record<string, unknown>;
  textMergeField?: TextMergeField;
}

interface EditorItem extends Record<string, unknown> {
  id: string;
  trackId: string;
  type: SupportedItemType;
  start: number;
  duration: number;
  order: number;
  sourceUrl?: string;
  text?: string;
  mergeValue?: string;
  replaceable?: boolean;
  volume?: number;
  fitMode?: "cover" | "fit";
  rotation?: number;
  trim?: number;
  opacity?: number;
  scale?: number;
  providerBinding?: ProviderBinding;
}

interface ReplacementMarker {
  originalType: "video" | "image";
  sourceType: "video" | "image";
}

export interface ShotstackConversionResult {
  project: VideoProjectRenderSnapshot;
  sourceEdit: ShotstackEdit;
  warnings: string[];
}

const ASPECT_RATIOS: SupportedAspectRatio[] = ["9:16", "16:9", "1:1", "3:4"];
const VISUAL_ASSET_TYPES = new Set(["video", "image", "title", "html"]);
const SUPPORTED_ASSET_TYPES = new Set(["video", "image", "audio", "title", "html"]);
// Matches the editor's default clip length when Shotstack supplies no usable duration metadata.
const SYMBOLIC_CLIP_FALLBACK_DURATION_SECONDS = 5;
const TITLE_SIZE_MAP: Record<string, number> = {
  "xx-small": 20,
  "x-small": 24,
  small: 32,
  medium: 48,
  large: 64,
  "x-large": 80,
  "xx-large": 96,
};

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function containsHandlebars(value: string | undefined): boolean {
  return typeof value === "string" && /{{\s*[^{}]+\s*}}/.test(value);
}

function mergeValueMap(edit: ShotstackEdit): Map<string, unknown> {
  const values = new Map<string, unknown>();
  if (!Array.isArray(edit.merge)) return values;
  for (const entry of edit.merge) {
    if (!isRecord(entry) || !nonEmptyString(entry.find) || !("replace" in entry)) continue;
    values.set(entry.find.trim(), entry.replace);
  }
  return values;
}

function resolveMergeValue(value: string | undefined, values: Map<string, unknown>): string | undefined {
  if (typeof value !== "string") return value;
  return value.replace(/{{\s*([^{}]+?)\s*}}/g, (placeholder, key: string) => {
    const replacement = values.get(key.trim());
    return replacement === undefined || replacement === null
      ? placeholder
      : String(replacement);
  });
}

function explicitProviderDuration(edit: ShotstackEdit, durationHint?: number): number {
  const editRecord = edit as Record<string, unknown>;
  const candidates = [
    durationHint,
    editRecord.duration,
    edit.timeline.duration,
    edit.output.duration,
    isRecord(editRecord.template) ? editRecord.template.duration : undefined,
    isRecord(editRecord.metadata) ? editRecord.metadata.duration : undefined,
  ].filter((value): value is number => finiteNumber(value) && value > 0);
  return candidates.length > 0 ? Math.max(...candidates) : 0;
}

function providerTimelineDuration(edit: ShotstackEdit, durationHint?: number): number {
  const numericDuration = edit.timeline.tracks.reduce(
    (maximum, track) => track.clips.reduce(
      (trackMaximum, clip) => finiteNumber(clip.start)
        && clip.start >= 0
        && finiteNumber(clip.length)
        ? Math.max(trackMaximum, clip.start + clip.length)
        : trackMaximum,
      maximum
    ),
    0
  );
  const symbolicStarts = edit.timeline.tracks.flatMap((track) =>
    track.clips
      .filter((clip) => (
        finiteNumber(clip.start)
        && clip.start >= 0
        && (clip.length === "auto" || clip.length === "end")
      ))
      .map((clip) => clip.start)
  );
  const baseDuration = Math.max(
    numericDuration,
    explicitProviderDuration(edit, durationHint)
  );
  if (symbolicStarts.length === 0) return baseDuration;

  const latestSymbolicStart = Math.max(...symbolicStarts);
  return baseDuration > latestSymbolicStart
    ? baseDuration
    : latestSymbolicStart + SYMBOLIC_CLIP_FALLBACK_DURATION_SECONDS;
}

function normalizedProviderClip(
  clip: ShotstackClip,
  values: Map<string, unknown>,
  timelineDuration: number
): ShotstackClip {
  const normalized = deepClone(clip);
  normalized.asset.src = resolveMergeValue(normalized.asset.src, values);
  normalized.asset.text = resolveMergeValue(normalized.asset.text, values);
  normalized.asset.html = resolveMergeValue(normalized.asset.html, values);
  if (clip.length === "auto" || clip.length === "end") {
    normalized.length = Math.max(0, timelineDuration - clip.start);
  }
  return normalized;
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function htmlToText(html: string): string {
  return decodeBasicHtmlEntities(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

interface TextMergeField {
  key: string;
  assetType: "title" | "html";
  source: string;
  prefix: string;
  suffix: string;
}

type TextMergeFieldParts = Pick<TextMergeField, "key" | "prefix" | "suffix">;

function singleTextMergeField(value: string | undefined): TextMergeFieldParts | undefined {
  if (typeof value !== "string") return undefined;
  const matches = [...value.matchAll(/{{\s*([^{}]+?)\s*}}/g)];
  if (matches.length !== 1) return undefined;
  const match = matches[0];
  const key = match[1]?.trim();
  const index = match.index;
  if (!key || index === undefined) return undefined;
  return {
    key,
    prefix: value.slice(0, index),
    suffix: value.slice(index + match[0].length),
  };
}

function sourceTextMergeField(clip: ShotstackClip): TextMergeField | undefined {
  if (clip.asset.type === "title" && typeof clip.asset.text === "string") {
    const field = singleTextMergeField(clip.asset.text);
    return field
      ? { ...field, assetType: "title", source: clip.asset.text }
      : undefined;
  }
  if (clip.asset.type === "html" && typeof clip.asset.html === "string") {
    const field = singleTextMergeField(htmlToText(clip.asset.html));
    return field
      ? { ...field, assetType: "html", source: clip.asset.html }
      : undefined;
  }
  return undefined;
}

function sourceTextMergeValue(
  field: TextMergeField,
  values: Map<string, unknown>
): string {
  const replacement = values.get(field.key);
  if (replacement === undefined || replacement === null) return "";
  const value = String(replacement);
  return field.assetType === "html" ? decodeBasicHtmlEntities(value) : value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlMergeValue(value: string): string {
  return escapeHtml(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function aspectRatioFromOutput(output: ShotstackOutput): SupportedAspectRatio {
  if (ASPECT_RATIOS.includes(output.aspectRatio as SupportedAspectRatio)) {
    return output.aspectRatio as SupportedAspectRatio;
  }

  const width = output.size?.width;
  const height = output.size?.height;
  if (finiteNumber(width) && width > 0 && finiteNumber(height) && height > 0) {
    const ratio = width / height;
    const nearest = ASPECT_RATIOS
      .map((value) => {
        const [ratioWidth, ratioHeight] = value.split(":").map(Number);
        return { value, distance: Math.abs(ratio - ratioWidth / ratioHeight) };
      })
      .sort((left, right) => left.distance - right.distance)[0];
    if (nearest.distance < 0.02) return nearest.value;
  }

  return "16:9";
}

function fitToEditor(fit: string | undefined): "cover" | "fit" {
  return fit === "contain" || fit === "none" ? "fit" : "cover";
}

function fitToShotstack(fit: unknown): "crop" | "contain" | undefined {
  if (fit === "cover") return "crop";
  if (fit === "fit") return "contain";
  return undefined;
}

function pointForPosition(position: string | undefined): { x: number; y: number } {
  const normalized = position?.replace(/[-_\s]/g, "").toLowerCase() || "center";
  return {
    x: normalized.includes("left") ? 0 : normalized.includes("right") ? 100 : 50,
    y: normalized.includes("top") ? 0 : normalized.includes("bottom") ? 100 : 50,
  };
}

function positioningForClip(
  asset: ShotstackAsset,
  clip: ShotstackClip
): {
  level: "asset" | "clip";
  position: string | undefined;
  offset: { x?: number; y?: number } | undefined;
} {
  if (asset.position !== undefined || asset.offset !== undefined) {
    return {
      level: "asset",
      position: nonEmptyString(asset.position) ? asset.position : undefined,
      offset: asset.offset,
    };
  }
  return {
    level: "clip",
    position: nonEmptyString(clip.position) ? clip.position : undefined,
    offset: clip.offset,
  };
}

function positionForAsset(asset: ShotstackAsset, clip: ShotstackClip): { x: number; y: number } {
  const { position, offset } = positioningForClip(asset, clip);
  const base = pointForPosition(position);
  const x = base.x + (finiteNumber(offset?.x) ? offset.x * 100 : 0);
  const y = base.y - (finiteNumber(offset?.y) ? offset.y * 100 : 0);
  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
  };
}

function rotationForClip(clip: ShotstackClip): number | undefined {
  const angle = clip.transform?.rotate?.angle;
  return finiteNumber(angle) ? angle : undefined;
}

function textStyleForClip(asset: ShotstackAsset, clip: ShotstackClip): Record<string, unknown> {
  const position = positionForAsset(asset, clip);
  return {
    fontFamily: "Arial",
    fontSize: nonEmptyString(asset.size) ? TITLE_SIZE_MAP[asset.size] || 48 : 48,
    color: nonEmptyString(asset.color) ? asset.color : "#ffffff",
    align: "center",
    bold: false,
    italic: false,
    x: position.x,
    y: position.y,
  };
}

function providerBinding(
  trackIndex: number,
  clipIndex: number,
  clip?: ShotstackClip,
  textMergeField?: TextMergeField
): ProviderBinding {
  return {
    provider: "shotstack",
    trackIndex,
    clipIndex,
    ...(isRecord(clip?.transition) ? { rawTransition: deepClone(clip.transition) } : {}),
    ...(textMergeField ? { textMergeField: deepClone(textMergeField) } : {}),
  };
}

function supportedClipReason(clip: ShotstackClip): string | undefined {
  const assetType = clip.asset?.type;
  if (!SUPPORTED_ASSET_TYPES.has(assetType)) return `unsupported asset type "${assetType || "unknown"}"`;
  if (!finiteNumber(clip.start) || clip.start < 0) return "unsupported clip start";
  if (!finiteNumber(clip.length) || clip.length <= 0) return "unsupported clip length";
  if (assetType === "video" || assetType === "image" || assetType === "audio") {
    if (!nonEmptyString(clip.asset.src)) return `missing ${assetType} source`;
  }
  if (assetType === "title" && !nonEmptyString(clip.asset.text)) return "missing title text";
  if (assetType === "html" && (!nonEmptyString(clip.asset.html) || !htmlToText(clip.asset.html))) {
    return "HTML clip has no text-compatible content";
  }
  return undefined;
}

function labelForType(type: SupportedItemType): string {
  if (type === "text") return "Text";
  return `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}

function clipToEditorItem(
  clip: ShotstackClip,
  trackIndex: number,
  clipIndex: number,
  originalClip: ShotstackClip,
  mergeValues: Map<string, unknown>
): EditorItem {
  const asset = clip.asset;
  const type: SupportedItemType = asset.type === "title" || asset.type === "html"
    ? "text"
    : asset.type as SupportedItemType;
  const sourceUrl = type === "text" ? undefined : asset.src;
  const text = asset.type === "html" ? htmlToText(asset.html || "") : asset.text;
  const rotation = rotationForClip(clip);
  const textMergeField = type === "text" ? sourceTextMergeField(originalClip) : undefined;

  return {
    id: `shotstack-${trackIndex}-${clipIndex}`,
    trackId: type === "text" ? "track-text" : type === "audio" ? "track-audio" : "track-video",
    type,
    start: clip.start,
    duration: clip.length as number,
    ...(sourceUrl !== undefined ? { sourceUrl } : {}),
    ...(text !== undefined ? { text } : {}),
    ...(textMergeField
      ? { mergeValue: sourceTextMergeValue(textMergeField, mergeValues) }
      : {}),
    replaceable: type === "text"
      ? textMergeField !== undefined
      : containsHandlebars(originalClip.asset.src),
    ...(finiteNumber(asset.volume) ? { volume: asset.volume } : {}),
    ...(type === "video" || type === "image" ? { fitMode: fitToEditor(clip.fit) } : {}),
    ...(rotation !== undefined ? { rotation } : {}),
    ...(finiteNumber(asset.trim) ? { trim: asset.trim } : {}),
    ...(finiteNumber(clip.opacity) ? { opacity: clip.opacity } : {}),
    ...(finiteNumber(clip.scale) ? { scale: clip.scale } : {}),
    ...(type === "text" ? { style: textStyleForClip(asset, clip) } : {}),
    label: labelForType(type),
    order: clipIndex + 1,
    providerBinding: providerBinding(trackIndex, clipIndex, clip, textMergeField),
  };
}

export function shotstackEditToEditorProject(
  edit: ShotstackEdit,
  durationHint?: number
): ShotstackConversionResult {
  const warnings: string[] = [];
  const items: EditorItem[] = [];
  let hasVisualClip = false;
  const mergeValues = mergeValueMap(edit);
  const timelineDuration = providerTimelineDuration(edit, durationHint);

  edit.timeline.tracks.forEach((track, trackIndex) => {
    track.clips.forEach((sourceClip, clipIndex) => {
      const clip = normalizedProviderClip(sourceClip, mergeValues, timelineDuration);
      const reason = supportedClipReason(clip);
      if (reason) {
        warnings.push(`Shotstack track ${trackIndex}, clip ${clipIndex}: ${reason}.`);
        return;
      }

      items.push(clipToEditorItem(clip, trackIndex, clipIndex, sourceClip, mergeValues));
      if (VISUAL_ASSET_TYPES.has(clip.asset.type)) hasVisualClip = true;
    });
  });

  if (!hasVisualClip) {
    throw new Error("Shotstack edit contains no usable visual clip.");
  }

  const normalizedTimelineDuration = items.reduce(
    (maximum, item) => Math.max(maximum, item.start + item.duration),
    0
  );
  const soundtrack = edit.timeline.soundtrack;
  if (soundtrack) {
    const resolvedSoundtrackSource = resolveMergeValue(soundtrack.src, mergeValues);
    if (nonEmptyString(resolvedSoundtrackSource)) {
      items.push({
        id: "shotstack-soundtrack",
        trackId: "track-audio",
        type: "audio",
        start: 0,
        duration: normalizedTimelineDuration,
        sourceUrl: resolvedSoundtrackSource,
        replaceable: containsHandlebars(soundtrack.src),
        ...(finiteNumber(soundtrack.volume) ? { volume: soundtrack.volume } : {}),
        label: "Soundtrack",
        order: items.filter((item) => item.type === "audio").length + 1,
        providerBinding: providerBinding(-1, -1),
      });
    } else {
      warnings.push("Shotstack soundtrack: missing audio source.");
    }
  }

  const aspectRatio = aspectRatioFromOutput(edit.output);
  const sourceName = isRecord(edit) && nonEmptyString(edit.name) ? edit.name : "Shotstack template";
  return {
    project: {
      title: sourceName,
      tracks: [
        { id: "track-video", type: "video", name: "Video" },
        { id: "track-text", type: "text", name: "Text" },
        { id: "track-audio", type: "audio", name: "Audio" },
      ],
      items,
      settings: {
        aspectRatio,
        duration: normalizedTimelineDuration,
      },
    },
    sourceEdit: deepClone(edit),
    warnings,
  };
}

function readProviderBinding(item: Record<string, unknown>): ProviderBinding | undefined {
  const binding = item.providerBinding;
  if (
    !isRecord(binding)
    || binding.provider !== "shotstack"
    || !Number.isInteger(binding.trackIndex)
    || !Number.isInteger(binding.clipIndex)
  ) {
    return undefined;
  }
  return binding as unknown as ProviderBinding;
}

function readItemType(item: Record<string, unknown>): SupportedItemType | undefined {
  const type = item.type;
  return type === "video" || type === "image" || type === "audio" || type === "text"
    ? type
    : undefined;
}

function readReplacementMarker(item: Record<string, unknown>): ReplacementMarker | undefined {
  const replacement = item.replacement;
  if (
    !isRecord(replacement)
    || (replacement.originalType !== "video" && replacement.originalType !== "image")
    || (replacement.sourceType !== "video" && replacement.sourceType !== "image")
  ) {
    return undefined;
  }
  return replacement as unknown as ReplacementMarker;
}

function sourceItemId(trackIndex: number, clipIndex: number): string {
  return `shotstack-${trackIndex}-${clipIndex}`;
}

function validatedSourceReplacement(
  item: Record<string, unknown>,
  originalClip: ShotstackClip,
  trackIndex: number,
  clipIndex: number
): { type: "video" | "image"; sourceUrl: string } | undefined {
  const binding = readProviderBinding(item);
  const marker = readReplacementMarker(item);
  const type = readItemType(item);
  const originalType = originalClip.asset.type;
  if (
    item.id !== sourceItemId(trackIndex, clipIndex)
    || !binding
    || binding.trackIndex !== trackIndex
    || binding.clipIndex !== clipIndex
    || !marker
    || (originalType !== "video" && originalType !== "image")
    || !containsHandlebars(originalClip.asset.src)
    || marker.originalType !== originalType
    || marker.sourceType !== type
    || (type !== "video" && type !== "image")
    || !nonEmptyString(item.sourceUrl)
  ) {
    return undefined;
  }
  return { type, sourceUrl: item.sourceUrl };
}

function validatedTextMergeUpdate(
  item: Record<string, unknown>,
  originalClip: ShotstackClip,
  sourceEdit: ShotstackEdit,
  trackIndex: number,
  clipIndex: number
): { key: string; value: string } | undefined {
  const binding = readProviderBinding(item);
  const field = sourceTextMergeField(originalClip);
  const boundField = binding?.textMergeField;
  if (
    item.id !== sourceItemId(trackIndex, clipIndex)
    || !binding
    || binding.trackIndex !== trackIndex
    || binding.clipIndex !== clipIndex
    || item.type !== "text"
    || item.replaceable !== true
    || typeof item.mergeValue !== "string"
    || !field
    || !boundField
    || boundField.key !== field.key
    || boundField.assetType !== field.assetType
    || boundField.source !== field.source
    || boundField.prefix !== field.prefix
    || boundField.suffix !== field.suffix
  ) {
    return undefined;
  }

  const values = mergeValueMap(sourceEdit);
  if (item.mergeValue === sourceTextMergeValue(field, values)) {
    return undefined;
  }
  return {
    key: field.key,
    value: field.assetType === "html"
      ? escapeHtmlMergeValue(item.mergeValue)
      : item.mergeValue,
  };
}

function applyTextMergeUpdate(
  edit: ShotstackEdit,
  sourceEdit: ShotstackEdit,
  update: { key: string; value: string }
): void {
  const sourceMerge = Array.isArray(sourceEdit.merge)
    ? sourceEdit.merge
    : [];
  const sourceMatchingIndices = sourceMerge.flatMap((entry, index) => (
    isRecord(entry)
      && nonEmptyString(entry.find)
      && entry.find.trim() === update.key
      ? [index]
      : []
  ));
  if (sourceMatchingIndices.length > 1) return;

  const currentMerge = Array.isArray(edit.merge) ? edit.merge : sourceMerge;
  const matchingIndices = currentMerge.flatMap((entry, index) => (
    isRecord(entry)
      && nonEmptyString(entry.find)
      && entry.find.trim() === update.key
      ? [index]
      : []
  ));
  if (matchingIndices.length > 1) return;
  const nextMerge = deepClone(currentMerge);
  if (matchingIndices.length === 1) {
    const entry = nextMerge[matchingIndices[0]];
    if (!isRecord(entry)) return;
    entry.replace = update.value;
  } else {
    nextMerge.push({ find: update.key, replace: update.value });
  }
  (edit as Record<string, unknown>).merge = nextMerge;
}

function applyValidatedSourceReplacements(
  snapshot: VideoProjectRenderSnapshot,
  sourceEdit: ShotstackEdit
): ShotstackEdit {
  const edit = deepClone(sourceEdit);
  const items = snapshot.items.filter(isRecord);

  sourceEdit.timeline.tracks.forEach((sourceTrack, trackIndex) => {
    sourceTrack.clips.forEach((sourceClip, clipIndex) => {
      const expectedId = sourceItemId(trackIndex, clipIndex);
      const candidates = items.filter((item) => item.id === expectedId);
      if (candidates.length !== 1) return;
      const replacement = validatedSourceReplacement(
        candidates[0],
        sourceClip,
        trackIndex,
        clipIndex
      );
      if (replacement) {
        const asset = deepClone(sourceClip.asset);
        asset.type = replacement.type;
        asset.src = replacement.sourceUrl;
        if (replacement.type === "image") {
          delete asset.trim;
          delete asset.volume;
          delete asset.transcode;
          delete asset.volumeEffect;
          delete asset.speed;
          delete asset.chromaKey;
        }
        edit.timeline.tracks[trackIndex].clips[clipIndex].asset = asset;
        return;
      }

      const textUpdate = validatedTextMergeUpdate(
        candidates[0],
        sourceClip,
        sourceEdit,
        trackIndex,
        clipIndex
      );
      if (textUpdate) applyTextMergeUpdate(edit, sourceEdit, textUpdate);
    });
  });

  return edit;
}

function readStyle(item: Record<string, unknown>): Record<string, unknown> | undefined {
  return isRecord(item.style) ? item.style : undefined;
}

function applyEditorPosition(
  clip: ShotstackClip,
  item: Record<string, unknown>,
  originalClip?: ShotstackClip
): void {
  const style = readStyle(item);
  if (!style || !finiteNumber(style.x) || !finiteNumber(style.y)) return;

  if (originalClip) {
    const originalPoint = positionForAsset(originalClip.asset, originalClip);
    if (style.x === originalPoint.x && style.y === originalPoint.y) return;
  }

  const sourcePositioning = originalClip
    ? positioningForClip(originalClip.asset, originalClip)
    : { level: "asset" as const, position: undefined };
  const base = pointForPosition(sourcePositioning.position);
  const offset = {
    x: (style.x - base.x) / 100,
    y: (base.y - style.y) / 100,
  };
  if (sourcePositioning.level === "asset") {
    if (sourcePositioning.position) clip.asset.position = sourcePositioning.position;
    else delete clip.asset.position;
    clip.asset.offset = offset;
    delete clip.position;
    delete clip.offset;
  } else {
    if (sourcePositioning.position) clip.position = sourcePositioning.position;
    else delete clip.position;
    clip.offset = offset;
    delete clip.asset.position;
    delete clip.asset.offset;
  }
}

function applyEditorItemToClip(
  item: Record<string, unknown>,
  originalClip?: ShotstackClip
): ShotstackClip | undefined {
  const type = readItemType(item);
  if (
    !type
    || !finiteNumber(item.start)
    || item.start < 0
    || !finiteNumber(item.duration)
    || item.duration <= 0
  ) {
    return undefined;
  }

  let asset: ShotstackAsset;
  if (originalClip) {
    asset = deepClone(originalClip.asset);
  } else if (type === "text") {
    if (typeof item.text !== "string") return undefined;
    asset = { type: "title", text: item.text };
  } else {
    if (!nonEmptyString(item.sourceUrl)) return undefined;
    asset = { type, src: item.sourceUrl };
  }

  if (type === "text") {
    if (typeof item.text !== "string") return undefined;
    if (asset.type === "html") {
      const previousText = nonEmptyString(asset.html) ? htmlToText(asset.html) : "";
      if (item.text !== previousText) asset.html = escapeHtml(item.text);
    } else {
      asset.type = "title";
      asset.text = item.text;
    }
    const style = readStyle(item);
    if (style && nonEmptyString(style.color)) asset.color = style.color;
  } else {
    if (!nonEmptyString(item.sourceUrl)) return undefined;
    asset.type = type;
    asset.src = item.sourceUrl;
    if (type === "image") {
      delete asset.trim;
      delete asset.volume;
      delete asset.transcode;
      delete asset.volumeEffect;
      delete asset.speed;
      delete asset.chromaKey;
    }
    if ((type === "video" || type === "audio") && finiteNumber(item.volume)) {
      asset.volume = item.volume;
    }
    if ((type === "video" || type === "audio") && finiteNumber(item.trim)) {
      asset.trim = item.trim;
    }
  }

  const clip: ShotstackClip = originalClip
    ? { ...deepClone(originalClip), asset, start: item.start, length: item.duration }
    : { asset, start: item.start, length: item.duration };
  const fit = fitToShotstack(item.fitMode);
  if (fit && (!originalClip || item.fitMode !== fitToEditor(originalClip.fit))) {
    clip.fit = fit;
  }
  if (finiteNumber(item.scale)) clip.scale = item.scale;
  if (finiteNumber(item.opacity)) clip.opacity = item.opacity;
  if (finiteNumber(item.rotation)) {
    clip.transform = {
      ...(isRecord(clip.transform) ? clip.transform : {}),
      rotate: { angle: item.rotation },
    };
  }

  if (type === "text") applyEditorPosition(clip, item, originalClip);
  const binding = readProviderBinding(item);
  if (isRecord(binding?.rawTransition)) {
    clip.transition = deepClone(binding.rawTransition);
  }
  return clip;
}

function isSourceClipRepresented(clip: ShotstackClip): boolean {
  return supportedClipReason(clip) === undefined;
}

function currentAspectRatio(
  snapshot: VideoProjectRenderSnapshot,
  fallback: SupportedAspectRatio
): SupportedAspectRatio {
  const settingsRatio = snapshot.settings.aspectRatio;
  if (ASPECT_RATIOS.includes(settingsRatio as SupportedAspectRatio)) {
    return settingsRatio as SupportedAspectRatio;
  }
  const directRatio = (snapshot as unknown as Record<string, unknown>).aspectRatio;
  return ASPECT_RATIOS.includes(directRatio as SupportedAspectRatio)
    ? directRatio as SupportedAspectRatio
    : fallback;
}

function updateSoundtrack(
  edit: ShotstackEdit,
  items: Array<Record<string, unknown>>,
  processedItems: Set<Record<string, unknown>>
): void {
  const item = items.find((candidate) => {
    const binding = readProviderBinding(candidate);
    return binding?.trackIndex === -1 && binding.clipIndex === -1;
  });

  if (!item) {
    if (edit.timeline.soundtrack) delete edit.timeline.soundtrack;
    return;
  }

  processedItems.add(item);
  if (readItemType(item) !== "audio" || !nonEmptyString(item.sourceUrl)) {
    delete edit.timeline.soundtrack;
    return;
  }
  edit.timeline.soundtrack = {
    ...(edit.timeline.soundtrack || {}),
    src: item.sourceUrl,
    ...(finiteNumber(item.volume) ? { volume: item.volume } : {}),
  };
}

export function editorProjectToShotstackEdit(
  snapshot: VideoProjectRenderSnapshot,
  sourceEdit?: ShotstackEdit
): ShotstackEdit {
  if (sourceEdit) {
    return applyValidatedSourceReplacements(snapshot, sourceEdit);
  }

  const aspectRatio = currentAspectRatio(snapshot, "16:9");
  const edit: ShotstackEdit = {
    timeline: { tracks: [] },
    output: { format: "mp4", aspectRatio },
  };
  const items = snapshot.items.filter(isRecord);
  const processedItems = new Set<Record<string, unknown>>();
  const boundItems = new Map<string, Record<string, unknown>>();

  for (const item of items) {
    const binding = readProviderBinding(item);
    if (binding && binding.trackIndex >= 0 && binding.clipIndex >= 0) {
      boundItems.set(`${binding.trackIndex}:${binding.clipIndex}`, item);
    }
  }

  edit.timeline.tracks = edit.timeline.tracks
    .map((track, trackIndex) => ({
      ...track,
      clips: track.clips.flatMap((clip, clipIndex) => {
        const item = boundItems.get(`${trackIndex}:${clipIndex}`);
        if (item) {
          processedItems.add(item);
          const updatedClip = applyEditorItemToClip(item, clip);
          return updatedClip ? [updatedClip] : [];
        }
        return isSourceClipRepresented(clip) ? [] : [clip];
      }),
    }))
    .filter((track) => track.clips.length > 0);

  updateSoundtrack(edit, items, processedItems);

  for (const item of items) {
    if (processedItems.has(item)) continue;
    const clip = applyEditorItemToClip(item);
    if (clip) edit.timeline.tracks.push({ clips: [clip] });
  }

  edit.output = {
    ...edit.output,
    format: "mp4",
    aspectRatio,
  };
  delete edit.output.size;
  return edit;
}
