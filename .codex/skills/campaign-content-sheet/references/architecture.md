# Campaign Content Sheet Architecture

## Table of contents

1. Product goal and boundaries
2. Current-system integration
3. User experience
4. Data ownership and domain model
5. Column and cell contracts
6. API design
7. Autosave and concurrency
8. AI generation workflow
9. Knowledge grounding and safety
10. Background jobs, billing, and operations
11. Campaign-worker compatibility
12. Security and validation
13. Performance and accessibility
14. Rollout plan
15. Acceptance criteria and test matrix
16. Decisions requiring product approval

## 1. Product goal and boundaries

Content Sheet gives campaign users a spreadsheet-style workspace where:

- one row represents one planned campaign post/slot;
- existing campaign fields are rendered automatically;
- users edit cells directly and add custom fields;
- AI fills a cell, completes a row, or fills one field across selected rows;
- user-entered and locked values remain under user control;
- all changes persist and survive refresh/browser close.

The first release is not:

- a replacement for Google Sheets;
- a design canvas or media renderer;
- a separate campaign database;
- an unrestricted formula engine;
- a mechanism that immediately publishes AI output.

Calendar answers when content is scheduled. Sheet answers which structured inputs each post contains. Both views must operate on the same canonical campaign slots.

## 2. Current-system integration

Before implementation, trace:

- `MarketingCampaign` strategy, timezone, pillars, content rules, and lifecycle;
- `MarketingCampaignSlot` schedule, platform, integration, objective, topic brief, media type, status, and final-content links;
- `MarketingCandidate` and just-in-time candidate generation;
- `MarketingContent`, Approval, and Content Calendar consumers;
- campaign worker leases, retries, idempotency, and wallet charging;
- company knowledge retrieval, especially pricing and policy documents;
- Bulk Create field bindings only as a future export/output integration.

Do not make the browser responsible for autonomous campaign execution. Content Sheet edits persist inputs and optional approved overrides; backend workers remain responsible for scheduled generation and publishing.

## 3. User experience

### 3.1 Placement

Preferred information architecture:

```text
Campaign detail
  -> Content Calendar
       -> Calendar view
       -> Sheet view
```

Use two views of the same slots instead of duplicating content into a separate tab. Preserve the existing campaign-detail navigation if adding a view toggle is too disruptive in the first phase.

### 3.2 Default system columns

Start with:

- selection;
- scheduled date/time;
- platform;
- connected Page/account;
- pillar;
- funnel stage;
- objective;
- topic/title;
- content/body override;
- CTA;
- hashtags;
- media type;
- status.

System columns may be hidden, reordered, resized, filtered, or frozen where safe. Canonical identifiers, platform, schedule, and state fields cannot be deleted or renamed into ambiguous meanings.

### 3.3 Custom columns

Allow campaign managers to add:

- short text;
- long text;
- number/currency;
- date/date-time;
- select/multi-select;
- URL;
- image/media URL;
- checkbox.

Each custom column configures:

- stable key;
- display label;
- data type;
- required flag;
- default value;
- allowed options;
- AI enabled flag;
- AI instruction;
- allowed context sources;
- sensitive-business flag;
- optional knowledge document type/scope.

Defer formulas, computed columns, cross-row dependencies, arbitrary HTML, and executable expressions.

### 3.4 Editing behavior

Support:

- direct cell editing;
- keyboard navigation;
- paste from tabular clipboard;
- row selection;
- add row;
- add/edit/archive custom column;
- filter, sort, hide, resize, and reorder;
- autosave indicator;
- dirty/error/conflict states;
- lock/unlock field;
- undo the most recent accepted batch.

Never show a successful save state until the server accepts the same row revision.

### 3.5 AI actions

Provide:

- Generate this cell.
- Complete empty fields in this row.
- Generate a selected field across selected rows.
- Complete selected rows.
- Suggest an alternative without replacing the current value.

Before multi-row execution, display:

- affected row count;
- fields to generate;
- overwrite policy;
- context sources;
- estimated wallet cost;
- model/quality mode when product policy exposes it.

Default overwrite policy is `empty_only`. Alternatives are `suggest_only` and explicit `replace_selected`. Locked fields are never writable by AI.

## 4. Data ownership and domain model

### 4.1 Canonical ownership

Keep these as canonical `MarketingCampaignSlot` fields:

