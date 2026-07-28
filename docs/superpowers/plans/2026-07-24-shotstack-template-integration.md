# Shotstack Template Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace seeded/manual video templates with templates synchronized from the configured Shotstack account, keep editing inside the existing editor, and render invisibly through Shotstack before storing outputs in Cloudinary.

**Architecture:** A backend-only Shotstack client lists, retrieves, and renders provider templates. A bidirectional converter maps provider JSON to the internal editor state and maps user projects back to Shotstack JSON. MongoDB caches immutable provider versions, while existing tenant-scoped projects and render records provide isolation, idempotency, status polling, and final application-owned output URLs.

**Tech Stack:** Express, Mongoose, Joi, native `fetch`, BullMQ, Cloudinary, React 19, TypeScript, Node test runner.

## Global Constraints

- Preserve unrelated dirty-worktree changes and existing Vietnamese UI copy outside this feature.
- Never expose `SHOTSTACK_API_KEY` to the browser or logs.
- Use `SHOTSTACK_ENV=stage` by default and support `v1` without code changes.
- Keep existing catalogue/project API contracts stable where practical.
- Cache synchronized templates locally and never clear valid cache after a failed sync.
- Keep Remotion/FFmpeg available only as an explicit fallback.
- Do not scrape the public Shotstack gallery.

---

### Task 1: Provider client and configuration

**Files:**
- Create: `server/integration/shotstack/shotstack.types.ts`
- Create: `server/integration/shotstack/shotstack.client.ts`
- Test: `server/integration/shotstack/__tests__/shotstack.client.test.ts`

**Interfaces:**
- Produces: `ShotstackClient`, `getShotstackConfig()`, `ShotstackEdit`, `ShotstackTemplateSummary`, `ShotstackRenderStatus`.
- Consumes: `SHOTSTACK_ENV`, `SHOTSTACK_API_KEY`.

- [ ] **Step 1: Write failing client tests**

Test that stage selects `https://api.shotstack.io/stage`, `v1` selects production, absent keys throw a typed `ShotstackUnavailableError`, API keys are redacted from provider errors, list/retrieve/render/status requests use `x-api-key`, and requests abort after the configured timeout.

- [ ] **Step 2: Run the tests and verify failure**

Run:

```powershell
npx tsx --test server/integration/shotstack/__tests__/shotstack.client.test.ts
```

Expected: FAIL because the client module does not exist.

- [ ] **Step 3: Implement the typed Shotstack client**

Implement these signatures:

```ts
export function getShotstackConfig(): {
  environment: "stage" | "v1";
  baseUrl: string;
  apiKey: string;
};

export class ShotstackClient {
  listTemplates(): Promise<ShotstackTemplateSummary[]>;
  getTemplate(id: string): Promise<ShotstackTemplate>;
  renderTemplate(input: ShotstackRenderRequest): Promise<{ renderId: string }>;
  getRender(renderId: string): Promise<ShotstackRenderStatus>;
}
```

Use native `fetch`, `AbortSignal.timeout`, safe JSON parsing, and normalized provider errors. Do not retry mutations in this layer.

- [ ] **Step 4: Run client tests**

Expected: all Task 1 tests PASS.

- [ ] **Step 5: Commit Task 1**

Stage only the three Task 1 files and commit `feat: add Shotstack API client`.

### Task 2: Bidirectional timeline conversion

**Files:**
- Create: `server/integration/shotstack/shotstack.converter.ts`
- Test: `server/integration/shotstack/__tests__/shotstack.converter.test.ts`
- Modify: `server/interface/video-template.interface.ts`
- Modify: `src/types/video-template.ts`
- Modify: `src/components/template-editor/types.ts`

**Interfaces:**
- Consumes: `ShotstackEdit`.
- Produces:

```ts
export function shotstackEditToEditorProject(edit: ShotstackEdit): ShotstackConversionResult;
export function editorProjectToShotstackEdit(
  snapshot: VideoProjectRenderSnapshot,
  sourceEdit?: ShotstackEdit
): ShotstackEdit;
```

