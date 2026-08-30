---
phase: 35-electron-cutover-remove-the-electron-build
plan: 24
subsystem: testing
tags: [i18n-gate, jest, ts-jest, meta-tooling, ratchet]

# Dependency graph
requires:
  - phase: 35-electron-cutover-remove-the-electron-build
    provides: "The Phase 35 source changes (35-16 Electron retyping, 35-06 tray-icon platform gate, and two quick tasks) that made six src/frontend files fork-divergent"
provides:
  - "meta/i18nForkTouchedFiles.json regenerated to 205 files, matching the live git derivation against the upstream merge-base"
  - "meta/__tests__/genI18nGateScope.test.ts re-baselined in the same commit: DECLARED_UNSCANNED_DEBT +6 named entries, all --rewrite-scope guard counts/titles moved 199->205, stale freshSnapshot() docstring corrected"
  - "Closes 35-VERIFICATION.md gap 4 (A-17 ANTI-ROT failure)"
affects: [39-linting-and-planning-gates]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Regenerating meta/i18nForkTouchedFiles.json and re-baselining its guard fixtures (DECLARED_UNSCANNED_DEBT + hard-coded counts) must land in one commit, never a bare `pnpm gen-i18n-gate-scope` run alone"

key-files:
  created: []
  modified:
    - meta/i18nForkTouchedFiles.json
    - meta/__tests__/genI18nGateScope.test.ts

key-decisions:
  - "Used `pnpm gen-i18n-gate-scope` (not `gen-i18n-scope:rewrite`) so the hand-curated meta/i18nGateScope.json stayed byte-identical; verified via git diff --stat (no output) and the A5 provenance ratchet staying green"
  - "All six new fork-touched files recorded as DECLARED_UNSCANNED_DEBT, not promoted into meta/i18nGateScope.json -- promoting scope is separate, deliberate work per the generator's own clobber-guard comment"
  - "Corrected the freshSnapshot() docstring's stale '185 files / 162 -> 185' delta (already wrong before this plan, from an earlier phase) to the current 205 / 163 -> 205 reality, per the plan's explicit acceptance criterion"

requirements-completed: [REQ-35-20]

# Metrics
duration: ~20min
completed: 2026-08-30
---

# Phase 35 Plan 24: Re-baseline i18nForkTouchedFiles.json and its guard pins together Summary

**Regenerated the stale `meta/i18nForkTouchedFiles.json` artifact (199 -> 205 files) and re-baselined every dependent test fixture -- `DECLARED_UNSCANNED_DEBT`, four hard-coded `toBe(199)` assertions, three test titles, and a stale docstring -- in one coordinated change, closing 35-VERIFICATION.md gap 4 without weakening any check.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-30
- **Tasks:** 2 (Task 1 measurement-only, no commit; Task 2 committed)
- **Files modified:** 2

## Accomplishments

