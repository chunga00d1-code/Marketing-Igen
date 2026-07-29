# HTML-to-Video MVP Design

## Goal

Add an independent HTML-to-video workflow to Video Studio. An authenticated
user can enter HTML and CSS, preview the composition safely, choose output
settings, start a background Hyperframes render, and download the completed
video.

This MVP does not depend on the existing video-template library.

## Scope

### Included

- A new **Tạo video từ HTML** card in the **Tạo video mới** group.
- A dedicated Video Studio route and lazy-loaded workspace.
- Separate HTML and CSS editors using plain textareas.
- A sandboxed live preview.
- Aspect ratios `16:9`, `9:16`, and `1:1`.
- Resolutions `720p` and `1080p`.
- Duration from 1 through 60 seconds.
- Authenticated create-render and get-render-status APIs.
- Background rendering through the existing Hyperframes adapter.
- Persisted ownership, input snapshot, progress, safe error, and output URL.
- Polling while the render is active and a download/open action when complete.

### Excluded

- Reusable templates or integration with `VideoTemplate`.
- Arbitrary JavaScript, `<script>`, inline event handlers, iframes, plugins,
  forms, or navigation.
- Importing a public website URL.
- Drag-and-drop layout building.
- Remotion or FFmpeg fallback for arbitrary HTML.
- Automated campaign integration.
- Draft persistence and collaborative editing.

## User Experience

The Video Studio home gains one card titled **Tạo video từ HTML**. Selecting it
navigates to a stable route and opens a two-column workspace:

- The left side contains HTML and CSS textareas plus duration, aspect ratio, and
  resolution controls.
- The right side contains a sandboxed preview using `iframe.srcdoc`.
- The primary action is **Kết xuất video**.
- While active, the workspace shows persisted render stage and progress.
- On success, it displays the returned video and an action to open or download
  it.
- On failure, it shows only the safe persisted error and allows a new render.

The preview iframe uses `sandbox=""`; it receives no script, same-origin,
navigation, popup, form, or top-window privileges. A debounced authenticated
preview request runs the same server security validator and document builder as
render creation, then returns only the safe composition document. The iframe
never receives the raw editor document, so preview and output do not
intentionally diverge.

## API Contract

All endpoints use the existing authentication middleware.

### Build safe preview

`POST /api/v1/html-video-renders/preview`

The request contains `html`, `css`, `durationSeconds`, `aspectRatio`, and
`resolution` using the same validation as render creation, except that no
idempotency key is required. The response contains the server-built
`compositionHtml`, `width`, and `height`. It does not persist or enqueue a
render.

### Create render

`POST /api/v1/html-video-renders`

Request:

```json
{
  "html": "<main class=\"card\">Hello</main>",
  "css": ".card { animation: enter 1s ease-out; }",
  "durationSeconds": 5,
  "aspectRatio": "16:9",
  "resolution": "720p",
  "idempotencyKey": "uuid-or-client-generated-key"
}
```

Response status is `202` for a newly queued render and `200` when the same user
replays an existing idempotency key.

```json
{
  "success": true,
  "data": {
    "id": "render-id",
    "status": "queued",
    "progress": 0,
    "stageMessage": "Đã xếp hàng kết xuất video.",
    "aspectRatio": "16:9",
    "resolution": "720p",
    "durationSeconds": 5,
    "outputUrl": null,
    "error": null,
    "createdAt": "ISO timestamp",
    "updatedAt": "ISO timestamp"
  }
}
```

### Read render

`GET /api/v1/html-video-renders/:renderId`

The response uses the same public render shape. The lookup is scoped to the
authenticated user and company. A record outside that scope returns the same
not-found response as a missing record.

## Validation and Security

The server is the trust boundary. Client validation exists only for feedback.

- `html` must be a non-empty UTF-8 string no larger than 100 KiB.
- `css` may be empty and is limited to 100 KiB.
- `durationSeconds` is an integer from 1 to 60.
- Aspect ratio and resolution must use the explicit supported enums.
- The idempotency key is required, bounded, and validated using the repository's
  existing request-validation pattern.
- HTML is parsed with an explicit allowlist. The request is rejected if it
  contains scripts, styles embedded in HTML, iframes, objects, embeds, forms,
  base tags, meta tags, SVG/MathML content, inline `on*` handlers, or any URL
  attribute. Allowed structural elements and safe presentation attributes are
  serialized into normalized HTML.
