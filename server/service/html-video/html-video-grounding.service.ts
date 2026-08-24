import {
  HTML_VIDEO_PIPELINE_VERSION,
  type HtmlVideoContentUnit,
  type HtmlVideoPipelineMetadata,
  type HtmlVideoSourceReference,
} from "../../interface/html-video-pipeline.interface";
import type { HtmlVideoDraftInput } from "./html-video-draft.service";
import { filterRepeatedReferenceGridItems } from "./html-video-reference-grid.service";

const MAX_CONTENT_UNITS = 24;
const MAX_CONTENT_UNIT_TEXT_LENGTH = 4_000;

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function splitContentUnitText(value: string) {
  let remaining = compact(value);
  if (!remaining) return [];
  const chunks: string[] = [];
  while (remaining.length > MAX_CONTENT_UNIT_TEXT_LENGTH) {
    const candidate = remaining.slice(0, MAX_CONTENT_UNIT_TEXT_LENGTH + 1);
    const sentenceBreak = Math.max(
      candidate.lastIndexOf(". "),
      candidate.lastIndexOf("! "),
      candidate.lastIndexOf("? "),
      candidate.lastIndexOf("; ")
    );
    const wordBreak = candidate.lastIndexOf(" ");
    const end = sentenceBreak >= Math.floor(MAX_CONTENT_UNIT_TEXT_LENGTH * 0.5)
      ? sentenceBreak + 1
      : wordBreak >= Math.floor(MAX_CONTENT_UNIT_TEXT_LENGTH * 0.5)
        ? wordBreak
        : MAX_CONTENT_UNIT_TEXT_LENGTH;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function boundedContentUnitText(value: string) {
  return splitContentUnitText(value)[0] || "";
}

function sourceText(input: HtmlVideoDraftInput) {
  return String(
    input.promptProvenance?.rawUserPrompt ||
    input.primaryPromptContext ||
    input.prompt ||
    ""
  ).trim();
}

function explicitSceneBlocks(value: string) {
  const matches = [...value.matchAll(
    /(?:^|\n)\s*(?:#{1,6}\s*)?SCENE\s+\d{1,3}\b[^\n]*\n?([\s\S]*?)(?=(?:\n\s*(?:#{1,6}\s*)?SCENE\s+\d{1,3}\b)|$)/gi
  )];
  return matches
    .map((match) => compact(`${match[0].split("\n")[0]} ${match[1] || ""}`))
    .filter(Boolean);
}

function explicitOrderedList(value: string) {
  const groups: string[][] = [];
  let current: string[] = [];
  for (const line of value.split(/\r?\n/)) {
    const match = /^\s*(\d{1,3})[.)]\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const order = Number(match[1]);
    const text = compact(match[2].replace(/\*\*/g, ""));
    if (order === 1) {
      if (current.length > 0) groups.push(current);
      current = text ? [text] : [];
    } else if (current.length > 0 && order === current.length + 1 && text) {
      current.push(text);
    }
  }
  if (current.length > 0) groups.push(current);
  const longest = groups.sort((left, right) => right.length - left.length)[0] || [];
  return longest.length >= 3 ? longest : [];
}

function inferredUnits(value: string) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => compact(line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")))
    .filter((line) => line.length >= 3);
  if (lines.length >= 2) return lines;
  return value
    .split(/(?<=[.!?])\s+/)
    .map(compact)
    .filter((item) => item.length >= 3);
}

type ExtractedReferenceUnit = {
  text: string;
  order: number;
  assetId?: string;
  confidence?: number;
  region?: HtmlVideoContentUnit["region"];
};

function referenceBlocks(value: string) {
  const matches = [...value.matchAll(
    /--- BEGIN REFERENCE: (.+?) \((?:image|document|video)\) ---([\s\S]*?)--- END REFERENCE: \1 ---/g
  )];
  return matches.length > 0
    ? matches.map((match) => ({ label: match[1].trim(), content: match[2] }))
    : [{ label: "", content: value }];
}

function sortReferenceUnitsByReadingOrder(units: ExtractedReferenceUnit[]) {
  const measured = units.filter((unit) => unit.region);
  if (measured.length < Math.max(2, Math.ceil(units.length * 0.65))) {
    return [...units].sort((left, right) => left.order - right.order);
  }
  const heights = measured.map((unit) => unit.region!.height).sort((left, right) => left - right);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 0.08;
  const rowTolerance = Math.max(0.018, medianHeight * 0.55);
  return [...units].sort((left, right) => {
    if (!left.region || !right.region) return left.order - right.order;
    const leftCenterY = left.region.y + left.region.height / 2;
    const rightCenterY = right.region.y + right.region.height / 2;
    if (Math.abs(leftCenterY - rightCenterY) <= rowTolerance) {
      return left.region.x - right.region.x;
    }
    return leftCenterY - rightCenterY;
  });
}

function normalizedRegion(value: unknown): HtmlVideoContentUnit["region"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  let x = Number(record.x ?? record.left);
  let y = Number(record.y ?? record.top);
  let width = Number(record.width);
  let height = Number(record.height);
  if (!Number.isFinite(width) && Number.isFinite(Number(record.right))) {
    width = Number(record.right) - x;
  }
  if (!Number.isFinite(height) && Number.isFinite(Number(record.bottom))) {
    height = Number(record.bottom) - y;
  }
  if (![x, y, width, height].every(Number.isFinite)) return undefined;
  if (Math.max(x, y, width, height) > 1) {
    x /= 100;
    y /= 100;
    width /= 100;
    height /= 100;
  }
  if (width <= 0 || height <= 0 || x < 0 || y < 0 || x >= 1 || y >= 1) return undefined;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    width: Math.max(0.001, Math.min(1 - x, width)),
    height: Math.max(0.001, Math.min(1 - y, height)),
    coordinateSpace: "normalized",
  };
}

function jsonObjects(value: string) {
  const objects: unknown[] = [];
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try {
          objects.push(JSON.parse(value.slice(start, index + 1)));
        } catch {
          // Ignore prose braces and continue looking for a structured OCR payload.
        }
        start = -1;
      }
    }
  }
  return objects;
}

