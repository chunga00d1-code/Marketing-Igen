# n8n campaign production setup

## Import order

1. Import `n8n_facebook_schedule_workflow.json`.
2. Publish it and copy its production webhook URL.
3. Set that URL as `N8N_CAMPAIGN_FB_WEBHOOK_URL` on the ERP backend. Keep `N8N_FB_WEBHOOK_URL` pointing to the existing manual scheduling workflow.
4. Import `n8n_scheduler_workflow.json`.
5. Run both workflows manually once, inspect the results, then publish the scheduler.

Both imported workflows are inactive by default to prevent accidental production calls during setup.

## Environment

Configure the n8n container/process with `n8n_campaign.env.example`. The following values must match the ERP backend:

- `CAMPAIGN_WORKER_SECRET`: authenticates n8n calls to campaign worker endpoints.
- `N8N_WEBHOOK_SECRET`: authenticates ERP-to-n8n publishing and n8n-to-ERP callbacks.
- `ERP_API_BASE_URL`: public HTTPS base URL of the ERP API, without `/api/v1`.

Restart n8n after changing environment variables. Keep the real env file outside Git.

## Scheduler behavior

Every minute, the orchestrator calls these endpoints sequentially:

1. `/api/v1/marketing-campaigns/internal/prepare`
2. `/api/v1/marketing-campaigns/internal/media`
3. `/api/v1/marketing-campaigns/internal/verify`
4. `/api/v1/marketing-campaigns/internal/publish`

The backend owns slot leases, retry limits, scoring, readiness, and publish timing. n8n only orchestrates worker calls and performs the final Facebook Graph request.

## Facebook idempotency

The Facebook workflow rejects missing `idempotencyKey`, locks each key before calling Graph API, caches completed results for 30 days, and releases failed locks for retry. A processing lock expires after 20 minutes.

The workflow uses n8n global workflow static data. Use one active copy of the Facebook publisher workflow. For high-volume queue-mode deployments with concurrent main processes, replace static storage with a shared Redis/Postgres/Data Table unique-key store before increasing publish concurrency.

## Security

- Never place Page tokens or webhook secrets directly in workflow JSON.
- Keep successful and failed execution payload saving disabled on the Facebook workflow because requests contain Page access tokens.
- Restrict the webhook to HTTPS.
- Rotate both webhook secrets after any suspected exposure.
- Keep batch limits conservative until wallet, provider latency, and rate-limit metrics are available.

## Smoke test

Create one Facebook campaign with one slot at least 70 minutes in the future. Confirm the slot transitions through:

`planned -> generating -> scoring -> generating_media/verifying -> ready_to_publish -> publishing -> published`

Re-submit the same publish payload and confirm the workflow returns `duplicate: true` without creating another Facebook post.
