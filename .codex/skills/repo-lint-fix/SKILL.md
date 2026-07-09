---
name: repo-lint-fix
description: Lint fixing workflow for this repository. Use when Codex is asked to fix ESLint errors, remove warnings, clean lint output, or make `npm run lint` pass without changing lint configuration or runtime behavior.
---

# Repo Lint Fix

Use with `safe-code-change`.

## Steps

1. Run `npm run lint` or `npx eslint . -f json -o lint-report.json` to get exact failures.
2. Group issues by rule and file before editing.
3. Fix real code issues locally when low risk.
4. Use narrow ESLint directives only for legacy/dynamic code where a refactor would risk behavior.
5. Do not modify `eslint.config.js` unless explicitly requested.
6. Delete `lint-report.json` or any temporary report before finishing.
7. Run `npm run lint` again and require clean output.

## Rule Handling

- `@typescript-eslint/no-explicit-any`: prefer existing local types; otherwise use a narrow directive for legacy integration boundaries.
- `@typescript-eslint/no-require-imports`: convert to ESM only when safe; otherwise use a narrow directive for dynamic require patterns.
- `react-hooks/exhaustive-deps`: do not blindly add dependencies if it changes effect timing; use `useCallback`/`useMemo` only when behavior remains stable.
- `react-refresh/only-export-components`: split helpers only when low risk; otherwise use a narrow directive.
- `no-unused-vars`: remove only when clearly dead. If a prop/API shape is intentionally reserved, prefix with `_` or use a directive.

## Encoding Guard

- Do not use PowerShell `Set-Content` for bulk lint edits.
- Preserve Vietnamese strings exactly.
- If lint suddenly reports `no-irregular-whitespace`, binary files, or parse errors after an edit, suspect encoding damage and stop to inspect bytes.