function referenceUnitArray(value: unknown): unknown[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  for (const key of [
    "ordered_content_units",
    "orderedContentUnits",
    "ordered_items",
    "orderedItems",
    "content_units",
    "contentUnits",
  ]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  for (const nested of Object.values(record)) {
    const found = referenceUnitArray(nested);
    if (found.length > 0) return found;
  }
  return [];
}

function extractedReferenceUnits(
  value?: string,
  assets: HtmlVideoDraftInput["referenceAssets"] = []
): ExtractedReferenceUnit[] {
  if (!value?.trim()) return [];
  const extracted: ExtractedReferenceUnit[] = [];
  for (const block of referenceBlocks(value)) {
    const assetId = assets.find((asset) => asset.name === block.label)?.id;
    for (const object of jsonObjects(block.content)) {
      const items = referenceUnitArray(object);
      if (items.length < 2) continue;
      const units = items.slice(0, MAX_CONTENT_UNITS - extracted.length).map((item, index) => {
        if (typeof item === "string") {
          const text = compact(item);
          return text ? { text, order: index, ...(assetId ? { assetId } : {}) } : null;
        }
        if (!item || typeof item !== "object" || Array.isArray(item)) return null;
        const record = item as Record<string, unknown>;
        const text = compact(String(
          record.text ?? record.label ?? record.name ?? record.content ?? ""
        ));
        if (!text) return null;
        const rawOrder = Number(record.order ?? record.index ?? index + 1);
        const rawConfidence = Number(record.confidence);
        const region = normalizedRegion(
          record.bounding_box ?? record.boundingBox ?? record.bbox ?? record.region
        );
        return {
          text,
          order: Number.isFinite(rawOrder) ? rawOrder : index + 1,
          ...(assetId ? { assetId } : {}),
          ...(Number.isFinite(rawConfidence)
            ? { confidence: Math.max(0, Math.min(1, rawConfidence)) }
            : {}),
          ...(region ? { region } : {}),
        };
      }).filter((unit): unit is ExtractedReferenceUnit => Boolean(unit));
      const gridUnits = filterRepeatedReferenceGridItems(units, (unit) => unit.region);
      if (gridUnits.length >= 2) {
        extracted.push(...sortReferenceUnitsByReadingOrder(gridUnits));
        break;
      }
    }
    if (extracted.length >= MAX_CONTENT_UNITS) break;
  }
  return extracted.slice(0, MAX_CONTENT_UNITS).map((unit, index) => ({ ...unit, order: index }));
}

export function buildHtmlVideoGrounding(input: HtmlVideoDraftInput) {
  const currentText = sourceText(input);
  const existingPipeline = input.editSource?.pipeline;
  const promptProvenance = input.promptProvenance || {
    rawUserPrompt: currentText || input.prompt.trim(),
    ...(input.prompt !== currentText ? { masterPrompt: input.prompt.trim() } : {}),
  };
  const combinedSource = existingPipeline
    ? `${existingPipeline.sourceText}\n\nCURRENT EDIT REQUEST:\n${currentText}`
    : currentText;
  const authoritativeText = combinedSource.length <= 23_000
    ? combinedSource
    : `${combinedSource.slice(0, 19_000)}\n\n[PRIOR SOURCE BOUNDED]\n${combinedSource.slice(-3_900)}`;
  const sourceRefs: HtmlVideoSourceReference[] = [];
  if (existingPipeline) {
    sourceRefs.push({
      id: "source-existing-video",
      type: "history",
      label: "Existing video revision source",
    });
  }
  sourceRefs.push({
    id: "source-current-prompt",
    type: "prompt",
    label: existingPipeline ? "Current edit request" : "Current user prompt",
  });
  if (input.primaryPromptContext) {
    sourceRefs.push({
      id: "source-primary-prompt-file",
      type: "prompt_file",
      label: String(input.primaryPromptFileName || "prompt-day-du.txt").slice(0, 180),
    });
  }
  if (input.referenceContext) {
    sourceRefs.push({ id: "source-reference-context", type: "reference", label: "Attached reference context" });
  }
  for (const asset of input.referenceAssets || []) {
    sourceRefs.push({ id: `asset-${asset.id}`, type: "asset", label: asset.name });
  }

  const sceneCandidates = explicitSceneBlocks(currentText);
  const orderedCandidates = explicitOrderedList(currentText);
  const referenceCandidates = extractedReferenceUnits(input.referenceContext, input.referenceAssets);
  const candidateTexts = referenceCandidates.length > 0
    ? referenceCandidates.map((unit) => unit.text)
    : sceneCandidates.length > 0
      ? sceneCandidates
      : orderedCandidates.length > 0
        ? orderedCandidates
        : inferredUnits(currentText)
  ;
  const normalizedCandidates = candidateTexts
    .flatMap((text) => splitContentUnitText(text))
    .slice(0, MAX_CONTENT_UNITS);
  const fallback = compact(currentText || input.prompt);
  const inferredContentUnits: HtmlVideoContentUnit[] = (normalizedCandidates.length > 0
    ? normalizedCandidates
    : [fallback]
  ).map((text, index) => ({
    id: `unit-${index + 1}`,
    order: index,
    ...(referenceCandidates[index]?.assetId
      ? { assetId: referenceCandidates[index].assetId }
      : {}),
    sourceText: text,
    normalizedText: text,
    sourceRefs: [referenceCandidates.length > 0
      ? "source-reference-context"
      : input.primaryPromptContext
        ? "source-primary-prompt-file"
        : "source-current-prompt"],
    sourceKind: referenceCandidates.length > 0
      ? "image_ocr"
      : input.primaryPromptContext
        ? "document"
        : "prompt",
    ...(referenceCandidates[index]?.confidence !== undefined
      ? { confidence: referenceCandidates[index].confidence }
      : {}),
    ...(referenceCandidates[index]?.region
      ? { region: referenceCandidates[index].region }
      : {}),
    required: true,
    requiredVerbatim: referenceCandidates.length > 0
      || /(?:giữ nguyên|chính xác|verbatim|exact phrase)/i.test(text),
  }));
  const contentUnits: HtmlVideoContentUnit[] = existingPipeline?.contentUnits?.length
    ? existingPipeline.contentUnits.slice(0, MAX_CONTENT_UNITS).map((unit, index) => ({
        ...unit,
        order: index,
        sourceText: boundedContentUnitText(unit.sourceText),
        normalizedText: boundedContentUnitText(unit.normalizedText) || boundedContentUnitText(unit.sourceText),
        ...(unit.sourceText.length > MAX_CONTENT_UNIT_TEXT_LENGTH
          || unit.normalizedText.length > MAX_CONTENT_UNIT_TEXT_LENGTH
          ? { required: false, requiredVerbatim: false }
          : {}),
        sourceRefs: Array.from(new Set([...(unit.sourceRefs || []), "source-existing-video"])).slice(0, 8),
      }))
    : inferredContentUnits;

  return {
    version: HTML_VIDEO_PIPELINE_VERSION,
    sourceText: authoritativeText || input.prompt.trim(),
    promptProvenance,
    sourceContextRefs: sourceRefs,
    contentUnits,
  } satisfies Pick<HtmlVideoPipelineMetadata, "version" | "sourceText" | "promptProvenance" | "sourceContextRefs" | "contentUnits">;
}
