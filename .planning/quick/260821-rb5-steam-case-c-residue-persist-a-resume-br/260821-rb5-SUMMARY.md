---
phase: quick-260821-rb5
plan: 01
subsystem: steam
tags: [steam, depot-download, resume, crash-recovery, jest, ts-jest, tsc]

requires:
  - phase: 23.2-steam-depot-selection-required-vs-optional-depots-and-skip-a
    provides: manifest-write taxonomy (case A/B/C), StateFlags & 4 completeness bitmask
provides:
  - Crash-surviving install-start breadcrumb (steamResumePending + resolved targetSteamappsDir/installdir) persisted to steamLibraryStore before downloadSteamDepots is awaited
  - SteamLibraryManager.init() surfaces breadcrumb-only appIds (no ACF at all) alongside ACF-scanned appIds
  - Self-heal: a breadcrumb whose on-disk manifest is already StateFlags & 4 complete is cleared, not surfaced
  - Regression fix: SteamGame.install()'s pre-existing steamResumePending resume-trigger now excludes appIds with a live in-flight install
affects: [steam-depot, steam-library-init, steam-install-resume]

tech-stack:
  added: []
  patterns:
    - "Crash-surviving state persisted at operation START (not just at graceful-exit points), unioned into an existing surfacing loop rather than adding a parallel one"
    - "Self-heal a persisted flag against on-disk truth at the one place that already reads both (init()), instead of adding a new reconciliation pass"

key-files:
  created: []
  modified:
    - src/common/types.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - .planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md

key-decisions:
  - "Persist steamResumePending + resolved {targetSteamappsDir, installdir} at install START (before downloadSteamDepots is awaited), not at any graceful-exit point — this is the only point case C (hard kill, no JS runs at teardown) can ever reach"
  - "init()'s ACF-scan and breadcrumb-scan run as two independently-hardened try blocks unioned into one Set<appId>, so a scan failure in one can never suppress the other"
  - "Self-heal (clear) a breadcrumb whose ACF is already StateFlags & 4 complete, rather than surfacing it — otherwise a killed-then-Steam-completed install nags forever with no other clear point"
  - "Guard the pre-existing steamResumePending resume-trigger in install() with !isNativeInstallInFlight(appId) — the new breadcrumb write reuses a field that already meant 'startup detected a resumable install', so a live install's own just-written breadcrumb could otherwise misfire a concurrent resumeInterruptedSteamInstall() pass against itself"

requirements-completed: [QUICK-RB5-01, QUICK-RB5-02, QUICK-RB5-03, QUICK-RB5-04]

duration: 32min
completed: 2026-08-21
---

# Quick Task 260821-rb5: Steam Case-C Residue — Persist a Resume Breadcrumb Summary

**Crash-surviving install-start breadcrumb in steamLibraryStore closes case C of the aborted-depot-residue todo — a hard-killed native Steam depot download is now surfaced as resumable on the next launch even with zero appmanifest_*.acf on disk, with a self-heal that clears the breadcrumb if the on-disk manifest turns out already complete.**

## Performance

- **Duration:** 32 min (19:51:05 → 20:23:23 NZST, per commit timestamps)
- **Started:** 2026-08-21T19:51:05+12:00
- **Completed:** 2026-08-21T20:23:23+12:00
- **Tasks:** 3 (RED/GREEN pattern: type add → failing test → implementation)
- **Files modified:** 6 (5 `files_modified` from plan frontmatter + 1 todo doc)

## Accomplishments

- `markSteamNativeInstallStarted(appId, breadcrumb)` persists `steamResumePending: true` plus the actually-resolved `{targetSteamappsDir, installdir}` to `steamLibraryStore` at install start, before `downloadSteamDepots` is awaited — the one point a hard kill (`kill -9`, crash, power loss) cannot skip
- `clearSteamResumeBreadcrumb(appId)` clears it on a successful native depot-download outcome, before ACF polling starts
- `SteamLibraryManager.init()`'s surfacing loop now unions `getSteamResumeBreadcrumbAppIds()` with `scanDownloadingAppIds()`'s ACF-derived list, each in its own hardened try block, so case C (no `.acf` written at all) is surfaced where it previously had no record anywhere
- Self-heal: `breadcrumbAppIsFullyInstalledOnDisk()` clears a breadcrumb whose on-disk manifest is already `StateFlags & 4` complete, instead of surfacing a stale "resume" nag forever
- Caught and fixed a genuine cross-cutting regression in `SteamGame.install()`'s pre-existing resume-trigger logic (see Deviations)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add crash-surviving resume breadcrumb fields to `InstalledInfo`** - `f2247d0e` (feat)
2. **Task 2: Add failing case-C residue breadcrumb gate (RED)** - `51e243a6` (test)
3. **Task 3: Persist install-start breadcrumb, self-heal on init (GREEN)** - `5b61974d` (feat)
4. **Todo disposition: record case-C resolution** - `cecc6133` (docs, todo file only — not plan metadata)

