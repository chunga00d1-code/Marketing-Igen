export type VideoProjectRenderAspectRatio = "9:16" | "16:9" | "1:1" | "3:4";
export type VideoProjectRenderResolution = "720p" | "1080p";
export type VideoProjectRenderStatus = "queued" | "rendering" | "uploading" | "completed" | "failed";

type ProjectSnapshot = Record<string, unknown>;
type ProjectItem = Record<string, unknown>;

const RENDER_DIMENSIONS: Record<
  VideoProjectRenderAspectRatio,
  Record<VideoProjectRenderResolution, { width: number; height: number }>
> = {
  "9:16": {
    "720p": { width: 720, height: 1280 },
    "1080p": { width: 1080, height: 1920 },
  },
  "16:9": {
    "720p": { width: 1280, height: 720 },
    "1080p": { width: 1920, height: 1080 },
  },
  "1:1": {
    "720p": { width: 720, height: 720 },
    "1080p": { width: 1080, height: 1080 },
  },
  "3:4": {
    "720p": { width: 720, height: 960 },
    "1080p": { width: 1080, height: 1440 },
  },
};

const ALLOWED_TRANSITIONS: Record<Exclude<VideoProjectRenderStatus, "completed" | "failed">, VideoProjectRenderStatus[]> = {
  queued: ["rendering", "failed"],
  rendering: ["uploading", "failed"],
  uploading: ["completed", "failed"],
};

function asProjectSnapshot(value: unknown): ProjectSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Render project snapshot must be an object.");
  }
  return value as ProjectSnapshot;
}

function asProjectItem(value: unknown): ProjectItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Render timeline items must be objects.");
  }
  return value as ProjectItem;
}

function isHttpsUrl(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function getRenderDimensions(aspectRatio: string, resolution: string) {
  if (resolution !== "720p" && resolution !== "1080p") {
    throw new Error("Render resolution must be 720p or 1080p.");
  }
  if (!(aspectRatio in RENDER_DIMENSIONS)) {
    throw new Error("Unsupported render aspect ratio.");
  }
  return RENDER_DIMENSIONS[aspectRatio as VideoProjectRenderAspectRatio][resolution];
}

export function assertRenderableProject(snapshot: unknown): void {
  const project = asProjectSnapshot(snapshot);
  if (!Array.isArray(project.items) || project.items.length === 0) {
    throw new Error("Render project timeline cannot be empty.");
  }

  for (const rawItem of project.items) {
    const item = asProjectItem(rawItem);
    if (["video", "image", "audio"].includes(String(item.type)) && !isHttpsUrl(item.sourceUrl)) {
      throw new Error("Render media sourceUrl must use HTTPS.");
    }
  }
}

export function editorProjectToBlueprint(snapshot: unknown): Record<string, unknown> {
  assertRenderableProject(snapshot);
  const project = asProjectSnapshot(snapshot);
  const items = project.items as unknown[];
  const timeline = items.map((rawItem) => {
    const item = asProjectItem(rawItem);
    const { sourceUrl, duration, ...itemFields } = item;
    const start = Number(item.start);
    const mappedItem: ProjectItem = {
      ...itemFields,
      start,
      end: start + Number(duration),
    };

    if (sourceUrl !== undefined) mappedItem.src = sourceUrl;
    if (item.type === "text" && item.text !== undefined && mappedItem.content === undefined) {
      mappedItem.content = item.text;
    }
    return mappedItem;
  });

  return {
    duration: project.duration,
    aspectRatio: project.aspectRatio,
    timeline,
  };
}

export function assertRenderTransition(from: VideoProjectRenderStatus, to: VideoProjectRenderStatus): void {
  if (from === "completed" || from === "failed") {
    throw new Error("Terminal render states cannot transition.");
  }
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error(`Render transition from ${from} to ${to} is not allowed.`);
  }
}

export function nextRenderProgress(current: number, requested: number): number {
  return Math.max(clampProgress(current), clampProgress(requested));
}
