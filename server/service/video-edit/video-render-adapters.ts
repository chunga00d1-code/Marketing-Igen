import { hyperframesRenderAdapter } from "./hyperframes-render-adapter";
import { VideoRenderAdapterRegistry } from "./render-adapter-registry";

export function createDefaultVideoRenderAdapterRegistry() {
  const registry = new VideoRenderAdapterRegistry();
  registry.register(hyperframesRenderAdapter);
  return registry;
}

export const defaultVideoRenderAdapterRegistry =
  createDefaultVideoRenderAdapterRegistry();
