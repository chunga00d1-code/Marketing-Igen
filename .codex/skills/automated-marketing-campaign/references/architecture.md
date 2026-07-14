# Autonomous Campaign Architecture

## Target flow

`prompt -> strategy -> slots -> prepare worker -> candidates -> validation/scoring -> media -> verify worker -> publish worker -> analytics`

Campaign creation produces strategy and slot briefs, not final post bodies. Default timings use the campaign timezone:

- Prepare: 60 minutes before publish.
- Verify: 15 minutes before publish.
- Publish: at the slot time.
- Late-publish window: 30 minutes unless configured otherwise.

## Data boundaries

### MarketingCampaign

Store tenant/creator, title, source brief, status, timezone, date range, daily frequency, posting times, platforms, integration mapping, candidate count, lead times, minimum score, media policy, pillars, content rules, budget controls, and aggregate statistics.

Statuses: `draft`, `active`, `paused`, `completed`, `cancelled`, `failed`.

### MarketingCampaignSlot

Store campaign and tenant IDs, scheduled/prepare/verify instants, platform, integration, pillar, objective, topic brief, media type, status, attempts, lease data, winning candidate, final content ID, publish identity/URL, and last error.

Statuses: `planned`, `queued`, `generating`, `scoring`, `generating_media`, `verifying`, `ready_to_publish`, `publishing`, `published`, `retrying`, `needs_attention`, `failed`, `skipped`, `cancelled`.

### MarketingCandidate

Store slot/campaign/tenant IDs, variant strategy, title, outline, body, media prompt, voice script, score details, rejection reasons, selection flag, content hash, token/cost usage, and timestamps.

### MarketingContent

Create only for the selected candidate. Keep it compatible with Approval and Calendar views. Link it to campaign and slot.

## Candidate generation

Generate 3 candidates by default, up to 5 in high-quality mode. Assign materially different angles such as insight, story, education, social proof, objection handling, or conversion. Use bounded concurrency and pass recent campaign history to reduce repetition.

Hard validation runs before scoring:

- Required fields exist and contain no placeholders.
- Platform length and format are valid.
- Forbidden terms and campaign constraints are respected.
- TikTok body contains only caption; storyboard stays in outline.
- Required CTA/hashtags exist when configured.
- Similarity to recent campaign content stays below threshold.

Score valid candidates out of 100:

- Source-brief fidelity: 25.
- Slot objective: 15.
- Platform suitability: 15.
- Hook/engagement: 15.
- CTA/conversion: 10.
- Natural language/readability: 10.
- Novelty: 10.

Default threshold is 80. Scores 65-79 may regenerate once. Lower scores are rejected. Exhausted slots become `needs_attention` or use an explicitly configured valid fallback.

## Media policy

- Facebook may use text-only only when campaign policy permits it.
- Image slots must have a completed, reachable image before readiness.
- TikTok and video slots must have a completed, reachable video.
- Human-video slots require valid voice script, TTS/avatar render, and completed video.
- Media provider fallbacks must preserve the requested media contract.

## Worker safety

Workers run in the backend or external queue, never in React. Claim due slots with an atomic status transition and lease (`lockId`, `lockedAt`, `lockExpiresAt`). Recover expired leases. Limit concurrency separately for text, images, video, and publishing.

Use publish idempotency key: `campaignId:slotId:platform`. A retry must check stored platform IDs before creating another post.

Persist transition logs. Classify failures as retryable, validation, authentication, budget, provider, or terminal. Use capped exponential backoff and never retry terminal failures indefinitely.

## Wallet and limits

Estimate campaign cost before activation. Reserve enough balance per slot before generation. Record actual candidate/media usage and release unused reservation. Pause campaigns when balance is insufficient. Enforce maximum duration, slot count, candidates per slot, and concurrency server-side.

For a detailed breakdown of the AI Agent billing mechanism, task pricing (Premium vs. Budget Chinese models), cost estimation formulas, and worker financial flows, refer to the [Agent Billing Design Document](agent_billing.md).

## API surface

- CRUD and lifecycle under `/api/v1/marketing-campaigns`.
- Slot listing and explicit retry/skip actions.
- Internal prepare, verify, and publish worker entry points protected by a webhook secret or private queue.
- All user endpoints require auth, permission checks, and company scoping.

## Rollout plan and acceptance criteria

### Phase 1: persistent campaign plan

- Add campaign and slot models with indexes and tenant scoping.
- Change campaign-generation API to return strategy and slot briefs only.
- Update the tab to create, list, pause, resume, and cancel campaigns.
- Acceptance: refresh/browser close does not affect campaign state; no final body content is generated at creation.

### Phase 2: text candidates and selection

- Add candidate model and prepare worker.
- Generate candidates concurrently, validate, score, deduplicate, and select.
- Create final marketing content only for the winner.
- Acceptance: each due slot has an auditable winning decision and bounded retries.

### Phase 3: Facebook readiness and publishing

- Add image generation where required, verification worker, and idempotent Facebook publishing.
- Acceptance: autonomous Facebook slots publish once or end in a recoverable explicit error.

### Phase 4: TikTok/video pipeline

- Add storyboard, voice/video rendering, polling, readiness checks, and TikTok publishing.
- Acceptance: no TikTok slot publishes without a completed video and duplicate posts cannot occur.

### Phase 5: operations and optimization

- Add budget reservation, metrics, alerts, dashboards, outcome analytics, and strategy feedback.
- Acceptance: operators can explain cost, state, decision, retry, and result for every slot.

## Verification checklist

- Model indexes cover tenant/status/due-time worker queries.
- Date conversion is tested across timezone and day boundaries.
- Pause/cancel prevents future worker claims.
- Lease recovery and idempotent publish are tested.
- Partial provider failures preserve recoverable state.
- Existing Approval and Calendar behavior remains compatible.
- Targeted ESLint passes; typecheck/build results are reported accurately.
