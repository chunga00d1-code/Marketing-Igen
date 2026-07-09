---
name: safe-code-change
description: Guardrails for safe code changes in this repository. Use when Codex is asked to add, edit, refactor, lint-fix, typecheck-fix, build-fix, review, or otherwise modify code while preserving existing behavior, user changes, UTF-8 text, and verification discipline.
---

# Safe Code Change

Use this skill before modifying code in this repository. It is the default safety layer; combine it with `repo-lint-fix`, `frontend-change`, or `backend-api-change` when those more specific tasks apply.

## Workflow

1. Inspect repo state first with `git status --short`.
2. Read relevant files before editing. Prefer `rg` for search.
3. Keep edits small and local to the request.
4. Preserve existing user changes; never revert unrelated modified files.
5. Use `apply_patch` for manual edits.
6. Avoid broad automated rewrites on a dirty worktree unless the user explicitly approves the exact rewrite.
7. Verify with the narrowest useful command, then report the result.

## Lint Fix Policy

- Fix code, not config, unless the user explicitly asks to change lint config.
- Do not change `eslint.config.js` to silence errors by default.
- Use file-level or line-level ESLint directives only for legacy/dynamic code where a typed refactor is risky.
- Scope directives to exact rules, for example:

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
```

- Do not mechanically replace every `any` with `unknown` across the repo without updating use sites.

## Behavior Preservation

- Keep API responses, UI state, validation messages, routes, env names, socket events, webhook behavior, queue names, and database access unchanged unless requested.
- Prefer adding narrow guards over broad refactors.
- Do not edit lockfiles, Docker files, package scripts, or config files unless they are directly part of the request.

## Encoding Policy

- Preserve UTF-8.
- Be careful with Vietnamese strings and comments.
- Avoid PowerShell `Set-Content` for bulk edits to source files with non-ASCII text.
- If mojibake, replacement characters, or BOM artifacts appear, pause and inspect bytes/encoding before continuing.

## Verification

- Run `npm run lint` after lint fixes.
- Run `npm run typecheck` after TypeScript type/interface changes.
- Run `npm run build` after build, routing, dependency, or bundling changes.
- If a command cannot run, say why and what remains unverified.
