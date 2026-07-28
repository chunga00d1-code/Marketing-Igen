# Campaign Asset Orders — Architecture and Rollout Plan

## 1. Product outcome

The Order workspace converts a campaign's scheduled posts into a compact production table. Each row answers:

| Field | Meaning |
|---|---|
| Order ID | Stable identity for retries, import, and audit |
| Slot/Post | The campaign post this order serves |
| Content group | Product, team, warehouse, packshot, lifestyle, tutorial, case study, etc. |
| Shoot/capture brief | What must be photographed or recorded |
| Requirements | Angle, composition, props, lighting, emphasis |
| Format | AI-selected `image` or `video` |
| Quantity | Suggested number of assets |
| Image copy | Short headline, caption, visual description |
| Video script | Short script/shot sequence for video rows |
| Service | `Facebook` for the current release |

The table is a planning and handoff surface. It is not the final published post record and not a general spreadsheet engine.

## 2. Canonical data boundaries

```text
Campaign
  └── CampaignSlot/Post (schedule, pillar, objective, canonical post identity)
        └── CampaignAssetOrder (one production brief per slot)
              ├── AI proposal + provenance
              ├── user overrides / revisions
              └── Bulk Create import mapping

CampaignAssetOrder
  └── MediaProductionTask (future/parallel workflow)
        └── verified asset

CampaignSlot + verified asset
  └── MarketingContent / publish worker
```

Do not copy scheduling, publishing state, or platform post IDs into free-form order fields. Do not make Bulk Create the owner of order data.

## 3. Invariants

1. Every eligible campaign slot has exactly one order row.
2. An order cannot outlive its campaign slot without an explicit orphan/archive state.
3. `usageChannels` is `Facebook` only until another integration is supported end-to-end.
4. `format=image` requires image-oriented fields; `format=video` requires `videoScript`.
5. AI output is a proposal until applied; applied values retain source metadata.
6. User-entered values are never overwritten by fill-all unless the user explicitly chooses overwrite.
7. Empty or failed AI rows remain editable and retryable.
8. Order existence does not imply media readiness or publish readiness.

## 4. Rollout phases

### Phase 0 — Contract and migration

- Inventory campaign slot types, old asset-order documents, Content Calendar fields, and Bulk Create columns.
- Define the order DTO and stable slot/order IDs.
- Add a unique `(companyCode, campaignId, slotId)` guard for one order per slot.
- Backfill missing rows from eligible campaign slots using idempotent upserts.
- Preserve legacy rows with an explicit migration marker; never delete user data during backfill.

Acceptance:

- Re-running migration produces no duplicates.
- A campaign with N eligible posts returns N order rows.
- Deleted/archived slots are not recreated as active orders.

### Phase 1 — Table UX and direct editing

- Render one row per order in a horizontally scrollable table.
- Keep concise columns visible; put long legacy asset/Bulk Create controls in an expandable section.
- Autosave individual cells with debounce, field validation, dirty/saving/saved/error states.
- Fix `Facebook` as a read-only service chip for now.
- Support add-row only when it creates a new explicit order/slot relationship; do not permit disconnected rows in the canonical campaign view.

Acceptance:

- Refresh preserves edits.
- A failed save identifies the exact cell and can retry.
- Keyboard and screen-reader labels remain usable on the wide table.

### Phase 2 — AI fill one row and fill all

- Use structured AI output keyed by order ID, never positional array matching.
- For each row, AI selects image/video based on slot brief, pillar, objective, and existing media constraints.
- Image output: short title/headline, caption, and visual description.
- Video output: short script or shot sequence; avoid long prose.
- Add preview/apply for a row and fill-all for the campaign.
- Fill-all must report updated, skipped, invalid, and failed rows.

Acceptance:

- AI never changes a non-empty field by default.
- Partial batch failure does not roll back successful rows or lose the error list.
- Prompt/output cost is estimated and charged once per idempotent operation.
- Repeating the same idempotency key does not double-charge or duplicate writes.

### Phase 3 — Bulk Create import/export