- [ ] **Step 1: Write converter fixtures and failing tests**

Cover video, image, audio, title, soundtrack, start, length, trim, volume, fit, scale, position, rotation, output aspect ratio, transition preservation, handlebars replacement detection, unsupported clip warnings, and rejection when no visual clip is usable.

- [ ] **Step 2: Run converter tests and verify failure**

Expected: FAIL because converter functions do not exist.

- [ ] **Step 3: Add provider binding types**

Add optional provider metadata to editor items without changing existing required fields:

```ts
providerBinding?: {
  provider: "shotstack";
  trackIndex: number;
  clipIndex: number;
  rawTransition?: Record<string, unknown>;
};
trim?: number;
opacity?: number;
scale?: number;
```

- [ ] **Step 4: Implement conversion**

Generate stable item IDs from track/clip indexes. Preserve full provider edit separately from normalized preview state. New editor items are appended as supported Shotstack clips; removed bound items are excluded during reverse conversion.

- [ ] **Step 5: Run converter tests and typecheck**

Run converter tests, then:

```powershell
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Commit `feat: convert Shotstack templates and editor projects`.

### Task 3: Cached synchronization and immutable versions

**Files:**
- Modify: `server/interface/video-template.interface.ts`
- Modify: `server/model/video-template.model.ts`
- Modify: `server/model/video-template-version.model.ts`
- Create: `server/model/video-template-sync.model.ts`
- Create: `server/service/shotstack-template-sync.service.ts`
- Test: `server/service/__tests__/shotstack-template-sync.service.test.ts`
- Modify: `server/service/video-template.service.ts`

**Interfaces:**
- Consumes: `ShotstackClient`, `shotstackEditToEditorProject`.
- Produces:

```ts
export async function synchronizeShotstackTemplates(actorId: string): Promise<{
  created: number;
  updated: number;
  unchanged: number;
  archived: number;
  failed: Array<{ externalId: string; message: string }>;
}>;
```

- [ ] **Step 1: Write failing synchronization tests**

Test first import, unchanged hash, changed JSON creates exactly one new version, one invalid provider item does not fail valid items, provider outage preserves cached templates, and missing provider templates are archived rather than deleted.

- [ ] **Step 2: Run sync tests and verify failure**

Expected: FAIL because sync service and provider fields do not exist.

- [ ] **Step 3: Extend persistence safely**

Add sparse compound uniqueness for `{ sourceProvider: "shotstack", externalTemplateId }`. Store `sourceHash`, `sourceEdit`, normalized editor state, compatibility warnings, provider timestamps, last sync time, and last sync summary.

- [ ] **Step 4: Implement idempotent synchronization**

Use SHA-256 over canonicalized provider JSON and bounded concurrency of three template detail requests. Publish valid synchronized versions automatically, retain the last valid version on per-item failure, and archive disappeared provider templates only after a successful list request.

- [ ] **Step 5: Replace seeded catalogue initialization**

Stop calling `ensureDefaultSystemTemplates()` when Shotstack is configured. Keep the current seeded definitions only behind `VIDEO_TEMPLATE_SEED_FALLBACK=true` for local emergency use.

- [ ] **Step 6: Run synchronization and existing template tests**

Run:

```powershell
npx tsx --test server/service/__tests__/shotstack-template-sync.service.test.ts server/service/__tests__/video-template-clone.test.ts server/service/__tests__/video-template-policy.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

Commit `feat: synchronize Shotstack template catalogue`.

### Task 4: Admin synchronization API

**Files:**
- Modify: `server/controller/video-template.controller.ts`
- Modify: `server/router/video-template.router.ts`
- Modify: `server/router/video-template.schemas.ts`
- Test: `server/service/__tests__/video-template-validation.test.ts`

**Interfaces:**
- Consumes: `synchronizeShotstackTemplates`.
- Produces:
  - `POST /api/v1/admin/video-templates/shotstack/sync`
  - `GET /api/v1/admin/video-templates/shotstack/status`

- [ ] **Step 1: Write failing authorization/response tests**

