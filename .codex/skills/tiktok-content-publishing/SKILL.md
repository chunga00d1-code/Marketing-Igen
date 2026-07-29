---
name: tiktok-content-publishing
description: Design, implement, review, or debug TikTok campaign content and Direct Post workflows in this marketing ERP. Use for TikTok video-only validation, caption generation, preview and approval UI, creator privacy settings, scheduling, publish retries, webhook completion, or media upload/Drive ingestion.
---

# TikTok Content & Publishing

Use this skill for every TikTok path in the campaign system. Keep the platform contract explicit at every boundary: planner, media ingestion, content sheet, approval, queue worker, provider call, and webhook.

## Content contract

- TikTok requires one completed video. Accept MP4, MOV, or WebM; reject AVI, image-only, text-only, missing, unreachable, or still-rendering media.
- `bodyText` is the TikTok caption only (Vietnamese, including hashtags), not a scene direction. Keep it within TikTok's 2,200-character caption limit and never silently truncate it.
- `outline` and `voiceScript` hold the storyboard and narration used to render the video. The preview must show the actual video beside the caption.
- A direct single-post upload may use the app's HTTPS media URL. Multi-post campaigns may ingest ordered Drive media, but each TikTok slot still needs a valid video.

## Required workflow

1. Create the campaign with platform `TikTok` and media policy `video`; do not create an image fallback.
2. Prepare the slot in the backend worker. Generate copy and video, ingest/probe the final URL, and persist the `MarketingContent` record before approval.
3. Keep the slot `pending_approval` until a user reviews the vertical video preview and caption.
4. On approval, collect creator-supported privacy level, comment/Duet/Stitch toggles, commercial disclosure/AIGC flags, measured duration, and explicit consent. Persist these options on the slot.
5. Enqueue a publish job only when `scheduledAt` is due. Claim the slot with an atomic lease and idempotency key before calling TikTok Direct Post.
6. Treat the provider response as asynchronous until `PUBLISH_COMPLETE`; persist `publish_id`, keep the content `processing`, and finish the slot from the verified webhook.
7. On provider failure, classify the error. Do not retry invalid media, missing permissions, missing consent, unsupported privacy, or expired credentials indefinitely.

## Guardrails

- Verify creator info immediately before publishing; use only privacy levels returned by TikTok for that creator and enforce the creator's maximum video duration.
- Do not expose TikTok approval through generic public Facebook-style links until the TikTok options have been collected. Route it to the authenticated TikTok review screen.
- Keep campaign, slot, content, provider IDs, transitions, errors, and publish URL tenant-scoped and auditable.
- Never mark a TikTok slot `published` from a client response alone; require a successful provider result or a matching webhook.

## Verification checklist

Before declaring the workflow ready, test: unsupported Drive MIME, missing video, direct upload, preview rendering, caption length, creator-option validation, scheduled queue pickup, duplicate/retry behavior, webhook success/failure, and a disconnected TikTok token.
