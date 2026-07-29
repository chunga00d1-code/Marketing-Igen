import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { defaultVideoRenderAdapterRegistry } from "../video-render-adapters";

test("registers Hyperframes in the default render adapter registry", () => {
  assert.equal(
    defaultVideoRenderAdapterRegistry.get("hyperframes").id,
    "hyperframes"
  );
});

test("routes the worker through the adapter waterfall without an active shell renderer", () => {
  const jobRunnerSource = readFileSync(
    "server/service/video-edit/job-runner.ts",
    "utf8"
  );
  const hyperframeSource = readFileSync(
    "server/service/video-edit/hyperframe.ts",
    "utf8"
  );
  const adapterSource = readFileSync(
    "server/service/video-edit/hyperframes-render-adapter.ts",
    "utf8"
  );

  assert.match(jobRunnerSource, /runRenderWaterfall/);
  assert.match(jobRunnerSource, /defaultVideoRenderAdapterRegistry\.get\("hyperframes"\)/);
  assert.doesNotMatch(
    `${jobRunnerSource}\n${hyperframeSource}`,
    /npx\s+hyperframes|shell:\s*true/
  );
  assert.doesNotMatch(adapterSource, /createRequire\(import\.meta\.url\)/);
});
