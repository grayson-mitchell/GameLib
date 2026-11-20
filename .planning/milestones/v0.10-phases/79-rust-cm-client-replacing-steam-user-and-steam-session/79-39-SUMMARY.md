---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 39
subsystem: steam-cm
tags: [steam-user-deletion, rust-cm, sidecar-exit-contract, cf-01, d-18]
requires:
  - phase: 79-38
    provides: "79-PARITY.md Status: DELETE GATE MET"
provides:
  - "Rust-only SteamUser and anonymous client (no steam-user import in user.ts, userTypes.ts, anonymousClient.ts)"
  - "stdinEofRelease without CM handles"
  - "cmLogonId and steamConfigStore.cmLogonId removed"
affects: [79-40, 79-41]
tech-stack:
  patterns: ["shell EOF/exit hooks own CM teardown", "tests use a plain-function rustInvoke fake (resetMocks strips jest.fn impls)"]
key-files:
  deleted:
    - src/backend/storeManagers/steam/steamUserLogonAbort.ts
    - src/backend/storeManagers/steam/cm/cmLogonId.ts
    - src/backend/storeManagers/steam/cm/__tests__/cmLogonId.test.ts
    - src/backend/storeManagers/steam/__tests__/steamUserLogonAbort.test.ts
    - src/backend/storeManagers/steam/__tests__/authSessionLifecycle.test.ts
    - src/backend/storeManagers/steam/__tests__/anonymousClient.test.ts
  modified:
    - src/backend/storeManagers/steam/user.ts
    - src/backend/storeManagers/steam/userTypes.ts
    - src/backend/storeManagers/steam/anonymousClient.ts
    - src/backend/sidecar/stdinEofRelease.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/testUtils/testSteamUser.ts
    - src/common/types/typed_store.ts
key-decisions:
  - "SteamUserDeps lost macSteamOffline and clock (the wrap and idle timer lived only in the deleted engine); the Rust wrap host owns the go-offline wrap"
  - "AnonymousClientDeps is now just requestRustInvoke; releaseForShutdown is a no-op kept for the quit handler"
  - "Flags module (steamCmFlags.ts) and the jest.setupContainment pin are untouched: other code still reads them until 79-40/41"
duration: single session
completed: 2026-11-15
---

# Phase 79 Plan 39: Delete the steam-user engine from the session, anonymous client and EOF release

SteamUser, the anonymous client and the EOF release are Rust-only; the steam-user connect path, raw client factory, abort helper, idle timer, canary and per-install logonID are gone (CF-01, D-03, D-04, D-18).

## Commits
- `12ac3c547` refactor(79-39): code, tests and ceiling baselines (Tasks 1 and 2 in one commit, since the test conversions span both)

## What was deleted
- user.ts: steam-user import, `client`, `connectSteamUserClient`, `wrappedConnect`/`wrappedConnectNow`, `wrapTail`, `abandonPendingLogon`, `endSession`, idle timer and lease count, canary, `engine()` branches, `ensureAuthenticatedSession`, `getOrCreateCmLogonId`. Kept: token policy via rustSession, guided push, verdicts, logout cleanup, `guidedInstallTargets`, generation fence.
- userTypes.ts: `CANARY_*`, `AUTH_SESSION_IDLE_GRACE_MS`, `AUTH_LOGON_BOUND_MS`.
- anonymousClient.ts: `createRawAnonymousClient`, the ts client, `RawClient`, timers, `ANON_*` constants.
- steamUserLogonAbort.ts, cm/cmLogonId.ts, `steamConfigStore.cmLogonId`.
- stdinEofRelease.ts: anonymousClient and steamUser releases and dep types; log line is now "stdin closed: stopping nettop monitors and aborting in-flight downloads".
- bootstrap.ts: factory wiring, ts branch of `restoreOwedMacSteamOnlineAtBoot` (now only `steamcm_wrap_restore_if_owed`, chained on configure).
- Test files deleted: steamUserLogonAbort.test.ts, authSessionLifecycle.test.ts (ts lifecycle only), anonymousClient.test.ts (ts client; `isPublicOnlyEntry` test moved into anonymousClient.rustEngine.test.ts), cmLogonId.test.ts. Also removed from user.test.ts: the connectSteamUserClient timeout, QR race, logout-with-client and all ensureConnected ts describes; from user.rustEngine.test.ts the ts-engine logonID test; from credentialsMissing.test.ts the ts canary test (a Rust canary test replaces it); from bootstrap.test.ts the ts boot-restore test (bootstrap.steamcm.test.ts covers it).

## Deviations from Plan

**1. [Rule 1 - Bug] logout reset the auth-trigger latch after its first await.** The Rust-engine logout awaited `steamcm_session_logout`/`anon_close` before `resetSteamAuthTrigger()`, contradicting the "synchronous, before the first await" comment (a refresh racing a slow logout could consume a stale grant). Moved all synchronous resets (rust.reset, guided targets, anon close, sign-in state, trigger) ahead of the awaits. Caught by user.test "resets the auth trigger before the first await".

**2. [Rule 3] Test conversions beyond the plan list.** appShellFlows/shellFilesFlows now `await flush()` before `mockClear()` because the boot restore is a Rust invoke that lands after configure; the "54-13 quit pays owed goonline" test now asserts the sidecar issues no restore (the shell exit hook owns it); steamAuthSessionPolicy rules A/B/H/K now assert steam-user logon/construction/log-oracle are absent; steamStartupKeyringDeferral SC1 asserts via `steamcm_session_acquire`. Ceiling baselines for deleted/emptied suites removed (meta/backendDiCeilings).

**3. `SteamUserDeps` dropped `macSteamOffline` and `clock`** (not in the plan list) since nothing uses them now; bootstrap and test fakes updated.

## Verification
- `pnpm codecheck`, `pnpm prettier`, `pnpm lint` (0 errors), `pnpm boundaries`, `pnpm steam-line-ceiling`: pass.
- `pnpm smoke:sidecar`: PASS (exits 0 on stdin EOF). `pnpm smoke:exit-check` only has a live mode (attaches to a running app and waits for Cmd+Q); it reported INVALID "shell never exited within 30 s" because no one quit the operator's running app. It did not launch or kill anything. Needs a manual run.
- Jest `src/backend src/common`: 13505 pass. Failures: tauriShellSource, epicOfflineMode, shimCoverage, shimGenerate (known pre-existing), plus flowRegistrationCensus and ipcDomainCensus, which fail only because of another session's uncommitted quick task 261115-tk8 (removed link channels in appShell/shellFiles ipc files and registrations in the working tree). Baseline jest on a `git archive HEAD` export passed all the other sidecar/steam suites I touched.
- Gates failing only on the operator's dirty GamePage files: `pnpm i18n --fail-on-update`, `pnpm find-deadcode` (SteamUpdateInfo.scss), `pnpm backend-di-ceilings` (GameStatus.* tests), `pnpm gameinfo-narrowing-ceiling` (GamePage/index.tsx). None reference files in this plan.

## Isolation note
appShellFlows.test.ts and shellFilesFlows.test.ts carried the other session's uncommitted hunks in the working tree; only this plan's hunks were committed (built from HEAD via hash-object and update-index). The working-tree copies still hold both sets of edits.

## Known Stubs
None.

## Self-Check: PASSED
Commit 12ac3c547 present; deleted files absent; steamUserLogonAbort.ts, cmLogonId.ts gone; no `from 'steam-user'` in user.ts, userTypes.ts, anonymousClient.ts.
