---
quick_id: 260630-uod
slug: fix-pre-push-lint-failure-ignore-cjs-in-
title: Fix pre-push lint crash — ignore **/*.cjs in eslint config
date: 2026-06-30
status: complete
---

# Quick Task 260630-uod — Summary

## What changed (commit `bc3a2b3a`)
`eslint.config.mjs` — added `'**/*.cjs'` to the `ignores` array (parallel to the
existing `'**/*.js'`). Node CommonJS scripts are not in the typed TS project, so
typed-lint rules crashed eslint with exit 2 on `scripts/verify-branding.cjs`.

## Why
The pre-push hook (`pnpm lint` → `eslint --cache .`) was aborting before it could
evaluate the codebase, masking real findings since `verify-branding.cjs` landed
(`6040f551`).

## Verification
- `npx eslint --no-cache scripts/verify-branding.cjs` → file ignored, no crash.
- `pnpm lint` now runs to completion (exit 1 on real findings rather than exit 2
  crash).

## Discovered (follow-up task)
Fixing the crash exposed **93 pre-existing lint errors** in the Steam
store-manager code:
- `steam/__tests__/library.test.ts` (43), `steam/library.ts` (19),
  `steam/games.ts` (15), `steam/__tests__/user.test.ts` (14), `steam/user.ts` (2).

These block the pre-push hook and are being addressed as a separate task before
pushing to `gamelib`.
