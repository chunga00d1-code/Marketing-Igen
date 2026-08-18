import { getRenderDimensions } from "../service/video-project-render-policy";

export function getVideoCompositionMetadata(blueprint: Record<string, unknown>) {
  const timeline = Array.isArray(blueprint.timeline) ? blueprint.timeline as Array<Record<string, unknown>> : [];
  const settings = blueprint.settings && typeof blueprint.settings === "object"
    ? blueprint.settings as Record<string, unknown>
    : undefined;
  const timelineEnd = timeline.reduce((max, item) => {
    const end = Number(item.end);
    return Number.isFinite(end) ? Math.max(max, end) : max;
  }, 0);
  const duration = Number(blueprint.duration) || Number(settings?.duration) || timelineEnd;
  const durationInFrames = Number.isFinite(duration) && duration > 0
    ? Math.round(duration * 30)
    : 300;
  const aspectRatio = typeof blueprint.aspectRatio === "string" ? blueprint.aspectRatio : "16:9";
  const resolution = typeof blueprint.resolution === "string" ? blueprint.resolution : "720p";
  const { width, height } = getRenderDimensions(aspectRatio, resolution);

  return { durationInFrames, width, height };
}