- CSS is rejected when it contains script-capable or network-loading constructs,
  including `@import`, `url(...)`, `expression(...)`, `javascript:`, and
  `-moz-binding`.
- The MVP accepts no remote or local asset URL. Media embedding is a later,
  separately secured feature.
- The sanitized HTML and CSS are wrapped by a server-owned full document with
  fixed canvas dimensions, overflow handling, duration metadata, and no
  user-controlled document-level tags.
- Renderer diagnostics are sanitized and bounded by the existing adapter. Raw
  command lines, filesystem paths, environment variables, and stderr are never
  returned by the API.
- Render records are tenant- and user-scoped. Idempotency is unique within that
  scope.

## Persistence

Create a dedicated `HtmlVideoRender` model rather than overloading `AIMedia`.
The record is both the immutable render request snapshot and job state:

- `userId`
- `companyCode`
- `idempotencyKey`
- `sourceHtml`
- `sourceCss`
- `sanitizedHtml`
- `sanitizedCss`
- `durationSeconds`
- `aspectRatio`
- `resolution`
- `status`: `queued | rendering | uploading | completed | failed`
- `progress`
- `stageMessage`
- `outputUrl`
- `errorCode`
- `error`
- `attempts`
- `startedAt`
- `completedAt`
- timestamps

The unique index is `(userId, companyCode, idempotencyKey)`. Source fields remain
private and are not returned by the status API.

## Backend Components and Data Flow

1. The router authenticates and validates the request shape. Preview requests
   return the safe composition document immediately without persistence.
2. `html-video-security.service` sanitizes and validates HTML/CSS, then creates
   the complete Hyperframes document using server-owned dimensions and duration.
3. `html-video-render.service` atomically finds or creates the tenant-scoped
   render record using the idempotency key.
4. A dedicated queue receives only the render record ID. The API does not wait
   for Chromium/FFmpeg.
5. The worker atomically claims a `queued` record, marks it `rendering`, and
   invokes the registered `hyperframes` adapter directly.
6. Adapter progress is mapped into the persisted job progress.
7. On upload completion, the worker stores the output URL and marks the record
   `completed`.
8. A safe coded failure marks the record `failed`. This workflow does not call
   Remotion or FFmpeg because they cannot faithfully render arbitrary HTML.
9. The MVP client polls the status endpoint and does not depend on a socket
   event.

If Redis is unavailable, the queue follows the repository's existing local
background-execution pattern: return the persisted queued record first, then
run the worker asynchronously in-process.

## Frontend Components

- Extend `VideoStudioTool` and route maps with `html-video`.
- Add one card to `VIDEO_TOOLS`.
- Lazy-load `HtmlVideoWorkspace`.
- Add `htmlVideoRenderService` for preview, create, and status requests plus
  strict response parsing.
- Keep editor, settings, preview, submission, polling, and result state inside
  the workspace. Do not add state to unrelated Video Studio tools.
- Stop polling on terminal status, unmount, or a newer submitted render.
- Disable duplicate submission while a render is active and reuse one
  client-generated idempotency key per click.

## Error Handling

- Request validation returns the repository-standard validation response.
- Unsafe content receives a stable safe validation message and is never queued.
- Missing or unauthorized render IDs return not found.
- Duplicate idempotent submissions return the existing render.
- A failed background render persists a safe `errorCode` and user-facing
  message.
- The UI preserves the editor content after failure so the user can correct and
  resubmit it with a new idempotency key.

## Testing

Backend tests cover:

- accepted HTML/CSS and supported settings;
- rejection of scripts, event handlers, network CSS, oversized input, and
  unsupported settings;
- server-owned document wrapping;
- tenant/user ownership;
- idempotent creation;
- worker state transitions;
- direct Hyperframes adapter use with no fallback;
- safe failure persistence.

Frontend tests cover:

- route/tool mapping;
- home-card placement;
- request and response parsing;
- debounced server-built sandboxed preview;
- active-render submission lock;
- polling until completed or failed;
- result and safe error presentation.

Final verification runs focused tests, `npm run typecheck`, and `npm run build`.

## Delivery Sequence

1. Security validator and document builder.
2. Render model, service, API, and background worker.
3. Client service and Video Studio route/card.
4. HTML workspace, sandbox preview, polling, and result UI.
5. Integrated verification and a manual render smoke test when runtime services
   and Cloudinary credentials are available.

Each sequence item is committed independently so it can be reviewed or rolled
back without affecting the completed render-adapter foundation.
