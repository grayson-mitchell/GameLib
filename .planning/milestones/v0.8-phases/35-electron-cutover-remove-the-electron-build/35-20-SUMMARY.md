---
phase: 35-electron-cutover-remove-the-electron-build
plan: 20
subsystem: infra
tags: [steam, protocol-handler, sidecar, ipc, jest, launch-dispatch, file-watcher]

# Dependency graph
requires:
  - phase: 35-electron-cutover-remove-the-electron-build
    provides: "35-19's live-gate run naming criteria 6/10/14 as FAIL, and D-35-19-05/06/09 as the code-level root causes"
provides:
  - "RUNNERS enum (protocol.ts) widened to include 'steam', excluding 'zoom'"
  - "dispatchSteamLaunch — single shared Steam launch dispatch used by both the sidecar launch handler and the gamelib:// deep-link handler"
  - "installedJsonWatcher.ts renderer notification (sendFrontendMessage('refreshLibrary', 'legendary')) after a debounced installed.json refresh resolves"
affects: [35-29, 39]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared dispatch module pattern: two call sites (sidecar RPC handler, protocol.ts deep-link handler) that must produce an identical side effect route through one lazily-imported helper module instead of duplicating logic"
    - "Real sidecar-RPC-harness end-to-end test seeds the actual persisted cache (steamLibraryStore) rather than mocking the store manager, when the assertion targets a real cross-module side effect (recent-games write)"

key-files:
  created:
    - src/backend/storeManagers/steam/launchDispatch.ts
    - src/backend/storeManagers/steam/__tests__/launchDispatch.test.ts
  modified:
    - src/backend/protocol.ts
    - src/backend/__tests__/protocol.test.ts
    - src/backend/sidecar/steamFlowRegistration.ts
    - src/backend/sidecar/__tests__/steamFlows.test.ts
    - src/backend/sidecar/installedJsonWatcher.ts
    - src/backend/sidecar/__tests__/installedJsonWatcher.test.ts

key-decisions:
  - "RUNNERS widened to include 'steam' but explicitly excludes 'zoom' (a dropped platform with no user-reachable launch path)"
  - "Steam dispatch checked BEFORE the launchEventCallback fallback in protocol.ts's is_installed branch, avoiding launchEventCallback's existsSync/askForceUninstall precheck that steamFlowRegistration.ts already avoids for the same reason"
  - "addRecentGame's call inside dispatchSteamLaunch is wrapped in its own try/catch: a recent-games store-write failure must never turn a successful launch into a reported failure"
  - "installedJsonWatcher's renderer notification sends AFTER refreshInstalled() resolves and inherits the existing 500ms debounce rather than adding a second one; a rejecting refresh sends nothing (no catch added, matching pre-existing propagation behavior)"

requirements-completed: [REQ-35-20]

# Metrics
duration: ~20min (commit-span; execution continued a resumed session)
completed: 2026-08-30
---

# Phase 35 Plan 20: Close criteria 6/10/14 (Steam launch dispatch + renderer refresh signal) Summary

**Single `dispatchSteamLaunch` helper now shared by the sidecar `launch` handler and the widened `protocol.ts` deep-link handler, writing the missing `games.recent` entry; `installedJsonWatcher` now tells the renderer to refresh after a debounced `installed.json` rebuild.**

## Performance

