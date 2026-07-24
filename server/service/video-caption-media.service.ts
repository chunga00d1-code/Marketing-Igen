import { createHash } from "crypto";
import { promises as dns } from "dns";
import net from "net";
import { spawn } from "child_process";
import { VideoCaptionMetadata } from "../../shared/video-caption.contract";
import { VideoCaptionError } from "./video-caption-error";

const MAX_VIDEO_BYTES = 1_000_000_000;
const MAX_REDIRECTS = 3;
const HEAD_TIMEOUT_MS = 15_000;
const PROBE_TIMEOUT_MS = 45_000;
const MAX_VIDEO_DURATION_SECONDS = Math.max(
  30,
  Number(process.env.VIDEO_CAPTION_MAX_DURATION_SECONDS) || 1_800
);

type ProbeStream = {
  codec_type?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  duration?: string;
};

type ProbeResult = {
  streams?: ProbeStream[];
  format?: {
    duration?: string;
    size?: string;
    format_name?: string;
  };
};

function allowedHosts() {
  return [
    "res.cloudinary.com",
    ...(process.env.VIDEO_CAPTION_ALLOWED_MEDIA_HOSTS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  ];
}

function hostMatches(hostname: string, allowedHost: string) {
  return (
    hostname === allowedHost ||
    hostname.endsWith(`.${allowedHost}`)
  );
}

function isPrivateAddress(address: string) {
  if (net.isIPv4(address)) {
    const parts = address.split(".").map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0
    );
  }

  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  return true;
}

async function validatePublicMediaUrl(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new VideoCaptionError(
      "URL video không hợp lệ.",
      "INVALID_VIDEO_URL",
      "validation",
      false,
      400
    );
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    !allowedHosts().some((host) =>
      hostMatches(parsed.hostname.toLowerCase(), host)
    )
  ) {
    throw new VideoCaptionError(
      "Nguồn video chưa được phép. Hãy tải video lên hệ thống hoặc dùng miền media đã cấu hình.",
      "VIDEO_HOST_NOT_ALLOWED",
      "validation",
      false,
      400
    );
  }

  let resolved: Array<{ address: string }> = [];
  try {
    resolved = await dns.lookup(parsed.hostname, { all: true });
  } catch (error) {
    throw new VideoCaptionError(
      `Không thể phân giải miền video: ${
        error instanceof Error ? error.message : "DNS error"
      }`,
      "VIDEO_DNS_FAILED",
      "transient",
      true,
      502
    );
  }

  if (
    resolved.length === 0 ||
    resolved.some(({ address }) => isPrivateAddress(address))
  ) {
    throw new VideoCaptionError(
      "Nguồn video trỏ tới địa chỉ mạng không được phép.",
      "PRIVATE_VIDEO_ADDRESS",
      "validation",
      false,
      400
    );
  }

  return parsed;
}

