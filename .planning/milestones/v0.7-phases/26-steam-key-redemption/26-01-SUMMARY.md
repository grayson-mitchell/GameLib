---
phase: 26-steam-key-redemption
plan: 01
subsystem: api
tags: [steam-user, steam, ipc-backend, jest, typescript]

# Dependency graph
requires:
  - phase: 21-steam-native-install
    provides: SteamUser class with ensureConnected()/getClient()/isLoggedIn() authenticated CM session seams
provides:
  - "SteamUser.redeemKey(store, key) static backend wrapper around client.redeemKey()"
  - "classifyPurchaseResult private classifier mapping all 8 EPurchaseResult values into the 4 SPEC REQ5 buckets"
  - "RedeemKeyResult/RedeemKeyOutcome discriminated types (store-aware-ready, common/types/steam.ts)"
affects: [26-02, 26-03, 26-04, 26-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "redeemKey() REJECTS (throws) on every non-OK EPurchaseResult — always wrap in try/catch and read purchaseResultDetails/packageList off the caught Error, never trust the misleading .d.ts resolve-only signature"
    - "Reference SteamUserLib.EPurchaseResult (8-value enum) exclusively — never the differently-numbered, colliding EPurchaseResultDetail enum"
    - "Status-only logging discipline (store/outcome/purchaseResultDetails) mirrors humble/library.ts's doRevealKey — raw secret values never interpolated into log calls"

key-files:
  created: []
  modified:
    - src/common/types/steam.ts
    - src/backend/storeManagers/steam/user.ts
    - src/backend/storeManagers/steam/__tests__/user.test.ts

key-decisions:
  - "classifyPurchaseResult's `details` parameter typed as SteamUserLib.EPurchaseResult (not a plain number) to satisfy @typescript-eslint/no-unsafe-enum-comparison against the enum-typed case labels — zero behavior change, pure type-safety fix"
  - "redeemKey tests isolate the classification logic from the connection-establishment flow via jest.spyOn(SteamUser, 'ensureConnected'/'getClient') rather than replaying the full QR/credential auth sequence already covered by other describe blocks in this file"

patterns-established:
  - "Table-driven test.each over all EPurchaseResult reject values, asserting store+outcome per case"

requirements-completed: [REQ-26-02, REQ-26-04, REQ-26-05, REQ-26-06]

# Metrics
duration: 15min
completed: 2026-07-20
---

# Phase 26 Plan 01: Backend Redeem Primitive Summary

**`SteamUser.redeemKey(store, key)` wraps `client.redeemKey()`'s reject-on-failure contract and classifies all 8 `EPurchaseResult` values into the 4 SPEC outcome buckets, with a discriminated `RedeemKeyResult` type and 12 new table-driven backend tests.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-20T02:39:00Z (approx, per STATE.md session start)
- **Completed:** 2026-07-20T02:46:20+00:00 (last commit, local +12:00 offset)
- **Tasks:** 2 completed
- **Files modified:** 3

## Accomplishments
- `RedeemKeyResult`/`RedeemKeyOutcome` discriminated types added to `common/types/steam.ts`, with `store: 'steam'` as the hidden store-aware-ready field (REQ-26-06/D-05)
- `SteamUser.redeemKey(store, key)` correctly handles `client.redeemKey()`'s real contract — resolves only on `EPurchaseResult.OK`, rejects (throws) on every other outcome carrying `purchaseResultDetails`/`packageList` on the Error — never surfacing a non-success outcome as an unhandled error
- `classifyPurchaseResult` maps all 8 `EPurchaseResult` values (`OK`, `AlreadyOwned`, `RegionLockedKey`, `InvalidKey`, `DuplicatedKey`, `BaseGameRequired`, `OnCooldown`, `Unknown`) into exactly the 4 SPEC buckets, referencing the namespaced `SteamUserLib.EPurchaseResult` enum only
- The raw key value is never logged anywhere in the redeem path — verified by both a grep-based acceptance check and a dedicated `never logs the raw key value` unit test
- 12 new table-driven tests cover the OK/success path, all 7 reject buckets, an `Unknown`-fallback (no `purchaseResultDetails` on the caught Error), a not-connected (`ensureConnected` false) case, a null-client case, and the log-redaction invariant — whole file (61/61) green

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared RedeemKey types + backend redeemKey wrapper + EPurchaseResult classifier** - `bc33e9f6` (feat)
2. **Task 2: Table-driven backend tests for redeemKey (all 8 EPurchaseResult values + reject shape + no-key-log)** - `9ef89542` (test)

**Plan metadata:** (this commit, follows below)

## Files Created/Modified
- `src/common/types/steam.ts` - Added `RedeemKeyOutcome` union and `RedeemKeyResult` interface (store-aware-ready)
- `src/backend/storeManagers/steam/user.ts` - Added `SteamUser.redeemKey()` static method and `classifyPurchaseResult` private classifier
- `src/backend/storeManagers/steam/__tests__/user.test.ts` - Added `redeemKey: jest.fn()` + `EPurchaseResult` mock namespace to the `steam-user` mock scaffold, plus a `describe('redeemKey()', ...)` block with 12 tests

## Decisions Made
- Typed `classifyPurchaseResult`'s `details` parameter as `SteamUserLib.EPurchaseResult` rather than `number` — required for a clean lint pass against the enum-typed case labels in the switch statement, no behavior change
- Used `jest.spyOn(SteamUser, 'ensureConnected'/'getClient')` (restored in `afterEach`) to isolate `redeemKey()`'s classification logic from the connection-establishment flow, rather than replaying the full QR/credential auth sequence that other describe blocks in this file already cover in depth

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `@typescript-eslint/no-unsafe-enum-comparison` lint errors in the classifier**
- **Found during:** Task 1 (post-implementation lint check, before committing)
- **Issue:** `classifyPurchaseResult`'s `details` parameter was typed `number`; switching a plain `number` against `SteamUserLib.EPurchaseResult`-typed case labels tripped `@typescript-eslint/no-unsafe-enum-comparison` as 8 lint errors (one per case label)
- **Fix:** Retyped `details: number` → `details: SteamUserLib.EPurchaseResult`; no logic change, both call sites (resolve branch destructure, catch branch `?? SteamUserLib.EPurchaseResult.Unknown` fallback) already produced values assignable to this type
- **Files modified:** `src/backend/storeManagers/steam/user.ts`
- **Verification:** `npx eslint` went from 8 errors/31 warnings to 0 errors/31 warnings on the file; `npx tsc --noEmit` remained clean; all 61 tests still pass
- **Committed in:** `9ef89542` (bundled with Task 2's test commit, since it was caught during the Task 1→Task 2 transition's pre-commit lint pass)

---

**Total deviations:** 1 auto-fixed (Rule 1 - lint error, zero behavior change)
**Impact on plan:** No scope creep — pure type-correctness fix required to keep the codebase's lint gate green. All plan acceptance criteria (grep checks, tsc, jest) still pass exactly as specified.

## Issues Encountered
None beyond the auto-fixed lint issue above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The `SteamUser.redeemKey(store, key)` contract and `RedeemKeyResult`/`RedeemKeyOutcome` types are now the stable IPC contract source for 26-03 (IPC bridge wiring: preload `redeemSteamKey` export, `main.ts` `addHandler`, `common/types/ipc.ts` `AsyncIPCFunctions` entry) and 26-04 (frontend `RedeemSteamKeyDialog`)
- No blockers. `npx jest src/backend/storeManagers/steam/__tests__/user.test.ts` is green (61/61); `npx tsc --noEmit` reports no new errors from the edited files
- Note: the test file emits a pre-existing "Jest did not exit one second after the test run" warning (traced to the `connectSteamUserClient() — timeout guard` block's real 15s `setTimeout`, not introduced by this plan) — exit code is 0, out of this plan's scope per the deviation rules' scope boundary

---
*Phase: 26-steam-key-redemption*
*Completed: 2026-07-20*

## Self-Check: PASSED

- FOUND: src/common/types/steam.ts
- FOUND: src/backend/storeManagers/steam/user.ts
- FOUND: src/backend/storeManagers/steam/__tests__/user.test.ts
- FOUND: commit bc33e9f6 (Task 1)
- FOUND: commit 9ef89542 (Task 2)
