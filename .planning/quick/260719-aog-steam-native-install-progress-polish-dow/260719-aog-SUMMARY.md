---
quick_task: 260719-aog
subsystem: steam
tags: [steam, install-progress, pollInstallOnce, ipc, i18n]

requires:
  - phase: 21-steam-native-install
    provides: pollInstallOnce / activePolls / GAP-17-BOTTLE-PROGRESS shared poller
provides:
  - Live download speed (downSpeed, MiB/s) in the Steam OFF-path progressUpdate payload
  - Non-empty, decreasing ETA string (HH:MM:SS) once speed is known
  - A distinct 'steam-paused' gameStatusUpdate context + frontend "Paused" label for a frozen in-flight download
  - Corrected games.ts install() docstring (pollInstallOnce DOES stream progress)
affects: [steam-install-ux, download-manager]

tech-stack:
  added: []
  patterns:
    - "Reused depot.ts's existing rollingRateMiBs/formatEta helpers in library.ts's shared poller rather than re-implementing speed/ETA math, keeping the MiB/s + HH:MM:SS convention identical across the native depot-download path and the OFF-path ACF poller"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/frontend/hooks/constants.ts
    - src/frontend/hooks/__tests__/hasStatus.reconcile.test.ts
    - public/locales/en/gamepage.json

key-decisions:
  - "downSpeed is emitted in MiB/s (not raw bytes/sec) to match the existing DownloadManager UI convention and the native depot-download path's own units (UAT D-UAT-02) — computed via depot.ts's exported rollingRateMiBs rather than a second implementation"
  - "eta is formatted via depot.ts's exported formatEta (HH:MM:SS), matching the native path's own ETA string convention instead of inventing a second format"
  - "Speed/ETA/stalled-tick baselines live on the SAME activePolls entry (lastBytesDownloaded, lastTickMs, stalledTicks) already used for seenDownloading/notifiedWaiting — no new registry"
  - "'steam-paused' precedence is checked AFTER 'steam-waiting-for-restart' in both backend (gameStatusUpdate context) and frontend (getStatusLabel) so a StateFlags=1026 handoff manifest can never show 'Paused' even if its (0/0) bytes never move"

requirements-completed: [QUICK-260719-AOG]

duration: ~40min
completed: 2026-07-19
---

# Quick Task 260719-aog: Steam Native Install Progress Polish Summary

**Live download speed (MiB/s) + decreasing ETA (HH:MM:SS) + a 'steam-paused' hint for the Steam OFF-path `pollInstallOnce` poller, reusing the native depot-download path's own formatting helpers.**

## Performance

- **Duration:** ~40 min
- **Tasks:** 2/2 completed
- **Files modified:** 6

## Accomplishments

- `pollInstallOnce` now derives a live `downSpeed` (MiB/s) and non-empty decreasing `eta` (HH:MM:SS) from consecutive ACF byte-count ticks, using the SAME `rollingRateMiBs`/`formatEta` helpers the native depot-download path (`depot.ts`) already uses — the OFF path and the native path now speak the exact same units/format.
- A genuinely in-flight download whose `BytesDownloaded` freezes for 3 consecutive ticks (~9s at the default 3s poll interval) now surfaces `context: 'steam-paused'` on `gameStatusUpdate`, rendered by the frontend as "Paused" instead of a silently frozen progress bar.
- `games.ts:604`'s stale docstring ("Does NOT call sendProgressUpdate — Steam owns the download with its own UI") is corrected to reflect that `pollInstallOnce` DOES stream percent/speed/ETA over the same channel.
- Zero regressions to the shared bottle-path percent derivation (GAP-17-BOTTLE-PROGRESS) — verified by both the pre-existing bottle tests (unchanged) and new regression tests.

## Task Commits

1. **Task 1: Derive download speed + ETA in pollInstallOnce, fix games.ts docstring** - `eba37307` (feat)
2. **Task 2: Paused/stalled detection + frontend 'steam-paused' hint** - `f0538f6f` (feat)

## Files Created/Modified

