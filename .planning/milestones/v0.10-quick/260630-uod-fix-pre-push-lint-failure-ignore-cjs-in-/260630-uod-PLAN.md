---
quick_id: 260630-uod
slug: fix-pre-push-lint-failure-ignore-cjs-in-
title: Fix pre-push lint crash — ignore **/*.cjs in eslint config
date: 2026-06-30
status: planned
---

# Quick Task 260630-uod: Fix pre-push lint crash on .cjs files

## Problem

The pre-push hook runs `pnpm lint` (`eslint --cache .`), which **crashes**
(exit 2) on `scripts/verify-branding.cjs`:

> Error while loading rule '@typescript-eslint/await-thenable': You have used a
> rule which requires type information, but don't have parserOptions set to
> generate type information for this file.

The eslint flat config ignores `build/`, `**/*.js`, and `eslint.config.mjs`, but
NOT `**/*.cjs`. Node CommonJS scripts aren't part of the typed TS project, so
typed-lint rules can't resolve type info for them and eslint aborts the whole
run. This has masked all real lint findings since `verify-branding.cjs` landed
(commit `6040f551`).

## Task

### Task 1 — Ignore .cjs in eslint flat config
- **files:** `eslint.config.mjs`
- **action:** Add `'**/*.cjs'` to the `ignores` array, parallel to the existing
  `'**/*.js'` entry.
- **verify:** `npx eslint --no-cache scripts/verify-branding.cjs` no longer
  throws the parser/type error (file is skipped).
- **done:** `pnpm lint` runs to completion instead of crashing on .cjs.

## Note
Fixing this crash exposes 93 pre-existing lint errors in the Steam store-manager
code (separate task — those were hidden behind this crash).
