---
phase: 41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-
plan: 07
subsystem: testing
tags: [i18n, jest, lint, gate-honesty, entry-point-guard, review-derived]

# Dependency graph
requires:
  - phase: 41-i18n-gate-honesty-make-the-translation-and-hardcoded-string- (41-06)
    provides: meta/lintTranslations.ts in its post-GAP-1/GAP-2 state (guard shifted ~85 lines down)
provides:
  - "The CLI entry-point guard requires require.main === module AND an unset JEST_WORKER_ID, closing the non-bundled/non-jest import hole neither condition alone covered"
  - "The guard's comment states only claims measured in this repo (ts-jest require.main behaviour, esbuild --bundle module-scope collapse), replacing a comment whose central claim was empirically false"
  - "R5 observes main()'s unconditional lint-translations[...] summary line via a console.log spy, instead of process.exit -- and was measured RED under the sabotage its predecessor could not detect"
affects: [future work touching meta/lintTranslations.ts's entry-point guard or R5]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Entry-point guard combining require.main === module (refuses non-bundled, non-entry-point imports) with an env-var check (refuses jest AND covers the case where --bundle collapses require.main === module to always-true)"
    - "Non-vacuity proof pattern: sabotage the OLD assertion, measure it still passes; rewrite the assertion to key off a real unconditional side effect; sabotage again, measure the NEW assertion genuinely fails; revert by hand; confirm zero diff before proceeding"

key-files:
  created: []
  modified:
    - meta/lintTranslations.ts
    - meta/__tests__/lintTranslations.test.ts

key-decisions:
  - "require.main === module was ADDED to the guard, not substituted for JEST_WORKER_ID -- runTs.cjs's esbuild --bundle collapses all source modules into the outfile's single module scope, so require.main === module is true for ANY bundled import regardless of source file. JEST_WORKER_ID is the only condition that still refuses execution inside that bundle under jest; require.main === module in turn refuses non-bundled, non-jest imports (a direct require() or ad-hoc script) that JEST_WORKER_ID never covered. Neither condition is redundant."
  - "R5 was rewritten in place, not supplemented with a new test -- it is the same behavioural claim (import purity), now backed by an assertion that can actually fail"
  - "The abandon condition (revert the guard, keep the R5 rewrite) did NOT fire -- pnpm lint-translations:gamelib was measured still printing its summary line and exiting 0 after the guard change"

requirements-completed: [REQ-41-01]

# Metrics
duration: ~35 minutes
completed: 2026-09-06
---

# Phase 41 Plan 07: Entry-point guard honesty and R5 non-vacuity Summary

**The CLI entry-point guard now requires `require.main === module && !process.env.JEST_WORKER_ID` with a comment stating only measured claims, and R5 was rewritten to observe `main()`'s unconditional summary line — measured RED against the exact sabotage its `process.exit`-only predecessor could not detect.**

This is a review-derived plan (CR-03, WR-01 from `41-REVIEW.md`, both independently re-confirmed in `41-VERIFICATION.md`). Neither finding falsified a literal stated must-have from the original phase, so neither was scored as a verification gap — but both are real, and WR-01 in particular matches a bug class (`meta/genI18nGateScope.ts` overwriting the artifact it measures) this repo has already materialized once.

## Task Commits

1. **Task 1: Make the entry-point guard's conditions and its comment both measured, and give R5 the ability to fail** — `2ac88fcf6` (fix) — 2 files changed, 80 insertions(+), 18 deletions(-)

## Locating the guard (line numbers were stale, as the plan warned)

The plan's line numbers (`:653-663` for the guard, `:180-192` for R5) were all pre-41-06 and wrong. The guard and `main()` were located by content:

- `grep -n "JEST_WORKER_ID" meta/lintTranslations.ts` → guard at lines 735-743 (pre-edit), comment+guard now at lines 735-769 (post-edit, 34 lines added).
- R5 located by its test title (`'REQ-41-02: importing the module performs no side effects...'`) at line 261 (pre-edit) in `meta/__tests__/lintTranslations.test.ts`.
- `main()` declared starting at line 692; its two exit paths (write-baseline branch with no summary line; normal path with an unconditional `console.log('lint-translations[...]...')` followed by a conditional `process.exit(1)`) confirmed by reading `:692-733`.

## Non-vacuity proof — measured, not assumed (per the plan's mandatory two-part demonstration)

### Part 1 — the OLD R5 measured still PASSING under sabotage (proving vacuity)

Sabotage applied: the guard's `if (!process.env.JEST_WORKER_ID) { main() }` was replaced by hand with a bare, unconditional `main()`.

Command: `npx jest --selectProjects Meta --runInBand --testPathPattern lintTranslations -t "process.exit on import"`

Observed (verbatim, key lines):

```
  console.log
    lint-translations[gamelib,gamepage,login,translation]: 8310 findings, 0 hard failures

      at main (meta/lintTranslations.ts:726:11)

PASS Meta meta/__tests__/lintTranslations.test.ts
  lintTranslations (REQ-41-02)
    ✓ REQ-41-02: importing the module performs no side effects (no process.exit on import) (726 ms)

Test Suites: 1 passed, 1 total
Tests:       24 skipped, 1 passed, 25 total
```

`main()` genuinely ran at import time — its own 8310-finding CLI summary line was printed to the test's console output — and the test still reported **PASS**, because `process.exit` was never called (zero hard failures against the committed tree). This is the measured proof that the old R5 could not fail under this exact defect.

Sabotage reverted by hand (edited the bare `main()` back to the guarded form). `git diff --stat -- meta/lintTranslations.ts` confirmed empty before proceeding.

### R5 rewritten

R5 now installs a `console.log` spy before `jest.resetModules()`, explicitly unsets `LINT_TRANSLATIONS_WRITE_BASELINE` for the duration (saved/restored in a `finally`, mirroring R15's existing pattern) so the import cannot land on the write branch and skip the summary line, and asserts zero `console.log` calls whose first argument contains `'lint-translations['`. The `process.exit` spy is kept as a second, narrower assertion. The docstring's refuted inference ("proving process.exit was not called is proof that main() never ran") was deleted and replaced with the actual, measured basis for the new assertion.

Measured against the correct (unsabotaged) guard first, to confirm no regression:

```
PASS Meta meta/__tests__/lintTranslations.test.ts
    ✓ REQ-41-02: importing the module performs no side effects (no main() run on import) (2 ms)
Tests:       24 skipped, 1 passed, 25 total
```

### Part 2 — the NEW R5 measured genuinely FAILING under the identical sabotage

Same sabotage reapplied (bare, unconditional `main()`).

Command: `npx jest --selectProjects Meta --runInBand --testPathPattern lintTranslations -t "no main.. run on import"`

Observed (verbatim):

```
FAIL Meta meta/__tests__/lintTranslations.test.ts
  lintTranslations (REQ-41-02)
    ✕ REQ-41-02: importing the module performs no side effects (no main() run on import) (36 ms)

  ● lintTranslations (REQ-41-02) › REQ-41-02: importing the module performs no side effects (no main() run on import)

    expect(received).toHaveLength(expected)

    Expected length: 0
    Received length: 1
    Received array:  [["lint-translations[gamelib,gamepage,login,translation]: 8310 findings, 0 hard failures"]]

      310 |         typeof call[0] === 'string' && call[0].includes('lint-translations[')
      311 |     )
    > 312 |     expect(summaryLineCalls).toHaveLength(0)
          |                              ^
      313 |     expect(exitSpy).not.toHaveBeenCalled()

Test Suites: 1 failed, 1 total
Tests:       1 failed, 24 skipped, 25 total
```

The new R5 fails precisely on the defect it exists to catch (it captured `main()`'s summary line via the console.log spy, exactly as designed), not on an unrelated assertion. Sabotage reverted by hand. `git diff --stat -- meta/lintTranslations.ts` confirmed empty before applying the real guard change.

## The real guard change (Step 3)

```ts
if (require.main === module && !process.env.JEST_WORKER_ID) {
  main()
}
```

Comment (final text, each claim tied to where it was measured):

1. States the previous comment's claim that `require.main === module` "would run this at import time under test too" was measured false, independently, by the reviewer and verifier — under ts-jest, `require.main` resolves to the **test file's** own module, not this module, so `require.main === module` is `false` here under jest. Names `41-REVIEW.md` CR-03, `41-VERIFICATION.md` WR-01, and this plan's own re-measurement (above) as the sources.
2. States why `require.main === module` is **added**, not substituted: `runTs.cjs` compiles the entry with esbuild `--bundle` before spawning `node <outfile>`, and bundling collapses every source module into the outfile's single module scope — so `require.main === module` is `true` inside the bundle regardless of which source file the code came from. `require.main === module` alone cannot refuse a bundled import by another entry; `JEST_WORKER_ID` covers that hole. `require.main === module` in turn covers a hole `JEST_WORKER_ID` never did — a non-bundled, non-jest import (a direct `require()`, an ad-hoc script). States plainly that neither condition is redundant with the other.
3. Names what both conditions gate: `main()`'s `LINT_TRANSLATIONS_WRITE_BASELINE=1` branch, which overwrites the committed `meta/i18nCatalogPresenceBaseline.json` — and names the prior recorded incident (`meta/genI18nGateScope.ts`, which has no entry-point guard, running its main and overwriting the artifact it measures) as the bug class this guard exists to avoid repeating.

## Step 4 — CLI still runs `main()` after the guard change (abandon condition check)

Command: `pnpm lint-translations:gamelib`

Observed (verbatim, last lines):

```
Missing translation for zh_Hant.gamelib.webview.unavailable.platform.body (en is non-empty)
Missing translation for zh_Hant.gamelib.webview.unavailable.platform.heading (en is non-empty)
lint-translations[gamelib]: 794 findings, 0 hard failures
EXIT: 0
```

The summary line is present and matches exactly. **The abandon condition did not fire** — `require.main === module` is true for the CLI's bundled entry, as the comment's second claim states, so the guard change did not silently disable the gate.

Also measured, `pnpm lint-translations` (all four namespaces):

```
lint-translations[gamelib,gamepage,login,translation]: 8310 findings, 0 hard failures
```

Matches the plan's target exactly.

## Full verification suite (all commands run separately, none chained)

- `npx jest --selectProjects Meta --runInBand`: **37 suites, 1018 passed, 1 skipped, 1019 total.** Unchanged from the 41-06 baseline (37/1018/1/1019) — R5 was rewritten in place, not added to. Header confirmed to read `Meta`.
- `pnpm lint-translations:gamelib`: exit 0, `lint-translations[gamelib]: 794 findings, 0 hard failures`.
- `pnpm lint-translations`: exit 0, `lint-translations[gamelib,gamepage,login,translation]: 8310 findings, 0 hard failures`.
- `pnpm codecheck`: exit 0.
- `npx eslint meta/lintTranslations.ts meta/__tests__/lintTranslations.test.ts`: 0 errors, **1 pre-existing warning** at `meta/lintTranslations.ts:155` (`Unsafe return of a value of type any`) — see Deviations below; confirmed out of scope (not touched by this plan's diff, which only spans lines 732 onward).
- `npx prettier --check meta/lintTranslations.ts meta/__tests__/lintTranslations.test.ts`: both pass ("All matched files use Prettier code style!"), checked in place.
- `git status --porcelain public/locales/ meta/i18nCatalogPresenceBaseline.json`: empty — no output.
- `git diff --name-only HEAD -- src/`: empty — no output.
- `git diff --stat HEAD` (before this SUMMARY commit): exactly two files, `meta/lintTranslations.ts` and `meta/__tests__/lintTranslations.test.ts`, 80 insertions(+), 18 deletions(-).
- `git status --short`: only the two modified files staged/committed by this plan; `.claude/skills/archify/` and `skills-lock.json` (belonging to a concurrent session) left untouched throughout.
- `.planning/STATE.md` / `.planning/ROADMAP.md`: not read, not modified by this executor (orchestrator-owned).

## Deviations from Plan

### Out-of-scope observation (not fixed, logged)

**1. Pre-existing eslint warning at `meta/lintTranslations.ts:155`** (`@typescript-eslint/no-unsafe-return`, "Unsafe return of a value of type `any`"). This warning exists in the JSON-parsing helper (`readCatalog`'s `JSON.parse(raw)` return), far from this plan's diff (which spans lines 732-769 only, confirmed by `git diff`). It predates this plan's changes and is unrelated to the entry-point guard or R5. Per the scope boundary rule, it is logged to `deferred-items.md` and not fixed here; fixing it would require touching a function outside this task's declared `<files>`.

No Rule 1-4 code deviations occurred. The guard change and R5 rewrite match the plan's design notes exactly; the abandon condition was checked and did not fire.

### Deferred item logged

Appended to `.planning/phases/41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-/deferred-items.md`:

```
- [41-07] meta/lintTranslations.ts:155 -- pre-existing eslint warning
  (@typescript-eslint/no-unsafe-return) on readCatalog()'s JSON.parse(raw)
  return. Unrelated to this plan's guard/R5 scope; out of scope per the
  plan's declared <files>. Not fixed.
```

## Issues Encountered

None. Both sabotage/revert cycles behaved exactly as the plan predicted, and both produced the exact evidence the plan's non-vacuity requirement mandated. `git diff --stat` was confirmed empty after each revert, before the next step.

## User Setup Required

None.

## Next Phase Readiness

- CR-03 and WR-01 from `41-REVIEW.md` are closed, with durable RED/GREEN evidence recorded above rather than asserted.
- The guard's comment states only measured claims; no unmeasured assertion remains.
- `pnpm lint-translations:gamelib` continues to gate CI honestly — its summary line was directly observed after the guard change, not inferred from exit code.
- This was the last plan in phase 41's wave 2 gap-closure set (41-06, 41-07). No further gap-closure plans are pending for this phase as of this execution.

---

## Self-Check: PASSED

- `meta/lintTranslations.ts` exists and contains `require.main === module && !process.env.JEST_WORKER_ID`: FOUND (line 768).
- `meta/__tests__/lintTranslations.test.ts` contains `lint-translations[`: FOUND (3 occurrences).
- Commit `2ac88fcf6` exists in `git log --oneline --all`: FOUND.
- `git status --porcelain public/locales/ meta/i18nCatalogPresenceBaseline.json`: empty, confirmed.
- `git diff --stat HEAD` (pre-SUMMARY-commit) showed exactly 2 files: confirmed.

---
*Phase: 41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-*
*Completed: 2026-09-06*