async function inspectRemoteHeaders(rawUrl: string) {
  let currentUrl = rawUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await validatePublicMediaUrl(currentUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
    timeout.unref();

    try {
      const response = await fetch(currentUrl, {
        method: "HEAD",
        redirect: "manual",
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirectCount === MAX_REDIRECTS) {
          throw new VideoCaptionError(
            "Nguồn video chuyển hướng không hợp lệ hoặc quá nhiều lần.",
            "VIDEO_REDIRECT_REJECTED",
            "validation",
            false,
            400
          );
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!response.ok) {
        throw new VideoCaptionError(
          `Không thể truy cập video (HTTP ${response.status}).`,
          "VIDEO_NOT_REACHABLE",
          response.status >= 500 ? "transient" : "validation",
          response.status >= 500,
          response.status >= 500 ? 502 : 400
        );
      }

      const contentType = (
        response.headers.get("content-type") || ""
      ).toLowerCase();
      if (
        contentType &&
        !contentType.startsWith("video/") &&
        !contentType.includes("octet-stream")
      ) {
        throw new VideoCaptionError(
          `Nguồn đã chọn không phải video (${contentType}).`,
          "UNSUPPORTED_VIDEO_CONTENT_TYPE",
          "validation",
          false,
          400
        );
      }

      const contentLength = Number(
        response.headers.get("content-length") || 0
      );
      if (contentLength > MAX_VIDEO_BYTES) {
        throw new VideoCaptionError(
          "Video vượt quá giới hạn 1 GB.",
          "VIDEO_TOO_LARGE",
          "validation",
          false,
          400
        );
      }

      return {
        finalUrl: currentUrl,
        contentType: contentType || undefined,
        contentLength: contentLength || undefined,
        etag: response.headers.get("etag") || undefined,
        lastModified:
          response.headers.get("last-modified") || undefined,
      };
    } catch (error) {
      if (error instanceof VideoCaptionError) throw error;
      throw new VideoCaptionError(
        error instanceof Error && error.name === "AbortError"
          ? "Hết thời gian kiểm tra nguồn video."
          : `Không thể kiểm tra nguồn video: ${
              error instanceof Error ? error.message : "network error"
            }`,
        "VIDEO_HEAD_FAILED",
        "transient",
        true,
        502
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new VideoCaptionError(
    "Không thể xác minh nguồn video.",
    "VIDEO_VALIDATION_FAILED",
    "terminal",
    false,
    400
  );
}

function parseFrameRate(value?: string) {
  if (!value) return undefined;
  const [numerator, denominator] = value.split("/").map(Number);
  if (!Number.isFinite(numerator)) return undefined;
  if (!denominator || !Number.isFinite(denominator)) return numerator;
  return numerator / denominator;
}

function runFfprobe(videoUrl: string) {
  return new Promise<ProbeResult>((resolve, reject) => {
    const child = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_streams",
        "-show_format",
        videoUrl,
      ],
      { shell: false, windowsHide: true }
    );

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill();
      settled = true;
      reject(
        new VideoCaptionError(
          "Hết thời gian đọc thông tin video.",
          "FFPROBE_TIMEOUT",
          "transient",
          true,
          504
        )
      );
    }, PROBE_TIMEOUT_MS);
    timer.unref();

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new VideoCaptionError(
          error.code === "ENOENT"
            ? "Máy chủ chưa cài ffprobe để phân tích video."
            : `Không thể chạy ffprobe: ${error.message}`,
          "FFPROBE_UNAVAILABLE",
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
      if (code !== 0) {
        reject(
          new VideoCaptionError(
            `Không thể đọc metadata video: ${stderr.slice(-300)}`,
            "FFPROBE_FAILED",
            "provider",
            true,
            502
          )
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout) as ProbeResult);
      } catch {
        reject(
          new VideoCaptionError(
            "ffprobe trả về dữ liệu không hợp lệ.",
            "FFPROBE_INVALID_RESPONSE",
            "provider",
            true,
            502
          )
        );
      }
    });
  });
}

function buildCloudinaryProxyUrl(videoUrl: string) {
  const marker = "/upload/";
  if (!videoUrl.includes(marker)) return videoUrl;
  return videoUrl.replace(
    marker,
    `${marker}q_auto:eco,w_960,c_limit/`
  );
}

export const videoCaptionMediaService = {
  async inspect(videoUrl: string): Promise<{
    sourceUrl: string;
    fingerprint: string;
    metadata: VideoCaptionMetadata;
  }> {
    const remote = await inspectRemoteHeaders(videoUrl);
    const probe = await runFfprobe(remote.finalUrl);
    const videoStream = probe.streams?.find(
      (stream) => stream.codec_type === "video"
    );
    const audioStream = probe.streams?.find(
      (stream) => stream.codec_type === "audio"
    );

    if (!videoStream) {
      throw new VideoCaptionError(
        "Tệp không có luồng hình ảnh video.",
        "VIDEO_STREAM_MISSING",
        "validation",
        false,
        400
      );
    }

    const durationSeconds = Number(
      probe.format?.duration || videoStream.duration || 0
    );
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new VideoCaptionError(
        "Không xác định được thời lượng video.",
        "VIDEO_DURATION_MISSING",
        "validation",
        false,
        400
      );
    }
    if (durationSeconds > MAX_VIDEO_DURATION_SECONDS) {
      throw new VideoCaptionError(
        `Video vượt quá giới hạn ${Math.round(
          MAX_VIDEO_DURATION_SECONDS / 60
        )} phút cho mỗi dự án caption.`,
        "VIDEO_DURATION_LIMIT_EXCEEDED",
        "budget",
        false,
        422
      );
    }

    const fingerprint = createHash("sha256")
      .update(
        [
          remote.finalUrl,
          remote.etag || "",
          remote.lastModified || "",
          remote.contentLength || probe.format?.size || "",
          durationSeconds,
        ].join("|")
      )
      .digest("hex");

    return {
      sourceUrl: remote.finalUrl,
      fingerprint,
      metadata: {
        durationMs: Math.round(durationSeconds * 1000),
        width: videoStream.width,
        height: videoStream.height,
        fps: parseFrameRate(
          videoStream.avg_frame_rate || videoStream.r_frame_rate
        ),
        hasAudio: Boolean(audioStream),
        proxyUrl: buildCloudinaryProxyUrl(remote.finalUrl),
        contentType: remote.contentType,
        contentLength:
          remote.contentLength || Number(probe.format?.size || 0) || undefined,
      },
    };
  },
};
