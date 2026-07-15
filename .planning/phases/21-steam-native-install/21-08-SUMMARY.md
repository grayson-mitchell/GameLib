---
phase: 21-steam-native-install
plan: 08
subsystem: steam-startup-resume-finalize
tags: [steam, depot-download, startup-resume, d-05, regression-guard, tdd]

# Dependency graph
requires:
  - phase: 21-06
    provides: depot.ts finalizeToSteam(appId, opts) — the single recovery
      function (write-1026-and-stop) this plan's startup-resume path calls
      directly, self-contained (reads LastOwner internally) per 21-06's own
      "Next Phase Readiness" note that this exact reuse was anticipated
provides:
  - "library.ts init()'s scanDownloadingAppIds resume loop rewired to
    finalize-then-watch (D-05): a GameLib-owned partial detected on startup
    is finalized to an honest StateFlags=1026 manifest FIRST, then watched
    via startInstallPolling — never re-downloaded, never silently dispatched
    to Steam/CrossOver (resolves the folded todo
    steam-startup-download-resume-autoopens-crossover)"
  - "library.ts locateDownloadingTarget(appId) — new private helper resolving
    { targetSteamappsDir, installdir, name } from the on-disk ACF for the
    finalize call, WITHOUT modifying scanDownloadingAppIds/readAcfState
    (RESEARCH Pitfall 4 discipline preserved)"
  - "Regression-guard tests locking in that pollInstallOnce/readAcfState/
    startInstallPolling/scanDownloadingAppIds work UNCHANGED against a
    GameLib-written manifest (both native and bottle-source), proving
    RESEARCH Pattern 4/Pitfall 4's 'poller needs zero changes' claim"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Task-level TDD (RED test commit -> GREEN implementation commit) with
      genuine RED confirmed by running the new tests against the unmodified
      library.ts before any implementation edit — 2 of 4 new Task 1 tests
      failed for the right reason (finalizeToSteam never called / ordering
      array empty), while the no-auto-drive regression guard and both Task 2
      regression tests passed trivially against current code (nothing calls
      the forbidden functions yet, and the read side already round-trips a
      GameLib-shaped manifest correctly) — confirming they lock in EXISTING
      correct behavior rather than describing new behavior"
    - "A new small helper (locateDownloadingTarget) duplicates just the
      installdir-from-ACF extraction that scanDownloadingAppIds/readAcfState
      already perform internally, rather than widening either locked
      function's return shape — keeps the plan's 'zero changes to the
      poller' constraint literally true (byte-for-byte unmodified function
      bodies), verified by the regression tests exercising the real
      (unmocked) implementations"
    - "Startup finalize passes depots: [] (FinalizeDepotEntry[]) — an
      honest empty InstalledDepots map, since no live DepotPlan exists on a
      fresh process. finalizeToSteam still measures real on-disk bytes for
      SizeOnDisk regardless of the empty depots list; Steam's own verify
      pass reconciles whatever InstalledDepots data is missing (matches the
      plan's own 'safe either way' guidance for the ambiguous-ownership
      case)"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts

key-decisions:
  - "locateDownloadingTarget() is a NEW private function, not an extension of
    scanDownloadingAppIds's return shape or readAcfState's 'downloading'
    branch — the plan's own interfaces section requires those four functions
    (pollInstallOnce/readAcfState/startInstallPolling/scanDownloadingAppIds)
    to need ZERO changes; widening scanDownloadingAppIds to also return
    installdir/steamappsDir would have violated that literally even though
    it might feel like a small addition. The new helper duplicates the
    minimal ACF-read logic instead."
  - "finalizeToSteam is called with an empty depots: [] array on startup
    resume, not a reconstructed DepotPlan — there is no live plan to
    reconstruct on a fresh process (no PICS round-trip, no owned-depot
    resolution happens during startup resume). This is the most honest
    'possibly-incomplete InstalledDepots map' achievable without re-fetching
    network data, and Steam's own verify-and-repair pass is documented
    (spike 001, 21-06) to reconcile discrepancies regardless."
  - "A locate failure (ACF vanished between the scan and the lookup) is
    swallowed — startInstallPolling still runs. Per the plan's own interface
    note, the finalize-and-watch action is 'safe either way' since Steam's
    verify pass reconciles; skipping a poller start entirely on a transient
    lookup miss would be worse than watching without having finalized."

requirements-completed: [SNI-04]

# Metrics
duration: ~30min
completed: 2026-07-15
---

# Phase 21 Plan 08: Steam Startup-Resume Finalize Summary

