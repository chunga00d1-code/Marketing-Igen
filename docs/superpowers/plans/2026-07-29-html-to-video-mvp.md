# HTML-to-Video MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure, authenticated Video Studio workflow that converts user-provided HTML and CSS into a background-rendered MP4 through the existing Hyperframes adapter.

**Architecture:** A dedicated HTML-video module owns input security, immutable render records, queueing, worker state transitions, and the public API. The existing Hyperframes adapter gains a second validated source mode for an already-sanitized composition document. A lazy-loaded React workspace previews that same sanitized document in a scriptless iframe and polls the render API until a terminal state.

**Tech Stack:** React 19, TypeScript, Vite, Express, Joi, Mongoose, BullMQ, Hyperframes, Node test runner with `tsx`, Tailwind CSS.

## Global Constraints

- HTML and CSS only; user JavaScript is forbidden.
- No template-library, website-import, campaign, Remotion, or FFmpeg integration.
- No remote or local asset URLs in MVP input.
- HTML and CSS are each limited to 100 KiB; duration is 1–60 seconds.
- Supported aspect ratios are `16:9`, `9:16`, `1:1`; resolutions are `720p`, `1080p`.
- Rendering is asynchronous and invokes the registered `hyperframes` adapter directly.
- Render reads and idempotency are scoped by both user and company.
- Preserve existing Video Studio tools, routes, Vietnamese copy, and fallback behavior.
- Use `apply_patch` for source edits and preserve UTF-8.

---

### Task 1: HTML/CSS Security Validator and Composition Builder

