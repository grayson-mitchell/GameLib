---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 26
subsystem: steam-cm
tags: [uat, live, sign-in, flag-flip, depot]
requires: [79-25]
provides: [UAT part A results, signin default rust]
affects: [79-37, 79-38, 79-41]
key-files:
  modified:
    - .planning/phases/79-rust-cm-client-replacing-steam-user-and-steam-session/79-UAT.md
    - src/backend/storeManagers/steam/cm/steamCmFlags.ts
    - src/backend/storeManagers/steam/cm/__tests__/steamCmFlags.test.ts
    - src-tauri/crates/gamelib-steamcm/src/lib.rs
    - src/backend/storeManagers/steam/userSignIn.ts
    - src/backend/storeManagers/steam/__tests__/userSignIn.rustEngine.test.ts
    - src/frontend/screens/Login/components/SteamLogin/index.tsx
    - src-tauri/crates/gamelib-depot/src/fetch.rs
    - src-tauri/crates/gamelib-depot/tests/fetch.rs
  created:
    - src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginGuardRetry.test.ts
decisions:
  - "Operator approved UAT part A on 2026-11-15; STEAMCM_SIGNIN_DEFAULT flipped to rust (items 5-7 pass)"
  - "Item 3 fixed in scope (operator choice): depot transient chunk errors retry within a 300 s budget instead of 8 quick attempts"
  - "Sign-in name proof is the stored userData.username, not the Accounts tile: the tile hides the name by operator design (privacy)"
  - "Item 6 typed-correct-code sub-case is untestable on the operator account (mobile app offers approval only); covered by unit test"
metrics:
  tasks: 2
  completed: 2026-11-15
requirements: [D-02, D-05, D-06, D-07, D-08, D-11, D-18]
---

# Phase 79 Plan 26: UAT part A live run and sign-in flip Summary

UAT part A ran live on macOS on the Rust path. Items 1-7, 9 and 11 pass. Item 8 is skipped because no key was available. The operator approved, and the sign-in default is now rust.

## Results

| Item | Result | Proof (short) |
|------|--------|---------------|
| 1 existing user survives | pass | `CM logon mode=authenticated reason=user-refresh`, 401 before and after |
| 2 Rust-fed install (DREDGE) | pass | `steamcm_depot_key`, `steamcm_content_servers`, `status=completed`, ACF present |
| 3 network drop mid-install | pass after fix | ~107 s offline; `CM session rebuilt in 7758ms` with leases=4; install completed |
| 4 sleep/wake | pass | `CM sleep gap 56s detected` -> probe -> `CM session rebuilt in 11365ms`; install completed |
| 5 QR sign-in | pass after 2 fixes | rotation redraw seen; `Steam auth complete (rust sign-in)`; real persona stored |
| 6 credentials + guard | pass | guardRequired -> mobile approval -> done |
| 7 wrong code then success | pass after fix | `EResult=88` "invalid code", then the same flow completed |
| 8 redeem | skipped | no unredeemed key |
| 9 quit with idle lease | pass | no orphan; `steamcm shutdown (exit): NotOwed` |
| 11 cm=ts + held Rust session | pass | TS Refresh 390 games; held Rust session answered licences; 0 eresult 34 |

## Defects found live and fixed

1. **20cdb6de1: the crate rejected no-arg ops.** The app sends `[]` (`z.tuple([])`) for qr_start, logout, ensure_connected and session_status, but the crate required exactly one `{}`. QR sign-in spun forever and the Rust logout failed. Unit test: `no_arg_ops_accept_the_empty_tuple_the_app_sends`.
2. **b7c9931d5: overlapping sign-in polls failed a successful sign-in.** Once one poll read `done`, Rust dropped the flow. The next poll then read `unknownFlow`, errored, and the window started a new flow, leaving an orphan behind. Now an overlapping poll reports `finalizing` and waits on the memoised finalize.
3. **37c2a1d5c: the phone-approval poll stopped after a rejected code.** The guard form cleared the out-of-band poll on submit and did not resume it, so a phone approval after a wrong code hung. This was shared with the ts engine.
4. **38cc15c8a: the depot download failed on outages longer than about 30-60 s.** Each chunk had 8 quick attempts. Transient errors (connect, timeout, reset) now retry until 300 s have passed since max(first failure, last success anywhere), with backoff capped at 8 s. During an outage, hosts are not demoted. HTTP failures and cancel keep their old policy.
5. **UAT proof strings corrected** (0047a601f). Sign-in calls `requestRustInvoke` directly, so no `[steamcm] rust steamcm_signin_*` lines exist. The shutdown line is `[shell] steamcm shutdown (<context>): <outcome>`.

## Task 2

Commit 8aad6e747 sets `STEAMCM_SIGNIN_DEFAULT: SteamCmImpl = 'rust'` with the comment "flipped by plan 79-26 after UAT-A sign-in items passed", and updates the tests. Jest `steam/cm` passes 35/35 and prettier is clean. Across `storeManagers/steam` and Login, the only failures are the pre-existing shimCoverage, shimGenerate and libraryReplay failures, which also fail at 22427c0cd.

## Observations (not fixed here)

- **Sidecar orphaned by a dev-watcher restart.** When the crate was edited during the run, `tauri dev` rebuilt and restarted the shell, and the previous sidecar was left with PPID 1. It was killed. This recurs the defect in todo `2026-11-09-sidecar-orphaned-after-tauri-dev-ctrl-c.md` (now in completed/) through a new trigger, the watcher restart.
- **Heartbeat noise after sleep.** The anonymous CM connection logs `Failed to send heartbeat message` until its idle close, because only the authenticated session is probed on sleep. It is harmless.
- **Resume is file-level only.** After a failed install, `reconcile_partial_state` keeps only whole files whose sha1 matches, so an install that fails mid-file restarts that file. There is no chunk-level resume.
- **The TS reference path is degraded.** TS `fetchLicensedDemos` timed out in item 11, consistent with 79-33's finding that the TS reference is broken.
- **No acquire log line.** The lease acquire is not routed through the `[steamcm] rust` logger, so item 1's proof uses the shell `CM logon` line instead.

## Self-Check: PASSED
