---
created: 2026-09-21T00:00:00.000Z
title: "pnpm find-deadcode has NEVER passed on this fork (256 ts-prune findings) and is absent from the pre-push hook, so CI's Lint job is permanently red"
area: tooling
severity: medium
platform: any
ready: human
found_by: "quick-260921-thi (CI check after push)"
resolved_by: "quick-260922-9um"
resolution: "fixed -- baseline ratchet replaces `ts-prune --error`; gate exits 0 for the first time and now runs in pre-push"
files:
  - package.json
  - .husky/pre-push
  - .github/workflows/lint.yml
---

## Resolution (`quick-260922-9um`, 2026-09-21)

**Fixed. The `ready: human` policy choice was made: option 2 (ratchet on a committed baseline,
the way `lintScoped.cjs` does), split into TWO populations rather than one count.**

`pnpm find-deadcode` is now `node meta/findDeadcode.cjs`, which checks `unreachable` (52) and
`used-in-module` (204) against `meta/deadcode-baseline-unreachable.txt` and
`meta/deadcode-baseline-used-in-module.txt` as independent, exact SET comparisons. Real captured
exit code, not through a pipe:

```
unreachable: 52 OK | used-in-module: 204 OK     exit 0
```

**That is the first exit 0 in this fork's recorded history.** Before: exit 1, 256 findings.

Two populations rather than one count, because a single ceiling would let a regression in either
be absorbed by the other — the same reason `lintScoped.cjs` split its one warning ceiling in two
— and because the two have genuinely different remedies (delete the symbol vs. drop the `export`
keyword), so collapsing them would collapse the instruction the failure message can give.

Both diff directions FAIL, zero headroom, **proven by probe rather than argued**:

- deleted `src/backend/images_cache.ts - initImagesCache` from the ledger → exit 1,
  `+ src/backend/images_cache.ts - initImagesCache`, and the three legitimate at-the-source
  remedies named;
- appended a junk `src/does/not/exist.ts - neverExistedSymbol` → exit 1,
  `- src/does/not/exist.ts - neverExistedSymbol`, naming the one line to delete.

Both arms restored byte-identically (md5 vs `HEAD`, empty `git diff --stat`).

**No `--update-baseline` path exists, deliberately** — it would delete the `#` annotations that
document this population, and would be a one-keystroke way to admit a new finding. The ledger can
only shrink.

The rejected options from the list below are recorded in `meta/findDeadcode.cjs`'s header comment
so they read as decided rather than overlooked — including "drop `--error`", which this file
already called out as the forbidden widen-the-gate move.

`.husky/pre-push` now runs the fifth gate, so **a green pre-push predicts CI's Lint job**, which
was the other half of this todo. Measured cost: 4.7s.

### This todo's "contaminated three ways" section was right, and is now annotated in place

The `#` comment blocks in the two ledgers turn the opaque 256 into a documented inventory: the 18
`types.usage.test.ts` compile-time assertions, and the `satisfies`/`Record`/`readonly`/`Parameters`
parse artifacts quoted with the source line that produces each.

**One cluster this todo did not know about, measured during the fix:** `meta/` exports whose only
importer is a `meta/__tests__/` file are structurally invisible to ts-prune. `tsconfig.json` has
`include: ["src"]`, so ts-morph loads 1141 source files of which exactly **7** are under `meta/`
and **zero** under `meta/__tests__/`. That accounts for 51 of the 204 and 2 of the 52 — all false
positives with live callers (verified per entry). Widening `tsconfig.json` would dissolve the
cluster but is its own decision with its own blast radius; not done here.

The observation that CI triggers only on `pull_request` and never on a push to `main` is
**unaddressed** — it was deliberately not bundled into this todo and still is not.

Follow-up filed: `.planning/todos/pending/2026-09-21-the-204-entry-used-in-module-ledger-freezes-an-export-keyword-cleanup.md`.

---

## Measured

`pnpm find-deadcode` is `ts-prune --error` (`package.json:43`). `--error` exits non-zero on ANY
finding, so a single one turns the job red. Run locally at `b7686dcbb`, **real exit code 1**
(captured to a file — piping to `tail` masks it, which this repo has a recorded lesson about):

```
total findings:     256
(used in module):   204
flagged unused:      52
```

CI's Lint job step conclusions at `b7686dcbb` (`gh run view 35630464755`):

```
success  Lint code.        <- pnpm lint
success  Prettier code.    <- pnpm prettier
failure  Find dead code    <- pnpm find-deadcode
```

