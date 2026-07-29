import { getRenderDimensions } from "../service/video-project-render-policy";

export function getVideoCompositionMetadata(blueprint: Record<string, unknown>) {
  const duration = Number(blueprint.duration);
  const durationInFrames = Number.isFinite(duration) && duration > 0
    ? Math.round(duration * 30)
    : 300;
  const aspectRatio = typeof blueprint.aspectRatio === "string" ? blueprint.aspectRatio : "16:9";
  const resolution = typeof blueprint.resolution === "string" ? blueprint.resolution : "720p";
  const { width, height } = getRenderDimensions(aspectRatio, resolution);

  return { durationInFrames, width, height };
}
