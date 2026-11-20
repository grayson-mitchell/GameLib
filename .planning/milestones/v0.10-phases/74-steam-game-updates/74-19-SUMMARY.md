---
phase: 74-steam-game-updates
plan: 19
subsystem: steam-update
tags: [steam, auto-update, unattended, WR-08, gap-closure]
requires: [74-15, 74-17]
key-files:
  modified:
    - src/common/types.ts
    - src/common/types/game_manager.ts
    - src/backend/downloadmanager/updateElement.ts
    - src/backend/downloadmanager/utils.ts
    - src/backend/storeManagers/index.ts
    - src/backend/storeManagers/gog/games.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/updateBridge.ts
    - src/backend/storeManagers/steam/depotRust/updateEstimate.ts
    - src/backend/storeManagers/steam/depotRust/install.ts
    - src/backend/storeManagers/steam/depot/planModel.ts
  created:
    - src/backend/downloadmanager/__tests__/updateElement.test.ts
decisions:
  - "Lease reason stays 'user-install' when unattended; only guidedAction is dropped (reason drives the macOS go-offline wrap)"
metrics:
  tasks: 2
  completed: 2026-11-13
requirements: [STEAM-02]
---

# Phase 74 Plan 19: Unattended auto-update Summary

An auto-update now carries `unattended: true` from `autoUpdate` through the queue into `SteamGame.update`, where it skips the Keychain-gate unlock, omits `guidedAction` on the lease, shows no dialog, and refuses Steam-registered games.

## Commits

- 2a64f1f26: feat(74-19): autoUpdate marks queue update elements unattended
- 4b0de3e10: fix(74-19): unattended Steam update never signs in, prompts or unlocks the gate

## Details

- `guidedAction` is now conditional at both sites:
  - updateEstimate.ts:79 `...(opts.unattended === true ? {} : { guidedAction: 'install' as const })`
  - install.ts:141 same expression.
- Unattended failures in `updateBridgeGame` log one `unattended=true` line and return the normal error result (queue failure notification only).
- Tests added in createStoreManagers, utils (updateQueueElement), new updateElement, updateDispatch, updateBridge, updateEstimate, rustInstall.

## Deviations from Plan

**1. [Rule 3 - Blocking] GOG `update()` signature.** The `library[runner]` union made `update({ unattended })` fail typecheck, so `unattended?: boolean` was added (ignored) to `gog/games.ts`.
**2. Queue forwarding test** lives in `downloadmanager/__tests__/utils.test.ts` (downloadqueue.test.ts mocks utils.ts); a new `updateElement.test.ts` covers the element builder.

## Deferred Issues

`pnpm find-deadcode` fails: `new knip finding: types | src/backend/storeManagers/steam/depotRust/retire.ts | KeptReason`. This is from plan 74-15's `retire.ts`, not touched here; out of scope.

## Verification

Steam + downloadmanager + storeManagers jest: 166 suites passed, 4525 passed, 5 skipped. codecheck, lint (warnings only), check:ipc-contract, steam-line-ceiling, scoped prettier pass. `graphify update .` run (no semantic key).

## Self-Check: PASSED
