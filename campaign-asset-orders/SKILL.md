---
name: campaign-asset-orders
description: Design, plan, implement, review, or debug the campaign asset-order workflow that turns each campaign post slot into a concise image/video production brief for Bulk Create. Use for order tables, AI fill-all/per-row generation, campaign-slot mapping, Facebook-only delivery fields, order import/export, approvals, provenance, validation, and media-production handoff.
---

# Campaign Asset Orders

Use this skill together with:

- `safe-code-change` for every repository edit.
- `frontend-change` for the spreadsheet-like order table, inline editing, AI actions, and import UX.
- `backend-api-change` for order schemas, APIs, validation, AI jobs, idempotency, wallet, and migrations.
- `campaign-content-sheet` when order rows are derived from campaign slots or share spreadsheet behavior.
- `automated-marketing-campaign` when orders affect slot readiness, media generation, approval, scheduling, or publishing.

## Product contract

Treat an asset order as a production brief, not as a second content calendar:

- One campaign slot/post maps to one canonical order row.
- The server derives the row set from campaign slots; never create an arbitrary order count disconnected from posts.
- AI chooses the required media format per post: `image` or `video`.
- This release serves Facebook only. Keep the field visible but fixed to `Facebook` until another platform is explicitly implemented.
- Keep copy concise because image orders feed Bulk Create and video orders feed a script/media workflow.
- Bulk Create may import orders, but orders remain the source brief and must not be silently mutated by import.
- Preserve a human-editable override for every AI-generated field.

## Required architecture reading

Read [references/architecture.md](references/architecture.md) completely before planning or changing this feature. Read the existing campaign-content-sheet and automated-marketing architecture references when the change crosses their boundaries.

## Delivery workflow

1. Inspect the dirty worktree and preserve unrelated edits.
2. Trace campaign, slot, order, content calendar, Bulk Create, media, approval, wallet, and publishing flows.
3. Identify the earliest incomplete phase in the architecture reference.
4. Define/validate the order-to-slot contract before changing UI.
5. Keep canonical campaign/slot scheduling and publishing fields outside the order's custom brief fields.
6. Generate AI proposals with structured output keyed by `orderId`; apply only valid fields and record provenance.
7. For fill-all, use a background job or bounded batch operation with idempotency, progress, cost estimation, cancellation, and partial-failure reporting.
8. Autosave cell edits with tenant scope, permission checks, optimistic concurrency, and field-level validation.
9. Make Bulk Create import explicit, previewable, and reversible; map image fields without losing source order IDs.
10. Verify targeted API/UI behavior, then run lint, typecheck, and build as appropriate.

## Non-negotiable safeguards

- Never silently overwrite non-empty user fields; AI fill-all must report skipped/overridden fields.
- Never allow an order without a valid campaign slot in the canonical campaign view.
- Enforce one order per slot with a unique partial index or equivalent transactional guard.
- Scope every read/write by `companyCode`, campaign ID, and permissions.
- Validate media-dependent fields: image rows require concise title/caption/visual description; video rows require a script.
- Charge AI usage per actual operation and protect retries with idempotency keys.
- Keep AI proposal, applied values, author, timestamp, model, and revision auditable.
- Do not invent prices, promotions, product claims, contact details, or guarantees.
- Do not mark a slot media-ready merely because an order exists; media production and verification remain separate states.
- Preserve backward compatibility for legacy order rows during migration.

## Handoff

Report the phase completed, order/slot schema and index changes, API contracts, UI states, import/export mapping, AI and wallet behavior, migration/backfill needs, verification performed, and the next safe phase.