Test admin/superadmin access, normal user rejection, safe `503` for missing configuration, and the exact sync summary envelope.

- [ ] **Step 2: Remove manual authoring routes**

Remove normal product routes for `POST /video-templates`, `PATCH /video-templates/:id`, and `/publish`. Keep moderation as a separate local visibility operation only if an existing consumer requires it.

- [ ] **Step 3: Implement sync/status controllers and routes**

Use existing `requireAuth`, `requireRole`, and response envelope patterns. Never return provider credentials or raw provider errors.

- [ ] **Step 4: Run validation/API-focused tests**

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

Commit `feat: expose admin Shotstack synchronization`.

### Task 5: Shotstack render worker, webhook, and polling

**Files:**
- Modify: `server/interface/video-project-render.interface.ts`
- Modify: `server/model/video-project-render.model.ts`
- Modify: `server/service/video-project-render.service.ts`
- Replace provider path in: `server/service/video-project-render-runner.ts`
- Modify: `server/queue/video-project-render-queue.ts`
- Create: `server/service/shotstack-render.service.ts`
- Create: `server/controller/shotstack-webhook.controller.ts`
- Create: `server/router/shotstack-webhook.router.ts`
- Modify: `server/router/index.ts`
- Modify: `server.ts`
- Test: `server/service/__tests__/shotstack-render.service.test.ts`
- Test: `server/service/__tests__/video-project-render-service.test.ts`

**Interfaces:**
- Consumes: `editorProjectToShotstackEdit`, `ShotstackClient`, Cloudinary.
- Produces:

```ts
export async function submitShotstackRender(renderId: string): Promise<void>;
export async function reconcileShotstackRender(renderId: string): Promise<void>;
export async function acceptShotstackWebhook(payload: unknown, secret: string): Promise<void>;
```

- [ ] **Step 1: Write failing render lifecycle tests**

Cover immutable snapshot submission, idempotent provider submission, provider render ID persistence, webhook secret validation, duplicate webhook delivery, local polling completion, provider failure, Cloudinary transfer, and transfer retry without another paid render.

- [ ] **Step 2: Extend render persistence**

Add engine `"shotstack"`, `providerRenderId`, `providerStatus`, `providerOutputUrl`, `transferAttempt`, and provider diagnostic fields. Keep public serialization sanitized.

- [ ] **Step 3: Implement provider submission**

Map the immutable snapshot to Shotstack JSON, attach a callback only when configured, submit exactly once, and transition `queued → rendering`.

- [ ] **Step 4: Implement reconciliation and Cloudinary transfer**

On provider `done`, transition to `uploading`, stream or securely fetch the output, upload to the existing project render folder, then transition to `completed`. Provider failure transitions to `failed`.

- [ ] **Step 5: Add webhook and polling**

Mount `POST /webhooks/shotstack/:secret` without JWT but with secret and known-render validation. Reconcile active renders when their authenticated status endpoint is read, providing local stage polling without a public tunnel.

- [ ] **Step 6: Keep local render as explicit fallback**

Use `VIDEO_TEMPLATE_RENDER_ENGINE=remotion` only when explicitly configured; default to `shotstack`. Do not remove current Remotion code.

- [ ] **Step 7: Run render tests**

Run:

