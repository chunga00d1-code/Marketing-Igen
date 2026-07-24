# Shotstack Template Integration Design

## Goal

Replace the current manually authored and seeded video-template flow with a Shotstack-backed template catalogue. Users remain inside the Marketing application for template discovery, editing, export progress, playback, and download. Shotstack is an invisible backend provider for template storage and production rendering.

## Scope

This change:

- synchronizes templates owned by the configured Shotstack account into the local template catalogue;
- removes manual template upload/creation from the normal admin workflow;
- converts supported Shotstack edit JSON into the existing template-editor project format;
- creates an isolated user project when a published synchronized template is selected;
- renders edited projects through Shotstack;
- receives render completion by webhook in production and supports status polling for local development;
- copies completed output to the application's Cloudinary account;
- retains the current Remotion renderer as an explicit fallback rather than the default renderer.

This change does not scrape the public Shotstack gallery. Gallery templates must first be imported into the configured Shotstack account. It does not expose Shotstack API keys or provider URLs to the browser.

## Configuration

The backend uses:

- `SHOTSTACK_ENV=stage|v1`, defaulting to `stage`;
- `SHOTSTACK_API_KEY`, required for synchronization and rendering;
- `SHOTSTACK_WEBHOOK_URL`, optional in local development and required for production webhook delivery;
- `SHOTSTACK_WEBHOOK_SECRET`, used as an application-owned unguessable callback token when configured.

The API key is backend-only and must never use a `VITE_` prefix. Stage and production are separate Shotstack template catalogues. Missing configuration produces an actionable provider-unavailable response without deleting cached local templates.

## Architecture

### Shotstack client

A focused server client owns authentication, environment URL selection, request timeouts, response validation, and provider error normalization. It supports:

- listing account templates;
- retrieving a template edit by ID;
- submitting a render;
- retrieving render status.

The client does not contain database or HTTP-controller logic.

### Template synchronization

Synchronization may be invoked by an authorized admin endpoint and by a bounded periodic scheduler. It:

1. lists templates in the configured Shotstack environment;
2. retrieves each template's full edit JSON with bounded concurrency;
3. validates that the edit contains a supported output and timeline;
4. maps Shotstack clips to the internal editor timeline;
5. upserts a system template keyed by provider and external template ID;
6. creates a new immutable local version only when the provider payload hash changes;
7. retains the last valid local version when a provider item fails validation;
8. archives locally synchronized templates no longer returned by Shotstack without deleting user projects.

Synchronization is idempotent. The response reports created, updated, unchanged, archived, and failed counts. It never consumes render credits.

### Supported conversion

The initial converter supports:

- video, image, audio, title, and text-compatible HTML clips;
- clip `start`, `length`, `trim`, volume, fit, scale, opacity, position, and rotation where the internal editor supports them;
- soundtrack URL and volume;
- output aspect ratios `9:16`, `16:9`, `1:1`, and `3:4`;
- transition names preserved as provider metadata for round-trip rendering;
- handlebars values in media sources and text as replaceable editor items.

Unsupported clips are reported during synchronization. A template with no usable visual clips is rejected. Provider JSON is stored in the immutable template version so rendering can preserve Shotstack-specific effects that the local preview cannot reproduce exactly.

### Local catalogue

`VideoTemplate` stores provider metadata, external ID, synchronization state, catalogue metadata, visibility, and the current published version. `VideoTemplateVersion` stores:

- immutable original Shotstack edit JSON;
- normalized internal editor state;
- a deterministic source hash;
- compatibility warnings;
- provider timestamps.

Cached templates remain visible during a temporary Shotstack outage. Admins can synchronize and control local publication/visibility, but do not upload source videos or manually construct templates.

### User project

Selecting **Dùng mẫu** clones the published normalized editor state and provider edit snapshot into a tenant- and user-scoped `VideoProject`. Future synchronization cannot alter an existing project. Editing and autosave continue through the current template editor.

Each internal item retains a provider binding that identifies the corresponding Shotstack track and clip. Newly added supported items receive generated bindings. Deleted items are omitted from the render edit.

### Render flow

