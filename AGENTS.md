# Repository Rules

These rules apply whenever Codex adds, edits, fixes, reviews, or verifies code in this repository.

## Default Workflow

- Start with `git status --short` and assume existing changes belong to the user.
- Read the relevant files before editing. Prefer `rg`/`rg --files` for search.
- Keep changes local to the request. Avoid opportunistic refactors.
- Use `apply_patch` for manual edits. Avoid PowerShell `Set-Content` for source files with Vietnamese or other non-ASCII text.
- Do not leave temporary reports, generated debug files, or scratch scripts in the repo.

## Preserve Behavior

- Keep runtime behavior unchanged unless the user explicitly asks for a behavior change.
- Do not revert, overwrite, or reformat unrelated modified files.
- Do not change `eslint.config.js`, `tsconfig.json`, package scripts, build tooling, Docker files, or lockfiles just to make lint pass unless explicitly asked.
- Do not run broad mechanical rewrites across the repo on a dirty worktree without explicit approval.
- If a fix requires touching many files, explain the safer plan before editing.

## Lint And Type Safety

- Fix lint in source code first.
- Use narrow file-level or line-level ESLint directives only for legacy, dynamic, generated, or vendor-like code where a typed refactor would be risky.
- Scope ESLint directives to exact rules. Do not use blanket `eslint-disable` without rule names.
- Avoid mechanically replacing every `any` with `unknown`; update call sites and verify if changing types.
- After lint changes, run `npm run lint`.

## Frontend Rules

- Keep UI behavior, state flow, routing, and copy intact unless requested.
- Preserve Vietnamese UI strings and SEO text exactly when not part of the task.
- Use existing React/Tailwind/component patterns before adding new abstractions.
- For hook dependency warnings, prefer stabilizing dependencies with `useCallback`/`useMemo` only when behavior remains the same. Otherwise document the risk.

## Backend Rules

- Keep API routes, response shapes, auth checks, tenant/company scoping, and validation messages stable unless requested.
- Preserve Joi validation behavior and Vietnamese validation messages.
- Be careful with dynamic `require()` in server code; convert to ESM only when safe and tested, otherwise use a narrow lint directive.
- Do not change environment variable names, database schemas, migrations, queue names, socket events, or webhook behavior unless requested.

## Encoding Safety

- Preserve UTF-8.
- Stop if mojibake, replacement characters, or BOM artifacts appear.
- For bulk edits, use a UTF-8-safe script or `apply_patch`; never use a tool that may rewrite files as Windows ANSI/UTF-16.
- After any encoding recovery, run `npm run lint` and inspect affected files for broken strings.

## Verification

- Run the narrowest useful command:
  - `npm run lint` for lint-only work.
  - `npm run typecheck` for TypeScript/interface/API-shape changes.
  - `npm run build` for routing, bundling, dependency, server entry, or production-impacting changes.
- Report what passed, what failed, and what remains unverified.
- Do not claim functionality is safe solely because lint passed.