_Note: SUMMARY.md, STATE.md are not committed by this executor per orchestrator instruction._

## Files Created/Modified

- `src/common/types.ts` - `InstalledInfo` gains `steamResumeTargetSteamappsDir` / `steamResumeInstalldir` breadcrumb fields alongside the pre-existing `steamResumePending`
- `src/backend/storeManagers/steam/library.ts` - `markSteamNativeInstallStarted`, `clearSteamResumeBreadcrumb`, `getSteamResumeBreadcrumbAppIds`, `breadcrumbAppIsFullyInstalledOnDisk`; `SteamLibraryManager.init()`'s surfacing block restructured to union ACF-scan + breadcrumb-scan and self-heal
- `src/backend/storeManagers/steam/games.ts` - calls `markSteamNativeInstallStarted` right after `resolveSteamInstallTarget` resolves (before `downloadSteamDepots` await) and `clearSteamResumeBreadcrumb` on a successful outcome; `install()`'s resume-trigger check gains `!isNativeInstallInFlight(this.appId)` guard
- `src/backend/storeManagers/steam/__tests__/games.test.ts` - new `260821-rb5 — case-C residue breadcrumb` describe block (4 tests); two `tsc --noEmit`-only fixes (see Deviations)
- `src/backend/storeManagers/steam/__tests__/library.test.ts` - new `260821-rb5: refresh() preserves install-start breadcrumb` test
- `.planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md` - appended `## Resolution (260821-rb5)` section; left pending (DEFERRED filesystem orphan scan still open), no `resolves_phase` added

## Decisions Made

See `key-decisions` in frontmatter. All decisions were pre-specified by the todo's own `## Design decision (2026-08-21)` section and the plan; no new architectural decisions were made during execution.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `SteamGame.install()`'s pre-existing resume-trigger misfired against a live install's own breadcrumb**
- **Found during:** Task 3 (implementation) — full-suite regression run showed T-23-12's single-flight guard test failing (`downloadSteamDepots` called 2 times instead of 1)
- **Issue:** `markSteamNativeInstallStarted` sets `steamResumePending: true` at the start of every live native install. `install()`'s pre-existing startup-resume trigger reads that same field (`library.get(appId)?.install?.steamResumePending`) to decide whether to run `resumeInterruptedSteamInstall()`. Before this plan, that field was only ever set at graceful-exit/startup-detection points, so the two meanings never collided. After this plan, a second concurrent/joining `install()` call for the same appId — e.g. the exact scenario T-23-12 guards — would see its own live download's just-written breadcrumb and misinterpret it as a startup-detected resumable install, triggering a real `resumeInterruptedSteamInstall()` locate/finalize pass concurrently against the live download.
- **Fix:** Added `&& !isNativeInstallInFlight(this.appId)` to the resume-trigger condition in `install()`, reusing the already-exported, module-local `isNativeInstallInFlight` predicate from `games.ts` (no new import needed) plus a doc comment explaining the reuse hazard for future readers.
- **Files modified:** `src/backend/storeManagers/steam/games.ts`
- **Verification:** Root-caused via baseline-vs-modified file swap (`git show HEAD:...` of the pre-Task-3 `games.ts` copied to scratchpad, temporarily swapped in, confirmed T-23-12 passed on baseline / failed on modified) plus temporary debug instrumentation showing both overlapping `install()` calls saw `existing=false` in the in-flight guard before the second call's pre-existing resume-trigger fired. Full combined suite (`games.test.ts` + `library.test.ts`) went from 1 failure to 468/468 passing after the fix.
- **Committed in:** `5b61974d` (Task 3 commit)

