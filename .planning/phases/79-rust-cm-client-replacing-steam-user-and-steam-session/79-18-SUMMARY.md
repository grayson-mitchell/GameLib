---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 18
subsystem: steam-cm
tags: [steam, rust-cm, session, typescript]
requires: [79-17, 79-03]
provides:
  - "SteamUser Rust engine behind GAMELIB_STEAMCM_CM (steamCmImpl read per call)"
  - "async acquireOpenAuthenticated and its four awaiting callers"
  - "steam-user logOn carries the persisted logonID (D-18)"
affects: [79-19, 79-25]
key-files:
  modified:
    - src/backend/storeManagers/steam/user.ts
    - src/backend/storeManagers/steam/userTypes.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/testUtils/testSteamUser.ts
    - src/backend/storeManagers/steam/cm/SteamCmClient.ts
    - src/backend/storeManagers/steam/installLocation.ts
    - src/backend/storeManagers/steam/depot/sharedRedist.ts
    - src/backend/storeManagers/steam/bridge/launchTarget.ts
    - src/backend/storeManagers/steam/library/refresh.ts
  created:
    - src/backend/storeManagers/steam/__tests__/user.rustEngine.test.ts
decisions:
  - "SteamUserDeps gains a required rustInvoke: RustInvokeDeps (bootstrap and createTestSteamUser supply it); no unbound state."
  - "Under rust, ensureConnected = status -> ensure_connected canary; if not connected it acquires through the policy path and releases at once."
  - "services/types.ts needed no edit: SteamUserSlice is a Pick of SteamUser, so the async signature flows through."
metrics:
  tasks: 2
  completed: 2026-11-15
---

# Phase 79 Plan 18: SteamUser on the Rust session Summary

SteamUser now runs on either engine: with `GAMELIB_STEAMCM_CM=rust` it acquires, releases, ensures and logs out through the `steamcm_session_*` channels, keeping TS policy (token read, credentialsMissing latch, guided go-offline push, CREDENTIAL_REFUSAL_ERESULTS verdict, sign-in epochs) unchanged; with `ts` it is today's behaviour plus a persisted `logonID` on `logOn`.

## Commits

- 657f2107e feat(79-18): Rust engine inside SteamUser and logonID for the TS engine
- 58021ff5d feat(79-18): await acquireOpenAuthenticated at its four call sites

(The first commit leaves tsc red for the four call sites and their test doubles until the second lands, because the signature change lives in user.ts.)

## Behaviour

- Rust acquire passes the stored token unchanged with `logonId: 0`, then `steamcm_licenses`, and returns a `RustCmClient`. Leases are tracked in a Map so `getClient()` stays synchronous. A sign-out or shutdown while the acquire is in flight releases the lease and refuses.
- Refusal `logon-rejected` caches `{message: kind, eresult}` for `getLogonFailure()`; only credential eresults (5, 15, 26, 27, 63) latch; 34 latches nothing.
- `logout()` clears the TS lease map and invokes `steamcm_session_logout` and `steamcm_anon_close {reason:'logout'}`, then the existing cleanup.
- `releaseForShutdown()` issues no IPC (the shell's EOF/exit hook owns it) and resolves `not-owed`.
- The token is never logged (logger-spy test).

## Deviations from Plan

1. **[Rule 3] SteamUserDeps.rustInvoke.** The class had no route to the transport; added a required dep, wired in `bootstrap.ts` and `testSteamUser.ts` (files not in the plan's list).
2. **[Rule 3] Existing tests updated** for the async open-acquire (`mockResolvedValue`, `await`) and for `logonID: expect.any(Number)` in logOn assertions (user.test.ts, authSessionLifecycle.test.ts, and the library/installLocation/launchTarget/sharedRedist/depotLeaseMocks doubles).
3. **[Rule 1] SteamCmClient.ts (79-17):** the module-scope `void _check` tripped sidecarRejectionGuard "no module-scope floating promise" once user.ts pulled the file into the sidecar graph. Replaced with a type-only `AssertTrue` alias (same compile-time check, no runtime statement).

## Handoff to 79-19

79-16's shell does not call `pay_owed(Boot)`. Nothing in this plan calls `steamcm_configure` or `steamcm_wrap_restore_if_owed {trigger:"boot"}`; whichever plan owns configure/boot ordering must call the latter after configure. On macOS the Rust session refuses configure with `steamcm:wrap-host-missing` if no wrap host is set (the shell installs it at setup).

## Verification

`pnpm tsc --noEmit` clean; `jest src/backend` 575 suites pass. Remaining failures are the known pre-existing suites only (epicOfflineMode, shimCoverage, shimGenerate, libraryReplay, tauriShellSource). prettier check clean on touched files. No live sign-in or redeem run.

## Known Stubs

None.

## Self-Check: PASSED
