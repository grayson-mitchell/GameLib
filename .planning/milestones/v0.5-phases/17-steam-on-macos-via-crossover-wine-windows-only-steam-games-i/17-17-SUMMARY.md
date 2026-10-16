---
phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
plan: 17
subsystem: steam-macos-bottle
tags: [steam, crossover, bottle, security, data-loss, gap-closure]
requires:
  - "provisionBottle + WineSelector + SteamBottleSetup (17-04/17-06)"
  - "SteamGame.install bottle routing + startInstallPolling (17-05/17-09)"
provides:
  - "CR-01: shared-bottle destruction guard (authoritative backend + UI defense-in-depth)"
  - "WR-01: bottle ACF poller gated on dispatch success"
  - "WR-02: removal of the dead always-false SteamBottleConfig.loggedIn signal"
affects:
  - "src/backend/storeManagers/steam/bottle.ts"
  - "src/backend/storeManagers/steam/games.ts"
  - "src/backend/storeManagers/steam/library.ts"
  - "src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx"
  - "src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx"
  - "src/common/types/steam.ts / ipc.ts / backend/main.ts"
tech-stack:
  added: []
  patterns:
    - "Semantic scope guard on already-sanitized input at the authoritative chokepoint (defense-in-depth over the reachable UI)"
    - "unref() on background poll intervals for Jest-teardown safety (mirrors bottle.ts GAP C)"
key-files:
  created: []
  modified:
    - "src/backend/storeManagers/steam/bottle.ts"
    - "src/backend/storeManagers/steam/__tests__/bottle.test.ts"
    - "src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx"
    - "src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx"
    - "src/backend/storeManagers/steam/games.ts"
    - "src/backend/storeManagers/steam/__tests__/games.test.ts"
    - "src/backend/storeManagers/steam/library.ts"
    - "src/common/types/steam.ts"
    - "src/backend/main.ts"
    - "src/common/types/ipc.ts"
decisions:
  - "WR-02 removed (not wired): bottled-Steam auth is opaque (D-04), so no backend point could truthfully write loggedIn — removal is the honest fix over a fabricated value."
  - "CR-01 defended at TWO layers: authoritative backend guard in provisionBottle (single source of correctness) + removal of the reachable shared-prefix toggle on the Steam setup path."
metrics:
  duration: "~20 min"
  completed: "2026-07-13"
  tasks: 4
  files: 10
---

# Phase 17 Plan 17: Gap Closure (CR-01 / WR-01 / WR-02) Summary

Closes the three open code-review findings from 17-REVIEW.md: a confirmed data-loss BLOCKER where the guided Steam setup could destroy the shared GOG/Epic Wine bottle, plus two dishonest bottle surfaces (false "installing" state, always-false `loggedIn`). The shared GameLib bottle can no longer be created/deleted/Steam-polluted via the guided setup; a failed bottle dispatch no longer spawns a ~60s false-installing poller; and the dead `loggedIn` signal is gone from the type, IPC surface, and handler.

## What Was Built

### Task 1 — CR-01 authoritative backend guard (TDD)
`provisionBottle()` now reads the user's shared bottle (`GlobalConfig.get().getSettings().wineCrossoverBottle`) and, when the requested (already-sanitized) `bottleName` equals the trimmed shared value, returns `{ status: 'error', error: 'Refusing to provision Steam into the shared Wine bottle.' }` **before** any `steamBottleConfigStore.set`, `cxbottle --delete`/`--create`, or `rmSync`. This is the single source of correctness — it holds even if a future or renderer caller passes the shared name, precisely because the downstream win32-recreate branch would otherwise `killBottleWineServer` + `cxbottle --delete --force` + `rmSync(getBottleDir(...))` the shared bottle (irrecoverable). Whitespace-padded config values are compared trimmed so they cannot slip past; an unset/empty shared value is inert.

RED commit `0fcd52c2` (5 guard tests: shared-name rejection with no set/spawn/rmSync, whitespace-padded name + config, non-over-fire on `GameLibSteam`, inert-when-unset) → GREEN commit `a060dad4`.

### Task 2 — CR-01 defense-in-depth (UI)
`WineSelector` gains an optional `hideSharedPrefixToggle?: boolean`. When true, the "Use shared Wine prefix" `ToggleSwitch` (`use-shared-wine-config`) and its warning `infoBox` are not rendered, so `useSharedPrefix` stays `false` and `setCrossoverBottle(globalConfig.wineCrossoverBottle)` is never invoked. `SteamBottleSetup` passes the flag, removing the only reachable renderer source of the shared bottle name. The prop is optional/default-undefined; all other callers (GOG/Epic/Amazon/sideload) are unchanged. Commit `ded8718d`.

