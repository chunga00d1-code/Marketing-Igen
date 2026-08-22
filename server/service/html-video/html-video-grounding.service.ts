import {
  HTML_VIDEO_PIPELINE_VERSION,
  type HtmlVideoContentUnit,
  type HtmlVideoPipelineMetadata,
  type HtmlVideoSourceReference,
} from "../../interface/html-video-pipeline.interface";
import type { HtmlVideoDraftInput } from "./html-video-draft.service";

const MAX_CONTENT_UNITS = 24;

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sourceText(input: HtmlVideoDraftInput) {
  return String(input.primaryPromptContext || input.prompt || "").trim();
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

export function buildHtmlVideoGrounding(input: HtmlVideoDraftInput) {
  const currentText = sourceText(input);
  const existingPipeline = input.editSource?.pipeline;
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
  const normalizedCandidates = (sceneCandidates.length > 0
    ? sceneCandidates
    : orderedCandidates.length > 0
      ? orderedCandidates
      : inferredUnits(currentText)
  ).slice(0, MAX_CONTENT_UNITS);
  const fallback = compact(currentText || input.prompt);
  const inferredContentUnits: HtmlVideoContentUnit[] = (normalizedCandidates.length > 0
    ? normalizedCandidates
    : [fallback]
  ).map((text, index) => ({
    id: `unit-${index + 1}`,
    order: index,
    sourceText: text,
    normalizedText: text,
    sourceRefs: [input.primaryPromptContext ? "source-primary-prompt-file" : "source-current-prompt"],
    required: true,
    requiredVerbatim: /(?:giữ nguyên|chính xác|verbatim|exact phrase)/i.test(text),
  }));
  const contentUnits: HtmlVideoContentUnit[] = existingPipeline?.contentUnits?.length
    ? existingPipeline.contentUnits.slice(0, MAX_CONTENT_UNITS).map((unit, index) => ({
        ...unit,
        order: index,
        sourceRefs: Array.from(new Set([...(unit.sourceRefs || []), "source-existing-video"])).slice(0, 8),
      }))
    : inferredContentUnits;

  return {
    version: HTML_VIDEO_PIPELINE_VERSION,
    sourceText: authoritativeText || input.prompt.trim(),
    sourceContextRefs: sourceRefs,
    contentUnits,
  } satisfies Pick<HtmlVideoPipelineMetadata, "version" | "sourceText" | "sourceContextRefs" | "contentUnits">;
}