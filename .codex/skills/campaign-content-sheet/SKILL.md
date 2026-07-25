---
name: campaign-content-sheet
description: Design, plan, implement, review, or debug the spreadsheet-style content workspace for marketing campaigns, including campaign-slot rows, system and custom columns, direct cell editing, autosave, AI generation for cells/rows/selections, field locking, provenance, revision history, background jobs, knowledge-grounded fields, and compatibility with Content Calendar and autonomous campaign workers. Use for any change to Campaign Content Sheet, table-mode Content Calendar, campaign spreadsheet editing, or AI-assisted campaign field generation.
---

# Campaign Content Sheet

Use this skill together with:

- `safe-code-change` for every repository edit.
- `frontend-change` for the grid, cell editor, toolbar, keyboard behavior, autosave, and progress UI.
- `backend-api-change` for models, APIs, validation, revisions, AI jobs, permissions, or billing.
- `automated-marketing-campaign` when sheet data affects campaign slots, candidates, workers, approval, or publishing.

## Required reading

Read [references/architecture.md](references/architecture.md) completely before planning or changing this feature.

## Product boundary

Treat Content Sheet as a controlled editing surface over campaign slots:

- One row represents one campaign slot/post.
- System columns project canonical campaign/slot fields.
- Custom columns store campaign-specific structured input.
- AI assists with selected fields; it does not own the sheet.
- Content Calendar and Content Sheet are two views of the same slots.
- Bulk Create remains a future output consumer, not the sheet's storage model.

Do not turn the first release into a general Excel clone. Exclude formulas, arbitrary scripting, cross-sheet references, pivot tables, and real-time multi-user cursors unless explicitly prioritized later.

## Implementation workflow

1. Inspect the dirty worktree and preserve unrelated changes.
2. Trace campaign, slot, candidate, final content, approval, calendar, wallet, knowledge, and queue flows.
3. Identify the earliest incomplete rollout phase in the architecture.
4. Update shared contracts and validation before wiring the UI.
5. Keep system fields canonical; never duplicate scheduling or publishing state into opaque custom cells.
6. Enforce tenant scope, permissions, optimistic concurrency, and field locks on the server.
7. Persist AI output as a reviewable patch with provenance before applying it.
8. Use background jobs for multi-row AI generation with bounded concurrency, cost estimation, progress, retry, and cancellation.
9. Verify the smallest changed layer first, then lint, typecheck, and build as required.

## Non-negotiable rules

- Never let AI silently overwrite a non-empty or locked user field.
- Never invent prices, promotions, policies, contact details, inventory, or guarantees.
- Require knowledge or explicit row evidence for sensitive business fields.
- Keep campaign, slot, candidate, final content, and sheet revision responsibilities separate.
- Preserve autonomous campaign behavior: campaign creation stores briefs, not every final post body.
- Define how approved manual sheet values constrain or override just-in-time generation.
- Store schedule instants in UTC and display them using the campaign timezone.
- Use server-side company and permission filters for every read and mutation.
- Use idempotency keys and leases for background AI jobs.
- Persist per-field source, author, timestamp, lock state, and accepted revision.
- Make bulk operations previewable, cancellable, and reversible.

## Handoff

Report:

- rollout phase completed;
- schemas, indexes, API contracts, and UI states changed;
- migration/backfill requirements;
- AI model, wallet, queue, Redis, and knowledge dependencies;
- tests and checks performed;
- remaining acceptance criteria and next safe phase.