1. The browser saves the latest project revision.
2. `POST /api/v1/video-projects/:projectId/renders` creates an idempotent render record containing an immutable project snapshot.
3. The worker maps the snapshot back to Shotstack JSON and submits a render with the application callback URL.
4. The render record stores the Shotstack render ID and moves through `queued`, `rendering`, `uploading`, `completed`, or `failed`.
5. In production, Shotstack calls the webhook. In local development, the existing status endpoint polls Shotstack with a bounded interval.
6. On completion, the worker downloads the temporary output and uploads it to the application's Cloudinary folder.
7. The browser reads only the application's render status and final Cloudinary URL.

The user never leaves the Marketing application and does not require a Shotstack account.

## API

Existing catalogue and project routes remain stable where practical:

- `GET /api/v1/video-template-categories`
- `GET /api/v1/video-templates`
- `GET /api/v1/video-templates/:templateId`
- `POST /api/v1/video-templates/:templateId/use`
- `GET /api/v1/video-projects/:projectId`
- `PATCH /api/v1/video-projects/:projectId`
- `POST /api/v1/video-projects/:projectId/renders`
- `GET /api/v1/video-project-renders/:renderId`

New provider routes:

- `POST /api/v1/admin/video-templates/shotstack/sync`
- `GET /api/v1/admin/video-templates/shotstack/status`
- `POST /api/v1/webhooks/shotstack/:secret`

Synchronization routes require `admin` or `superadmin`. Template and project routes retain authentication, tenant scoping, and ownership checks. The webhook is unauthenticated by JWT but validates the configured callback secret and matches the provider render ID to an active local render.

Manual create/update routes and the create-template UI are removed from the normal product flow. Local visibility moderation is kept separate from provider source ownership.

## Frontend

The existing CapCut-style editor remains. Frontend changes are limited to:

- removing the create/upload-template entry points;
- adding an admin-only Shotstack synchronization action and last-sync result;
- showing compatibility or synchronization errors only to admins;
- loading synchronized templates through the existing catalogue service;
- updating the export modal to show Shotstack-backed job progress and final download URL.

No Shotstack credential or direct provider request is sent from the browser.

## Error Handling

- Missing or invalid Shotstack configuration returns `503` with a safe Vietnamese message.
- Provider timeouts and `429` responses use bounded exponential retries and respect retry hints.
- Synchronization is partial: one malformed template cannot fail the entire catalogue.
- A failed sync never clears previously cached templates.
- A render submission uses an idempotency key so browser retries cannot create duplicate paid renders.
- Webhook deliveries are idempotent and terminal render states cannot transition backward.
- Failed Shotstack renders record a sanitized public error and a provider diagnostic suitable for server logs.
- Cloudinary upload failure retains the Shotstack render ID so transfer can be retried without purchasing another render.

## Security

- API keys remain server-side and are redacted from errors and logs.
- Remote media URLs are validated before synchronization and rendering.
- Completed output is copied to application-controlled storage.
- Webhook callbacks require the configured secret and known provider render ID.
- All catalogue, project, and render records retain company and user access controls.

## Rollout

1. Add the Shotstack client, converter, persistence fields, and unit tests.
2. Add admin synchronization while retaining the existing seeded catalogue behind a temporary fallback.
3. Connect the existing library and editor to synchronized templates.
4. Switch rendering to Shotstack and verify stage watermark output end to end.
5. Remove seeded/manual authoring paths after a successful synchronized catalogue exists.
6. Change `SHOTSTACK_ENV` and API key for production, import the chosen templates into the production Shotstack account, and synchronize again.

## Verification

Tests cover:

- environment URL and safe provider error handling;
- Shotstack-to-editor and editor-to-Shotstack round trips for video, image, text, audio, and transitions;
- synchronization idempotency, changed payload versioning, partial failure, and archival;
- tenant-safe template cloning;
- render submission idempotency;
- webhook validation and repeated delivery;
- polling completion in stage/local development;
- Cloudinary transfer retry without duplicate provider render;
- frontend response parsing and export states.

Run targeted unit tests first, followed by `npm run typecheck` and `npm run build`. Existing unrelated dirty-worktree changes and UTF-8 text must remain untouched.