- `src/backend/storeManagers/steam/library.ts` - `activePolls` entry extended with `lastBytesDownloaded`/`lastTickMs`/`stalledTicks`; `pollInstallOnce` derives `downSpeedMiBs`/`eta` via `depot.ts`'s `rollingRateMiBs`/`formatEta`; stalled-tick counter drives a `'steam-paused'` `gameStatusUpdate` context (restart-hint takes precedence); new `STALLED_TICKS_THRESHOLD`/`BYTES_PER_MIB` constants
- `src/backend/storeManagers/steam/games.ts` - Corrected `install()`'s docstring (line ~604) to state that `pollInstallOnce` streams progress over the same `progressUpdate` channel
- `src/backend/storeManagers/steam/__tests__/library.test.ts` - `../depot` mock extended to pass through the real `formatEta`/`rollingRateMiBs`; 8 new tests covering speed/ETA derivation (first-tick baseline, rising-bytes second tick, preallocation zero-elapsed-time guard, bottle-regression) and paused detection (threshold-crossing, active-download reset, restart-hint precedence, staged-fallback exemption)
- `src/frontend/hooks/constants.ts` - `getStatusLabel`'s steam `installing` branch gained a `statusContext === 'steam-paused'` case (checked after the restart-hint branch)
- `src/frontend/hooks/__tests__/hasStatus.reconcile.test.ts` - 2 new tests: `'steam-paused'` → "Paused" label, restart-hint precedence unaffected
- `public/locales/en/gamepage.json` - Added `"steamPaused": "Paused"` key adjacent to `steamInstalling`/`steamWaitingRestart`

## Decisions Made

