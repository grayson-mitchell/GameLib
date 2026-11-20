---
quick_id: 260630-uxp
slug: fix-93-pre-existing-lint-errors-in-steam
title: Fix 93 pre-existing lint errors in Steam store-manager code
date: 2026-06-30
status: planned
---

# Quick Task 260630-uxp: Fix 93 Steam-code lint errors

## Problem

The `.cjs` eslint crash (fixed in 260630-uod) was masking 93 real lint **errors**
in the Steam store-manager code. These now block the pre-push hook. All are in
fork-authored Steam files; none change runtime behavior when fixed.

Breakdown by rule:
- 40 `import-x/namespace` — `import * as gfs` + `gfs.X` in `library.test.ts`
- 29 `@typescript-eslint/no-unused-vars`
- 14 `@typescript-eslint/no-unnecessary-type-assertion` (auto-fixable)
- 10 `@typescript-eslint/no-unsafe-function-type` — `Function` type in test mocks

Files: `__tests__/library.test.ts` (43), `library.ts` (19), `games.ts` (15),
`__tests__/user.test.ts` (14), `user.ts` (2).

## Approach (behavior-preserving)

### Task 1 — Auto-fixable assertions
- `eslint --fix` the Steam dir to clear the 14 `no-unnecessary-type-assertion`.

### Task 2 — gfs namespace import (library.test.ts)
- Replace `import * as gfs from 'graceful-fs'` with named imports
  `{ existsSync, readdirSync, readFileSync }` (matches `library.ts` and the
  gog/nile convention). Rewrite `(gfs.X as jest.Mock)` → `(X as jest.Mock)`.
  `jest.mock('graceful-fs')` auto-mock still applies → identical behavior.

### Task 3 — Function type (user.test.ts)
- Replace bare `Function` types in mock helpers with explicit
  `(...args: unknown[]) => unknown` (or precise signatures where obvious).

### Task 4 — Unused vars (all files)
- Remove genuinely unused imports/vars. For intentionally-unused callback params
  required by signature, drop them or rename per the configured ignore pattern.

## Verification (all must pass)
- `npx eslint --no-cache src/backend/storeManagers/steam/` → 0 errors
- `npx tsc --noEmit` → 0 errors
- `npx jest src/backend/storeManagers/steam` → all green (behavior unchanged)
- Full `pnpm lint` exits 0

## Out of scope
- Warnings (only errors block; warnings pre-exist project-wide).
- Non-Steam files.
