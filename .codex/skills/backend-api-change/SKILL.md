---
name: backend-api-change
description: Backend/API change workflow for this Express/Mongoose/Socket.IO marketing ERP repository. Use when Codex edits server routes, controllers, services, middleware, validation, auth, sockets, webhooks, queues, integrations, or backend API behavior.
---

# Backend API Change

Use with `safe-code-change`.

## Contracts To Preserve

- API route paths, HTTP methods, status codes, response shapes, and error messages.
- Auth middleware, role/permission checks, tenant/company scoping, and ownership checks.
- Joi validation behavior and Vietnamese validation messages.
- Socket event names and payload shape.
- Webhook signature/verification behavior.
- Queue names, job payloads, and scheduler behavior.
- Environment variable names and defaults.

## Editing Guidelines

- Read router -> controller -> service flow before editing.
- Keep controller/service boundaries consistent with local patterns.
- Do not convert dynamic `require()` to static imports unless module timing and circular dependencies are safe.
- Avoid database schema/model changes unless explicitly requested.
- Be careful with payment, wallet, auth, CRM, Messenger, TikTok, Zalo, Gemini, HeyGen, Remotion, and queue integrations.

## Verification

- Run `npm run lint` after lint-only backend edits.
- Run `npm run typecheck` after changing request/response types, models, middleware types, or service signatures.
- Run `npm run build` after server entry, dependency import, bundle, or integration changes.
