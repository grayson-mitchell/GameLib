---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
plan: 17
subsystem: steam-polling
status: complete
tags: [steam, restart-hold-removal, library-refresh, poll-status, wire-narrowing]
requires: [81-16]
provides:
  - library refresh (refresh, refreshInstallState, Rust-backed refresh) building the installed map straight from the ACF scan
  - steampoll_status answering {installs: [{appId, delegatedToSteamClient, awaitingUpdate}], uninstalls} on both sides of the wire
affects: [81-18, 81-19, 81-20]
tech-stack:
  added: []
  patterns: [exact-JSON wire-shape assertion as the removal guard]
key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/pollRust/rustSteamPoll.ts
    - src/backend/storeManagers/steam/library/refresh.ts
    - src/backend/storeManagers/steam/library/rustRefresh.ts
    - src/backend/storeManagers/steam/__tests__/library.refresh.test.ts
    - src/backend/storeManagers/steam/__tests__/pollsRustBranch.status.test.ts
    - src-tauri/crates/gamelib-steampoll/src/install_loop.rs
    - src-tauri/crates/gamelib-steampoll/tests/install_loop.rs
    - src/backend/storeManagers/steam/pollRust/steamPollTypes.ts
    - src/backend/testUtils/steamPollStatusFake.ts
    - src/backend/storeManagers/steam/__tests__/updateNative.test.ts
    - src/backend/storeManagers/steam/__tests__/pollsRustBranch.install.test.ts
    - src/backend/storeManagers/steam/localFiles/__tests__/fixtures/mockedFsSteamFiles.ts
    - src/backend/sidecar/__tests__/helpers/sidecarHarness.ts
decisions:
  - "refreshInstallState keeps its one steampoll_status read (activeInstallPolls still needs status.installs); only the hold filter on the scanned map went. rustRefresh's status read existed only inside the filter, so it is gone with it"
  - "No Rust parity fixture or zod result schema carried the status shape: PollStatus is a TS interface only, and the wire shape is pinned by a Rust test that serialises status() and compares the exact JSON"
metrics:
  tasks: 2
  files: 13
  completed: 2026-11-18
commits: 2
plan_head_before: c688ad7ed8e63188d750b6c1b630aad54ad9bae5
plan_head_after: f1e9d560ac223f7d13a1c3374d473dca9feae50f
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
---

# Phase 81 Plan 17: refresh without a hold filter, poll status without holding Summary

A refresh or a window focus now builds the installed map straight from the ACF scan, so an ACF-installed game reads Installed (D-01 badge), and `steampoll_status` answers exactly `{installs, uninstalls}` with three fields per install in Rust and TypeScript.

## Commits

- cc16a156a: feat(81-17) the library refresh reports ACF-installed games without a hold filter (tracer)
- f1e9d560a: refactor(81-17) the poll status carries no holding or steamHold, on both sides

## What was built

- **Task 1 (tracer).** `withoutSteamRestartHolds` is deleted from rustSteamPoll.ts along with its now-unused `RUST_STEAMPOLL_STATUS` and `PollStatus` imports. `refresh.ts` (`refreshInstallState`) assigns `installedMap = await buildInstalledMap(deps)` directly; its single status read stays because `activeInstallPolls` still uses `status.installs`. `rustRefresh.ts` `readInstallState` uses `buildInstalledMap` directly. The D-UAT-13 "holding game is not flipped" case in library.refresh.test.ts became a D-11 case: an ACF-installed game (StateFlags 4) flips to installed on the one focus reconcile. RED was shown first by keeping the old `holding: ['570']` in the fake (the case failed), then the fake's `holding` plumbing and the status override were removed. The `withoutSteamRestartHolds` status-reader case in pollsRustBranch.status.test.ts went with the function.
- **Task 2.** Rust: `InstallStatus.steam_hold`, `PollStatus.holding`, `STEAM_HOLD_WIRE` and `holding_app_ids` are deleted (`hold_name` was already gone from the crate). New test `status_wire_shape_carries_no_hold_for_any_install` serialises `status()` and asserts the exact JSON (RED against the old shape, then green); the `steamHold` assertion in the pvk4 case was dropped. TS: `PollStatus` lost `steamHold` and `holding`; `steamPollStatusFake`, the updateNative.test.ts status fake, `mockedFsSteamFiles`, pollsRustBranch.install.test.ts and sidecarHarness.ts answer the narrowed shape.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extra status fakes outside the plan's file list**
- **Found during:** Task 2
- **Issue:** `mockedFsSteamFiles.ts`, `pollsRustBranch.install.test.ts` and `sidecarHarness.ts` also answered `holding: []`; left as is they would no longer match the narrowed `PollStatus` shape (the harness one is untyped, but a stale fake hides a regression).
- **Fix:** narrowed all three to `{installs, uninstalls}`.
- **Files modified:** the three files above (all prettier-clean, none ignored)
- **Commit:** f1e9d560a

**2. [Scope] pollsRustBranch.status.test.ts edited in Task 1, not Task 2**
- It imported `withoutSteamRestartHolds`, so Task 1's `pnpm codecheck` could not pass without editing it there. Its "narrowed shape" content is fully covered because the only status-shaped data it held was the deleted `status` const.

## Out-of-scope observations

- `src/backend/sidecar/__tests__/outboundHttpRegistry.test.ts` failed once inside the wide jest run (`WebSocket upgrade` case takes 350 ms and is timing-sensitive under load) and passes alone (9/9). Not related to this plan; not in the logged list, not changed.
- Still red and unchanged, as logged in deferred-items.md: `pnpm backend-di-ceilings` (launchWithoutSteam.test.ts, NativePortInfo.test.tsx, LaunchWithoutSteam.test.tsx, NoticeStack.test.tsx), `pnpm find-deadcode` (NativePortDataStyle, NativePortMac), `acfUpdateReplay.test.ts`, `storeKinds.test.ts`. No new finding from this plan in any of them.

## Verification

- `cargo test -p gamelib-steampoll` (whole crate), `cargo test -p gamelib-steampoll-cli`, `cargo test --bin gamelib-shell steampoll`: all ok. `cargo clippy -p gamelib-steampoll --all-targets -- -D warnings` and `cargo fmt -p gamelib-steampoll --check`: clean.
- `pnpm check:ipc-contract`: up to date. `pnpm codecheck`: clean.
- `pnpm exec jest src/backend/storeManagers/steam src/backend/sidecar src/backend/__tests__ src/common src/frontend/screens/Game`: 10923 passed; the only failures are acfUpdateReplay, storeKinds (logged) and the flaky outboundHttpRegistry case above.
- Acceptance greps: no `withoutSteamRestartHolds` in `src`; `holding` count 0 in steamPollTypes.ts; `holding_app_ids|steam_hold` count 0 in install_loop.rs; `steamHold` count 0 in updateNative.test.ts and steamPollStatusFake.ts.

## Known Stubs

None.

## Threat Flags

None. T-81-39 (refresh reports an unadopted game installed) is the accepted, intended D-01 behaviour.

## Self-Check: PASSED

- FOUND: cc16a156a, f1e9d560a (both ancestors of HEAD)
- `git rev-list --count c688ad7ed..HEAD` = 2, matching `commits: 2`
