import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import {
  VideoCaptionRenderProvider,
  VideoCaptionSegmentDto,
  VideoCaptionStyle,
} from "../../shared/video-caption.contract";
import { cloudinaryService } from "./cloudinary.service";
import { VideoCaptionError } from "./video-caption-error";

const RENDER_TIMEOUT_MS = 45 * 60 * 1000;
const PREVIEW_DURATION_SECONDS = 15;

function assTime(milliseconds: number) {
  const totalCentiseconds = Math.max(0, Math.round(milliseconds / 10));
  const hours = Math.floor(totalCentiseconds / 360_000);
  const minutes = Math.floor(
    (totalCentiseconds % 360_000) / 6_000
  );
  const seconds = Math.floor((totalCentiseconds % 6_000) / 100);
  const centiseconds = totalCentiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function assColor(hex: string, opacity = 1) {
  const normalized = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  const red = normalized.slice(0, 2);
  const green = normalized.slice(2, 4);
  const blue = normalized.slice(4, 6);
  const alpha = Math.round((1 - Math.max(0, Math.min(1, opacity))) * 255)
    .toString(16)
    .padStart(2, "0");
  return `&H${alpha}${blue}${green}${red}`.toUpperCase();
}

function escapeAssText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\r?\n/g, "\\N");
}

function alignment(
  lane: VideoCaptionSegmentDto["lane"],
  position: VideoCaptionStyle["position"],
  combined: boolean
) {
  if (lane === "context") return 8;
  if (combined && lane === "speech") return 2;
  if (position === "top") return 8;
  if (position === "center") return 5;
  return 2;
}

function buildAss(
  segments: VideoCaptionSegmentDto[],
  style: VideoCaptionStyle,
  width = 1920,
  height = 1080
) {
  const fontSize = Math.max(
    18,
    Math.round(style.fontSize * (width / 1920))
  );
  const marginV = Math.max(
    20,
    Math.round((height * style.safeAreaPercent) / 100)
  );
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${style.fontFamily || "DejaVu Sans"},${fontSize},${assColor(style.textColor)},${assColor(style.textColor)},${assColor(style.backgroundColor)},${assColor(style.backgroundColor, style.backgroundOpacity)},${style.fontWeight >= 600 ? -1 : 0},0,0,0,100,100,0,0,3,1,0,2,80,80,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const events = [...segments]
    .sort((a, b) => a.startMs - b.startMs || a.sortOrder - b.sortOrder)
    .map((segment) => {
      const combined =
        segments.some((item) => item.lane === "speech") &&
        segments.some((item) => item.lane === "context");
      const segmentStyle = {
        ...style,
        ...(segment.styleOverride || {}),
      };
      const tags = [
        `\\an${alignment(
          segment.lane,
          segmentStyle.position,
          combined
        )}`,
        `\\fs${Math.max(18, Math.round(segmentStyle.fontSize * (width / 1920)))}`,
        `\\c${assColor(segmentStyle.textColor)}`,
        `\\3c${assColor(
          segmentStyle.backgroundColor,
          segmentStyle.backgroundOpacity
        )}`,
      ].join("");
      return `Dialogue: 0,${assTime(segment.startMs)},${assTime(segment.endMs)},Caption,,0,0,0,,{${tags}}${escapeAssText(segment.text)}`;
    });
  return `${header}\n${events.join("\n")}\n`;
}

function escapeFilterPath(filePath: string) {
  return filePath
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      shell: false,
      windowsHide: true,
    });
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(
        new VideoCaptionError(
          "Kết xuất caption vượt quá thời gian cho phép.",
          "CAPTION_RENDER_TIMEOUT",
          "transient",
          true,
          504
        )
      );
    }, RENDER_TIMEOUT_MS);
    timer.unref();

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-4000);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new VideoCaptionError(
          error.code === "ENOENT"
            ? "Máy chủ chưa cài ffmpeg để kết xuất caption."
            : `Không thể chạy ffmpeg: ${error.message}`,
          "FFMPEG_UNAVAILABLE",
          "provider",
          false,
          503
        )
      );
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(
          new VideoCaptionError(
            `Kết xuất caption thất bại: ${stderr.slice(-800)}`,
            "CAPTION_RENDER_FAILED",
            "provider",
            true,
            502
          )
        );
      }
    });
  });
}

class FfmpegVideoCaptionRenderProvider
  implements VideoCaptionRenderProvider
{
  readonly name = "ffmpeg-ass";

  constructor(
    private readonly width?: number,
    private readonly height?: number
  ) {}

  async render(input: {
    videoUrl: string;
    segments: VideoCaptionSegmentDto[];
    style: VideoCaptionStyle;
    preview: boolean;
    idempotencyKey: string;
  }) {
    const tempDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "video-caption-")
    );
    const subtitlePath = path.join(tempDirectory, "captions.ass");
    const outputPath = path.join(tempDirectory, "captioned.mp4");

    try {
      await fs.writeFile(
        subtitlePath,
        buildAss(
          input.segments,
          input.style,
          this.width,
          this.height
        ),
        "utf8"
      );
      const args = [
        "-y",
        "-i",
        input.videoUrl,
        ...(input.preview
          ? ["-t", String(PREVIEW_DURATION_SECONDS)]
          : []),
        "-vf",
        `ass='${escapeFilterPath(subtitlePath)}'`,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        input.preview ? "veryfast" : "fast",
        "-crf",
        input.preview ? "26" : "21",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        outputPath,
      ];
      await runFfmpeg(args);
      const outputUrl = await cloudinaryService.uploadMedia(
        outputPath,
        input.preview
          ? "igen_erp/video-captions/previews"
          : "igen_erp/video-captions/final"
      );
      return {
        outputUrl,
        providerRequestId: input.idempotencyKey,
        cost: undefined,
      };
    } finally {
      await fs.rm(tempDirectory, {
        recursive: true,
        force: true,
      });
    }
  }
}

export function createVideoCaptionRenderProvider(
  width?: number,
  height?: number
) {
  return new FfmpegVideoCaptionRenderProvider(width, height);
}