**2. [Rule 1 - Bug] Two `tsc --noEmit`-only type errors invisible to ts-jest's transpile-only mode**
- **Found during:** Post-Task-3 full verification pass (`pnpm codecheck`), after Task 3's implementation was already GREEN under `pnpm jest` (ts-jest per-file transpile-only mode does not type-check across files)
- **Issue A:** `games.test.ts` used `const arr = call[1] as GameInfo[]` and `invocationCallOrder[clearingCallIndex as number]`. ESLint's `@typescript-eslint/no-unnecessary-type-assertion` flagged both as unnecessary (under its own type-aware config), but naively removing the first cast was fine while naively removing the second (`clearingCallIndex: number | undefined`) produced a genuine `tsc --noEmit` error `TS2538: Type 'undefined' cannot be used as an index type` — `expect(...).toBeDefined()` does not narrow TypeScript's control flow. Fixed with an explicit `if (clearingCallIndex === undefined) throw ...` narrowing guard instead of a cast, satisfying both ESLint and `tsc --noEmit` without a type assertion either way.
- **Issue B:** `library.ts`'s new `breadcrumbAppIsFullyInstalledOnDisk(appId, install: InstalledInfo | undefined)` was called with `existing?.install`, where `existing: GameInfo | undefined` and `GameInfo.install: Partial<InstalledInfo>` — a real type mismatch (`Partial<InstalledInfo> | undefined` is not assignable to `InstalledInfo | undefined`) that `tsc --noEmit` caught but ts-jest's transpile-only mode did not. The function body only ever reads the one optional field it needs (`install?.steamResumeTargetSteamappsDir`), so the parameter type was narrowed to `Partial<InstalledInfo> | undefined` to match both its actual usage and the real callsite type.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/games.test.ts`, `src/backend/storeManagers/steam/library.ts`
- **Verification:** `pnpm codecheck` (`tsc --noEmit`) clean; `pnpm exec eslint` (severity-2 filtered) 0 errors across all 5 `files_modified`; `pnpm jest src/backend/storeManagers/steam/__tests__` 33/33 suites, 1289/1291 passing (2 pre-existing skips), re-confirmed after both fixes.
- **Committed in:** `5b61974d` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs directly caused by this plan's own Task 3 changes)
**Impact on plan:** Both fixes are corrections to code written in this same plan, not scope creep. The `isNativeInstallInFlight` guard was necessary for the plan's own truth requirement ("A native depot install already in flight for an appId is never double-triggered into a concurrent resume attempt by its own breadcrumb") to actually hold; the `tsc`-only errors were pre-existing-invisible correctness bugs in code this plan wrote, caught only because `pnpm codecheck` runs full-program type-checking where `pnpm jest`'s ts-jest transpile-only mode does not.

## RED (Task 2) — verbatim failure output

Reproduced against this working tree by temporarily reverting `library.ts`/`games.ts` to their pre-Task-3 (post-Task-2) committed state, running the two affected suites, then restoring the committed GREEN state (`git checkout HEAD -- <path>`; confirmed clean via `git status --short` and a subsequent GREEN re-run):

```
FAIL Backend src/backend/storeManagers/steam/__tests__/library.test.ts
  ● SteamLibraryManager › 260821-rb5: refresh() preserves an install-start breadcrumb › a still-not-installed game (no fully-installed ACF, no incomplete ACF) keeps its steamResumePending breadcrumb through refresh()

    expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: undefined

      1572 |
      1573 |       const rebuilt = library.get(BREADCRUMB_APP_ID)
    > 1574 |       expect(rebuilt?.install?.steamResumePending).toBe(true)
           |                                                    ^
      1575 |       expect(rebuilt?.install?.steamResumeTargetSteamappsDir).toBe(
      1576 |         TARGET.targetSteamappsDir
      1577 |       )

