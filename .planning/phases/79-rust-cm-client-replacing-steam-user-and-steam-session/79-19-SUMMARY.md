---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 19
subsystem: steam-cm
tags: [rust, steamcm, bootstrap, anonymous-client]
requires: [79-03, 79-17, 79-18]
provides:
  - engine-selected anonymous client (cm=rust -> RustAnonClient)
  - boot step steamcm-configure
  - engine-selected boot owed-goonline restore
affects: [src/backend/sidecar/bootstrap.ts, src/backend/storeManagers/steam/anonymousClient.ts]
key-files:
  modified:
    - src/backend/storeManagers/steam/anonymousClient.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/__tests__/shellFilesFlows.test.ts
    - src/backend/sidecar/__tests__/appShellFlows.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
  created:
    - src/backend/storeManagers/steam/__tests__/anonymousClient.rustEngine.test.ts
    - src/backend/sidecar/__tests__/bootstrap.steamcm.test.ts
decisions:
  - "steamcm-configure is placed after rpc-server (live transport) and before mac-steam-online-restore; frames are ordered so configure precedes any handler-driven acquire"
  - "requestRustInvoke is optional on AnonymousClientDeps so existing ts-engine tests are unchanged"
metrics:
  tasks: 2
  completed: 2026-11-15
---

# Phase 79 Plan 19: Anonymous client and boot steps on the Rust engine Summary

With `GAMELIB_STEAMCM_CM=rust`, the anonymous client is the Rust anon actor, and boot calls `steamcm_configure` and the Rust owed-goonline restore.

## What changed

- `createAnonymousClient` wraps the unchanged ts client. At call time `steamCmImpl()==='rust'` (with a `requestRustInvoke` dep) makes `get` return a memoised `RustAnonClient` (no steam-user client is built), `close(cause)` fire `steamcm_anon_close {reason}` (rejection logged), and `releaseForShutdown` issue no IPC (it still releases the ts client). No timers are armed on the rust path.
- bootstrap: new step `steamcm-configure` (in `BOOT_STEP_NAMES`, after `protocol-url-handler`, before `mac-steam-online-restore`) calling exported `configureSteamCm`. `mac-steam-online-restore` now goes through exported `restoreOwedMacSteamOnlineAtBoot`: rust -> `steamcm_wrap_restore_if_owed {trigger:'boot'}`, ts -> `restoreMacSteamOnlineIfOwed('boot')`. Both are fire-and-forget with rejections logged and swallowed; no timers. The anonymous-client boot construction passes `requestRustInvoke`.

## Deviations from Plan

**[Rule 1 - Regression] Boot-time configure call broke call-count tests.** `appShellFlows` and `shellFilesFlows` assert `mockRequestRustInvoke` was not called after boot; they now `mockClear()` after boot. `testContainment` needed the new test file classified. The helpers wrap the invoke in `Promise.resolve(...)` since several harness mocks return `undefined`.

The plan placed configure "before anything can acquire a session"; it sits after rpc-server because `requestRustInvoke` needs the live transport. It still precedes any handler-driven acquire.

## Verification

jest `src/backend/sidecar` and `src/backend/storeManagers/steam` pass except the pre-existing failures (shimCoverage, shimGenerate, libraryReplay). tsc and prettier are clean on the touched files.

Commit: f7f19ac5f

## Self-Check: PASSED