- scheduled/prepare/verify timestamps;
- platform and integration;
- pillar, objective, topic brief, funnel stage;
- media type;
- lifecycle status;
- selected candidate and final content links;
- publish identity and result.

Do not mirror them only inside a generic JSON object.

### 4.2 Campaign sheet configuration

Add a bounded sheet configuration to `MarketingCampaign`, or a dedicated one-to-one model if campaign documents are already large:

```ts
interface CampaignSheetColumn {
  id: string;
  key: string;
  label: string;
  kind: "system" | "custom";
  dataType:
    | "short_text"
    | "long_text"
    | "number"
    | "currency"
    | "date"
    | "datetime"
    | "select"
    | "multi_select"
    | "url"
    | "media_url"
    | "boolean";
  systemField?: string;
  required: boolean;
  archived: boolean;
  options?: string[];
  defaultValue?: unknown;
  ai?: {
    enabled: boolean;
    instruction?: string;
    allowedSources: Array<"row" | "campaign" | "knowledge">;
    sensitiveBusinessField: boolean;
    knowledgeDocumentTypes?: string[];
  };
  display: {
    order: number;
    width?: number;
    hidden?: boolean;
    frozen?: boolean;
  };
}
```

Use stable IDs and keys. Renaming the label must not orphan existing values.

### 4.3 Slot sheet data

Store custom and editable assistant fields on the slot in a bounded map or a dedicated one-to-one row model:

```ts
interface CampaignSheetFieldValue {
  value: unknown;
  source: "system" | "user" | "ai" | "knowledge" | "import";
  locked: boolean;
  updatedBy: string;
  updatedAt: Date;
  generationId?: string;
  references?: Array<{
    kind: "campaign" | "slot" | "knowledge_document" | "knowledge_chunk";
    id: string;
    title?: string;
    version?: string;
    excerpt?: string;
  }>;
}

interface CampaignSheetRowState {
  revision: number;
  fields: Record<string, CampaignSheetFieldValue>;
  lastEditedBy?: string;
  lastEditedAt?: Date;
}
```

Prefer a dedicated `CampaignSheetRow` model when:

- row payload can become large;
- frequent autosave would create contention on worker updates to slots;
- revision history and indexes need independent lifecycle;
- campaign workers update the same slot frequently.

Recommended long-term choice: dedicated one-to-one row model keyed by `(companyCode, campaignId, slotId)`. It isolates frequent sheet edits from worker leases and slot state transitions.

### 4.4 Revisions

Persist revisions for:

- accepted AI batches;
- bulk paste;
- multi-cell updates;
- column deletion/archive;
- manual rollback checkpoints.

Store bounded patches rather than full-sheet snapshots:

```ts
interface CampaignSheetRevision {
  companyCode: string;
  campaignId: ObjectId;
  actor: { type: "user" | "ai"; id: string };
  operation: string;
  baseRevision: number;
  changes: Array<{
    slotId: ObjectId;
    fieldKey: string;
    before: unknown;
    after: unknown;
  }>;
  generationJobId?: ObjectId;
  createdAt: Date;
}
```

Define retention and maximum patch size.

## 5. Column and cell contracts

### 5.1 Validation

Validate server-side:

- normalized unique custom keys within a campaign;
- reserved system keys;
- maximum columns and rows;
- value type and maximum length;
- allowed select options;
- URL protocols;
- required fields;
- permissions for schedule/platform/status edits;
- immutable fields for published/cancelled slots.

Suggested initial limits:

- 30 custom columns per campaign;
- 500 rows per campaign sheet;
- 10,000 characters per long-text cell;
- 1,000 cells per bulk mutation;
- 100 rows per AI batch.

Confirm limits against product pricing and expected campaign sizes before implementation.

### 5.2 System-field mapping

Create a server-owned registry:

```ts
const SYSTEM_COLUMNS = {
  scheduledAt: { read: ..., write: ..., permission: ... },
  platform: { read: ..., write: ..., permission: ... },
  title: { read: ..., write: ... },
  bodyOverride: { read: ..., write: ... },
};
```

Do not use arbitrary dotted paths supplied by the client.

### 5.3 Published and in-flight rows

Define edit policy by slot status:

- `planned`, `queued`, `needs_attention`: editable according to permissions;
- `generating` through `publishing`: sensitive fields require conflict/worker policy;
- `published`, `cancelled`: read-only except internal notes;
- approved content edits must invalidate or re-run relevant approval/readiness checks.

## 6. API design

Suggested authenticated, tenant-scoped surface:

