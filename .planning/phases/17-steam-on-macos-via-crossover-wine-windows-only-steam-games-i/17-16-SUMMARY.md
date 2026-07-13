---
phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
plan: 16
subsystem: steam-bottle-provisioning
tags: [macos, crossover, wine, provisioning, gap-closure, test-teardown]
gap_closure: true
requires:
  - dedicated Steam CrossOver bottle module (17-02/17-04)
  - both-root Steam path resolver (17-12, GAP-17-PFX86-PATH)
  - win10_64 template + win32 recreate pre-guard (17-15, GAP-17-CEF-RENDER)
provides:
  - readiness-reconciled `provisioned` flag (never written false in the wait:false window)
  - WINEPREFIX-scoped `wineserver -k` before `cxbottle --delete` in the win32-recreate branch
  - leak-safe macOS raise poll loop (unref'd timers + cancellable) + `__stopBottledRaiseLoops` test hook
  - conservative `visible is true` installer-window targeting
affects:
  - src/backend/storeManagers/steam/bottle.ts
  - src/backend/storeManagers/steam/__tests__/bottle.test.ts
tech-stack:
  added: []
  patterns:
    - lazy write-through readiness reconcile (self-healing config flag)
    - single-source-of-truth binary derivation (WINESERVER_BIN/CX_ROOT from CXBOTTLE_BIN)
    - unref + module-scoped cancellation flag for fire-and-forget poll loops
key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts
decisions:
  - "GAP A fix chosen path (a): lazy reconcile in isBottleReady() rather than SteamSetup.exe process-exit detection — self-heals on the first routing call that observes a ready bottle, no main.ts change."
  - "GAP B wineserver binary derived from CXBOTTLE_BIN (single source of truth), never a second hardcoded absolute path; WINEPREFIX hard-fenced to getBottleDir(bottleName) (T-17-DoS)."
  - "GAP C leak fixed at the source (unref + cancellation flag), not merely hidden by a test mock; cancellation flag resets at each loop start so a prior teardown cancel never suppresses a legitimate later raise."
metrics:
  tasks: 3
  files: 2
  completed: 2026-07-13
requirements: [MACSTEAM-02, MACSTEAM-04]
---

# Phase 17 Plan 16: Steam-on-macOS Gap Closure (GAP A/B/C) Summary

Closed the three remaining OPEN code gaps from session-5 real-CrossOver UAT: the `provisioned` config flag no longer sticks `false` against the `wait:false` SteamSetup race (GAP A), the win32→win64 recreate stops the bottle's own Wine processes with a WINEPREFIX-scoped `wineserver -k` before `cxbottle --delete` so the delete succeeds while Steam is running (GAP B), and the macOS raise poll loop is leak-safe so the bottle test suite exits 0 with no worker force-exit (GAP C). All three touched only `bottle.ts` + `bottle.test.ts`.

## What Was Built

### Task 1 — GAP A: readiness-reconciled `provisioned` flag (`f4a2483c` test, `1979bf07` fix)
- `provisionBottle()` step 8 no longer writes `provisioned:false`. It now persists `provisioned:true` **only** when the bottled `steam.exe` is present; when steam.exe is legitimately still absent right after the `wait:false` installer launch, the flag is left untouched (no clobber).
- `isBottleReady()` gained a lazy write-through reconcile: the first time it observes a genuinely ready bottle (cxbottle.conf + bottled steam.exe) and the stored flag is not already `true`, it self-heals `provisioned:true`. This makes `steamBottleStatus` (main.ts:900) read a correct value with no main.ts change.
- The win32-recreate branch's legitimate `set('provisioned', false)` reset is preserved (a freshly deleted bottle IS un-provisioned) — `grep -c` confirms exactly one `set('provisioned', false)` remains.

### Task 2 — GAP B: WINEPREFIX-scoped `wineserver -k` before delete (`556ab353` test, `d796c8e8` fix)
- Added `WINESERVER_BIN = join(dirname(CXBOTTLE_BIN), 'wineserver')` and `CX_ROOT = dirname(dirname(CXBOTTLE_BIN))` — derived from the single `CXBOTTLE_BIN` source of truth, no second hardcoded path.
- Added `killBottleWineServer(bottleName)`: `spawnAsync(WINESERVER_BIN, ['-k'], { env: { ...process.env, WINEPREFIX: getBottleDir(bottleName), CX_ROOT } })`, best-effort (try/catch + `logWarning`, never aborts provisioning).
- Wired it to run immediately **before** `cxbottle --delete --force` in the win32-recreate branch, so the delete no longer aborts with "There are still applications running… Aborting" in the exact CEF-grey-bar scenario it targets.
- SCOPE-FENCE (T-17-DoS): `WINEPREFIX` is the target Steam bottle's own dir only — a unit test asserts it equals `getBottleDir('GameLibSteam')`, is NOT `getBottleDir('GameLib')` (the shared GOG/Epic bottle), and is never unset.

### Task 3 — GAP C: leak-safe raise loop + conservative focus (`ddb114da`)
- The `sleep()` retry timer inside `raiseFrontmostBottledProcess` is now `unref()`'d (optional-chained) and tracked in a module-scoped `Set`, so a pending ~18s poll can never keep the Jest worker alive.
- Added a module-scoped `bottledRaiseLoopsCancelled` flag + exported test-only `__stopBottledRaiseLoops()` hook that cancels the loop and `clearTimeout`s every tracked handle. Each loop iteration and the post-loop re-raise check the flag and bail, so no dynamic `import(...)` runs after Jest teardown. The flag resets at each loop start so a prior cancel never suppresses a legitimate later raise.
- `raiseInstallerWindow`'s AppleScript now filters to `visible is true` processes (mirroring the working `raiseBottledGameWindow`) and picks the first visible match, avoiding hidden/background helpers of the same name.
- Test wiring: `backend/constants/environment` mocked to force `isMac:true` (deterministic loop on all hosts), an `afterEach` calls `__stopBottledRaiseLoops()` + restores real timers, and a fake-timer test asserts `jest.getTimerCount()` returns to 0 after the teardown hook.

## Verification

- `npm test -- --testPathPattern="steam.*bottle"` — **71 passed, jest exit 0** (was exit 1 due to the GAP C leak). No "worker process has failed to exit gracefully" / "import a file after the Jest environment has been torn down".
- `npm run codecheck` (tsc --noEmit) — **exit 0**.
- `grep -c "set('provisioned', false)"` → **1** (win32-recreate branch only).
- `grep -nE "wineserver|unref|visible is true"` → all three fixes present in source.
- Existing 17-01..17-15 plan/summary files untouched — `git diff --name-only` shows only `bottle.ts` + `bottle.test.ts` changed.

## Deviations from Plan

None — plan executed exactly as written. GAP A used the plan's preferred option (a) lazy reconcile in `isBottleReady()`.

## Deferred Issues

- **Pre-existing `library.ts` async leak (out of scope):** running the broad `npm test -- --testPathPattern="steam"` (11 suites, 368 tests all pass) still exits 1 due to a stray `setTimeout`-driven poll in `library.ts` `pollInstallOnce`→`readAcfState` (line ~864) firing after teardown. This is the separate leak documented in `deferred-items.md` ("From 17-11"), NOT GAP C, and this plan's files (`bottle.ts`/`bottle.test.ts`) do not touch `library.ts`. The plan's mandated verify command (`steam.*bottle`) exits 0. Left as the existing deferred item for its own investigation.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary surface introduced. The one process-terminating call (`wineserver -k`, T-17-DoS in the plan's threat register) is scope-fenced to the target bottle's own WINEPREFIX with a dedicated unit-test assertion.
