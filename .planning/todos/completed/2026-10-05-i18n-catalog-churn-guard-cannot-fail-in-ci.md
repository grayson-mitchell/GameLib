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

## Resolution (2026-10-05)

**Confirmed, all three parts.** `test.yml` ran only `pnpm test:ci` (+ the sidecar smoke); the
guard and its `live tree` test both used `git diff --name-only -- public/locales`, which sees
neither staged changes nor untracked files.

**Day-one check first, as required.** On the clean committed tree, `pnpm i18n` exited 0 and
`git status --porcelain --untracked-files=all -- public/locales` was empty (0 lines);
`pnpm i18n --fail-on-update` also exited 0. The "acknowledged upstream drift" the contract
describes has since been synced, so there was nothing to commit and the new CI step does not
start red.

**What changed.**

- `meta/i18nCatalogChurnGuard.ts`: new exported `listChangedLocalePaths(cwd?)` runs
  `git status --porcelain=v1 -z --untracked-files=all -- public/locales` and a pure
  `parsePorcelainZ` returns staged, unstaged, deleted and untracked paths, plus both sides of a
  rename. `--untracked-files=all` lists the files of a new locale directory instead of the
  collapsed `xx/`; `-z` keeps paths unquoted. The CLI and the jest `live tree` block both call
  it, so they cannot drift apart again. Header comment corrected.
- `.github/workflows/test.yml`: `pnpm i18n`, then `pnpm i18n-churn-guard`, then `pnpm test:ci`.
- `34.8-I18N-CONTRACT.md` (the `## An open, honest limit` section): a dated correction at the top
  says the old "will correctly fail the build" claim was not mechanically true, and what changed.
  The original record below it is kept as written.

**RED.** First a behaviour-preserving extraction (`listChangedLocalePaths` still running
`git diff --name-only`), then new tests against a disposable `mkdtemp` git repo: 3 of 7 failed —
staged change, untracked `en/gamelb.json`, and a new locale directory were all missing.
End to end on the real tree with a temporary `t('gamelb:churnProbe')` source file: `pnpm i18n`
created `public/locales/en/gamelb.json`; `git diff --name-only -- public/locales` printed
nothing (the old guard would pass); the fixed `pnpm i18n-churn-guard` exited 1 naming
`public/locales/en/gamelb.json`. Probe file and generated catalogue removed afterwards.

**GREEN.** `i18nCatalogChurnGuard.test.ts` 18/18; `fakeHomeIsolation.test.ts` green (the test's
git calls pass identity via `-c` and no `env`); `pnpm codecheck` clean; eslint clean; prettier
clean on the workflow and both meta files (all three report `"ignored": false`). The contract
`.md` is under `.planning/` (prettier-ignored), hand-matched.

**Not verified.** The workflow change was not run on GitHub Actions (no push from here). A stray
untracked file a developer leaves under `public/locales/` now fails the local
`pnpm i18n-churn-guard` and the `live tree` test too — intended, but a behaviour change.