Rewired `SteamLibraryManager.init()`'s existing `scanDownloadingAppIds()` → `startInstallPolling()` resume loop to a finalize-then-watch sequence (D-05): a GameLib-owned depot download interrupted by an app restart is now finalized to an honest `StateFlags=1026` manifest via Plan 06's `finalizeToSteam` **before** the poller starts watching for Steam to flip it to `4` on its own next launch — resolving the folded todo `steam-startup-download-resume-autoopens-crossover`. Startup resume never re-invokes the depot orchestrator and never dispatches to Steam or CrossOver (`tellBottledSteamToInstall`, `shell.openExternal`, `runWineCommand` are all asserted unreached from the resume path). Added a new `locateDownloadingTarget()` helper to resolve the finalize call's `{ targetSteamappsDir, installdir, name }` from the on-disk ACF, deliberately as a *separate* function rather than widening `scanDownloadingAppIds`/`readAcfState`, so those four poller functions stay byte-for-byte unmodified — then locked that "zero changes" claim in with regression tests proving a GameLib-written `1026`/`4` manifest round-trips through the real (unmocked) `readAcfState`, and a hand-written `1026` manifest is read identically by the bottle-source poller (D-15 reuse).

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-07-15
- **Tasks:** 2
- **Files modified:** 2 (library.ts, library.test.ts)

## Accomplishments

- `init()`'s resume loop now calls `finalizeToSteam(appId, { targetSteamappsDir, installdir, name, depots: [] })` for every appId `scanDownloadingAppIds()` reports as downloading, awaited before `startInstallPolling(appId)` runs — proven by an ordering test asserting `finalizeToSteam` resolves before `setInterval` is invoked (not just "both were called")
- `downloadSteamDepots` is never referenced anywhere in `library.ts` — `grep -c "downloadSteamDepots" src/backend/storeManagers/steam/library.ts` returns `0`, both in code and in comments (the write-up above deliberately says "the depot orchestrator" instead of the literal name, following the 21-02 lesson that acceptance-criteria greps must stay zero file-wide, not just in imports)
- No silent auto-drive of Steam/CrossOver on startup: a dedicated regression test asserts `tellBottledSteamToInstall`, `shell.openExternal`, and `runWineCommand` are never called anywhere during `manager.init()` for a resumed appId — the folded-todo's exact regression surface
- `locateDownloadingTarget(appId)` resolves `installdir`/`targetSteamappsDir` from the appId's real on-disk ACF (scanning `getSteamLibraries()` the same way `scanDownloadingAppIds` does internally, but as a standalone lookup) without touching `scanDownloadingAppIds`'s or `readAcfState`'s exported signatures or bodies; a `null` return (manifest vanished between the startup scan and this lookup) is tolerated — the poller still starts, matching the plan's "safe either way" guidance
- Regression-guard: a GameLib-shaped manifest carrying the exact field set `depot/manifest.ts`'s `writeAppManifest` produces (`appid`/`Universe`/`StateFlags`/`installdir`/`name`/`LastUpdated`/`SizeOnDisk`/`buildid`/`LastOwner`/`BytesToDownload`/`BytesDownloaded`/`AutoUpdateBehavior`/`InstalledDepots`/`UserConfig`/`MountedDepots`) reads as `'downloading'` when `StateFlags` is `"1026"` and `'installed'` when Steam flips it to `"4"`, through the real (unmocked) `readAcfState` — locking in the exact round-trip Plan 06's write side and this file's pre-existing read side must agree on
- Regression-guard: the SAME hand-written `1026` manifest, placed in the bottle steamapps root and read via `pollInstallOnce(appId, 'bottle')`, is processed identically to native (`gameStatusUpdate` `'installing'`) — proving D-15's "reuse the same poller for the CrossOver bottle path" claim holds with zero poller code changes

## Task Commits

RED confirmed with fail-fast discipline — genuine failures verified by running the new tests against the UNMODIFIED `library.ts` (before any implementation edit):

| Task | RED commit | GREEN commit |
|------|-----------|---------------|
| 1+2 (combined RED; single GREEN implements both) | `e5932697` | `a4eaea8f` |