```text
GET    /api/v1/marketing-campaigns/:campaignId/sheet
PATCH  /api/v1/marketing-campaigns/:campaignId/sheet/config
POST   /api/v1/marketing-campaigns/:campaignId/sheet/columns
PATCH  /api/v1/marketing-campaigns/:campaignId/sheet/columns/:columnId
DELETE /api/v1/marketing-campaigns/:campaignId/sheet/columns/:columnId
PATCH  /api/v1/marketing-campaigns/:campaignId/sheet/rows/:slotId
PATCH  /api/v1/marketing-campaigns/:campaignId/sheet/cells
POST   /api/v1/marketing-campaigns/:campaignId/sheet/ai/preview
POST   /api/v1/marketing-campaigns/:campaignId/sheet/ai/jobs
GET    /api/v1/marketing-campaigns/:campaignId/sheet/ai/jobs/:jobId
POST   /api/v1/marketing-campaigns/:campaignId/sheet/ai/jobs/:jobId/cancel
POST   /api/v1/marketing-campaigns/:campaignId/sheet/ai/jobs/:jobId/apply
GET    /api/v1/marketing-campaigns/:campaignId/sheet/revisions
POST   /api/v1/marketing-campaigns/:campaignId/sheet/revisions/:id/revert
```

Responses should return:

- current campaign sheet revision;
- updated row revisions;
- normalized values;
- field-level validation errors;
- conflicts without discarding accepted independent updates.

Do not accept `companyCode`, price, or wallet ownership from the client.

## 7. Autosave and concurrency

Use optimistic concurrency:

1. Client loads row revision.
2. Client sends changed fields plus `expectedRevision`.
3. Server atomically updates only when revision matches.
4. Conflict returns current values and changed field metadata.
5. UI offers keep mine, accept server, or merge independent fields.

Debounce normal typing locally, but flush on blur, row navigation, modal close, and before AI actions. Keep unsaved edits locally until acknowledged.

Do not implement last-write-wins for the entire row because AI jobs, users, and campaign workers may touch related data concurrently.

## 8. AI generation workflow

### 8.1 Request contract

An AI request must identify:

- campaign and selected slot IDs;
- target field keys;
- operation: cell, row, column, or selection;
- overwrite policy;
- expected row revisions;
- optional user instruction;
- model/quality option if allowed;
- idempotency key.

### 8.2 Context construction

For each row, assemble context in this priority:

1. Existing non-empty and locked row fields.
2. Canonical slot fields.
3. Campaign brief, strategy, pillar, objective, platform rules.
4. Verified company knowledge allowed by the target column.
5. Recent campaign content for duplicate avoidance when generating creative text.

Never include unrelated company documents. Bound context per row and per job.

### 8.3 Structured generation

Request strict structured output keyed only by allowed target fields:

```json
{
  "slotId": "...",
  "fields": {
    "cta": {
      "value": "...",
      "confidence": 0.9,
      "references": []
    }
  },
  "warnings": []
}
```

Reject unknown keys, placeholders, invalid types, excessive lengths, and unsupported sensitive claims.

### 8.4 Proposal before apply

For `suggest_only` and bulk actions:

- store proposals separately from accepted row values;
- show before/after diff;
- allow accept per cell, per row, or entire valid batch;
- apply using expected revisions;
- preserve conflicts as unresolved rather than overwriting.

Single empty-cell generation may auto-apply only if product policy explicitly chooses that behavior and the revision still matches.

### 8.5 Validation and scoring

Apply:

- required/type/length validation;
- platform-specific content rules;
- forbidden terms and placeholders;
- sensitive business-field evidence checks;
- duplicate/similarity checks for creative fields;
- column-specific AI instruction validation.

Do not reuse autonomous candidate scoring blindly. Sheet generation may target one field, so score relevance, instruction compliance, evidence fidelity, readability, and novelty according to field type.

## 9. Knowledge grounding and safety

Fields such as price, discount, warranty, shipping policy, hotline, address, availability, and legal claims are sensitive.

For these fields:

- require explicit row data or matching company knowledge;
- filter knowledge by company, purpose, platform/Page, and document type;
- prefer `pricing` documents for price;
- include short provenance references;
- return `missing_evidence` instead of inventing a value;
- warn when sources conflict or are stale.

Creative fields such as hook, CTA, and image text may be generated from row/campaign context without a knowledge match, but must not introduce unsupported business facts.

