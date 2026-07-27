import {
  VideoCaptionSegmentDto,
} from "../../shared/video-caption.contract";

type TimedWord = {
  text: string;
  startMs: number;
  endMs: number;
  confidence?: number;
};

type SpeechPause = {
  startMs: number;
  endMs: number;
  durationMs: number;
};

const SAFE_TIMEBASE_DRIFT_RATIO = 0.05;
const MIN_VISIBLE_DURATION_MS = 700;
const MAX_SEGMENT_DURATION_MS = 6_000;
const MAX_CHARACTERS = 84;
const MIN_SILENCE_BREAK_MS = 550;
const SEGMENT_GAP_MS = 80;
const MIN_STANDALONE_CHARACTERS = 14;
const MAX_MERGED_CHARACTERS = 96;
const MAX_MERGED_DURATION_MS = 6_500;
const HARD_SENTENCE_END = /[!?…]$/u;
const SOFT_SENTENCE_END = /[.]$/u;
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

/**
 * Reconcile provider timestamps with the inspected video timeline.
 *
 * Providers report timestamps against the audio they decoded. Small
 * container/probe differences (for example 19.00s vs 19.16s) are safe to
 * correct linearly. A large difference is deliberately left untouched:
 * stretching a 1.5s audio track over an 89s video would make captions appear
 * valid while actually hiding a broken media stream.
 */
export function normalizeSpeechWordTimeline(
  words: TimedWord[],
  targetDurationMs?: number,
  providerDurationMs?: number,
  providerOffsetMs = 0
) {
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
      endMs: Math.max(1, Math.round(word.endMs)),
    }))
    .sort((a, b) => a.startMs - b.startMs)
    .map((word, index, sorted) => {
      const previousEndMs = index > 0 ? sorted[index - 1].endMs : 0;
      const startMs = Math.max(word.startMs, previousEndMs);
      return {
        ...word,
        startMs,
        endMs: Math.max(startMs + 1, word.endMs),
      };
    });

  if (
    !normalized.length ||
    !Number.isFinite(targetDurationMs) ||
    !Number.isFinite(providerDurationMs) ||
    (providerDurationMs || 0) <= 0 ||
    (targetDurationMs || 0) <= 0
  ) {
    return {
      words: normalized,
      applied: false,
      scale: 1,
      driftRatio: undefined,
      offsetMs: providerOffsetMs,
    };
  }

  const target = targetDurationMs as number;
  const provider = providerDurationMs as number;
  const targetAudioDuration = Math.max(1, target - providerOffsetMs);
  const scale = targetAudioDuration / provider;
  const driftRatio = Math.abs(scale - 1);
  if (driftRatio > SAFE_TIMEBASE_DRIFT_RATIO) {
    return { words: normalized, applied: false, scale: 1, driftRatio };
  }

  return {
    words: normalized.map((word) => {
      const startMs = Math.max(
        0,
        Math.min(
          target,
          Math.round(word.startMs * scale + providerOffsetMs)
        )
      );
      return {
        ...word,
        startMs,
        endMs: Math.min(
          target,
          Math.max(
            startMs + 1,
            Math.round(word.endMs * scale + providerOffsetMs)
          )
        ),
      };
    }),
    applied: driftRatio > 0.005,
    scale,
    driftRatio,
    offsetMs: providerOffsetMs,
  };
}

export function measureSpeechTimelineQuality(
  words: TimedWord[],
  durationMs?: number
) {
  const sorted = [...words].sort((a, b) => a.startMs - b.startMs);
  let overlapCount = 0;
  let outOfBoundsCount = 0;
  let previousEndMs = 0;

  for (const word of sorted) {
    if (word.startMs < previousEndMs) overlapCount += 1;
    if (
      (durationMs !== undefined &&
        (word.startMs < 0 || word.endMs > durationMs)) ||
      word.endMs <= word.startMs
    ) {
      outOfBoundsCount += 1;
    }
    previousEndMs = Math.max(previousEndMs, word.endMs);
  }

  const validWordCount = sorted.filter(
    (word) =>
      word.endMs > word.startMs &&
      (durationMs === undefined || word.startMs >= 0) &&
      (durationMs === undefined || word.endMs <= durationMs)
  ).length;

  return {
    wordCount: sorted.length,
    validWordCount,
    overlapCount,
    outOfBoundsCount,
    coverageRatio: sorted.length ? validWordCount / sorted.length : 0,
    firstWordStartMs: sorted[0]?.startMs,
    lastWordEndMs: sorted[sorted.length - 1]?.endMs,
  };
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
  if (
    silenceAfterMs >= MIN_SILENCE_BREAK_MS &&
    durationMs >= MIN_VISIBLE_DURATION_MS &&
    (text.length >= 24 ||
      HARD_SENTENCE_END.test(lastText) ||
      SOFT_SENTENCE_END.test(lastText))
  ) {
    return true;
  }
  if (durationMs >= MIN_VISIBLE_DURATION_MS && HARD_SENTENCE_END.test(lastText)) {
    return true;
  }
  if (
    SOFT_SENTENCE_END.test(lastText) &&
    (durationMs >= 3_200 || text.length >= 30)
  ) {
    return true;
  }
  return (
    CLAUSE_END.test(lastText) &&
    durationMs >= 1_000 &&
    text.length >= 42
  );
}