- **RED (`e5932697`):** 4 new Task 1 tests added; 2 fail for the right reason (`finalizeToSteam` never called with 0 invocations; the ordering array is empty because neither `finalize` nor `watch` markers ever fire without the rewire). The other 2 new Task 1 tests (no-auto-drive regression guard) and both new Task 2 regression tests pass immediately against the unmodified code — expected, since they lock in behavior that already exists (nothing currently calls the forbidden dispatch functions from `init()`, and `readAcfState`/`pollInstallOnce` already correctly round-trip a `1026`/`4` manifest). 114 pre-existing tests continued passing, proving no accidental coupling.
- **GREEN (`a4eaea8f`):** `finalizeToSteam` import + `locateDownloadingTarget()` helper + the resume-loop rewire implemented; full library suite 116/116, full backend suite 1155/1155, `tsc --noEmit` clean, `eslint` 0 errors (250 pre-existing-pattern warnings — unsafe-`any` VDF-parse member access matching every other ACF-reading function in this file, plus the file's existing `i18next` default-export caution).

**Plan metadata:** (this commit) — `docs(21-08): complete steam-startup-resume-finalize plan`

## Files Modified

- `src/backend/storeManagers/steam/library.ts` — added `import { finalizeToSteam } from './depot'`; added the new private `locateDownloadingTarget(appId)` helper (resolves `{ targetSteamappsDir, installdir, name }` from the on-disk ACF); rewired `init()`'s `scanDownloadingAppIds` resume loop to call `finalizeToSteam` (wrapped in its own try/catch so a finalize failure still lets the poller start) before `startInstallPolling`
- `src/backend/storeManagers/steam/__tests__/library.test.ts` — added `finalizeToSteam`/`downloadSteamDepots` mocks (`jest.mock('../depot', ...)`), `tellBottledSteamToInstall` to the existing `'../bottle'` mock, `shell.openExternal` to the existing `electron` mock, a new `jest.mock('backend/launcher', ...)` for `runWineCommand`; added 3 new tests to the `SteamLibraryManager` describe block (finalize-called/no-re-download, finalize-before-watch ordering, no-auto-drive regression guard) and 3 new regression tests (a new `readAcfState() — D-05/D-15 regression` describe block with 2 tests, plus 1 bottle-source test appended to the existing `pollInstallOnce()` describe block)

## Decisions Made

See `key-decisions` in frontmatter for the full rationale on: `locateDownloadingTarget()` being a new standalone function rather than an extension of `scanDownloadingAppIds`/`readAcfState` (literal "zero changes" compliance), the `depots: []` empty-InstalledDepots choice on startup resume (no live `DepotPlan` to reconstruct), and tolerating a `locateDownloadingTarget` miss by still starting the poller.

## Deviations from Plan

None — plan executed as written. The two-line addition to the electron mock (`shell.openExternal`) and the `backend/launcher` mock (`runWineCommand`) were anticipated by the plan's own acceptance criteria ("The no-auto-drive test asserts init calls none of tellBottledSteamToInstall / shell.openExternal / runWineCommand") and are test-infrastructure additions, not scope changes to production code.

## TDD Gate Compliance

Both tasks share a single combined RED→GREEN pair (the plan's two tasks are tightly coupled — Task 2's regression tests exercise the exact `readAcfState`/`pollInstallOnce` functions Task 1's rewire depends on staying correct, and both were implemented/verified together):

- RED (`e5932697`) confirmed 2 genuine failures (finalize-not-called, ordering-empty) against the unmodified `library.ts`, while 114 pre-existing tests plus 4 new tests that lock in already-correct behavior (no-auto-drive guard, both regression tests) passed unchanged.
- GREEN (`a4eaea8f`) brought the full library suite to 116/116, full backend suite to 1155/1155.

No REFACTOR commit was needed — the GREEN implementation required no post-hoc cleanup beyond a single lint fix (unused `fn` parameter in a test's `setInterval` mock implementation, folded into the GREEN commit's own verification pass, not a separate commit).

## Issues Encountered

None beyond the one inline lint fix (unused parameter in a locally-defined `setInterval` mock), resolved during GREEN verification, well within the 3-attempt auto-fix budget.

## User Setup Required

None — pure backend engine code, no new dependencies, no new IPC channels, no new UI surface. The finalize-then-watch behavior is entirely internal to `SteamLibraryManager.init()`.

## Known Stubs

None — `locateDownloadingTarget()` and the rewired resume loop are fully implemented with no placeholder/mock data paths in production code.

## Threat Flags

None — the only new surface this plan introduces (the startup finalize call itself) is exactly the surface enumerated in the plan's own `<threat_model>`, and both `mitigate` dispositions are implemented and tested as designed:
- T-21-16 (init() silent auto-drive / folded todo): the resume path calls only `finalizeToSteam` + `startInstallPolling`; grep-verified absence of `downloadSteamDepots` in `library.ts`, and a dedicated test asserts `tellBottledSteamToInstall`/`shell.openExternal`/`runWineCommand` are never called from the resume path.
- T-21-13 (startup finalize racing Steam): `finalizeToSteam` uses Plan 02's atomic temp+rename write (unchanged in this plan); `pollInstallOnce`/`readAcfState` only ever read the `.acf`, never write it — no race is introduced by adding a finalize call before the poller starts.

No new network endpoints, auth paths, or schema changes.

## Next Phase Readiness

- The folded todo `steam-startup-download-resume-autoopens-crossover` is closed — startup resume no longer risks silently opening Steam or CrossOver.
- `locateDownloadingTarget()` is a private, file-local helper — no other plan is expected to import it; if a future plan needs the same ACF-locate logic elsewhere, it should be promoted to an exported utility at that time rather than pre-emptively exported here.
- SNI-04 is now fully covered by both the finalize-on-attempt path (21-06) and the finalize-on-startup-resume path (this plan) — the D-05 single recovery mechanism (Pattern 5) has both of its call sites wired.

---
*Phase: 21-steam-native-install*
*Completed: 2026-07-15*

## Self-Check: PASSED

- FOUND: `src/backend/storeManagers/steam/library.ts`
- FOUND: `src/backend/storeManagers/steam/__tests__/library.test.ts`
- FOUND: `.planning/phases/21-steam-native-install/21-08-SUMMARY.md`
- FOUND commit `e5932697` (test: RED)
- FOUND commit `a4eaea8f` (feat: GREEN)
