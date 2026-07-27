type QualityWord = {
  text: string;
  startMs: number;
  endMs: number;
};

function normalizeWord(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("vi-VN")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function percentile(values: number[], rank: number) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * rank) - 1)
  );
  return sorted[index];
}

export function scoreSpeechWordTimings(
  referenceWords: QualityWord[],
  candidateWords: QualityWord[],
  toleranceMs = 150
) {
  const reference = referenceWords
    .map((word) => ({ ...word, key: normalizeWord(word.text) }))
    .filter((word) => word.key && word.endMs > word.startMs);
  const candidate = candidateWords
    .map((word) => ({ ...word, key: normalizeWord(word.text) }))
    .filter((word) => word.key && word.endMs > word.startMs);

  let candidateIndex = 0;
  let matchedWordCount = 0;
  let startWithinToleranceCount = 0;
  let endWithinToleranceCount = 0;
  const absoluteErrors: number[] = [];

  for (const expected of reference) {
    let matchIndex = -1;
    for (
      let index = candidateIndex;
      index < Math.min(candidate.length, candidateIndex + 4);
      index += 1
    ) {
      if (candidate[index].key === expected.key) {
        matchIndex = index;
        break;
      }
    }
    if (matchIndex < 0) continue;

    const actual = candidate[matchIndex];
    candidateIndex = matchIndex + 1;
    matchedWordCount += 1;
    const startErrorMs = Math.abs(actual.startMs - expected.startMs);
    const endErrorMs = Math.abs(actual.endMs - expected.endMs);
    absoluteErrors.push(startErrorMs, endErrorMs);
    if (startErrorMs <= toleranceMs) startWithinToleranceCount += 1;
    if (endErrorMs <= toleranceMs) endWithinToleranceCount += 1;
  }

  const referenceWordCount = reference.length;
  return {
    referenceWordCount,
    candidateWordCount: candidate.length,
    matchedWordCount,
    wordCoverageRatio: referenceWordCount
      ? matchedWordCount / referenceWordCount
      : 0,
    startWithinToleranceRatio: matchedWordCount
      ? startWithinToleranceCount / matchedWordCount
      : 0,
    endWithinToleranceRatio: matchedWordCount
      ? endWithinToleranceCount / matchedWordCount
      : 0,
    timingAccuracyRatio: matchedWordCount
      ? (startWithinToleranceCount + endWithinToleranceCount) /
        (matchedWordCount * 2)
      : 0,
    medianAbsoluteErrorMs: percentile(absoluteErrors, 0.5),
    p95AbsoluteErrorMs: percentile(absoluteErrors, 0.95),
    toleranceMs,
  };
}
