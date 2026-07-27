import { existsSync } from "fs";
import path from "path";

function remotionBinaryCandidates(binaryName: "ffmpeg" | "ffprobe") {
  const executable = process.platform === "win32" ? `${binaryName}.exe` : binaryName;
  const platformPackages =
    process.platform === "win32"
      ? ["@remotion/compositor-win32-x64-msvc"]
      : process.platform === "darwin"
        ? ["@remotion/compositor-darwin-x64", "@remotion/compositor-darwin-arm64"]
        : ["@remotion/compositor-linux-x64-gnu", "@remotion/compositor-linux-arm64-gnu"];

  return platformPackages.map((packageName) =>
    path.resolve(process.cwd(), "node_modules", ...packageName.split("/"), executable)
  );
}

export function resolveMediaBinary(
  binaryName: "ffmpeg" | "ffprobe",
  configuredPath?: string
) {
  const configured = configuredPath?.trim();
  if (configured) return configured;

  const bundled = remotionBinaryCandidates(binaryName).find((candidate) =>
    existsSync(candidate)
  );
  return bundled || binaryName;
}