**Files:**
- Create: `server/service/html-video/html-video-security.service.ts`
- Test: `server/service/html-video/__tests__/html-video-security.service.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces:

```ts
export type HtmlVideoAspectRatio = "16:9" | "9:16" | "1:1";
export type HtmlVideoResolution = "720p" | "1080p";
export type HtmlVideoSource = {
  html: string;
  css: string;
  durationSeconds: number;
  aspectRatio: HtmlVideoAspectRatio;
  resolution: HtmlVideoResolution;
};
export type SafeHtmlVideoComposition = {
  sanitizedHtml: string;
  sanitizedCss: string;
  compositionHtml: string;
  width: number;
  height: number;
};
export function buildSafeHtmlVideoComposition(
  source: HtmlVideoSource
): SafeHtmlVideoComposition;
```

- Depends on: `sanitize-html` as a direct production dependency and its TypeScript declarations when required.

- [ ] **Step 1: Write failing security tests**

Cover a valid structural composition, dimension mapping, server-owned
`data-composition-id` and `data-composition-duration`, and rejection of each
unsafe class: `<script>`, embedded `<style>`, iframe/object/embed/form/base/meta,
SVG/MathML, `on*` attributes, all URL attributes, `@import`, `url(...)`,
`expression(...)`, `javascript:`, and `-moz-binding`. Also test empty HTML and
both 100 KiB limits.

Representative assertion:

```ts
test("builds a server-owned 9:16 1080p composition", () => {
  const result = buildSafeHtmlVideoComposition({
    html: '<main class="hero">Xin chào</main>',
    css: ".hero { animation: enter 1s ease-out; }",
    durationSeconds: 5,
    aspectRatio: "9:16",
    resolution: "1080p",
  });
  assert.equal(result.width, 1080);
  assert.equal(result.height, 1920);
  assert.match(result.compositionHtml, /data-composition-duration="5"/);
  assert.doesNotMatch(result.compositionHtml, /<script/i);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npx.cmd tsx --test server/service/html-video/__tests__/html-video-security.service.test.ts
```

Expected: FAIL because the security service does not exist.

- [ ] **Step 3: Add the parser dependency**

Run the repository package manager so both manifest and lockfile are updated:

```powershell
npm.cmd install sanitize-html
npm.cmd install --save-dev @types/sanitize-html
```

- [ ] **Step 4: Implement the strict validator**

Use an explicit tag/attribute allowlist. Reject the request when prohibited
constructs are present instead of silently producing a materially different
composition. Normalize the allowed fragment with `sanitize-html`, reject URL
attributes entirely, and scan CSS case-insensitively after comment removal.
Return stable Vietnamese validation errors without echoing user input.

- [ ] **Step 5: Build the server-owned document**

Map dimensions exactly:

```ts
const dimensions = {
  "16:9": { "720p": [1280, 720], "1080p": [1920, 1080] },
  "9:16": { "720p": [720, 1280], "1080p": [1080, 1920] },
  "1:1": { "720p": [720, 720], "1080p": [1080, 1080] },
} as const;
```

Place composition metadata on the server-owned `<html>` element, place the
sanitized fragment in a fixed-size root, inject only sanitized CSS, and include
no user-controlled script.

- [ ] **Step 6: Verify GREEN**

Run the focused test, `npm.cmd run typecheck`, and `git diff --check`.

- [ ] **Step 7: Commit**

```powershell
git add -- package.json package-lock.json server/service/html-video/html-video-security.service.ts server/service/html-video/__tests__/html-video-security.service.test.ts
git commit -m "feat: validate html video compositions"
```

---

### Task 2: Add Sanitized-Document Mode to the Hyperframes Adapter

**Files:**
- Modify: `server/service/video-edit/render-adapter.ts`
- Modify: `server/service/video-edit/hyperframes-render-adapter.ts`
- Modify: `server/service/video-edit/__tests__/render-adapter.test.ts`
- Modify: `server/service/video-edit/__tests__/hyperframes-render-adapter.test.ts`

**Interfaces:**
- Consumes: `SafeHtmlVideoComposition.compositionHtml`.
- Produces: a discriminated `VideoRenderInput` source:

```ts
type VideoRenderBlueprintSource = {
  blueprint: { timeline: Array<Record<string, unknown>>; [key: string]: unknown };
  compositionHtml?: never;
};
type VideoRenderHtmlSource = {
  compositionHtml: string;
  blueprint?: never;
};
export type VideoRenderInput = {
  jobId: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  resolution: "720p" | "1080p";
  sourceVideoUrl?: string;
} & (VideoRenderBlueprintSource | VideoRenderHtmlSource);
```

- [ ] **Step 1: Write failing adapter-contract tests**

Add tests proving blueprint mode remains valid, sanitized-document mode is
valid, neither source is invalid, and both sources together are invalid.

- [ ] **Step 2: Run contract tests and verify RED**

Run:

```powershell
npx.cmd tsx --test server/service/video-edit/__tests__/render-adapter.test.ts server/service/video-edit/__tests__/hyperframes-render-adapter.test.ts
```

Expected: FAIL because `compositionHtml` is not a supported input source.

- [ ] **Step 3: Implement the discriminated source contract**

Update adapter input validation without weakening job/aspect/resolution checks.
Do not change existing blueprint callers.

- [ ] **Step 4: Use supplied composition HTML**

Inside the Hyperframes adapter, write `input.compositionHtml` directly when HTML
mode is selected; otherwise call the existing blueprint compiler. Retain the
local CLI argument array, `shell: false`, timeout, abort, sanitization, upload,
and cleanup behavior.

- [ ] **Step 5: Verify GREEN and regressions**

Run all render-adapter, registry, Hyperframes, waterfall, and job-runner focused
tests plus typecheck.

- [ ] **Step 6: Commit**

```powershell
git add -- server/service/video-edit/render-adapter.ts server/service/video-edit/hyperframes-render-adapter.ts server/service/video-edit/__tests__/render-adapter.test.ts server/service/video-edit/__tests__/hyperframes-render-adapter.test.ts
git commit -m "feat: support html document render input"
```

---

### Task 3: Persist Tenant-Scoped HTML Render Jobs

**Files:**
- Create: `server/model/html-video-render.model.ts`
- Create: `server/service/html-video/html-video-render.service.ts`
- Test: `server/service/html-video/__tests__/html-video-render.service.test.ts`

**Interfaces:**
- Consumes: `buildSafeHtmlVideoComposition`.
- Produces:

```ts
export type HtmlVideoActor = { id: string; companyCode: string };
export type CreateHtmlVideoRenderInput = HtmlVideoSource & {
  idempotencyKey: string;
};
export const htmlVideoRenderService = {
  createRender(actor: HtmlVideoActor, input: CreateHtmlVideoRenderInput):
    Promise<{ render: HtmlVideoRenderPublic; created: boolean }>;
  getRender(actor: HtmlVideoActor, renderId: string):
    Promise<HtmlVideoRenderPublic>;
  processRender(renderId: string): Promise<void>;
  failRender(renderId: string, error: unknown): Promise<void>;
  recoverPendingRenders(): Promise<string[]>;
};
```

- [ ] **Step 1: Write failing model/service tests**

Use the repository's Mongoose mocking style. Prove immutable sanitized snapshots,
unique user/company/idempotency behavior, duplicate-key race recovery, private
source omission from serialization, and ownership-scoped reads.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npx.cmd tsx --test server/service/html-video/__tests__/html-video-render.service.test.ts
```

Expected: FAIL because the model/service do not exist.

- [ ] **Step 3: Implement the render model**

Use timestamps, the exact status enum from the spec, and indexes:

```ts
schema.index(
  { userId: 1, companyCode: 1, idempotencyKey: 1 },
  { unique: true }
);
schema.index({ status: 1, updatedAt: 1 });
```

Store source and sanitized snapshots privately; expose only the public status
shape through an explicit serializer.

- [ ] **Step 4: Implement create/read/idempotency**

Sanitize before persistence, scope every lookup to user and company, recover a
duplicate-key race by reading the scoped existing record, and use the same
not-found message for absent and unauthorized records.

- [ ] **Step 5: Verify GREEN**

Run the focused tests and typecheck.

- [ ] **Step 6: Commit**

```powershell
git add -- server/model/html-video-render.model.ts server/service/html-video/html-video-render.service.ts server/service/html-video/__tests__/html-video-render.service.test.ts
git commit -m "feat: persist html video render jobs"
```

---

### Task 4: Background Worker and Direct Hyperframes Execution

**Files:**
- Create: `server/queue/html-video-render-queue.ts`
- Modify: `server/service/html-video/html-video-render.service.ts`
- Test: `server/service/html-video/__tests__/html-video-render-worker.test.ts`

**Interfaces:**
- Consumes:
  - `defaultVideoRenderAdapterRegistry.get("hyperframes")`
  - persisted `compositionHtml`, aspect ratio, resolution, and render ID
- Produces:

```ts
export async function enqueueHtmlVideoRender(renderId: string):
  Promise<{ id?: string }>;
export function initHtmlVideoRenderWorker(): void;
```

- [ ] **Step 1: Write failing worker tests**

Inject or mock the adapter boundary and prove:

- only a `queued` record can be atomically claimed;
- the adapter receives `compositionHtml` and no blueprint;
- progress stages are persisted;
- success stores `completed`, output URL, and completion time;
- an attempt failure is returned to `queued` for queue retry;
- terminal failure stores only a safe code/message;
- no `runRenderWaterfall`, Remotion, or FFmpeg call exists in this module.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npx.cmd tsx --test server/service/html-video/__tests__/html-video-render-worker.test.ts
```

- [ ] **Step 3: Implement worker state transitions**

Use an atomic `findOneAndUpdate({ _id, status: "queued" })`, increment attempts,
create a unique OS temporary directory, apply the existing 15-minute render
timeout, and map adapter progress to the record.

- [ ] **Step 4: Implement BullMQ plus local fallback**

Follow `server/queue/creative-image-queue.ts`: a render-ID-only payload,
deterministic job ID, three capped attempts, bounded concurrency `1..4`, Redis
availability check, in-process fallback, and stale render recovery.

- [ ] **Step 5: Verify GREEN**

Run worker tests, all adapter tests, typecheck, and `git diff --check`.

- [ ] **Step 6: Commit**

```powershell
git add -- server/queue/html-video-render-queue.ts server/service/html-video/html-video-render.service.ts server/service/html-video/__tests__/html-video-render-worker.test.ts
git commit -m "feat: process html video renders in background"
```

---

### Task 5: Authenticated HTML Render API

**Files:**
- Create: `server/router/html-video-render.schemas.ts`
- Create: `server/router/html-video-render.router.ts`
- Create: `server/controller/html-video-render.controller.ts`
- Create: `server/controller/__tests__/html-video-render.controller.test.ts`
- Modify: `server.ts`

**Interfaces:**
- Consumes: `htmlVideoRenderService`, `enqueueHtmlVideoRender`.
- Produces:
  - `POST /api/v1/html-video-renders/preview`
  - `POST /api/v1/html-video-renders`
  - `GET /api/v1/html-video-renders/:renderId`

- [ ] **Step 1: Write failing schema/controller tests**

Prove exact enum/range/size/idempotency validation, a non-persisting preview
response from the shared security builder, `202` for create, `200` for
idempotent replay, enqueue behavior, public response shape, authentication actor
mapping, and ownership-safe `404`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npx.cmd tsx --test server/controller/__tests__/html-video-render.controller.test.ts
```

- [ ] **Step 3: Implement Joi schemas**

Use a required idempotency key matching
`/^[a-zA-Z0-9_-]{12,100}$/`, string byte-size enforcement for both sources, and
the exact supported setting enums. Preserve Vietnamese messages as UTF-8.

- [ ] **Step 4: Implement controller and router**

Follow existing `actorFrom` company resolution, apply `requireAuth`, validate
Mongo IDs on GET, enqueue only new or still-queued records, and never serialize
private source fields.

- [ ] **Step 5: Register API and worker**

Mount the router under `/api/v1` using the existing server registration pattern
and call `initHtmlVideoRenderWorker()` beside other worker initializers.

- [ ] **Step 6: Verify GREEN**

Run controller/security/service/worker tests, typecheck, and production build.

- [ ] **Step 7: Commit**

```powershell
git add -- server/router/html-video-render.schemas.ts server/router/html-video-render.router.ts server/controller/html-video-render.controller.ts server/controller/__tests__/html-video-render.controller.test.ts server.ts
git commit -m "feat: expose html video render API"
```

---

### Task 6: Client API Contract

**Files:**
- Create: `src/services/htmlVideoRenderService.ts`
- Create: `src/services/__tests__/htmlVideoRenderService.test.ts`

**Interfaces:**
- Produces:

```ts
export type HtmlVideoRenderStatus =
  | "queued"
  | "rendering"
  | "uploading"
  | "completed"
  | "failed";
export type HtmlVideoRenderDetail = {
  id: string;
  status: HtmlVideoRenderStatus;
  progress: number;
  stageMessage: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  resolution: "720p" | "1080p";
  durationSeconds: number;
  outputUrl: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};
export type HtmlVideoPreviewRequest = {
  html: string;
  css: string;
  durationSeconds: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
  resolution: "720p" | "1080p";
};
export type CreateHtmlVideoRenderRequest = HtmlVideoPreviewRequest & {
  idempotencyKey: string;
};
export const htmlVideoRenderService = {
  preview(input: HtmlVideoPreviewRequest):
    Promise<{ compositionHtml: string; width: number; height: number }>;
  create(input: CreateHtmlVideoRenderRequest):
    Promise<HtmlVideoRenderDetail>;
  get(renderId: string): Promise<HtmlVideoRenderDetail>;
};
```

- [ ] **Step 1: Write failing parser/request tests**

Prove auth header usage, all three endpoint paths, preview request/response,
render request payload, valid parsing, rejection of unknown
statuses/progress/settings, and suppression of output URL before `completed`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npx.cmd tsx --test src/services/__tests__/htmlVideoRenderService.test.ts
```

- [ ] **Step 3: Implement minimal strict client service**

Follow the existing service fetch/error parser and access-token pattern. Do not
trust server JSON without validating the public shape.

- [ ] **Step 4: Verify GREEN**

Run the focused test and typecheck.

- [ ] **Step 5: Commit**

```powershell
git add -- src/services/htmlVideoRenderService.ts src/services/__tests__/htmlVideoRenderService.test.ts
git commit -m "feat: add html video client service"
```

---

### Task 7: Video Studio Tool, Route, and Lazy Workspace Shell

**Files:**
- Modify: `src/utils/videoStudioNavigation.ts`
- Modify: `src/pages/VideoStudioPage.tsx`
- Modify: `src/seo/seo-config.ts`
- Modify: `src/pages/__tests__/VideoStudioPage.test.tsx`
- Create: `src/components/content-studio/HtmlVideoWorkspace.tsx`

**Interfaces:**
- Consumes: `HtmlVideoWorkspace`.
- Produces:
  - tool ID `html-video`
  - route `/video-studio/html-to-video`
  - home card **Tạo video từ HTML**

- [ ] **Step 1: Write failing navigation/home-card tests**

Prove route round-trip, the new card appears in the creation group without
moving existing tools unexpectedly, and `VideoStudioPage` lazy-loads and renders
the workspace for `tool === "html-video"`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npx.cmd tsx --test src/pages/__tests__/VideoStudioPage.test.tsx
```

- [ ] **Step 3: Add route, SEO entry, and card**

Use the existing `VIDEO_TOOLS`, `VIDEO_STUDIO_ROUTES`, SEO map, header, and lazy
component patterns. Preserve all existing Vietnamese strings byte-for-byte.

- [ ] **Step 4: Add a minimal workspace shell**

Export `HtmlVideoWorkspace`; render a heading and stable test hook only. Full
behavior belongs to Task 8.

- [ ] **Step 5: Verify GREEN**

Run the page test and typecheck.

- [ ] **Step 6: Commit**

```powershell
git add -- src/utils/videoStudioNavigation.ts src/pages/VideoStudioPage.tsx src/seo/seo-config.ts src/pages/__tests__/VideoStudioPage.test.tsx src/components/content-studio/HtmlVideoWorkspace.tsx
git commit -m "feat: add html video studio tool"
```

---

### Task 8: Sandboxed Editor, Preview, Polling, and Result UI

**Files:**
- Modify: `src/components/content-studio/HtmlVideoWorkspace.tsx`
- Create: `src/components/content-studio/__tests__/HtmlVideoWorkspace.test.tsx`

**Interfaces:**
- Consumes: `htmlVideoRenderService.create`, `htmlVideoRenderService.get`.
- Produces: complete HTML-to-video workspace UI.

- [ ] **Step 1: Write failing preview tests**

Prove separate HTML/CSS inputs, default example, duration/aspect/resolution
controls, debounced preview service calls, preview `iframe` with an empty
sandbox capability set, and use of the server-returned composition document as
`srcDoc`.

- [ ] **Step 2: Run preview tests and verify RED**

Run:

```powershell
npx.cmd tsx --test src/components/content-studio/__tests__/HtmlVideoWorkspace.test.tsx
```

- [ ] **Step 3: Implement editor and preview**

Use controlled textareas, fixed presets, a debounced preview request, and an
iframe with `sandbox=""`. Put only the returned safe `compositionHtml` into
`srcDoc`; keep the last valid preview visible when a new draft is rejected. Do
not use `allow-scripts` or `allow-same-origin`.

- [ ] **Step 4: Write failing submission/polling tests**

Using an injected service boundary or controlled fetch, prove:

- one submission per click with a 12–100 character idempotency key;
- disabled submit during active status;
- polling queued/rendering/uploading records;
- polling cancellation on terminal state and unmount;
- completed video/output action;
- safe failed message while editor contents remain unchanged;
- stale responses from an older render cannot replace a newer render.

- [ ] **Step 5: Run submission tests and verify RED**

Run the same focused workspace test and confirm failures are due to missing
submission behavior.

- [ ] **Step 6: Implement submission and polling**

Use an abortable effect or generation token, a 2-second polling interval, and
clear loading/progress/error/result states. Generate a new idempotency key only
for a new click, not for retries of the same network request.

- [ ] **Step 7: Verify GREEN**

Run workspace, client-service, navigation, and page tests plus typecheck.

- [ ] **Step 8: Commit**

```powershell
git add -- src/components/content-studio/HtmlVideoWorkspace.tsx src/components/content-studio/__tests__/HtmlVideoWorkspace.test.tsx
git commit -m "feat: build html video workspace"
```

---

### Task 9: Integrated Verification and Runtime Smoke Test

**Files:**
- Modify only if a failing verification exposes an in-scope defect.

**Interfaces:**
- Consumes all prior tasks.
- Produces a verified, reviewable HTML-to-video MVP.

- [ ] **Step 1: Run all focused tests**

```powershell
npx.cmd tsx --test server/service/html-video/__tests__/*.test.ts server/controller/__tests__/html-video-render.controller.test.ts server/service/video-edit/__tests__/render-adapter.test.ts server/service/video-edit/__tests__/hyperframes-render-adapter.test.ts server/service/video-edit/__tests__/render-waterfall.test.ts server/service/video-edit/__tests__/job-runner-adapter-integration.test.ts src/services/__tests__/htmlVideoRenderService.test.ts src/pages/__tests__/VideoStudioPage.test.tsx src/components/content-studio/__tests__/HtmlVideoWorkspace.test.tsx
```

Expected: all tests pass with no warnings or unhandled rejections.

- [ ] **Step 2: Run repository verification**

```powershell
npm.cmd run typecheck
npm.cmd run build
git diff --check
git status --short
```

Expected: typecheck and build exit `0`; no `import.meta` CJS warning from the
render adapter; no temporary files.

- [ ] **Step 3: Run a runtime smoke test when credentials are available**

Start the existing development server, authenticate through the normal app,
submit the default 3–5 second composition at 720p, verify state progression,
verify an MP4 URL is returned, play it, and confirm the preview is visually
consistent. If Redis is unavailable, confirm the in-process fallback completes.
If Cloudinary/runtime credentials are unavailable, record the smoke test as
unverified rather than weakening tests or adding bypasses.

- [ ] **Step 4: Review scope and security**

Confirm no template imports, arbitrary JavaScript, URL fetching, Remotion,
FFmpeg, campaign code, private source API fields, raw diagnostics, or unrelated
refactors entered the diff.

- [ ] **Step 5: Commit verification-only fixes if needed**

If no fixes were required, do not create an empty commit. If fixes were required,
stage only those files and use:

```powershell
git commit -m "fix: verify html video workflow"
```
