---
phase: quick-261011-iel
plan: 01
subsystem: backend
tags: [winetricks, execfile, environment-banner, tdd, d-16]

requires:
  - phase: "45-11"
    provides: "the install-time environment report (recordUnsupportedWine/recordMissingDependencies) and the Winetricks tab's consumption of it, which this plan feeds earlier (at list-all time) rather than replaces"
provides:
  - "parseWineVersionOutput/isUnsupportedWineVersion in winetricksOutputClassifier.ts: a pure, winetricks-identical (script L5104/L5114/L5118) version derivation and numeric-threshold comparison"
  - "Winetricks.checkWineVersion in index.ts: a bounded, fire-and-forget execFile(wineBin, ['--version']) probe run at list-all time, gated on returnOutput"
  - "recordUnsupportedWine widened to string | null, so a probed supported wine clears a stale unsupported record left by a previously-open bottle"
  - "The closed todo with a six-paragraph Resolution recording mechanism, derivation, decision, pins, and the owed live re-score"
affects: [45-12, winetricks-settings, d-16]

actuals:
  tokens: 90000
  tasks: 3
  commits: 3
  plan_head_before: 60eddda8f
  plan_head_after: e9653556c

tech-stack:
  added: []
  patterns:
    - "execFile callback form wrapped by hand in `new Promise`, not util.promisify — a jest stand-in has no custom-promisify hook and would resolve a bare string where the real bound function resolves {stdout, stderr}"
    - "Fire-and-forget probe with a .catch() at the call site (mirrors the existing checkDependencies call in runWithArgs), gated on returnOutput so only listAvailable (not install) ever runs it"
    - "Clear-on-definitive-result: a probe records null only on a parsed, supported result; a failed/timed-out/oversized/unparseable probe changes nothing, mirroring recordMissingDependencies' existing clear-on-empty-subset precedent"

key-files:
  created: []
  modified:
    - src/backend/tools/winetricksOutputClassifier.ts
    - src/backend/tools/index.ts
    - src/backend/tools/winetricksEnvironment.ts
    - src/backend/tools/__tests__/winetricksListAvailable.test.ts
    - src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts
    - src/backend/tools/__tests__/winetricksOutputClassifier.test.ts
    - .planning/todos/completed/2026-10-11-gptk-banner-cannot-appear-at-tab-open-because-list-all-skips-the-version-check.md

key-decisions:
  - "Split the unsupported-only probe wiring (Task 1) from the clear-on-supported branch and recordUnsupportedWine's string | null widening (Task 2), matching the plan's RED/GREEN task boundary exactly; caught and reverted a scope-creep draft that had merged the two before either was committed"
  - "A failed, timed-out, oversized, or unparseable probe never clears a prior record — absence of evidence is not evidence; only a definitive supported parse clears"
  - "execFile over spawn: no shell, callback-form error surfacing (no unlistened 'error' emitter to crash the sidecar on ENOENT/EACCES), bounded by timeout+SIGKILL+maxBuffer"

patterns-established:
  - "Parity test cross-checking two independently-triggered derivations (the list-all probe's parseWineVersionOutput vs the install-time classifier's parseUnsupportedWineVersion) agree on the same winetricks-derivation steps for one binary"

requirements-completed: [45-12-G6, D-16]

duration: ~2h
completed: 2026-10-11
status: complete
---

# Quick Task 261011-iel: GPTK environment banner (D-16) cannot appear at tab open — Summary

**Added a bounded `wine --version` `execFile` probe at `list-all` time, deriving the unsupported-wine version exactly as winetricks itself does, so the D-16 environment banner can now appear the moment the Winetricks tab opens instead of only after the first install.**

## Root Cause (from the todo)

`recordUnsupportedWine` was fed only by classifying winetricks' own
`warning: Your version of wine 7.7 is no longer supported upstream` line. Winetricks sets
`_W_wine_not_needed=1` for every `list*` verb except `list-installed` (script line 5471), so
`winetricks_wine_setup` returns before its own version check (line 5119) on a `list-all` run — the
banner could never appear until the first `-q` install produced that line.

## The Fix

- **Task 1** (`3084aab25`): `Winetricks.checkWineVersion` (`index.ts`) runs
  `execFile(wineBin, ['--version'], { env: { ...envs, WINEDEBUG: '-all' }, timeout: 5000,
  killSignal: 'SIGKILL', maxBuffer: 16384, encoding: 'utf8' })`, fire-and-forget with a `.catch`
  at the call site in `runWithArgs`, gated on `returnOutput` so only `listAvailable` triggers it.
  `parseWineVersionOutput`/`isUnsupportedWineVersion` (`winetricksOutputClassifier.ts`) mirror
  winetricks' own derivation: script L5104/L5114's sed-strip of the version line, then L5118's
  `,7.99` threshold compared as three numeric fields, not strings (so `10.0` is supported,
  `7.99.1` is not).
- **Task 2** (`bae7e3ea5`): `recordUnsupportedWine` widened to `version: string | null`.
  `checkWineVersion` now writes `null` on a parsed, supported result, clearing any record a
  previously-open, older bottle left behind. A failed, timed-out, oversized, or unparseable probe
  changes nothing.
- **Task 3** (`e9653556c`): moved the pending todo to `.planning/todos/completed/` with a
  `## Resolution` section recording the mechanism, the derivation, the clear-on-supported
  decision, the test pins, and the owed live re-score.