function mergeOrphanGroups(groups: TimedWord[][]) {
  const merged: TimedWord[][] = [];
  const canMerge = (left: TimedWord[], right: TimedWord[]) => {
    const combined = [...left, ...right];
    const durationMs =
      combined[combined.length - 1].endMs - combined[0].startMs;
    return (
      joinWords(combined).length <= MAX_MERGED_CHARACTERS &&
      durationMs <= MAX_MERGED_DURATION_MS
    );
  };
  const isOrphan = (group: TimedWord[]) => {
    const durationMs =
      group[group.length - 1].endMs - group[0].startMs;
    return (
      (joinWords(group).length < MIN_STANDALONE_CHARACTERS &&
        group.length <= 2) ||
      durationMs < MIN_VISIBLE_DURATION_MS
    );
  };

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (!isOrphan(group)) {
      merged.push(group);
      continue;
    }

    const previous = merged[merged.length - 1];
    if (previous && canMerge(previous, group)) {
      previous.push(...group);
      continue;
    }

    const next = groups[index + 1];
    if (next && canMerge(group, next)) {
      groups[index + 1] = [...group, ...next];
      continue;
    }

    merged.push(group);
  }

  return merged;
}

function rebalanceSentenceFragments(groups: TimedWord[][]) {
  const rebalanced = groups.map((group) => [...group]);
  const terminalEnd = /[.!?…]$/u;

  for (let index = 1; index < rebalanced.length; index += 1) {
    const previous = rebalanced[index - 1];
    const current = rebalanced[index];
    if (
      !previous.length ||
      !current.length ||
      terminalEnd.test(previous[previous.length - 1].text)
    ) {
      continue;
    }

    const fragmentEndIndex = current.findIndex((word) =>
      terminalEnd.test(word.text)
    );
    if (fragmentEndIndex < 0 || fragmentEndIndex > 3) continue;
    const fragment = current.slice(0, fragmentEndIndex + 1);
    const combined = [...previous, ...fragment];
    const combinedDurationMs =
      combined[combined.length - 1].endMs - combined[0].startMs;
    if (
      joinWords(fragment).length > 24 ||
      joinWords(combined).length > MAX_MERGED_CHARACTERS ||
      combinedDurationMs > MAX_MERGED_DURATION_MS
    ) {
      continue;
    }

    previous.push(...fragment);
    rebalanced[index] = current.slice(fragmentEndIndex + 1);
  }

  return rebalanced.filter((group) => group.length);
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
    .sort((a, b) => a.startMs - b.startMs)
    .map((word, index, sorted) => {
      const previousEndMs = index > 0 ? sorted[index - 1].endMs : 0;
      const startMs = Math.max(word.startMs, previousEndMs);
      return {
        ...word,
        startMs,
        endMs: Math.max(startMs + 1, word.endMs),
      };
    });

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

  return rebalanceSentenceFragments(mergeOrphanGroups(groups))
    .map((group, index) => {
      const startMs = group[0].startMs;
      const naturalEndMs = group[group.length - 1].endMs;
      const nextStartMs = groups[index + 1]?.[0].startMs;
      const desiredEndMs = Math.max(
        naturalEndMs,
        startMs + MIN_VISIBLE_DURATION_MS
      );
      const safeEndCapMs =
        nextStartMs === undefined
          ? durationMs || desiredEndMs
          : Math.max(naturalEndMs, nextStartMs - SEGMENT_GAP_MS);
      const endMs = Math.max(
        naturalEndMs,
        Math.min(desiredEndMs, safeEndCapMs)
      );
      const text = joinWords(group);
      return {
        lane: "speech" as const,
        startMs,
        endMs,
        text,
        confidence: averageConfidence(group),
        sourceReferences: [
          {
            kind: "speech" as const,
            excerpt: text.slice(0, 500),
          },
        ],
        lockedByUser: false,
        sortOrder: index,
      };
    })
    .filter((segment) => segment.text);
}

