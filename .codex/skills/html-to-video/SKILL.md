---
name: html-to-video
description: "Build, review, or debug the production prompt-to-MP4 pipeline in this repository: normalize source data, generate safe HTML/CSS scenes, synthesize and mux contextual voice, render asynchronously, verify the final video, and preserve provenance. Use for any prompt-to-video generation, HTML/CSS composition, context ingestion, preview, voice, render queue, worker, deployment, or output-quality change; do not use this as an HTML-to-image workflow."
---

# HTML to Video

Treat HTML as an intermediate composition, not the final deliverable. The production contract is `prompt + source data -> normalized data -> HTML/CSS scene deck -> one voice track -> rendered MP4 -> verified output asset`. Do not stop at an HTML preview, screenshot, HTML-to-image export, or free-form poster. Every generated visual, narration segment, animation range, and final MP4 must be traceable to the normalized user request and its attached context.

## Required reading

Before changing this product:

1. Read `AGENTS.md` and run `git status --short`.
2. Read [references/architecture.md](references/architecture.md) completely.
3. Read `safe-code-change` for every edit.
4. Read `frontend-change` for React, preview, timeline, or client-service work.
5. Read `backend-api-change` for routes, services, workers, queues, storage, or renderer work.
6. Inspect the existing files before editing:
   - `src/components/content-studio/HtmlVideoWorkspace.tsx`
   - `src/components/content-studio/HtmlVideoBatchWorkspace.tsx`
   - `src/components/content-studio/html-video/`
   - `src/services/htmlVideoRenderService.ts`
   - `server/service/html-video/`
   - `server/service/video-edit/`

Preserve unrelated worktree changes. Keep API shapes, tenant scoping, queue names, environment variable names, Vietnamese UI copy, and existing render status semantics stable unless the request explicitly changes them.

## Non-negotiable data contract

Normalize the request before generating HTML/CSS. Preserve these fields as provenance:

- `sourceText`: the complete authoritative user request or prompt file content;
- `sourceContext`: extracted text, document facts, image/video observations, brand rules, and selected reference IDs;
- `videoSpec`: aspect ratio, resolution, duration, language, audience, platform, and CTA;
- `contentUnits`: ordered facts or teaching items that must appear on screen;
- `scenePlan`: ordered scenes with source field IDs, visible text, narration text, and time ranges;
- `renderSnapshot`: the exact sanitized HTML/CSS, voice model/voice, audio format, and render settings used for the job.

Do not invent product facts, prices, claims, names, contact details, URLs, examples, or translations. If a fact is missing, omit it or flag it for review. Keep important source phrases verbatim when the request requires exact wording.

## Required workflow

### 1. Inspect the current pipeline

Trace the real path from prompt and attachments to draft generation, sanitization, preview, voice generation, render queue, worker, upload, and history. Identify whether the change belongs to the frontend, draft service, security service, TTS service, render adapter, or persistence layer before editing.

### 2. Normalize the source data

Create a compact internal representation before asking a model for composition. Extract:

- the main subject and objective;
- ordered content units and their exact source text;
- language and pronunciation requirements;
- facts that may be shown or spoken;
- visual references and brand constraints;
- target platform and safe-area requirements;
- duration and the maximum readable words per scene.

Use the primary prompt file as authoritative context. Bound auxiliary history and reference text so the primary request is not truncated. Keep source provenance separate from generated copy.

### 3. Build the scene plan first

For every multi-item request, create an ordered plan before generating markup:

| Scene | Purpose | Source units | On-screen hierarchy | Narration | Time |
|---|---|---|---|---|---|
| opening | establish topic | title/brief | eyebrow, headline | opening sentence | `0..t1` |
| item | teach or explain one unit | exact unit IDs | dominant phrase, supporting detail | one contextual sentence | `t1..t2` |
| closing | summarize or CTA | allowed CTA | takeaway, CTA | closing sentence | `t2..duration` |

Keep one content unit per scene unless the source explicitly requires a comparison. Allocate time from content length and reading speed, not by blindly dividing duration. Ensure each scene has a readable hold interval and a complete state at its midpoint.

### 4. Generate a fixed scene composition

Generate the current structured response shape `{ html, css, voiceScript }` or the repository's versioned equivalent. Use these layout invariants:

- Use `scene-deck` as the fixed full-canvas container and `scene` for each slide.
- Make the deck and scenes isolated layers with `position`, `inset`, `overflow: hidden`, and no document scrolling.
- Render scenes one at a time in source order using opacity crossfade or horizontal movement. Never use vertical page flow, scroll-snap, `translateY`, or a tall column of slides as the main transition.
- Use normal flex/grid flow only inside an individual scene.
- Use one full-duration animation clock shared by all scene elements. Encode timing in keyframe percentages; avoid independent `animation-delay` values that break seeking.
- Keep all essential text inside the 8%–12% safe frame and reserve platform safe areas.
- Use an intentional theme tied to the subject: multi-stop background treatment, a contrasting content surface, and restrained decorative layers. Avoid a flat white/gray page or a generic blank card.
- Use explicit pixel typography derived from the fixed canvas. Make the dominant phrase large enough to read on a phone, keep supporting text readable, and prevent any tiny text block from carrying essential meaning.
- Keep each scene visually complete when sampled at its start, middle, and end frame. Avoid clipping, overlap, empty placeholders, external assets, and browser-default styles.

