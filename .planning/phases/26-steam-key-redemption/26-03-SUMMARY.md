---
phase: 26-steam-key-redemption
plan: 03
subsystem: ipc
tags: [ipc, preload, steam, redeem-key, contextBridge]

# Dependency graph
requires:
  - phase: 26-01
    provides: "SteamUser.redeemKey(store, key) backend wrapper + RedeemKeyResult/RedeemKeyOutcome discriminated types"
provides:
  - "redeemSteamKey IPC method: renderer-invokable, typed { store: 'steam'; key: string } -> RedeemKeyResult"
affects: [26-04, 26-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-file IPC lockstep (AsyncIPCFunctions type + preload makeHandlerInvoker export + backend addHandler) — exact analog of the existing steamSubmitGuard wiring"

key-files:
  created: []
  modified:
    - src/common/types/ipc.ts
    - src/preload/api/steam.ts
    - src/backend/main.ts

key-decisions:
  - "No new refresh/recompute plumbing added to main.ts for redeem — 26-04's dialog reuses the existing refreshLibrary({ library: 'steam' }) IPC path on success, per the plan's explicit correction #3"

patterns-established: []

requirements-completed: [REQ-26-02, REQ-26-06]

# Metrics
duration: ~8min
completed: 2026-07-20
---

# Phase 26 Plan 03: redeemSteamKey IPC Wiring Summary

**Wired `redeemSteamKey` across the three-file IPC lockstep (`ipc.ts` type, `preload/api/steam.ts` invoker, `backend/main.ts` handler), delegating straight to 26-01's `SteamUser.redeemKey(store, key)` wrapper with zero new side-effect plumbing.**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-07-20T02:57:31Z
- **Tasks:** 1 completed
- **Files modified:** 3

## Accomplishments

- `AsyncIPCFunctions` in `src/common/types/ipc.ts` gained a `redeemSteamKey: (payload: { store: 'steam'; key: string }) => Promise<RedeemKeyResult>` entry, importing `RedeemKeyResult` from `common/types/steam` alongside the existing `SteamBottleConfig`/`SteamUserData` import
- `src/preload/api/steam.ts` exports `redeemSteamKey = makeHandlerInvoker('redeemSteamKey')`, placed directly after `steamSubmitGuard` to mirror the existing steam-auth invoker grouping
- `src/backend/main.ts` registers `addHandler('redeemSteamKey', async (event, { store, key }) => SteamUser.redeemKey(store, key))` immediately after the `steamSubmitGuard` handler, matching that handler's structure exactly
- No `recomputeOwnership`/`refreshLibrary` plumbing was added — 26-04's dialog is expected to call the existing `refreshLibrary({ library: 'steam' })` IPC method on a successful redeem, per the plan's explicit interface note
- `SteamUser.redeemKey`'s real signature (`static async redeemKey(store: 'steam', key: string): Promise<RedeemKeyResult>`, confirmed by reading `src/backend/storeManagers/steam/user.ts:625-628`) matches the new IPC type exactly — no signature mismatch to reconcile

## Task Commits

Each task was committed atomically:

1. **Task 1: Add redeemSteamKey to the three-file IPC lockstep** - `21ae7d23` (feat)

## Files Created/Modified

- `src/common/types/ipc.ts` - Added `RedeemKeyResult` import and `redeemSteamKey` entry to `AsyncIPCFunctions`
- `src/preload/api/steam.ts` - Added `redeemSteamKey = makeHandlerInvoker('redeemSteamKey')` export
- `src/backend/main.ts` - Added `addHandler('redeemSteamKey', ...)` delegating to `SteamUser.redeemKey(store, key)`

## Decisions Made

- Confirmed via direct source read that `SteamUser.redeemKey`'s actual signature matches the plan's specified IPC payload type verbatim (`store: 'steam'`, `key: string`) — no adaptation needed at the handler boundary

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `grep -q "redeemSteamKey" src/common/types/ipc.ts` — PASS
- `grep -q "makeHandlerInvoker('redeemSteamKey')" src/preload/api/steam.ts` — PASS
- `grep -q "addHandler('redeemSteamKey'" src/backend/main.ts` — PASS
- `grep -q "SteamUser.redeemKey" src/backend/main.ts` — PASS
- `npx tsc --noEmit -p .` — no new errors in the three edited files (WIRING_OK)
- `npx eslint src/common/types/ipc.ts src/preload/api/steam.ts src/backend/main.ts` — 0 errors, 67 pre-existing warnings (none introduced by this change)
- No new `recomputeOwnership`/`refreshLibrary` call added to `main.ts` for redeem — confirmed by reading the diff (only the `addHandler('redeemSteamKey', ...)` block was inserted)

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `redeemSteamKey` is now invokable from the renderer via the preload bridge, fully typed end-to-end, and registered as a backend handler delegating to 26-01's `SteamUser.redeemKey` wrapper.
- 26-04 (the `RedeemSteamKeyDialog` frontend) can now call `window.api.redeemSteamKey({ store: 'steam', key })` and expect a classified `RedeemKeyResult` back, then call the existing `refreshLibrary({ library: 'steam' })` on a success outcome.
- No blockers.

---
*Phase: 26-steam-key-redemption*
*Completed: 2026-07-20*

## Self-Check: PASSED

- FOUND: src/common/types/ipc.ts
- FOUND: src/preload/api/steam.ts
- FOUND: src/backend/main.ts
- FOUND: commit 21ae7d23
