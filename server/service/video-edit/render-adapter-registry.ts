import type { VideoRenderAdapter } from "./render-adapter";

export type VideoRenderAdapterRegistryErrorCode =
  | "DUPLICATE_ADAPTER"
  | "ADAPTER_NOT_FOUND";

export class VideoRenderAdapterRegistryError extends Error {
  constructor(
    readonly code: VideoRenderAdapterRegistryErrorCode,
    message: string
  ) {
    super(message);
    this.name = "VideoRenderAdapterRegistryError";
  }
}

export class VideoRenderAdapterRegistry {
  private readonly adapters = new Map<string, VideoRenderAdapter>();

  register(adapter: VideoRenderAdapter) {
    if (this.adapters.has(adapter.id)) {
      throw new VideoRenderAdapterRegistryError(
        "DUPLICATE_ADAPTER",
        `Render adapter "${adapter.id}" is already registered.`
      );
    }
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string) {
    const adapter = this.adapters.get(id);
    if (!adapter) {
      throw new VideoRenderAdapterRegistryError(
        "ADAPTER_NOT_FOUND",
        `Render adapter "${id}" is not registered.`
      );
    }
    return adapter;
  }

  list() {
    return Array.from(this.adapters.values());
  }
}

export const videoRenderAdapterRegistry = new VideoRenderAdapterRegistry();