## TDD Evidence

**Task 1 RED** (before the probe existed): 3 new tests failed in
`winetricksListAvailable.test.ts` — `getEnvironmentReport(...).unsupportedWineVersion` stayed
`null` instead of `'7.7'`, and `mockExecFile` received 0 calls instead of 1 (twice, for the probe
and the ENOENT test). Exact result: `Test Suites: 1 failed, 2 passed, 3 total; Tests: 3 failed,
66 passed, 69 total.`

**Task 1 GREEN**: 76/76 across the 4 Task 1 files.

**Task 2 RED** (before the clear-on-supported branch existed): the new test `'clears a stale
record once the bottle is switched to a supported wine, and never fires the listener on a
no-op'` failed on `expect(listener).toHaveBeenCalledTimes(2)` — "Expected number of calls: 2,
Received number of calls: 1" — because Task 1's code never clears a record. Isolated to that
file: `Tests: 1 failed, 14 passed, 15 total.`

**Task 2 GREEN**: 127/127 across the 5 Task 2 files.

## Final Verification (overall `<verification>` block, re-run against the finished state)

- Backend jest over the full winetricks suite (7 files, superset of the "five touched or
  adjacent" clause): `Test Suites: 7 passed, 7 total; Tests: 162 passed, 162 total.` The 3
  directly-touched files alone: `Test Suites: 3 passed, 3 total; Tests: 107 passed, 107 total.`
- `pnpm codecheck` (`tsc --noEmit` ×2): exit 0, no output.
- Scoped `npx eslint` over the six touched source/test files: `✖ 6 problems (0 errors, 6
  warnings)` — all six warnings are the pre-existing, unrelated `import-x/no-named-as-default-member`
  i18next caution in `index.ts`, untouched by this plan's diff. Exit 0.
- `pnpm find-deadcode`: `unreachable: 46 OK | used-in-module: 0 OK`.
- `pnpm lint` (both ceilings): `✖ 638 problems (0 errors, 638 warnings)` repo-wide (pre-existing,
  unrelated to this plan's files) — `production: PASS | tests: PASS`, exit 0.
- `npx prettier --file-info` on each of the six touched files: all report
  `{ "ignored": false, "inferredParser": "typescript" }`. `npx prettier --check` over the same
  six: `All matched files use Prettier code style!`, exit 0.
- `fakeHomeIsolation.test.ts`: 7/7 passed (not exercised by this plan's code — no new child-process
  env literal was added, `execFile` reuses the caller's `envs`/`wineBin` — but confirmed green per
  the plan's verification clause).
- `git diff --stat 3084aab25~1..bae7e3ea5`: touches exactly the six `src/backend/tools/` paths in
  `files_modified` (497 insertions, 8 deletions across 6 files). `src/frontend/` and
  `public/locales/` are byte-unchanged.
- Task 3's own verify (both `<automated>` blocks): todo present in `completed/`, absent from
  `pending/`, `## Resolution (2026-10-11, quick 261011-iel` heading present, `45-LIVE-GATE.md` and
  `45-UAT.md` have no diff against `HEAD`, `pnpm planning-gates` → `12/12 planning gates passed`
  (exit 0). Second block: `prettier ignores .planning/ — --check deliberately omitted (vacuous)`.

## Live Verification Owed

Not live-verified. `45-LIVE-GATE.md` G6 and `45-UAT.md` item 6 stay scored `issue` until the next
45-12 live run: open Alan Wake's Winetricks tab before starting any Apply in that launch, and
record whether the banner is present immediately together with `wine64 --version` for that
bottle. Neither file was edited by this plan (confirmed above by `git diff --quiet`), per the
plan's explicit instruction and Task 3's own reasoning that a dated run record should not be
retroactively annotated.

## Deviations from Plan

None — plan executed exactly as written, task boundaries intact. One self-corrected
scope-ordering slip during implementation: a first draft of `checkWineVersion` merged Task 2's
clear-on-supported branch into Task 1 before Task 1's verify/commit; this was caught before any
commit and reverted to the unsupported-only branch, with the full logic re-added in Task 2 as
planned. Since it never reached a committed state, it is not a tracked deviation.

## Known Stubs

None.

## Self-Check: PASSED

- `src/backend/tools/winetricksOutputClassifier.ts` — FOUND
- `src/backend/tools/index.ts` — FOUND
- `src/backend/tools/winetricksEnvironment.ts` — FOUND
- `src/backend/tools/__tests__/winetricksListAvailable.test.ts` — FOUND
- `src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts` — FOUND
- `src/backend/tools/__tests__/winetricksOutputClassifier.test.ts` — FOUND
- `.planning/todos/completed/2026-10-11-gptk-banner-cannot-appear-at-tab-open-because-list-all-skips-the-version-check.md` — FOUND
- `.planning/todos/pending/2026-10-11-gptk-banner-cannot-appear-at-tab-open-because-list-all-skips-the-version-check.md` — absent, as expected (moved)
- `3084aab25` (Task 1 commit) — FOUND in `git log --oneline --all`
- `bae7e3ea5` (Task 2 commit) — FOUND in `git log --oneline --all`
- `e9653556c` (Task 3 commit) — FOUND in `git log --oneline --all`
