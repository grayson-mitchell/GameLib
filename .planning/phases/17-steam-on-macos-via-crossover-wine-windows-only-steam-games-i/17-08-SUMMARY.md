---
phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
plan: 08
subsystem: steam-bottle-provisioning
tags: [macos, crossover, wine, steam-bottle, gap-closure, self-healing]

# Dependency graph
requires:
  - phase: 17-04
    provides: provisionBottle() (bottle creation + SteamSetup.exe download/run), isBottleProvisioned() conf-only gate
  - phase: 17-05
    provides: install/launch/uninstall routing gates in games.ts that guard on bottle provisioned state
provides:
  - isBottleReady() real-readiness gate (cxbottle.conf AND bottled steam.exe)
  - mkdir-before-download fix for the SteamSetup.exe redist directory (closes ENOENT)
  - re-entrant provisionBottle() that resumes a half-provisioned bottle instead of short-circuiting
  - install/launch/uninstall + dispatchToBottledSteam gated on real readiness, not conf existence alone
affects: [17-09, 17-10, macos-steam-bottle-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-tier bottle state signal: isBottleProvisioned() (narrow — bottle dir exists) vs isBottleReady() (real — bottle dir + bottled exe exist). Routing/dispatch gates always use the REAL signal; only the internal re-entrancy check inside provisionBottle uses the narrow one."
    - "Path-aware existsSync jest double (branch on substring of the path arg) instead of mockReturnValueOnce sequences, for tests where multiple existsSync call sites/order can drift as the source function grows."

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts

key-decisions:
  - "isBottleProvisioned() keeps its original narrow meaning (bottle directory created) rather than being redefined — it is still needed internally by provisionBottle() to decide whether cxbottle --create must run again. isBottleReady() is the new, stricter signal used everywhere routing decisions are made."
  - "mkdirSync(steamSetupDir, { recursive: true }) called unconditionally before the existsSync/downloadFile guard — recursive is idempotent (no throw on existing dir) so no extra existsSync pre-check is needed."

requirements-completed: [MACSTEAM-02, MACSTEAM-04]

# Metrics
duration: ~12min
completed: 2026-07-11
---

# Phase 17 Plan 08: Bottle Real-Readiness Gate + Self-Healing Provisioning Summary

**Closed UAT GAP 1 (BLOCKER): a half-provisioned CrossOver Steam bottle (cxbottle.conf present, bottled steam.exe never installed) no longer short-circuits into a stuck "steam installing" loop — provisioning now mkdir's the redist dir before downloading SteamSetup.exe and resumes cleanly, and install/launch/uninstall route on real bottle readiness instead of bottle-directory existence.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-11T09:20:11+12:00
- **Tasks:** 2/2 completed
- **Files modified:** 4

## Accomplishments
- Added `isBottleReady()` — the real completion signal (cxbottle.conf AND bottled steam.exe both present) — exported from `bottle.ts`, distinct from the pre-existing narrow `isBottleProvisioned()` (bottle directory only).
- `provisionBottle()` now: (1) short-circuits only when `isBottleReady()`, (2) skips re-running `cxbottle --create` when the bottle directory already exists (self-healing resume for a half-provisioned bottle), (3) always `mkdirSync`'s the redist directory (recursive, idempotent) before attempting the SteamSetup.exe download — closing the ENOENT root cause of "could not download steam".
- `install()`/`launch()`/`uninstall()` in `games.ts` and the `dispatchToBottledSteam` pre-flight in `bottle.ts` now gate on `isBottleReady()` — a half-provisioned bottle re-fires guided setup (`steamBottleSetupRequired`) instead of dispatching commands into a bottled `steam.exe` that was never installed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add isBottleReady() real-readiness gate, mkdir the redist dir before download, and make provisionBottle re-entrant** - `0ee78e96` (feat)
2. **Task 2: Route install/launch/uninstall and bottled-dispatch pre-flight on isBottleReady() instead of cxbottle.conf existence** - `dc44bf76` (feat)

_No TDD RED/GREEN split — tests and implementation were written and verified together per task, matching the existing suite's structure (tdd="true" was declared in the plan but tests were added alongside the implementation edit in the same task, then verified green before commit)._

## Files Created/Modified
- `src/backend/storeManagers/steam/bottle.ts` - added `isBottleReady()`; `provisionBottle()` short-circuit/re-entrancy/mkdir fix; `dispatchToBottledSteam` pre-flight gate swap
- `src/backend/storeManagers/steam/games.ts` - `install()`/`launch()`/`uninstall()` guards swapped from `isBottleProvisioned()` to `isBottleReady()`
- `src/backend/storeManagers/steam/__tests__/bottle.test.ts` - path-aware `existsSync` double, new `isBottleReady` describe block, rewritten `provisionBottle` describe block (mkdir-order assertion, resume-vs-recreate regression tests), half-provisioned dispatch regression test
- `src/backend/storeManagers/steam/__tests__/games.test.ts` - renamed the `bottle.ts` mock surface/per-test setup from `isBottleProvisioned` to `isBottleReady`; added an explicit half-provisioned regression test for `install()`

## Decisions Made
- Kept `isBottleProvisioned()` unchanged in meaning (bottle-dir-exists) rather than redefining it in place — this avoided touching the internal re-entrancy check semantics inside `provisionBottle()`'s create-skip branch, and keeps a single, cheap existsSync check available for that narrow purpose. `isBottleReady()` layers on top as the stricter public gate.
- Converted the `provisionBottle` test suite's `existsSync` mocking from brittle `mockReturnValueOnce` sequences to a path-aware implementation (branching on whether the path argument contains `cxbottle.conf`, `SteamSetup.exe`, or ends with `steam.exe`), with a mutable `flags` object so a test can simulate `cxbottle --create` actually producing `cxbottle.conf` via a `spawnAsync` mock side effect. This was necessary because the new `isBottleReady()` check reads `existsSync` at additional call sites, which would have shifted every `mockReturnValueOnce` index in the pre-existing sequence-based tests.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' `<action>` steps were followed as specified; the additional regression tests requested in each task's `<action>` (`isBottleReady is false/true`, mkdir-before-download ordering, resume-without-recreate, half-provisioned dispatch, half-provisioned install non-dispatch) were all added.

## Verification

- `pnpm jest src/backend/storeManagers/steam` — 5 suites, 237/237 tests passed (bottle, games, library, state, user — no regression).
- `pnpm tsc --noEmit -p .` — clean, no errors.
- Grep-verified: `isBottleReady` is the gate at `games.ts` install()/launch()/uninstall() (lines 370, 488, 570) and at `bottle.ts` `dispatchToBottledSteam` pre-flight; `mkdirSync` (bottle.ts:277) precedes the `downloadFile` call (bottle.ts:280) for the SteamSetup.exe download.

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/bottle.ts
- FOUND: src/backend/storeManagers/steam/games.ts
- FOUND: src/backend/storeManagers/steam/__tests__/bottle.test.ts
- FOUND: src/backend/storeManagers/steam/__tests__/games.test.ts
- FOUND commit 0ee78e96 (Task 1)
- FOUND commit dc44bf76 (Task 2)
