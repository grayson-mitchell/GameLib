---
phase: 86-pure-leaf-services
plan: 09
subsystem: backend-shims
tags: [recent-games, shim, rustinvoke, delete-gate, sidecar-seam, tray, d-05, d-06, d-08, d-13]

requires:
  - phase: 86-pure-leaf-services
    provides: "86-08's info_recent_add / info_recent_remove Rust ops and TrayRecentSink; 86-05's delete-gate and shim-schedule machinery; 86-04's recent goldens"
provides:
  - "src/backend/info/recentGames.ts: addRecentGame and removeRecentGame, each one typed requestRustInvoke call"
  - "recentGamesPortComplete delete gate and two infoShimSchedule rows (deletedBy 90 and 92)"
  - "the TS recent-games slice, its oracle and the sidecar.rs tray sniff deleted; TrayRecentSink is the tray's only feed"
  - "the Launcher service exposes requestRustInvoke, the seam later plans reuse to reach the boot transport from steamFlowRegistration without touching handlers.ts"
affects: [86-10, 86-11, 86-13, 90, 92]

actuals:
  tokens: 7000
  tasks: 2
  commits: 2

key-files:
  created:
    - src/backend/info/recentGames.ts
    - src/backend/info/__tests__/recentGames.test.ts
  modified:
    - src/backend/launcher.ts
    - src/backend/protocol.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/steamFlowRegistration.ts
    - src/backend/storeManagers/index.ts
    - src/backend/storeManagers/sideload/games.ts
    - src/backend/storeManagers/steam/launchDispatch.ts
    - src/backend/sidecar/__tests__/steamFlows.test.ts
    - src/backend/sidecar/__tests__/helpers/sidecarHarness.ts
    - src/backend/storeManagers/sideload/__tests__/uninstallSafety.test.ts
    - src/backend/__tests__/infoPortComplete.test.ts
    - src/backend/__tests__/infoShimSchedule.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src-tauri/src/sidecar.rs
    - src-tauri/src/tray/recent.rs
  deleted:
    - src/backend/recent_games/recent_games.ts
    - src/backend/info/__tests__/oracle/recentGames.oracle.test.ts

key-decisions:
  - "requestRustInvoke reaches steamFlowRegistration through the launcher service it already receives (Launcher.requestRustInvoke, a getter over LauncherDeps), because handlers.ts is foreign-dirty and must not change"
  - "protocol.ts gets requestRustInvoke from the boot host in bootstrap.ts protocolDepsOf (ProtocolDeps extends RustInvokeDeps), not from the launcher: bootstrap.ts is clean and the host is the transport's owner"
  - "the shims return Promise<unknown>, not Promise<void> as the plan wrote it: the typed client's result type is not void and the callers discard it, so no cast was needed"
  - "the sideload uninstall catches and logs a rejected removeRecentGame: the TS version could not reject, Rust's can, and the uninstall has already succeeded"

patterns-established:
  - "A flow registered from a foreign-dirty file reaches a new transport dep by widening a Pick on a service it already holds (the launcher) and exposing the member on that service, not by editing the file that builds the flow's deps"
  - "The sidecar test harness acknowledges Rust-owned bookkeeping channels (info_recent_add / info_recent_remove) so a flow that awaits the shim completes, while the frames stay in `frames` for a case to assert on"

requirements-completed: []

plan_head_before: 82348aee9b3838b7c801a86f023aab1c98caa9a7
plan_head_after: 6d066d0b3eefcd7670d83f603d5f1ac66ff94a83
commits: 2
status: complete
---

# Phase 86 Plan 09: Recent games shims and TS deletion Summary

**Recent games is Rust-owned end to end: the launch and uninstall paths reach it through two one-call scheduled shims, and the TS slice, its oracle and the sidecar tray sniff are gone.**

## Accomplishments