Do not let the model decide scene boundaries only through CSS animation. The HTML structure must expose the scene boundaries so preview, QA, and future editors can inspect them.

### 5. Generate one continuous voice track

Create one consistent narrator and one continuous `voiceScript` from the scene plan. Keep narration in the same language as the request, preserve required phrases, and avoid labels, timestamps, stage directions, multiple speakers, or sound effects. Ensure the script fits the duration at a natural pace.

Use the configured default Gemini TTS voice and format from environment-backed configuration. Keep API keys server-side. Store the selected model, voice, audio format, sample rate, and channel count in the render snapshot. Mux the generated audio into the final MP4; do not leave voice as a detached preview-only artifact.

### 6. Keep preview and final render identical

Use one sanitized composition document for iframe preview, seeking, and the renderer. A paused preview must represent the exact frame at the selected time. Play/pause and seek must control the same full-duration animation clock used by final rendering. Do not create a separate thumbnail-only layout that can hide scene or typography defects.

### 7. Validate before charging or rendering

Validate in this order:

1. Parse the structured model response strictly.
2. Check source size, allowed tags, attributes, CSS, and media slots.
3. Check data fidelity and reject unsupported factual additions.
4. Check scene count, ordering, full-canvas isolation, and non-overlapping timing.
5. Check readable typography, safe margins, contrast, background treatment, and absence of scrolling or vertical transitions.
6. Check that `voiceScript` is non-empty when narration is required and belongs to the same scene sequence.
7. Only then deduct credits, persist the immutable render snapshot, enqueue the job, and publish the output URL after verified completion.

When a draft fails a quality check, retry generation with the exact failure category. Never silently downgrade to a static poster, a page-like vertical layout, a missing voice track, or an unverified render.

### 8. Verify the output

Run the narrowest relevant tests first, then the repository checks required by the companion skills. For visual changes, inspect representative frames at the first, middle, and last scene, in both portrait and landscape when supported. Verify:

- every source unit appears exactly where planned;
- no unsupported claim was introduced;
- scene transitions follow source order;
- voice and visible content remain contextually aligned;
- text is readable at target dimensions;
- audio is muxed into the final file;
- render failure and retry states remain auditable and tenant-scoped.

## Production definition of done

Before calling a prompt-to-video change production-ready:

- Keep provider keys and renderer credentials in environment-backed server configuration only; never ship them to the browser or generated HTML.
- Run draft generation and final rendering in backend workers. Do not depend on an open browser tab, localhost URL, browser fullscreen overlay, or client memory for the final artifact.
- Persist an immutable render snapshot containing source provenance, sanitized HTML/CSS, scene plan, voice settings, video settings, attempts, costs, and provider/renderer status.
- Generate the voice track and mux it into the MP4. Mark the render complete only after the output file exists, is uploaded to the intended storage, and the final media is verified to contain the expected video and audio streams.
- Return or publish an output URL only for a verified completed render. Keep queued, rendering, uploading, failed, and terminal retry states explicit and tenant-scoped.
- Use an idempotency key and worker lease so retries cannot create duplicate render jobs or publish the same video twice.
- Never include development overlays, debug text, source HTML/CSS, provider payloads, local filesystem paths, or secrets in the final media or public response.
- Test a production-like render path at the target aspect ratio and resolution, including first, middle, and last frames plus audio playback.

## Diagnosis map

- **Content appears in the wrong order:** inspect normalization and scene-plan ordering before changing CSS.
- **Multiple cards stack vertically:** inspect for normal-flow scene containers, missing `scene-deck`, scroll/overflow rules, or per-element delays.
- **Text is tiny:** inspect fixed-canvas pixel scale, content width, and whether every field was given equal low visual weight.
- **Background looks empty:** inspect the theme contract and whether the model overrode the root background with a flat color.
- **Voice is detached or silent:** inspect `voiceScript` propagation, TTS output format metadata, FFmpeg input arguments, and final mux verification.
- **Preview differs from MP4:** inspect whether preview and renderer use the same sanitized document and animation clock.
- **A render contains invented details:** inspect source/context provenance and reject unsupported model additions before billing.
- **A failed render can be duplicated:** inspect immutable snapshots, idempotency keys, worker leases, and terminal retry state.
- **The result is an image or HTML preview instead of a video:** inspect whether the request stopped before the asynchronous render worker, whether the MP4 upload was skipped, or whether the client displayed a preview URL as the final asset.
- **Development text appears in the video:** inspect the renderer document and capture path for browser chrome, fullscreen notices, localhost overlays, or debug markup; these must never be part of the composition.

## Guardrails

- Keep HTML/CSS sanitization and source-size limits intact.
- Never expose provider keys or raw provider diagnostics to the client.
- Keep all render work in backend workers; the browser may close without losing the job.
- Use bounded retries and explicit terminal failures. Do not retry missing permissions, invalid content, or exhausted budgets forever.
- Keep candidate generation separate from final render creation.
- Preserve provenance for prompt, attachments, references, scene plan, voice, renderer settings, costs, attempts, and output asset.
- Do not add manual frame-count or animation-detail fields to the primary prompt UI unless the product explicitly requires them; infer them from content and surface the result as status.

## Reference

Read [references/architecture.md](references/architecture.md) when changing contracts, scene timing, validation, audio, render snapshots, or worker behavior.