- `A-17 ANTI-ROT` now passes because the committed artifact matches the live `git diff` derivation, not because the check was relaxed, skipped, or widened.
- The `--rewrite-scope` guard's four count-bearing specs (A0, A2, A3, A4) and their titles now state the real 205/163 numbers instead of the stale 199/163 pair, so no reader is told a lie by a passing test's own name.
- The hand-curated `meta/i18nGateScope.json` (163 files) is untouched -- confirmed both by `git diff --stat` (empty) and the A5 provenance ratchet still reading `generatedBy` as hand-edited.
- All three non-vacuity mutation controls (A-17 ANTI-ROT, A-03 RATCHET, A0 fixture sanity) were re-proven by hand: each mutation was applied, shown to fail by naming the drift, then restored and confirmed byte-identical via `shasum`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Re-measure the drift before changing anything** - measurement-only, no files modified, no commit (per plan's own acceptance criteria: `git status --short` must show nothing changed for this task).
2. **Task 2: Regenerate the artifact and re-baseline every dependent count and the declared debt, in ONE change** - `ee86b3442` (fix)

**Plan metadata:** (this commit, produced by the state-update step below)

## Files Created/Modified

- `meta/i18nForkTouchedFiles.json` - Regenerated via `pnpm gen-i18n-gate-scope`; `files` array grew from 199 to 205 entries (the six files below), `generatedAt` timestamp updated, `baseCommit`/`generatedBy` unchanged.
- `meta/__tests__/genI18nGateScope.test.ts` - `DECLARED_UNSCANNED_DEBT` gained six sorted entries with a new dated provenance comment block; the `--rewrite-scope guard` describe's four `toBe(199)` assertions and three test titles moved to 205/163->205; the `freshSnapshot()` docstring's stale 185-file description corrected to 205/163->205.

## Measurement (Task 1)

Command: `BASE=$(node -e "console.log(require('./package.json').upstream.baseCommit)") && git diff --name-status "$BASE" HEAD -- src/frontend`, fed through `deriveScopeFiles()` (imported directly from `meta/genI18nGateScope.ts` in a scratch jest test, deleted before any commit).

Re-measured numbers (HEAD had moved since the plan's own `<interfaces>` snapshot, due to plans 35-20..35-23 landing first in this wave -- the fresh derivation came out to 207 raw survivors, 205 after the two permanent D-17 exclusions, not the plan's illustrative 199 baseline):

| Quantity | Command | Value |
|---|---|---|
| `meta/i18nGateScope.json` files (hand-curated) | `scopeSnapshot.files.length` | 163 (unchanged) |
| `meta/i18nForkTouchedFiles.json` files (pre-regen, committed) | `forkTouchedSnapshot.files.length` | 199 |
| Live derivation (raw `deriveScopeFiles()` output) | `deriveScopeFiles(diffLines).length` | 207 |
| Live derivation minus D-17 deferred | `buildScopeSnapshot(...).files.length` | 205 |

**Drift in both directions:**
- **Artifact-missing (derivation has it, artifact doesn't):** 6 files (below).
- **Derivation-missing (artifact has it, derivation doesn't):** 0 files (`EXTRA_IN_ARTIFACT: []`) -- the plan's snapshot showed none in this direction and re-measurement confirmed it; no new information here.

**Per-file classification (against `meta/i18nGateScope.json`'s 163 hand-curated entries):**

| File | Classification | Phase 35 provenance |
|---|---|---|
| `src/frontend/components/UI/PathSelectionBox/index.tsx` | DEBT | Touched by `e975bb456` (35-16: kill lazy `require('electron')` in ipc.ts, retype Electron sites) |
| `src/frontend/components/UI/WebviewControls/index.tsx` | DEBT | Touched by `e975bb456` (35-16, same commit) |
| `src/frontend/screens/DownloadManager/index.tsx` | DEBT | Touched by `e975bb456` (35-16, same commit) |
| `src/frontend/screens/Library/components/CategoriesManager/index.tsx` | DEBT | Touched by `a9b6ef51a` (34.11-quick-ua7, WR-08 distinct collection-dialog open intents), landed in the Phase 35 window |
| `src/frontend/screens/Library/components/InstallModal/defaultPlatform.ts` | DEBT | Added by `68bada5bf` (quick task 260824-u8b: default to native Mac build for non-Steam titles) |
| `src/frontend/screens/Settings/components/UseDarkTrayIcon.tsx` | DEBT | Touched by `8978be102` (35-06: platform-gate UseDarkTrayIcon to Windows/Linux) |

None of the six exist in `meta/i18nGateScope.json` (`MISSING_IN_SCOPE_TOO: []`), so all six are DEBT, none are SCOPE-promotion candidates in this plan.

`git status --short` after Task 1: empty (no file was modified).

## Regeneration and re-baseline (Task 2)

1. Ran `pnpm gen-i18n-gate-scope` (never `gen-i18n-scope:rewrite`). Output: `Wrote meta/i18nForkTouchedFiles.json: 205 fork-touched eligible files.` and `Left meta/i18nGateScope.json untouched (hand-curated; ...)`.
2. Confirmed `git diff --stat meta/i18nGateScope.json` produced no output, and `generatedBy` still reads `"hand-edited (34.13 review CR-02(b), then A-02/A-03) -- NOT a \`pnpm gen-i18n-gate-scope\` run; ..."`.
3. Diffed the regenerated artifact against the pre-regen committed version: exactly the six files above were added, in their sorted positions, with no removals -- matching Task 1's measurement precisely.
4. Added the six files to `DECLARED_UNSCANNED_DEBT` in existing sort order, with a new dated comment block naming each file's Phase 35 provenance.
5. Updated every hard-coded count: `A0` title and its `toBe(205)`/`toBe(205)` assertions, `A2` title (163 -> 205), `A3` title and `toBe(205)`, `A4` title and `toBe(205)`.
6. Corrected the `freshSnapshot()` docstring, which described a stale "185 files / 162 -> 185" delta left over from an earlier phase (already wrong independently of this plan) -- now states 205/163->205 with the six current files named.
7. Left `expect(scopeSnapshot.files.length).toBe(163)` unchanged, per Task 1's measurement that the hand-curated scope count did not move.

### Arithmetic self-check

`meta/i18nForkTouchedFiles.json`.files.length (205) - `meta/i18nGateScope.json`.files.length (163) = 42, and `DECLARED_UNSCANNED_DEBT`.length = 42 (36 pre-existing + 6 new). Verified by direct `node` count of the array literal. Balances exactly.

### Before/after suite state

`npx jest --config meta/jest.config.js meta/__tests__/genI18nGateScope.test.ts`:

- **Before:** `Tests: 1 failed, 1 skipped, 25 passed, 27 total`
- **After:** `Tests: 1 skipped, 26 passed, 27 total`

Skipped count unchanged at 1 (the same `it.skip` documented in-file as blocked on WR-17, unrelated to this gap) -- no previously-running spec became skipped.

### Non-vacuity mutation controls (all proven, then restored byte-identically)

**(a) A-17 ANTI-ROT** -- removed `src/frontend/App.tsx` from a working copy of `meta/i18nForkTouchedFiles.json`. Failing output named exactly that file:
```
- Expected  - 1
+ Received  + 0
@@ -1,7 +1,6 @@
  Array [
-   "src/frontend/App.tsx",
    "src/frontend/bootErrorSurface.ts",
    ...
```
Restored via `pnpm gen-i18n-gate-scope` re-run (deterministic content aside from `generatedAt`), verified green again (`26 passed, 1 skipped`).

**(b) A-03 RATCHET** -- removed `src/frontend/helpers/gamepad.ts` from `DECLARED_UNSCANNED_DEBT` in a copied test file. Failing output named exactly that file:
```
+   "src/frontend/helpers/gamepad.ts",
```
Restored via `cp` from a pre-mutation snapshot; `shasum` before and after matched (`36548f03c9b7d47979138848fd273abdf5d203a1` both times).

**(c) A0 fixture sanity** -- reverted `expect(forkTouchedSnapshot.files.length).toBe(205)` back to `toBe(199)` in a copied test file. Failing output:
```
Expected: 199
Received: 205
```
Restored via `cp` from a pre-mutation snapshot; `shasum` matched the known-good hash (`36548f03c9b7d47979138848fd273abdf5d203a1`) after restore.

### Broader verification

- `pnpm test --selectProjects Meta` (capital M): `Test Suites: 32 passed, 32 total`, `Tests: 1 skipped, 634 passed, 635 total` -- including `meta/__tests__/hardcodedStringGate.test.ts`, the sibling pin flagged as a risk in the plan (it also reads `DECLARED_UNSCANNED_DEBT`-adjacent state); it passed unmodified.
- `pnpm codecheck` (`tsc --noEmit`): exits 0, no output.

## Decisions Made

- Used `pnpm gen-i18n-gate-scope`, not `gen-i18n-scope:rewrite` -- the latter would have attempted to rewrite the hand-curated `i18nGateScope.json`, which is exactly what the A2 refusal spec exists to prevent.
- All six drifted files classified as DEBT, none promoted to `meta/i18nGateScope.json` -- widening the hand-curated scope is explicitly out of scope for this plan per its own acceptance criteria and the generator's clobber-guard comment (widening the blocking gate has cost real work twice before, per the file's own history).
- Corrected the `freshSnapshot()` docstring's already-stale "185/162->185" numbers to the current reality, since leaving a lie in a load-bearing docstring next to numbers this plan was already touching would recreate exactly the kind of rot this gap-closure exists to fix.

## Deviations from Plan

None - plan executed exactly as written. The plan's own `<interfaces>` snapshot (163/199/199+debt-of-36) was explicitly flagged as possibly stale, and re-measurement did find it had moved (207 raw / 205 after exclusions, one extra file at each boundary shifted since 35-20..35-23 landed) -- this was anticipated by the plan, not a deviation from it.

## Issues Encountered

None. The re-measured numbers differed slightly from the plan's illustrative snapshot (205 vs. the plan's 199 baseline for "current" forkTouched count, since that snapshot was itself the pre-regen state), but the plan explicitly instructed re-measurement over trusting the snapshot, and the same six files, same classification, and same failure mode were confirmed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `meta/__tests__/genI18nGateScope.test.ts` is fully green (26 passed, 1 intentionally-skipped, matching pre-plan skip count) and the whole `Meta` jest project passes (634/635, same 1 pre-existing skip).
- 35-VERIFICATION.md gap 4 is closed: the artifact matches the live derivation and no check was weakened to get there.
- The `it.skip` at the bottom of the staleness-guard describe (blocked on WR-17 catalog-drift triage) remains open and untouched by this plan -- it is a separate, larger regeneration decision, not this gap.

---
*Phase: 35-electron-cutover-remove-the-electron-build*
*Completed: 2026-08-30*