### Task 3 — WR-01 poller gated on dispatch success (TDD)
`SteamGame.install()` bottle branch now early-returns `{ status: 'error', error: result.error }` when `tellBottledSteamToInstall` fails, **before** `startInstallPolling(this.appId, { source: 'bottle' })`. A failed dispatch no longer produces ~60s of false "installing" state. Native path unchanged. RED commit `8236a2ec` → GREEN commit `3b0ae62e`.

### Task 4 — WR-02 remove dead `loggedIn` signal
Deleted `loggedIn` from `SteamBottleConfig` (`steam.ts`), the `steamBottleStatus` IPC `Pick` (`ipc.ts`), and the `main.ts` handler; corrected the D-04 comment to state auth stays opaque and only `provisioned` + `bottleName` are surfaced. Grep confirms no remaining bottle `loggedIn` reader/writer (the unrelated Sidebar/plausible `loggedIn` locals are a different concept, untouched). Commit `6495c44f`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `unref()` on Steam install/uninstall poll intervals**
- **Found during:** Task 3 verification (`npm test -- --testPathPattern="steam.*games"`).
- **Issue:** The games suite passed 122/122 but the **process exited 1**: a pre-existing leaked real `startInstallPolling` interval (started by the Plan 09 `ensurePlatformsCaptured` tests, which take the native install path and do **not** spy `startInstallPolling`) survived Jest teardown and fired a later tick, crashing in `readAcfState` (`library.ts:646`, `undefined.map`) after mocks were reset. Confirmed pre-existing — reproduces identically at the plan base commit `30ce982f` with none of my changes applied.
- **Why blocking:** the plan's required verify ("steam.*games pattern green") could not pass green because the non-zero exit is treated as failure, despite every test passing.
- **Fix:** added `timer.unref?.()` to both the install and uninstall poll `setInterval` timers in `library.ts` — the exact Jest-teardown-safety pattern already used in `bottle.ts` (GAP C). Production-neutral: in the Electron main process the app's own event loop keeps polling alive; `unref` only stops a timer from independently keeping a bare Node/Jest process alive.
- **Files modified:** `src/backend/storeManagers/steam/library.ts` (not in the plan's `files_modified` — scope expansion documented here).
- **Commit:** `db17b49f`
- **Result:** `steam.*games` now exits 0 green (122/122), no teardown crash.

### Note on the base-comparison probe
During the WR-01 investigation I temporarily swapped in the base-commit versions of `games.ts`/`games.test.ts` to prove the leaked-timer crash was pre-existing. A backup-path mismatch in that throwaway shell left the working `games.ts` reverted to base on disk; the WR-01 fix was re-applied and re-verified (full suite 122/122 with the fix) before committing `3b0ae62e`. No committed artifact was affected (the revert was never staged).

## Verification

| Gate | Result |
|------|--------|
| `npm test -- --testPathPattern="steam.*bottle"` | 76/76 pass, exit 0 |
| `npm test -- --testPathPattern="steam.*games"` | 122/122 pass, exit 0 |
| `npm run codecheck` (tsc --noEmit) | exit 0 |
| `grep wineCrossoverBottle bottle.ts` | guard present in `provisionBottle` (L567) |
| `grep hideSharedPrefixToggle` (both frontend files) | present (WineSelector gate + SteamBottleSetup pass) |
| `grep loggedIn ipc.ts` | 0 matches (field removed) |
| 17-01..17-16 plan files / SUMMARYs | untouched |

## Threat Surface

T-17-CR01 (Tampering/DoS — shared-bottle destruction) is now **mitigated** exactly as the plan's threat register specified: the authoritative `provisionBottle` chokepoint rejects the shared name before any destructive op, with defense-in-depth removal of the reachable UI source, and a unit test asserting no set/spawn/rmSync on the shared name. No new security-relevant surface was introduced (zero new dependencies; only existing `backend/config` read added).

## Known Stubs

None.

## Self-Check: PASSED

- SUMMARY.md present at the plan directory.
- All task commits verified in git log: `0fcd52c2`, `a060dad4`, `ded8718d`, `8236a2ec`, `3b0ae62e`, `db17b49f`, `6495c44f`.
