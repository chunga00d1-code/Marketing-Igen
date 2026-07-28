import { promises as fs } from "fs";
import { scoreSpeechWordTimings } from "../server/service/video-caption-quality.service";

type BenchmarkInput = {
  referenceWords: Array<{ text: string; startMs: number; endMs: number }>;
  candidateWords: Array<{ text: string; startMs: number; endMs: number }>;
  toleranceMs?: number;
};

const inputPath = process.argv[2];
if (!inputPath) {
  throw new Error(
    "Usage: npx tsx scripts/video-caption-benchmark.ts <benchmark.json>"
  );
}

const input = JSON.parse(
  await fs.readFile(inputPath, "utf8")
) as BenchmarkInput;
const result = scoreSpeechWordTimings(
  input.referenceWords,
  input.candidateWords,
  input.toleranceMs
);

console.log(JSON.stringify(result, null, 2));