- **Duration:** ~20 min across 3 task commits (this session's visible commit window: 17:41–17:55 local time)
- **Tasks:** 3/3 completed
- **Files modified:** 7 (2 new, 5 modified)

## Accomplishments

- `RUNNERS` (`protocol.ts`) now includes `'steam'` (excludes `'zoom'` deliberately), so a `gamelib://launch?appName=<steam appId>` deep link resolves the title via `findGame`'s runner-less fallback loop instead of logging `Could not receive game data`.
- `protocol.ts`'s `is_installed` branch dispatches Steam through `dispatchSteamLaunch` BEFORE ever reaching `launchEventCallback`, avoiding the confused two-change interaction the plan's `<critical_plan_context>` flagged (widening `RUNNERS` alone would have let Steam titles hit `launchEventCallback`'s `existsSync`/`askForceUninstall` abort path).
- New shared module `src/backend/storeManagers/steam/launchDispatch.ts` (`dispatchSteamLaunch`) is now the single place both the sidecar `launch` handler and the deep-link handler route Steam launches through, and the single place that decides what "a Steam launch succeeded" means for the recent-games list.
- A successful Steam launch now writes a `games.recent` entry with `runner: 'steam'` — closing live-gate criteria 6 and 10 (previously: `store/config.json` was written for a GOG launch and not for two Steam launches).
- `installedJsonWatcher.ts` now calls `sendFrontendMessage('refreshLibrary', 'legendary')` after `refreshInstalled()` resolves, inside the existing 500ms debounce window — closing criterion 14's UI half (backend rebuilt `installedGames`, but nothing told the renderer to re-render).

## Task Commits

1. **Task 1: Widen `RUNNERS` and route Steam deep links off `launchEventCallback`** - `b0b311321` (feat)
2. **Task 2: Add `dispatchSteamLaunch` shared helper for launch + recent-game write** - `bbed5f3e7` (feat)
3. **Task 3: Notify renderer after `installed.json` refresh resolves** - `b6507de63` (feat)

**Plan metadata:** _(this commit, made after this SUMMARY)_

## Files Created/Modified

- `src/backend/protocol.ts` - `RUNNERS` widened to `['legendary', 'gog', 'nile', 'sideload', 'steam']`; `handleLaunch`'s `is_installed` branch dispatches Steam through `dispatchSteamLaunch` before the `launchEventCallback` fallback.
- `src/backend/__tests__/protocol.test.ts` - 3 new test cases: RUNNERS enum shape, `findGame`'s runner-less fallback resolving a Steam appId, and the Steam dispatch route bypassing `launchEventCallback`. RED-proven by temporarily reverting the enum.
- `src/backend/storeManagers/steam/launchDispatch.ts` (new) - `dispatchSteamLaunch(appName): Promise<boolean>` — launches via `libraryManagerMap.steam`, then records `addRecentGame` on success only, isolating a store-write failure in its own try/catch.
- `src/backend/storeManagers/steam/__tests__/launchDispatch.test.ts` (new) - 3 cases: success writes the correct recent-game shape, a failed launch writes nothing, and an `addRecentGame` rejection still resolves `true` and logs a warning. RED-proven by temporarily removing the try/catch.
- `src/backend/sidecar/steamFlowRegistration.ts` - `handleLaunch`'s `runner === 'steam'` branch now calls `dispatchSteamLaunch(appName)` instead of calling `libraryManagerMap.steam.getGame(appName).launch(...)` directly.
- `src/backend/sidecar/__tests__/steamFlows.test.ts` - New "Test D": drives the real, unmocked sidecar RPC wiring end-to-end and asserts exactly one `games.recent` entry with `appName`/`runner` populated. Required seeding `steamLibraryStore` with a library entry for the test appId (see Issues Encountered below).
- `src/backend/sidecar/installedJsonWatcher.ts` - Default `refresh` now `await`s `refreshInstalled()` then calls `sendFrontendMessage('refreshLibrary', 'legendary')`; the `import { sendFrontendMessage } from '../ipc'` import was added.
- `src/backend/sidecar/__tests__/installedJsonWatcher.test.ts` - New describe block "the renderer refresh signal (D-35-19-09)" with 4 cases: (a) sends once after refresh resolves, (b) sends AFTER not alongside, (c) sends zero times on a rejecting refresh, (d) collapses two writes inside the window into one send. RED-proven for case (a) (and its dependents b/d) by temporarily removing the `sendFrontendMessage` line.

## Decisions Made

- **Zoom stays excluded from `RUNNERS`.** It is a dropped platform for this project (no user-reachable launch path), so widening the enum for it would only widen the accepted `?runner=` input surface for nothing. Documented inline in `protocol.ts`.
- **Steam dispatch check placed BEFORE the `launchEventCallback` fallback**, not as a branch inside it — this is the exact ordering the plan's critical-context section required to avoid the two-change interaction defect (RUNNERS widening alone would let Steam titles reach `launchEventCallback`'s abort-prone precheck).
- **`dispatchSteamLaunch` resolves `libraryManagerMap` via a lazy `await import('backend/storeManagers')`**, mirroring `launcher.ts`'s own lazy resolution of the same map, to avoid adding a new static edge into the `launcher.ts <-> storeManagers/index.ts` circular-import seam.
- **A rejecting `addRecentGame` never fails the launch report.** Bookkeeping failure is isolated in its own try/catch inside `dispatchSteamLaunch`; the launch is still reported as `true`.
- **A rejecting `refreshInstalled()` never sends `refreshLibrary`.** No catch was added around the `await refreshInstalled()` call in `installedJsonWatcher.ts` — a failed rebuild has nothing new for the renderer to read, and this matches how the rejection propagated before this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in own test authorship, fixed before commit] `steamFlows.test.ts` Test D's initial draft read `undefined` `app_name`/`runner` from `getGameInfo()`**
- **Found during:** Task 2 verification (writing Test D)
- **Issue:** `SteamGame.getGameInfo()` (`games.ts`) returns `{} as GameInfo` on a cache miss — Test D's appId `'999003'` had no entry in the mocked-empty Steam library (`getSteamLibraries` resolves `[]` in this suite), so `dispatchSteamLaunch`'s `addRecentGame(game.getGameInfo())` call received an empty object. `SteamGame.launch()` itself does not need a library entry (it dispatches purely off the numeric appId via `buildSteamProtocolUrl`), which is why the pre-existing Test C passed without any seeding — only the `getGameInfo()` call this plan's new code path added actually needed one.
- **Fix:** Seeded `steamLibraryStore` (the same persisted cache `getGameInfo()` falls back to on an in-memory cache miss) with a minimal `GameInfo` entry for `'999003'` before invoking the launch, mirroring a real installed title already known to the library — the only realistic precondition for a user to have requested this launch. Cleared in `beforeEach` for hygiene.
- **Files modified:** `src/backend/sidecar/__tests__/steamFlows.test.ts`
- **Verification:** Test D passes; all other tests in the file (A, B, C) unaffected.
- **Committed in:** `bbed5f3e7` (Task 2 commit)

