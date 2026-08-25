---
quick_id: 260825-qiy
slug: clear-the-pnpm-prettier-gate-gitignore-t
date: 2026-08-25
status: complete
type: chore
description: >
  `pnpm prettier` goes 30 failing files → 2. The 2 remaining are another session's in-flight files,
  deliberately not touched. Along the way: prettier reflowed a line and silently broke an
  `eslint-disable-next-line`, turning `pnpm lint` red again.
files_touched:
  - .prettierignore
  - .gitignore
  - 27 source/meta files (formatting only)
commits:
  - b045cba26 (ignore entries)
  - 506403793 (formatting pass + suppression repair)
---

# 260825-qiy — 30 → 2, and a formatter that broke a lint suppression

## Result

| Gate | Before | After |
|---|---|---|
| `pnpm prettier` | exit 1, **30 files** | exit 1, **2 files** |
| `pnpm lint` | exit 0 | exit 0 |
| `pnpm codecheck` | exit 0 | exit 0 |

The 2 remaining are `steam/__tests__/games.test.ts` and `Library/__tests__/filterEngine.test.ts` —
**both dirty with another session's uncommitted 08.1 work.** Running `--write` over them would
rewrite edits that are not mine. They stay failing until that work lands. **30 → 2, not 30 → 0,
and that is the honest outcome** rather than a shortfall to paper over.

## The finding: prettier silently un-suppressed a lint rule

`prettier --write` reflowed

```ts
installGuard = require('../processGuards').installUnhandledRejectionGuard
```

onto two lines in `sidecar/__tests__/sidecarRejectionGuard.test.ts`. The
`/* eslint-disable-next-line @typescript-eslint/no-require-imports */` above it then covered
`installGuard =` — and the `require` had moved one line further down, out from under it.
`pnpm lint` went **0 errors → 1**.

**A line-scoped suppression is only as stable as the formatter's line breaks.** Converted to a
block `disable`/`enable` pair, which survives reflow and matches an idiom already used elsewhere in
the same file. This is the second suppression defect in two tasks — see
[[eslint-disable-naming-a-dead-rule-suppresses-nothing]], where the comment named a rule that no
longer existed. Both are invisible by construction: a broken suppression neither warns nor fails.

This is precisely why "prove it is formatting-only" was a real gate and not ceremony.

## A measurement I got wrong, and how

I first attributed the 30 by running `prettier --check` on copies in the scratch directory.
Everything read **CLEAN**, which would have meant I introduced most of them today. That is
[[prettier-check-on-a-temp-copy-resolves-a-different-config]] reproduced exactly: a copy outside the
repo resolves a different config.

Re-measured correctly with `git show REV:path | prettier --check --stdin-filepath path` — content
from git, config resolved by the in-repo path — `installLocation.test.ts` was **already failing**
before I touched it.

**Net: exactly one of the 30 was mine** — `connectedStoresParity.test.ts`, which I added in
`5472fb015` earlier today and committed without a prettier check. The other 29 are pre-existing
backlog.

## `.gitignore` alone would not have worked

I had said gitignoring `test-results/` would drop it from the gate. **Prettier 3.7.4 does not read
`.gitignore`** — only `.prettierignore`. Both entries landed, doing different jobs: `.prettierignore`
is what removes it from `prettier --check .`, `.gitignore` is what removes it from `git status`.
`playwright-report` already sat in both, so this follows the existing convention.

## Two test failures, both proven pre-existing

Per-project jest (never a full run, never `--selectProjects` — its names are case-sensitive and it
fails open): frontend **2059 passed**, preload **140 passed**, backend **4235 passed / 3 failed**,
meta **547 passed / 1 failed**.

Neither failure is in this commit, and both were shown unrelated rather than assumed to be:

- **backend ×3** — `decompressPool.test.ts` imports nothing this commit touches (`node:crypto`,
  `node:zlib`, `node:path`, `lzma`, `../depot/*`, `backend/logger`). It fails on
  `lzmaDecoderKind()` returning `"pure-js"` where the test expects `"native"` — the native LZMA
  addon is unavailable in this environment.
- **meta ×1** — `genI18nGateScope`'s A-17 anti-rot check derives its live set from
  `git diff <baseCommit> HEAD`, i.e. **committed state only**, so an uncommitted formatting pass
  cannot reach it *by construction*. Its diff also runs the wrong way for my pass: the committed
  JSON has **3 files the live derivation lacks**, and formatting can only ever add. The missing
  entries are `PathSelectionBox/index.tsx` and `Winetricks/WinetricksSearch/index.tsx` — drift from
  the concurrent session's 34.17 and 34.6-16 commits, which touched frontend files without
  regenerating `meta/i18nForkTouchedFiles.json`. **That is a real open defect, owned by that work,
  not by this task.**

An attempt to establish the baseline with a clean worktree failed: `git worktree add` fired the
post-checkout hook and `download-helper-binaries` threw on the `PENDING-CI-PUBLISH` sentinel
([[git-checkout-fires-post-checkout-hook]]). The two targeted arguments above are stronger anyway —
they are structural, not empirical.

## Pre-push state now

`pnpm codecheck` ✓ · `pnpm lint` ✓ · `pnpm prettier` ✗ (2 files, not mine) ·
`pnpm i18n --fail-on-update` still unmeasured.