```powershell
npx tsx --test server/service/__tests__/shotstack-render.service.test.ts server/service/__tests__/video-project-render-service.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

Commit `feat: render template projects with Shotstack`.

### Task 6: Frontend catalogue synchronization and removal of authoring flow

**Files:**
- Modify: `src/services/videoTemplateService.ts`
- Modify: `src/types/video-template.ts`
- Modify: `src/components/content-studio/video-templates/VideoTemplateLibrary.tsx`
- Modify: parent content-studio component that supplies `onCreateTemplate`
- Modify: `src/components/template-editor/TemplateEditorTopbar.tsx`
- Modify: `src/components/template-editor/TemplateEditorProperties.tsx`
- Modify: `src/components/template-editor/TemplateEditorWorkspace.tsx`
- Remove from active imports: `src/components/template-editor/TemplateSubmissionModal.tsx`
- Test: `src/services/__tests__/videoTemplateService.test.ts`

**Interfaces:**
- Produces:

```ts
videoTemplateService.syncShotstackTemplates(): Promise<ShotstackSyncSummary>;
videoTemplateService.getShotstackSyncStatus(): Promise<ShotstackSyncStatus>;
```

- [ ] **Step 1: Write failing frontend service parsing tests**

Test successful sync/status envelopes, missing configuration messages, partial template failures, and preserved catalogue parsing.

- [ ] **Step 2: Replace “Tạo mẫu mới” with admin sync**

Show **Đồng bộ Shotstack** only to admins/superadmins. Disable while syncing, refresh the catalogue after success, and show counts through existing toast patterns.

- [ ] **Step 3: Remove active manual-authoring UI**

Remove navigation into `create-template`, submission modal triggers, create-template copy, and “Mẫu của tôi” wording that implies user-uploaded templates. Preserve project editing and recent projects.

- [ ] **Step 4: Surface provider compatibility safely**

Only admins see compatibility warnings or last-sync failures. Normal users see usable published templates only.

- [ ] **Step 5: Run service tests and typecheck**

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

Commit `feat: connect template library to Shotstack sync`.

### Task 7: Export modal integration

**Files:**
- Modify: `src/services/videoTemplateService.ts`
- Modify: `src/types/video-template.ts`
- Modify: `src/components/template-editor/TemplateExportModal.tsx`
- Modify: `src/components/template-editor/TemplateEditorWorkspace.tsx`
- Test: `src/services/__tests__/videoTemplateService.test.ts`

**Interfaces:**
- Consumes existing render creation/status routes.
- Produces visible states: idle, submitting, rendering, transferring, completed, failed.

- [ ] **Step 1: Add failing render response parsing tests**

Test create render, repeated idempotency key, progress/status parsing, final output URL, and safe provider failure.

- [ ] **Step 2: Wire export to saved project revision**

Require a persisted `project.id`, save pending edits before submission, generate one stable idempotency key per export attempt, create the render, and poll the application status endpoint with bounded backoff.

- [ ] **Step 3: Implement final download experience**

Show progress/stage message, provide **Tải video** using the Cloudinary URL, allow retry after failure with a new key, and stop polling on close/unmount or terminal state.

- [ ] **Step 4: Run frontend tests and typecheck**

Expected: PASS.

- [ ] **Step 5: Commit Task 7**

Commit `feat: export template videos through Shotstack`.

### Task 8: End-to-end verification and rollout guard

**Files:**
- Modify only files required by verification failures in the Shotstack feature.
- Update: `docs/superpowers/specs/2026-07-24-shotstack-template-integration-design.md` only if verified behavior differs.

**Interfaces:**
- Validates the complete integration.

- [ ] **Step 1: Run all focused template tests**

```powershell
npx tsx --test server/integration/shotstack/__tests__/*.test.ts server/service/__tests__/video-template*.test.ts server/service/__tests__/shotstack*.test.ts server/service/__tests__/video-project-render-service.test.ts src/services/__tests__/videoTemplateService.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run repository verification**

```powershell
npm run typecheck
npm run build
```

Expected: PASS. Run `npm run lint` and distinguish new feature errors from pre-existing unrelated failures.

- [ ] **Step 3: Perform stage smoke test**

With the user's configured stage key:

1. invoke admin sync;
2. confirm at least one imported account template appears;
3. create a user project;
4. replace one supported asset or text item;
5. submit a 720p stage render;
6. poll until complete;
7. confirm the final URL is application-controlled Cloudinary storage and the expected Shotstack stage watermark is present.

- [ ] **Step 4: Verify failure safety**

Temporarily use an invalid key in the process environment, confirm cached templates remain visible, restore the original environment without writing secrets to source files, and confirm no key appears in logs or API output.

- [ ] **Step 5: Final review**

Inspect `git diff --check`, `git status --short`, all modified route contracts, encoding of changed Vietnamese strings, and ensure no `.env`, provider response dump, temporary video, or generated test artifact is staged.

