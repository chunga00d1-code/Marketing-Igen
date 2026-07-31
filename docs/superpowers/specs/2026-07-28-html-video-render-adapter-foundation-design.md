# HTML Video Render Adapter Foundation Design

## Goal

Introduce a stable render-adapter boundary for the existing local video-edit pipeline, beginning with Hyperframes, without changing current APIs, UI behavior, database schemas, or the existing Remotion and FFmpeg fallbacks.

## Scope

This phase covers only the backend rendering foundation:

- Define a shared adapter contract.
- Wrap the current Hyperframes renderer behind that contract.
- Harden child-process execution, temporary-file handling, progress reporting, errors, timeouts, and cleanup.
- Route the existing local render worker through the adapter registry.
- Preserve the current Hyperframes → Remotion → FFmpeg fallback order.

Template manifests, upstream template imports, the HTML-to-video UI, soundtrack generation, content graphs, and campaign integration are separate later phases.

## Architecture

### Adapter contract

Create a backend-only `VideoRenderAdapter` interface with:

- A stable engine identifier.
- A capability check that reports whether required runtime dependencies are available.
- An input-validation method that rejects unsupported render requests before a process starts.
- A render method that receives a normalized input object and execution context.
- Structured progress callbacks and a normalized result.

The normalized render input includes:

- The immutable blueprint snapshot.
- Aspect ratio and resolution.
- Optional source video URL.
- A unique render/job identifier.

The execution context includes:

- A bounded timeout.
- An abort signal.
- A progress callback.
- A task-specific temporary directory.

The result includes:

- Engine identifier.
- Durable output URL.
- Optional render diagnostics safe for internal logs.

### Adapter registry

Create a small registry that resolves an adapter by engine identifier. Phase 1 registers only the Hyperframes adapter. Remotion and FFmpeg remain existing fallback implementations and are not rewritten as adapters in this phase.

The registry must reject duplicate identifiers and unknown engines. It must not silently select another adapter; fallback policy remains the responsibility of the worker.

### Hyperframes adapter

The Hyperframes adapter reuses the existing blueprint-to-HTML compiler and Cloudinary upload behavior.

It replaces shell-string execution with direct process spawning:

- Resolve the repository-local Hyperframes executable instead of invoking `npx`.
- Pass arguments as an array with shell mode disabled.
- Never interpolate user-controlled values into a command string.
- Capture bounded stdout/stderr for diagnostics.
- Kill the child process on timeout or abort.

Temporary files are created under a unique OS temporary directory for each render. Cleanup runs in `finally` after success, validation failure, timeout, abort, upload failure, or renderer failure.

### Worker integration

The existing local render worker continues to:

1. Attempt Hyperframes through the adapter registry.
2. Attempt the existing Remotion renderer if Hyperframes fails.
3. Attempt the existing FFmpeg fallback if Remotion fails.
4. Persist the current status, progress, logs, and final URL through the existing `AIMediaModel` flow.

No route, request payload, response shape, socket event, queue name, environment variable, or database schema changes in Phase 1.

## Validation

Validation occurs before creating files or spawning a process:

- Blueprint must be an object with a timeline array.
- Aspect ratio is limited to the values already accepted by the local render pipeline.
- Resolution is limited to `720p` or `1080p`.
- Render/job identifier must be a non-empty server-generated value.
- Timeout must use a bounded server default and cannot be overridden by the client.

Existing media URL normalization remains in place. Phase 1 does not add arbitrary user-authored HTML input.

## Error Model

Introduce internal error codes:

- `RENDER_ADAPTER_UNAVAILABLE`
- `RENDER_INPUT_INVALID`
- `RENDER_PROCESS_START_FAILED`
- `RENDER_PROCESS_TIMEOUT`
- `RENDER_PROCESS_ABORTED`
- `RENDER_PROCESS_FAILED`
- `RENDER_OUTPUT_MISSING`
- `RENDER_UPLOAD_FAILED`

Errors exposed to persisted user-visible logs remain concise and contain no command line, local filesystem path, environment value, raw provider response, or stack trace.

Detailed diagnostics may be written to server logs after sanitization and truncation.

## Progress

The adapter emits monotonic progress only within the Hyperframes portion of the existing worker range. It reports these stages:

- Runtime check.
- HTML preparation.
- Renderer start.
- Frame/video rendering.
- Output verification.
- Cloudinary upload.

The worker remains responsible for mapping adapter progress into the overall job progress and for fallback messages.

## Runtime and Deployment

The application keeps the existing `hyperframes` and `ffmpeg-static` dependencies.

At worker startup or first use, the adapter checks:

- Hyperframes executable availability.
- FFmpeg availability required by Hyperframes.
- Write access to the OS temporary directory.

Missing dependencies fail the Hyperframes attempt with `RENDER_ADAPTER_UNAVAILABLE`, allowing the existing Remotion/FFmpeg fallback policy to continue.

No Playwright or upstream `html-video` monorepo package is added in Phase 1.

## Testing

Unit tests cover:

- Adapter registry registration, duplicate rejection, lookup, and unknown-engine rejection.
- Hyperframes capability reporting.
- Input validation before filesystem or process activity.
- Argument-array process invocation with shell mode disabled.
- Success result and durable upload URL.
- Non-zero exit, missing output, timeout, abort, and upload failure.
- Cleanup on every terminal path.
- Truncated and sanitized diagnostics.

Worker tests cover:

- Hyperframes adapter success skips Remotion and FFmpeg.
- Hyperframes failure preserves the current Remotion fallback.
- Hyperframes and Remotion failure preserves the current FFmpeg fallback.
- Existing progress, status, socket events, and response contracts remain unchanged.

Verification requires focused tests, `npm run typecheck`, and `npm run build`.

## Rollout

The adapter-backed Hyperframes path remains controlled by the current renderer selection behavior. No new user-facing feature flag is introduced in Phase 1 because the change preserves the existing entry points and fallback order.

Server logs identify adapter engine, safe error code, elapsed time, and whether fallback was used. They do not include rendered HTML, secrets, or full local paths.

## Acceptance Criteria

- Existing video-edit API and UI require no changes.
- A successful Hyperframes render still returns a Cloudinary URL.
- Hyperframes is executed without a shell command string or `npx`.
- Timeout and abort terminate the renderer process.
- Temporary files are removed on every terminal path.
- Hyperframes failure continues to Remotion and then FFmpeg according to the current policy.
- Persisted error/log text contains no raw command, secret, or local path.
- Focused tests, typecheck, and production build pass.

## Non-Goals

- Importing `html-video` templates.
- Supporting arbitrary user HTML or JavaScript.
- Adding a new Video Studio tool.
- Changing render models, MongoDB schemas, queues, sockets, routes, or API payloads.
- Replacing Remotion or FFmpeg.
- Adding multi-frame content graphs, AI soundtrack, or campaign rendering.