- Define a versioned mapping from order fields to Bulk Create image columns.
- Provide preview with row count, unmapped fields, and validation errors before import.
- Carry `orderId` and `slotId` as hidden metadata so generated assets can be traced back.
- Import only fields supported by the current Bulk Create flow; leave video rows visible but route them to the video workflow.
- Export CSV/XLSX-compatible rows without changing canonical order records.

Acceptance:

- Importing an order set is repeatable and does not create duplicate campaigns/orders.
- Image rows can produce a Bulk Create input with concise text.
- Video rows are not silently converted to image rows.

### Phase 4 — Media production handoff

- Create explicit media-production tasks from approved image/video orders.
- Track `draft → approved → queued → generating/uploading → verified → rejected`.
- Require verified media before slot publish readiness.
- Keep order edits and media task revisions linked but independently auditable.

Acceptance:

- Rejected media returns to the order/task with a reason and retry action.
- A slot cannot publish with missing required media.
- Provider retries are bounded and idempotent.

### Phase 5 — Approval, analytics, and extensibility

- Add field/row approval and lock states.
- Add provenance/revision history and audit events.
- Add new platforms only after the Facebook contract is stable; make `usageChannels` an enum/array only with a migration plan.
- Add analytics linking order, produced asset, slot, and published content.

Acceptance:

- Every AI/user/media transition is auditable.
- New platform support cannot change Facebook behavior.
- Analytics can trace a published post back to its order and source brief.

## 5. API shape

Recommended endpoints:

- `GET /campaigns/:campaignId/asset-orders`
- `POST /campaigns/:campaignId/asset-orders` (explicit exceptional/manual row)
- `PATCH /campaigns/:campaignId/asset-orders/:orderId`
- `POST /campaigns/:campaignId/asset-orders/:orderId/ai/preview`
- `POST /campaigns/:campaignId/asset-orders/:orderId/ai/apply`
- `POST /campaigns/:campaignId/asset-orders/ai/fill-all`
- `POST /campaigns/:campaignId/asset-orders/import/preview`
- `POST /campaigns/:campaignId/asset-orders/import/apply`
- `GET /campaigns/:campaignId/asset-orders/export`

Every mutating request requires tenant authorization, a request/idempotency key where it can retry, and a stable response envelope containing row IDs and field-level errors.

## 6. AI contract

Use a strict schema:

```json
{
  "rows": [
    {
      "orderId": "…",
      "format": "image",
      "image": {
        "headline": "…",
        "caption": "…",
        "visualDescription": "…"
      },
      "video": {
        "script": "…"
      },
      "confidence": 0.0,
      "reason": "short"
    }
  ]
}
```

Reject unknown order IDs, duplicate IDs, overlong fields, unsupported formats, and claims not grounded in the campaign brief/knowledge. Store the model and prompt version with the proposal.

## 7. Local testing strategy

- In local development, provision a clearly labeled mock Facebook Page when no real Page is connected.
- Keep mock integration disabled in production (`NODE_ENV=production` or an explicit disable flag).
- Make fake publish results visibly marked as mock and never call Facebook/n8n.
- Seed a campaign with 1, 4, and 20 slots to test one-row-per-post and batching.
- Test refresh, duplicate GET/migration, concurrent fill-all, stale edits, partial AI failures, import preview, and retry.

## 8. Operational checklist

- Indexes created in every environment where auto-index is disabled.
- Worker/queue capacity and AI timeout are bounded.
- Wallet charge and idempotency records are queryable.
- Logs include campaign ID, slot ID, order ID, operation ID, and provider error.
- Metrics cover fill-all latency, skipped/failed rows, import errors, media verification, and publish readiness.

## 9. Definition of done

- N campaign slots yield N stable order rows.
- Table edits and AI proposals are tenant-scoped, auditable, and recoverable.
- AI fill-all is concise, bounded, idempotent, and non-destructive by default.
- Bulk Create can import image rows through a previewable versioned mapping.
- Video rows have a separate script/media path.
- Facebook-only behavior is explicit and production-safe.
- Lint, typecheck, relevant tests, and build status are reported.