## 10. Background jobs, billing, and operations

Use synchronous generation only for one small field when latency and provider limits permit. Use a backend queue/job for row, column, or multi-row operations.

Job model should include:

- company, campaign, creator;
- operation and target rows/fields;
- status and progress;
- total/completed/failed/conflicted items;
- model and provider;
- estimated and actual cost;
- idempotency key;
- lease fields;
- cancel request;
- sanitized error;
- per-row results and warnings.

Statuses:

`queued`, `processing`, `awaiting_review`, `applying`, `completed`, `partial`, `failed`, `cancelled`.

Requirements:

- bounded concurrency;
- atomic lease claim and expiry recovery;
- capped retries;
- no retry for validation or missing evidence;
- progress based on completed work, not simulated time;
- wallet balance check/reservation before execution;
- charge actual successful provider operations;
- idempotent retry and apply.

## 11. Campaign-worker compatibility

The sheet must not violate hybrid just-in-time campaign generation.

Define field policy:

- `input`: feeds slot brief/candidate generation.
- `constraint`: worker must respect it.
- `approved_override`: may replace a final field after approval rules.
- `note`: never enters public content automatically.

Recommended behavior:

- User title/topic becomes a generation constraint.
- Locked body may be used as an explicit manual override only after validation/approval.
- Custom product facts feed candidate prompts with provenance.
- AI sheet suggestions are not automatically publishable until accepted.
- Changing a field used by a ready/approved slot invalidates readiness or requests re-verification.
- Published slots remain immutable.

Document exact mappings before enabling worker consumption. Phase 1 may keep sheet data informational/editable without changing autonomous execution.

## 12. Security and validation

- Require authentication and `marketing:post` permission.
- Scope every query by `companyCode` and campaign ownership.
- Validate that selected slots belong to the campaign and company.
- Validate integration/Page access before editing platform assignment.
- Sanitize CSV/paste content and prevent formula injection in future exports.
- Reject prototype-pollution keys such as `__proto__`, `constructor`, and `prototype`.
- Rate-limit AI preview/job creation.
- Never log full private row content, knowledge chunks, tokens, or secrets.
- Record actor, operation, cost, and accepted changes for audit.

## 13. Performance and accessibility

Frontend:

- virtualize rows and columns after measured thresholds;
- avoid rerendering the entire grid per keystroke;
- cache normalized column definitions;
- use sticky headers and optional frozen key columns;
- support keyboard navigation, focus visibility, and screen-reader labels;
- expose cell errors and AI provenance without color-only indicators.

Backend:

- paginate/window rows;
- index by company, campaign, slot, and update time;
- batch row reads and writes;
- avoid one database request per cell;
- cap payload size;
- use projections for sheet view instead of loading full campaign audit/media objects.

## 14. Rollout plan

### Phase 0 — Product contracts and prototype

Deliver:

- approved system-column list;
- custom-field types and limits;
- edit policy by slot status;
- AI overwrite and review policy;
- wireframe/prototype for grid, toolbar, conflicts, and AI preview;
- decision on embedded versus dedicated row model.

Acceptance:

- Calendar and Sheet are confirmed as views of the same slots;
- system fields have one canonical owner;
- autonomous worker compatibility is documented;
- non-goals are accepted.

### Phase 1 — Read-only sheet projection

Deliver:

- tenant-scoped sheet GET endpoint;
- server system-column registry;
- Calendar/Sheet view toggle;
- virtualized/read-only grid;
- filtering, sorting, hiding, resizing, and persisted display preferences.

Acceptance:

- sheet rows exactly match campaign slots;
- dates respect campaign timezone;
- refresh/browser close does not change data;
- company isolation and permission tests pass.

### Phase 2 — Manual editing and custom columns

Deliver:

- sheet column configuration;
- dedicated row state if selected in Phase 0;
- direct cell editing;
- custom columns;
- type validation;
- autosave with optimistic concurrency;
- locks and conflict UI;
- basic revision audit.

Acceptance:

- edits survive refresh;
- concurrent edits never silently overwrite a row;
- published slots remain protected;
- adding/renaming a column preserves values;
- invalid values produce field-level errors.

### Phase 3 — Single-cell and single-row AI

Deliver:

- AI preview contract;
- structured field generation;
- empty-only, suggest-only, and explicit replacement policies;
- field locks;
- knowledge grounding;
- evidence/warning UI;
- cost estimate and wallet charge;
- accepted-change revision.