**2. [Rule 3 - Blocking, test infrastructure] Case (c) of `installedJsonWatcher.test.ts` needed a way to observe a deliberately-uncaught rejection without failing on jest circus's unhandled-rejection detection**
- **Found during:** Task 3 verification (writing case c: "sends refreshLibrary ZERO times when refreshInstalled rejects")
- **Issue:** The plan requires NO catch around `refreshInstalled()` in production code (a rejecting refresh must propagate exactly as before). That means the internal `refresh()` arrow's returned promise is never consumed by anything (its caller, `setTimeout(refresh, ...)`, discards a callback's return value), so it structurally rejects unhandled. Jest circus fails the currently-running test on any unhandled rejection observed during it — which would fail case (c) for the exact behavior it exists to prove. Attempting to suppress this via a plain `process.on('unhandledRejection', ...)` listener (added/removed around the assertions) did NOT work — the failure persisted identically.
- **Fix:** Wrapped the real `setTimeout` for the duration of case (c) only, attaching a `.catch()` directly to the specific promise the debounce callback returns (the one that would otherwise go unhandled), then restoring the original `setTimeout` in a `finally` block. This changes nothing about production behavior — the module still receives no catch, and the rejection still happens — it only gives the test a handle to observe-and-swallow it once, scoped to calls made while the spy is installed.
- **Files modified:** `src/backend/sidecar/__tests__/installedJsonWatcher.test.ts`
- **Verification:** Case (c) passes; full 13-test file green (was 12/13 with the process-listener approach, still red).
- **Committed in:** `b6507de63` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 test-authorship bug found while writing Task 2's cross-regression test, 1 test-infrastructure blocker in Task 3's rejection case). No production-code deviations from the plan — `protocol.ts`, `launchDispatch.ts`, `steamFlowRegistration.ts`, and `installedJsonWatcher.ts` all match the plan's `must_haves` exactly.
**Impact on plan:** Both deviations were confined to test files; no scope creep into production code.

## RED-proof outputs (verbatim, captured during execution)

**Task 1 (`protocol.test.ts`)**, `RUNNERS` reverted to 4 entries:
```
Expected length: 5, Received length: 4
Number of calls: 0   (libraryManagerMap.steam.getGame)
Number of calls: 0   (dispatchSteamLaunch)
```
3 of 28 tests failed as expected; restoring the enum returned the file to 28/28 green.