/**
 * Word timestamps from Whisper can drift locally, especially when a phrase is
 * repeated. Caption groups still have the correct order, so their cumulative
 * text weight provides a stable rough position. Snap those rough boundaries
 * to real silence ends from the decoded audio to keep caption changes aligned
 * with the speaker without inventing per-word timings.
 */
export function alignSpeechCaptionSegmentsToAudioPauses<
  T extends { startMs: number; endMs: number; text: string },
>(segments: T[], pauses: SpeechPause[], durationMs: number) {
  if (segments.length <= 1 || durationMs <= 0 || !pauses.length) {
    return {
      segments,
      boundaryCount: Math.max(0, segments.length - 1),
      pauseSnappedBoundaryCount: 0,
      pauseBoundaryCoverageRatio: segments.length <= 1 ? 1 : 0,
      initialSpeechStartMs: segments[0]?.startMs,
    };
  }

  const aligned = segments.map((segment) => ({ ...segment }));
  const initialPause = pauses.find(
    (pause) =>
      pause.startMs <= 50 &&
      pause.endMs > 0 &&
      pause.endMs <= 1_500
  );
  const initialSpeechStartMs = initialPause?.endMs ?? aligned[0].startMs;
  aligned[0].startMs = Math.max(
    aligned[0].startMs,
    initialSpeechStartMs
  );

  const weights = aligned.map((segment) =>
    Math.max(
      1,
      Array.from(
        segment.text
          .normalize("NFC")
          .replace(/[\s\p{P}\p{S}]+/gu, "")
      ).length
    )
  );
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const boundaryCount = aligned.length - 1;
  const maxSnapDistanceMs = Math.min(
    1_800,
    Math.max(750, Math.round(durationMs * 0.025))
  );
  const minimumSegmentDurationMs = MIN_VISIBLE_DURATION_MS;
  const usablePauseEnds = pauses
    .filter(
      (pause) =>
        pause.durationMs >= 80 &&
        pause.endMs > initialSpeechStartMs + minimumSegmentDurationMs &&
        pause.endMs < durationMs - minimumSegmentDurationMs
    )
    .map((pause) => pause.endMs)
    .sort((left, right) => left - right);

  let cumulativeWeight = 0;
  let previousBoundaryMs = initialSpeechStartMs;
  let pauseSnappedBoundaryCount = 0;
  for (let index = 0; index < boundaryCount; index += 1) {
    cumulativeWeight += weights[index];
    const remainingSegmentCount = aligned.length - index - 1;
    const expectedBoundaryMs =
      initialSpeechStartMs +
      ((durationMs - initialSpeechStartMs) * cumulativeWeight) /
        totalWeight;
    const minimumBoundaryMs =
      previousBoundaryMs + minimumSegmentDurationMs;
    const maximumBoundaryMs =
      durationMs -
      remainingSegmentCount * minimumSegmentDurationMs;
    const nearestPauseEndMs = usablePauseEnds
      .filter(
        (pauseEndMs) =>
          pauseEndMs >= minimumBoundaryMs &&
          pauseEndMs <= maximumBoundaryMs
      )
      .reduce<number | undefined>((nearest, pauseEndMs) => {
        if (nearest === undefined) return pauseEndMs;
        return Math.abs(pauseEndMs - expectedBoundaryMs) <
          Math.abs(nearest - expectedBoundaryMs)
          ? pauseEndMs
          : nearest;
      }, undefined);
    const existingBoundaryMs = Math.max(
      minimumBoundaryMs,
      Math.min(maximumBoundaryMs, aligned[index + 1].startMs)
    );
    const boundaryMs =
      nearestPauseEndMs !== undefined &&
      Math.abs(nearestPauseEndMs - expectedBoundaryMs) <=
        maxSnapDistanceMs
        ? nearestPauseEndMs
        : existingBoundaryMs;
    if (boundaryMs === nearestPauseEndMs) {
      pauseSnappedBoundaryCount += 1;
    }
    aligned[index].endMs = boundaryMs;
    aligned[index + 1].startMs = boundaryMs;
    previousBoundaryMs = boundaryMs;
  }

  aligned[aligned.length - 1].endMs = Math.max(
    aligned[aligned.length - 1].startMs + 1,
    Math.min(durationMs, aligned[aligned.length - 1].endMs)
  );
  return {
    segments: aligned,
    boundaryCount,
    pauseSnappedBoundaryCount,
    pauseBoundaryCoverageRatio:
      boundaryCount > 0
        ? pauseSnappedBoundaryCount / boundaryCount
        : 1,
    initialSpeechStartMs,
  };
}
