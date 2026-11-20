---
quick_id: 260630-uxp
slug: fix-93-pre-existing-lint-errors-in-steam
title: Fix 93 pre-existing lint errors in Steam store-manager code
date: 2026-06-30
status: complete
---

# Quick Task 260630-uxp — Summary

Cleared all 93 lint errors in the Steam store-manager code (exposed once the
`.cjs` crash was fixed in 260630-uod). The pre-push hook is now green.

## Changes (commit `2f2e9487`) — all behavior-preserving

| Rule | Count | Fix |
|------|-------|-----|
| `import-x/namespace` | 40 | `library.test.ts`: `import * as gfs` + `gfs.X` → named imports `{ existsSync, readdirSync, readFileSync }` (matches `library.ts` / gog / nile). `jest.mock('graceful-fs')` auto-mock unchanged → identical behavior. |
| `no-unused-vars` | 29 | eslint config: add `argsIgnorePattern`/`varsIgnorePattern`/`caughtErrorsIgnorePattern: '^_'` to honor the leading-underscore convention the Steam interface stubs already use (matches TS `noUnusedParameters`). Plus drop the genuinely-unused `runOnceWhenOnline` import. |
| `no-unnecessary-type-assertion` | 14 | `eslint --fix` removed assertions that didn't change the type (`client.steamID!`, `as string[]` on `readdirSync`, `as string` on already-string content, etc.) in `library.ts` / `user.ts`. |
| `no-unsafe-function-type` | 10 | `user.test.ts`: bare `Function` → `(...args: any[]) => any` (awaitable; `any` is allowed in tests). |

## Decision worth noting
The `no-unused-vars` fix is a **shared eslint config change**
(`eslint.config.mjs`), not per-file suppression. Justification: the unused
bindings are positional params required by the `GameManager`/`LibraryManager`
interfaces that the Steam stubs legitimately don't use, already `_`-prefixed by
the authors. Configuring `^_` is the idiomatic fix and aligns eslint with what
TypeScript's `noUnusedParameters` already permits. It only relaxes
`_`-prefixed bindings, so it can't hide unrelated unused-var bugs.

## Verification
- `pnpm codecheck` (tsc) → exit 0
- `pnpm lint` (eslint --cache .) → exit 0 (0 errors; warnings remain, non-blocking)
- `npx jest src/backend/storeManagers/steam` → 3 suites, 128 tests pass
- Source-file diffs (`library.ts`, `user.ts`) are assertion removals only; no
  logic changes.