See `key-decisions` in frontmatter above. In short: reuse `depot.ts`'s existing `rollingRateMiBs`/`formatEta` exports (both already unit-tested, already the established MiB/s + HH:MM:SS convention on the native install path) rather than writing parallel speed/ETA math directly in `library.ts` — `depot.ts` does not import `library.ts`, so this introduces no circular dependency (`library.ts` already imports other symbols from `./depot`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test-file `../depot` mock omitted the newly-imported `formatEta`/`rollingRateMiBs`**
- **Found during:** Task 1 (running the pollInstallOnce test suite for the first time)
- **Issue:** `library.test.ts` already had a `jest.mock('../depot', () => ({...}))` factory (pre-existing, for `finalizeToSteam`/`downloadSteamDepots`/`buildDepotPlan`/`healReconciledFileModes`). Adding `formatEta`/`rollingRateMiBs` imports to `library.ts` without updating this mock factory meant they resolved to `undefined` in every test, throwing `TypeError: ... is not a function`.
- **Fix:** Extended the mock factory to also expose `formatEta`/`rollingRateMiBs`, sourced via `jest.requireActual('../depot')` so the suite exercises the real (already-tested-elsewhere) pure formatting/smoothing logic rather than a re-stubbed fake.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/library.test.ts`
- **Verification:** All 22 `pollInstallOnce` tests pass; full steam suite 648/648.
- **Committed in:** `eba37307` (Task 1 commit)

**2. [Rule 1 - Bug] Removed a duplicate `GAP-17-BOTTLE-PROGRESS` comment block introduced by my own Task 1 edit**
- **Found during:** Task 1 (self-review before running tests)
- **Issue:** Inserting the speed/ETA derivation between the byte destructure and the `useStaged`/`denominator` calculation accidentally left the pre-existing `GAP-17-BOTTLE-PROGRESS` explanatory comment duplicated (once above the destructure, once again immediately before `useStaged`).
- **Fix:** Kept a single copy at the top (updated "the gameStatusUpdate above" → "the gameStatusUpdate below" once Task 2 reordered the emit call after it).
- **Files modified:** `src/backend/storeManagers/steam/library.ts`
- **Verification:** Read-back diff confirms single copy; `pnpm exec eslint` and `pnpm test` both clean.
- **Committed in:** `eba37307` (Task 1 commit)

**3. [Rule 3 - Blocking] `STALLED_TICKS_THRESHOLD` constant temporarily unused after Task 1**
- **Found during:** Task 1 (running eslint before committing)
- **Issue:** I initially added the `STALLED_TICKS_THRESHOLD` constant in Task 1 (anticipating Task 2's use), which tripped `@typescript-eslint/no-unused-vars` as an ERROR since nothing referenced it yet — this would have violated the "eslint clean" gate for the Task 1 commit.
- **Fix:** Deferred introducing the constant to Task 2, where it's immediately consumed by the stalled-ticks comparison. Task 1's commit only carries the `stalledTicks: number` field (initialized, unused until Task 2) plus the speed/ETA logic.
- **Files modified:** `src/backend/storeManagers/steam/library.ts`
- **Verification:** `pnpm exec eslint` → 0 errors on both Task 1 and Task 2 commits.
- **Committed in:** `eba37307` (field only), `f0538f6f` (constant + usage)

**4. [Rule 3 - Blocking] Plan's `yarn test`/`yarn tsc`/`yarn eslint` gate commands don't match this repo's package manager**
- **Found during:** Task 1 (first attempt to run the plan's literal verify command)
- **Issue:** `package.json` pins `"packageManager": "pnpm@10.28.0"`; running `yarn test ...` fails immediately with "This project is configured to use pnpm" before any tests run.
- **Fix:** Ran the equivalent `pnpm test ...` / `pnpm exec tsc --noEmit` / `pnpm exec eslint ...` commands instead — same effect, correct package manager.
- **Files modified:** None (command substitution only, not a code change).
- **Verification:** All gate commands ran successfully via pnpm; results reported below.

---

**Total deviations:** 4 auto-fixed (2 blocking test/lint infra, 1 bug/comment cleanup, 1 command substitution)
**Impact on plan:** All four were necessary to get the plan's own verification gate to pass cleanly; none changed the shipped behavior described in the plan's `<behavior>`/`<done>` criteria. No scope creep.

## Issues Encountered

**Pre-existing, out-of-scope: a leaked real `setInterval` crashes the Jest worker process asynchronously after `library.test.ts`'s own suite reports PASS.** Confirmed present BEFORE this task's changes (the `startInstallPolling('730', { source: 'bottle' })` call at library.test.ts:2627, which omits `intervalMs` and defaults to the real 3000ms interval, predates this quick task — verified via `git show HEAD:...` occurrence counts of the `60000` guard pattern used everywhere else in the file). It does not fail the test run (`Tests: 648 passed, 648 total`, exit code 0 both times, run twice for determinism) but does print a `TypeError: Cannot read properties of undefined (reading 'map')` trace to stderr between `library.test.ts` and `depot.test.ts`'s PASS lines. Per the deviation rules' scope boundary, this is logged (not fixed) in `260719-aog-deferred-items.md` in this same directory, since it's unrelated to the `pollInstallOnce` speed/eta/paused changes and pre-dates this task.

No other issues.

## Verification Results (actual, not claimed)

- `pnpm test src/backend/storeManagers/steam/__tests__/library.test.ts -t "pollInstallOnce"` → **22/22 passed** (18 from Task 1, 4 from Task 2)
- `pnpm test src/frontend/hooks/__tests__/hasStatus.reconcile.test.ts` → **11/11 passed**
- `pnpm test src/backend/storeManagers/steam` (full steam suite) → **648/648 passed**, 16/16 suites passed (run twice for determinism; see Issues Encountered for the unrelated pre-existing async stderr trace that does not affect the pass/fail result)
- `pnpm exec tsc --noEmit` → **0 errors**
- `pnpm exec eslint src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/library.test.ts src/frontend/hooks/constants.ts src/frontend/hooks/__tests__/hasStatus.reconcile.test.ts` → **0 errors**, 332 warnings (pre-existing baseline `@typescript-eslint/no-unsafe-*`/`no-named-as-default-member`/`require-await` warnings across `library.ts`, unrelated to this task's diff — none introduced by these changes)
- Regression guard (GAP-17-BOTTLE-PROGRESS): the pre-existing bottle percent tests at library.test.ts ~2090-2134 pass unchanged; new dedicated regression tests confirm `downSpeed`/`eta` stay absent/`''` on the staged-fallback path
- `graphify update .` → ran successfully (4454 nodes, 8227 edges, 348 communities)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The Steam OFF-path install UX (speed/ETA/paused) is now feature-complete relative to the source todo's 4 acceptance criteria (speed, ETA, paused-state, docstring fix).
- Runtime/live verification (actually watching a real Steam install pause/resume in the app) was NOT performed as part of this quick task — it was unit-tested only, matching the pattern already established by prior quick tasks in this repo (e.g. 260710-kba, 260711-alc) that defer live-app visual/behavioral confirmation to a separate pass. If a live check is wanted, pause a real `steam://install` for ~10s and confirm the badge shows "Paused", then resume and confirm speed/ETA reappear.
- No blockers for Phase 23/24 work — this task touched only the Steam OFF-path poller, games.ts docstring, and frontend label rendering; no shared primitives it depends on were changed.

---
*Quick task: 260719-aog*
*Completed: 2026-07-19*