**Task 2 (`launchDispatch.test.ts`)**, try/catch removed around `addRecentGame`:
```
store write failed
(unhandled rejection propagating through dispatchSteamLaunch instead of resolving true)
```
1 of 3 tests failed as expected; restoring the try/catch returned the file to 3/3 green.

**Task 3 (`installedJsonWatcher.test.ts`)**, `sendFrontendMessage('refreshLibrary', 'legendary')` line removed:
```
● (a) sends refreshLibrary/legendary exactly once after refreshInstalled resolves
  expect(jest.fn()).toHaveBeenCalledTimes(expected)
  Expected number of calls: 1
  Received number of calls: 0

● (b) sends refreshLibrary AFTER refreshInstalled resolves, not alongside it
  - Expected  - 1
  + Received  + 0
    Array [
      "refreshInstalled",
  -   "sendFrontendMessage",
    ]

● (d) collapses two writes INSIDE the window into exactly ONE send, same as the refresh
  expect(jest.fn()).toHaveBeenCalledTimes(expected)
  Expected number of calls: 1
  Received number of calls: 0
```
3 of 13 tests failed as expected (case c, the rejection path, was unaffected by this specific line and stayed green); restoring the line returned the file to 13/13 green.

## Exact `sendFrontendMessage` call shape for plan 35-29 to grep the live log

`sendFrontendMessage('refreshLibrary', 'legendary')` — fired once per settled `installed.json`
change, inside `installedJsonWatcher.ts`'s existing 500ms debounce, only after
`libraryManagerMap['legendary'].refreshInstalled()` resolves (never on a rejecting refresh). This
is the identical call shape the three peer paths already use (`legendary/games.ts:767,1067`,
`sideload/library.ts:77`, `nile/games.ts:512`), so a grep for `refreshLibrary.*legendary` in the
live sidecar log after touching `installed.json` externally is sufficient to discharge criterion
14 at the live-gate level.

## Issues Encountered

- **`decompressPool.test.ts` (3 pre-existing failures, out of scope).** Full `pnpm test --selectProjects Backend` run at this plan's verification step surfaced 3 failures in
  `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts` (`lzmaDecoderKind()` expected
  `'native'`, received `'pure-js'`). This file is untouched by this plan (confirmed via `git
  status` at each commit boundary). Matches the existing "LZMA off" record
  (`sea-decode-hang-unreproduced-closed-conservative.md`) — native LZMA decode is disabled by
  default on this dev machine. Logged to `deferred-items.md` (item 3) per the scope-boundary rule
  rather than fixed.
- **`gsd-sdk query init.execute-phase` corrupted `.planning/STATE.md`** at session start (truncated 7994 → ~7333 lines, resetting the plan-position and progress fields). Restored via `git show HEAD:.planning/STATE.md > .planning/STATE.md`, verified with an empty `git diff --stat`. All subsequent `gsd-sdk query state.*` calls in this execution are snapshotted and diffed before/after per the user's documented corruption pattern.

## Known Stubs

None.

## Threat Flags

None — all new surface (`dispatchSteamLaunch`, the widened `RUNNERS` enum, the renderer
notification) was named explicitly in the plan's `<threat_model>` (T-35-100 through T-35-103,
T-35-SC) and the confused-deputy guard (T-34.5-46-03, the own-property check in
`steamFlowRegistration.ts`) was preserved unchanged — only its call target inside the `steam`
branch changed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Live-gate criteria 6, 10, and 14 have their code-level root causes closed; a live-gate re-run
  (plan 35-29 or later) can now grep the exact `sendFrontendMessage` call shape documented above,
  and drive a real Steam launch to confirm the `games.recent` entry, to discharge them at the
  gate level.
- `deferred-items.md` item 3 (the `decompressPool.test.ts` native-LZMA failures) remains open and
  unrelated to this plan's scope — carried forward for whichever future plan owns LZMA loader
  work.

---
*Phase: 35-electron-cutover-remove-the-electron-build*
*Completed: 2026-08-30*

## Self-Check: PASSED

All 9 claimed files verified present on disk; all 3 task commit hashes (`b0b311321`,
`bbed5f3e7`, `b6507de63`) verified present in `git log --oneline --all`.
