import { VideoCaptionSegmentDto } from "../../shared/video-caption.contract";

export type VideoCaptionSubtitleFormat = "srt" | "vtt";

function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

function timestamp(milliseconds: number, format: VideoCaptionSubtitleFormat) {
  const safe = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const millis = safe % 1000;
  const separator = format === "srt" ? "," : ".";
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${separator}${pad(millis, 3)}`;
}

export function serializeVideoCaptionSubtitles(
  segments: VideoCaptionSegmentDto[],
  format: VideoCaptionSubtitleFormat
) {
  const ordered = [...segments]
    .filter((segment) => segment.text.trim())
    .sort((a, b) => a.startMs - b.startMs || a.sortOrder - b.sortOrder);
  const cues = ordered.map((segment, index) => {
    const timing = `${timestamp(segment.startMs, format)} --> ${timestamp(segment.endMs, format)}`;
    return `${format === "srt" ? `${index + 1}\n` : ""}${timing}\n${segment.text.trim()}`;
  });
  return `${format === "vtt" ? "WEBVTT\n\n" : ""}${cues.join("\n\n")}\n`;
}
