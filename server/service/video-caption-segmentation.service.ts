import {
  VideoCaptionSegmentDto,
} from "../../shared/video-caption.contract";

type TimedWord = {
  text: string;
  startMs: number;
  endMs: number;
  confidence?: number;
};

const MAX_SEGMENT_DURATION_MS = 5_500;
const TARGET_SEGMENT_DURATION_MS = 3_200;
const MAX_CHARACTERS = 72;
const SENTENCE_END = /[.!?…]$/u;
const CLAUSE_END = /[,;:]$/u;

function joinWords(words: TimedWord[]) {
  return words
    .map((word) => word.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([,.;:!?…])/gu, "$1")
    .replace(/\(\s+/gu, "(")
    .replace(/\s+\)/gu, ")")
    .trim();
}

function averageConfidence(words: TimedWord[]) {
  const values = words
    .map((word) => word.confidence)
    .filter((value): value is number => typeof value === "number");
  if (!values.length) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function shouldBreak(current: TimedWord[], next?: TimedWord) {
  if (!current.length) return false;
  const text = joinWords(current);
  const durationMs =
    current[current.length - 1].endMs - current[0].startMs;
  const lastText = current[current.length - 1].text;
  const silenceAfterMs = next
    ? next.startMs - current[current.length - 1].endMs
    : Number.POSITIVE_INFINITY;

  if (!next) return true;
  if (durationMs >= MAX_SEGMENT_DURATION_MS) return true;
  if (text.length >= MAX_CHARACTERS) return true;
  if (silenceAfterMs >= 650) return true;
  if (
    durationMs >= 1_200 &&
    SENTENCE_END.test(lastText)
  ) {
    return true;
  }
  return durationMs >= TARGET_SEGMENT_DURATION_MS && CLAUSE_END.test(lastText);
}

export function buildSpeechCaptionSegments(
  words: TimedWord[],
  durationMs?: number
): Array<
  Omit<
    VideoCaptionSegmentDto,
    "id" | "projectId" | "version" | "createdAt" | "updatedAt"
  >
> {
  const normalized = words
    .filter(
      (word) =>
        word.text.trim() &&
        Number.isFinite(word.startMs) &&
        Number.isFinite(word.endMs) &&
        word.endMs > word.startMs
    )
    .map((word) => ({
      ...word,
      text: word.text.trim(),
      startMs: Math.max(0, Math.round(word.startMs)),
      endMs: durationMs
        ? Math.min(durationMs, Math.round(word.endMs))
        : Math.round(word.endMs),
    }))
    .sort((a, b) => a.startMs - b.startMs);

  const groups: TimedWord[][] = [];
  let current: TimedWord[] = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const word = normalized[index];
    current.push(word);
    if (shouldBreak(current, normalized[index + 1])) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);

  return groups
    .map((group, index) => ({
      lane: "speech" as const,
      startMs: group[0].startMs,
      endMs: Math.max(
        group[0].startMs + 250,
        group[group.length - 1].endMs
      ),
      text: joinWords(group),
      confidence: averageConfidence(group),
      sourceReferences: [
        {
          kind: "speech" as const,
          excerpt: joinWords(group).slice(0, 500),
        },
      ],
      lockedByUser: false,
      sortOrder: index,
    }))
    .filter((segment) => segment.text);
}
