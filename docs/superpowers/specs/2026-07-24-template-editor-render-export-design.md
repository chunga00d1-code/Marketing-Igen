# Template Editor Render and Export Design

## Goal

Render the current template-editor timeline into a durable MP4 in the background. Users may leave the editor, return later, inspect export history, and download completed outputs.

## Scope

The first release supports:

- Exporting an unchanged template or an edited project.
- 720p and 1080p output, with 1080p selected by default.
- Video, image, text, and audio timeline items.
- Background execution independent of the browser session.
- Persistent progress, failure information, and completed Cloudinary URL.
- Multiple export attempts per project.
- Export history scoped to the project owner and company.

Advanced transitions, automatic subtitles, AI editing, billing, and distributed VPS rendering are outside this release.

## Architecture

Each export creates a `VideoProjectRender` document containing an immutable snapshot of the project timeline and output settings. A background render job consumes that snapshot so later project edits cannot change an in-progress or completed export.

The existing video-edit rendering infrastructure is reused:

1. Remotion is the primary engine because it can reproduce layered media and text.
2. FFmpeg is the fallback for technical Remotion failures that the fallback can represent safely.
3. The completed MP4 is uploaded to Cloudinary.

The existing Redis/BullMQ-compatible queue path is preferred. When Redis is unavailable, the current direct background fallback may start the work without blocking the HTTP response.

## Data Model

`VideoProjectRender` contains:

- `projectId`
- `userId`
- `companyCode`
- `status`: `queued | rendering | uploading | completed | failed`
- `resolution`: `720p | 1080p`
- `aspectRatio`
- `duration`
- `snapshot`: project title, tracks, items, and output settings
- `progress`: integer from 0 through 100
- `stageMessage`
- `outputUrl`
- `engine`: `remotion | ffmpeg`
- `attempt`
- `idempotencyKey`
- `errorCode`
- `errorMessage`
- `startedAt`
- `completedAt`
- timestamps

Indexes support project history and owner/company access. A unique idempotency key prevents duplicate jobs from repeated button clicks.

## API

### Create export

`POST /api/v1/video-projects/:projectId/renders`

Request:

```json
{
  "resolution": "1080p",
  "idempotencyKey": "client-generated-key"
}
```

Response status is `202`:

```json
{
  "status": "success",
  "data": {
    "id": "render-id",
    "projectId": "project-id",
    "status": "queued",
    "progress": 0,
    "resolution": "1080p"
  }
}
```

### Get one export

`GET /api/v1/video-projects/:projectId/renders/:renderId`

Returns current status, progress, stage message, error details, and output URL when completed.

### List export history

`GET /api/v1/video-projects/:projectId/renders`

Returns newest-first exports belonging to the authenticated user and company.

All endpoints require authentication and verify project ownership plus company scope.

## Render Mapping

The render adapter converts editor items into the existing video-edit blueprint:

- Video: source URL, start, duration, fit mode, volume, and ordering.
- Image: source URL, start, duration, fit mode, and ordering.
- Text: content, start, duration, font, size, color, alignment, position, bold, and italic.
- Audio: source URL, start, duration, volume, and ordering.

Canvas dimensions are derived from aspect ratio and output resolution. The snapshot duration is authoritative and frame rate is fixed at 30 FPS.

Only durable HTTPS media URLs are accepted for render. Temporary `blob:` URLs cause validation failure before a job is queued.

## State Transitions

Allowed transitions are:

```text
queued -> rendering -> uploading -> completed
queued -> failed
rendering -> failed
uploading -> failed
```

Progress never decreases. Each transition, stage message, engine choice, and terminal error is persisted.

## Frontend Flow

1. User clicks **Xuất**.
2. The modal offers 720p and 1080p, defaulting to 1080p.
3. The client creates an idempotency key and submits the export.
4. The modal switches to progress view and polls the render endpoint.
5. Closing the modal or browser does not cancel rendering.
6. The editor exposes **Lịch sử xuất**, which reloads jobs from the backend.
7. A completed job offers preview and MP4 download.
8. A failed job displays the persisted reason and allows a new export attempt.

## Error Handling

- Reject empty timelines and timelines containing temporary media URLs.
- Reject unsupported resolutions and invalid project ownership.
- Return the existing render for repeated idempotency keys.
- Persist sanitized error codes/messages; do not expose stack traces.
- Mark terminal failures explicitly rather than retrying indefinitely.
- Limit automatic technical retries to a bounded number.

## Security and Isolation

- Every project and render query includes `userId` and `companyCode`.
- Render snapshots are created server-side from the stored project.
- Clients cannot supply arbitrary snapshots or Cloudinary folders.
- Output URLs are returned only to the owning user/company.

## Testing

- Policy tests cover state transitions, idempotency, temporary URL rejection, dimensions, and timeline mapping.
- API validation tests cover resolution and idempotency keys.
- Service tests cover owner/company scoping and duplicate requests where practical.
- Frontend tests cover response parsing and progress-state mapping.
- Typecheck, lint, focused tests, and production build must pass.

## Operational Requirements

Remotion, Chromium, FFmpeg, Cloudinary credentials, and the existing queue dependencies must remain available in the deployment environment. Render temporary files must be scoped to a render ID and removed after completion or failure.
