import { existsSync } from "fs";
import path from "path";
import ffmpegStaticPath from "ffmpeg-static";

function remotionBinaryCandidates(binaryName: "ffmpeg" | "ffprobe") {
  const executable = process.platform === "win32" ? `${binaryName}.exe` : binaryName;
  const platformPackages =
    process.platform === "win32"
      ? ["@remotion/compositor-win32-x64-msvc"]
      : process.platform === "darwin"
        ? ["@remotion/compositor-darwin-x64", "@remotion/compositor-darwin-arm64"]
        : [
            "@remotion/compositor-linux-x64-gnu",
            "@remotion/compositor-linux-x64-musl",
            "@remotion/compositor-linux-arm64-gnu",
            "@remotion/compositor-linux-arm64-musl",
          ];

  return platformPackages.map((packageName) =>
    path.resolve(process.cwd(), "node_modules", ...packageName.split("/"), executable)
  );
}

function isUsableConfiguredBinary(configured: string) {
  const looksLikeCommandName = !configured.includes("/") && !configured.includes("\\");
  return looksLikeCommandName || existsSync(configured);
}

export function resolveMediaBinary(
  binaryName: "ffmpeg" | "ffprobe",
  configuredPath?: string
) {
  const configured = configuredPath?.trim();
  if (configured && isUsableConfiguredBinary(configured)) return configured;

  if (binaryName === "ffmpeg" && ffmpegStaticPath && existsSync(ffmpegStaticPath)) {
    return ffmpegStaticPath;
  }

  const bundled = remotionBinaryCandidates(binaryName).find((candidate) =>
    existsSync(candidate)
  );
  return bundled || binaryName;
}