Acceptance:

- AI cannot write unknown or locked fields;
- sensitive fields require evidence;
- rejected suggestions do not mutate rows;
- revision conflicts do not overwrite newer user edits;
- provider errors leave the row recoverable.

### Phase 4 — Bulk AI jobs

Deliver:

- persistent AI job and result models;
- queue worker with lease recovery;
- selected-row and selected-column operations;
- bounded concurrency;
- progress, cancellation, partial success, retry;
- batch diff/review/apply;
- idempotency and billing audit.

Acceptance:

- browser closure does not stop jobs;
- progress reaches 100 only after terminal item results;
- retry does not double-charge or duplicate proposals;
- cancellation preserves completed proposals;
- conflicts are isolated per cell/row.

### Phase 5 — Campaign execution integration

Deliver:

- classification of sheet fields as input/constraint/override/note;
- explicit worker context mapping;
- readiness invalidation on relevant edits;
- approval integration for body overrides;
- audit links from candidate/final content back to accepted sheet inputs.

Acceptance:

- campaign creation still generates briefs, not all final posts;
- workers respect locked accepted constraints;
- sheet suggestions never publish without acceptance;
- ready slots are revalidated after meaningful changes;
- published content remains idempotent.

### Phase 6 — Import/export and optional Bulk Create handoff

Deliver only after Sheet itself is stable:

- safe CSV/XLSX import/export;
- mapping preview and validation;
- formula-injection protection;
- optional mapping of accepted fields to Bulk Create template bindings.

Acceptance:

- round-trip preserves typed values and UTF-8 Vietnamese;
- invalid imports are previewed, not partially applied silently;
- Bulk Create output links back to the correct slot without becoming the sheet's source of truth.

### Phase 7 — Hardening

Deliver:

- metrics and alerts;
- large-sheet performance tests;
- retention/cleanup jobs;
- accessibility review;
- feature flag and staged rollout;
- operational runbook.

Acceptance:

- operators can explain every AI job, cost, conflict, revision, and result;
- large supported campaigns remain responsive;
- the feature can be disabled without corrupting campaign slots.

## 15. Acceptance criteria and test matrix

### Unit

- custom-key normalization and reserved keys;
- value coercion and type validation;
- system-field mapping;
- overwrite/lock policy;
- patch and revert calculation;
- sensitive-field evidence validation;
- timezone rendering helpers;
- cost estimation.

### Integration

- tenant/permission isolation;
- optimistic revision conflict;
- column archive/rename;
- bulk mutation atomicity boundaries;
- AI structured-output validation;
- knowledge scope and provenance;
- wallet reservation/charge/release;
- queue lease recovery, retry, cancellation, idempotent apply;
- readiness invalidation.

### Frontend

- keyboard editing and focus;
- paste and validation errors;
- autosave states;
- offline/retry behavior;
- cell/row/batch AI preview;
- conflict resolution;
- long Vietnamese text and Unicode;
- virtualized scrolling and sticky columns;
- accessible error/provenance indicators.

### End to end

- open campaign Calendar and switch to Sheet;
- add custom field and values;
- refresh and verify persistence;
- generate one field and accept;
- generate selected rows, close browser, reopen, review, and apply;
- edit a generation constraint and verify campaign readiness behavior;
- ensure published rows remain read-only;
- verify company A cannot read or mutate company B's sheet.

## 16. Decisions requiring product approval

Approve these before Phase 1 or the stated phase:

1. Sheet location: Content Calendar view toggle versus standalone tab.
2. Initial system columns and which are editable.
3. Maximum custom columns, rows, and AI batch size.
4. Dedicated `CampaignSheetRow` model versus embedded slot data.
5. Default AI behavior: preview-only or auto-apply for a single empty cell.
6. Which fields are sensitive and require knowledge evidence.
7. Whether users may provide a full body override for autonomous slots.
8. Readiness/approval invalidation rules after edits.
9. Wallet pricing and whether estimates require confirmation.
10. Phase 6 priority for import/export and Bulk Create handoff.

Recommended defaults:

- Calendar/Sheet view toggle;
- dedicated row model;
- preview-only AI except explicitly approved empty-cell generation;
- `empty_only` default overwrite policy;
- 30 custom columns, 500 rows, 100 rows per AI batch;
- price/promotion/policy/contact/inventory/guarantee as sensitive;
- no Bulk Create coupling before Phase 6.
