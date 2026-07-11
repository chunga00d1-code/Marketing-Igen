---
name: automated-marketing-campaign
description: Design, implement, review, or debug the autonomous scheduled marketing campaign pipeline in this repository, including campaign plans, time slots, multi-candidate AI generation, scoring, media rendering, background workers, retries, idempotent publishing, cost controls, and campaign UI. Use for any change to the TẠO CHIẾN DỊCH tab or automated campaign execution.
---

# Automated Marketing Campaign

Use this skill with `safe-code-change` and, as applicable, `frontend-change` and `backend-api-change`.

## Required architecture

Implement the hybrid just-in-time workflow:

1. At campaign creation, generate strategy and scheduled slot briefs only.
2. Persist campaigns and slots independently from final marketing content.
3. Before each publish time, generate multiple candidates in a backend worker.
4. Validate and score candidates, reject duplicates, then select the best valid candidate.
5. Generate and verify required media before publishing.
6. Publish from a backend worker at the scheduled time with locking and idempotency.
7. Persist every state transition, retry, error, cost, and published result.

Never depend on an open browser for campaign execution. Never generate all final posts during campaign creation. Never publish a candidate that failed hard validation or required-media checks.

## Read the architecture reference

Read [references/architecture.md](references/architecture.md) before changing campaign schemas, workers, scoring, media, scheduling, or publishing. Follow its state model, data boundaries, rollout order, and acceptance criteria.

## Implementation workflow

1. Inspect the dirty worktree and preserve all existing changes.
2. Trace the affected route, controller, service, model, scheduler, integration, and UI flow.
3. Identify the current rollout phase from the reference.
4. Make the smallest vertical slice that leaves stored state recoverable.
5. Keep tenant scoping and permissions on every campaign and slot operation.
6. Use bounded concurrency for AI and media tasks.
7. Use atomic conditional updates for worker claims and idempotent publish keys.
8. Add narrow verification for state transitions and failure paths.
9. Run targeted lint, typecheck, and production build as appropriate.

## Non-negotiable safeguards

- Store timezone-aware UTC instants; display them in the campaign timezone.
- Enforce campaign and slot ownership by `companyCode` and creator permissions.
- Separate campaign, slot, candidate, and final `marketing-content` records.
- Charge or reserve wallet cost per executed AI/media operation, not merely per HTTP request.
- Do not retry validation failures indefinitely.
- Do not allow TikTok publishing without a valid completed video.
- Do not silently downgrade required media unless the campaign explicitly allows it.
- Do not register final platform schedules before the winning content and media are ready.
- Preserve a complete audit trail for autonomous decisions.

## Handoff

Report the completed rollout phase, migrations or indexes added, verification performed, known operational dependencies, and the next safe phase.
