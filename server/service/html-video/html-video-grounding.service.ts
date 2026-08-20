import {
  HTML_VIDEO_PIPELINE_VERSION,
  type HtmlVideoContentUnit,
  type HtmlVideoPipelineMetadata,
  type HtmlVideoSourceReference,
} from "../../interface/html-video-pipeline.interface";
import type { HtmlVideoDraftInput } from "./html-video-draft.service";

const MAX_CONTENT_UNITS = 12;

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
  const authoritativeText = sourceText(input);
  const sourceRefs: HtmlVideoSourceReference[] = [
    {
      id: "source-current-prompt",
      type: "prompt",
      label: "Current user prompt",
    },
  ];
  if (input.primaryPromptContext) {
    sourceRefs.push({
      id: "source-primary-prompt-file",
      type: "prompt_file",
      label: String(input.primaryPromptFileName || "prompt-day-du.txt").slice(0, 180),
    });
  }
  if (input.referenceContext) {
    sourceRefs.push({
      id: "source-reference-context",
      type: "reference",
      label: "Attached reference context",
    });
  }
  for (const asset of input.referenceAssets || []) {
    sourceRefs.push({
      id: `asset-${asset.id}`,
      type: "asset",
      label: asset.name,
    });
  }

  const candidates = explicitSceneBlocks(authoritativeText);
  const normalizedCandidates = (candidates.length > 0
    ? candidates
    : inferredUnits(authoritativeText)
  ).slice(0, MAX_CONTENT_UNITS);
  const fallback = compact(authoritativeText || input.prompt);
  const contentUnits: HtmlVideoContentUnit[] = (normalizedCandidates.length > 0
    ? normalizedCandidates
    : [fallback]
  ).map((text, index) => ({
    id: `unit-${index + 1}`,
    order: index,
    sourceText: text,
    normalizedText: text,
    sourceRefs: [
      input.primaryPromptContext
        ? "source-primary-prompt-file"
        : "source-current-prompt",
    ],
    required: true,
    requiredVerbatim: /(?:giữ nguyên|chính xác|verbatim|exact phrase)/i.test(text),
  }));

  return {
    version: HTML_VIDEO_PIPELINE_VERSION,
    sourceText: authoritativeText || input.prompt.trim(),
    sourceContextRefs: sourceRefs,
    contentUnits,
  } satisfies Pick<
    HtmlVideoPipelineMetadata,
    "version" | "sourceText" | "sourceContextRefs" | "contentUnits"
  >;
}
