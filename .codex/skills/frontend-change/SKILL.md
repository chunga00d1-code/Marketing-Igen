---
name: frontend-change
description: Frontend change workflow for this React/Vite/Tailwind marketing ERP repository. Use when Codex edits UI, pages, React components, hooks, client services, routing, SEO text, or frontend behavior.
---

# Frontend Change

Use with `safe-code-change`.

## Principles

- Preserve existing UX and Vietnamese copy unless the user asks to change it.
- Follow existing React, Tailwind, lucide-react, routing, service, and component patterns.
- Do not create landing pages or marketing shells when the task asks for an actual app workflow.
- Keep UI state, loading states, error states, and permission/role checks intact.
- Avoid large visual redesigns during bug fixes.

## React Safety

- Read the surrounding hook/state flow before changing dependencies.
- Do not blindly satisfy `react-hooks/exhaustive-deps` if it changes fetch timing or causes loops.
- Prefer `useCallback`/`useMemo` only when the dependency graph is clear.
- Keep component exports compatible with Fast Refresh when practical.

## Client Services

- Preserve API endpoint paths, request payloads, response parsing, auth header handling, and error parser behavior.
- Do not rename exported service functions without updating all imports.
- Treat socket event names and messenger integration data shapes as contracts.

## Verification

- Run `npm run lint` after UI lint fixes.
- Run `npm run typecheck` after changing props, service types, route config, or shared types.
- Run `npm run build` after route, lazy import, Vite, Remotion, or bundling-sensitive changes.