FAIL Backend src/backend/storeManagers/steam/__tests__/games.test.ts
  ● 260821-rb5 — case-C residue breadcrumb › a hard-killed native install (finalize never called) persists a breadcrumb, and a fresh init() surfaces it as resumable with an EMPTY ACF scan

    expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: undefined

      2242 |       const afterStart = persisted()
      2243 |       const startedEntry = afterStart?.find((g) => g.app_name === APP_ID)
    > 2244 |       expect(startedEntry?.install?.steamResumePending).toBe(true)
           |                                                         ^

  ● 260821-rb5 — case-C residue breadcrumb › a breadcrumb whose appId has an on-disk StateFlags=4 ACF is CLEARED at startup, not surfaced

    expect(received).toBeFalsy()

    Received: true

      2320 |
      2321 |     expect(notify).not.toHaveBeenCalled()
    > 2322 |     expect(library.get(APP_ID)?.install?.steamResumePending).toBeFalsy()
           |                                                              ^

  ● 260821-rb5 — case-C residue breadcrumb › a successful native depot run clears the breadcrumb before the poller starts

    expect(received).toBeDefined()

    Received: undefined

      2371 |       )
      2372 |     })?.index
    > 2373 |     expect(clearingCallIndex).toBeDefined()
           |                               ^

Test Suites: 2 failed, 2 total
Tests:       4 failed, 464 passed, 468 total
```

## Pre/Post `steam/__tests__` pass counts (measured against this working tree)

- **Pre-Task-2 (before RED tests existed):** not independently re-measured; Task 1 (types-only) and pre-existing suite are covered by the post-Task-3 full run below.
- **RED (post-Task-2, pre-Task-3 implementation):** `games.test.ts` + `library.test.ts` — **4 failed, 464 passed, 468 total**, 2/2 suites failed (reproduced above).
- **GREEN (post-Task-3, this plan's final committed state):**
  - `games.test.ts` + `library.test.ts`: **468 passed, 468 total**, 2/2 suites passed.
  - Full `src/backend/storeManagers/steam/__tests__` directory: **33/33 suites passed, 1289 passed / 2 skipped / 1291 total** (the 2 skips are pre-existing and unrelated to this plan).

## `git diff --name-only` file list (cumulative, pre-plan base → HEAD, scoped to `src/`)

```
src/backend/storeManagers/steam/__tests__/games.test.ts
src/backend/storeManagers/steam/__tests__/library.test.ts
src/backend/storeManagers/steam/games.ts
src/backend/storeManagers/steam/library.ts
src/common/types.ts
```

Exactly the 5 files in the plan's `files_modified` frontmatter. `depot.ts` does not appear. No new i18next key was introduced (this plan touches no frontend/i18n surface).

## Issues Encountered

- **Concurrency guard, confirmed twice:** at session start and again before each commit, `git diff --cached --name-only` was checked before staging to ensure neither `.planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md` nor `.planning/todos/pending/2026-08-21-i18n-fork-touched-artifact-rots-on-any-frontend-commit.md` (a pre-existing staged/working-tree deletion belonging to a concurrent session) were ever staged or touched. Both remain exactly as found in the final `git status --short`.
- **`.planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md` already carried an uncommitted `## Design decision (2026-08-21)` section** (from this same quick task's planning step) when execution started. Per the plan's `<todo_disposition>`, the sanctioned action for this file is append-plus-stage, so the `## Resolution (260821-rb5)` section was appended after `## Provenance` and the whole file (Design decision + Resolution) was committed together in one docs commit (`cecc6133`) — this is the file's own planning-to-execution lifecycle, not foreign concurrent-session content.
- **`git checkout HEAD -- <file>`** (used to restore `library.ts`/`games.ts` after temporarily reproducing RED for this SUMMARY) triggers this repo's known pre-existing `post-checkout` hook failure on the placeholder macOS binary digest sentinel (`PENDING-CI-PUBLISH`, `legendary_macOS_x86_64_onedir.tar.gz`). This is a documented, out-of-scope repo issue unrelated to this plan; the actual git restore succeeded regardless (confirmed via `git status --short` and a subsequent GREEN test re-run).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Case C of the aborted-depot-residue todo is closed. The todo itself stays pending (not closed) — the DEFERRED startup filesystem orphan scan (residue predating this breadcrumb, e.g. from installs killed before this fix shipped) remains open and unaddressed, documented in the todo's `## Resolution (260821-rb5)` section.
- No blockers for downstream phases. This plan touches no frontend/UI surface and introduces no new external dependencies.

---
*Phase: quick-260821-rb5*
*Completed: 2026-08-21*

## Self-Check: PASSED

All 7 files verified present (5 `files_modified` code files, the todo doc, this SUMMARY.md) and all 4 commit hashes (`f2247d0e`, `51e243a6`, `5b61974d`, `cecc6133`) verified present in `git log --oneline --all`.
