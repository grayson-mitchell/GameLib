# Phase 81 deferred items

Out-of-scope discoveries logged by plan executors. Not fixed in the plan that found them.

## Found in 81-01 (2026-11-18)

- `pnpm backend-di-ceilings` fails for `launchWithoutSteam.test.ts`, `NativePortInfo.test.tsx` and
  `LaunchWithoutSteam.test.tsx`. None touches steamPoll; pre-existing.
- `pnpm find-deadcode` reports `NativePortDataStyle` and `NativePortMac` in
  `nativePortCatalogue.ts`. Not steamPoll-related; pre-existing.
- `eslint import-x/no-duplicates` warnings in `src/backend/sidecar/steamPollEventRegistration.ts`
  (`installRoot` imported twice). Pre-existing, not introduced by 81-01.

## Found in 81-02 (2026-11-18)

- `src/backend/storeManagers/steam/localFiles/__tests__/acfUpdateReplay.test.ts` fails with
  `no oracle case acfUpdate/readLocalConfigBetaKey/playtime/10` (a missing oracle fixture case).
  Reproduced with 81-02's mockedFsSteamFiles edit reverted, so it is pre-existing and not steamPoll
  adoption work. The plan's jest verify path includes this directory; every other suite there passes.

## Found in 81-04 (2026-11-18)

- `cargo test -p gamelib-steampoll --test contracts` fails `ops_sorted_and_unique`: it pins
  `OPS.len() == 24` but the op table has 27 entries since 81-02 added `steampoll_adoption_watch`,
  `steampoll_adoption_unwatch` and `steampoll_adoption_read`. Not touched by 81-04; the plan's verify
  runs `--test adoption --test app_state --test update`, which pass.
- `RUSTDOCFLAGS="-D warnings" cargo doc -p gamelib-steampoll` fails on an unresolved
  `testing::RecordingHost` link in `lib.rs` line 2 (the `testing` module is cfg-gated). Pre-existing.

## Found in 81-06 (2026-11-18)

- `src/backend/__tests__/storeKinds.test.ts` ("the scanned name -> kind table equals EXPECTED_KINDS exactly")
  fails: the scan finds `steam_direct_launch_verdict` (kind `cache`) that `EXPECTED_KINDS` does not list.
  A store added outside this plan; 81-06 touches no store file.

## Found in 81-07 (2026-11-18)

- `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` render-site census expects 34 `is-text` sites and
  finds 37: `screens/Game/GamePage/components/NativePortInfo.tsx` carries 3 that the census does not list. The
  file is from the native-port work outside this phase; 81-07 touches no `is-text` markup.

## Orchestrator note (after 81-08): 1026 edge "Restart Steam now" is a no-op — IN SCOPE, unplanned

- Found by 81-08: at the GameLib 1026 waiting edge (`steam-waiting-for-restart`) the AdoptionNote shows "Restart Steam now" without the note, but there is no pending-adoption record, so `restartSteamNowForAdoption` answers `no-record` and the button does nothing visible.
- 81-10/81-14 keep the 1026 wait unchanged (RESEARCH Open Question 1) but no plan gives the action a target there.
- This is caused by this phase (D-02 action shown on the 1026 path), so it is NOT pre-existing. Route to the phase verifier as a gap; candidate fix: the 1026 path restarts Steam without requiring a record, or writes a record at the 1026 handoff.
