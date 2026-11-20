---
phase: quick-261116-vt7
plan: 01
subsystem: steam-auth
tags: [steam, rust, ipc, dead-code, i18n]
requires: []
provides:
  - "Dead guided Go Offline dialog chain removed end to end (Rust refusal through i18n)"
affects: [steam-auth, ipc-contract]
key-files:
  created: []
  modified:
    - src-tauri/crates/gamelib-steamcm/src/session.rs
    - src-tauri/crates/gamelib-steamcm/src/facade.rs
    - src-tauri/src/ipc_contract.rs
    - src/backend/storeManagers/steam/userTypes.ts
    - src/backend/storeManagers/steam/user.ts
    - src/backend/storeManagers/steam/macSteamClient.ts
    - src/backend/sidecar/steamAuthFlowRegistration.ts
  deleted:
    - src/frontend/screens/Game/GamePage/components/SteamGoOfflineNotice.tsx
    - src/frontend/state/SteamGoOfflineNotice.ts
    - src/frontend/state/__tests__/SteamGoOfflineNotice.test.ts
    - src/backend/storeManagers/steam/__tests__/macSteamClient.test.ts
decisions:
  - "Locked user decision 2026-11-16: DELETE the chain including Rust Refusal::GoOfflineRequired; keep LogonWrap/RestoreOnlyWrap"
  - "LogonErr collapsed to CmError (single variant left)"
  - "guidedAction/installPath/forceWindowsViaBottle removed from AcquireAuthenticatedOpts (only fed the deleted push)"
  - "macSteamClient no longer takes platform/config; steamProcesses destructure trimmed"
  - "Census total lowered by the delta (297 -> 294), keeping the pre-existing gap of 6 visible"
metrics:
  tasks: 3
  commits: 3
  completed: 2026-11-16
audit_acknowledged:
  milestone: v0.10
  at: 2026-11-20
  status: unknown
---

# Quick 261116-vt7: Remove the dead guided Go Offline dialog chain

Deleted the unreachable guided Go Offline chain in one change: Rust `Refusal::GoOfflineRequired`/`WrapRefused`/`LogonErr`, the TS `go-offline-required` lease reason and its branches, the `steamGoOfflineRequired` push, the `SteamGoOfflineNotice` dialog and store, the `steamGoOfflineRetry`/`steamGoOfflineCancel` channels and allow-list entries, the `steam-go-offline-retry` refresh origin, and the `steam.goOffline` i18n strings. `LogonWrap`, `NoWrap`, `RestoreOnlyWrap` and the owed-record restore are untouched.

## Commits

- af892de18 refactor: Rust refusal removed, `LogonWrap::before_logon` infallible (`LogonErr` collapsed to `CmError`)
- e0684e17e refactor: dialog, push, both channels, contract/i18n/meta bookkeeping
- fd31a35a8 refactor: lease reason, guidedAction plumbing, todo Decision recorded

## Verification

Pre-change census (re-measured, matched the plan): 4 failed, 80 passed. Post-change: same 4 failures; only the (c) Received moved, 291 -> 288 (delta 3: two invokes + one push); expectation lowered 297 -> 294. steamAuth invoke 24 -> 22 passes. `ipc_contract.rs` diff is exactly the two removed lines.

- cargo test -p gamelib-steamcm: 304 passed; clippy -D warnings clean (clean before and after); cargo fmt clean; cargo check -p gamelib-shell ok.
- pnpm codecheck, check:ipc-contract, boundaries: green. pnpm lint: 0 errors (957 pre-existing warnings).
- jest (steam storeManager, sidecar, frontend state/components, knip ratchet): only 6 failures, all pre-existing and unrelated to this change: the 4 census failures above plus 2 in shimGenerate (`steam_api.def`).
- steam-line-ceiling: only the pre-existing gameLaunch.ts 1131 > 1000 FAIL.
- Locales: 97 files, 0 added lines, 777 deletions.

## Pre-existing failures (verified identical at af892de18 in a scratch worktree, not fixed)

- `pnpm find-deadcode`: new knip finding `STEAMCM_CLI_TIMEOUT_MS` (meta/gamelibSteamcmCli.ts) and stale baseline line `@testing-library/react`.
- `gamelibCatalogParity` (47 locales: orphaned `steam.bridge.route.missingSymbols`) and `genI18nGateScope` A-17 (live-derivation drift); total 49 failed before and after.
- `pnpm lint-translations:gamelib`: thousands of missing-translation lines, none about goOffline.
- `pnpm planning-gates`: `state-sdk-field-anchor-gate.py` fails on STATE.md (11/12 pass).
- The shell crate emits one compiler warning (not touched here).

## Deviations from Plan

**1. [Rule 3 - Blocking] ipcDomainCensus (d) owner-less allowlist length 66 -> 65.** Removing the `steamGoOfflineRequired` row left the pinned length wrong; updated with a comment.
**2. [Rule 3 - Blocking] meta/__tests__/genI18nGateScope.test.ts** pinned scope/fork-touched counts (277/398) -> 275/396 for the two deleted paths, history note added. Not in the plan's file list.
**3. [Rule 1] user.ts:** removed the now-unused `AuthSessionRefusal` import (lint error); removed `platform`/`config` from `createMacSteamClient` deps and the steamProcesses destructure (became unused).
**4. Tests rewritten instead of deleted** where the point survived: games.test.ts bridge-download and prescreen refusal tests now use `logon-rejected` and assert `status: 'error'`; rustInstall/updateEstimate tests assert the lease opts are exactly `{ reason, appName }` for unattended and attended runs. Deleted: the games.test.ts CR-01 "lease carries install path" test and the go-offline-only library.refresh/user tests.
**5. Residue grep** is not literally empty: it still matches the history comments the plan itself mandates (census comments, `generatedBy` string, genI18nGateScope note).
**6. Todo** was already tracked under `.planning/todos/completed/` at execution time; the Decision section was appended there and committed.

## Known Stubs

None.

## Self-Check: PASSED

Commits af892de18, e0684e17e, fd31a35a8 exist; deleted files absent; todo has one `## Decision`. SUMMARY.md, STATE.md left uncommitted for the orchestrator.
