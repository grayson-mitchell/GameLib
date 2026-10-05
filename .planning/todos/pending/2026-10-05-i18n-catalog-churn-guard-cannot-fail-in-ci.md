---
created: 2026-10-05T00:00:00.000Z
title: "i18n catalogue churn guard cannot fail in CI — nothing runs the parser first, and git diff ignores staged and untracked files"
area: i18n
severity: medium
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 34.8"
files:
  - meta/__tests__/i18nCatalogChurnGuard.test.ts:93-105
  - meta/i18nCatalogChurnGuard.ts
  - .github/workflows/test.yml
  - .planning/phases/34.8-frontend-i18n-compliance-for-fork-added-code-retrofit-hardco/34.8-I18N-CONTRACT.md:240
---

## Problem

The live-tree test runs `git diff --name-only` on a fresh CI checkout, but no workflow runs
`pnpm i18n` first (`test.yml` runs only `pnpm test:ci`; the only i18n step is `.husky/pre-push`). The
diff is always empty, so the test is always green. Also: `git diff` without `HEAD` ignores staged
changes (the comment claims "staged or unstaged"), and it ignores untracked files.

## Failure scenario

A typo'd namespace (`t('gamelb:x')`) makes the parser write a brand-new
`public/locales/en/gamelb.json`; the guard passes. `34.8-I18N-CONTRACT.md:240` says the guard "will
correctly fail the build"; mechanically CI never sees a parser run.

## Suggested fix

- Run `pnpm i18n` in CI before the guard (expect it to go red at first on the contract's acknowledged
  upstream drift).
- Use `git status --porcelain -- public/locales` so staged and untracked files count.
- Correct the contract text.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.
