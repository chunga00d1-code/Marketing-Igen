import assert from "node:assert/strict";
import test from "node:test";
import type { VideoRenderAdapter } from "../render-adapter";
import {
  VideoRenderAdapterRegistry,
  VideoRenderAdapterRegistryError,
} from "../render-adapter-registry";

function createAdapter(id: string): VideoRenderAdapter {
  return {
    id,
    checkCapability: async () => ({ available: true }),
    validateInput: () => undefined,
    render: async () => ({
      engine: id,
      outputUrl: `https://cdn.example/${id}.mp4`,
    }),
  };
}

test("registers and resolves an adapter by exact identifier", () => {
  const registry = new VideoRenderAdapterRegistry();
  const adapter = createAdapter("hyperframes");

  registry.register(adapter);

  assert.equal(registry.get("hyperframes"), adapter);
  assert.deepEqual(registry.list().map((item) => item.id), ["hyperframes"]);
});

test("rejects duplicate adapter identifiers", () => {
  const registry = new VideoRenderAdapterRegistry();
  registry.register(createAdapter("hyperframes"));

  assert.throws(
    () => registry.register(createAdapter("hyperframes")),
    (error: unknown) =>
      error instanceof VideoRenderAdapterRegistryError &&
      error.code === "DUPLICATE_ADAPTER"
  );
});

test("rejects unknown adapter identifiers without selecting a fallback", () => {
  const registry = new VideoRenderAdapterRegistry();

  assert.throws(
    () => registry.get("missing"),
    (error: unknown) =>
      error instanceof VideoRenderAdapterRegistryError &&
      error.code === "ADAPTER_NOT_FOUND"
  );
});