- `addRecentGame` and `removeRecentGame` (src/backend/info/recentGames.ts) keep the callers' call shapes and each return one typed `requestRustInvoke` call (`RUST_INFO_RECENT_ADD`, `RUST_INFO_RECENT_REMOVE`). launcher.ts, steam/launchDispatch.ts and sideload/games.ts import them.
- Deleted `src/backend/recent_games/recent_games.ts` and `recentGames.oracle.test.ts`; the golden/recent fixtures stay for the Rust golden (the gate asserts that).
- Deleted the `recentGamesChanged` sniff in sidecar.rs and the `RECENT_GAMES_CHANGED_CHANNEL` constant. The renderer relay of every other frame is untouched.
- `describe('recentGamesPortComplete')` in infoPortComplete.test.ts: the two files stay deleted, the golden dir stays, `RecentGamesDeps`/`getRecentGames`/`testingExportsRecentGames` are named nowhere in non-test backend code, `removeRecent` has no TS registration, no non-test backend file contains `games.recent`, and no `GAMELIB_RECENT_GAMES` flag text exists.
- infoShimSchedule.test.ts gained rows `addRecentGame` (RUST_INFO_RECENT_ADD, deletedBy 90) and `removeRecentGame` (RUST_INFO_RECENT_REMOVE, deletedBy 92).
- tauriShellSource.test.ts pins: sidecar.rs has no recent-games sniff or tray rebuild, tray/recent.rs has no sniffed-channel constant, and `TrayRecentSink` hops `update_tray_recent_games` onto the main thread.

## Task Commits

1. Task 1 (tracer): `ffaf5f890` feat(86-09): addRecentGame and removeRecentGame forward to Rust through one typed call
2. Task 2: `6d066d0b3` feat(86-09): delete the TS recent games slice and the sidecar tray sniff, gate it complete

Tracer gate: the Task 1 verify (recentGames test, codecheck, prettier) plus steamFlows, launchDispatch, protocol and both launcher tests passed end to end before Task 2 expanded. In steamFlows, Test D now boots the real sidecar and sees the `info_recent_add` frame with `{appName:'999003', title:'Test D Steam Game', runner:'steam'}` emitted by the production wiring.

## Seam choice (needed by 86-11 and 86-13)

The first attempt was blocked because `requestRustInvoke` had to reach three consumers, one of which (steamFlowRegistration.ts) is built in the foreign-dirty `sidecar/handlers.ts`. The seam used here, with handlers.ts untouched:

- `LauncherDeps extends RustInvokeDeps`; `createStoreManagers` forwards `deps.requestRustInvoke` into the launcher deps (storeManagers/index.ts).
- `Launcher` gained `readonly requestRustInvoke`, a getter in `createLauncher` that returns `deps.requestRustInvoke` (call-time, like the other members).
- `SteamFlowDeps.launcher` is now `Pick<BootServices['launcher'], 'launchEventCallback' | 'requestRustInvoke'>`; the two `dispatchSteamLaunch*` call sites in steamFlowRegistration.ts pass `requestRustInvoke: deps.launcher.requestRustInvoke`. handlers.ts already passes `launcher: deps.services.launcher`, so it needed no change.
- protocol.ts: `ProtocolDeps extends RustInvokeDeps`, filled in `protocolDepsOf` (bootstrap.ts) from `services.host.requestRustInvoke`.
- `LaunchDispatchDeps` (steam/launchDispatch.ts) requires `requestRustInvoke`.
- Test side: steamFlows.test.ts's `createLauncher` mock forwards `deps.requestRustInvoke`, and sidecarHarness.ts acknowledges `info_recent_add` / `info_recent_remove` frames.

The D-06 shim-shape check and the typed client are unchanged: the shim bodies are the single typed call, and `RustInvokeDeps` is the only dependency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Seam without handlers.ts (orchestrator-directed)**
- **Found during:** Task 1
- **Issue:** `requestRustInvoke` had no path to steamFlowRegistration.ts except through handlers.ts, which is foreign-dirty.
- **Fix:** exposed `requestRustInvoke` on the Launcher service and read it from `deps.launcher` (see Seam choice). Not a plan-listed file change: launcher.ts, bootstrap.ts, protocol.ts, steamFlowRegistration.ts and storeManagers/index.ts were widened beyond the plan's `files_modified`.
- **Commit:** ffaf5f890

**2. [Rule 1 - Bug] steamFlows.test.ts used the deleted TS store**
- **Found during:** Task 1
- **Issue:** Test D read the list through `getRecentGames`/`testingExportsRecentGames`, which Task 2 deletes, and the launcher mock had no `requestRustInvoke`.
- **Fix:** rewrote Test D to assert the `info_recent_add` rustInvoke frame, forwarded `requestRustInvoke` in the createLauncher mock, and made sidecarHarness.ts answer the two recent channels so a launch that awaits the shim completes.
- **Files modified:** src/backend/sidecar/__tests__/steamFlows.test.ts, src/backend/sidecar/__tests__/helpers/sidecarHarness.ts
- **Commit:** ffaf5f890