So `pnpm lint` and `pnpm prettier` both PASS in CI. **The Lint workflow is red solely because of
this third step.**

## It has never passed

Every recorded run of the Lint workflow on the fork, newest first:

```
2026-09-21  b7686dcbb  workflow_dispatch  failure
2026-09-15  fa2ad5030  pull_request       failure
2026-08-23  9f82e0f33  pull_request       failure
2026-07-14  842227965  pull_request       failure
2026-07-14  b8c9a2873  pull_request       failure
```

**This is not a regression to bisect.** There is no green baseline in the recorded history to
regress from. Do not go looking for the commit that broke it.

## The 256 is NOT a work list — it is contaminated three ways

Anyone who opens this expecting 256 deletions will be wrong. Measured breakdown:

1. **204 are `(used in module)`.** The export IS used — inside its own file. ts-prune is reporting
   an unnecessarily-broad `export` keyword, not dead code. Removing the `export` is a different
   (and much safer) change than deleting the symbol, and for many of these the `export` exists so a
   test can reach the symbol.
2. **~18 of the 52 are `src/backend/platform/__tests__/types.usage.test.ts` assertion helpers**
   (`assert_ipcRendererEvent`, `assert_browserWindowHandle`, …). These are exported deliberately as
   compile-time type assertions. They are false positives by design.
3. **Several entries are ts-prune PARSE ARTIFACTS, not identifiers at all** — e.g.
   `meta/releaseTags.ts:35 - satisfies`, `meta/releaseTags.ts:35 - Record`,
   `.../FilterFacetGroup/selectionCount.ts:46 - satisfies`, `- readonly`. ts-prune is mis-reading
   `satisfies` expressions. There is nothing to delete; the tool is wrong.

A census that treats the raw 256 as a backlog will therefore be wrong in both directions. Any
remedy has to start by re-deriving these buckets, not by trusting this note's numbers.

## Nothing local runs it — that is why it went unnoticed

`.husky/pre-push` runs FOUR gates:

```
pnpm codecheck && pnpm lint && pnpm prettier && pnpm i18n --fail-on-update
```

CI's Lint job runs **five** — those three plus `pnpm find-deadcode`. So **a fully green pre-push
cannot predict this job**, and no contributor runs `find-deadcode` in the normal course of work.

Compounding it: `test.yml`, `lint.yml` and `codecheck.yml` all trigger ONLY on
`pull_request: branches: [main, stable]` plus `workflow_dispatch`. **Nothing triggers on a push to
`main`.** This repo works direct-to-main, so CI had not evaluated `main` since 2026-09-15 until
this was dispatched by hand.

## Why `severity: medium` and not `major`

The gate cannot signal a NEW dead-code regression — a genuine new finding would be invisible among
256, and the job is red either way. That is a gate that cannot do its job.

But it is **visibly** red, not falsely green, so nothing is silently contaminated: the
"green check proving nothing" failure mode this repo keeps stamping out is not what is happening
here. A reader can still get the truth from the per-step conclusions, and `pnpm lint` /
`pnpm prettier` remain trustworthy inside the same job. Bounded blast radius, workaround exists →
`medium`.

`ready: human` because the remedy is a **policy choice**, not code, and the options differ a lot in
cost and in what they buy:

- Drop `--error` (report-only) — makes the job green, buys nothing, and is the "widen the gate to
  admit what failed it" move `CLAUDE.md` forbids for the todo-frontmatter gate. Named here so it is
  rejected explicitly rather than reached for.
- Ratchet on a committed baseline count, the way `lintScoped.cjs` does for warnings — turns 256
  into a ceiling that cannot grow. Consistent with existing practice in this repo.
- Configure ts-prune to skip `(used in module)` (its `--ignore`/skip options) so the signal is only
  genuinely-unreachable exports, then fix the much smaller real set.
- Fix the ~52 and accept the false positives with a suppression list.
- Add `find-deadcode` to the pre-push hook — but NOT before one of the above, or every push on this
  repo fails immediately.

Whichever is chosen, deciding it is the blocker; the edit afterwards is small.

## Related

Same shape as the i18n scope staleness closed in `260921-saw`: a CI-only gate nothing local runs,
left to rot until someone looked. Note also that CI not running on `main` means **any** of these
workflows can be red for a long time without anyone learning — that is a separate observation and
is deliberately NOT bundled into this todo.
