---
name: video-caption-pipeline
description: Design, implement, review, or debug the shared video-caption workflow in this marketing ERP, including speech-to-text subtitles, RAG-grounded contextual overlays, caption timelines, rendering, background queues, company knowledge, and automated-campaign integration. Use for any change to captions or subtitles inside the Video tab.
---

# Video Caption Pipeline

Build captions as a reusable media pipeline, not as a provider-specific option. Keep speech subtitles, contextual on-video text, and social-post descriptions as separate concepts and data.

## Required Reading

Before planning or changing this feature, read [references/architecture.md](references/architecture.md) completely.

Use this skill together with:

- `safe-code-change` for every repository edit.
- `frontend-change` when changing the Video tab, editor, timeline, preview, or client services.
- `backend-api-change` when changing models, APIs, RAG, media services, queues, storage, or rendering.
- `automated-marketing-campaign` when captions are generated for scheduled campaign slots. Also read that skill's campaign architecture before editing.

## Classify The Requested Work

Identify which capability is in scope before editing:

1. `speech`: transcribe audible speech and preserve word/segment timing.
2. `context`: generate scene-aware on-video text from explicit input, linked content, campaign data, and verified company knowledge.
3. `combined`: display speech and contextual text in separate lanes with collision handling.
4. `knowledge`: manage reusable company documents and retrieval outside the Sale module.
5. `render`: preview, export subtitle files, or burn captions into a final video.
6. `campaign`: generate and render captions just in time for an autonomous slot.

Do not call contextual marketing text “speech-to-text,” and do not confuse either mode with the TikTok/Facebook post description.

## Implementation Workflow

1. Run `git status --short` and preserve unrelated user changes.
2. Trace the existing Video-tab route, media record, upload/storage flow, RAG service, campaign/content links, and worker conventions.
3. Select the earliest incomplete rollout phase from the architecture unless the user explicitly changes priority.
4. Define or update shared contracts before wiring UI:
   - project and segment schemas;
   - API request/response shapes;
   - queue payload and idempotency key;
   - provider adapter boundaries;
   - progress and terminal error states.
5. Add backend behavior with tenant scoping, permission checks, leases, bounded retries, provenance, and audit data.
6. Add UI states for input, generation progress, partial results, editing, validation warnings, retry/cancel, review, and final render.
7. Verify the smallest changed layer first, then run the repository checks required by the companion skills.

## Non-Negotiable Rules

- Make captions a shared Video-tab capability; do not couple the domain model to HeyGen, Veo, or one renderer.
- Persist editable caption projects, segment versions, source references, jobs, output assets, provider errors, and costs.
- Scope every project, document, retrieval, job, and output to the authenticated company and permitted user.
- Run analysis, transcription, contextual generation, and final rendering in backend workers. The browser may close without losing work.
- Use atomic leases, idempotency keys, bounded concurrency, capped retries, and explicit terminal states.
- Reuse cached transcript and scene analysis by video fingerprint. Render a lightweight preview before an approved final render.
- Prefer context in this order: explicit user input, linked selected marketing content/campaign slot, verified company knowledge, then visual inference.
- Require provenance for business claims in contextual captions. Unsupported claims must be removed or flagged for review.
- Time contextual captions from scene boundaries and reading duration, not by evenly dividing total video duration.
- Keep Sale behavior compatible while moving company knowledge into a shared domain.
- Campaign creation stores caption policy only. Generate actual captions in workers after the winning content exists.
- Never mark a TikTok/video slot publish-ready until the required final video is completed and reachable.

## Verification

Test the layers affected by the change:

- unit: timestamp normalization, segmentation, readability limits, collision rules, source validation, and state transitions;
- integration: provider adapters, tenant-scoped RAG, signed media access, queue retry/lease recovery, idempotency, and render completion;
- visual: Vietnamese fonts/diacritics, safe areas, portrait/landscape layouts, and representative golden frames;
- end to end: upload/select video, generate, edit, save, leave/reopen, render, and campaign handoff when applicable.

Report which checks passed, which failed, and which provider-dependent behavior remains unverified.