**3. [Rule 1 - Bug] Per-row `callers` cannot differ when two rows share one file**
- **Found during:** Task 2
- **Issue:** the plan listed callers per function (add: launcher.ts and launchDispatch.ts; remove: sideload/games.ts), but the schedule's importer check compares every importer of the FILE to each row, so the plan's lists failed it.
- **Fix:** both rows list all three importers; `deletedBy` stays per function (90 and 92). The detector was not loosened.
- **Commit:** 6d066d0b3

**4. [Rule 2 - Critical] Unhandled rejection from the sideload uninstall**
- **Found during:** Task 2 (full Backend jest run: uninstallSafety died on `fakeSafetyRustInvoke: unexpected channel info_recent_remove`)
- **Issue:** the old `removeRecentGame` was a local store write; the shim can reject (transport or store failure), and sideload/games.ts calls it unawaited, so a rejection became an unhandled rejection after a successful uninstall.
- **Fix:** `.catch` logs a warning and never fails the uninstall. uninstallSafety.test.ts now asserts the `info_recent_remove` call and, in the no-deleteFiles case, that it is the only Rust call.
- **Files modified:** src/backend/storeManagers/sideload/games.ts, src/backend/storeManagers/sideload/__tests__/uninstallSafety.test.ts
- **Commit:** 6d066d0b3

**5. [Rule 3 - Blocking] `pnpm find-deadcode` failed on `RUST_INFO_CHANNELS`**
- **Found during:** Task 2
- **Issue:** `RUST_INFO_CHANNELS` (added by 86-08 in sidecarTransport.ts) has no consumer, so knip reported a new finding; it appears to pre-date this plan (nothing in HEAD referenced it but its definition).
- **Fix:** recentGames.test.ts now asserts it lists exactly the two recent channels and that each is in `RUST_INVOKE_CHANNELS`. No baseline change: the ratchet passes at the unchanged 312 findings, so meta/knip-baseline.txt needed no edit.
- **Commit:** 6d066d0b3

**6. [Plan note] shim return type** is `Promise<unknown>` (the first attempt's file, reviewed and kept), not `Promise<void>`; the typed client returns an unknown-shaped result and every caller discards it.

**7. [Process] sideload/games.ts import switch landed in Task 1**, not Task 2, because it is part of the same rewiring and recent_games.ts still existed then. Task 2 added the catch.

Stale comment references to `recent_games` (enrichmentFlowRegistration.ts, enrichmentFlows.test.ts, common/types.ts, launchDispatch.test.ts) were updated; the `recentGamesChanged` push typing in appShell.ts stays, per the plan's decision.

## Known Stubs

None.

## Threat Flags

None. T-86-18 is mitigated: the D-06 shape check passes both shims and the schedule pins their deleting phases.

## Verification

- `pnpm codecheck`: pass. `pnpm find-deadcode`: pass (312 baselined). `pnpm boundaries`: pass.
- Prettier: pass on every changed file except meta/knip-baseline.txt (unchanged).
- jest, Backend project: 14159 passed. One run showed a single failing test in `outboundHttpRegistry.test.ts` under full-suite load; it passes alone (foreign flake, not touched here).
- `cargo test --bin gamelib-shell tray::` 31 passed; `sidecar` 37 passed; `rustfmt --check` on sidecar.rs and tray/recent.rs: clean. `cargo check` warns on `spawn_slice_worker` and `observe_live_url` (not from this plan).
- `pnpm backend-di-ceilings`: fails only on the two known foreign files (optInDlc.test.ts, libraryStoreFollowers.test.ts).
- handlers.ts, shellFilesFlowRegistration.ts, cache.ts, gog/**, controls.rs and the other foreign-dirty files were never staged.

## Self-Check: PASSED

- FOUND: src/backend/info/recentGames.ts, src/backend/info/__tests__/recentGames.test.ts
- MISSING (as intended): src/backend/recent_games/recent_games.ts, src/backend/info/__tests__/oracle/recentGames.oracle.test.ts
- FOUND commits: ffaf5f890, 6d066d0b3
